import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { PRODUCERS } from '../src/content/producers.ts';
import { STAGES } from '../src/content/stages.ts';
import { UPGRADES } from '../src/content/upgrades.ts';
import type { DrawBreakdown } from '../src/debug/index.ts';
import { argValue, startHarness } from './lib/harness.ts';
import { qa, totalAt } from './shot-presets.ts';

/**
 * Usage: node tools/budget.ts [--label=baseline] [--quality=ultra] [--scenes=0,1,2,3,4]
 *                             [--max-draws=150] [--max-triangles=10000000]
 *
 * Puts every scene in its worst case: every slot filled, every upgrade and flavor bought, a frenzy,
 * a hopper, a cannon shot and steady clicking, then measures draw calls and triangles frame by frame.
 * The breakout into the next scene is measured the same way, since two scenes are on show then.
 * Fails when a limit is given and exceeded.
 */
const label = argValue('label') ?? 'latest';
const quality = argValue('quality') ?? 'ultra';
const scenes = (argValue('scenes') ?? '0,1,2,3,4').split(',').map(Number);
const maxDraws = Number(argValue('max-draws') ?? Number.POSITIVE_INFINITY);
const maxTriangles = Number(argValue('max-triangles') ?? Number.POSITIVE_INFINITY);
const SIZE = { width: 1920, height: 1080 };
/** Owning this many of every machine shows its final look and fills every slot. */
const OWNED = 100;
const PROGRESS = [0.35, 0.97];

interface Measure {
  maxDraws: number;
  maxTriangles: number;
  breakdown: DrawBreakdown;
}

interface SceneReport {
  scene: number;
  cases: Record<string, Measure>;
  memory: { geometries: number; textures: number; programs: number; heapMb: number };
}

interface Setup {
  stage: number;
  total: number;
  owned: number;
  upgrades: string[];
  unlock: number[];
}

async function setUp(page: Page, setup: Setup): Promise<void> {
  await qa(
    page,
    (api, value: Setup) => {
      // Worst-case production would break out of the scene within a second, so progress is pinned.
      const sim = api.game.sim as unknown as { checkStage(): void; __checkStage?: () => void };
      sim.__checkStage ??= sim.checkStage;
      sim.checkStage = () => undefined;
      (window as unknown as { __hold?: number }).__hold = value.total;
      api.set({ stage: value.stage, totalEarned: value.total, popcorn: 1e30, flavors: 12 });
      api.advance(0.2);
      value.unlock.forEach((stage, unit) => {
        if (stage <= value.stage) api.buy(unit, value.owned);
      });
      const state = api.game.sim.state;
      state.upgrades = [...value.upgrades];
      api.game.sim.invalidate();
      api.game.world.current?.syncUpgrades(state.upgrades);
      api.set({ frenzy: 60 });
      for (let frame = 0; frame < 180; frame += 1) {
        state.totalEarned = value.total;
        state.popcorn = value.total;
        api.advance(1 / 60);
      }
    },
    setup,
  );
}

/** Steps frame by frame, clicking and firing the cannon, and keeps the breakdown of the busiest frame. */
async function measure(page: Page, seconds: number, cannon: boolean): Promise<Measure> {
  return qa(
    page,
    (api, value: { seconds: number; cannon: boolean; width: number; height: number }) => {
      const step = 1 / 60;
      let best: { maxDraws: number; maxTriangles: number; breakdown: ReturnType<typeof api.drawBreakdown> } | null = null;
      let maxTriangles = 0;
      api.showHopper();
      const hold = (window as unknown as { __hold?: number }).__hold;
      for (let frame = 0; frame < value.seconds / step; frame += 1) {
        if (hold !== undefined) {
          api.game.sim.state.totalEarned = hold;
          api.game.sim.state.popcorn = hold;
        }
        if (frame % 6 === 0) api.click(value.width * 0.4, value.height * 0.5);
        if (value.cannon && frame === 20) api.fireCannon(1);
        // A purchase brings the shovel, a new flavor its shaker, and a milestone its sparkles.
        if (frame === 10) api.buy(0, 1);
        if (frame === 14) api.game.world.current?.dropParcel();
        if (frame === 25) api.game.world.current?.flavor?.play(5);
        if (frame === 40) api.game.world.current?.celebrate(0);
        api.advance(step);
        const { drawCalls, triangles } = api.info();
        maxTriangles = Math.max(maxTriangles, triangles);
        if (!best || drawCalls > best.maxDraws) best = { maxDraws: drawCalls, maxTriangles: 0, breakdown: api.drawBreakdown() };
      }
      best!.maxTriangles = maxTriangles;
      return best!;
    },
    { seconds, cannon, width: SIZE.width, height: SIZE.height },
  );
}

async function measureBreakout(page: Page, threshold: number): Promise<Measure> {
  await qa(
    page,
    (api, value: number) => {
      const sim = api.game.sim as unknown as { checkStage(): void; __checkStage?: () => void };
      if (sim.__checkStage) sim.checkStage = sim.__checkStage;
      delete (window as unknown as { __hold?: number }).__hold;
      api.set({ totalEarned: value * 1.01 });
    },
    threshold,
  );
  return measure(page, 3.6, false);
}

function summarize(breakdown: DrawBreakdown): { passes: Record<string, number>; top: Array<[string, number]> } {
  const passes: Record<string, number> = {};
  const byPart: Record<string, number> = {};
  for (const [key, entry] of Object.entries(breakdown.parts)) {
    const [pass, part] = key.split(' | ') as [string, string];
    passes[pass] = (passes[pass] ?? 0) + entry.calls;
    byPart[part] = (byPart[part] ?? 0) + entry.calls;
  }
  const top = Object.entries(byPart).sort((a, b) => b[1] - a[1]);
  return { passes, top };
}

const reports: SceneReport[] = [];
const harness = await startHarness({ extraArgs: ['--enable-precise-memory-info'] });
try {
  for (const scene of scenes) {
    const page = await harness.open(`capture=1&quality=${quality}`, SIZE);
    const report: SceneReport = { scene, cases: {}, memory: { geometries: 0, textures: 0, programs: 0, heapMb: 0 } };
    for (const progress of PROGRESS) {
      await setUp(page, {
        stage: scene,
        total: totalAt(scene, progress),
        owned: OWNED,
        upgrades: UPGRADES.map((upgrade) => upgrade.id),
        unlock: PRODUCERS.map((producer) => producer.unlockStage),
      });
      report.cases[`p${progress}`] = await measure(page, 3, scene >= 1);
    }
    if (scene < STAGES.length - 1) report.cases.breakout = await measureBreakout(page, STAGES[scene]!.threshold);
    const memory = await qa(page, (api) => api.memory(), null);
    report.memory = { geometries: memory.geometries, textures: memory.textures, programs: memory.programs, heapMb: Math.round(memory.heapMb) };
    await page.close();
    reports.push(report);

    console.log(`\n=== scene ${scene} ===  geometries ${report.memory.geometries}  textures ${report.memory.textures}  programs ${report.memory.programs}  heap ${report.memory.heapMb} MB`);
    for (const [name, result] of Object.entries(report.cases)) {
      const { passes, top } = summarize(result.breakdown);
      const passText = Object.entries(passes).map(([pass, calls]) => `${pass} ${calls}`).join(', ');
      console.log(`${name.padEnd(9)} draws ${String(result.maxDraws).padStart(3)}  triangles ${(result.maxTriangles / 1e6).toFixed(2)}M  [${passText}]`);
      console.log(`          ${top.slice(0, 14).map(([part, calls]) => `${part} ${calls}`).join(' · ')}`);
    }
  }
} finally {
  await harness.close();
}

const outDir = 'artifacts/budget';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${label}.json`), JSON.stringify({ quality, reports }, null, 1));

let failed = false;
for (const report of reports) {
  for (const [name, result] of Object.entries(report.cases)) {
    if (result.maxDraws > maxDraws) {
      console.error(`scene ${report.scene} ${name}: ${result.maxDraws} draws, limit ${maxDraws}`);
      failed = true;
    }
    if (result.maxTriangles > maxTriangles) {
      console.error(`scene ${report.scene} ${name}: ${result.maxTriangles} triangles, limit ${maxTriangles}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`\nWritten to ${join(outDir, `${label}.json`)}`);

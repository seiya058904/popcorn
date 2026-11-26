import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAGES } from '../src/content/stages.ts';
import { PRODUCERS } from '../src/content/producers.ts';
import { UPGRADES } from '../src/content/upgrades.ts';
import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import { qa, totalAt } from './shot-presets.ts';

/**
 * Real-time stress run: a simulated player keeps playing while memory is sampled after forced GC.
 * Usage: node tools/soak.ts [--minutes=120] [--size=1920x1080] [--stage=4] [--hold] [--max-load]
 * Scene changes legitimately load new assets, so growth is judged inside each scene.
 * --stage starts in a later scene; --hold keeps the run there, however long it lasts.
 * --max-load holds a nearly full heap with every unlocked machine, all upgrades, and sustained play.
 * Set --cache-dir=path when running several independent Vite servers against the same checkout.
 */
const minutes = Number(argValue('minutes') ?? 120);
const [width, height] = (argValue('size') ?? '1920x1080').split('x').map(Number);
const startStage = Number(argValue('stage') ?? 0);
const maxLoad = hasFlag('max-load');
const hold = hasFlag('hold') || maxLoad;
const outDir = join('artifacts', 'soak');
const reportName = `${argValue('stage') ? `stage-${startStage}` : 'report'}${maxLoad ? '-max-load' : ''}.json`;
mkdirSync(outDir, { recursive: true });

interface Sample {
  minute: number;
  heapMb: number;
  geometries: number;
  textures: number;
  programs: number;
  stage: number;
  total: number;
  drawCalls: number;
  fps: number;
  p99Ms: number;
}

const harness = await startHarness({
  cacheDir: argValue('cache-dir'),
  extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const samples: Sample[] = [];
const errors: string[] = [];
let exitCode = 0;

const analyse = (): { stage: number; minutes: number; heapStart: number; heapEnd: number; growthPercent: number; geometriesGrew: number; texturesGrew: number }[] => {
  const result = [];
  for (const stage of new Set(samples.map((sample) => sample.stage))) {
    // Skip the first three minutes of a scene while it warms up.
    const inStage = samples.filter((sample) => sample.stage === stage).slice(3);
    if (inStage.length < 5) continue;
    const head = inStage.slice(0, 3);
    const tail = inStage.slice(-3);
    const mean = (list: Sample[]): number => list.reduce((sum, sample) => sum + sample.heapMb, 0) / list.length;
    const heapStart = mean(head);
    const heapEnd = mean(tail);
    result.push({
      stage,
      minutes: inStage.length,
      heapStart: Number(heapStart.toFixed(1)),
      heapEnd: Number(heapEnd.toFixed(1)),
      growthPercent: Number((((heapEnd - heapStart) / heapStart) * 100).toFixed(1)),
      geometriesGrew: tail.at(-1)!.geometries - head[0]!.geometries,
      texturesGrew: tail.at(-1)!.textures - head[0]!.textures,
    });
  }
  return result;
};

const write = (): void => {
  writeFileSync(join(outDir, reportName), JSON.stringify({ minutes, startStage, hold, maxLoad, size: `${width}x${height}`, perStage: analyse(), errors, samples }, null, 1));
};

try {
  const page = await harness.open('quality=ultra', { width: width!, height: height! });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  if (maxLoad) {
    await qa(page, (api, { stage, total, owned, upgrades, x, y }) => {
      const sim = api.game.sim as unknown as { checkStage(): void };
      sim.checkStage = () => { api.game.sim.state.totalEarned = total; };
      const world = api.game.world as unknown as { targetLevel(): number };
      world.targetLevel = () => 0.97;
      api.set({ stage, totalEarned: total, popcorn: total, owned, upgrades, flavors: 12, frenzy: 30 });
      if (stage === 0) {
        api.game.world.current?.syncUnits(owned, false);
        api.game.world.current?.syncUpgrades(upgrades);
      }
      setInterval(() => api.click(x, y), 100);
      setInterval(() => {
        api.set({ frenzy: 30 });
        if (stage > 0) api.fireCannon(1.05);
      }, 2000);
    }, {
      stage: startStage,
      total: totalAt(startStage, 0.97),
      owned: PRODUCERS.map((unit) => unit.unlockStage <= startStage ? 120 : 0),
      upgrades: UPGRADES.map((upgrade) => upgrade.id),
      x: width! * 0.4, y: height! * 0.5,
    });
    await page.mouse.click(width! * 0.4, height! * 0.5);
  } else await qa(
    page,
    (api, value: { stage: number; total: number; ceiling: number; hold: boolean }) => {
      if (value.stage > 0) api.set({ stage: value.stage, totalEarned: value.total, popcorn: value.total });
      if (value.hold) {
        api.game.onFrame(() => {
          // Spending money stays possible, but production must not outgrow the scene.
          const state = api.game.sim.state;
          state.totalEarned = Math.min(state.totalEarned, value.ceiling);
          state.popcorn = Math.min(state.popcorn, value.ceiling * 0.1);
        });
      }
      api.startBot(0);
      api.driveBot();
    },
    { stage: startStage, total: totalAt(startStage, 0.1), ceiling: STAGES[startStage]!.threshold * 0.6, hold },
  );
  const started = Date.now();
  for (let minute = 1; minute <= minutes; minute += 1) {
    await page.waitForTimeout(Math.max(0, started + minute * 60_000 - Date.now() - 2000));
    const sample = await page.evaluate(async () => {
      const api = (window as unknown as { __pop: import('../src/debug/index.ts').QaApi }).__pop;
      const intervals = await api.sampleFrames(1.5);
      (window as unknown as { gc?: () => void }).gc?.();
      const sorted = [...intervals].sort((a, b) => a - b);
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      return { ...api.memory(), fps: 1000 / mean, p99Ms: sorted[Math.floor((sorted.length - 1) * 0.99)]! };
    });
    samples.push({ minute, ...sample });
    write();
    if (minute % 10 === 0) console.log(`${minute} min: stage ${sample.stage}, heap ${sample.heapMb.toFixed(1)} MB, ${sample.fps.toFixed(0)} FPS`);
  }
  const perStage = analyse();
  console.log(JSON.stringify({ perStage, errors }, null, 1));
  const leaking = perStage.filter((item) => item.growthPercent > 15 || item.geometriesGrew > 8 || item.texturesGrew > 4);
  if (errors.length > 0 || leaking.length > 0) exitCode = 1;
} finally {
  write();
  await harness.close();
}
process.exit(exitCode);

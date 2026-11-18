import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argValue, startHarness } from './lib/harness.ts';
import { qa } from './shot-presets.ts';

/**
 * Plays the real game (rendering included) with a simulated player, on a stepped clock.
 * Usage: node tools/playthrough.ts [--minutes=15] [--profile=0] [--size=1280x720] [--quality=medium]
 * Stops early when the run ends. Screenshots are taken on the first frame of each scene and at intervals.
 */
const minutes = Number(argValue('minutes') ?? 15);
const profile = Number(argValue('profile') ?? 0);
const [width, height] = (argValue('size') ?? '1280x720').split('x').map(Number);
const quality = argValue('quality') ?? 'medium';
const everyMinutes = Number(argValue('every') ?? 10);
const outDir = join('artifacts', 'playthrough');
mkdirSync(outDir, { recursive: true });

const CHUNK_SECONDS = 20;
const errors: string[] = [];
const harness = await startHarness();
let exitCode = 0;
try {
  const page = await harness.open(`capture=1&quality=${quality}`, { width: width!, height: height! });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await qa(page, (api, index: number) => api.startBot(index), profile);

  let simulated = 0;
  let lastStage = 0;
  let nextShot = 0;
  let maxDraws = 0;
  let maxTriangles = 0;
  const stageTimes: Array<{ stage: number; minutes: number; draws: number }> = [];
  const started = Date.now();
  const shoot = async (name: string): Promise<void> => {
    writeFileSync(join(outDir, `${name}.png`), await page.screenshot({ type: 'png' }));
  };

  while (simulated < minutes * 60) {
    const status = await qa(page, (api, seconds: number) => api.runBot(seconds), CHUNK_SECONDS);
    simulated += CHUNK_SECONDS;
    maxDraws = Math.max(maxDraws, status.maxDrawCalls);
    maxTriangles = Math.max(maxTriangles, status.maxTriangles);
    if (status.stage !== lastStage) {
      lastStage = status.stage;
      stageTimes.push({ stage: status.stage, minutes: Number((simulated / 60).toFixed(1)), draws: status.maxDrawCalls });
      console.log(`stage ${status.stage} reached at ${(simulated / 60).toFixed(1)} min`);
      await qa(page, (api, s: number) => api.runBot(s), 4);
      await shoot(`stage-${status.stage}`);
    }
    if (simulated / 60 >= nextShot) {
      await shoot(`t${String(Math.round(simulated / 60)).padStart(3, '0')}`);
      nextShot += everyMinutes;
    }
    if (status.ended) {
      console.log(`run finished at ${(simulated / 60).toFixed(1)} min`);
      break;
    }
  }
  const final = await qa(page, (api) => api.runBot(0), null);
  const report = {
    simulatedMinutes: Number((simulated / 60).toFixed(1)),
    realSeconds: Math.round((Date.now() - started) / 1000),
    stageTimes,
    maxDrawCalls: maxDraws,
    maxTriangles,
    final,
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  if (errors.length > 0 || maxDraws > 150) exitCode = 1;
} finally {
  await harness.close();
}
process.exit(exitCode);

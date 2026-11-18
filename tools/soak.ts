import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argValue, startHarness } from './lib/harness.ts';
import { qa } from './shot-presets.ts';

/**
 * Real-time stress run: a simulated player keeps playing while memory is sampled after forced GC.
 * Usage: node tools/soak.ts [--minutes=120] [--size=1920x1080] [--start=0]
 * Scene changes legitimately load new assets, so growth is judged inside each scene.
 */
const minutes = Number(argValue('minutes') ?? 120);
const [width, height] = (argValue('size') ?? '1920x1080').split('x').map(Number);
const outDir = join('artifacts', 'soak');
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

const harness = await startHarness({ extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
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
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ minutes, size: `${width}x${height}`, perStage: analyse(), errors, samples }, null, 1));
};

try {
  const page = await harness.open('quality=ultra', { width: width!, height: height! });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await qa(
    page,
    (api) => {
      api.startBot(0);
      api.driveBot();
    },
    null,
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

import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--clicks=10] [--stage=1]
 *                           [--total=46000] [--units=8,6,4] [--query=quality=low] [--breakout]
 * --breakout pushes production over the next threshold, so the show itself is what gets measured.
 * Every frame waits for the GPU, so the interval is the true cost and shows headroom above 60 FPS.
 */
const [width, height] = (argValue('size') ?? '3840x2160').split('x').map(Number);
const seconds = Number(argValue('seconds') ?? 8);
const query = argValue('query') ?? '';
const clicks = Number(argValue('clicks') ?? 0);
const stage = Number(argValue('stage') ?? 0);
const total = Number(argValue('total') ?? 0);
const units = (argValue('units') ?? '').split(',').filter(Boolean).map(Number);
const breakout = hasFlag('breakout');

const harness = await startHarness({ uncapped: true });
try {
  const page = await harness.open(query, { width: width!, height: height! });
  const result = await page.evaluate(
    async ({ duration, clicksPerSecond, stageIndex, earned, counts, w, h, breakNow }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      qa.setGpuSync(true);
      qa.set({ stage: stageIndex, totalEarned: earned, popcorn: 1e15 });
      counts.forEach((count, unit) => qa.buy(unit, count));
      qa.set({ popcorn: earned });
      await qa.sampleFrames(3);
      if (breakNow) qa.earn(earned * 0.1);
      const timer = clicksPerSecond > 0 ? setInterval(() => qa.click(w * 0.4, h * 0.5), 1000 / clicksPerSecond) : 0;
      const cpu: number[] = [];
      qa.game.onFrame(() => cpu.push(qa.game.lastFrameCpuMs));
      const intervals = await qa.sampleFrames(duration);
      clearInterval(timer);
      return { intervals, cpu, info: qa.info() };
    },
    { duration: seconds, clicksPerSecond: clicks, stageIndex: stage, earned: total, counts: units, w: width!, h: height!, breakNow: breakout },
  );
  const stats = (values: number[]): { mean: number; p99: number; max: number } => {
    const sorted = [...values].sort((a, b) => a - b);
    const round = (x: number): number => Number(x.toFixed(2));
    return {
      mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      p99: round(sorted[Math.floor((sorted.length - 1) * 0.99)]!),
      max: round(sorted[sorted.length - 1]!),
    };
  };
  const frame = stats(result.intervals);
  console.log(
    JSON.stringify({
      size: `${width}x${height}`,
      frames: result.intervals.length,
      fpsMean: Number((1000 / frame.mean).toFixed(1)),
      frameMs: frame,
      cpuMs: stats(result.cpu),
      drawCalls: result.info.drawCalls,
      triangles: result.info.triangles,
    }),
  );
} finally {
  await harness.close();
}

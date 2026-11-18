import { argValue, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--clicks=10] [--earn=900] [--pans=8] [--query=quality=low]
 * Every frame waits for the GPU, so the interval is the true cost and shows headroom above 60 FPS.
 */
const [width, height] = (argValue('size') ?? '3840x2160').split('x').map(Number);
const seconds = Number(argValue('seconds') ?? 8);
const query = argValue('query') ?? '';
const clicks = Number(argValue('clicks') ?? 0);
const earn = Number(argValue('earn') ?? 0);
const pans = Number(argValue('pans') ?? 0);

const harness = await startHarness({ uncapped: true });
try {
  const page = await harness.open(query, { width: width!, height: height! });
  const result = await page.evaluate(
    async ({ duration, clicksPerSecond, amount, panCount, w, h }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      qa.setGpuSync(true);
      qa.earn(amount + panCount * 400);
      qa.buy(0, panCount);
      await qa.sampleFrames(2);
      const timer = clicksPerSecond > 0 ? setInterval(() => qa.click(w * 0.42, h * 0.5), 1000 / clicksPerSecond) : 0;
      const cpu: number[] = [];
      qa.game.onFrame(() => cpu.push(qa.game.lastFrameCpuMs));
      const intervals = await qa.sampleFrames(duration);
      clearInterval(timer);
      return { intervals, cpu, info: qa.info() };
    },
    { duration: seconds, clicksPerSecond: clicks, amount: earn, panCount: pans, w: width!, h: height! },
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
    JSON.stringify(
      {
        size: `${width}x${height}`,
        frames: result.intervals.length,
        fpsMean: Number((1000 / frame.mean).toFixed(1)),
        frameMs: frame,
        cpuMs: stats(result.cpu),
        ...result.info,
      },
      null,
      2,
    ),
  );
} finally {
  await harness.close();
}

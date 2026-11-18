import { argValue, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--query=a=1]
 * Measures uncapped frame intervals on the real GPU, so the numbers show headroom above 60 FPS.
 */
const [width, height] = (argValue('size') ?? '3840x2160').split('x').map(Number);
const seconds = Number(argValue('seconds') ?? 8);
const query = argValue('query') ?? '';

const harness = await startHarness({ uncapped: true });
try {
  const page = await harness.open(query, { width: width!, height: height! });
  const result = await page.evaluate(async (duration) => {
    const qa = (window as unknown as { __pop: QaApi }).__pop;
    qa.setGpuSync(true);
    await qa.sampleFrames(1);
    const intervals = await qa.sampleFrames(duration);
    return { intervals, info: qa.info() };
  }, seconds);
  const sorted = [...result.intervals].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const percentile = (p: number): number => sorted[Math.floor((sorted.length - 1) * p)]!;
  console.log(
    JSON.stringify(
      {
        size: `${width}x${height}`,
        frames: sorted.length,
        fpsMean: Number((1000 / mean).toFixed(1)),
        msMean: Number(mean.toFixed(2)),
        msP99: Number(percentile(0.99).toFixed(2)),
        msMax: Number(percentile(1).toFixed(2)),
        ...result.info,
      },
      null,
      2,
    ),
  );
} finally {
  await harness.close();
}

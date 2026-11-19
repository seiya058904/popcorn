import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--clicks=10] [--stage=1]
 *                           [--total=46000] [--units=8,6,4] [--query=quality=low] [--breakout]
 *                           [--gc] [--attribute] [--css='.glass { backdrop-filter: none }']
 * --breakout pushes production over the next threshold, so the show itself is what gets measured.
 * --gc traces garbage collection and reports every pause and the allocation rate.
 * --attribute times the expensive steps of the game and says which ones fell inside the longest frames.
 * Every frame waits for the GPU, so the interval is the true cost and shows headroom above 60 FPS.
 */
const [width, height] = (argValue('size') ?? '3840x2160').split('x').map(Number);
const seconds = Number(argValue('seconds') ?? 8);
const query = argValue('query') ?? '';
/** Extra CSS for the measured page, to find out what an interface style costs. */
const css = argValue('css');
const clicks = Number(argValue('clicks') ?? 0);
const stage = Number(argValue('stage') ?? 0);
const total = Number(argValue('total') ?? 0);
const units = (argValue('units') ?? '').split(',').filter(Boolean).map(Number);
const breakout = hasFlag('breakout');
const traceGc = hasFlag('gc');
const attribute = hasFlag('attribute');

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  args?: { data?: { jsHeapSizeUsed?: number } };
}

const harness = await startHarness({ uncapped: true, extraArgs: ['--enable-precise-memory-info'] });
try {
  const page = await harness.open(query, { width: width!, height: height! });
  if (css) await page.addStyleTag({ content: css });
  await page.evaluate(
    ({ stageIndex, earned, counts, wantMarks }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      qa.setGpuSync(true);
      qa.set({ stage: stageIndex, totalEarned: earned, popcorn: 1e15 });
      counts.forEach((count, unit) => qa.buy(unit, count));
      qa.set({ popcorn: earned });
      if (!wantMarks) return;
      // Steps worth knowing about when a frame runs long. Only calls over a millisecond are kept.
      const marks: Array<[string, number, number]> = [];
      (window as unknown as { __marks: typeof marks }).__marks = marks;
      const wrap = (owner: object, name: string, tag: string): void => {
        const target = owner as Record<string, (...args: unknown[]) => unknown>;
        const original = target[name]!;
        target[name] = function (this: unknown, ...args: unknown[]) {
          const start = performance.now();
          try {
            return original.apply(this, args);
          } finally {
            const end = performance.now();
            if (end - start > 1) marks.push([tag, start, end]);
          }
        };
      };
      const world = qa.game.world as unknown as object;
      for (const name of ['prepareNext', 'startBlast', 'finishTransition', 'arrive', 'showScene', 'runtime', 'updateFraming', 'update']) wrap(world, name, `world.${name}`);
      for (const name of ['preload', 'render']) wrap(qa.game.stage, name, `stage.${name}`);
      wrap(qa.game.stage.shadow, 'render', 'shadow.render');
      wrap(qa.game.stage.post, 'finish', 'post.finish');
      wrap(qa.game.hud, 'update', 'hud.update');
      wrap(qa.game.audio, 'update', 'audio.update');
    },
    { stageIndex: stage, earned: total, counts: units, wantMarks: attribute },
  );
  await page.evaluate(() => (window as unknown as { __pop: QaApi }).__pop.sampleFrames(3));
  if (traceGc) await harness.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] });
  const result = await page.evaluate(
    async ({ duration, clicksPerSecond, earned, w, h, breakNow }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      if (breakNow) qa.earn(earned * 0.1);
      const timer = clicksPerSecond > 0 ? setInterval(() => qa.click(w * 0.4, h * 0.5), 1000 / clicksPerSecond) : 0;
      const cpu: number[] = [];
      const starts: number[] = [];
      qa.game.onFrame(() => {
        cpu.push(qa.game.lastFrameCpuMs);
        starts.push(performance.now());
      });
      const intervals = await qa.sampleFrames(duration);
      clearInterval(timer);
      const marks = (window as unknown as { __marks?: Array<[string, number, number]> }).__marks ?? [];
      return { intervals, cpu, starts, marks, info: qa.info() };
    },
    { duration: seconds, clicksPerSecond: clicks, earned: total, w: width!, h: height!, breakNow: breakout },
  );
  let gc: { pauses: number; totalMs: number; maxMs: number; over5ms: number; allocatedMbPerSecond: number } | undefined;
  if (traceGc) {
    const trace = JSON.parse((await harness.browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] };
    const pauses = trace.traceEvents.filter((event) => (event.name === 'MinorGC' || event.name === 'MajorGC') && event.ph === 'X').map((event) => (event.dur ?? 0) / 1000);
    // The heap only grows between collections, so the sum of its rises is what was allocated.
    const heap = trace.traceEvents
      .filter((event) => event.name === 'UpdateCounters' && event.args?.data?.jsHeapSizeUsed !== undefined)
      .sort((a, b) => a.ts - b.ts);
    let allocated = 0;
    for (let i = 1; i < heap.length; i += 1) allocated += Math.max(0, heap[i]!.args!.data!.jsHeapSizeUsed! - heap[i - 1]!.args!.data!.jsHeapSizeUsed!);
    const span = heap.length > 1 ? (heap[heap.length - 1]!.ts - heap[0]!.ts) / 1e6 : 1;
    gc = {
      pauses: pauses.length,
      totalMs: Number(pauses.reduce((sum, value) => sum + value, 0).toFixed(1)),
      maxMs: Number(Math.max(0, ...pauses).toFixed(2)),
      over5ms: pauses.filter((value) => value > 5).length,
      allocatedMbPerSecond: Number((allocated / 1048576 / span).toFixed(2)),
    };
  }
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
      ...(gc ? { gc } : {}),
    }),
  );
  if (attribute) {
    // Frame k ran from the end of frame k-1 to the end of frame k.
    const frames = result.starts.slice(1).map((end, index) => ({ from: result.starts[index]!, to: end }));
    frames.sort((a, b) => b.to - b.from - (a.to - a.from));
    for (const span of frames.slice(0, 6)) {
      const inside = result.marks
        .filter(([, start, end]) => end > span.from && start < span.to)
        .map(([tag, start, end]) => `${tag} ${(end - start).toFixed(1)}`)
        .join(', ');
      console.log(`frame ${(span.to - span.from).toFixed(1)} ms: ${inside || '(nothing timed: GPU or browser)'}`);
    }
  }
} finally {
  await harness.close();
}

import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--clicks=10] [--stage=1]
 *                           [--total=46000] [--units=8,6,4] [--query=quality=low] [--breakout]
 *                           [--gc] [--attribute] [--paints] [--trace] [--capped] [--cpu-throttle=4] [--from-title]
 *                           [--css='.glass { backdrop-filter: none }']
 *                           [--eval='api.game.stage.shadow.setSize(3072, false)']
 * --breakout pushes production over the next threshold, so the show itself is what gets measured.
 * --gc traces garbage collection and reports every pause and the allocation rate.
 * --attribute times the expensive steps of the game and says which ones fell inside the longest frames.
 * --paints lists the page elements the browser repainted most, with their paint time: interface
 * layers that repaint every frame cost raster time on top of the 3D picture.
 * --eval runs a snippet with the QA api as "api" once the scene is set up, to price one feature by switching it off.
 * Every frame waits for the GPU, so the interval is the true cost and shows headroom above 60 FPS.
 * --trace lists the main thread's long tasks (over 30 ms) and what took the time inside them,
 * including style, layout and other browser work that --attribute cannot time from script.
 * --from-title starts the way a player does, from the title screen and its start button, so
 * whatever the browser prepares on the way in is prepared here too.
 * --cpu-throttle slows the page's main thread down N times, standing in for a weak laptop CPU.
 * --capped instead runs at the display rate without waiting for the GPU, as a player sees it:
 * then frames over 16.7 ms are frames the player actually missed.
 */
const [width, height] = (argValue('size') ?? '3840x2160').split('x').map(Number);
const seconds = Number(argValue('seconds') ?? 8);
const query = argValue('query') ?? '';
/** Extra CSS for the measured page, to find out what an interface style costs. */
const css = argValue('css');
const snippet = argValue('eval');
const clicks = Number(argValue('clicks') ?? 0);
const stage = Number(argValue('stage') ?? 0);
const total = Number(argValue('total') ?? 0);
const units = (argValue('units') ?? '').split(',').filter(Boolean).map(Number);
const breakout = hasFlag('breakout');
const traceGc = hasFlag('gc');
const attribute = hasFlag('attribute');
const tracePaints = hasFlag('paints');
const capped = hasFlag('capped');
const traceTasks = hasFlag('trace');
const cpuThrottle = Number(argValue('cpu-throttle') ?? 1);
const fromTitle = hasFlag('from-title');

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  tid?: number;
  args?: { data?: { jsHeapSizeUsed?: number; nodeId?: number; clip?: number[] } };
}

const harness = await startHarness({ uncapped: !capped, extraArgs: ['--enable-precise-memory-info'] });
try {
  const page = await harness.open(fromTitle ? `title&${query}` : query, { width: width!, height: height! });
  if (fromTitle) {
    await page.waitForFunction(() => !document.querySelector('#boot') && document.querySelector('.title-start'));
    await page.waitForTimeout(1500);
    const start = (await page.locator('.title-start').boundingBox())!;
    await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
    await page.waitForFunction(() => !document.querySelector('.title'));
    await page.waitForTimeout(1500);
  }
  if (css) await page.addStyleTag({ content: css });
  if (cpuThrottle > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await page.evaluate(
    ({ stageIndex, earned, counts, wantMarks, sync }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      qa.setGpuSync(sync);
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
    { stageIndex: stage, earned: total, counts: units, wantMarks: attribute, sync: !capped },
  );
  if (snippet) await page.evaluate((source) => new Function('api', source)((window as unknown as { __pop: QaApi }).__pop), snippet);
  await page.evaluate(() => (window as unknown as { __pop: QaApi }).__pop.sampleFrames(3));
  // A player spends minutes in a scene, so the next one is always ready when it breaks open.
  if (breakout) await page.waitForFunction(() => !(window as unknown as { __pop: QaApi }).__pop.game.world.preparing, undefined, { timeout: 120_000 });
  const gpuCategories = traceTasks ? ['gpu', 'disabled-by-default-gpu.service', 'gpu.angle', 'gpu.decoder', 'skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu', 'disabled-by-default-skia.shaders'] : [];
  if (traceGc || tracePaints || traceTasks) await harness.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'disabled-by-default-v8.gc', ...gpuCategories] });
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
  const trace = traceGc || tracePaints || traceTasks ? (JSON.parse((await harness.browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] }) : undefined;
  if (trace && traceGc) {
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
      // Uncapped: frames over a 60 FPS budget. Capped: frames that missed a refresh and showed late.
      ...(capped
        ? { missed: result.intervals.filter((value) => value > 25).length }
        : { over16ms: result.intervals.filter((value) => value > 16.7).length, over33ms: result.intervals.filter((value) => value > 33.4).length }),
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
  if (trace && tracePaints) {
    const byNode = new Map<number, { count: number; ms: number }>();
    for (const event of trace.traceEvents) {
      if (event.name !== 'Paint' || event.ph !== 'X') continue;
      const id = event.args?.data?.nodeId ?? 0;
      const entry = byNode.get(id) ?? { count: 0, ms: 0 };
      entry.count += 1;
      entry.ms += (event.dur ?? 0) / 1000;
      byNode.set(id, entry);
    }
    const top = [...byNode.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.getDocument', { depth: 0 });
    const ids = top.map(([id]) => id).filter((id) => id > 0);
    const { nodeIds } = ids.length ? await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: ids }) : { nodeIds: [] as number[] };
    const names = new Map<number, string>();
    for (let i = 0; i < ids.length; i += 1) {
      if (!nodeIds[i]) continue;
      const { node } = await cdp.send('DOM.describeNode', { nodeId: nodeIds[i]! });
      const attributes = node.attributes ?? [];
      const cls = attributes[attributes.indexOf('class') + 1];
      names.set(ids[i]!, `${node.localName}${attributes.includes('class') && cls ? `.${cls.split(' ').join('.')}` : ''}`);
    }
    for (const [id, entry] of top) {
      console.log(`paint ${entry.ms.toFixed(1)} ms in ${entry.count} paints: ${names.get(id) || (id ? `node ${id}` : '(document)')}`);
    }
    // Where on screen the repaints were, as x,y w×h: the regions that keep changing.
    const regions = new Map<string, { count: number; ms: number }>();
    for (const event of trace.traceEvents) {
      const clip = event.args?.data?.clip;
      if (event.name !== 'Paint' || event.ph !== 'X' || !clip || clip.length < 8) continue;
      const xs = [clip[0]!, clip[2]!, clip[4]!, clip[6]!];
      const ys = [clip[1]!, clip[3]!, clip[5]!, clip[7]!];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const key = `${Math.round(x)},${Math.round(y)} ${Math.round(Math.max(...xs) - x)}×${Math.round(Math.max(...ys) - y)}`;
      const entry = regions.get(key) ?? { count: 0, ms: 0 };
      entry.count += 1;
      entry.ms += (event.dur ?? 0) / 1000;
      regions.set(key, entry);
    }
    for (const [key, entry] of [...regions.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8)) {
      console.log(`region ${key}: ${entry.count} paints, ${entry.ms.toFixed(1)} ms`);
    }
  }
  if (trace && traceTasks) {
    const all = trace.traceEvents.filter((event) => event.ph === 'X' && event.dur !== undefined);
    const tasks = all.filter((event) => (event.name === 'RunTask' || event.name === 'GPUTask') && event.dur! > 30_000).sort((a, b) => b.dur! - a.dur!).slice(0, 6);
    for (const task of tasks) {
      const inside = all.filter((event) => event.tid === task.tid && event !== task && event.ts >= task.ts && event.ts + event.dur! <= task.ts + task.dur! && event.dur! > 500);
      const byName = new Map<string, number>();
      for (const event of inside) byName.set(event.name, Math.max(byName.get(event.name) ?? 0, event.dur! / 1000));
      const parts = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([name, ms]) => `${name.slice(0, 90)} ${ms.toFixed(1)}`);
      console.log(`${task.name} ${(task.dur! / 1000).toFixed(1)} ms: ${parts.join(', ')}`);
    }
    // What the same thread was busy with just before the longest task: work that collides with it.
    const longest = tasks.find((task) => task.name === 'GPUTask');
    if (longest) {
      const before = all
        .filter((event) => event.tid === longest.tid && event.name === 'GPUTask' && event.ts < longest.ts && event.ts > longest.ts - 300_000 && event.dur! > 1000)
        .sort((a, b) => b.dur! - a.dur!)
        .slice(0, 8);
      for (const event of before) {
        const inner = all
          .filter((other) => other.tid === event.tid && other !== event && other.ts >= event.ts && other.ts + other.dur! <= event.ts + event.dur! && other.dur! > 500)
          .sort((a, b) => b.dur! - a.dur!)
          .slice(0, 6)
          .map((other) => `${other.name.slice(0, 60)} ${(other.dur! / 1000).toFixed(1)}`);
        console.log(`  before -${((longest.ts - event.ts) / 1000).toFixed(0)} ms: GPUTask ${(event.dur! / 1000).toFixed(1)} ms: ${inner.join(', ')}`);
      }
    }
  }
} finally {
  await harness.close();
}

import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import type { QaApi } from '../src/debug/index.ts';
import { PRODUCERS } from '../src/content/producers.ts';
import { STAGES } from '../src/content/stages.ts';
import { UPGRADES } from '../src/content/upgrades.ts';
import { totalAt } from './shot-presets.ts';

/**
 * Usage: node tools/perf.ts [--size=3840x2160] [--seconds=8] [--clicks=10] [--stage=1]
 *                           [--total=46000] [--units=8,6,4] [--query=quality=low] [--breakout]
 *                           [--gc] [--attribute] [--paints] [--trace] [--capped] [--cpu-throttle=4] [--from-title] [--settled] [--stress]
 *                           [--css='.glass { backdrop-filter: none }']
 *                           [--eval='api.game.stage.shadow.setSize(3072, false)']
 * --breakout pushes production over the next threshold, so the show itself is what gets measured.
 * --stress is the late game at full tilt, on top of the clicks: the mouse held down for rapid pops, frenzy kept
 * up and the cannon fired every two seconds. It also reports the most popcorn drawn in flight and sound voices at once.
 * --max-load fills every unlocked machine slot and buys all upgrades and flavors, pinning earned
 * progress at 97% until --breakout releases it. --full-heap also holds the displayed fill against
 * temporary income in flight. --gpu queries GPU time asynchronously where supported.
 * --gpu-pass=shadow|scene|post times one pass. Use it with --settled to exclude preload work.
 * --cold-breakout triggers the show as soon as setup finishes, while preloading may still be active.
 * --software uses SwiftShader as a software stress case. It does not emulate a particular GPU.
 * --profile=path.cpuprofile captures the main thread for separate diagnosis.
 * --settled waits until the next scene has been built in the background before measuring, so the frames are those of a
 * player who has been in the scene a while; without it the first seconds include that build.
 * --gc traces the game renderer's main-thread GC pauses and a lower bound on its allocation rate.
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
const maxLoad = hasFlag('max-load');
const fullHeap = hasFlag('full-heap');
const total = Number(argValue('total') ?? (maxLoad ? totalAt(stage, 0.97) : 0));
const units = (argValue('units') ?? '').split(',').filter(Boolean).map(Number);
const coldBreakout = hasFlag('cold-breakout');
const breakout = coldBreakout || hasFlag('breakout');
const traceGc = hasFlag('gc');
const attribute = hasFlag('attribute');
const tracePaints = hasFlag('paints');
const capped = hasFlag('capped');
const traceTasks = hasFlag('trace');
const cpuThrottle = Number(argValue('cpu-throttle') ?? 1);
const fromTitle = hasFlag('from-title');
const settled = hasFlag('settled');
const stress = hasFlag('stress');
const gpuPass = argValue('gpu-pass') ?? 'frame';
if (!['frame', 'shadow', 'scene', 'post'].includes(gpuPass)) throw new Error(`Unknown GPU pass: ${gpuPass}`);
const gpuTimer = hasFlag('gpu') || gpuPass !== 'frame';
const profilePath = argValue('profile');
const software = hasFlag('software');

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: { data?: { jsHeapSizeUsed?: number; nodeId?: number; clip?: number[] } };
}

const harness = await startHarness({
  uncapped: !capped,
  extraArgs: ['--enable-precise-memory-info', ...(software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])],
});
try {
  const page = await harness.open(fromTitle ? `title&${query}` : query, { width: width!, height: height! });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  if (fromTitle) {
    await page.waitForFunction(() => !document.querySelector('#boot') && document.querySelector('.title-start'));
    await page.waitForTimeout(1500);
    const start = (await page.locator('.title-start').boundingBox())!;
    await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
    await page.waitForFunction(() => !document.querySelector('.title'));
    await page.waitForTimeout(1500);
  }
  if (css) await page.addStyleTag({ content: css });
  const cdp = await page.context().newCDPSession(page);
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await page.evaluate(
    ({ stageIndex, earned, counts, upgrades, pin, fixedLevel, wantMarks, sync }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      qa.setGpuSync(sync);
      const sim = qa.game.sim as unknown as { checkStage(): void; perfRestore?: () => void };
      if (pin) {
        sim.perfRestore = sim.checkStage;
        sim.checkStage = () => { qa.game.sim.state.totalEarned = earned; };
      }
      qa.set({ stage: stageIndex, totalEarned: earned, popcorn: pin ? 1e30 : 1e15 });
      counts.forEach((count, unit) => qa.buy(unit, count));
      qa.set({ popcorn: earned, ...(pin ? { upgrades, flavors: 12 } : {}) });
      if (fixedLevel !== null) {
        const world = qa.game.world as unknown as { targetLevel(): number };
        world.targetLevel = () => fixedLevel;
        if (qa.game.world.current?.spec.id === stageIndex) qa.game.world.current.syncUpgrades(upgrades);
      }
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
    {
      stageIndex: stage, earned: total,
      counts: maxLoad ? PRODUCERS.map((unit) => unit.unlockStage <= stage ? 120 : 0) : units,
      upgrades: UPGRADES.map((upgrade) => upgrade.id),
      pin: maxLoad, fixedLevel: fullHeap && !breakout ? 0.97 : null, wantMarks: attribute, sync: !capped && !gpuTimer,
    },
  );
  if (coldBreakout) {
    await page.waitForFunction((id) => (window as unknown as { __pop: QaApi }).__pop.game.world.current?.spec.id === id, stage);
  }
  if (snippet) await page.evaluate((source) => new Function('api', source)((window as unknown as { __pop: QaApi }).__pop), snippet);
  if (!coldBreakout) await page.evaluate(() => (window as unknown as { __pop: QaApi }).__pop.sampleFrames(3));
  // A player spends minutes in a scene, so the next one is always ready when it breaks open.
  if (!coldBreakout && (breakout || settled || stress)) {
    await page.waitForFunction(() => {
      const world = (window as unknown as { __pop: QaApi }).__pop.game.world as unknown as { preparing: boolean; bootProbe: unknown };
      return !world.preparing && !world.bootProbe;
    }, undefined, { timeout: 300_000 });
  }
  const gpuCategories = traceTasks ? ['gpu', 'disabled-by-default-gpu.service', 'gpu.angle', 'gpu.decoder', 'skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu', 'disabled-by-default-skia.shaders'] : [];
  if (traceGc || tracePaints || traceTasks) await harness.browser.startTracing(page, { categories: ['blink.user_timing', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'disabled-by-default-v8.gc', ...gpuCategories] });
  // Held down where the clicks land, so the hold keeps popping kernels between them.
  if (stress) {
    await page.mouse.move(width! * 0.4, height! * 0.5);
    await page.mouse.down();
  }
  if (profilePath) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  const result = await page.evaluate(
    async ({ duration, clicksPerSecond, earned, startStage, threshold, nextThreshold, w, h, breakNow, full, timeGpu, pass }) => {
      const qa = (window as unknown as { __pop: QaApi }).__pop;
      performance.mark('perf:sample-start');
      if (breakNow) {
        const sim = qa.game.sim as unknown as { checkStage(): void; perfRestore?: () => void };
        if (sim.perfRestore) {
          const check = sim.perfRestore;
          // Maxed test economies can leap through multiple scenes in one tick. Keep the
          // requested breakout intact and leave its destination on screen for the sample.
          sim.checkStage = () => {
            const state = qa.game.sim.state;
            state.totalEarned = Math.min(state.totalEarned, state.stage === startStage ? threshold * 1.01 : nextThreshold * 0.97);
            if (state.stage === startStage) check.call(sim);
          };
          qa.set({ totalEarned: threshold * 1.01 });
        } else qa.earn(earned * 0.1);
      }
      const memoryStart = qa.memory();
      const world = qa.game.world;
      const wasPreparing = world.preparing;
      const stage = qa.game.stage;
      const gl = stage.renderer.getContext() as WebGL2RenderingContext;
      const ext = timeGpu ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
      const gpu: number[] = [];
      const pending: WebGLQuery[] = [];
      const passes = {
        frame: [stage, 'render'],
        shadow: [stage.shadow, 'render'],
        scene: [stage, 'renderScene'],
        post: [stage.post, 'finish'],
      } as const;
      const [owner, method] = passes[pass as keyof typeof passes];
      const target = owner as unknown as Record<string, (...args: unknown[]) => void>;
      const render = target[method]!;
      if (ext) target[method] = function (this: unknown, ...args: unknown[]) {
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          for (const query of pending) gl.deleteQuery(query);
          pending.length = 0;
        }
        while (pending.length && gl.getQueryParameter(pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
          const query = pending.shift()!;
          gpu.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6);
          gl.deleteQuery(query);
        }
        const query = pending.length < 16 ? gl.createQuery() : null;
        if (!query) return render.apply(this, args);
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        try {
          render.apply(this, args);
        } finally {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(query);
        }
      };
      const timer = clicksPerSecond > 0 ? setInterval(() => qa.click(w * 0.4, h * 0.5), 1000 / clicksPerSecond) : 0;
      let second = 0;
      const rush = (): void => {
        qa.set({ frenzy: 30 });
        if (second % 2 === 0) {
          qa.setCharge(1);
          // In the green zone (0.94-1.1 s at the start): a perfect shot, the biggest show the cannon has.
          qa.fireCannon(1.05);
        }
        second += 1;
      };
      if (full) rush();
      const rushTimer = full ? setInterval(rush, 1000) : 0;
      const cpu: number[] = [];
      const starts: number[] = [];
      const peak = { flakes: 0, voices: 0 };
      const game = qa.game as unknown as { world: { current?: { batches?: { count: number } | null } }; audio: { voices: unknown[] } };
      qa.game.onFrame(() => {
        cpu.push(qa.game.lastFrameCpuMs);
        starts.push(performance.now());
        peak.flakes = Math.max(peak.flakes, game.world.current?.batches?.count ?? 0);
        peak.voices = Math.max(peak.voices, game.audio.voices.length);
      });
      const intervals = await qa.sampleFrames(duration);
      performance.mark('perf:sample-end');
      clearInterval(timer);
      clearInterval(rushTimer);
      if (ext) target[method] = render;
      for (const query of pending) gl.deleteQuery(query);
      const marks = (window as unknown as { __marks?: Array<[string, number, number]> }).__marks ?? [];
      const { runtimes } = world as unknown as { runtimes: Array<{ root: { userData: Record<string, unknown> } } | undefined> };
      const builds = runtimes.flatMap((runtime, scene) => {
        const record = runtime?.root.userData;
        return record?.longestBuildStepMs === undefined ? [] : [{ scene, buildMs: record.longestBuildStepMs, probeMs: record.longestProbeStepMs }];
      });
      return { intervals, cpu, starts, marks, info: qa.info(), gpu, memoryStart, memoryEnd: qa.memory(), wasPreparing, builds, peak: full ? peak : undefined };
    },
    {
      duration: seconds, clicksPerSecond: clicks, earned: total, startStage: stage,
      threshold: STAGES[stage]!.threshold, nextThreshold: STAGES[stage + 1]?.threshold ?? Infinity,
      w: width!, h: height!, breakNow: breakout, full: stress, timeGpu: gpuTimer, pass: gpuPass,
    },
  );
  if (profilePath) {
    const { profile } = await cdp.send('Profiler.stop');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(profilePath, JSON.stringify(profile));
  }
  if (stress) await page.mouse.up();
  let gc: { pauses: number; totalMs: number; maxMs: number; over5ms: number; allocatedMbPerSecondLowerBound: number } | undefined;
  const trace = traceGc || tracePaints || traceTasks ? (JSON.parse((await harness.browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] }) : undefined;
  if (trace && traceGc) {
    const start = trace.traceEvents.find((event) => event.name === 'perf:sample-start');
    const end = trace.traceEvents.find((event) => event.name === 'perf:sample-end');
    if (!start || !end) throw new Error('Could not locate the sampled renderer thread in the GC trace');
    const events = trace.traceEvents.filter((event) => event.pid === start.pid && event.tid === start.tid && event.ts >= start.ts && event.ts <= end.ts);
    const pauses = events.filter((event) => (event.name === 'MinorGC' || event.name === 'MajorGC') && event.ph === 'X').map((event) => (event.dur ?? 0) / 1000);
    // Heap growth between available counters can miss allocations reclaimed between samples.
    const heap = events
      .filter((event) => event.name === 'UpdateCounters' && event.args?.data?.jsHeapSizeUsed !== undefined)
      .sort((a, b) => a.ts - b.ts);
    let allocated = 0;
    for (let i = 1; i < heap.length; i += 1) allocated += Math.max(0, heap[i]!.args!.data!.jsHeapSizeUsed! - heap[i - 1]!.args!.data!.jsHeapSizeUsed!);
    const span = (end.ts - start.ts) / 1e6;
    gc = {
      pauses: pauses.length,
      totalMs: Number(pauses.reduce((sum, value) => sum + value, 0).toFixed(1)),
      maxMs: Number(Math.max(0, ...pauses).toFixed(2)),
      over5ms: pauses.filter((value) => value > 5).length,
      allocatedMbPerSecondLowerBound: Number((allocated / 1048576 / span).toFixed(2)),
    };
  }
  const stats = (values: number[]): { mean: number; p95: number; p99: number; max: number } => {
    const sorted = [...values].sort((a, b) => a - b);
    const round = (x: number): number => Number(x.toFixed(2));
    return {
      mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      p95: round(sorted[Math.floor((sorted.length - 1) * 0.95)]!),
      p99: round(sorted[Math.floor((sorted.length - 1) * 0.99)]!),
      max: round(sorted[sorted.length - 1]!),
    };
  };
  const frame = stats(result.intervals);
  /** When into the sample each missed frame came, to line them up with what happened then. */
  function missedAt(intervals: number[]): number[] {
    const at: number[] = [];
    let elapsed = 0;
    for (const value of intervals) {
      elapsed += value;
      if (value > 25) at.push(Number((elapsed / 1000).toFixed(2)));
    }
    return at;
  }
  console.log(
    JSON.stringify({
      size: `${width}x${height}`,
      stage, query, maxLoad, fullHeap, breakout, coldBreakout, stress, capped, cpuThrottle,
      renderer: result.info.gpu,
      frames: result.intervals.length,
      fpsMean: Number((1000 / frame.mean).toFixed(1)),
      frameMs: frame,
      // Uncapped: frames over a 60 FPS budget. Capped: frames that missed a refresh and showed late.
      ...(capped
        ? { missed: result.intervals.filter((value) => value > 25).length, missedAtSeconds: missedAt(result.intervals) }
        : { over16ms: result.intervals.filter((value) => value > 16.7).length, over33ms: result.intervals.filter((value) => value > 33.4).length }),
      cpuMs: stats(result.cpu),
      ...(gpuTimer ? { gpuPass, gpuMs: result.gpu.length ? stats(result.gpu) : null, gpuSamples: result.gpu.length } : {}),
      memoryStart: result.memoryStart,
      memoryEnd: result.memoryEnd,
      wasPreparing: result.wasPreparing,
      builds: result.builds,
      errors,
      over50ms: result.intervals.filter((value) => value > 50).length,
      drawCalls: result.info.drawCalls,
      triangles: result.info.triangles,
      ...(result.peak ? { peak: result.peak } : {}),
      ...(gc ? { gc } : {}),
    }),
  );
  if (errors.length > 0) process.exitCode = 1;
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

import type { Object3D } from 'three';
import type { UnitKindName } from '../render/scenes/types.ts';
import type { Game } from '../game.ts';
import { BOT_PROFILES, BotPlayer } from '../sim/bots.ts';
import type { GameState } from '../sim/state.ts';
import { TuningPanel } from './panel.ts';
import { PerfOverlay } from './perf.ts';

export const CAPTURE_STEP = 1 / 60;

export interface QaApi {
  game: Game;
  /** Advances presentation by whole 1/60 s frames. Only meaningful in capture mode. */
  advance(seconds: number): void;
  info(): { drawCalls: number; triangles: number; gpu: string; simSteps: number; visualTime: number };
  click(x: number, y: number): void;
  earn(amount: number): void;
  set(values: Partial<GameState>): void;
  buy(producer: number, times?: number): void;
  showcase(): void;
  viewMachine(kind: string, angle: number): void;
  viewFrom(position: [number, number, number], target: [number, number, number], fov: number): void;
  skipTransition(): void;
  fireCannon(heldSeconds: number): void;
  setCharge(charge: number): void;
  showHopper(): void;
  /** Attaches a simulated player, for full playthroughs of the real game. */
  startBot(profile: number): void;
  runBot(seconds: number): BotStatus;
  /** Lets the bot play along with the real-time game loop. */
  driveBot(): void;
  memory(): { heapMb: number; geometries: number; textures: number; programs: number; stage: number; total: number; drawCalls: number };
  /** RGBA bytes of a canvas rectangle given in top-left pixel coordinates. */
  readRegion(x: number, y: number, width: number, height: number): number[];
  /** Makes every frame wait for the GPU, so uncapped timing cannot hide queued work. */
  setGpuSync(enabled: boolean): void;
  /** Collects frame intervals from requestAnimationFrame for the given duration. */
  sampleFrames(seconds: number): Promise<number[]>;
  /** Renders the current frame once more and says which pass and which part of the world each draw call was for. */
  drawBreakdown(): DrawBreakdown;
}

export interface DrawBreakdown {
  calls: number;
  triangles: number;
  /** Keyed "pass | scene part", e.g. "shadow | s1 machine:pan". */
  parts: Record<string, { calls: number; triangles: number }>;
}

export interface BotStatus {
  stage: number;
  ended: boolean;
  total: number;
  perSecond: number;
  flavors: number;
  owned: number[];
  achievements: number;
  maxDrawCalls: number;
  maxTriangles: number;
  heapMb: number;
}

declare global {
  interface Window {
    __pop?: QaApi;
  }
}

export function installDebug(game: Game): void {
  const panel = new TuningPanel();
  const perf = new PerfOverlay(game);
  const BOT_STEP = 0.1;
  let bot: BotPlayer | null = null;
  let maxDrawCalls = 0;
  let maxTriangles = 0;
  let syncGpu = false;
  const probe = new Uint8Array(4);
  game.onFrame((delta) => {
    perf.update(delta);
    if (syncGpu) {
      // Waiting for a pixel makes each frame interval include its real GPU cost.
      const gl = game.stage.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F2') {
      event.preventDefault();
      panel.toggle();
    } else if (event.key === 'F3') {
      event.preventDefault();
      perf.toggle();
    }
  });

  window.__pop = {
    game,
    advance(seconds) {
      const frames = Math.round(seconds / CAPTURE_STEP);
      for (let index = 0; index < frames; index += 1) game.frame(CAPTURE_STEP);
    },
    info() {
      return {
        drawCalls: game.stage.stats.drawCalls,
        triangles: game.stage.stats.triangles,
        gpu: game.stage.gpuName(),
        simSteps: game.simSteps,
        visualTime: game.visualTime,
      };
    },
    click(x, y) {
      game.world.click(x, y);
    },
    earn(amount) {
      game.sim.state.popcorn += amount;
      game.sim.state.totalEarned += amount;
    },
    set(values) {
      Object.assign(game.sim.state, values);
      game.sim.invalidate();
    },
    buy(producer, times = 1) {
      for (let index = 0; index < times; index += 1) game.sim.buyProducer(producer);
    },
    showcase() {
      game.world.showcase();
    },
    viewMachine(kind, angle) {
      game.world.viewMachine(kind as UnitKindName, angle);
    },
    viewFrom(position, target, fov) {
      game.world.viewFrom(position, target, fov);
    },
    skipTransition() {
      game.world.skipTransition();
    },
    fireCannon(held) {
      game.sim.state.cannonCooldown = 0;
      game.sim.fireCannon(held);
    },
    setCharge(charge) {
      game.world.setCannonCharge(charge, charge > 0);
    },
    showHopper() {
      game.sim.state.hopperTimer = 0.01;
    },
    startBot(profile) {
      const canvas = game.stage.renderer.domElement;
      bot = new BotPlayer(BOT_PROFILES[profile]!, game.sim, game.bus, () =>
        game.world.click(canvas.clientWidth * 0.4, canvas.clientHeight * 0.5),
      );
    },
    driveBot() {
      let pending = 0;
      game.onFrame((delta) => {
        pending += delta;
        while (pending >= BOT_STEP) {
          pending -= BOT_STEP;
          bot!.act(BOT_STEP);
          bot!.decide(BOT_STEP);
        }
      });
    },
    memory() {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const info = game.stage.renderer.info;
      return {
        heapMb: (memory?.usedJSHeapSize ?? 0) / 1048576,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        stage: game.sim.state.stage,
        total: game.sim.state.totalEarned,
        drawCalls: game.stage.stats.drawCalls,
      };
    },
    runBot(seconds) {
      const steps = Math.round(seconds / BOT_STEP);
      for (let index = 0; index < steps && !game.sim.state.ended; index += 1) {
        bot!.act(BOT_STEP);
        game.frame(BOT_STEP);
        bot!.decide(BOT_STEP);
        maxDrawCalls = Math.max(maxDrawCalls, game.stage.stats.drawCalls);
        maxTriangles = Math.max(maxTriangles, game.stage.stats.triangles);
      }
      const s = game.sim.state;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        stage: s.stage,
        ended: s.ended,
        total: s.totalEarned,
        perSecond: game.sim.perSecond,
        flavors: s.flavors,
        owned: [...s.owned],
        achievements: s.legacy.achievements.length,
        maxDrawCalls,
        maxTriangles,
        heapMb: Math.round((memory?.usedJSHeapSize ?? 0) / 1048576),
      };
    },
    readRegion(x, y, width, height) {
      const gl = game.stage.renderer.getContext();
      const pixels = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(x, gl.drawingBufferHeight - y - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Array.from(pixels);
    },
    setGpuSync(enabled) {
      syncGpu = enabled;
    },
    drawBreakdown() {
      const { renderer, scene, camera, shadow } = game.stage;
      const parts: DrawBreakdown['parts'] = {};
      let current: Object3D | null = null;
      let pass = 'post';
      const label = (object: Object3D): string => {
        let part = '';
        for (let node: Object3D | null = object; node; node = node.parent) {
          if (!part && typeof node.userData.budget === 'string') part = node.userData.budget;
          if (typeof node.userData.budgetScene === 'number') return `s${node.userData.budgetScene} ${part || 'root'}`;
        }
        return part || 'world';
      };
      const hooked: Array<[Object3D, Object3D['onBeforeRender']]> = [];
      scene.traverse((node) => {
        const original = node.onBeforeRender;
        hooked.push([node, original]);
        node.onBeforeRender = function (...args) {
          current = node;
          original.apply(this, args);
        };
      });
      const render = renderer.render;
      renderer.render = function (target, view) {
        current = null;
        pass = view === shadow.camera ? 'shadow' : view === camera ? (view.layers.isEnabled(0) ? 'main' : 'glass') : 'post';
        render.call(this, target, view);
      };
      const info = renderer.info;
      const update = info.update;
      const TRIANGLES = 4;
      info.update = function (count, mode, instances) {
        const key = `${pass} | ${current ? label(current) : 'fullscreen'}`;
        const entry = (parts[key] ??= { calls: 0, triangles: 0 });
        entry.calls += 1;
        if (mode === TRIANGLES) entry.triangles += (count / 3) * Math.max(1, instances);
        update.call(this, count, mode, instances);
      };
      try {
        game.stage.render(game.visualTime);
      } finally {
        renderer.render = render;
        info.update = update;
        for (const [node, original] of hooked) node.onBeforeRender = original;
      }
      return { calls: game.stage.stats.drawCalls, triangles: game.stage.stats.triangles, parts };
    },
    sampleFrames(seconds) {
      return new Promise((resolve) => {
        const intervals: number[] = [];
        let start = 0;
        let last = 0;
        const step = (now: number): void => {
          if (start === 0) start = now;
          else intervals.push(now - last);
          last = now;
          if (now - start < seconds * 1000) requestAnimationFrame(step);
          else resolve(intervals);
        };
        requestAnimationFrame(step);
      });
    },
  };
}

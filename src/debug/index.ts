import type { Game } from '../game.ts';
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
  buy(producer: number, times?: number): void;
  showcase(): void;
  viewFrom(position: [number, number, number], target: [number, number, number], fov: number): void;
  pieces(): { airborne: number };
  /** RGBA bytes of a canvas rectangle given in top-left pixel coordinates. */
  readRegion(x: number, y: number, width: number, height: number): number[];
  /** Makes every frame wait for the GPU, so uncapped timing cannot hide queued work. */
  setGpuSync(enabled: boolean): void;
  /** Collects frame intervals from requestAnimationFrame for the given duration. */
  sampleFrames(seconds: number): Promise<number[]>;
}

declare global {
  interface Window {
    __pop?: QaApi;
  }
}

export function installDebug(game: Game): void {
  const panel = new TuningPanel();
  const perf = new PerfOverlay(game);
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
    buy(producer, times = 1) {
      for (let index = 0; index < times; index += 1) game.sim.buyProducer(producer);
    },
    showcase() {
      game.world.showcase();
    },
    viewFrom(position, target, fov) {
      game.world.viewFrom(position, target, fov);
    },
    pieces() {
      return { airborne: game.world.director.airborne };
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

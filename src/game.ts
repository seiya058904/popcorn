import { AudioEngine } from './audio/engine.ts';
import { EventBus } from './events/bus.ts';
import type { GameEvents } from './events/game-events.ts';
import { Stage } from './render/core/stage.ts';
import type { QualityTier } from './render/core/quality.ts';
import { World } from './render/world.ts';
import { Simulation } from './sim/simulation.ts';
import { FixedStepper } from './sim/stepper.ts';
import { Hud } from './ui/hud.ts';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  capture: boolean;
  quality?: QualityTier;
}

/** Longest frame the visuals will integrate, so a stall never causes a visual jump. */
const MAX_FRAME_SECONDS = 0.1;

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly sim = new Simulation(this.bus);
  readonly stage: Stage;
  readonly world: World;
  readonly hud: Hud;
  readonly audio = new AudioEngine();
  readonly capture: boolean;
  /** Seconds of presentation time; never used for economy results. */
  visualTime = 0;
  simSteps = 0;
  /** Main-thread cost of the last frame, excluding time the GPU spends afterwards. */
  lastFrameCpuMs = 0;
  private readonly stepper = new FixedStepper();
  private readonly frameListeners: Array<(deltaSeconds: number) => void> = [];
  private lastTimestamp = 0;
  private running = false;

  constructor(options: GameOptions) {
    this.capture = options.capture;
    this.stage = new Stage({ canvas: options.canvas, capture: options.capture, quality: options.quality });
    this.hud = new Hud(options.uiRoot, this.sim);
    this.world = new World(this.stage, this.sim, this.bus, {
      onBurst: (x, y, combo, gain, manual) => {
        if (manual) {
          this.audio.pop(combo);
          this.hud.floatGain(x, y, gain);
        } else {
          this.audio.crackle();
        }
      },
      onLand: (gain) => {
        if (gain > 0) this.hud.popCounter();
      },
    });
    // Compiling up front keeps the first click from stalling on shader work.
    this.stage.renderer.compile(this.stage.scene, this.stage.camera);
    options.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.audio.unlock();
      this.world.click(event.clientX, event.clientY);
    });
  }

  onFrame(listener: (deltaSeconds: number) => void): void {
    this.frameListeners.push(listener);
  }

  start(): void {
    if (this.capture) {
      this.frame(0);
      return;
    }
    this.running = true;
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  /** Runs one presentation frame. Capture mode calls this directly with a fixed delta. */
  frame(deltaSeconds: number): void {
    const startedAt = performance.now();
    const delta = Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    this.stepper.advance(delta, (step) => {
      this.sim.step(step);
      this.simSteps += 1;
    });
    this.visualTime += delta;
    // Sprites read the shared clock while spawning, so it must advance first.
    this.stage.setTime(this.visualTime);
    this.world.update(delta);
    this.hud.update(this.world.pendingGain);
    this.stage.render(this.visualTime);
    this.lastFrameCpuMs = performance.now() - startedAt;
    for (const listener of this.frameListeners) listener(delta);
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    const delta = this.lastTimestamp === 0 ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    this.frame(delta);
    requestAnimationFrame(this.tick);
  };
}

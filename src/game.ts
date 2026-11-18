import { EventBus } from './events/bus.ts';
import type { GameEvents } from './events/game-events.ts';
import { FixedStepper } from './sim/stepper.ts';
import { Stage } from './render/core/stage.ts';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  capture: boolean;
}

/** Longest frame the visuals will integrate, so a stall never causes a visual jump. */
const MAX_FRAME_SECONDS = 0.1;

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly stage: Stage;
  readonly capture: boolean;
  /** Seconds of presentation time; never used for economy results. */
  visualTime = 0;
  simSteps = 0;
  private readonly stepper = new FixedStepper();
  private readonly frameListeners: Array<(deltaSeconds: number) => void> = [];
  private lastTimestamp = 0;
  private running = false;

  constructor(options: GameOptions) {
    this.capture = options.capture;
    this.stage = new Stage({ canvas: options.canvas, capture: options.capture });
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
    const delta = Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    this.stepper.advance(delta, () => {
      this.simSteps += 1;
    });
    this.visualTime += delta;
    this.stage.render();
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

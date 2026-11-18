/** Simulation rate required by the execution plan. */
export const SIM_HZ = 10;
export const SIM_STEP = 1 / SIM_HZ;

/**
 * Converts variable frame time into fixed simulation steps.
 * A long stall runs at most `maxStepsPerAdvance` steps; the remainder is dropped
 * here and recovered by the offline-earnings path instead of freezing a frame.
 */
export class FixedStepper {
  private accumulator = 0;
  private readonly step: number;
  private readonly maxSteps: number;

  constructor(step = SIM_STEP, maxStepsPerAdvance = 20) {
    this.step = step;
    this.maxSteps = maxStepsPerAdvance;
  }

  /** Returns how far (0..1) the clock sits between the last step and the next. */
  advance(deltaSeconds: number, onStep: (stepSeconds: number) => void): number {
    this.accumulator += Math.max(0, deltaSeconds);
    let steps = 0;
    // The epsilon absorbs float drift so that 10 × 0.1 s yields exactly 10 steps.
    while (this.accumulator >= this.step - 1e-9 && steps < this.maxSteps) {
      onStep(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }
    if (steps === this.maxSteps && this.accumulator >= this.step) {
      this.accumulator %= this.step;
    }
    this.accumulator = Math.max(0, this.accumulator);
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

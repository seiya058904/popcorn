import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/events/bus.ts';
import { Rng } from '../../src/motion/rng.ts';
import { tuning, tuningFields } from '../../src/motion/tuning.ts';
import { FixedStepper, SIM_HZ, SIM_STEP } from '../../src/sim/stepper.ts';

describe('EventBus', () => {
  it('delivers typed payloads and stops after unsubscribe', () => {
    const bus = new EventBus<{ ping: number }>();
    const listener = vi.fn();
    const off = bus.on('ping', listener);
    bus.emit('ping', 3);
    off();
    bus.emit('ping', 4);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(3);
  });

  it('keeps the current emit stable when a listener unsubscribes itself', () => {
    const bus = new EventBus<{ ping: void }>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', undefined);
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('FixedStepper', () => {
  it('runs at 10 Hz regardless of frame rate', () => {
    expect(SIM_HZ).toBe(10);
    for (const fps of [30, 60, 144, 320]) {
      const stepper = new FixedStepper();
      let steps = 0;
      for (let frame = 0; frame < fps * 10; frame += 1) {
        stepper.advance(1 / fps, () => {
          steps += 1;
        });
      }
      expect(Math.abs(steps - 100)).toBeLessThanOrEqual(1);
    }
  });

  it('caps catch-up after a long stall and reports a valid blend factor', () => {
    const stepper = new FixedStepper(SIM_STEP, 5);
    let steps = 0;
    const alpha = stepper.advance(60, () => {
      steps += 1;
    });
    expect(steps).toBe(5);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });
});

describe('Rng', () => {
  it('replays identically for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let index = 0; index < 100; index += 1) expect(a.next()).toBe(b.next());
  });
});

describe('tuning', () => {
  it('has a slider for every value, with defaults in range', () => {
    expect(new Set(tuningFields.map((field) => field.key))).toEqual(new Set(Object.keys(tuning)));
    for (const field of tuningFields) {
      expect(tuning[field.key]).toBeGreaterThanOrEqual(field.min);
      expect(tuning[field.key]).toBeLessThanOrEqual(field.max);
    }
  });
});

describe('architecture rules', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('keeps sim, content and events free of presentation imports', () => {
    const forbidden = /from\s+['"][^'"]*(render|ui|audio|platform|debug|three)[/'"]/;
    for (const dir of ['src/sim', 'src/content', 'src/events']) {
      for (const file of walk(dir)) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings } from '../../src/platform/settings.ts';
import { MOTION, spring } from '../../src/ui/motion.ts';

/** The points of a linear() easing, in order. */
const points = (easing: string): number[] => easing.slice('linear('.length, -1).split(',').map(Number);

describe('interface springs', () => {
  it('start at rest and end exactly on target', () => {
    for (const curve of Object.values(MOTION)) {
      if (!curve.easing.startsWith('linear(')) continue;
      const values = points(curve.easing);
      expect(values[0]).toBe(0);
      expect(values[values.length - 1]).toBe(1);
    }
  });

  it('overshoot a little when underdamped and never when critically damped', () => {
    expect(Math.max(...points(spring(0.68, 0.32).easing))).toBeGreaterThan(1.01);
    expect(Math.max(...points(spring(0.68, 0.32).easing))).toBeLessThan(1.15);
    expect(Math.max(...points(spring(1, 0.3).easing))).toBeLessThanOrEqual(1.0005);
  });

  it('settle within the times the interface spec allows', () => {
    // Release, appear and slide stay under half a second, so nothing ever feels slow.
    for (const curve of [MOTION.release, MOTION.appear, MOTION.slide]) {
      expect(curve.duration).toBeGreaterThan(150);
      expect(curve.duration).toBeLessThan(500);
    }
    // Leaving is quicker than arriving.
    expect(MOTION.exit.duration).toBeLessThan(MOTION.appear.duration);
  });
});

describe('interface settings', () => {
  it('keep the interface volume and haptics, and fall back for damaged values', () => {
    const defaults = defaultSettings();
    expect(parseSettings(JSON.stringify({ ui: 0.3, haptics: false }), defaults)).toMatchObject({ ui: 0.3, haptics: false });
    expect(parseSettings(JSON.stringify({ ui: 'loud', haptics: 'yes' }), defaults)).toMatchObject({ ui: defaults.ui, haptics: defaults.haptics });
    expect(parseSettings(JSON.stringify({ ui: 7 }), defaults).ui).toBe(1);
  });
});

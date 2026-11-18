import { lerp } from '../../motion/ease.ts';
import type { PileShape } from '../popcorn/pile.ts';

export interface VesselConfig {
  k: number;
  floorY: number;
  rimY: number;
  innerR: number;
  outerR: number;
  groundY: number;
  /** An optional raised surface the vessel stands on. */
  table?: { y: number; radius: number };
  size: number;
  peak: number;
  endSlope: number;
  coreDensityRadius: number;
  outerDensityRadius: number;
  flakeScale: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A heap that fills a round vessel, crests its rim and spills outward in tongues. */
export function vesselPile(c: VesselConfig): PileShape {
  const { k } = c;
  const peakAt = (level: number): number => lerp(c.floorY + 0.1 * k, c.peak, Math.pow(level, 0.85));
  const slopeAt = (level: number): number => lerp(1.15, c.endSlope, level);
  const moundAt = (r: number, level: number): number => peakAt(level) - k * slopeAt(level) * Math.pow(r / k, 1.35);
  const crestAt = (level: number): number => moundAt(c.innerR, level) - c.rimY;

  return {
    centerX: 0,
    centerZ: 0,
    size: c.size,
    k,
    flakeScale: c.flakeScale,
    wallHeight: c.rimY,
    floor(x, z) {
      const r = Math.hypot(x, z);
      if (r < c.innerR) return c.floorY;
      if (r < c.outerR + 0.05 * k) return c.rimY;
      if (c.table && r < c.table.radius) return c.table.y;
      return c.groundY;
    },
    mound(x, z, level, wobble) {
      const r = Math.hypot(x, z);
      if (r < c.outerR + 0.05 * k) return moundAt(r, level);
      const crest = crestAt(level);
      if (crest <= 0) return c.groundY - k;
      const reach = c.outerR + crest * 3.1 * (1 + wobble * 0.5);
      const table = c.table;
      if (table && r >= table.radius) {
        // Past the table edge the popcorn has fallen: it heaps on the floor below, growing with
        // the overflow, instead of hanging from the table like a curtain.
        const spill = reach - table.radius;
        if (spill <= 0) return c.groundY - k;
        const height = (moundAt(r * (1 + wobble * 0.08), level) - c.groundY) * Math.min(1, spill / (2.4 * k));
        const width = Math.max(1.4 * k, spill * 1.5);
        const fall = smooth(table.radius + width, table.radius + width * 0.2, r);
        return fall <= 0 || height <= 0 ? c.groundY - k : c.groundY + height * fall;
      }
      const base = table ? table.y : c.groundY;
      const edge = smooth(reach, reach - Math.max(0.9 * k, (reach - c.outerR) * 0.7), r);
      if (edge <= 0) return c.groundY - k;
      const height = lerp(base - 0.12 * k, moundAt(r * (1 + wobble * 0.08), level), edge);
      if (!table) return height;
      // Until the overflow is deep enough to pour over, the heap stops short of the table edge.
      const pour = Math.min(1, Math.max(0, (reach - table.radius) / (2.4 * k)));
      return lerp(height, table.y - 0.12 * k, smooth(table.radius - 1.4 * k, table.radius - 0.1 * k, r) * (1 - pour));
    },
    landingRadius(level) {
      const reach = k * Math.pow(Math.max(0, peakAt(level) - c.floorY) / (k * slopeAt(level)), 1 / 1.35);
      const crest = crestAt(level);
      const limit = crest > 0 ? c.innerR + crest * 1.1 : c.innerR * 0.92;
      return Math.max(0.22 * k, Math.min(reach * 0.85, limit));
    },
    density(x, z) {
      const r = Math.hypot(x, z);
      return r < c.innerR * 1.07 ? 0.75 : lerp(1, 0.05, smooth(c.coreDensityRadius, c.outerDensityRadius, r));
    },
    clearance(x, z) {
      const r = Math.hypot(x, z);
      if (r < c.innerR) return smooth(c.innerR - 0.05 * k, c.innerR - 0.24 * k, r);
      return smooth(c.outerR + 0.1 * k, c.outerR + 0.3 * k, r);
    },
  };
}

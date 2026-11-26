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

/** Rise over run of popcorn resting against something. */
const SKIRT_SLOPE = 1.2;

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
    moundAtLevel(level) {
      const peak = peakAt(level);
      const slope = k * slopeAt(level);
      const heightAt = (radius: number): number => peak - slope * Math.pow(radius / k, 1.35);
      const crest = heightAt(c.innerR) - c.rimY;
      const table = c.table;
      const base = table ? table.y : c.groundY;
      // The overflow climbs the outside of the vessel. Near the top it closes the last stretch
      // quickly, so the heap never leaves a ragged window onto the vessel's side.
      const dome = heightAt(c.outerR);
      const rising = base + crest * 2.1 + 0.3 * k;
      const wall = c.rimY - base;
      const closing = smooth(base + wall * 0.45, base + wall * 0.7, rising);
      const collar = lerp(rising, Math.max(rising, dome), closing);
      const joined = smooth(-0.5 * k, 0, collar - dome);
      const overflow = c.outerR + crest * 3.1;
      const minimumReach = c.outerR + ((dome - base) / SKIRT_SLOPE) * closing * 1.25;
      // Once the overflow runs past the table edge, heap and skirt become a single mass.
      const engulfed = table ? smooth(table.radius + 0.6 * k, table.radius + 1.6 * k, overflow) : 0;
      const lipY = table ? table.y + 0.3 * k : 0;
      return (r, wobble) => {
        if (r < c.outerR + 0.05 * k) {
          const inside = heightAt(r);
          if (crest <= 0) return inside;
          // Until then the dome settles onto the rim, leaving the vessel's side in plain view.
          // It stays clear of the rim by more than the heap's lumps, or they would open holes.
          const settle = smooth(c.innerR * 0.55, c.outerR, r) * (1 - joined);
          const settled = lerp(inside, Math.min(inside, c.rimY + 0.12 * k), settle);
          return r < c.innerR ? settled : Math.max(settled, c.rimY + 0.12 * k);
        }
        if (crest <= 0) return c.groundY - k;
        // Tongues vary by a bounded amount, so a deep overflow still reads as one mass,
        // and the skirt always reaches far enough to lean against the vessel at a natural slope.
        const reach = Math.max(overflow + wobble * Math.min(crest, 2.4 * k), minimumReach);
        // Tongues start away from the wall, so the overflow rises around the vessel evenly.
        const mound = heightAt(r * (1 + wobble * 0.08 * smooth(c.outerR, c.outerR + 1.5 * k, r)));
        if (table && r >= table.radius) {
          // Before that, only scattered popcorn lands on the floor beyond the table.
          const spill = reach - table.radius;
          const width = Math.max(1.4 * k, spill * 1.5);
          const pour = Math.min(1, spill / (2.4 * k));
          const landing = smooth(table.radius + 0.42 * k, table.radius + 1.1 * k, r);
          const scattered = spill > 0 ? Math.min((mound - c.groundY) * pour * pour, (table.radius + width - r) * 0.9, 0.9 * k) * landing : 0;
          // Nothing touches the table's side until the heap is really about to bury it.
          if (engulfed < 0.3 && r < table.radius + 0.42 * k) return c.groundY - k;
          // A full heap banks up against the table's side, right to the edge.
          const lip = lipY - c.groundY;
          const bank = lip * (1 - (r - table.radius) / (lip * 1.1));
          const height = lerp(scattered, Math.max(mound - c.groundY, bank), engulfed);
          return height > 0 ? c.groundY + height : c.groundY - k;
        }
        // What spills over lands at the foot of the vessel and builds up from there.
        const skirt = Math.min(mound, collar, base + (reach - r) * SKIRT_SLOPE);
        const height = lerp(skirt, Math.max(mound, lipY), engulfed);
        if (height <= base) return c.groundY - k;
        if (!table) return height;
        // Until the overflow is deep enough to pour over, the heap stops short of the table edge.
        const pour = Math.max(engulfed, Math.min(1, Math.max(0, (reach - table.radius) / (2.4 * k))));
        return lerp(height, table.y - 0.12 * k, smooth(table.radius - 1.4 * k, table.radius - 0.1 * k, r) * (1 - pour));
      };
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

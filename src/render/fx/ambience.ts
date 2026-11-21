import * as THREE from 'three';
import type { Rng } from '../../motion/rng.ts';
import { SpriteKind, type Sprites } from './sprites.ts';

/**
 * Life in the air of a scene: dust turning in a beam of light, insects round the street lamps at
 * night, a meteor now and then. All of it is sprites, so it costs no draw calls of its own.
 */
export interface AmbientEmitter {
  look: 'mote' | 'firefly' | 'meteor';
  /** Where they appear, in the scene's own units: the middle and half the size of a box. */
  center: [number, number, number];
  half: [number, number, number];
  /** How many a second, at full strength. */
  rate: number;
  /** Progress through the scene's story over which they fade in, and fade out again; by default always. */
  story?: [number, number, number, number];
}

const moteColor = new THREE.Color(1.6, 1.35, 1.0);
const fireflyColor = new THREE.Color(1.8, 2.0, 0.7);
const meteorColor = new THREE.Color(2.4, 2.3, 2.0);

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How strongly an emitter runs at story progress u. */
export function ambientStrength(emitter: AmbientEmitter, u: number): number {
  const story = emitter.story;
  if (!story) return 1;
  return smooth(story[0], story[1], u) * (1 - smooth(story[2], story[3], u));
}

/**
 * Runs a scene's emitters for one frame. `due` keeps, per emitter, the time left until the next
 * one; `k` is the scene's scale, so a mote is the same size on screen in every scene.
 */
export function runAmbience(emitters: readonly AmbientEmitter[], due: number[], dt: number, u: number, k: number, sprites: Sprites, rng: Rng, calm: boolean): void {
  emitters.forEach((emitter, index) => {
    const strength = ambientStrength(emitter, u);
    if (strength <= 0.01) return;
    due[index] = (due[index] ?? 0) - dt;
    while (due[index]! <= 0) {
      due[index]! += 1 / (emitter.rate * strength);
      const [cx, cy, cz] = emitter.center;
      const [hx, hy, hz] = emitter.half;
      const x = cx + rng.range(-hx, hx);
      const y = cy + rng.range(-hy, hy);
      const z = cz + rng.range(-hz, hz);
      if (emitter.look === 'mote') {
        // Dust turning slowly in the light, there and gone.
        sprites.spawn({ x, y, z, vx: rng.range(-0.06, 0.06) * k, vy: rng.range(-0.02, 0.05) * k, vz: rng.range(-0.06, 0.06) * k, drag: 0.1, sizeStart: 0.035 * k, sizeEnd: 0.03 * k, life: rng.range(3, 5.5), color: moteColor, alpha: rng.range(0.35, 0.7), additive: 1, kind: SpriteKind.Drop });
      } else if (emitter.look === 'firefly') {
        // A drifting spark that wanders a little; with reduced motion they hang still.
        const drift = calm ? 0 : 0.25 * k;
        sprites.spawn({ x, y, z, vx: rng.range(-1, 1) * drift, vy: rng.range(-0.3, 0.6) * drift, vz: rng.range(-1, 1) * drift, drag: 0.4, sizeStart: 0.18 * k, sizeEnd: 0.06 * k, life: rng.range(1.6, 3), color: fireflyColor, alpha: 0.9, additive: 1, kind: SpriteKind.Drop });
      } else if (!calm) {
        // A meteor: a bright point that streaks across the sky and burns out.
        const a = rng.range(-0.6, 0.6);
        const speed = 60 * k;
        sprites.spawn({ x, y, z, vx: Math.cos(a) * speed, vy: -Math.abs(Math.sin(a)) * speed * 0.6 - 10 * k, vz: 0, sizeStart: 0.5 * k, sizeEnd: 0.1 * k, life: 0.7, color: meteorColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: 0 });
      }
    }
  });
}

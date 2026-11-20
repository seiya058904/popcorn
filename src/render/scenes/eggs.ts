import * as THREE from 'three';
import { Spring } from '../../motion/ease.ts';
import { SpriteKind } from '../fx/sprites.ts';
import type { LaunchOptions } from '../popcorn/director.ts';
import type { SceneContext } from './types.ts';

/**
 * A hidden thing to tap (src/content/props.ts lists them). Positions are in the scene's own
 * space; the world turns them into a target on screen.
 */
export interface EggSpot {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly radius: number;
  /** False while it cannot be found: not there yet, gone, or busy with its gag. */
  active?(): boolean;
  /** Plays the gag: a beat of anticipation, the joke, and something to settle on. */
  play(ctx: SceneContext): void;
}

const sparkleColor = new THREE.Color(2.4, 2, 1.1);
const dustColor = new THREE.Color('#d8c8b8');

/** The pieces every gag is built from, sized by `k`, the scene's world units per stove unit. */
export const gag = {
  /** A ring and a scatter of stars: the moment something reacts to the tap. */
  sparkle(ctx: SceneContext, at: THREE.Vector3, size: number, stars = 8): void {
    const r = ctx.rng;
    ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, sizeStart: 0.3 * size, sizeEnd: 2 * size, life: 0.5, color: sparkleColor, alpha: 0.8, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < stars; i += 1) {
      const a = r.range(0, 6.28);
      ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * 1.8 * size, vy: r.range(0.8, 2.6) * size, vz: Math.sin(a) * 1.8 * size, gravity: 3.5 * size, sizeStart: 0.24 * size, sizeEnd: 0.03 * size, life: r.range(0.45, 0.85), color: sparkleColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: r.range(-4, 4) });
    }
  },

  /** One quiet twinkle, to catch the eye of someone who has not found it yet. */
  wink(ctx: SceneContext, at: THREE.Vector3, size: number): void {
    ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, sizeStart: 0.05 * size, sizeEnd: 0.55 * size, life: 0.7, color: sparkleColor, alpha: 0.9, additive: 1, kind: SpriteKind.Star, spin: 2 });
  },

  /** Popcorn bursting out of a point and landing on the heap. */
  burst(ctx: SceneContext, at: THREE.Vector3, count: number, options: LaunchOptions = {}): void {
    const r = ctx.rng;
    for (let i = 0; i < count; i += 1) {
      ctx.director.launch(at.x + r.range(-0.2, 0.2), at.y, at.z + r.range(-0.2, 0.2), { flight: r.range(0.7, 1.2), quiet: i > 2, ...options });
    }
  },

  /** A soft cloud: a sneeze, a puff of dust, steam off something hot. */
  puff(ctx: SceneContext, at: THREE.Vector3, size: number, color = dustColor, count = 7): void {
    const r = ctx.rng;
    for (let i = 0; i < count; i += 1) {
      const a = r.range(0, 6.28);
      ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * size, vy: r.range(0.3, 1) * size, vz: Math.sin(a) * size, drag: 2.4, sizeStart: 0.3 * size, sizeEnd: r.range(0.9, 1.4) * size, life: r.range(0.6, 1), color, alpha: 0.35, kind: SpriteKind.Puff, spin: r.range(-1, 1) });
    }
  },
};

/**
 * A springy reaction for an object: it squashes, stretches past its rest and settles by itself.
 * `amount` is the share of its size it squashes by; the turn is in radians about `axis`.
 */
export class Wobble {
  private readonly spring: Spring;
  private readonly object: THREE.Object3D;
  private readonly rest: THREE.Vector3;
  private readonly restRotation: THREE.Euler;
  private readonly axis: 'x' | 'y' | 'z';
  private readonly squash: number;
  private readonly turn: number;

  constructor(object: THREE.Object3D, options: { axis?: 'x' | 'y' | 'z'; squash?: number; turn?: number; stiffness?: number; damping?: number } = {}) {
    this.object = object;
    this.rest = object.scale.clone();
    this.restRotation = object.rotation.clone();
    this.axis = options.axis ?? 'z';
    this.squash = options.squash ?? 0.14;
    this.turn = options.turn ?? 0.18;
    this.spring = new Spring(0, options.stiffness ?? 320, options.damping ?? 7);
  }

  /** Starts it off; the first swing peaks at about `strength`. */
  kick(strength = 1): void {
    this.spring.kick(-Math.sqrt(this.spring.stiffness) * strength);
  }

  /** Call every frame; `x` is applied on top of the object's resting pose. */
  update(dt: number): void {
    const x = this.spring.update(dt);
    if (Math.abs(x) < 1e-4 && Math.abs(this.object.scale.y - this.rest.y) < 1e-4) return;
    const s = this.squash * x;
    this.object.scale.set(this.rest.x * (1 - s * 0.5), this.rest.y * (1 + s), this.rest.z * (1 - s * 0.5));
    this.object.rotation.copy(this.restRotation);
    this.object.rotation[this.axis] += this.turn * x;
  }
}

/** Things to do a moment from now, for gags that play out over a second or two. */
export class Cues {
  private readonly queue: Array<{ at: number; run: () => void }> = [];
  private time = 0;

  after(seconds: number, run: () => void): void {
    this.queue.push({ at: this.time + seconds, run });
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const cue = this.queue[i]!;
      if (cue.at > this.time) continue;
      this.queue.splice(i, 1);
      cue.run();
    }
  }
}

/** 0 at rest; once started it rises smoothly to 1 and falls back to 0 over `seconds`. */
export class Pulse {
  private readonly seconds: number;
  private t = -1;

  constructor(seconds: number) {
    this.seconds = seconds;
  }

  start(): void {
    this.t = 0;
  }

  get busy(): boolean {
    return this.t >= 0;
  }

  /** Where it is through its run, 0 to 1; 0 at rest. */
  get progress(): number {
    return this.t < 0 ? 0 : Math.min(1, this.t / this.seconds);
  }

  update(dt: number): number {
    if (this.t < 0) return 0;
    this.t += dt;
    if (this.t >= this.seconds) {
      this.t = -1;
      return 0;
    }
    return Math.sin(Math.PI * (this.t / this.seconds)) ** 2;
  }
}

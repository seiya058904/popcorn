import * as THREE from 'three';
import { clamp01, easeOutBack, easeOutCubic, lerp } from '../../motion/ease.ts';
import type { Rng } from '../../motion/rng.ts';
import { tuning } from '../../motion/tuning.ts';
import { FLAKE_SHAPES } from '../geometry/popcorn.ts';
import { SpriteKind, type Sprites } from '../fx/sprites.ts';
import type { PieceBatches } from './batches.ts';
import type { Pile } from './pile.ts';

type Phase = 'rise' | 'idle' | 'squash' | 'swell' | 'hold' | 'fly' | 'land' | 'sink' | 'display';

interface Piece {
  phase: Phase;
  t: number;
  shape: number;
  home: number;
  gain: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  targetX: number;
  targetY: number;
  targetZ: number;
  flight: number;
  quat: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  scale: number;
  flightScale: number;
  squashTime: number;
  swellTime: number;
  holdTime: number;
  squashY: number;
  popFrom: number;
  pop: number;
  glow: number;
}

export interface DirectorHooks {
  onSquash(): void;
  onBurst(position: THREE.Vector3, combo: number, gain: number, manual: boolean): void;
  onLand(position: THREE.Vector3, gain: number): void;
}

const KERNEL_SCALE = 0.36;
/** Flakes are exaggerated in the air, then settle to heap size as they arrive. */
const FLIGHT_SCALE = 0.44;
const RAPID_FLIGHT_SCALE = 0.31;
const MACHINE_FLIGHT_SCALE = 0.3;
const LANDED_SCALE = 0.23;
const GRAVITY = 30;
const HOME_COUNT = 12;
const SWELL_MS = 70;
const SWELL_RAPID_MS = 34;
const SQUASH_RAPID_MS = 34;
const COMBO_WINDOW = 0.55;

const POP_SWOLLEN = 0.1;
const SWOLLEN_Y = 1.36;
const SWOLLEN_XZ = 1.26;

const cream = new THREE.Color(1.6, 1.42, 1.05);
const ember = new THREE.Color(2.4, 1.2, 0.35);
const hullColor = new THREE.Color('#8a4a1c');
const steamColor = new THREE.Color(0.85, 0.82, 0.8);
const crumbColor = new THREE.Color('#ffe9bd');

const m = new THREE.Matrix4();
const rotation = new THREE.Matrix4();
const scaling = new THREE.Matrix4();
const uniform = new THREE.Vector3();
const spinQ = new THREE.Quaternion();
const ray = new THREE.Ray();

/** Runs the whole life of a kernel: seated, squashed, swollen, burst, airborne, landed, absorbed. */
export class PopDirector {
  private readonly pieces: Piece[] = [];
  private readonly free: Piece[] = [];
  private readonly homes: Array<{ x: number; z: number; piece: Piece | null; wait: number }> = [];
  private readonly pile: Pile;
  private readonly batches: PieceBatches;
  private readonly sprites: Sprites;
  private readonly rng: Rng;
  private readonly hooks: DirectorHooks;
  private readonly homeRadius: number;
  private clock = 0;
  private lastClick = -10;
  private clickRate = 0;
  private combo = 0;
  private lastShape = 0;

  constructor(pile: Pile, batches: PieceBatches, sprites: Sprites, rng: Rng, hooks: DirectorHooks, homeRadius: number) {
    this.pile = pile;
    this.batches = batches;
    this.sprites = sprites;
    this.rng = rng;
    this.hooks = hooks;
    this.homeRadius = homeRadius;
    for (let i = 0; i < HOME_COUNT; i += 1) {
      const r = Math.sqrt((i + 0.5) / HOME_COUNT);
      const a = i * 2.39996;
      this.homes.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, piece: null, wait: i * 0.02 });
    }
  }

  get rapidness(): number {
    return clamp01((this.clickRate - 2.5) / 5.5);
  }

  get airborne(): number {
    return this.pieces.filter((piece) => piece.phase === 'fly').length;
  }

  private alloc(): Piece | null {
    let piece = this.free.pop();
    if (!piece) {
      if (this.pieces.length >= this.batches.capacityPerShape * FLAKE_SHAPES - FLAKE_SHAPES) return null;
      piece = {
        phase: 'idle',
        t: 0,
        shape: 0,
        home: -1,
        gain: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        flight: 0.5,
        quat: new THREE.Quaternion(),
        axis: new THREE.Vector3(0, 1, 0),
        spin: 0,
        scale: KERNEL_SCALE,
        flightScale: FLIGHT_SCALE,
        squashTime: 0,
        swellTime: 0,
        holdTime: 0,
        squashY: 1,
        popFrom: 0,
        pop: 0,
        glow: 0,
      };
      this.pieces.push(piece);
    }
    this.lastShape = (this.lastShape + 1 + this.rng.int(0, 3)) % FLAKE_SHAPES;
    piece.shape = this.lastShape;
    piece.t = 0;
    piece.home = -1;
    piece.gain = 0;
    piece.pop = 0;
    piece.glow = 0;
    piece.scale = KERNEL_SCALE;
    piece.quat
      .setFromAxisAngle(uniform.set(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).normalize(), this.rng.range(0, 6.28));
    return piece;
  }

  private release(piece: Piece): void {
    piece.phase = 'display';
    piece.scale = 0;
    this.free.push(piece);
  }

  /** Starts one manual pop. Runs synchronously inside the input event. */
  click(pointer: THREE.Ray | null, count: number, gainEach: number): void {
    const since = this.clock - this.lastClick;
    this.lastClick = this.clock;
    const instant = since > 0 ? Math.min(14, 1 / since) : 14;
    this.clickRate = lerp(this.clickRate, instant, 0.35);
    this.combo = since < COMBO_WINDOW ? this.combo + 1 : 0;
    for (let i = 0; i < count; i += 1) {
      const piece = this.takeKernel(pointer) ?? this.spawnEmergencyKernel(pointer);
      if (piece) this.charge(piece, gainEach, i * 0.016);
    }
    this.hooks.onSquash();
  }

  private takeKernel(pointer: THREE.Ray | null): Piece | null {
    let best: Piece | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const home of this.homes) {
      const piece = home.piece;
      if (!piece || (piece.phase !== 'idle' && piece.phase !== 'rise')) continue;
      const score = pointer
        ? pointer.distanceSqToPoint(piece.pos)
        : piece.pos.x * piece.pos.x + piece.pos.z * piece.pos.z + this.rng.next() * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = piece;
      }
    }
    return best;
  }

  private spawnEmergencyKernel(pointer: THREE.Ray | null): Piece | null {
    const piece = this.alloc();
    if (!piece) return null;
    let x = this.rng.range(-0.4, 0.4);
    let z = this.rng.range(-0.4, 0.4);
    if (pointer) {
      const y = this.pile.heightAt(0, 0);
      const t = (y - pointer.origin.y) / pointer.direction.y;
      if (Number.isFinite(t) && t > 0) {
        ray.copy(pointer).at(t, uniform);
        const r = Math.hypot(uniform.x, uniform.z);
        const limit = this.homeRadius / Math.max(r, this.homeRadius);
        x = uniform.x * limit;
        z = uniform.z * limit;
      }
    }
    piece.pos.set(x, this.pile.heightAt(x, z) + 0.1, z);
    piece.phase = 'idle';
    return piece;
  }

  private charge(piece: Piece, gain: number, delay: number): void {
    const rapid = this.rapidness;
    piece.phase = 'squash';
    piece.t = -delay;
    piece.gain = gain;
    piece.pop = 0;
    piece.scale = KERNEL_SCALE;
    piece.squashTime = lerp(tuning.squashMs, SQUASH_RAPID_MS, rapid) / 1000;
    piece.swellTime = lerp(SWELL_MS, SWELL_RAPID_MS, rapid) / 1000;
    piece.holdTime = lerp(tuning.hitstopMs, tuning.hitstopRapidMs, rapid) / 1000;
    if (piece.home >= 0) {
      this.homes[piece.home]!.piece = null;
      this.homes[piece.home]!.wait = 0.08 + this.rng.range(0, 0.08);
      piece.home = -1;
    }
    // Pressing registers on this very frame, even for the staggered extra kernels.
    if (delay === 0) piece.t = 1e-4;
  }

  /** A pop launched by a machine: it skips the charge and goes straight to the burst. */
  launch(x: number, y: number, z: number, gain: number, spread = 0.45): void {
    const piece = this.alloc();
    if (!piece) return;
    piece.pos.set(x, y, z);
    piece.gain = gain;
    piece.popFrom = 0;
    this.burst(piece, false, spread);
  }

  /** Static presentation copy for look-development captures. */
  display(shape: number, x: number, y: number, z: number, scale: number, pop: number, q: THREE.Quaternion): void {
    const piece = this.alloc();
    if (!piece) return;
    piece.phase = 'display';
    piece.shape = shape % FLAKE_SHAPES;
    piece.pos.set(x, y, z);
    piece.scale = scale;
    piece.pop = pop;
    piece.quat.copy(q);
  }

  private burst(piece: Piece, manual: boolean, spread: number): void {
    const rng = this.rng;
    piece.phase = 'fly';
    piece.t = 0;
    piece.popFrom = piece.pop;
    piece.glow = 1;
    piece.squashY = 1;
    // Fast clicking launches many at once, so each one gives up some size to stay readable.
    const size = manual ? lerp(FLIGHT_SCALE, RAPID_FLIGHT_SCALE, this.rapidness) : MACHINE_FLIGHT_SCALE;
    piece.flightScale = size * rng.range(0.92, 1.1);
    piece.scale = piece.flightScale;

    const level = this.pile.currentLevel;
    const reach = this.pile.shape.landingRadius(level);
    const angle = rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * reach;
    piece.targetX = Math.cos(angle) * radius + this.pile.shape.centerX;
    piece.targetZ = Math.sin(angle) * radius + this.pile.shape.centerZ;
    piece.targetY = this.pile.heightAt(piece.targetX, piece.targetZ);
    piece.flight = rng.range(0.5, 0.64) * lerp(1, 0.88, this.rapidness);
    const T = piece.flight;
    piece.vel.set(
      (piece.targetX - piece.pos.x) / T + rng.range(-spread, spread) * 0.1,
      (piece.targetY + 0.03 - piece.pos.y + 0.5 * GRAVITY * T * T) / T,
      (piece.targetZ - piece.pos.z) / T + rng.range(-spread, spread) * 0.1,
    );
    piece.axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    piece.spin = rng.range(7, 15) * rng.sign();

    this.burstEffects(piece, manual);
    this.hooks.onBurst(piece.pos, this.combo, piece.gain, manual);
  }

  private burstEffects(piece: Piece, manual: boolean): void {
    const rng = this.rng;
    const s = this.sprites;
    const { x, y, z } = piece.pos;
    s.spawn({ x, y, z, sizeStart: manual ? 1 : 0.4, sizeEnd: manual ? 1.5 : 0.6, life: 0.11, color: cream, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: rng.range(-3, 3) });
    if (!manual) return;
    s.spawn({ x, y, z, sizeStart: 0.28, sizeEnd: 0.85, life: 0.14, color: ember, alpha: 0.34, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 7; i += 1) {
      const a = rng.range(0, 6.28);
      const speed = rng.range(1.6, 3.8);
      s.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * speed,
        vy: rng.range(2.4, 5.6),
        vz: Math.sin(a) * speed,
        gravity: 20,
        drag: 0.6,
        sizeStart: rng.range(0.045, 0.08),
        sizeEnd: 0.026,
        life: rng.range(0.32, 0.55),
        color: hullColor,
        alpha: 1,
        kind: SpriteKind.Fleck,
        spin: rng.range(-12, 12),
      });
    }
    s.spawn({ x, y: y + 0.1, z, vy: 0.9, drag: 1.4, sizeStart: 0.26, sizeEnd: 0.85, life: 0.55, color: steamColor, alpha: 0.2, kind: SpriteKind.Puff, spin: rng.range(-1, 1) });
  }

  private landEffects(piece: Piece): void {
    const rng = this.rng;
    this.pile.impact(piece.pos.x, piece.pos.z, 0.55, 0.16 * tuning.landRadius);
    const count = 2;
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, 6.28);
      this.sprites.spawn({
        x: piece.pos.x,
        y: piece.pos.y + 0.03,
        z: piece.pos.z,
        vx: Math.cos(a) * 0.8,
        vy: rng.range(0.9, 1.6),
        vz: Math.sin(a) * 0.8,
        gravity: 9,
        sizeStart: 0.022,
        sizeEnd: 0.012,
        life: 0.26,
        color: crumbColor,
        alpha: 1,
        kind: SpriteKind.Drop,
      });
    }
  }

  update(deltaSeconds: number): void {
    const dt = deltaSeconds;
    this.clock += dt;
    if (this.clock - this.lastClick > 0.5) this.clickRate = Math.max(0, this.clickRate - dt * 10);
    if (this.clock - this.lastClick > COMBO_WINDOW) this.combo = 0;
    this.updateHomes(dt);
    this.batches.begin();
    for (const piece of this.pieces) {
      if (piece.scale <= 0) continue;
      this.updatePiece(piece, dt);
      if (piece.scale > 0) this.emit(piece);
    }
    this.batches.end();
  }

  private updateHomes(dt: number): void {
    const reach = this.homeRadius * clamp01(0.4 + this.pile.currentLevel * 3);
    this.homes.forEach((home, index) => {
      if (home.piece) return;
      home.wait -= dt;
      if (home.wait > 0) return;
      const piece = this.alloc();
      if (!piece) return;
      piece.phase = 'rise';
      piece.home = index;
      const x = home.x * reach;
      const z = home.z * reach;
      piece.pos.set(x, this.pile.heightAt(x, z) + 0.1, z);
      home.piece = piece;
    });
  }

  private updatePiece(p: Piece, dt: number): void {
    p.t += dt;
    switch (p.phase) {
      case 'rise':
      case 'idle': {
        const home = p.home >= 0 ? this.homes[p.home]! : null;
        if (home) {
          const reach = this.homeRadius * clamp01(0.4 + this.pile.currentLevel * 3);
          p.pos.x = home.x * reach;
          p.pos.z = home.z * reach;
        }
        p.pos.y = this.pile.heightAt(p.pos.x, p.pos.z) + 0.1;
        if (p.phase === 'rise' && p.t > 0.2) p.phase = 'idle';
        break;
      }
      case 'squash':
        if (p.t >= p.squashTime) {
          p.t -= p.squashTime;
          p.phase = 'swell';
        }
        break;
      case 'swell':
        if (p.t >= p.swellTime) {
          p.t -= p.swellTime;
          p.phase = 'hold';
        }
        break;
      case 'hold':
        if (p.t >= p.holdTime) {
          p.pop = POP_SWOLLEN;
          this.burst(p, true, 0.45);
        }
        break;
      case 'fly':
        this.updateFlight(p, dt);
        break;
      case 'land':
        if (p.t >= tuning.landSquashMs / 1000) {
          p.t = 0;
          p.phase = 'sink';
        }
        break;
      case 'sink':
        if (p.t >= 0.2) this.release(p);
        break;
      case 'display':
        break;
    }
  }

  private updateFlight(p: Piece, dt: number): void {
    const t = p.t;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.y += p.vel.y * dt - 0.5 * GRAVITY * dt * dt;
    p.vel.y -= GRAVITY * dt;
    p.quat.premultiply(spinQ.setFromAxisAngle(p.axis, p.spin * dt));
    p.glow = Math.exp(-t / 0.045);
    const arrival = clamp01((t / p.flight - 0.42) / 0.58);
    p.scale = lerp(p.flightScale, LANDED_SCALE, arrival * arrival * (3 - 2 * arrival));

    const burstTime = tuning.burstMs / 1000;
    const over = tuning.burstOvershoot;
    if (t < burstTime) {
      p.pop = lerp(p.popFrom, over, easeOutCubic(t / burstTime));
    } else {
      const after = t - burstTime;
      p.pop = 1 + (over - 1) * Math.exp(-after / 0.05) * Math.cos(after / 0.024);
    }

    if (t >= p.flight) {
      // Re-read the surface: the heap may have grown during the flight.
      p.pos.x = p.targetX;
      p.pos.z = p.targetZ;
      p.pos.y = this.pile.heightAt(p.targetX, p.targetZ) + 0.03;
      p.scale = LANDED_SCALE;
      p.pop = 1;
      p.glow = 0;
      p.phase = 'land';
      p.t = 0;
      this.landEffects(p);
      this.hooks.onLand(p.pos, p.gain);
    }
  }

  private emit(p: Piece): void {
    let sx = 1;
    let sy = 1;
    let shakeX = 0;
    let shakeZ = 0;
    let offsetY = 0;
    let scale = p.scale;
    let pop = p.pop;
    let glow = p.glow;
    const t = Math.max(0, p.t);

    switch (p.phase) {
      case 'rise': {
        scale *= easeOutBack(t / 0.2, 2.2);
        break;
      }
      case 'idle': {
        const sizzle = Math.sin(this.clock * 3.1 + p.pos.x * 40 + p.pos.z * 23);
        if (sizzle > 0.93) shakeX = Math.sin(this.clock * 70 + p.pos.z * 9) * 0.007;
        break;
      }
      case 'squash': {
        const u = easeOutCubic(t / p.squashTime);
        const y = tuning.squashY;
        // A first response that is visible on the very first frame.
        const press = Math.max(u, 0.34);
        sy = lerp(1, y, press);
        sx = lerp(1, 1 + (1 - y) * 0.62, press);
        offsetY = (sy - 1) * 0.1;
        shakeX = Math.sin(this.clock * 95 + p.shape) * 0.006 * u;
        shakeZ = Math.cos(this.clock * 83 + p.shape) * 0.006 * u;
        break;
      }
      case 'swell': {
        const u = easeOutCubic(t / p.swellTime);
        const y = tuning.squashY;
        sy = lerp(y, SWOLLEN_Y, u);
        sx = lerp(1 + (1 - y) * 0.62, SWOLLEN_XZ, u);
        offsetY = lerp((y - 1) * 0.1, 0.05, u);
        pop = POP_SWOLLEN * u;
        glow = u * 0.85;
        shakeX = Math.sin(this.clock * 120 + p.shape) * 0.012;
        shakeZ = Math.cos(this.clock * 107 + p.shape) * 0.012;
        break;
      }
      case 'hold': {
        sy = SWOLLEN_Y;
        sx = SWOLLEN_XZ;
        offsetY = 0.05;
        pop = POP_SWOLLEN;
        glow = 1;
        shakeX = Math.sin(this.clock * 150 + p.shape) * 0.016;
        shakeZ = Math.cos(this.clock * 137 + p.shape) * 0.016;
        break;
      }
      case 'fly': {
        const stretch = clamp01(1 - t / 0.09);
        sy = 1 + 0.22 * stretch;
        sx = 1 + 0.12 * stretch;
        break;
      }
      case 'land': {
        const u = clamp01(t / (tuning.landSquashMs / 1000));
        const wave = Math.exp(-u * 3.2) * Math.cos(u * 8);
        sy = 1 - 0.3 * wave;
        sx = 1 + 0.17 * wave;
        offsetY = -0.04 * u;
        break;
      }
      case 'sink': {
        const u = clamp01(t / 0.2);
        scale *= 1 - u * u;
        offsetY = -0.04 - 0.08 * u;
        break;
      }
      case 'display':
        break;
    }

    uniform.set(p.pos.x + shakeX, p.pos.y + offsetY, p.pos.z + shakeZ);
    m.makeTranslation(uniform);
    scaling.makeScale(sx, sy, sx);
    rotation.makeRotationFromQuaternion(p.quat);
    m.multiply(scaling).multiply(rotation);
    m.scale(uniform.setScalar(scale));
    this.batches.push(p.shape, m, pop, glow);
  }
}

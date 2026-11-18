import * as THREE from 'three';
import { clamp01, easeOutBack, easeOutCubic, lerp } from '../../motion/ease.ts';
import type { Rng } from '../../motion/rng.ts';
import { tuning } from '../../motion/tuning.ts';
import { SpriteKind, type Sprites } from '../fx/sprites.ts';
import { FLAKE_SHAPES } from '../geometry/popcorn.ts';
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
  popFrom: number;
  pop: number;
  glow: number;
  /** Counts down through a little idle hop. */
  idleHop: number;
}

export interface DirectorHooks {
  onSquash(): void;
  onBurst(position: THREE.Vector3, combo: number, gain: number, manual: boolean): void;
  onLand(position: THREE.Vector3, gain: number): void;
}

export interface LaunchOptions {
  gain?: number;
  /** Seconds in the air; longer means a higher arc. */
  flight?: number;
  scale?: number;
  /** Aim this far beyond the normal landing zone. */
  reach?: number;
  quiet?: boolean;
}

// All of these are in stove units and multiplied by the scene's k.
const KERNEL_SCALE = 0.36;
const FLIGHT_SCALE = 0.44;
const RAPID_FLIGHT_SCALE = 0.31;
const MACHINE_FLIGHT_SCALE = 0.3;
const LANDED_SCALE = 0.23;
const GRAVITY = 30;
const HOPPER_SCALE = 0.42;

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
const sparkColor = new THREE.Color(2.2, 1.7, 0.7);

const m = new THREE.Matrix4();
const rotation = new THREE.Matrix4();
const scaling = new THREE.Matrix4();
const v = new THREE.Vector3();
const spinQ = new THREE.Quaternion();

/** Runs the whole life of a kernel: seated, squashed, swollen, burst, airborne, landed, absorbed. */
export class PopDirector {
  readonly hopperPosition = new THREE.Vector3();
  hopperVisible = false;
  private readonly pieces: Piece[] = [];
  private readonly free: Piece[] = [];
  private readonly homes: Array<{ x: number; z: number; piece: Piece | null; wait: number }> = [];
  private readonly pile: Pile;
  private readonly batches: PieceBatches;
  private readonly sprites: Sprites;
  private readonly rng: Rng;
  private readonly hooks: DirectorHooks;
  private readonly homeRadius: number;
  private readonly k: number;
  private clock = 0;
  private lastClick = -10;
  private clickRate = 0;
  private combo = 0;
  private lastShape = 0;
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private hopT = 1;
  private hopDuration = 0.5;
  private sparkTimer = 0;
  private readonly hopperQuat = new THREE.Quaternion();

  constructor(pile: Pile, batches: PieceBatches, sprites: Sprites, rng: Rng, hooks: DirectorHooks, homeRadius: number) {
    this.pile = pile;
    this.batches = batches;
    this.sprites = sprites;
    this.rng = rng;
    this.hooks = hooks;
    this.homeRadius = homeRadius;
    this.k = pile.shape.k;
    for (let i = 0; i < HOME_COUNT; i += 1) {
      const r = Math.sqrt((i + 0.5) / HOME_COUNT);
      const a = i * 2.39996;
      this.homes.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, piece: null, wait: i * 0.02 });
    }
  }

  get rapidness(): number {
    return clamp01((this.clickRate - 2.5) / 5.5);
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
        targetZ: 0,
        flight: 0.5,
        quat: new THREE.Quaternion(),
        axis: new THREE.Vector3(0, 1, 0),
        spin: 0,
        scale: 0,
        flightScale: 0,
        squashTime: 0,
        swellTime: 0,
        holdTime: 0,
        popFrom: 0,
        pop: 0,
        glow: 0,
        idleHop: 0,
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
    piece.idleHop = 0;
    piece.scale = KERNEL_SCALE * this.k;
    piece.quat.setFromAxisAngle(v.set(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).normalize(), this.rng.range(0, 6.28));
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
      const piece = this.takeKernel(pointer) ?? this.spawnEmergencyKernel();
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
      v.copy(piece.pos).applyMatrix4(this.batches.group.matrixWorld);
      const score = pointer ? pointer.distanceSqToPoint(v) : this.rng.next();
      if (score < bestScore) {
        bestScore = score;
        best = piece;
      }
    }
    return best;
  }

  private spawnEmergencyKernel(): Piece | null {
    const piece = this.alloc();
    if (!piece) return null;
    const a = this.rng.range(0, 6.28);
    const r = Math.sqrt(this.rng.next()) * this.homeRadius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    piece.pos.set(x, this.pile.heightAt(x, z) + 0.1 * this.k, z);
    piece.phase = 'idle';
    return piece;
  }

  private charge(piece: Piece, gain: number, delay: number): void {
    const rapid = this.rapidness;
    piece.phase = 'squash';
    piece.gain = gain;
    piece.pop = 0;
    piece.scale = KERNEL_SCALE * this.k;
    piece.squashTime = lerp(tuning.squashMs, SQUASH_RAPID_MS, rapid) / 1000;
    piece.swellTime = lerp(SWELL_MS, SWELL_RAPID_MS, rapid) / 1000;
    piece.holdTime = lerp(tuning.hitstopMs, tuning.hitstopRapidMs, rapid) / 1000;
    // The first kernel registers on this very frame; extra ones ripple right after it.
    piece.t = delay === 0 ? 1e-4 : -delay;
    if (piece.home >= 0) {
      const home = this.homes[piece.home]!;
      home.piece = null;
      home.wait = 0.08 + this.rng.range(0, 0.08);
      piece.home = -1;
    }
  }

  /** A pop launched by a machine or a blast: it skips the charge and goes straight to the burst. */
  launch(x: number, y: number, z: number, options: LaunchOptions = {}): void {
    const piece = this.alloc();
    if (!piece) return;
    piece.pos.set(x, y, z);
    piece.gain = options.gain ?? 0;
    piece.popFrom = 0;
    this.burst(piece, false, options);
  }

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

  private burst(piece: Piece, manual: boolean, options: LaunchOptions = {}): void {
    const rng = this.rng;
    const k = this.k;
    piece.phase = 'fly';
    piece.t = 0;
    piece.popFrom = piece.pop;
    piece.glow = 1;
    const size = manual ? lerp(FLIGHT_SCALE, RAPID_FLIGHT_SCALE, this.rapidness) : (options.scale ?? MACHINE_FLIGHT_SCALE);
    piece.flightScale = size * k * rng.range(0.92, 1.1);
    piece.scale = piece.flightScale;

    const shape = this.pile.shape;
    const reach = shape.landingRadius(this.pile.currentLevel) * (options.reach ?? 1);
    const angle = rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * reach;
    piece.targetX = Math.cos(angle) * radius + shape.centerX;
    piece.targetZ = Math.sin(angle) * radius + shape.centerZ;
    const targetY = this.pile.heightAt(piece.targetX, piece.targetZ);
    piece.flight = options.flight ?? rng.range(0.5, 0.64) * lerp(1, 0.88, this.rapidness);
    const T = piece.flight;
    const g = GRAVITY * k;
    piece.vel.set(
      (piece.targetX - piece.pos.x) / T,
      (targetY + 0.03 * k - piece.pos.y + 0.5 * g * T * T) / T,
      (piece.targetZ - piece.pos.z) / T,
    );
    piece.axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    piece.spin = rng.range(7, 15) * rng.sign();
    if (!options.quiet) this.burstEffects(piece, manual);
    this.hooks.onBurst(piece.pos, this.combo, piece.gain, manual);
  }

  private burstEffects(piece: Piece, manual: boolean): void {
    const rng = this.rng;
    const s = this.sprites;
    const k = this.k;
    const { x, y, z } = piece.pos;
    s.spawn({ x, y, z, sizeStart: (manual ? 1 : 0.4) * k, sizeEnd: (manual ? 1.5 : 0.6) * k, life: 0.11, color: cream, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: rng.range(-3, 3) });
    if (!manual) return;
    s.spawn({ x, y, z, sizeStart: 0.28 * k, sizeEnd: 0.85 * k, life: 0.14, color: ember, alpha: 0.34, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 7; i += 1) {
      const a = rng.range(0, 6.28);
      const speed = rng.range(1.6, 3.8) * k;
      s.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * speed,
        vy: rng.range(2.4, 5.6) * k,
        vz: Math.sin(a) * speed,
        gravity: 20 * k,
        drag: 0.6,
        sizeStart: rng.range(0.045, 0.08) * k,
        sizeEnd: 0.026 * k,
        life: rng.range(0.32, 0.55),
        color: hullColor,
        alpha: 1,
        kind: SpriteKind.Fleck,
        spin: rng.range(-12, 12),
      });
    }
    s.spawn({ x, y: y + 0.1 * k, z, vy: 0.9 * k, drag: 1.4, sizeStart: 0.26 * k, sizeEnd: 0.85 * k, life: 0.55, color: steamColor, alpha: 0.2, kind: SpriteKind.Puff, spin: rng.range(-1, 1) });
  }

  private landEffects(piece: Piece): void {
    const rng = this.rng;
    const k = this.k;
    this.pile.impact(piece.pos.x, piece.pos.z, 0.55, 0.16 * tuning.landRadius * k);
    for (let i = 0; i < 2; i += 1) {
      const a = rng.range(0, 6.28);
      this.sprites.spawn({
        x: piece.pos.x,
        y: piece.pos.y + 0.03 * k,
        z: piece.pos.z,
        vx: Math.cos(a) * 0.8 * k,
        vy: rng.range(0.9, 1.6) * k,
        vz: Math.sin(a) * 0.8 * k,
        gravity: 9 * k,
        sizeStart: 0.022 * k,
        sizeEnd: 0.012 * k,
        life: 0.26,
        color: crumbColor,
        alpha: 1,
        kind: SpriteKind.Drop,
      });
    }
  }

  // Hopping kernel ------------------------------------------------------------

  showHopper(): void {
    this.hopperVisible = true;
    const p = this.randomOnHeap(v);
    this.hopperPosition.copy(p);
    this.hopFrom.copy(p);
    this.hopTo.copy(p);
    this.hopT = 1;
  }

  hideHopper(caught: boolean): void {
    if (this.hopperVisible && caught) {
      const { x, y, z } = this.hopperPosition;
      for (let i = 0; i < 26; i += 1) {
        const a = this.rng.range(0, 6.28);
        const s = this.rng.range(1.6, 5) * this.k;
        this.sprites.spawn({
          x,
          y,
          z,
          vx: Math.cos(a) * s,
          vy: this.rng.range(1, 6) * this.k,
          vz: Math.sin(a) * s,
          gravity: 12 * this.k,
          sizeStart: this.rng.range(0.1, 0.2) * this.k,
          sizeEnd: 0.02 * this.k,
          life: this.rng.range(0.4, 0.8),
          color: sparkColor,
          alpha: 1,
          additive: 1,
          kind: SpriteKind.Star,
          spin: this.rng.range(-6, 6),
        });
      }
    }
    this.hopperVisible = false;
  }

  private randomOnHeap(out: THREE.Vector3): THREE.Vector3 {
    const shape = this.pile.shape;
    const a = this.rng.range(0, 6.28);
    const r = Math.sqrt(this.rng.next()) * Math.max(shape.landingRadius(this.pile.currentLevel), this.homeRadius);
    const x = shape.centerX + Math.cos(a) * r;
    const z = shape.centerZ + Math.sin(a) * r;
    return out.set(x, this.pile.heightAt(x, z) + 0.14 * this.k, z);
  }

  private updateHopper(dt: number): void {
    if (!this.hopperVisible) return;
    this.hopT += dt / this.hopDuration;
    if (this.hopT >= 1) {
      this.hopFrom.copy(this.hopTo);
      this.randomOnHeap(this.hopTo);
      this.hopT = 0;
      this.hopDuration = this.rng.range(0.42, 0.62);
    }
    const t = this.hopT;
    this.hopperPosition.lerpVectors(this.hopFrom, this.hopTo, t);
    this.hopperPosition.y += Math.sin(t * Math.PI) * 1.05 * this.k;
    this.hopperQuat.premultiply(spinQ.setFromAxisAngle(v.set(0.5, 0.2, 0.8).normalize(), dt * 9));
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.05;
      const { x, y, z } = this.hopperPosition;
      this.sprites.spawn({ x, y, z, vy: 0.4 * this.k, sizeStart: 0.2 * this.k, sizeEnd: 0.02 * this.k, life: 0.42, color: sparkColor, alpha: 0.9, additive: 1, kind: SpriteKind.Star, spin: 3 });
    }
    const pulse = 0.55 + 0.45 * Math.sin(this.clock * 12);
    const squash = 1 + Math.sin(t * Math.PI * 2) * 0.14;
    m.makeTranslation(this.hopperPosition);
    scaling.makeScale(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    rotation.makeRotationFromQuaternion(this.hopperQuat);
    m.multiply(scaling).multiply(rotation);
    m.scale(v.setScalar(HOPPER_SCALE * this.k));
    this.batches.push(0, m, 0, pulse);
  }

  // Frame update ----------------------------------------------------------------

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
    this.updateHopper(dt);
    this.batches.end();
  }

  private homeReach(): number {
    return this.homeRadius * clamp01(0.4 + this.pile.currentLevel * 3);
  }

  private updateHomes(dt: number): void {
    const reach = this.homeReach();
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
      piece.pos.set(x, this.pile.heightAt(x, z) + 0.1 * this.k, z);
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
          const reach = this.homeReach();
          p.pos.x = home.x * reach;
          p.pos.z = home.z * reach;
        }
        p.pos.y = this.pile.heightAt(p.pos.x, p.pos.z) + 0.1 * this.k;
        if (p.phase === 'rise' && p.t > 0.2) p.phase = 'idle';
        // Waiting kernels can't quite sit still in the heat.
        p.idleHop = Math.max(0, p.idleHop - dt * 2.8);
        if (p.phase === 'idle' && p.idleHop === 0 && this.rng.next() < dt * 0.09) p.idleHop = 1;
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
          this.burst(p, true);
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
    const g = GRAVITY * this.k;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.y += p.vel.y * dt - 0.5 * g * dt * dt;
    p.vel.y -= g * dt;
    p.quat.premultiply(spinQ.setFromAxisAngle(p.axis, p.spin * dt));
    p.glow = Math.exp(-t / 0.045);
    const arrival = clamp01((t / p.flight - 0.42) / 0.58);
    p.scale = lerp(p.flightScale, LANDED_SCALE * this.k, arrival * arrival * (3 - 2 * arrival));

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
      p.pos.y = this.pile.heightAt(p.targetX, p.targetZ) + 0.03 * this.k;
      p.scale = LANDED_SCALE * this.k;
      p.pop = 1;
      p.glow = 0;
      p.phase = 'land';
      p.t = 0;
      this.landEffects(p);
      this.hooks.onLand(p.pos, p.gain);
    }
  }

  private emit(p: Piece): void {
    const k = this.k;
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
      case 'rise':
        scale *= easeOutBack(t / 0.2, 2.2);
        break;
      case 'idle': {
        const sizzle = Math.sin(this.clock * 3.1 + p.pos.x * 40 + p.pos.z * 23);
        if (sizzle > 0.93) shakeX = Math.sin(this.clock * 70 + p.pos.z * 9) * 0.007 * k;
        const arc = 4 * p.idleHop * (1 - p.idleHop);
        offsetY = arc * 0.2 * k;
        sy = 1 + arc * 0.14;
        sx = 1 - arc * 0.07;
        break;
      }
      case 'squash': {
        const u = easeOutCubic(t / p.squashTime);
        const y = tuning.squashY;
        // A first response that is visible on the very first frame.
        const press = Math.max(u, 0.34);
        sy = lerp(1, y, press);
        sx = lerp(1, 1 + (1 - y) * 0.62, press);
        offsetY = (sy - 1) * 0.1 * k;
        shakeX = Math.sin(this.clock * 95 + p.shape) * 0.006 * u * k;
        shakeZ = Math.cos(this.clock * 83 + p.shape) * 0.006 * u * k;
        break;
      }
      case 'swell': {
        const u = easeOutCubic(t / p.swellTime);
        const y = tuning.squashY;
        sy = lerp(y, SWOLLEN_Y, u);
        sx = lerp(1 + (1 - y) * 0.62, SWOLLEN_XZ, u);
        offsetY = lerp((y - 1) * 0.1, 0.05, u) * k;
        pop = POP_SWOLLEN * u;
        glow = u * 0.85;
        shakeX = Math.sin(this.clock * 120 + p.shape) * 0.012 * k;
        shakeZ = Math.cos(this.clock * 107 + p.shape) * 0.012 * k;
        break;
      }
      case 'hold':
        sy = SWOLLEN_Y;
        sx = SWOLLEN_XZ;
        offsetY = 0.05 * k;
        pop = POP_SWOLLEN;
        glow = 1;
        shakeX = Math.sin(this.clock * 150 + p.shape) * 0.016 * k;
        shakeZ = Math.cos(this.clock * 137 + p.shape) * 0.016 * k;
        break;
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
        offsetY = -0.04 * u * k;
        break;
      }
      case 'sink': {
        const u = clamp01(t / 0.2);
        scale *= 1 - u * u;
        offsetY = (-0.04 - 0.08 * u) * k;
        break;
      }
      case 'display':
        break;
    }

    v.set(p.pos.x + shakeX, p.pos.y + offsetY, p.pos.z + shakeZ);
    m.makeTranslation(v);
    scaling.makeScale(sx, sy, sx);
    rotation.makeRotationFromQuaternion(p.quat);
    m.multiply(scaling).multiply(rotation);
    m.scale(v.setScalar(scale));
    this.batches.push(p.shape, m, pop, glow);
  }
}

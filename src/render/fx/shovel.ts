import * as THREE from 'three';
import { clamp01, easeInCubic, easeOutCubic, lerp } from '../../motion/ease.ts';
import type { Rng } from '../../motion/rng.ts';
import { globals } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { at, Kit, P } from '../geometry/kit.ts';
import { ToyRig } from '../geometry/rig.ts';
import { SpriteKind, type Sprites } from './sprites.ts';

const DURATION = 0.72;
const DIP_AT = 0.3;
const LIFT_AT = 0.42;

function scoopGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  // A deep double-walled bowl: out along the underside, over the rim, back down the inside.
  const profile: Array<[number, number]> = [];
  const STEPS = 12;
  const RIM = 1.72;
  for (let i = 0; i <= STEPS; i += 1) {
    const a = (i / STEPS) * RIM;
    profile.push([Math.sin(a) * 0.62, -Math.cos(a) * 0.62]);
  }
  for (let i = STEPS; i >= 0; i -= 1) {
    const a = (i / STEPS) * RIM;
    profile.push([Math.sin(a) * 0.57, -Math.cos(a) * 0.57]);
  }
  kit.add(P.lathe(profile, 36, 0.01, 1), { color: '#c9d6e2', gloss: 1, matrix: at(0, 0, 0, [0, 0, 0], [1.05, 0.72, 1.3]) });
  // The handle starts at the rim and rises away from the bowl.
  kit.add(P.capsule(0.075, 2.5, 4, 12), { color: '#b06a35', gloss: 0.4, matrix: at(0, 0.72, -1.92, [-1.08, 0, 0]) });
  kit.add(P.box(0.15, 0.09, 0.42, 0.03, 2), { color: '#9aa8b7', gloss: 0.9, matrix: at(0, 0.14, -0.8, [-0.5, 0, 0]) });
  return kit.build();
}

function loadGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const lumps: Array<[number, number, number, number]> = [
    [0, 0.08, 0, 0.3],
    [0.26, 0.05, 0.2, 0.2],
    [-0.27, 0.04, 0.14, 0.21],
    [0.2, 0.05, -0.28, 0.2],
    [-0.2, 0.06, -0.26, 0.19],
    [0.02, 0.2, 0.26, 0.17],
    [0.04, 0.24, -0.1, 0.18],
  ];
  for (const [x, y, z, r] of lumps) kit.add(P.sphere(r, 12, 9), { color: '#fff2d2', gloss: 0.15, matrix: at(x, y, z) });
  return kit.build();
}

/** The big shovel that takes payment out of the heap. */
export class Shovel {
  private readonly group: THREE.Group;
  private readonly load: THREE.Group;
  private readonly sprites: Sprites;
  private readonly rng: Rng;
  private readonly crumb = new THREE.Color('#ffe9bd');
  private t = -1;
  private dug = false;
  private strength = 1;
  private readonly spot = new THREE.Vector3();
  private onDig: ((x: number, z: number, strength: number) => void) | null = null;
  private readonly k: number;

  constructor(stage: Stage, parent: THREE.Object3D, sprites: Sprites, rng: Rng, k: number) {
    this.k = k;
    const rig = new ToyRig();
    this.group = rig.part(parent, scoopGeometry());
    this.load = rig.part(this.group, loadGeometry());
    rig.build(stage, parent, globals.uTime);
    this.load.visible = false;
    this.group.visible = false;
    this.group.scale.setScalar(0.92 * k);
    this.sprites = sprites;
    this.rng = rng;
  }

  hide(): void {
    this.t = -1;
    this.group.visible = false;
  }

  get active(): boolean {
    return this.t >= 0;
  }

  /** Restarting mid-swing is fine: purchases must never wait for the animation. */
  scoop(x: number, y: number, z: number, strength: number, onDig: (x: number, z: number, strength: number) => void): void {
    if (this.t >= 0 && this.t < DIP_AT) {
      this.strength = Math.max(this.strength, strength);
      return;
    }
    this.spot.set(x, y, z);
    this.strength = strength;
    this.onDig = onDig;
    this.t = 0;
    this.dug = false;
    this.group.visible = true;
    this.load.visible = false;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const u = this.t / DURATION;
    const { x, y, z } = this.spot;
    const g = this.group;
    const k = this.k;
    if (u < DIP_AT) {
      const e = easeInCubic(u / DIP_AT);
      g.position.set(lerp(x + 3.4 * k, x, e), lerp(y + 3.6 * k, y + 0.06 * k, e), lerp(z + 2.6 * k, z, e));
      g.rotation.set(lerp(-0.2, 0.5, e), 2.5, lerp(0.5, -0.1, e));
    } else if (u < LIFT_AT) {
      const e = (u - DIP_AT) / (LIFT_AT - DIP_AT);
      g.position.set(x, y + (0.06 - Math.sin(e * Math.PI) * 0.12) * k, z);
      g.rotation.set(lerp(0.5, -0.1, e), 2.5, -0.1);
      if (!this.dug) {
        this.dug = true;
        this.load.visible = true;
        this.onDig?.(x, z, this.strength);
        this.burst();
      }
    } else {
      const e = easeOutCubic(clamp01((u - LIFT_AT) / (1 - LIFT_AT)));
      g.position.set(lerp(x, x + 3.2 * k, e * e), lerp(y + 0.06 * k, y + 4.2 * k, e), lerp(z, z + 2.2 * k, e * e));
      g.rotation.set(lerp(-0.1, -0.45, e), 2.5, lerp(-0.1, 0.4, e));
    }
    if (u >= 1) {
      this.t = -1;
      g.visible = false;
    }
  }

  private burst(): void {
    const r = this.rng;
    const k = this.k;
    for (let i = 0; i < 12; i += 1) {
      const a = r.range(0, 6.28);
      const s = r.range(0.8, 2.3) * k;
      this.sprites.spawn({
        x: this.spot.x,
        y: this.spot.y + 0.12 * k,
        z: this.spot.z,
        vx: Math.cos(a) * s,
        vy: r.range(1.8, 3.8) * k,
        vz: Math.sin(a) * s,
        gravity: 14 * k,
        sizeStart: r.range(0.05, 0.1) * k,
        sizeEnd: 0.03 * k,
        life: r.range(0.3, 0.5),
        color: this.crumb,
        alpha: 1,
        kind: SpriteKind.Fleck,
        spin: r.range(-8, 8),
      });
    }
  }
}

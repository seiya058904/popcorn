import * as THREE from 'three';
import type { CannonResult } from '../events/game-events.ts';
import { Spring } from '../motion/ease.ts';
import type { Rng } from '../motion/rng.ts';
import { globals } from './core/globals.ts';
import type { Stage } from './core/stage.ts';
import { SpriteKind, type Sprites } from './fx/sprites.ts';
import { ToyRig } from './geometry/rig.ts';
import type { PopDirector } from './popcorn/director.ts';
import type { HeroCannonPose } from './scenes/types.ts';
import { cannonCap, cannonDrum, cannonFrame } from './units.ts';

const TILT = 0.5;
const flashColor = new THREE.Color(2.6, 1.9, 1);
const smokeColor = new THREE.Color(0.5, 0.46, 0.46);
const steamColor = new THREE.Color(0.95, 0.92, 0.9);
const emberColor = new THREE.Color(2.8, 1.1, 0.25);

const v = new THREE.Vector3();
const dir = new THREE.Vector3();

/** The big cannon the player fires. Charge spins it up; release is the loudest thing in the room. */
export class HeroCannon {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly drum: THREE.Group;
  private readonly cap: THREE.Group;
  private readonly sprites: Sprites;
  private readonly director: PopDirector;
  private readonly rng: Rng;
  private readonly size: number;
  private readonly recoil = new Spring(0, 150, 13);
  private charge = 0;
  private charging = false;
  private spin = 0;
  private spinSpeed = 1.2;
  private steamTimer = 0;
  private time = 0;
  private capT = -1;
  private readonly capVel = new THREE.Vector3();
  private capSpin = 0;

  constructor(stage: Stage, parent: THREE.Object3D, pose: HeroCannonPose, sprites: Sprites, director: PopDirector, rng: Rng) {
    this.sprites = sprites;
    this.director = director;
    this.rng = rng;
    this.size = pose.scale;
    this.group.position.copy(pose.position);
    this.group.rotation.y = pose.rotation;
    this.group.scale.setScalar(pose.scale);
    parent.add(this.group);
    // Frame, drum and cap move separately but are drawn together.
    const rig = new ToyRig();
    rig.part(this.group, cannonFrame());
    this.pivot.position.y = 1.42;
    this.pivot.rotation.z = TILT;
    this.group.add(this.pivot);
    this.drum = rig.part(this.pivot, cannonDrum());
    this.cap = rig.part(this.pivot, cannonCap());
    rig.build(stage, parent, globals.uTime);
    this.resetCap();
  }

  private resetCap(): void {
    this.capT = -1;
    this.pivot.add(this.cap);
    this.cap.position.set(1.09, 0, 0);
    this.cap.rotation.set(0, 0, -Math.PI / 2);
    this.cap.scale.setScalar(1);
  }

  setCharge(charge: number, charging: boolean): void {
    this.charge = charge;
    this.charging = charging;
  }

  muzzle(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.pivot.localToWorld(out.set(1.3, 0, 0));
  }

  fire(result: CannonResult): void {
    const muzzle = this.muzzle(new THREE.Vector3());
    this.pivot.getWorldDirection(dir);
    dir.set(1, 0, 0).transformDirection(this.pivot.matrixWorld);
    if (result === 'overpressure') this.popCap(muzzle);
    else this.blast(muzzle, result === 'perfect');
    this.recoil.kick(result === 'overpressure' ? 2.4 : 6);
  }

  private blast(muzzle: THREE.Vector3, perfect: boolean): void {
    const s = this.size;
    const { x, y, z } = muzzle;
    const sprites = this.sprites;
    const rng = this.rng;
    sprites.spawn({ x, y, z, sizeStart: 2.4 * s, sizeEnd: 3.6 * s, life: 0.14, color: flashColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: rng.range(-3, 3) });
    sprites.spawn({ x, y, z, sizeStart: 0.6 * s, sizeEnd: 4.4 * s, life: 0.3, color: flashColor, alpha: 0.6, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 14; i += 1) {
      const speed = rng.range(1.5, 6) * s;
      sprites.spawn({
        x,
        y,
        z,
        vx: dir.x * speed + rng.range(-1, 1) * s,
        vy: dir.y * speed + rng.range(-0.5, 1.4) * s,
        vz: dir.z * speed + rng.range(-1, 1) * s,
        drag: 2.2,
        sizeStart: rng.range(0.4, 0.8) * s,
        sizeEnd: rng.range(1.2, 2.1) * s,
        life: rng.range(0.7, 1.3),
        color: smokeColor,
        alpha: 0.3,
        kind: SpriteKind.Puff,
        spin: rng.range(-1, 1),
      });
    }
    // Hot sparks streak out along the barrel.
    for (let i = 0; i < (perfect ? 18 : 10); i += 1) {
      const speed = rng.range(6, 14) * s;
      sprites.spawn({ x, y, z, vx: dir.x * speed + rng.range(-2, 2) * s, vy: dir.y * speed + rng.range(-1, 3) * s, vz: dir.z * speed + rng.range(-2, 2) * s, gravity: 10 * s, drag: 1.2, sizeStart: 0.14 * s, sizeEnd: 0.05 * s, life: rng.range(0.3, 0.6), color: emberColor, alpha: 1.3, additive: 1, kind: SpriteKind.Spark });
    }
    const count = perfect ? 30 : 18;
    for (let i = 0; i < count; i += 1) {
      this.director.launch(x, y, z, { flight: rng.range(0.75, 1.15), scale: rng.range(0.32, 0.5), reach: 1.25, quiet: i > 3 });
    }
  }

  private popCap(muzzle: THREE.Vector3): void {
    const s = this.size;
    const rng = this.rng;
    this.group.parent!.attach(this.cap);
    this.capT = 0;
    this.capVel.copy(dir).multiplyScalar(5 * s).add(v.set(rng.range(-1, 1) * s, 9 * s, 0));
    this.capSpin = rng.range(9, 14);
    for (let i = 0; i < 12; i += 1) {
      const a = rng.range(0, 6.28);
      this.sprites.spawn({
        x: muzzle.x,
        y: muzzle.y,
        z: muzzle.z,
        vx: Math.cos(a) * rng.range(0.4, 2) * s,
        vy: rng.range(0.8, 3) * s,
        vz: Math.sin(a) * rng.range(0.4, 2) * s,
        drag: 1.5,
        sizeStart: 0.4 * s,
        sizeEnd: 1.3 * s,
        life: rng.range(0.7, 1.2),
        color: steamColor,
        alpha: 0.32,
        kind: SpriteKind.Puff,
        spin: rng.range(-1, 1),
      });
    }
    // A few sad kernels fall out rather than fly.
    for (let i = 0; i < 4; i += 1) this.director.launch(muzzle.x, muzzle.y, muzzle.z, { flight: 0.5, scale: 0.26, quiet: true });
  }

  update(dt: number, cooling: boolean): void {
    this.time += dt;
    const c = this.charge;
    const target = this.charging ? 4 + c * c * 34 : cooling ? 0.5 : 1.2;
    this.spinSpeed += (target - this.spinSpeed) * (1 - Math.exp(-dt * (this.charging ? 9 : 2.5)));
    this.spin += this.spinSpeed * dt;
    this.drum.rotation.x = this.spin;
    const recoil = this.recoil.update(dt);
    const tremble = this.charging ? c * c * 0.03 : 0;
    this.pivot.position.set(-recoil * 0.1 + Math.sin(this.time * 83) * tremble, 1.42 + Math.cos(this.time * 71) * tremble, Math.sin(this.time * 67) * tremble);
    this.pivot.rotation.z = TILT + recoil * 0.05;
    this.group.scale.y = this.size * (1 - Math.max(0, recoil) * 0.018 + (this.charging ? c * 0.02 : 0));

    if (this.charging) {
      this.steamTimer -= dt * (1 + c * 9);
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.22;
        this.muzzle(v);
        const r = this.rng;
        this.sprites.spawn({ x: v.x, y: v.y, z: v.z, vx: r.range(-0.3, 0.3) * this.size, vy: r.range(0.6, 1.4) * this.size, vz: r.range(-0.3, 0.3) * this.size, drag: 1.2, sizeStart: 0.16 * this.size, sizeEnd: 0.6 * this.size, life: 0.6, color: steamColor, alpha: 0.24, kind: SpriteKind.Puff, spin: 1 });
        if (c > 0.72) {
          this.sprites.spawn({ x: v.x, y: v.y, z: v.z, vx: r.range(-1, 1) * this.size, vy: r.range(0.5, 2) * this.size, vz: r.range(-1, 1) * this.size, gravity: 6 * this.size, sizeStart: 0.05 * this.size, sizeEnd: 0.01, life: 0.35, color: emberColor, alpha: 1, additive: 1, kind: SpriteKind.Drop });
        }
      }
    }

    if (this.capT >= 0) {
      this.capT += dt;
      this.capVel.y -= 16 * this.size * dt;
      this.cap.position.addScaledVector(this.capVel, dt);
      this.cap.rotateX(this.capSpin * dt);
      this.cap.rotateZ(this.capSpin * 0.6 * dt);
      if (this.capT > 2.4) this.resetCap();
    }
  }
}

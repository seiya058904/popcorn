import * as THREE from 'three';
import type { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { at, Kit, P } from '../geometry/kit.ts';
import { PartRig } from '../geometry/rig.ts';

function birdBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(0.5, 14, 10), { color: '#9aa6bd', gloss: 0.25, matrix: at(0, 0, 0, [0, 0, 0], [1.25, 0.82, 0.8]) });
  kit.add(P.sphere(0.27, 12, 9), { color: '#7f8cab', gloss: 0.4, matrix: at(0.55, 0.32, 0) });
  kit.add(P.sphere(0.2, 10, 7), { color: '#a879a8', gloss: 0.5, outline: 0, matrix: at(0.36, 0.1, 0, [0, 0, 0], [1, 1.2, 1.75]) });
  kit.add(P.capsule(0.05, 0.14, 2, 6), { color: '#f1a93a', gloss: 0.5, matrix: at(0.84, 0.3, 0, [0, 0, Math.PI / 2]) });
  kit.add(P.sphere(0.042, 6, 5), { color: '#16121a', gloss: 0.9, outline: 0, matrix: at(0.66, 0.42, 0.2) });
  kit.add(P.sphere(0.042, 6, 5), { color: '#16121a', gloss: 0.9, outline: 0, matrix: at(0.66, 0.42, -0.2) });
  kit.add(P.box(0.5, 0.06, 0.32, 0.03, 1), { color: '#6f7a97', gloss: 0.2, matrix: at(-0.72, 0.02, 0) });
  return kit.build();
}

function birdWing(): THREE.BufferGeometry {
  const kit = new Kit();
  // Root at the origin, reaching along +Z.
  kit.add(P.sphere(0.5, 10, 7), { color: '#8894af', gloss: 0.2, matrix: at(0, 0, 0.42, [0, 0, 0], [0.62, 0.1, 0.9]) });
  return kit.build();
}

interface Bird {
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  state: 'perched' | 'fleeing' | 'returning';
  t: number;
  delay: number;
  heading: number;
  flap: number;
}

const m = new THREE.Matrix4();
const child = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

const bounds = new THREE.Box3();
const sphere = new THREE.Sphere();

/** The pigeons every cannon shot sends flying. They always come back, a little warily. */
export class Flock {
  /** Parts: body, then the two wings. */
  private readonly rig: PartRig;
  private readonly birds: Bird[];
  private readonly rng: Rng;
  private readonly size: number;
  private time = 0;

  constructor(stage: Stage, parent: THREE.Object3D, perches: THREE.Vector3[], size: number, rng: Rng) {
    this.rng = rng;
    this.size = size;
    this.rig = new PartRig(stage, parent, [{ geometry: birdBody() }, { geometry: birdWing() }, { geometry: birdWing() }], perches.length);
    this.birds = perches.map((home) => ({
      home,
      pos: home.clone(),
      vel: new THREE.Vector3(),
      state: 'perched',
      t: 0,
      delay: 0,
      heading: rng.range(0, 6.28),
      flap: rng.range(0, 6),
    }));
  }

  private hidden = false;

  /** Birds stay out of shot while the camera sweeps past their perches. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.rig.commit(0);
  }

  /** True while every bird sits on its perch. */
  get settled(): boolean {
    return this.birds.every((bird) => bird.state === 'perched');
  }

  /** Where the birds sit, in their scene's space. */
  get perches(): THREE.Vector3[] {
    return this.birds.map((bird) => bird.home);
  }

  scare(): void {
    for (const bird of this.birds) {
      if (bird.state === 'fleeing') continue;
      bird.state = 'fleeing';
      bird.t = 0;
      bird.delay = this.rng.range(0, 0.12);
      const a = this.rng.range(0, 6.28);
      const speed = this.size * this.rng.range(7, 12);
      bird.vel.set(Math.cos(a) * speed, this.size * this.rng.range(9, 15), Math.abs(Math.sin(a)) * speed * 0.5);
    }
  }

  update(dt: number): void {
    if (this.hidden) return;
    this.time += dt;
    bounds.makeEmpty();
    this.birds.forEach((bird, index) => {
      bird.t += dt;
      let wingAngle = 0;
      let fold = 0;
      let pitch = 0;
      if (bird.state === 'perched') {
        bird.pos.copy(bird.home);
        // An occasional head-bob keeps the row alive.
        pitch = Math.max(0, Math.sin(this.time * 1.3 + index * 2.1) - 0.86) * 2.4;
        fold = 1;
      } else if (bird.state === 'fleeing') {
        if (bird.t > bird.delay) {
          bird.vel.y += this.size * 2 * dt;
          bird.pos.addScaledVector(bird.vel, dt);
          bird.heading = Math.atan2(-bird.vel.z, bird.vel.x);
        }
        wingAngle = 0.2 + Math.sin(this.time * 34 + bird.flap) * 0.95;
        if (bird.t > 5 + index * 0.25) {
          bird.state = 'returning';
          bird.t = 0;
          bird.pos.copy(bird.home).add(p.set(this.size * (index % 2 ? 22 : -22), this.size * 16, this.size * 6));
        }
      } else {
        const u = Math.min(1, bird.t / 2.1);
        const ease = 1 - (1 - u) * (1 - u);
        p.copy(bird.pos).lerp(bird.home, ease * ease * 0.09 + u * 0.04);
        bird.heading = Math.atan2(-(bird.home.z - bird.pos.z), bird.home.x - bird.pos.x);
        bird.pos.copy(p);
        wingAngle = 0.2 + Math.sin(this.time * 26 + bird.flap) * 0.8;
        if (u >= 1 || bird.pos.distanceTo(bird.home) < this.size * 0.3) {
          bird.state = 'perched';
          bird.t = 0;
        }
      }
      const size = this.size;
      e.set(0, bird.heading, pitch);
      q.setFromEuler(e);
      m.compose(bird.pos, q, s.setScalar(size));
      this.rig.setMatrix(index, 0, m);
      bounds.expandByPoint(bird.pos);
      for (const side of [1, -1]) {
        // Folded wings lie back along the body; in flight they spread and beat.
        e.set(wingAngle * side, side === 1 ? -1.42 * fold : Math.PI + 1.42 * fold, 0, 'YXZ');
        q.setFromEuler(e);
        child.compose(p.set(-0.05, 0.16, side * 0.28), q, s.set(1, 1, 1));
        this.rig.setMatrix(index, side === 1 ? 1 : 2, child.premultiply(m));
      }
    });
    this.rig.commit(this.birds.length);
    bounds.getBoundingSphere(sphere);
    sphere.radius += this.size * 1.5;
    this.rig.setBounds(sphere);
  }
}

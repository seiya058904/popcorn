import * as THREE from 'three';
import type { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { addToy, addToyInstances, at, Kit, P, type ToyInstances } from '../geometry/kit.ts';

const SHARDS = 40;
const GRAVITY = 26;

interface Shard {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  rotation: THREE.Euler;
  size: number;
}

function shardGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(new THREE.IcosahedronGeometry(0.5, 0), { color: '#ffffff', gloss: 0.7, coat: 0.3, wear: 0.5, matrix: at(0, 0, 0, [0, 0, 0], [1, 0.28, 0.8]) });
  return kit.build();
}

/** Real pieces of the vessel, thrown out when it finally gives way. */
export class Debris {
  private readonly parts: ToyInstances;
  private readonly shards: Shard[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly k: number;

  constructor(stage: Stage, parent: THREE.Object3D, colors: readonly string[], k: number) {
    this.k = k;
    this.parts = addToyInstances(stage, parent, shardGeometry(), SHARDS, false, false);
    const tint = new THREE.Color();
    for (let i = 0; i < SHARDS; i += 1) this.parts.body.setColorAt(i, tint.set(colors[i % colors.length]!));
    this.parts.ink.instanceColor = this.parts.body.instanceColor;
  }

  burst(rng: Rng, radius: number, rimY: number): void {
    const k = this.k;
    this.shards.length = 0;
    for (let i = 0; i < SHARDS; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const speed = rng.range(3, 11) * k;
      this.shards.push({
        position: new THREE.Vector3(Math.cos(a) * radius, rimY + rng.range(-0.5, 0.2) * k, Math.sin(a) * radius),
        velocity: new THREE.Vector3(Math.cos(a) * speed, rng.range(6, 15) * k, Math.sin(a) * speed),
        spin: new THREE.Vector3(rng.range(-9, 9), rng.range(-9, 9), rng.range(-9, 9)),
        rotation: new THREE.Euler(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)),
        size: rng.range(0.22, 0.62) * k,
      });
    }
  }

  update(dt: number): void {
    if (this.shards.length === 0) return;
    const g = GRAVITY * this.k;
    let alive = 0;
    for (const shard of this.shards) {
      shard.velocity.y -= g * dt;
      shard.position.addScaledVector(shard.velocity, dt);
      shard.rotation.x += shard.spin.x * dt;
      shard.rotation.y += shard.spin.y * dt;
      shard.rotation.z += shard.spin.z * dt;
      if (shard.position.y < -14 * this.k) continue;
      this.quat.setFromEuler(shard.rotation);
      this.matrix.compose(shard.position, this.quat, this.scale.setScalar(shard.size));
      this.parts.setMatrixAt(alive, this.matrix);
      alive += 1;
    }
    this.parts.commit(alive);
    if (alive === 0) this.shards.length = 0;
  }

  hide(): void {
    this.shards.length = 0;
    this.parts.commit(0);
  }
}

/** Glowing fractures that creep over the vessel as it nears its limit. */
export class Cracks {
  private readonly geometry: THREE.BufferGeometry;
  private readonly group: THREE.Group;
  private readonly total: number;

  constructor(stage: Stage, parent: THREE.Object3D, rng: Rng, radius: number, rimY: number, k: number) {
    const kit = new Kit();
    const paint = { color: '#ffb066', emissive: 1, outline: 0, fixedColor: true };
    for (let crack = 0; crack < 9; crack += 1) {
      let a = (crack / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
      let y = rimY + 0.04 * k;
      const steps = 5;
      for (let i = 0; i < steps; i += 1) {
        const nextA = a + rng.range(-0.11, 0.11);
        const nextY = y - rng.range(0.09, 0.17) * k;
        const x0 = Math.cos(a) * radius;
        const z0 = Math.sin(a) * radius;
        const x1 = Math.cos(nextA) * radius;
        const z1 = Math.sin(nextA) * radius;
        const length = Math.hypot(x1 - x0, y - nextY, z1 - z0);
        const mid = new THREE.Vector3((x0 + x1) / 2, (y + nextY) / 2, (z0 + z1) / 2);
        const matrix = new THREE.Matrix4().compose(
          mid,
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y - nextY, z1 - z0).normalize()),
          new THREE.Vector3(1, 1, 1),
        );
        kit.add(P.box(0.028 * k * (1 - i / (steps + 1)), length, 0.028 * k, 0.004 * k, 1), { ...paint, matrix });
        a = nextA;
        y = nextY;
      }
    }
    this.geometry = kit.build();
    this.total = this.geometry.getIndex()!.count;
    this.geometry.setDrawRange(0, 0);
    this.group = addToy(stage, parent, this.geometry, { shadow: false, outline: false });
  }

  /** 0 hidden, 1 fully spread. */
  set(amount: number): void {
    // Whole triangles only, and always a run of the first ones so cracks grow from the rim.
    this.geometry.setDrawRange(0, Math.floor(this.total * Math.min(1, Math.max(0, amount)) / 3) * 3);
  }

  hide(): void {
    this.group.visible = false;
  }
}

function parcelGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(1, 0.8, 0.8, 0.06, 2), { color: '#c98f58', gloss: 0.15, matrix: at(0, 0, 0) });
  kit.add(P.box(1.02, 0.1, 0.16, 0.01, 1), { color: '#fff0d4', gloss: 0.3, outline: 0, matrix: at(0, 0.36, 0) });
  kit.add(P.box(0.16, 0.82, 0.82, 0.01, 1), { color: '#d62f38', gloss: 0.4, outline: 0, matrix: at(0, 0, 0) });
  return kit.build();
}

/** A delivery box, for machines too small or too old to have a place in this scene. */
export class Parcel {
  private readonly group: THREE.Group;
  private readonly velocity = new THREE.Vector3();
  private readonly k: number;
  private flying = false;
  private age = 0;
  private spin = 0;

  constructor(stage: Stage, parent: THREE.Object3D, k: number) {
    this.k = k;
    this.group = addToy(stage, parent, parcelGeometry(), { outline: false });
    this.group.visible = false;
    this.group.scale.setScalar(k * 0.6);
    this.group.position.set(0, 0, 0);
  }

  drop(rng: Rng, heapTop: number): void {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.5, 1.6) * this.k;
    this.group.position.set(Math.cos(a) * r, heapTop + 8 * this.k, Math.sin(a) * r);
    this.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.spin = rng.range(-5, 5);
    this.flying = true;
    this.age = 0;
  }

  /** Returns true on the frame the parcel lands. */
  update(dt: number, surfaceAt: (x: number, z: number) => number): boolean {
    if (!this.group.visible) return false;
    this.age += dt;
    const group = this.group;
    if (!this.flying) {
      // It sits a moment, then sinks into the heap.
      group.position.y -= dt * this.k * 0.9;
      if (this.age > 0.7) group.visible = false;
      return false;
    }
    this.velocity.y -= 30 * this.k * dt;
    group.position.addScaledVector(this.velocity, dt);
    group.rotation.set(this.age * this.spin * 0.5, this.age * this.spin, 0);
    const ground = surfaceAt(group.position.x, group.position.z);
    if (group.position.y > ground) return false;
    group.position.y = ground;
    group.rotation.x = 0.12;
    group.rotation.z = -0.1;
    this.flying = false;
    this.age = 0;
    return true;
  }

  hide(): void {
    this.group.visible = false;
  }
}

import * as THREE from 'three';
import { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { createFlakeGeometry, FLAKE_DETAIL_LOW } from '../geometry/popcorn.ts';
import { pileUniforms, popcornMaterials } from '../materials/popcorn.ts';

export interface PileShape {
  centerX: number;
  centerZ: number;
  size: number;
  /** Height of whatever the popcorn rests on. */
  floor(x: number, z: number): number;
  /** Height of the popcorn mound for a fill level of 0..1, before lumps. */
  mound(x: number, z: number, level: number, wobble: number): number;
  /** Radius within which landing flakes should aim. */
  landingRadius(level: number): number;
  /** Relative flake density, 0..1. */
  density(x: number, z: number): number;
  /** 0 where a flake would poke through a nearby wall, unless the heap is above `wallHeight`. */
  clearance(x: number, z: number): number;
  wallHeight: number;
  flakeScale: number;
}

const STEP = 1 / 60;
const ROW_INTERLACE = 4;

/** Height field with a spring layer on top: the visible mass of popcorn, at a fixed cost. */
export class Pile {
  readonly shape: PileShape;
  private readonly res: number;
  private readonly cell: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly texels: Float32Array;
  private readonly floors: Float32Array;
  private readonly wobble: Float32Array;
  private readonly lumps: Float32Array;
  private readonly clear: Float32Array;
  private readonly fills: Float32Array;
  private readonly bump: Float32Array;
  private readonly velocity: Float32Array;
  private readonly texture: THREE.DataTexture;
  private level = -1;
  private filledLevel = -1;
  private rowPhase = 0;
  private dirty = true;
  private energy = 0;
  private accumulator = 0;

  constructor(stage: Stage, parent: THREE.Object3D, shape: PileShape) {
    this.shape = shape;
    const res = stage.quality.pileGrid;
    this.res = res;
    this.cell = shape.size / (res - 1);
    this.minX = shape.centerX - shape.size / 2;
    this.minZ = shape.centerZ - shape.size / 2;
    const cells = res * res;
    this.texels = new Float32Array(cells * 4);
    this.floors = new Float32Array(cells);
    this.wobble = new Float32Array(cells);
    this.lumps = new Float32Array(cells);
    this.clear = new Float32Array(cells);
    this.fills = new Float32Array(cells);
    this.bump = new Float32Array(cells);
    this.velocity = new Float32Array(cells);

    for (let j = 0; j < res; j += 1) {
      for (let i = 0; i < res; i += 1) {
        const x = this.minX + i * this.cell;
        const z = this.minZ + j * this.cell;
        const k = i + j * res;
        this.floors[k] = shape.floor(x, z);
        this.clear[k] = shape.clearance(x, z);
        const angle = Math.atan2(z - shape.centerZ, x - shape.centerX);
        this.wobble[k] =
          0.5 * Math.sin(angle * 3 + 1.2) + 0.3 * Math.sin(angle * 7 + 4.1) + 0.2 * Math.sin(angle * 11 + 2.6);
        this.lumps[k] =
          0.05 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.9 - x * 0.8) +
          0.03 * Math.sin(x * 7.3 - z * 5.1) * Math.sin(z * 6.7 + x * 2.3);
      }
    }

    this.texture = new THREE.DataTexture(this.texels, res, res, THREE.RGBAFormat, THREE.FloatType);
    this.texture.internalFormat = 'RGBA16F';
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    pileUniforms.uPileTex.value = this.texture;
    pileUniforms.uPileMin.value.set(this.minX, this.minZ);
    pileUniforms.uPileSize.value = shape.size;
    pileUniforms.uPileTexel.value = 1 / res;

    const materials = popcornMaterials();
    const heapGeometry = new THREE.PlaneGeometry(shape.size, shape.size, res - 1, res - 1);
    heapGeometry.rotateX(-Math.PI / 2);
    heapGeometry.translate(shape.centerX, 0, shape.centerZ);
    const heap = new THREE.Mesh(heapGeometry, materials.heap);
    heap.frustumCulled = false;
    parent.add(heap);
    stage.shadow.add(heap, materials.heapDepth);

    this.buildSurface(stage, parent);
  }

  private buildSurface(stage: Stage, parent: THREE.Object3D): void {
    const materials = popcornMaterials();
    const rng = new Rng(4242);
    const shape = this.shape;
    const shapes = 4;
    const perShape = Math.floor(stage.quality.pileInstances / shapes);
    for (let s = 0; s < shapes; s += 1) {
      const base = createFlakeGeometry(s, FLAKE_DETAIL_LOW);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute('position', base.getAttribute('position'));
      geometry.setAttribute('normal', base.getAttribute('normal'));
      geometry.setAttribute('aShade', base.getAttribute('aShade'));
      const place = new Float32Array(perShape * 4);
      const quat = new Float32Array(perShape * 4);
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      let placed = 0;
      let guard = 0;
      while (placed < perShape && guard < perShape * 60) {
        guard += 1;
        const x = shape.centerX + rng.range(-0.5, 0.5) * shape.size;
        const z = shape.centerZ + rng.range(-0.5, 0.5) * shape.size;
        if (rng.next() > shape.density(x, z)) continue;
        place[placed * 4] = x;
        place[placed * 4 + 1] = z;
        place[placed * 4 + 2] = rng.range(-0.1, 0.05);
        place[placed * 4 + 3] = shape.flakeScale * rng.range(0.78, 1.18);
        e.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
        q.setFromEuler(e);
        quat.set([q.x, q.y, q.z, q.w], placed * 4);
        placed += 1;
      }
      geometry.setAttribute('iPlace', new THREE.InstancedBufferAttribute(place, 4));
      geometry.setAttribute('iQuat', new THREE.InstancedBufferAttribute(quat, 4));
      geometry.instanceCount = placed;
      const mesh = new THREE.Mesh(geometry, materials.surface);
      mesh.frustumCulled = false;
      parent.add(mesh);
    }
  }

  setLevel(level: number): void {
    if (Math.abs(level - this.level) < 1e-5) return;
    this.level = level;
    this.dirty = true;
  }

  get currentLevel(): number {
    return this.level;
  }

  /** Bilinear popcorn surface height, including the floor underneath. */
  heightAt(x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x - this.minX) / this.cell, 0, this.res - 1.001);
    const fz = THREE.MathUtils.clamp((z - this.minZ) / this.cell, 0, this.res - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const t = this.texels;
    const r = this.res;
    const at = (a: number, b: number): number => t[(a + b * r) * 4]!;
    return (
      (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v
    );
  }

  /** Pushes the surface down at a point; the springs carry it outward as a ripple. */
  impact(x: number, z: number, strength: number, radius: number): void {
    const r = this.res;
    const cells = Math.ceil(radius / this.cell);
    const ci = Math.round((x - this.minX) / this.cell);
    const cj = Math.round((z - this.minZ) / this.cell);
    for (let j = Math.max(1, cj - cells); j <= Math.min(r - 2, cj + cells); j += 1) {
      for (let i = Math.max(1, ci - cells); i <= Math.min(r - 2, ci + cells); i += 1) {
        const dx = (i - ci) * this.cell;
        const dz = (j - cj) * this.cell;
        const d = 1 - (dx * dx + dz * dz) / (radius * radius);
        if (d > 0) this.velocity[i + j * r]! -= strength * d * d;
      }
    }
    this.energy = 1;
  }

  update(deltaSeconds: number): void {
    this.accumulator = Math.min(this.accumulator + deltaSeconds, STEP * 4);
    let moved = false;
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      if (this.energy > 0.0005) {
        this.stepSprings();
        moved = true;
      }
    }
    if (this.dirty) this.refreshFills();
    if (moved || this.dirty) this.writeTexture();
  }

  /**
   * The mound shape is the expensive part, so small level changes refresh a quarter of the
   * rows per frame. The level moves slowly enough that the interlacing cannot be seen.
   */
  private refreshFills(): void {
    const { res: r, fills, lumps, wobble, shape } = this;
    const level = Math.max(0, this.level);
    const full = Math.abs(level - this.filledLevel) > 0.02 || this.filledLevel < 0;
    const lumpGain = Math.min(1, level * 4);
    for (let j = full ? 0 : this.rowPhase; j < r; j += full ? 1 : ROW_INTERLACE) {
      const z = this.minZ + j * this.cell;
      for (let i = 0; i < r; i += 1) {
        const k = i + j * r;
        fills[k] = shape.mound(this.minX + i * this.cell, z, level, wobble[k]!) + lumps[k]! * lumpGain;
      }
    }
    if (full) {
      this.filledLevel = level;
      this.rowPhase = 0;
      this.dirty = false;
      return;
    }
    this.rowPhase = (this.rowPhase + 1) % ROW_INTERLACE;
    // Finished once all phases have seen the newest level.
    if (this.rowPhase === 0) {
      this.dirty = this.filledLevel !== level;
      this.filledLevel = level;
    }
  }

  private stepSprings(): void {
    const { bump, velocity, res: r } = this;
    const stiffness = 210;
    const coupling = 150;
    const damping = 13;
    let energy = 0;
    for (let j = 1; j < r - 1; j += 1) {
      for (let i = 1; i < r - 1; i += 1) {
        const k = i + j * r;
        const b = bump[k]!;
        const around = (bump[k - 1]! + bump[k + 1]! + bump[k - r]! + bump[k + r]!) * 0.25;
        const v = velocity[k]! + ((around - b) * coupling - b * stiffness - velocity[k]! * damping) * STEP;
        velocity[k] = v;
        energy = Math.max(energy, Math.abs(v));
      }
    }
    for (let k = 0; k < bump.length; k += 1) bump[k]! += velocity[k]! * STEP;
    this.energy = energy;
  }

  private writeTexture(): void {
    const { texels, floors, fills, bump, velocity, clear } = this;
    const wall = this.shape.wallHeight;
    for (let k = 0; k < fills.length; k += 1) {
      const floor = floors[k]!;
      const fill = fills[k]!;
      const covered = fill > floor;
      const height = covered ? fill + bump[k]! : floor;
      const o = k * 4;
      texels[o] = height;
      texels[o + 1] = covered ? Math.min(0.5, Math.abs(velocity[k]!) * 0.5) : 0;
      texels[o + 2] = floor;
      const above = Math.min(1, Math.max(0, (height - wall - 0.04) / 0.14));
      texels[o + 3] = Math.max(clear[k]!, above);
    }
    this.texture.needsUpdate = true;
  }
}

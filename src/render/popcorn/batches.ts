import * as THREE from 'three';
import type { Stage } from '../core/stage.ts';
import { createFlakeGeometry, FLAKE_DETAIL_HIGH, FLAKE_DETAIL_LOW, FLAKE_SHAPES } from '../geometry/popcorn.ts';
import { pieceMaterials } from '../materials/popcorn.ts';

interface Batch {
  mesh: THREE.InstancedMesh;
  state: THREE.InstancedBufferAttribute;
  count: number;
}

const heroCache: THREE.BufferGeometry[] = [];
const lowCache: THREE.BufferGeometry[] = [];

/** Flake meshes are expensive to generate and identical everywhere, so each is built once. */
export function heroFlake(shape: number): THREE.BufferGeometry {
  return (heroCache[shape] ??= createFlakeGeometry(shape, FLAKE_DETAIL_HIGH));
}

export function lowFlake(shape: number): THREE.BufferGeometry {
  return (lowCache[shape] ??= createFlakeGeometry(shape, FLAKE_DETAIL_LOW));
}

/** Near-camera popcorn. Refilled every frame from whatever the director has alive. */
export class PieceBatches {
  readonly capacityPerShape: number;
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];

  constructor(stage: Stage, parent: THREE.Object3D, capacityPerShape = 48) {
    this.capacityPerShape = capacityPerShape;
    parent.add(this.group);
    const materials = pieceMaterials();
    for (let shape = 0; shape < FLAKE_SHAPES; shape += 1) {
      const source = heroFlake(shape);
      const geometry = new THREE.BufferGeometry();
      geometry.index = source.index;
      for (const name of ['position', 'normal', 'aKernelPos', 'aKernelNormal', 'aShade']) {
        geometry.setAttribute(name, source.getAttribute(name));
      }
      geometry.boundingSphere = source.boundingSphere;
      const state = new THREE.InstancedBufferAttribute(new Float32Array(capacityPerShape * 4), 4);
      state.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('iState', state);
      const mesh = new THREE.InstancedMesh(geometry, materials.piece, capacityPerShape);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      stage.shadow.add(mesh, materials.pieceDepth);
      this.batches.push({ mesh, state, count: 0 });
    }
  }

  begin(): void {
    for (const batch of this.batches) batch.count = 0;
  }

  push(shape: number, matrix: THREE.Matrix4, pop: number, glow: number): void {
    const batch = this.batches[shape]!;
    if (batch.count >= this.capacityPerShape) return;
    batch.mesh.setMatrixAt(batch.count, matrix);
    batch.state.setXYZW(batch.count, pop, glow, 0, 0);
    batch.count += 1;
  }

  end(): void {
    for (const batch of this.batches) {
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.state.needsUpdate = true;
    }
  }
}

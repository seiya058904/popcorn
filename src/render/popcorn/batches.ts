import * as THREE from 'three';
import type { Stage } from '../core/stage.ts';
import { createFlakeGeometry, FLAKE_DETAIL_HIGH, FLAKE_SHAPES } from '../geometry/popcorn.ts';
import { popcornMaterials } from '../materials/popcorn.ts';

interface Batch {
  mesh: THREE.InstancedMesh;
  state: THREE.InstancedBufferAttribute;
  count: number;
}

/** Near-camera popcorn. Refilled every frame from whatever the director has alive. */
export class PieceBatches {
  readonly capacityPerShape: number;
  private readonly batches: Batch[] = [];

  constructor(stage: Stage, parent: THREE.Object3D, capacityPerShape = 48) {
    this.capacityPerShape = capacityPerShape;
    const materials = popcornMaterials();
    for (let shape = 0; shape < FLAKE_SHAPES; shape += 1) {
      const geometry = createFlakeGeometry(shape, FLAKE_DETAIL_HIGH);
      const state = new THREE.InstancedBufferAttribute(new Float32Array(capacityPerShape * 4), 4);
      state.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('iState', state);
      const mesh = new THREE.InstancedMesh(geometry, materials.piece, capacityPerShape);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      parent.add(mesh);
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

  get liveCount(): number {
    return this.batches.reduce((sum, batch) => sum + batch.count, 0);
  }
}

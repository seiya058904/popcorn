import * as THREE from 'three';
import type { Stage } from '../core/stage.ts';
import { createFlakeGeometry, FLAKE_DETAIL_HIGH, FLAKE_DETAIL_LOW, FLAKE_SHAPES } from '../geometry/popcorn.ts';
import { pieceAtlas, pieceMaterials } from '../materials/popcorn.ts';

const heroCache: THREE.BufferGeometry[] = [];
const lowCache: THREE.BufferGeometry[] = [];

/** Flake meshes are expensive to generate and identical everywhere, so each is built once. */
export function heroFlake(shape: number): THREE.BufferGeometry {
  return (heroCache[shape] ??= createFlakeGeometry(shape, FLAKE_DETAIL_HIGH));
}

export function lowFlake(shape: number): THREE.BufferGeometry {
  return (lowCache[shape] ??= createFlakeGeometry(shape, FLAKE_DETAIL_LOW));
}

/** Rows per shape in a flake atlas, in this order. */
export const ATLAS_ROWS = ['position', 'normal', 'aKernelPos', 'aKernelNormal', 'aShade'] as const;

export interface FlakeAtlas {
  /** The shared triangle list and, for bounds only, the first shape's positions. */
  index: THREE.BufferAttribute;
  position: THREE.BufferAttribute;
  /** One texel per vertex, five rows per shape: see ATLAS_ROWS. */
  texture: THREE.DataTexture;
}

const atlases = new Map<number, FlakeAtlas>();

/**
 * Every flake shape is the same subdivided sphere pushed into a different form, so all shapes
 * share one triangle list. Their vertices go into a texture, and each instance picks its shape:
 * any number of shapes then costs a single draw call.
 */
export function flakeAtlas(detail: number): FlakeAtlas {
  let atlas = atlases.get(detail);
  if (atlas) return atlas;
  const shapes = Array.from({ length: FLAKE_SHAPES }, (_, shape) => (detail === FLAKE_DETAIL_HIGH ? heroFlake(shape) : detail === FLAKE_DETAIL_LOW ? lowFlake(shape) : createFlakeGeometry(shape, detail)));
  const first = shapes[0]!;
  const vertices = first.getAttribute('position').count;
  const data = new Float32Array(vertices * FLAKE_SHAPES * ATLAS_ROWS.length * 4);
  shapes.forEach((geometry, shape) => {
    if (geometry.getAttribute('position').count !== vertices) throw new Error('Flake shapes no longer share one topology');
    ATLAS_ROWS.forEach((name, row) => {
      const attribute = geometry.getAttribute(name);
      const offset = (shape * ATLAS_ROWS.length + row) * vertices * 4;
      for (let i = 0; i < vertices; i += 1) {
        data[offset + i * 4] = attribute.getX(i);
        data[offset + i * 4 + 1] = attribute.getY(i);
        data[offset + i * 4 + 2] = attribute.getZ(i);
      }
    });
  });
  const texture = new THREE.DataTexture(data, vertices, FLAKE_SHAPES * ATLAS_ROWS.length, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  atlas = { index: first.getIndex()!, position: first.getAttribute('position') as THREE.BufferAttribute, texture };
  atlases.set(detail, atlas);
  return atlas;
}

/** Near-camera popcorn. Refilled every frame from whatever the director has alive. */
export class PieceBatches {
  readonly capacityPerShape: number;
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly state: THREE.InstancedBufferAttribute;
  private readonly capacity: number;
  private count = 0;

  /** About 290 flakes in the air at most, however many shapes they are spread over. */
  constructor(stage: Stage, parent: THREE.Object3D, capacityPerShape = Math.round(288 / FLAKE_SHAPES)) {
    this.capacityPerShape = capacityPerShape;
    this.capacity = capacityPerShape * FLAKE_SHAPES;
    parent.add(this.group);
    const materials = pieceMaterials();
    const atlas = flakeAtlas(FLAKE_DETAIL_HIGH);
    pieceAtlas.value = atlas.texture;
    const geometry = new THREE.BufferGeometry();
    geometry.index = atlas.index;
    geometry.setAttribute('position', atlas.position);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
    // x: how far it has popped, y: heat, z: which shape it is.
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.state.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iState', this.state);
    this.mesh = new THREE.InstancedMesh(geometry, materials.piece, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);
    stage.shadow.add(this.mesh, materials.pieceDepth);
  }

  begin(): void {
    this.count = 0;
  }

  /** `gold` 1 draws the piece in gold leaf: the kernel of a golden click and its flake. */
  push(shape: number, matrix: THREE.Matrix4, pop: number, glow: number, gold = 0): void {
    if (this.count >= this.capacity) return;
    this.mesh.setMatrixAt(this.count, matrix);
    this.state.setXYZW(this.count, pop, glow, shape, gold);
    this.count += 1;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.state.needsUpdate = true;
  }
}

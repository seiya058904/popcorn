import * as THREE from 'three';
import type { Stage } from '../core/stage.ts';
import { rigToyMaterials, type ToyMaterials } from '../materials/toy.ts';
import { addGlassPiece } from './kit.ts';

export interface RigPart {
  /** Built by a Kit; its glass, if any, travels in `userData.glass`. */
  geometry: THREE.BufferGeometry;
  /** Drawn in the ink pass. */
  ink?: boolean;
  /** Drawn into the shadow map. */
  shadow?: boolean;
}

/** A part matrix that collapses the part to a point. */
export const RIG_HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const ATTRIBUTES = ['position', 'normal', 'color', 'aMat', 'aMat2', 'aMat3', 'aTint'] as const;

type TaggedPart = { geometry: THREE.BufferGeometry; part: number; ink: boolean; shadow: boolean };

/** Runs a step generator to the end at once, for callers that are not building in the background. */
function drain<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const result = steps.next();
    if (result.done) return result.value;
  }
}

/**
 * Joins Kit geometries into one, recording in `aPart` which part, and which passes, each vertex is
 * for. It yields after each attribute: a scene's set pieces add up to a couple of hundred thousand
 * vertices, which in one go took up to 18 ms of a frame while the next scene built in the background.
 */
function* mergeParts(parts: TaggedPart[]): Generator<void, THREE.BufferGeometry, void> {
  let vertices = 0;
  let indices = 0;
  for (const { geometry } of parts) {
    vertices += geometry.getAttribute('position').count;
    indices += geometry.getIndex()!.count;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of ATTRIBUTES) {
    const size = parts[0]!.geometry.getAttribute(name).itemSize;
    const array = new Float32Array(vertices * size);
    let offset = 0;
    for (const { geometry } of parts) {
      const source = geometry.getAttribute(name) as THREE.BufferAttribute;
      array.set(source.array as Float32Array, offset);
      offset += source.count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
    yield;
  }
  const tags = new Float32Array(vertices * 3);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let vertex = 0;
  let cursor = 0;
  for (const { geometry, part, ink, shadow } of parts) {
    const count = geometry.getAttribute('position').count;
    for (let i = 0; i < count; i += 1) {
      tags[(vertex + i) * 3] = part;
      tags[(vertex + i) * 3 + 1] = ink ? 1 : 0;
      tags[(vertex + i) * 3 + 2] = shadow ? 1 : 0;
    }
    // Straight from the typed array: getX per index is several times slower, and big rigs merge
    // hundreds of thousands of them while a scene builds in the background.
    const source = geometry.getIndex()!.array;
    for (let i = 0; i < source.length; i += 1) index[cursor + i] = source[i]! + vertex;
    cursor += source.length;
    vertex += count;
  }
  merged.setAttribute('aPart', new THREE.BufferAttribute(tags, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  yield;
  merged.computeBoundingSphere();
  return merged;
}

/** The joined geometries a rig is made of: its body, and its glass if any part has some. */
interface MergedRig {
  geometry: THREE.BufferGeometry;
  glass: THREE.BufferGeometry | null;
}

function* mergeRig(parts: RigPart[]): Generator<void, MergedRig, void> {
  const tagged = tagParts(parts);
  const geometry = yield* mergeParts(tagged);
  const glassParts = tagged
    .filter((part) => part.geometry.userData.glass)
    .map((part) => ({ ...part, geometry: part.geometry.userData.glass as THREE.BufferGeometry }));
  const glass = glassParts.length > 0 ? yield* mergeParts(glassParts) : null;
  return { geometry, glass };
}

const tagParts = (parts: RigPart[]): TaggedPart[] => parts.map((part, index) => ({ geometry: part.geometry, part: index, ink: part.ink !== false, shadow: part.shadow !== false }));

/**
 * Many moving parts, and many copies of them, drawn in one call per pass. Every vertex knows its
 * part; each copy's part matrices live in a small float texture that is refreshed once per frame.
 * The matrices are relative to `parent`, which the meshes are added to.
 */
export class PartRig {
  readonly body: THREE.InstancedMesh;
  readonly ink: THREE.InstancedMesh | null;
  readonly glass: THREE.InstancedMesh[];
  readonly materials: ToyMaterials;
  readonly partCount: number;
  readonly capacity: number;
  readonly texture: THREE.DataTexture;
  private readonly data: Float32Array;
  private readonly meshes: THREE.InstancedMesh[];

  /** The same rig, joined a step at a time, for scenes built in the background. */
  static *create(stage: Stage, parent: THREE.Object3D, parts: RigPart[], capacity: number): Generator<void, PartRig, void> {
    const merged = yield* mergeRig(parts);
    return new PartRig(stage, parent, parts, capacity, merged);
  }

  constructor(stage: Stage, parent: THREE.Object3D, parts: RigPart[], capacity: number, merged: MergedRig = drain(mergeRig(parts))) {
    this.partCount = parts.length;
    this.capacity = capacity;
    this.data = new Float32Array(capacity * parts.length * 16);
    this.texture = new THREE.DataTexture(this.data, parts.length * 4, capacity, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.materials = rigToyMaterials(this.texture);

    const tagged = tagParts(parts);
    const { geometry, glass } = merged;
    const anyInk = tagged.some((part) => part.ink && part.geometry.userData.noInk !== true);
    const anyShadow = tagged.some((part) => part.shadow);

    this.body = this.instanced(geometry, this.materials.body);
    parent.add(this.body);
    if (anyShadow) stage.shadow.add(this.body, this.materials.depth);
    this.ink = anyInk ? this.instanced(geometry, this.materials.outline) : null;
    if (this.ink) parent.add(this.ink);
    // The three forms of the glass share one joined geometry.
    this.glass = glass ? addGlassPiece(stage, parent, (material) => this.instanced(glass, material), this.materials) : [];
    this.meshes = [this.body, ...(this.ink ? [this.ink] : []), ...this.glass];
    for (const { geometry: source } of tagged) {
      (source.userData.glass as THREE.BufferGeometry | undefined)?.dispose();
      source.dispose();
    }
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Every mesh of the rig, for anything that has to treat them alike. */
  get all(): readonly THREE.InstancedMesh[] {
    return this.meshes;
  }

  setMatrix(copy: number, part: number, matrix: THREE.Matrix4): void {
    matrix.toArray(this.data, (copy * this.partCount + part) * 16);
  }

  /** A warm rim round one copy, as when the pointer rests on it; `amount` 0 turns it off. */
  setHover(copy: number, amount: number): void {
    (this.materials.body.uniforms.uHover!.value as THREE.Vector2).set(copy, amount);
  }

  setColor(copy: number, color: THREE.Color): void {
    this.body.setColorAt(copy, color);
    if (this.ink) this.ink.instanceColor = this.body.instanceColor;
  }

  /** Shows this many copies, using the matrices written since the last commit. */
  commit(count: number): void {
    for (const mesh of this.meshes) mesh.count = count;
    if (count > 0) this.texture.needsUpdate = true;
  }

  /** Lets the camera skip the rig when every copy is out of view. Null draws it always. */
  setBounds(sphere: THREE.Sphere | null): void {
    for (const mesh of this.meshes) {
      mesh.frustumCulled = sphere !== null;
      if (sphere) (mesh.boundingSphere ??= new THREE.Sphere()).copy(sphere);
    }
  }
}

/**
 * Builds a rig from a hierarchy of empty objects. Existing code keeps moving, turning and hiding
 * those objects; the rig reads them just before it is drawn, so the whole thing costs one call
 * per pass instead of one per piece.
 */
export class ToyRig {
  private readonly parts: Array<RigPart & { holder: THREE.Object3D }> = [];
  private rig: PartRig | null = null;
  private stamp = -1;
  private readonly inverse = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();

  /** Adds a piece under `parent` and returns the object that stands for it. */
  part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, options: { ink?: boolean; shadow?: boolean } = {}): THREE.Group {
    const holder = new THREE.Group();
    parent.add(holder);
    this.parts.push({ geometry, holder, ink: options.ink, shadow: options.shadow });
    return holder;
  }

  /** Creates the meshes under `space`, the object every piece's matrix is measured from. */
  build(stage: Stage, space: THREE.Object3D, clock: { value: number }): PartRig {
    return drain(this.buildInSteps(stage, space, clock));
  }

  /** The same, joining the pieces a step at a time, for scenes built in the background. */
  *buildInSteps(stage: Stage, space: THREE.Object3D, clock: { value: number }): Generator<void, PartRig, void> {
    const rig = yield* PartRig.create(stage, space, this.parts, 1);
    rig.commit(1);
    const sync = (): void => {
      if (this.stamp === clock.value) return;
      this.stamp = clock.value;
      this.sync(space, rig);
    };
    for (const mesh of rig.all) mesh.onBeforeRender = sync;
    this.rig = rig;
    return rig;
  }

  private sync(space: THREE.Object3D, rig: PartRig): void {
    this.inverse.copy(space.matrixWorld).invert();
    let shown = false;
    this.parts.forEach(({ holder }, part) => {
      if (!visibleUnder(holder, space)) {
        rig.setMatrix(0, part, RIG_HIDDEN);
        return;
      }
      shown = true;
      rig.setMatrix(0, part, this.local.multiplyMatrices(this.inverse, holder.matrixWorld));
    });
    rig.texture.needsUpdate = true;
    // Nothing on show costs nothing: an empty instanced draw is skipped by the renderer.
    for (const mesh of rig.all) mesh.count = shown ? 1 : 0;
  }

  /** Forces a refresh on the next draw, after the pieces moved without the clock advancing. */
  touch(): void {
    this.stamp = -1;
    if (this.rig) for (const mesh of this.rig.all) mesh.count = 1;
  }
}

function visibleUnder(node: THREE.Object3D, space: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = node; current && current !== space; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

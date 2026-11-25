import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toyMaterials, type ToyMaterials } from '../materials/toy.ts';
import { LIGHT_GROUPS } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';

/** Surface relief, painted by the shader. The fraction picks the scale: .5 is the default. */
export const Pattern = {
  Brushed: 1.5,
  Enamel: 2.5,
  Wood: 3.5,
  Brick: 4.5,
  Fabric: 5.5,
  Rubber: 6.5,
  Plaster: 7.5,
  /** Crossed diagonal grooves, for knobs and grips. */
  Knurl: 8.5,
  /** Rows of round holes, for vents, grilles and speaker cloth. */
  Perforated: 9.5,
  /** Raised lozenges in alternating directions, for steps, decks and floor plates. */
  Tread: 10.5,
  /** Glazed ceramic: deep gloss with faint crazing and pooled color. */
  Glaze: 11.5,
  /** Pebbled hide, for seats, handles and straps. */
  Leather: 12.5,
  /** Paper fibers, for labels, cards and boxes. */
  Paper: 13.5,
  /** Speckled enamel, as on graniteware pots: pale flecks of every size in the glaze. */
  Speckle: 14.5,
} as const;

/** 0 keeps only the main shapes, 1 adds medium parts, 2 adds the finest. */
let detailLevel = 2;

export function setKitDetail(level: number): void {
  detailLevel = level;
}

export interface Paint {
  color: THREE.ColorRepresentation;
  /** 0 is matte, 1 is wet enamel. */
  gloss?: number;
  emissive?: number;
  /** 1 is bare metal: reflections take the paint color and diffuse light goes away. */
  metal?: number;
  /** A clear lacquer over the paint; on floors it also enables reflections. */
  coat?: number;
  pattern?: number;
  /** Worn, brighter edges. */
  wear?: number;
  /** Stays this color when the machine gets a per-copy tint. */
  fixedColor?: boolean;
  /** Goes into the see-through pass instead of the solid body. */
  glass?: boolean;
  /** Glass only: how thick it is, in model units. Miniature glass is thick for its size. */
  thickness?: number;
  /** Glass only: 0 is a flat pane, 1 a curved piece that bends everything behind it like a lens. */
  lens?: number;
  /** Skipped when the quality level is below this. */
  detail?: number;
  /** Baked occlusion; a function receives the transformed vertex. */
  ao?: number | ((p: THREE.Vector3, n: THREE.Vector3) => number);
  /** Outline width multiplier; 0 removes the part from the ink pass. */
  outline?: number;
  matrix?: THREE.Matrix4;
  colorFn?: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
  /** Per-vertex glow, for things like lava running through rock. */
  emissiveFn?: (p: THREE.Vector3, n: THREE.Vector3) => number;
  /**
   * A light group from `lightGroup()`: the scene turns the part on and off, and while off it is
   * dark glass. Its own glow, from `emissive` or `emissiveFn`, must stay below 2.
   */
  light?: number;
  /** With `light`: off, the part keeps its paint and only stops glowing, like a clock face. */
  lightKeepsPaint?: boolean;
  /**
   * How far the part sways in the wind, 0 to 1: leaves, flags, bunting. A function receives the
   * transformed vertex, so a flag can stay still where it hangs and flutter at its free end.
   */
  sway?: number | ((p: THREE.Vector3, n: THREE.Vector3) => number);
  /** Velvet and plush: darker face-on, a soft bright sheen at grazing angles. 0 to 1. */
  sheen?: number;
  /** Soft vinyl, as on toy figures: light creeps round into the shade, warm at the edge. 0 to 1. */
  soft?: number;
  /** Fingerprints and smudges that break up the reflection on chrome and enamel. 0 to 1. */
  smudge?: number;
  /** A glowing tube: white-hot along its core, its color in the glow around it. */
  neon?: boolean;
}

const tempP = new THREE.Vector3();
const tempN = new THREE.Vector3();
const tempC = new THREE.Color();
const normalMatrix = new THREE.Matrix3();

/** A float array that doubles when it runs out of room, so adding parts never reallocates per vertex. */
class Grow {
  data: Float32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }
  /** Makes room for `count` more values and returns where they start. */
  reserve(count: number): number {
    const start = this.length;
    if (start + count > this.data.length) {
      const next = new Float32Array(Math.max(this.data.length * 2, start + count));
      next.set(this.data.subarray(0, start));
      this.data = next;
    }
    this.length = start + count;
    return start;
  }
  /** An exact-size copy; the spare room is left behind for the garbage collector. */
  take(): Float32Array {
    return this.data.slice(0, this.length);
  }

  /** A view without copying, for data that is dropped from memory once it is on the GPU. */
  view(): Float32Array {
    return this.data.subarray(0, this.length);
  }
}

/** Bakes painted primitives into one vertex-colored geometry, so a whole prop is one draw call. */
export class Kit {
  private readonly positions = new Grow(3 * 1024);
  private readonly normals = new Grow(3 * 1024);
  private readonly colors = new Grow(3 * 1024);
  private readonly mats = new Grow(4 * 1024);
  private readonly mats2 = new Grow(4 * 1024);
  private readonly mats3 = new Grow(4 * 1024);
  private readonly tints = new Grow(1024);
  private indices = new Uint32Array(4096);
  private indexCount = 0;
  private glass: Kit | null = null;
  private inked = false;
  /** Running bounds, so a huge set never has to be scanned again to find its extent. */
  private readonly box = new THREE.Box3();

  add(geometry: THREE.BufferGeometry, paint: Paint): this {
    if ((paint.detail ?? 0) > detailLevel) {
      geometry.dispose();
      return this;
    }
    if (paint.glass) {
      this.glass ??= new Kit();
      // Glass has no paint to speak of, so these two channels carry its optics instead.
      this.glass.add(geometry, { ...paint, glass: false, gloss: paint.thickness ?? 0.05, metal: paint.lens ?? 0 });
      return this;
    }
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const count = pos.count;
    const base = this.positions.length / 3;
    const color = tempC.set(paint.color);
    const cr = color.r;
    const cg = color.g;
    const cb = color.b;
    const gloss = paint.gloss ?? 0.25;
    const emissive = paint.emissive ?? 0;
    const outline = paint.outline ?? 1;
    if (outline > 0) this.inked = true;
    const metal = paint.metal ?? 0;
    const coat = paint.coat ?? 0;
    const pattern = paint.pattern ?? 0;
    const wear = paint.wear ?? 0;
    const swayFn = typeof paint.sway === 'function' ? paint.sway : null;
    const swayValue = typeof paint.sway === 'number' ? paint.sway : 0;
    // Velvet and neon share a channel: neon is marked by a negative value.
    const sheen = paint.neon ? -1 : (paint.sheen ?? 0);
    const soft = paint.soft ?? 0;
    const smudge = paint.smudge ?? 0;
    const tint = paint.fixedColor ? 0 : 1;
    // The group travels in the glow channel, two per step, where the shader takes it apart again.
    const group = paint.light ? (paint.light + (paint.lightKeepsPaint ? LIGHT_GROUPS : 0)) * 2 : 0;
    const aoFn = typeof paint.ao === 'function' ? paint.ao : null;
    const aoValue = typeof paint.ao === 'number' ? paint.ao : 1;
    const { colorFn, emissiveFn } = paint;
    const perVertex = aoFn !== null || swayFn !== null || colorFn !== undefined || emissiveFn !== undefined;

    // The matrix is applied by hand: this loop runs for every vertex of every scene.
    const e = paint.matrix?.elements;
    if (paint.matrix) normalMatrix.getNormalMatrix(paint.matrix);
    const nm = normalMatrix.elements;
    const sp = pos.array as Float32Array;
    const sn = nor.array as Float32Array;
    const strideP = pos.itemSize;
    const strideN = nor.itemSize;
    const op = this.positions.reserve(count * 3);
    const on = this.normals.reserve(count * 3);
    const oc = this.colors.reserve(count * 3);
    const om = this.mats.reserve(count * 4);
    const om2 = this.mats2.reserve(count * 4);
    const om3 = this.mats3.reserve(count * 4);
    const ot = this.tints.reserve(count);
    const P = this.positions.data;
    const N = this.normals.data;
    const C = this.colors.data;
    const M = this.mats.data;
    const M2 = this.mats2.data;
    const M3 = this.mats3.data;
    const T = this.tints.data;
    const interleaved = (pos as THREE.BufferAttribute & { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute === true;
    let minX = this.box.min.x;
    let minY = this.box.min.y;
    let minZ = this.box.min.z;
    let maxX = this.box.max.x;
    let maxY = this.box.max.y;
    let maxZ = this.box.max.z;
    for (let i = 0; i < count; i += 1) {
      let x: number;
      let y: number;
      let z: number;
      let nx: number;
      let ny: number;
      let nz: number;
      if (interleaved) {
        x = pos.getX(i);
        y = pos.getY(i);
        z = pos.getZ(i);
        nx = nor.getX(i);
        ny = nor.getY(i);
        nz = nor.getZ(i);
      } else {
        x = sp[i * strideP]!;
        y = sp[i * strideP + 1]!;
        z = sp[i * strideP + 2]!;
        nx = sn[i * strideN]!;
        ny = sn[i * strideN + 1]!;
        nz = sn[i * strideN + 2]!;
      }
      if (e) {
        const tx = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        const ty = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        const tz = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
        x = tx;
        y = ty;
        z = tz;
        const ux = nm[0]! * nx + nm[3]! * ny + nm[6]! * nz;
        const uy = nm[1]! * nx + nm[4]! * ny + nm[7]! * nz;
        const uz = nm[2]! * nx + nm[5]! * ny + nm[8]! * nz;
        const length = Math.hypot(ux, uy, uz) || 1;
        nx = ux / length;
        ny = uy / length;
        nz = uz / length;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      const j3 = i * 3;
      const j4 = i * 4;
      P[op + j3] = x;
      P[op + j3 + 1] = y;
      P[op + j3 + 2] = z;
      N[on + j3] = nx;
      N[on + j3 + 1] = ny;
      N[on + j3 + 2] = nz;
      let r = cr;
      let g = cg;
      let b = cb;
      let ao = aoValue;
      let glow = emissive;
      let sway = swayValue;
      if (perVertex) {
        tempP.set(x, y, z);
        tempN.set(nx, ny, nz);
        if (colorFn) {
          const out = tempC.setRGB(cr, cg, cb);
          colorFn(tempP, tempN, out);
          r = out.r;
          g = out.g;
          b = out.b;
        }
        if (aoFn) ao = aoFn(tempP, tempN);
        if (emissiveFn) glow = emissiveFn(tempP, tempN);
        if (swayFn) sway = swayFn(tempP, tempN);
      }
      C[oc + j3] = r;
      C[oc + j3 + 1] = g;
      C[oc + j3 + 2] = b;
      M[om + j4] = gloss;
      M[om + j4 + 1] = glow + group;
      M[om + j4 + 2] = ao;
      M[om + j4 + 3] = outline;
      M2[om2 + j4] = metal;
      M2[om2 + j4 + 1] = coat;
      M2[om2 + j4 + 2] = pattern;
      M2[om2 + j4 + 3] = wear;
      M3[om3 + j4] = sway;
      M3[om3 + j4 + 1] = sheen;
      M3[om3 + j4 + 2] = soft;
      M3[om3 + j4 + 3] = smudge;
      T[ot + i] = tint;
    }
    this.box.min.set(minX, minY, minZ);
    this.box.max.set(maxX, maxY, maxZ);
    const index = geometry.getIndex();
    const indexCount = index ? index.count : count;
    if (this.indexCount + indexCount > this.indices.length) {
      const next = new Uint32Array(Math.max(this.indices.length * 2, this.indexCount + indexCount));
      next.set(this.indices.subarray(0, this.indexCount));
      this.indices = next;
    }
    const out = this.indices;
    const at = this.indexCount;
    if (index) {
      const source = index.array;
      for (let i = 0; i < indexCount; i += 1) out[at + i] = base + source[i]!;
    } else {
      for (let i = 0; i < indexCount; i += 1) out[at + i] = base + i;
    }
    this.indexCount += indexCount;
    geometry.dispose();
    return this;
  }

  /** `frozen` is for large sets that are never read or changed again after they are drawn. */
  build(options: { frozen?: boolean } = {}): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    // A frozen set leaves main memory after upload, so its arrays are handed over without a copy.
    const grab = (grow: Grow): Float32Array => (options.frozen ? grow.view() : grow.take());
    geometry.setAttribute('position', new THREE.BufferAttribute(grab(this.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(grab(this.normals), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(grab(this.colors), 3));
    geometry.setAttribute('aMat', new THREE.BufferAttribute(grab(this.mats), 4));
    geometry.setAttribute('aMat2', new THREE.BufferAttribute(grab(this.mats2), 4));
    geometry.setAttribute('aMat3', new THREE.BufferAttribute(grab(this.mats3), 4));
    geometry.setAttribute('aTint', new THREE.BufferAttribute(grab(this.tints), 1));
    const vertices = this.positions.length / 3;
    const indices = this.indices.subarray(0, this.indexCount);
    geometry.setIndex(new THREE.BufferAttribute(vertices > 65535 ? (options.frozen ? indices : indices.slice()) : Uint16Array.from(indices), 1));
    if (vertices > 0) {
      geometry.boundingBox = this.box.clone();
      geometry.boundingSphere = this.box.getBoundingSphere(new THREE.Sphere());
    } else {
      geometry.computeBoundingSphere();
    }
    if (this.glass) geometry.userData.glass = this.glass.build();
    geometry.userData.noInk = !this.inked;
    if (options.frozen) {
      // The data can leave main memory once it is on the GPU. A lost graphics context reloads
      // the page, so nothing ever needs to upload it again.
      for (const attribute of Object.values(geometry.attributes)) (attribute as THREE.BufferAttribute).onUpload(releaseArray);
      geometry.getIndex()?.onUpload(releaseArray);
    }
    return geometry;
  }
}

function releaseArray(this: { array: unknown }): void {
  this.array = null;
}

/** Transform helper: position, Euler rotation, uniform or per-axis scale. */
export function at(
  x: number,
  y: number,
  z: number,
  rotation: [number, number, number] = [0, 0, 0],
  scale: number | [number, number, number] = 1,
): THREE.Matrix4 {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    s,
  );
}

type Point = [number, number];

/**
 * After a lathe has been pushed about and its normals worked out again, the first and last columns
 * of its grid lie on top of each other but shade apart. This joins them back into one smooth seam,
 * far cheaper than merging every vertex.
 */
export function smoothLatheSeam(lathe: THREE.BufferGeometry, segments: number): void {
  const normal = lathe.getAttribute('normal') as THREE.BufferAttribute;
  const rows = normal.count / (segments + 1);
  const last = segments * rows;
  for (let j = 0; j < rows; j += 1) {
    const x = normal.getX(j) + normal.getX(last + j);
    const y = normal.getY(j) + normal.getY(last + j);
    const z = normal.getZ(j) + normal.getZ(last + j);
    const length = Math.hypot(x, y, z) || 1;
    normal.setXYZ(j, x / length, y / length, z / length);
    normal.setXYZ(last + j, x / length, y / length, z / length);
  }
}

/** Replaces each interior corner of a polyline with a small arc. */
export function roundProfile(points: Point[], radius: number, steps = 4): THREE.Vector2[] {
  const out: THREE.Vector2[] = [new THREE.Vector2(...points[0]!)];
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = new THREE.Vector2(...points[i]!);
    const a = new THREE.Vector2(...points[i - 1]!).sub(p);
    const b = new THREE.Vector2(...points[i + 1]!).sub(p);
    const r = Math.min(radius, a.length() * 0.45, b.length() * 0.45);
    const start = p.clone().add(a.setLength(r));
    const end = p.clone().add(b.setLength(r));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const q = start.clone().lerp(p, t);
      out.push(q.lerp(p.clone().lerp(end, t), t));
    }
  }
  out.push(new THREE.Vector2(...points[points.length - 1]!));
  return out;
}

/**
 * Scenes repeat the same few parts thousands of times, and building one is far slower than
 * copying it into a kit. Kits only read these, so identical requests can share one.
 */
const shapes = new Map<string, THREE.BufferGeometry>();

function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let shape = shapes.get(key);
  if (!shape) {
    shape = make();
    shapes.set(key, shape);
  }
  return shape;
}

/** Called when a scene is finished, so the shapes do not stay in memory. */
export function releaseSharedShapes(): void {
  shapes.clear();
}

/** Primitive library. Lathe profiles run counter-clockwise: outward along the base, then up. */
export const P = {
  box: (w: number, h: number, d: number, r = 0.05, seg = 2): THREE.BufferGeometry =>
    shared(`b${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49))),
  lathe: (profile: Point[], segments = 48, round = 0.03, steps = 4): THREE.BufferGeometry =>
    new THREE.LatheGeometry(roundProfile(profile, round, steps), segments),
  /** Solid rounded cylinder. */
  puck: (radiusBottom: number, radiusTop: number, height: number, segments = 32, round = 0.03): THREE.BufferGeometry =>
    shared(`p${radiusBottom},${radiusTop},${height},${segments},${round}`, () =>
      new THREE.LatheGeometry(
        roundProfile(
          [
            [0, 0],
            [radiusBottom, 0],
            [radiusTop, height],
            [0, height],
          ],
          round,
        ),
        segments,
      ),
    ),
  /** A plain box, 12 triangles against a rounded box's 108: for small flat details seen from afar. */
  slab: (w: number, h: number, d: number): THREE.BufferGeometry => shared(`slab${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  /** A gable roof: a triangular prism whose ridge runs `w` along X, eaves `d` apart along Z, `h` high, base at y = 0. */
  prism: (w: number, h: number, d: number): THREE.BufferGeometry =>
    shared(`prism${w},${h},${d}`, () => {
      const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      geometry.translate(0, 0, -w / 2);
      geometry.rotateY(Math.PI / 2);
      return geometry;
    }),
  sphere: (radius: number, w = 24, h = 16): THREE.BufferGeometry => shared(`s${radius},${w},${h}`, () => new THREE.SphereGeometry(radius, w, h)),
  capsule: (radius: number, length: number, cap = 6, radial = 14): THREE.BufferGeometry =>
    shared(`c${radius},${length},${cap},${radial}`, () => new THREE.CapsuleGeometry(radius, length, cap, radial)),
  torus: (radius: number, tube: number, radial = 12, tubular = 40, arc = Math.PI * 2): THREE.BufferGeometry =>
    shared(`t${radius},${tube},${radial},${tubular},${arc}`, () => new THREE.TorusGeometry(radius, tube, radial, tubular, arc)),
  tube: (points: THREE.Vector3[], radius: number, tubular = 32, radial = 10, closed = false): THREE.BufferGeometry =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), tubular, radius, radial, closed),
};

/** Adds a baked prop with its ink shell, registering it as a shadow caster. */
export function addToy(
  stage: Stage,
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  options: { shadow?: boolean; outline?: boolean } = {},
): THREE.Group {
  const materials = toyMaterials();
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry, materials.body);
  group.add(body);
  if (options.shadow !== false) stage.shadow.add(body, materials.depth);
  if (options.outline !== false) group.add(new THREE.Mesh(geometry, materials.outline));
  const glass = geometry.userData.glass as THREE.BufferGeometry | undefined;
  if (glass) {
    addGlassPiece(stage, group, (material) => new THREE.Mesh(glass, material));
  }
  parent.add(group);
  return group;
}

/** Glass exists in a simple form and a refracting one; the stage shows whichever applies. */
export function addGlassPiece<T extends THREE.Mesh>(stage: Stage, parent: THREE.Object3D, make: (material: THREE.Material) => T, materials: ToyMaterials = toyMaterials()): T[] {
  const simple = make(materials.glass);
  const body = make(materials.glassBody);
  const surface = make(materials.glassSurface);
  simple.renderOrder = 2;
  surface.renderOrder = 2;
  body.visible = false;
  surface.visible = false;
  stage.addGlass({ simple, body, surface });
  parent.add(simple, body, surface);
  return [simple, body, surface];
}

export interface ToyInstances {
  body: THREE.InstancedMesh;
  ink: THREE.InstancedMesh;
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
  commit(count: number): void;
}

/** Instanced prop whose body and ink shell share one transform buffer. */
export function addToyInstances(
  stage: Stage,
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  capacity: number,
  castShadow = true,
  withInk = true,
): ToyInstances {
  const materials = toyMaterials();
  const body = new THREE.InstancedMesh(geometry, materials.body, capacity);
  const ink = new THREE.InstancedMesh(geometry, materials.outline, capacity);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ink.instanceMatrix = body.instanceMatrix;
  // Parts that are all fine detail have no outline, so their ink pass would draw nothing.
  ink.visible = withInk && geometry.userData.noInk !== true;
  body.frustumCulled = false;
  ink.frustumCulled = false;
  body.count = 0;
  ink.count = 0;
  if (castShadow) stage.shadow.add(body, materials.depth);
  parent.add(body, ink);
  const glassGeometry = geometry.userData.glass as THREE.BufferGeometry | undefined;
  const glass = glassGeometry
    ? addGlassPiece(stage, parent, (material) => {
        const mesh = new THREE.InstancedMesh(glassGeometry, material, capacity);
        mesh.instanceMatrix = body.instanceMatrix;
        mesh.frustumCulled = false;
        mesh.count = 0;
        return mesh;
      })
    : [];
  return {
    body,
    ink,
    setMatrixAt: (index, matrix) => body.setMatrixAt(index, matrix),
    commit(count) {
      body.count = count;
      ink.count = count;
      for (const mesh of glass) mesh.count = count;
      body.instanceMatrix.needsUpdate = true;
    },
  };
}

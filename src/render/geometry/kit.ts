import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toyMaterials } from '../materials/toy.ts';
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
  /** Skipped when the quality level is below this. */
  detail?: number;
  /** Baked occlusion; a function receives the transformed vertex. */
  ao?: number | ((p: THREE.Vector3, n: THREE.Vector3) => number);
  /** Outline width multiplier; 0 removes the part from the ink pass. */
  outline?: number;
  matrix?: THREE.Matrix4;
  colorFn?: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
}

const tempP = new THREE.Vector3();
const tempN = new THREE.Vector3();
const tempC = new THREE.Color();

/** Bakes painted primitives into one vertex-colored geometry, so a whole prop is one draw call. */
export class Kit {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private mats: number[] = [];
  private mats2: number[] = [];
  private tints: number[] = [];
  private indices: number[] = [];
  private glass: Kit | null = null;

  add(geometry: THREE.BufferGeometry, paint: Paint): this {
    if ((paint.detail ?? 0) > detailLevel) {
      geometry.dispose();
      return this;
    }
    if (paint.glass) {
      this.glass ??= new Kit();
      this.glass.add(geometry, { ...paint, glass: false });
      return this;
    }
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    const base = this.positions.length / 3;
    const normalMatrix = new THREE.Matrix3();
    if (paint.matrix) normalMatrix.getNormalMatrix(paint.matrix);
    const color = new THREE.Color(paint.color);
    const gloss = paint.gloss ?? 0.25;
    const emissive = paint.emissive ?? 0;
    const outline = paint.outline ?? 1;
    const metal = paint.metal ?? 0;
    const coat = paint.coat ?? 0;
    const pattern = paint.pattern ?? 0;
    const wear = paint.wear ?? 0;
    for (let i = 0; i < pos.count; i += 1) {
      tempP.fromBufferAttribute(pos, i);
      tempN.fromBufferAttribute(nor, i);
      if (paint.matrix) {
        tempP.applyMatrix4(paint.matrix);
        tempN.applyMatrix3(normalMatrix).normalize();
      }
      this.positions.push(tempP.x, tempP.y, tempP.z);
      this.normals.push(tempN.x, tempN.y, tempN.z);
      tempC.copy(color);
      paint.colorFn?.(tempP, tempN, tempC);
      this.colors.push(tempC.r, tempC.g, tempC.b);
      const ao = typeof paint.ao === 'function' ? paint.ao(tempP, tempN) : (paint.ao ?? 1);
      this.mats.push(gloss, emissive, ao, outline);
      this.mats2.push(metal, coat, pattern, wear);
      this.tints.push(paint.fixedColor ? 0 : 1);
    }
    const index = geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 1) this.indices.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i += 1) this.indices.push(base + i);
    }
    geometry.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mats, 4));
    geometry.setAttribute('aMat2', new THREE.Float32BufferAttribute(this.mats2, 4));
    geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tints, 1));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    if (this.glass) geometry.userData.glass = this.glass.build();
    return geometry;
  }
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

/** Primitive library. Lathe profiles run counter-clockwise: outward along the base, then up. */
export const P = {
  box: (w: number, h: number, d: number, r = 0.05, seg = 2): THREE.BufferGeometry =>
    new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49)),
  lathe: (profile: Point[], segments = 48, round = 0.03, steps = 4): THREE.BufferGeometry =>
    new THREE.LatheGeometry(roundProfile(profile, round, steps), segments),
  /** Solid rounded cylinder. */
  puck: (radiusBottom: number, radiusTop: number, height: number, segments = 32, round = 0.03): THREE.BufferGeometry =>
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
  sphere: (radius: number, w = 24, h = 16): THREE.BufferGeometry => new THREE.SphereGeometry(radius, w, h),
  capsule: (radius: number, length: number, cap = 6, radial = 14): THREE.BufferGeometry =>
    new THREE.CapsuleGeometry(radius, length, cap, radial),
  torus: (radius: number, tube: number, radial = 12, tubular = 40, arc = Math.PI * 2): THREE.BufferGeometry =>
    new THREE.TorusGeometry(radius, tube, radial, tubular, arc),
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
    const pane = new THREE.Mesh(glass, materials.glass);
    pane.renderOrder = 2;
    group.add(pane);
  }
  parent.add(group);
  return group;
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
): ToyInstances {
  const materials = toyMaterials();
  const body = new THREE.InstancedMesh(geometry, materials.body, capacity);
  const ink = new THREE.InstancedMesh(geometry, materials.outline, capacity);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ink.instanceMatrix = body.instanceMatrix;
  body.frustumCulled = false;
  ink.frustumCulled = false;
  body.count = 0;
  ink.count = 0;
  if (castShadow) stage.shadow.add(body, materials.depth);
  parent.add(body, ink);
  const glassGeometry = geometry.userData.glass as THREE.BufferGeometry | undefined;
  let glass: THREE.InstancedMesh | null = null;
  if (glassGeometry) {
    glass = new THREE.InstancedMesh(glassGeometry, materials.glass, capacity);
    glass.instanceMatrix = body.instanceMatrix;
    glass.frustumCulled = false;
    glass.count = 0;
    glass.renderOrder = 2;
    parent.add(glass);
  }
  return {
    body,
    ink,
    setMatrixAt: (index, matrix) => body.setMatrixAt(index, matrix),
    commit(count) {
      body.count = count;
      ink.count = count;
      if (glass) glass.count = count;
      body.instanceMatrix.needsUpdate = true;
    },
  };
}

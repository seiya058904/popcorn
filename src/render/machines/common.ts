import * as THREE from 'three';
import type { Spring } from '../../motion/ease.ts';
import type { Rng } from '../../motion/rng.ts';
import { at, Kit, P, Pattern, type Paint } from '../geometry/kit.ts';
import type { SignStyle } from '../materials/sign.ts';

export { at, Kit, P, Pattern };
export type { Paint };

export interface UnitHost {
  rng: Rng;
  /** Launches a popcorn piece from a machine; the world limits how many fly at once. */
  launch(x: number, y: number, z: number): void;
  /** Height of the popcorn surface, so machines can sink into a rising heap. */
  heightAt(x: number, z: number): number;
  flash(x: number, y: number, z: number, size: number): void;
  smoke(x: number, y: number, z: number, size: number): void;
  caramel(x: number, y: number, z: number, size: number): void;
  ember(x: number, y: number, z: number, size: number): void;
  onCannonFired(): void;
}

export interface UnitState {
  age: number;
  /** Seconds until the next work cycle fires, out of `period`. */
  timer: number;
  period: number;
  hop: Spring;
  /** 1 at the moment of firing, fading quickly. */
  shake: number;
  /** 1 at the moment of firing, fading slowly: doors, lids and other follow-through. */
  kick: number;
  spin: number;
  lidSpin: number;
  /** 0 standing clear, 1 swallowed by the heap; negative until first placed. */
  sunk: number;
}

export type PutPart = (part: number, matrix: THREE.Matrix4) => void;

export interface MachineSign {
  text: string;
  style: SignStyle;
  width: number;
  height: number;
  matrix: THREE.Matrix4;
  /** The moving part the sign rides on. */
  part?: number;
}

export interface UnitDef {
  parts: Array<() => THREE.BufferGeometry>;
  /** Small inner parts skip the shadow pass; nobody can see their shadows. */
  shadowParts?: number;
  /** Seconds between work cycles. */
  interval: [number, number];
  tints?: string[];
  muzzle: [number, number, number];
  dropHeight: number;
  signs?: MachineSign[];
  pose(st: UnitState, time: number, index: number, tier: number, base: THREE.Matrix4, put: PutPart): void;
  fire?(st: UnitState, host: UnitHost, x: number, y: number, z: number, scale: number): void;
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far through its work cycle a machine is, 0 just after firing to 1 about to fire. */
export const cycleOf = (st: UnitState): number => Math.min(1, Math.max(0, 1 - st.timer / st.period));

/** Wind-up in the last part of the cycle. */
export const windUp = (st: UnitState, from = 0.72): number => smooth(from, 1, cycleOf(st));

export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const child = new THREE.Matrix4();
const local = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const size = new THREE.Vector3();

/** Places a part relative to the machine, with an optional stretch. */
export function putLocal(base: THREE.Matrix4, put: PutPart, part: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): void {
  euler.set(rx, ry, rz);
  quat.setFromEuler(euler);
  local.compose(pos.set(x, y, z), quat, size.set(sx, sy, sz));
  child.multiplyMatrices(base, local);
  put(part, child);
}

export const putIf = (put: PutPart, part: number, shown: boolean, base: THREE.Matrix4): void => put(part, shown ? base : HIDDEN);

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The workshop's material shelf. */
export const M = {
  chrome: { color: '#d3dce6', gloss: 0.92, metal: 1, pattern: Pattern.Brushed, wear: 0.2, fixedColor: true },
  steel: { color: '#98a4b2', gloss: 0.68, metal: 1, pattern: Pattern.Brushed, wear: 0.45, fixedColor: true },
  iron: { color: '#35333e', gloss: 0.5, metal: 0.8, wear: 0.75, fixedColor: true },
  darkIron: { color: '#24232b', gloss: 0.42, metal: 0.7, wear: 0.6, fixedColor: true },
  brass: { color: '#e4b252', gloss: 0.84, metal: 1, wear: 0.3, fixedColor: true },
  copper: { color: '#dc8750', gloss: 0.82, metal: 1, wear: 0.35, fixedColor: true },
  red: { color: '#d62f38', gloss: 0.86, coat: 0.5, pattern: Pattern.Enamel, wear: 0.3, fixedColor: true },
  deepRed: { color: '#9c1f2a', gloss: 0.7, coat: 0.3, pattern: Pattern.Enamel, wear: 0.3, fixedColor: true },
  cream: { color: '#f6e7cb', gloss: 0.72, coat: 0.3, pattern: Pattern.Enamel, wear: 0.25, fixedColor: true },
  butter: { color: '#ffc63f', gloss: 0.8, coat: 0.4, pattern: Pattern.Enamel, wear: 0.3, fixedColor: true },
  teal: { color: '#2b9c93', gloss: 0.78, coat: 0.35, pattern: Pattern.Enamel, wear: 0.3, fixedColor: true },
  navy: { color: '#27305e', gloss: 0.72, coat: 0.3, pattern: Pattern.Enamel, wear: 0.3, fixedColor: true },
  wood: { color: '#ad6f3e', gloss: 0.32, pattern: Pattern.Wood, wear: 0.4, fixedColor: true },
  darkWood: { color: '#6d3f24', gloss: 0.3, pattern: Pattern.Wood, wear: 0.4, fixedColor: true },
  rubber: { color: '#25242b', gloss: 0.18, pattern: Pattern.Rubber, fixedColor: true },
  canvasRed: { color: '#d8313a', gloss: 0.12, pattern: Pattern.Fabric, fixedColor: true },
  canvasCream: { color: '#fff0d4', gloss: 0.12, pattern: Pattern.Fabric, fixedColor: true },
  brick: { color: '#bd5f43', gloss: 0.12, pattern: Pattern.Brick, fixedColor: true },
  concrete: { color: '#b7ad9f', gloss: 0.1, pattern: Pattern.Plaster, fixedColor: true },
  windowPane: { color: '#2b3d58', gloss: 0.95, coat: 0.9, metal: 0.25, outline: 0, fixedColor: true },
  glass: { color: '#c6ecf6', glass: true },
  glassWarm: { color: '#ffe3b4', glass: true },
  popcorn: { color: '#fff4d8', gloss: 0.1, emissive: 0.42, outline: 0.2, fixedColor: true },
  bulb: { color: '#fff0c2', emissive: 1, outline: 0, fixedColor: true },
  glow: { color: '#ffd691', emissive: 0.75, outline: 0, fixedColor: true },
  coal: { color: '#ff7a2a', emissive: 0.95, outline: 0, fixedColor: true },
  dark: { color: '#1d1a22', gloss: 0.2, outline: 0, fixedColor: true },
} satisfies Record<string, Paint>;

export const paint = (base: Paint, extra: Partial<Paint>): Paint => ({ ...base, ...extra });

/** A straight rod between two points. */
export function rod(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: Paint, radial = 8): void {
  kit.add(P.tube([a, b], radius, 1, radial), material);
}

/** Scattered popcorn, each piece a few fused puffs so it never reads as a ball. */
export function puffs(kit: Kit, x: number, y: number, z: number, spreadX: number, spreadZ: number, count: number, size: number, seed = 1, material: Paint = M.popcorn): void {
  let s = seed * 9301 + 49297;
  const next = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i += 1) {
    const a = next() * Math.PI * 2;
    const r = Math.sqrt(next());
    const cx = x + Math.cos(a) * r * spreadX;
    const cz = z + Math.sin(a) * r * spreadZ;
    const cy = y + (1 - r) * size * 2.2 + next() * size * 0.5;
    for (let lobe = 0; lobe < 4; lobe += 1) {
      const b = next() * Math.PI * 2;
      const radius = size * (0.34 + next() * 0.28);
      const flat = 0.72 + next() * 0.35;
      kit.add(P.sphere(radius, 7, 5), { ...material, matrix: at(cx + Math.cos(b) * size * 0.5, cy + (next() - 0.4) * size * 0.6, cz + Math.sin(b) * size * 0.5, [next() * 3, next() * 3, 0], [1, flat, 1.1 - flat * 0.2]) });
    }
  }
}

/** A spoked wheel in the XY plane, facing along Z. */
export function spokedWheel(kit: Kit, x: number, y: number, z: number, radius: number, rim: Paint, spokes = 10): void {
  kit.add(P.torus(radius, radius * 0.075, 8, 32), { ...M.rubber, matrix: at(x, y, z) });
  kit.add(P.torus(radius * 0.88, radius * 0.05, 6, 32), { ...rim, outline: 0.4, matrix: at(x, y, z) });
  for (let i = 0; i < spokes; i += 1) {
    kit.add(P.box(radius * 1.72, radius * 0.05, radius * 0.05, radius * 0.015, 1), { ...rim, outline: 0, matrix: at(x, y, z, [0, 0, (i / spokes) * Math.PI]) });
  }
  kit.add(P.puck(radius * 0.17, radius * 0.13, radius * 0.24, 12, 0.01), { ...M.brass, matrix: at(x, y, z - radius * 0.12, [Math.PI / 2, 0, 0]) });
}

/** Four panes and their corner posts: a display case. */
export function glassCase(kit: Kit, cx: number, y0: number, y1: number, cz: number, halfX: number, halfZ: number, post: Paint, postSize = 0.05): void {
  const h = y1 - y0;
  const midY = (y0 + y1) / 2;
  kit.add(P.box(halfX * 2 - postSize, h, 0.012, 0.004, 1), { ...M.glass, matrix: at(cx, midY, cz + halfZ) });
  kit.add(P.box(halfX * 2 - postSize, h, 0.012, 0.004, 1), { ...M.glass, matrix: at(cx, midY, cz - halfZ) });
  kit.add(P.box(0.012, h, halfZ * 2 - postSize, 0.004, 1), { ...M.glass, matrix: at(cx + halfX, midY, cz) });
  kit.add(P.box(0.012, h, halfZ * 2 - postSize, 0.004, 1), { ...M.glass, matrix: at(cx - halfX, midY, cz) });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) kit.add(P.box(postSize, h, postSize, postSize * 0.3, 1), { ...post, matrix: at(cx + sx * halfX, midY, cz + sz * halfZ) });
  }
}

/** Small round studs along a line. */
export function rivets(kit: Kit, from: THREE.Vector3, to: THREE.Vector3, count: number, radius: number, material: Paint = M.brass): void {
  for (let i = 0; i < count; i += 1) {
    const p = from.clone().lerp(to, count > 1 ? i / (count - 1) : 0.5);
    kit.add(P.sphere(radius, 6, 4), { ...material, outline: 0, detail: 2, matrix: at(p.x, p.y, p.z) });
  }
}

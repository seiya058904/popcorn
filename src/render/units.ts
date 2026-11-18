import * as THREE from 'three';
import { easeOutCubic, Spring } from '../motion/ease.ts';
import type { Rng } from '../motion/rng.ts';
import type { Stage } from './core/stage.ts';
import { addToyInstances, at, Kit, P, type ToyInstances } from './geometry/kit.ts';
import type { UnitKindName, UnitSlot } from './scenes/types.ts';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const IRON = '#2d2b36';
const IRON_LIGHT = '#4a4757';
const RED = '#d8313a';
const CREAM = '#ffeccb';
const BUTTER = '#ffc53f';
const CHROME = '#c3d0dd';

// Geometry ---------------------------------------------------------------------

function panBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, 0],
        [0.62, 0],
        [0.68, 0.1],
        [0.7, 0.56],
        [0.76, 0.62],
        [0.72, 0.65],
        [0.64, 0.6],
        [0.62, 0.14],
        [0, 0.12],
      ],
      40,
      0.04,
      3,
    ),
    { color: '#ffffff', gloss: 0.9, ao: (p) => 0.68 + 0.32 * smooth(0, 0.3, p.y) },
  );
  kit.add(P.capsule(0.07, 0.95, 4, 10), { color: '#6d3d20', gloss: 0.4, matrix: at(1.28, 0.5, 0.26, [0, 0.19, Math.PI / 2 - 0.16]) });
  return kit.build();
}

function panLid(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, -0.01],
        [0.72, -0.01],
        [0.7, 0.05],
        [0.36, 0.17],
        [0, 0.2],
      ],
      36,
      0.05,
      3,
    ),
    { color: '#ffffff', gloss: 0.9 },
  );
  kit.add(P.sphere(0.09, 14, 10), { color: '#2a2933', gloss: 0.8, matrix: at(0, 0.26, 0) });
  return kit.build();
}

function cartBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Real stripes: separate painted boards, so they stay crisp at any distance.
  for (let i = 0; i < 7; i += 1) {
    kit.add(P.box(0.235, 0.74, 0.95, 0.03, 1), { color: i % 2 ? CREAM : RED, gloss: 0.8, outline: i === 0 || i === 6 ? 1 : 0, matrix: at(-0.705 + i * 0.235, 0.82, 0) });
  }
  kit.add(P.box(1.7, 0.08, 1.05, 0.03, 1), { color: CHROME, gloss: 1, matrix: at(0, 1.22, 0) });
  kit.add(P.box(1.7, 0.08, 1.05, 0.03, 1), { color: CHROME, gloss: 1, matrix: at(0, 0.43, 0) });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.add(P.box(0.06, 0.92, 0.06, 0.02, 1), { color: CHROME, gloss: 1, matrix: at(sx * 0.72, 1.7, sz * 0.42) });
    }
  }
  kit.add(P.box(1.56, 0.05, 0.9, 0.015, 1), { color: '#fff4dc', outline: 0, matrix: at(0, 1.27, 0) });
  // Heap settled on the floor of the case.
  const lumps: Array<[number, number, number]> = [
    [-0.45, 1.36, 0.15],
    [-0.2, 1.38, -0.18],
    [0.08, 1.36, 0.2],
    [0.35, 1.38, -0.1],
    [0.52, 1.35, 0.2],
    [-0.52, 1.35, -0.2],
  ];
  for (const [x, y, z] of lumps) kit.add(P.sphere(0.17, 9, 7), { color: '#fff3d4', gloss: 0.12, outline: 0.5, matrix: at(x, y, z) });
  // Striped awning.
  // Striped gable awning.
  for (let i = 0; i < 7; i += 1) {
    const x = -0.87 + i * 0.29;
    const color = i % 2 ? CREAM : RED;
    for (const side of [-1, 1]) {
      kit.add(P.box(0.285, 0.05, 0.78, 0.02, 1), { color, gloss: 0.65, outline: i === 0 || i === 6 ? 1 : 0.4, matrix: at(x, 2.34, side * 0.345, [side * 0.42, 0, 0]) });
    }
  }
  kit.add(P.capsule(0.04, 2, 2, 6), { color: BUTTER, gloss: 0.8, matrix: at(0, 2.5, 0, [0, 0, Math.PI / 2]) });
  kit.add(P.sphere(0.09, 10, 8), { color: BUTTER, gloss: 0.9, matrix: at(1.06, 2.5, 0) });
  kit.add(P.sphere(0.09, 10, 8), { color: BUTTER, gloss: 0.9, matrix: at(-1.06, 2.5, 0) });
  // Wheels and handle.
  for (const side of [-1, 1]) {
    const wheel = at(-0.32, 0.42, side * 0.56);
    kit.add(P.torus(0.36, 0.055, 8, 28), { color: BUTTER, gloss: 0.8, matrix: wheel });
    kit.add(P.sphere(0.08, 10, 8), { color: IRON, gloss: 0.5, matrix: wheel });
    for (let spoke = 0; spoke < 4; spoke += 1) {
      kit.add(P.box(0.68, 0.035, 0.035, 0.01, 1), { color: BUTTER, gloss: 0.6, outline: 0, matrix: at(-0.32, 0.42, side * 0.56, [0, 0, (spoke / 4) * Math.PI]) });
    }
  }
  kit.add(P.box(0.08, 0.5, 0.08, 0.03, 1), { color: IRON_LIGHT, matrix: at(0.62, 0.2, 0) });
  kit.add(P.tube([new THREE.Vector3(0.8, 1.05, -0.38), new THREE.Vector3(1.25, 1.3, -0.38), new THREE.Vector3(1.25, 1.3, 0.38), new THREE.Vector3(0.8, 1.05, 0.38)], 0.035, 18, 6), {
    color: CHROME,
    gloss: 1,
  });
  return kit.build();
}

function cartTumbler(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4;
    const r = 0.1 + (i % 3) * 0.1;
    kit.add(P.sphere(0.12 + (i % 2) * 0.03, 8, 6), { color: '#fff5dc', gloss: 0.12, outline: 0.5, matrix: at(Math.cos(a) * r, (i - 4) * 0.055, Math.sin(a) * r) });
  }
  return kit.build();
}

function cartSign(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.9, 0.3, 0.05, 0.05, 2), { color: BUTTER, gloss: 0.8, emissive: 0.18, matrix: at(0, 2.7, 0.0) });
  return kit.build();
}

function cinemaBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.2, 1.2, 1.5, 0.1, 2), { color: RED, gloss: 0.8, matrix: at(0, 0.6, 0) });
  kit.add(P.box(2.3, 0.1, 1.6, 0.03, 1), { color: BUTTER, gloss: 0.9, matrix: at(0, 1.24, 0) });
  for (const x of [-1.04, 1.04]) for (const z of [-0.68, 0.68]) kit.add(P.box(0.08, 1.5, 0.08, 0.03, 1), { color: BUTTER, gloss: 0.9, matrix: at(x, 2.02, z) });
  kit.add(P.box(2.3, 0.1, 1.6, 0.03, 1), { color: BUTTER, gloss: 0.9, matrix: at(0, 2.8, 0) });
  kit.add(P.box(2.4, 0.62, 0.22, 0.09, 2), { color: RED, gloss: 0.7, matrix: at(0, 3.2, 0.1) });
  kit.add(P.box(2.04, 0.38, 0.06, 0.05, 1), { color: CREAM, emissive: 0.5, outline: 0, matrix: at(0, 3.2, 0.23) });
  for (let i = 0; i < 12; i += 1) kit.add(P.sphere(0.2, 8, 6), { color: '#fff3d4', gloss: 0.1, outline: 0.4, matrix: at(-0.8 + (i % 6) * 0.32, 1.42 + (i % 2) * 0.12, -0.4 + (Math.floor(i / 6)) * 0.72) });
  return kit.build();
}

function cinemaKettle(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, -0.2], [0.34, -0.2], [0.4, 0.12], [0.3, 0.2], [0, 0.22]], 18, 0.05, 2), { color: CHROME, gloss: 1 });
  kit.add(P.capsule(0.03, 0.4, 2, 6), { color: IRON, matrix: at(0, 0.42, 0) });
  return kit.build();
}

function cinemaLamps(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 9; i += 1) kit.add(P.sphere(0.075, 6, 5), { color: '#fff1c4', emissive: 1, outline: 0, matrix: at(-1.04 + i * 0.26, 3.58, 0.14) });
  return kit.build();
}

function factoryBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const brick = '#c4684a';
  kit.add(P.box(4.6, 2.2, 2.8, 0.12, 2), { color: brick, gloss: 0.15, matrix: at(0, 1.1, 0), ao: (p) => 0.65 + 0.35 * Math.min(1, p.y) });
  // Saw-tooth roof, the factory silhouette every child draws.
  for (let i = 0; i < 4; i += 1) {
    kit.add(P.box(1.25, 0.1, 2.9, 0.03, 1), { color: '#6f4a44', gloss: 0.3, matrix: at(-1.72 + i * 1.15, 2.62, 0, [0, 0, 0.72]) });
    kit.add(P.box(0.08, 0.86, 2.8, 0.02, 1), { color: '#ffe3a0', emissive: 0.6, outline: 0, matrix: at(-1.26 + i * 1.15, 2.62, 0) });
  }
  for (let i = 0; i < 4; i += 1) kit.add(P.box(0.56, 0.72, 0.08, 0.05, 1), { color: '#ffd98a', emissive: 0.55, outline: 0, matrix: at(-1.65 + i * 1.1, 1.3, 1.42) });
  kit.add(P.box(1, 1.1, 0.1, 0.05, 1), { color: '#5c3a30', gloss: 0.3, outline: 0, matrix: at(1.4, 0.55, 1.42) });
  kit.add(P.lathe([[0, 0], [0.52, 0], [0.38, 3.2], [0.46, 3.3], [0.46, 3.5], [0, 3.5]], 16, 0.04, 1), { color: '#a9543c', gloss: 0.2, matrix: at(-1.6, 2, -0.7) });
  kit.add(P.torus(0.42, 0.05, 6, 16), { color: CREAM, gloss: 0.4, outline: 0, matrix: at(-1.6, 4.9, -0.7, [Math.PI / 2, 0, 0]) });
  kit.add(P.box(2, 0.46, 0.1, 0.08, 1), { color: BUTTER, gloss: 0.8, emissive: 0.15, matrix: at(0.6, 3.2, 1.2) });
  return kit.build();
}

function factoryChimney(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.4, 0], [0.3, 2.4], [0.38, 2.5], [0.38, 2.66], [0, 2.66]], 14, 0.03, 1), { color: '#a9543c', gloss: 0.2, matrix: at(0.1, 2.1, -0.8) });
  return kit.build();
}

function volcanoBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const rock = new THREE.Color('#6a4a58');
  const hot = new THREE.Color('#ff6a2a');
  kit.add(P.lathe([[0, 0], [2.7, 0], [2.3, 0.5], [0.95, 2.6], [0.72, 2.95], [0.5, 2.8], [0.3, 2.3], [0, 2.3]], 22, 0.14, 2), {
    color: rock,
    gloss: 0.12,
    colorFn: (p, _n, out) => {
      const a = Math.atan2(p.z, p.x);
      const river = Math.pow(Math.max(0, Math.cos(a * 3 + 0.6)), 22);
      out.lerp(hot, Math.max(p.y > 2.65 ? 1 : 0, river * Math.min(1, p.y / 0.8)));
    },
  });
  return kit.build();
}

function volcanoGlow(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.56, 0.56, 0.05, 16, 0.01), { color: '#ffb04a', emissive: 1, outline: 0, matrix: at(0, 2.42, 0) });
  return kit.build();
}

export function cannonFrame(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.4, 0.14, 1.3, 0.06, 2), { color: '#6a4227', gloss: 0.3, matrix: at(0, 0.07, 0) });
  for (const side of [-1, 1]) {
    const z = side * 0.52;
    kit.add(P.tube([new THREE.Vector3(-0.72, 0.1, z), new THREE.Vector3(0, 1.38, z)], 0.07, 6, 8), { color: IRON, gloss: 0.4 });
    kit.add(P.tube([new THREE.Vector3(0.72, 0.1, z), new THREE.Vector3(0, 1.38, z)], 0.07, 6, 8), { color: IRON, gloss: 0.4 });
    kit.add(P.sphere(0.12, 12, 9), { color: BUTTER, gloss: 0.8, matrix: at(0, 1.38, z) });
  }
  // The coal tray glows under the drum.
  kit.add(P.box(0.8, 0.12, 0.62, 0.04, 1), { color: IRON, gloss: 0.3, matrix: at(0, 0.34, 0) });
  for (let i = 0; i < 7; i += 1) {
    kit.add(P.sphere(0.09, 7, 5), { color: '#ff7a2a', emissive: 0.95, outline: 0, matrix: at(-0.3 + (i % 4) * 0.2, 0.43, -0.16 + ((i * 3) % 3) * 0.16) });
  }
  return kit.build();
}

/** The drum lies along X and spins about that axis. */
export function cannonDrum(): THREE.BufferGeometry {
  const kit = new Kit();
  const toX: [number, number, number] = [0, 0, -Math.PI / 2];
  kit.add(
    P.lathe(
      [
        [0, -1.08],
        [0.2, -1.08],
        [0.42, -0.86],
        [0.5, -0.45],
        [0.5, 0.45],
        [0.42, 0.86],
        [0.28, 1.04],
        [0.24, 1.08],
        [0, 1.08],
      ],
      28,
      0.08,
      4,
    ),
    { color: IRON, gloss: 0.75, matrix: at(0, 0, 0, toX) },
  );
  for (const x of [-0.55, 0, 0.55]) kit.add(P.torus(0.5, 0.035, 6, 28), { color: IRON_LIGHT, gloss: 0.8, outline: 0, matrix: at(x, 0, 0, [0, Math.PI / 2, 0]) });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    kit.add(P.sphere(0.038, 6, 5), { color: BUTTER, gloss: 0.8, outline: 0, matrix: at(0.28, Math.cos(a) * 0.5, Math.sin(a) * 0.5) });
  }
  kit.add(P.puck(0.1, 0.1, 0.14, 12, 0.02), { color: IRON_LIGHT, gloss: 0.6, matrix: at(-1.2, 0, 0, toX) });
  return kit.build();
}

export function cannonCap(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.3, 0], [0.3, 0.08], [0.14, 0.16], [0, 0.17]], 20, 0.03, 2), { color: RED, gloss: 0.9 });
  kit.add(P.sphere(0.06, 10, 7), { color: BUTTER, gloss: 0.9, matrix: at(0, 0.2, 0) });
  return kit.build();
}

// Rigs -------------------------------------------------------------------------

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

interface UnitState {
  age: number;
  timer: number;
  hop: Spring;
  shake: number;
  spin: number;
  lidHop: number;
  lidSpin: number;
  /** 0 standing clear, 1 swallowed by the heap; negative until first placed. */
  sunk: number;
}

interface UnitDef {
  parts: Array<() => THREE.BufferGeometry>;
  /** Small inner parts skip the shadow pass; nobody can see their shadows. */
  shadowParts?: number;
  interval: [number, number];
  tints?: string[];
  muzzle: [number, number, number];
  dropHeight: number;
  pose(st: UnitState, time: number, index: number, tier: number, base: THREE.Matrix4, put: (part: number, matrix: THREE.Matrix4) => void): void;
  fire?(st: UnitState, host: UnitHost, x: number, y: number, z: number, scale: number): void;
}

const child = new THREE.Matrix4();
const local = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
/** A machine goes under once the heap reaches this share of its height. */
const BURY_AT = 0.6;

const putLocal = (base: THREE.Matrix4, put: (part: number, matrix: THREE.Matrix4) => void, part: number, x: number, y: number, z: number, rx: number, ry: number, rz: number): void => {
  euler.set(rx, ry, rz);
  quat.setFromEuler(euler);
  local.compose(pos.set(x, y, z), quat, scale.set(1, 1, 1));
  child.multiplyMatrices(base, local);
  put(part, child);
};

export const UNIT_DEFS: Partial<Record<UnitKindName, UnitDef>> = {
  pan: {
    parts: [panBody, panLid],
    interval: [2.2, 4.2],
    tints: ['#fff0d2', '#ffc94f', '#8fe0c8', '#8cc4ff', '#ffa9a0', '#fff0d2', '#ffc94f', '#8fe0c8', '#8cc4ff', '#ffa9a0'],
    muzzle: [0, 0.72, 0],
    dropHeight: 4.5,
    pose(st, time, index, _tier, base, put) {
      put(0, base);
      const arc = 4 * st.lidHop * (1 - st.lidHop);
      putLocal(base, put, 1, 0, 0.64 + arc * (st.lidSpin !== 0 ? 1.15 : 0.16), 0, arc * 0.32, time * 0.1 + index, st.lidSpin * arc * 0.3);
    },
    fire(st, host) {
      const gag = host.rng.next() < 0.3;
      st.lidHop = gag ? 1 : 0.36;
      st.lidSpin = gag ? host.rng.range(4, 7) * host.rng.sign() : 0;
    },
  },
  cart: {
    parts: [cartBody, cartTumbler, cartSign],
    shadowParts: 1,
    interval: [1.3, 2.4],
    muzzle: [0, 2.3, 0],
    dropHeight: 6,
    pose(st, _time, _index, tier, base, put) {
      put(0, base);
      putLocal(base, put, 1, 0, 1.72, 0, st.spin * 0.7, st.spin, st.spin * 0.45);
      if (tier >= 1) put(2, base);
      else put(2, HIDDEN);
    },
  },
  cannon: {
    parts: [cannonFrame, cannonDrum],
    interval: [3.4, 5.6],
    muzzle: [1.36, 1.72, 0],
    dropHeight: 6,
    pose(st, _time, _index, _tier, base, put) {
      put(0, base);
      const recoil = Math.max(0, st.shake) * 0.22;
      putLocal(base, put, 1, -recoil, 1.42, 0, st.spin * 3, 0, 0.26);
    },
    fire(st, host, x, y, z, s) {
      st.shake = 1;
      host.flash(x, y, z, 1.1 * s);
      host.smoke(x, y, z, 0.9 * s);
      host.onCannonFired();
    },
  },
  cinema: {
    parts: [cinemaBody, cinemaKettle, cinemaLamps],
    shadowParts: 1,
    interval: [1.1, 2],
    muzzle: [0, 3, 0],
    dropHeight: 6,
    pose(st, time, index, tier, base, put) {
      put(0, base);
      const tip = Math.max(0, Math.sin(st.spin * 0.9));
      putLocal(base, put, 1, 0, 2.22, 0, 0, 0, tip * 0.75);
      // The marquee lights come on once the machine has earned a following.
      put(2, tier >= 1 || Math.sin(time * 5 + index) > 0 ? base : HIDDEN);
    },
  },
  factory: {
    parts: [factoryBody, factoryChimney],
    interval: [1.6, 2.8],
    muzzle: [-1.6, 5.7, -0.7],
    dropHeight: 5,
    pose(_st, _time, _index, tier, base, put) {
      put(0, base);
      if (tier >= 1) put(1, base);
      else put(1, HIDDEN);
    },
    fire(_st, host, x, y, z, s) {
      host.caramel(x, y, z, s);
    },
  },
  volcano: {
    parts: [volcanoBody, volcanoGlow],
    shadowParts: 1,
    interval: [0.9, 1.7],
    muzzle: [0, 3, 0],
    dropHeight: 3,
    pose(st, _time, _index, _tier, base, put) {
      put(0, base);
      const pulse = 1 + st.shake * 0.5;
      local.makeScale(pulse, 1, pulse);
      child.multiplyMatrices(base, local);
      put(1, child);
    },
    fire(_st, host, x, y, z, s) {
      host.flash(x, y, z, 1.2 * s);
      host.ember(x, y, z, s);
    },
  },
};

/** All visible copies of one unit type in one scene. */
export class UnitRig {
  private readonly def: UnitDef;
  private readonly slots: UnitSlot[];
  private readonly host: UnitHost;
  private readonly parts: ToyInstances[];
  private readonly cursors: number[];
  private readonly states: UnitState[] = [];
  private readonly base = new THREE.Matrix4();
  private readonly height: number;
  private tier = 0;

  constructor(stage: Stage, parent: THREE.Object3D, kind: UnitKindName, slots: UnitSlot[], host: UnitHost) {
    this.def = UNIT_DEFS[kind]!;
    this.slots = slots;
    this.host = host;
    const shadowParts = this.def.shadowParts ?? this.def.parts.length;
    let height = 0;
    this.parts = this.def.parts.map((make, index) => {
      const geometry = make();
      geometry.computeBoundingBox();
      height = Math.max(height, geometry.boundingBox!.max.y);
      return addToyInstances(stage, parent, geometry, slots.length, index < shadowParts);
    });
    this.height = height;
    this.cursors = this.parts.map(() => 0);
    const tints = this.def.tints;
    if (tints) {
      const color = new THREE.Color();
      for (const part of this.parts) {
        slots.forEach((_slot, index) => {
          color.set(tints[index % tints.length]!);
          part.body.setColorAt(index, color);
        });
        part.ink.instanceColor = part.body.instanceColor;
      }
    }
  }

  get visible(): number {
    return this.states.length;
  }

  hide(): void {
    for (const part of this.parts) part.commit(0);
    this.states.length = 0;
  }

  sync(owned: number, animate: boolean, delay = 0): void {
    const count = Math.min(owned, this.slots.length);
    this.tier = owned >= 100 ? 3 : owned >= 50 ? 2 : owned >= 25 ? 1 : 0;
    while (this.states.length < count) {
      this.states.push({
        age: animate ? -delay : 10,
        timer: this.host.rng.range(0.3, this.def.interval[1]),
        hop: new Spring(0, 260, 11),
        shake: 0,
        spin: this.host.rng.range(0, 6),
        lidHop: 0,
        lidSpin: 0,
        sunk: -1,
      });
    }
    this.states.length = Math.min(this.states.length, count);
  }

  update(dt: number, time: number, tempo: number): void {
    const def = this.def;
    this.cursors.fill(0);
    const put = (part: number, matrix: THREE.Matrix4): void => {
      this.parts[part]!.setMatrixAt(this.cursors[part]!, matrix);
      this.cursors[part]! += 1;
    };
    const speed = 1 + this.tier * 0.35;
    this.states.forEach((st, index) => {
      st.age += dt;
      const slot = this.slots[index]!;
      const s = slot.scale ?? 1;
      if (st.age < 0) {
        for (let part = 0; part < this.parts.length; part += 1) put(part, HIDDEN);
        return;
      }
      // Half-buried machines leave odd scraps poking out, so the heap swallows them whole.
      const height = this.height * s;
      const line = slot.y + height * BURY_AT;
      const surface = this.host.heightAt(slot.x, slot.z);
      const under = surface > line || (st.sunk > 0.5 && surface > line - height * 0.08);
      st.sunk = st.sunk < 0 ? (under ? 1 : 0) : THREE.MathUtils.clamp(st.sunk + (under ? dt : -dt) * 2.4, 0, 1);
      if (st.sunk >= 1) {
        for (let part = 0; part < this.parts.length; part += 1) put(part, HIDDEN);
        return;
      }
      st.timer -= dt * tempo * speed;
      st.spin += dt * (2.2 + tempo) * speed;
      const rotation = slot.rotation ?? 0;
      if (st.timer <= 0 && st.age > 0.7) {
        st.timer = this.host.rng.range(def.interval[0], def.interval[1]);
        st.shake = 1;
        st.hop.kick(1.9);
        // Muzzle position in world space, honoring the slot's turn and scale.
        const c = Math.cos(rotation);
        const sn = Math.sin(rotation);
        const [mx, my, mz] = def.muzzle;
        const x = slot.x + (mx * c + mz * sn) * s;
        const y = slot.y + my * s;
        const z = slot.z + (-mx * sn + mz * c) * s;
        def.fire?.(st, this.host, x, y, z, s);
        this.host.launch(x, y, z);
      }
      st.shake = Math.max(0, st.shake - dt * 3.2);
      st.lidHop = Math.max(0, st.lidHop - dt * 1.55);
      const hop = st.hop.update(dt);
      const drop = 1 - easeOutCubic(st.age / 0.42);
      const landing = st.age < 0.75 ? Math.exp(-(st.age - 0.42) * 12) * Math.sin(Math.max(0, st.age - 0.42) * 38) * 0.2 : 0;
      const jitter = st.shake * 0.018 * s;
      pos.set(
        slot.x + Math.sin(time * 61 + index) * jitter,
        slot.y + (drop * drop * def.dropHeight + Math.max(0, hop) * 0.06) * s - st.sunk * st.sunk * height * 0.85,
        slot.z + Math.cos(time * 53 + index) * jitter,
      );
      const squash = 1 + landing - hop * 0.05;
      euler.set(0, rotation, 0);
      quat.setFromEuler(euler);
      const shrink = s * (1 - st.sunk * 0.3);
      scale.set(shrink * (1 + (1 - squash) * 0.5), shrink * squash, shrink * (1 + (1 - squash) * 0.5));
      this.base.compose(pos, quat, scale);
      def.pose(st, time, index, this.tier, this.base, put);
    });
    this.parts.forEach((part, index) => part.commit(this.cursors[index]!));
  }
}

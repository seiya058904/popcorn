import * as THREE from 'three';
import { lerp } from '../../motion/ease.ts';
import type { LightRig } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { addToy, addToyInstances, at, Kit, P, type ToyInstances } from '../geometry/kit.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { PileShape } from '../popcorn/pile.ts';

export const POT = { floorY: 0.42, rimY: 1.46, innerR: 1.12, outerR: 1.24 };

const C = {
  teal: '#14646b',
  tealDeep: '#0f525a',
  grout: '#08323a',
  mint: '#46b39a',
  mintDeep: '#2f8f80',
  cream: '#f6dfb8',
  butter: '#ffc23e',
  red: '#cf2f38',
  navy: '#20203c',
  drip: '#1d2c44',
  iron: '#24232c',
  chrome: '#b9c7d6',
  sky: '#1d2466',
  dusk: '#c8638b',
  moon: '#fff1c4',
};

export const stoveLight: LightRig = {
  sunDir: [0.42, 0.95, 0.56],
  sunColor: '#fff0d6',
  sunIntensity: 1.3,
  shadeTint: '#4d4580',
  sky: '#7f9bd6',
  skyIntensity: 0.26,
  ground: '#c9825a',
  groundIntensity: 0.14,
  rim: '#a6dcff',
  rimIntensity: 0.6,
  rimDir: [-0.72, 0.34, -0.6],
  fog: '#0a2a33',
  fogRange: [16, 36],
  pool: [0, 0.6, 0.1, 4.3],
  poolFloor: 0.34,
};

export const stoveCamera = {
  position: new THREE.Vector3(0.2, 5.05, 13.5),
  target: new THREE.Vector3(0.0, 1.5, -0.4),
  /** Opening framing: close on the pot, easing back as the heap needs room. */
  closeTarget: new THREE.Vector3(0.0, 1.12, 0.0),
  closeDistance: 0.6,
  fov: 27,
  focusRange: 3.8,
  shiftX: 0.075,
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const moundPeak = (level: number): number => lerp(POT.floorY + 0.1, 2.75, Math.pow(level, 0.85));
const moundSlope = (level: number): number => lerp(1.15, 0.44, level);
const moundAt = (r: number, level: number): number => moundPeak(level) - moundSlope(level) * Math.pow(r, 1.35);

export const stovePile: PileShape = {
  centerX: 0,
  centerZ: 0,
  size: 10,
  flakeScale: 0.2,
  floor(x, z) {
    const r = Math.hypot(x, z);
    if (r < POT.innerR) return POT.floorY;
    if (r < POT.outerR + 0.05) return POT.rimY;
    return 0.01;
  },
  mound(x, z, level, wobble) {
    const r = Math.hypot(x, z);
    if (r < POT.outerR + 0.05) return moundAt(r, level);
    // Outside the pot there is nothing until the heap crests the rim, then it spills in tongues.
    const crest = moundAt(POT.innerR, level) - POT.rimY;
    if (crest <= 0) return -1;
    const reach = POT.outerR + crest * 3.1 * (1 + wobble * 0.5);
    const edge = smooth(reach, reach - Math.max(0.9, (reach - POT.outerR) * 0.7), r);
    return edge <= 0 ? -1 : lerp(-0.12, moundAt(r * (1 + wobble * 0.08), level), edge);
  },
  landingRadius(level) {
    const reach = Math.pow(Math.max(0, moundPeak(level) - POT.floorY) / moundSlope(level), 1 / 1.35);
    const crest = moundAt(POT.innerR, level) - POT.rimY;
    const limit = crest > 0 ? POT.innerR + crest * 1.1 : POT.innerR * 0.92;
    return Math.max(0.22, Math.min(reach * 0.85, limit));
  },
  density(x, z) {
    const r = Math.hypot(x, z);
    return r < 1.2 ? 0.75 : lerp(1, 0.05, smooth(2.3, 3.9, r));
  },
  wallHeight: POT.rimY,
  clearance(x, z) {
    const r = Math.hypot(x, z);
    if (r < POT.innerR) return smooth(POT.innerR - 0.05, POT.innerR - 0.24, r);
    return smooth(POT.outerR + 0.1, POT.outerR + 0.3, r);
  },
};

/** The first four pans get a burner; later ones wait on wooden trivets. */
export const PAN_SLOTS: ReadonlyArray<THREE.Vector3Tuple> = [
  [-3.3, 0.26, 0.8],
  [3.45, 0.26, 0.95],
  [-3.15, 0.26, -1.5],
  [5.05, 0.26, -1.2],
  [-5.75, 0.01, -0.35],
  [5.95, 0.01, 0.6],
  [-1.55, 0.01, -2.25],
  [-5.2, 0.01, -2.1],
];

const BURNER_PANS = 4;

export const BURNERS: ReadonlyArray<THREE.Vector3Tuple> = [
  [0, 0.03, 0],
  ...PAN_SLOTS.slice(0, BURNER_PANS).map(([x, , z]): THREE.Vector3Tuple => [x, 0.03, z]),
];

function addWall(kit: Kit): void {
  kit.add(P.box(34, 16, 0.3, 0.02, 1), { color: C.grout, gloss: 0, outline: 0, matrix: at(0, 6, -3.75) });
  const tile = 0.74;
  const gap = 0.055;
  let seed = 7;
  const next = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < 11; row += 1) {
    for (let col = -13; col <= 13; col += 1) {
      const x = col * (tile + gap);
      const y = 0.45 + row * (tile + gap);
      const tint = new THREE.Color((row + col) & 1 ? C.teal : C.tealDeep).offsetHSL(0, 0, (next() - 0.5) * 0.016);
      kit.add(P.box(tile, tile, 0.09, 0.035, 1), {
        color: tint,
        gloss: 0.6,
        outline: 0,
        matrix: at(x, y, -3.58, [(next() - 0.5) * 0.012, (next() - 0.5) * 0.012, 0]),
      });
    }
  }
}

function addStoveBody(kit: Kit): void {
  const contact = (p: THREE.Vector3): number => lerp(0.5, 1, smooth(1.15, 2.4, Math.hypot(p.x, p.z)));
  kit.add(P.box(14.4, 0.34, 6.5, 0.14, 4), { color: C.mint, gloss: 0.62, ao: contact, matrix: at(0, -0.17, -0.3) });
  kit.add(P.box(14.7, 0.1, 6.8, 0.05, 2), { color: C.chrome, gloss: 1, matrix: at(0, -0.38, -0.3) });
  kit.add(P.box(14.4, 1.75, 0.7, 0.12, 3), { color: C.cream, gloss: 0.55, matrix: at(0, -1.3, 2.72) });
  kit.add(P.box(14.4, 4, 6, 0.1, 1), { color: C.mintDeep, gloss: 0.3, outline: 0, matrix: at(0, -3.2, -0.4) });

  // Back guard: the unmistakable 1950s range silhouette.
  kit.add(P.box(14.4, 1.2, 0.5, 0.2, 4), { color: C.mint, gloss: 0.62, matrix: at(0, 0.54, -3.2) });
  kit.add(P.box(14.0, 0.12, 0.56, 0.05, 2), { color: C.chrome, gloss: 1, matrix: at(0, 1.12, -3.18) });

  const clock = at(-0.2, 0.58, -2.95, [Math.PI / 2, 0, 0]);
  kit.add(P.puck(0.42, 0.38, 0.07, 40, 0.02), { color: C.chrome, gloss: 1, matrix: clock });
  kit.add(P.puck(0.34, 0.33, 0.085, 40, 0.01), { color: C.cream, gloss: 0.5, outline: 0, matrix: clock });
  for (let hour = 0; hour < 12; hour += 1) {
    const a = (hour / 12) * Math.PI * 2;
    kit.add(P.box(0.022, 0.05, 0.01, 0.004, 1), {
      color: C.navy,
      outline: 0,
      matrix: at(-0.2 + Math.sin(a) * 0.27, 0.58 + Math.cos(a) * 0.27, -2.86, [0, 0, -a]),
    });
  }

  for (let i = -3; i <= 3; i += 1) {
    const x = i * 1.75;
    kit.add(P.puck(0.3, 0.26, 0.05, 28, 0.015), { color: C.chrome, gloss: 1, matrix: at(x, -1.05, 3.07, [Math.PI / 2, 0, 0]) });
    kit.add(P.puck(0.2, 0.16, 0.2, 24, 0.04), { color: C.red, gloss: 0.9, matrix: at(x, -1.05, 3.1, [Math.PI / 2, 0, 0]) });
    kit.add(P.box(0.05, 0.2, 0.04, 0.012, 1), { color: C.cream, outline: 0, matrix: at(x, -1.05, 3.31, [0, 0, i * 0.55]) });
  }
}

function addBurner(kit: Kit, x: number, z: number): void {
  kit.add(P.puck(0.86, 0.82, 0.03, 40, 0.012), { color: C.drip, gloss: 0.7, outline: 0, matrix: at(x, 0, z) });
  kit.add(P.torus(0.84, 0.018, 8, 48), { color: C.chrome, gloss: 1, outline: 0, matrix: at(x, 0.03, z, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.4, 0.33, 0.09, 28, 0.03), { color: C.iron, gloss: 0.3, outline: 0.6, matrix: at(x, 0.02, z) });
  kit.add(P.torus(0.74, 0.042, 8, 40), { color: C.iron, gloss: 0.35, matrix: at(x, 0.255, z, [Math.PI / 2, 0, 0]) });
  for (let a = 0; a < 4; a += 1) {
    const angle = (a / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = x + Math.cos(angle) * 0.56;
    const cz = z + Math.sin(angle) * 0.56;
    kit.add(P.box(0.4, 0.07, 0.085, 0.03, 2), { color: C.iron, gloss: 0.35, matrix: at(cx, 0.255, cz, [0, -angle, 0]) });
    kit.add(P.box(0.075, 0.25, 0.075, 0.03, 2), {
      color: C.iron,
      gloss: 0.3,
      matrix: at(x + Math.cos(angle) * 0.74, 0.125, z + Math.sin(angle) * 0.74),
    });
  }
}

const WINDOW = { x: -3.95, y: 3.72 };

function addWindow(kit: Kit): void {
  const { x: cx, y: cy } = WINDOW;
  const duskColor = new THREE.Color(C.dusk);
  const skyColor = new THREE.Color(C.sky);
  kit.add(P.box(3.2, 3.1, 0.12, 0.05, 2), {
    color: C.sky,
    gloss: 0,
    emissive: 0.5,
    outline: 0,
    matrix: at(cx, cy, -3.46),
    colorFn: (p, _n, out) => {
      out.lerpColors(duskColor, skyColor, Math.pow(smooth(cy - 1.55, cy + 1.35, p.y), 0.62));
    },
  });
  const frame = { color: C.cream, gloss: 0.45 };
  kit.add(P.box(3.5, 0.18, 0.24, 0.07, 3), { ...frame, matrix: at(cx, cy + 1.58, -3.38) });
  kit.add(P.box(3.8, 0.2, 0.46, 0.07, 3), { ...frame, matrix: at(cx, cy - 1.58, -3.28) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx - 1.67, cy, -3.38) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx + 1.67, cy, -3.38) });
  kit.add(P.box(0.08, 3.1, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy, -3.39) });
  kit.add(P.box(3.2, 0.08, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy + 0.1, -3.39) });

  const stars: Array<[number, number, number]> = [
    [-1.1, 1.05, 0.035],
    [-0.5, 0.75, 0.025],
    [0.9, 1.2, 0.03],
    [1.25, 0.55, 0.022],
    [-1.3, 0.35, 0.024],
    [0.3, 0.62, 0.02],
  ];
  for (const [x, y, r] of stars) {
    kit.add(P.sphere(r, 8, 6), { color: C.moon, emissive: 1, outline: 0, matrix: at(cx + x, cy + y, -3.38) });
  }

  for (let i = -4; i <= 4; i += 1) {
    kit.add(P.sphere(0.23, 16, 10), {
      color: i % 2 === 0 ? C.butter : C.cream,
      gloss: 0.15,
      matrix: at(cx + i * 0.39, cy + 1.4, -3.27, [0, 0, 0], [1, 0.86, 0.45]),
    });
  }
}

function addForeground(kit: Kit): void {
  kit.add(
    P.lathe(
      [
        [0, 0],
        [0.32, 0],
        [0.28, 0.6],
        [0.21, 0.82],
        [0, 0.88],
      ],
      24,
      0.06,
    ),
    { color: C.cream, gloss: 0.7, matrix: at(-5.9, 0, 2.05) },
  );
  kit.add(P.sphere(0.23, 20, 12), { color: C.chrome, gloss: 1, matrix: at(-5.9, 0.82, 2.05, [0, 0, 0], [1, 0.62, 1]) });
  kit.add(P.box(1.3, 0.1, 0.76, 0.05, 3), { color: C.butter, gloss: 0.55, matrix: at(5.7, 0.05, 2.2, [0, 0.3, 0]) });
  kit.add(P.box(0.86, 0.32, 0.44, 0.05, 2), { color: '#ffe48a', gloss: 0.4, matrix: at(5.7, 0.26, 2.2, [0, 0.3, 0]) });
}

function potGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = POT;
  const kit = new Kit();
  const body = (p: THREE.Vector3): number => lerp(0.6, 1, smooth(0.3, 0.8, p.y));
  kit.add(
    P.lathe(
      [
        [0, 0.3],
        [1.08, 0.3],
        [1.2, 0.42],
        [o, r - 0.12],
        [o + 0.03, r - 0.04],
      ],
      84,
      0.09,
      6,
    ),
    { color: C.red, gloss: 0.95, ao: body },
  );
  kit.add(
    P.lathe(
      [
        [o + 0.02, r - 0.06],
        [o + 0.055, r - 0.01],
        [o + 0.02, r + 0.03],
        [i + 0.015, r + 0.025],
        [i - 0.012, r - 0.03],
      ],
      84,
      0.02,
    ),
    { color: C.cream, gloss: 0.85 },
  );
  kit.add(
    P.lathe(
      [
        [i, r - 0.02],
        [i - 0.025, f + 0.2],
        [i - 0.2, f],
        [0, f],
      ],
      84,
      0.14,
    ),
    { color: C.navy, gloss: 0.4, outline: 0, ao: (p) => lerp(0.4, 1, smooth(f, r, p.y)) },
  );
  kit.add(
    P.lathe(
      [
        [o - 0.006, 0.95],
        [o + 0.011, 0.96],
        [o + 0.011, 1.07],
        [o - 0.006, 1.08],
      ],
      84,
      0.006,
      2,
    ),
    { color: C.cream, gloss: 0.9, outline: 0 },
  );
  for (const side of [-1, 1]) {
    const ear = at(side * (o + 0.1), r - 0.3, 0, [Math.PI / 2, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    kit.add(P.torus(0.19, 0.05, 12, 28, Math.PI), { color: C.cream, gloss: 0.8, matrix: ear });
  }
  return kit.build();
}

function lidGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, -0.03],
        [1.3, -0.03],
        [1.32, 0.02],
        [1.22, 0.1],
        [0.82, 0.32],
        [0.3, 0.42],
        [0, 0.43],
      ],
      72,
      0.08,
      6,
    ),
    { color: C.red, gloss: 0.95 },
  );
  kit.add(
    P.lathe(
      [
        [1.24, 0.02],
        [1.325, 0.0],
        [1.33, 0.04],
        [1.25, 0.09],
      ],
      72,
      0.015,
      2,
    ),
    { color: C.cream, gloss: 0.9, outline: 0 },
  );
  kit.add(P.puck(0.14, 0.1, 0.1, 20, 0.03), { color: C.chrome, gloss: 1, matrix: at(0, 0.41, 0) });
  kit.add(P.sphere(0.21, 24, 16), { color: C.cream, gloss: 0.9, matrix: at(0, 0.6, 0, [0, 0, 0], [1, 0.8, 1]) });
  return kit.build();
}

function panBodyGeometry(): THREE.BufferGeometry {
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
    { color: '#ffffff', gloss: 0.9, ao: (p) => lerp(0.68, 1, smooth(0, 0.3, p.y)) },
  );
  kit.add(P.capsule(0.07, 0.95, 4, 10), { color: '#6d3d20', gloss: 0.4, matrix: at(1.28, 0.5, 0.26, [0, 0.19, Math.PI / 2 - 0.16]) });
  return kit.build();
}

function panLidGeometry(): THREE.BufferGeometry {
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

export interface StoveScene {
  root: THREE.Group;
  pot: THREE.Group;
  lid: THREE.Group;
  lidRest: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  moon: THREE.Mesh;
  moonHome: THREE.Vector3;
  pans: { body: ToyInstances; lid: ToyInstances };
}

export function buildStoveScene(stage: Stage, parent: THREE.Object3D): StoveScene {
  const root = new THREE.Group();
  parent.add(root);

  const set = new Kit();
  addWall(set);
  addStoveBody(set);
  addBurner(set, 0, 0);
  for (const [x, , z] of PAN_SLOTS.slice(0, BURNER_PANS)) addBurner(set, x, z);
  addWindow(set);
  addForeground(set);
  addToy(stage, root, set.build());

  const pot = addToy(stage, root, potGeometry());

  // The lid leans on the back guard until the popcorn sends it flying.
  const lid = addToy(stage, root, lidGeometry());
  const lidRest = {
    position: new THREE.Vector3(3.05, 1.12, -2.62),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(1.3, -0.2, 0, 'YXZ')),
  };
  lid.position.copy(lidRest.position);
  lid.quaternion.copy(lidRest.quaternion);
  lid.scale.setScalar(0.84);

  const moonKit = new Kit();
  moonKit.add(P.sphere(0.56, 40, 28), {
    color: C.moon,
    emissive: 0.9,
    outline: 0,
    colorFn: (p, _n, out) => {
      const crater =
        Math.max(0, 1 - Math.hypot(p.x - 0.14, p.y - 0.2) / 0.16) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x + 0.2, p.y + 0.08) / 0.11) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x - 0.1, p.y + 0.27) / 0.09) * 0.18;
      out.multiplyScalar(1 - crater);
    },
  });
  const moon = new THREE.Mesh(moonKit.build(), toyMaterials().body);
  const moonHome = new THREE.Vector3(WINDOW.x - 0.62, WINDOW.y + 0.62, -3.4);
  moon.position.copy(moonHome);
  moon.scale.z = 0.12;
  root.add(moon);

  const pans = {
    body: addToyInstances(stage, root, panBodyGeometry(), PAN_SLOTS.length),
    lid: addToyInstances(stage, root, panLidGeometry(), PAN_SLOTS.length),
  };
  const tints = ['#fff0d2', '#ffc94f', '#8fe0c8', '#8cc4ff', '#ffa9a0', '#fff0d2', '#ffc94f', '#8fe0c8'];
  const color = new THREE.Color();
  tints.forEach((tint, index) => {
    color.set(tint);
    pans.body.body.setColorAt(index, color);
    pans.lid.body.setColorAt(index, color);
  });
  for (const mesh of [pans.body, pans.lid]) mesh.ink.instanceColor = mesh.body.instanceColor;

  return { root, pot, lid, lidRest, moon, moonHome, pans };
}

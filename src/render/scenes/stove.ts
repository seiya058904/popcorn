import * as THREE from 'three';
import { lerp, Spring } from '../../motion/ease.ts';
import type { Stage } from '../core/stage.ts';
import { addLightBeam } from '../fx/beam.ts';
import { Flames } from '../fx/flames.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, at, Kit, P, Pattern } from '../geometry/kit.ts';
import { lightGroup, type Lamp } from '../core/globals.ts';
import { puffs } from '../machines/common.ts';
import { blendSky, skyMaterial, skyUniforms, type SkyLook } from '../materials/sky.ts';
import type { SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';
import { dressStove } from './dress.ts';
import { Cues, gag, Pulse, Wobble, type EggSpot } from './eggs.ts';
import { NEON_PINK, neonPop, SetPieces, toyFigure } from './pieces.ts';
import { alongStory, LightBank } from './story.ts';
import { vesselPile } from './vessel.ts';

export const POT = { floorY: 0.68, rimY: 1.46, innerR: 1.12, outerR: 1.24 };

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

/** Finished runs unlock new enamel colors for the pot. */
const POT_SKINS = ['#cf2f38', '#3fae94', '#f0b02c', '#4c8be0', '#2d2c3a', '#c3cdd8'];
let potColor = POT_SKINS[0]!;

export function setPotSkin(index: number): void {
  potColor = POT_SKINS[Math.min(index, POT_SKINS.length - 1)]!;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const PAN_Y_BURNER = 0.26;
const PAN_Y_TOP = 0.01;

/** The first four pans get a burner; later ones stand on the enamel. */
const PAN_SLOTS: UnitSlot[] = [
  { x: -3.3, y: PAN_Y_BURNER, z: 0.8, rotation: 0.5 },
  { x: 3.45, y: PAN_Y_BURNER, z: 0.95, rotation: 2.2 },
  { x: -3.15, y: PAN_Y_BURNER, z: -1.5, rotation: 3.9 },
  { x: 5.05, y: PAN_Y_BURNER, z: -1.2, rotation: 5.6 },
  { x: -5.75, y: PAN_Y_TOP, z: -0.35, rotation: 7.3 },
  { x: 5.95, y: PAN_Y_TOP, z: 0.6, rotation: 9 },
  { x: -1.55, y: PAN_Y_TOP, z: -2.25, rotation: 10.7 },
  { x: -5.2, y: PAN_Y_TOP, z: -2.1, rotation: 12.4 },
];
const BURNER_PANS = 4;

const MICROWAVE_SLOTS: UnitSlot[] = [
  // On the window sill, where a growing heap cannot hide them.
  { x: -4.85, y: 2.24, z: -3.12, rotation: 0.08, scale: 0.62 },
  { x: -3.05, y: 2.24, z: -3.12, rotation: -0.08, scale: 0.62 },
  { x: 1.9, y: PAN_Y_TOP, z: -2.65, rotation: -0.08, scale: 0.92 },
];

/** On the enamel at the back, clear of the burners. */
const TOASTER_SLOTS: UnitSlot[] = [
  { x: 4.85, y: PAN_Y_TOP, z: -2.65, rotation: -0.12, scale: 0.9 },
  { x: 6.85, y: PAN_Y_TOP, z: -2.35, rotation: -0.4, scale: 0.9 },
  { x: -6.85, y: PAN_Y_TOP, z: 1.25, rotation: 0.55, scale: 0.9 },
];

const BURNERS: THREE.Vector3Tuple[] = [
  [0, 0.03, 0],
  ...PAN_SLOTS.slice(0, BURNER_PANS).map((slot): THREE.Vector3Tuple => [slot.x, 0.03, slot.z]),
];

function addWall(kit: Kit): void {
  kit.add(P.box(21.8, 8.95, 0.3, 0.02, 1), { color: C.grout, gloss: 0, outline: 0, matrix: at(0, 4.4, -3.75) });
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
        gloss: 0.72,
        coat: 0.35,
        pattern: Pattern.Enamel,
        outline: 0,
        matrix: at(x, y, -3.58, [(next() - 0.5) * 0.012, (next() - 0.5) * 0.012, 0]),
      });
    }
  }
}

function addStoveBody(kit: Kit): void {
  const contact = (p: THREE.Vector3): number => lerp(0.5, 1, smooth(1.15, 2.4, Math.hypot(p.x, p.z)));
  kit.add(P.box(14.4, 0.34, 6.5, 0.14, 4), { color: C.mint, gloss: 0.62, coat: 0.24, pattern: Pattern.Enamel, ao: contact, matrix: at(0, -0.17, -0.3) });
  kit.add(P.box(14.7, 0.1, 6.8, 0.05, 2), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(0, -0.38, -0.3) });
  kit.add(P.box(14.4, 1.75, 0.7, 0.12, 3), { color: C.cream, gloss: 0.55, matrix: at(0, -1.3, 2.72) });
  kit.add(P.box(14.4, 4, 6, 0.1, 1), { color: C.mintDeep, gloss: 0.3, outline: 0, matrix: at(0, -3.2, -0.4) });

  // Back guard: the unmistakable 1950s range silhouette.
  kit.add(P.box(14.4, 1.2, 0.5, 0.2, 4), { color: C.mint, gloss: 0.62, matrix: at(0, 0.54, -3.2) });
  kit.add(P.box(14.0, 0.12, 0.56, 0.05, 2), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(0, 1.12, -3.18) });

  const clock = at(-0.2, 0.58, -2.95, [Math.PI / 2, 0, 0]);
  kit.add(P.puck(0.42, 0.38, 0.07, 40, 0.02), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: clock });
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
    kit.add(P.puck(0.3, 0.26, 0.05, 28, 0.015), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(x, -1.05, 3.07, [Math.PI / 2, 0, 0]) });
    kit.add(P.puck(0.2, 0.16, 0.2, 24, 0.04), { color: C.red, gloss: 0.9, matrix: at(x, -1.05, 3.1, [Math.PI / 2, 0, 0]) });
    kit.add(P.box(0.05, 0.2, 0.04, 0.012, 1), { color: C.cream, outline: 0, matrix: at(x, -1.05, 3.31, [0, 0, i * 0.55]) });
  }
}

function addBurner(kit: Kit, x: number, z: number): void {
  kit.add(P.puck(0.86, 0.82, 0.03, 40, 0.012), { color: C.drip, gloss: 0.7, outline: 0, matrix: at(x, 0, z) });
  kit.add(P.torus(0.84, 0.018, 8, 48), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, outline: 0, matrix: at(x, 0.03, z, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.4, 0.33, 0.09, 28, 0.03), { color: C.iron, gloss: 0.42, metal: 0.65, wear: 0.6, outline: 0.6, matrix: at(x, 0.02, z) });
  kit.add(P.torus(0.74, 0.042, 8, 40), { color: C.iron, gloss: 0.45, metal: 0.7, wear: 0.7, matrix: at(x, 0.255, z, [Math.PI / 2, 0, 0]) });
  for (let a = 0; a < 4; a += 1) {
    const angle = (a / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = x + Math.cos(angle) * 0.56;
    const cz = z + Math.sin(angle) * 0.56;
    kit.add(P.box(0.4, 0.07, 0.085, 0.03, 2), { color: C.iron, gloss: 0.45, metal: 0.7, wear: 0.7, matrix: at(cx, 0.255, cz, [0, -angle, 0]) });
    kit.add(P.box(0.075, 0.25, 0.075, 0.03, 2), {
      color: C.iron,
      gloss: 0.3,
      matrix: at(x + Math.cos(angle) * 0.74, 0.125, z + Math.sin(angle) * 0.74),
    });
  }
}

const WINDOW = { x: -3.95, y: 3.72 };

/** The window frame; the sky behind it is its own pane, so it can darken as evening falls. */
function addWindow(kit: Kit): void {
  const { x: cx, y: cy } = WINDOW;
  const frame = { color: C.cream, gloss: 0.45 };
  kit.add(P.box(3.5, 0.18, 0.24, 0.07, 3), { ...frame, matrix: at(cx, cy + 1.58, -3.38) });
  kit.add(P.box(3.8, 0.2, 0.46, 0.07, 3), { ...frame, matrix: at(cx, cy - 1.58, -3.28) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx - 1.67, cy, -3.38) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx + 1.67, cy, -3.38) });
  kit.add(P.box(0.08, 3.1, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy, -3.39) });
  kit.add(P.box(3.2, 0.08, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy + 0.1, -3.39) });

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
  kit.add(P.sphere(0.23, 20, 12), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(-5.9, 0.82, 2.05, [0, 0, 0], [1, 0.62, 1]) });
  kit.add(P.box(1.3, 0.1, 0.76, 0.05, 3), { color: C.butter, gloss: 0.55, matrix: at(5.7, 0.05, 2.2, [0, 0.3, 0]) });
  kit.add(P.box(0.86, 0.32, 0.44, 0.05, 2), { color: '#ffe48a', gloss: 0.4, matrix: at(5.7, 0.26, 2.2, [0, 0.3, 0]) });
}

/** Stove light groups: the shelf light that comes on at dusk, and the neon sign once bought. */
const LIT = { shelf: 0, neon: 1 } as const;
/** Under the wooden shelf, which sits at y 3.72. */
const SHELF_LIGHT = { x: 3.45, y: 3.6 };
const NEON_AT = new THREE.Vector3(-0.45, 3.5, -3.42);
const KETTLE_AT = new THREE.Vector3(-2.75, 1.18, -3.18);
/** On the back guard, right of the clock: the shaker that sneezes. */
const PEPPER_AT = new THREE.Vector3(1.55, 1.18, -3.12);
const CLOCK_AT = new THREE.Vector3(-0.2, 0.58, -2.84);
const pepperColor = new THREE.Color('#5a4d48');
const CHEF_AT = new THREE.Vector3(-1.72, 0.01, 2.08);

function addEveningProps(kit: Kit): void {
  // A strip light under the shelf, switched on once the evening comes in.
  const { x, y } = SHELF_LIGHT;
  const brass = { color: '#e4b252', gloss: 0.84, metal: 1, wear: 0.3 };
  kit.add(P.box(2.6, 0.1, 0.16, 0.04, 2), { color: C.cream, gloss: 0.6, matrix: at(x, y, -3.3) });
  for (const end of [-1.32, 1.32]) kit.add(P.puck(0.06, 0.06, 0.05, 12, 0.015), { ...brass, outline: 0.4, matrix: at(x + end, y, -3.3, [0, 0, Math.PI / 2]) });
  kit.add(P.capsule(0.035, 2.4, 3, 8), { color: '#fff1c4', emissive: 1, outline: 0, light: lightGroup(0, LIT.shelf), matrix: at(x, y - 0.06, -3.27, [0, 0, Math.PI / 2]) });
  // An egg timer and a recipe card pinned to the tiles.
  const wood = { color: '#b97a45', gloss: 0.4, pattern: Pattern.Wood + 0.3 };
  for (const dy of [0.02, 0.36]) kit.add(P.puck(0.13, 0.13, 0.04, 16, 0.015), { ...wood, matrix: at(6.75, dy, 1.85) });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    kit.add(P.box(0.025, 0.32, 0.025, 0.01, 1), { ...wood, outline: 0.4, matrix: at(6.75 + Math.cos(a) * 0.1, 0.22, 1.85 + Math.sin(a) * 0.1) });
  }
  kit.add(P.lathe([[0, 0.06], [0.085, 0.09], [0.07, 0.19], [0.012, 0.22], [0.07, 0.25], [0.085, 0.35], [0, 0.38]], 16, 0.03, 2), { color: '#ffe9b8', gloss: 0.85, coat: 0.6, outline: 0.3, matrix: at(6.75, 0, 1.85) });
  kit.add(P.box(0.72, 0.92, 0.015, 0.01, 1), { color: '#fff7e6', gloss: 0.08, pattern: Pattern.Paper, outline: 0.4, matrix: at(-6.45, 4.25, -3.51, [0, 0, 0.06]) });
  for (let i = 0; i < 5; i += 1) kit.add(P.box(0.46 - (i % 2) * 0.12, 0.035, 0.005, 0.004, 1), { color: '#8a6a5a', outline: 0, detail: 1, matrix: at(-6.47 + i * 0.006, 4.45 - i * 0.12, -3.5, [0, 0, 0.06]) });
  kit.add(P.sphere(0.05, 8, 6), { color: C.red, gloss: 0.9, outline: 0, matrix: at(-6.47, 4.66, -3.49) });
}

function kettleGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.25, 0], [0.29, 0.07], [0.285, 0.25], [0.22, 0.37], [0.13, 0.42], [0, 0.43]], 28, 0.04, 3), { color: C.butter, gloss: 0.88, coat: 0.55, pattern: Pattern.Enamel, wear: 0.2 });
  kit.add(P.torus(0.255, 0.018, 6, 28), { color: C.chrome, gloss: 0.9, metal: 1, outline: 0, matrix: at(0, 0.015, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.tube([new THREE.Vector3(0.22, 0.1, 0), new THREE.Vector3(0.36, 0.2, 0), new THREE.Vector3(0.45, 0.34, 0)], 0.04, 10, 8), { color: C.butter, gloss: 0.88, coat: 0.55 });
  kit.add(P.puck(0.035, 0.05, 0.06, 12, 0.01), { color: C.chrome, gloss: 0.9, metal: 1, matrix: at(0.455, 0.345, 0, [0, 0, -0.6]) });
  kit.add(P.torus(0.17, 0.026, 6, 18, Math.PI), { color: '#2b2230', gloss: 0.5, matrix: at(0, 0.43, 0) });
  return kit.build();
}

function kettleLid(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.135, 0], [0.12, 0.03], [0.05, 0.06], [0, 0.065]], 20, 0.02, 2), { color: C.butter, gloss: 0.88, coat: 0.55 });
  kit.add(P.sphere(0.035, 10, 8), { color: '#2b2230', gloss: 0.6, matrix: at(0, 0.09, 0) });
  return kit.build();
}

function spoonGeometry(): THREE.BufferGeometry {
  // Held at the origin, the bowl hanging below.
  const kit = new Kit();
  kit.add(P.capsule(0.018, 0.34, 3, 6), { color: '#c98a52', gloss: 0.35, pattern: Pattern.Wood + 0.4, matrix: at(0, -0.12, 0.02) });
  kit.add(P.sphere(0.06, 10, 8), { color: '#c98a52', gloss: 0.35, matrix: at(0, -0.32, 0.02, [0, 0, 0], [0.8, 1.2, 0.45]) });
  return kit.build();
}

function neonGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  neonPop(kit, at(0, 0, 0), { ...NEON_PINK, light: lightGroup(0, LIT.neon) });
  return kit.build();
}

function plantGeometry(): THREE.BufferGeometry {
  // A terracotta pot on the sill, growing popcorn instead of flowers.
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.1, 0], [0.135, 0.2], [0.15, 0.21], [0.15, 0.24], [0, 0.23]], 18, 0.015, 2), { color: '#c8643a', gloss: 0.25, pattern: Pattern.Plaster + 0.6 });
  kit.add(P.puck(0.13, 0.13, 0.02, 16, 0.005), { color: '#4a2f22', gloss: 0.1, outline: 0, matrix: at(0, 0.225, 0) });
  for (let i = 0; i < 6; i += 1) {
    const a = i * 2.4;
    kit.add(P.sphere(0.09, 8, 6), { color: i % 2 ? '#3fa56d' : '#58bd7c', gloss: 0.3, outline: 0.4, matrix: at(Math.cos(a) * 0.07, 0.3 + (i % 3) * 0.05, Math.sin(a) * 0.07, [a, 0, 0.6], [0.4, 1.3, 0.2]) });
  }
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.26 + 0.4;
    const r = i === 0 ? 0 : 0.09;
    puffs(kit, Math.cos(a) * r, 0.42 + (i === 0 ? 0.08 : 0), Math.sin(a) * r, 0.01, 0.01, 1, 0.055, i + 3);
  }
  return kit.build();
}

/** A ceramic shaker with a red band and a chrome cap; origin at its foot. */
function pepperGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.085, 0], [0.096, 0.03], [0.09, 0.24], [0.076, 0.27], [0, 0.27]], 22, 0.02, 2), { color: '#f6f1e7', gloss: 0.7, coat: 0.4, pattern: Pattern.Enamel });
  kit.add(P.puck(0.095, 0.095, 0.05, 22, 0.01), { color: C.red, gloss: 0.6, outline: 0, matrix: at(0, 0.11, 0) });
  kit.add(P.lathe([[0, 0], [0.082, 0], [0.082, 0.05], [0.05, 0.1], [0, 0.11]], 22, 0.02, 2), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(0, 0.26, 0) });
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.26;
    kit.add(P.sphere(0.01, 5, 4), { color: '#2a2024', outline: 0, detail: 1, matrix: at(Math.cos(a) * 0.03, 0.366, Math.sin(a) * 0.03) });
  }
  return kit.build();
}

/** A clock hand pointing up from its pivot at the origin. */
function clockHandGeometry(length: number, width: number): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(width, length, 0.012, width * 0.45, 1), { color: C.navy, gloss: 0.4, outline: 0, matrix: at(0, length * 0.38, 0) });
  kit.add(P.sphere(0.028, 10, 8), { color: C.navy, gloss: 0.6, outline: 0, matrix: at(0, 0, 0.01) });
  return kit.build();
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
    { color: potColor, gloss: 0.9, coat: 0.65, pattern: Pattern.Enamel, wear: 0.15, ao: body },
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
    // Inside, speckled graniteware enamel with a wet shine.
    { color: C.navy, gloss: 0.6, coat: 0.15, pattern: Pattern.Speckle, smudge: 0.15, outline: 0, ao: (p) => lerp(0.4, 1, smooth(f, r, p.y)) },
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
  // Loop handles riveted to the wall. The wall leans in below the rim, so each loop is set by the
  // wall's radius at its own height: placed by the rim's, it floated clear of the pot.
  const earY = r - 0.3;
  const wall = lerp(1.2, o, (earY - 0.42) / (r - 0.12 - 0.42));
  const loop = 0.19;
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const ear = at(side * (wall - 0.03), earY, 0, [Math.PI / 2, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    kit.add(P.torus(loop, 0.05, 12, 28, Math.PI), { color: C.cream, gloss: 0.8, matrix: ear });
    for (const end of [-1, 1]) {
      const out = new THREE.Vector3(side * (wall - 0.03), 0, end * loop).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(up, out);
      const seat = (lift: number): THREE.Matrix4 =>
        new THREE.Matrix4().compose(out.clone().multiplyScalar(wall + lift).setY(earY), turn, new THREE.Vector3(1, 1, 1));
      kit.add(P.puck(0.085, 0.072, 0.04, 18, 0.015), { color: C.cream, gloss: 0.8, outline: 0.5, matrix: seat(-0.012) });
      kit.add(P.sphere(0.024, 10, 8), { color: '#e4b252', gloss: 0.84, metal: 1, outline: 0, detail: 1, matrix: seat(0.034) });
    }
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
    { color: potColor, gloss: 0.9, coat: 0.65, pattern: Pattern.Enamel, wear: 0.15 },
  );
  kit.add(
    P.lathe(
      [
        [1.24, 0.02],
        [1.325, 0],
        [1.33, 0.04],
        [1.25, 0.09],
      ],
      72,
      0.015,
      2,
    ),
    { color: C.cream, gloss: 0.9, outline: 0 },
  );
  kit.add(P.puck(0.14, 0.1, 0.1, 20, 0.03), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(0, 0.41, 0) });
  kit.add(P.sphere(0.21, 24, 16), { color: C.cream, gloss: 0.9, matrix: at(0, 0.6, 0, [0, 0, 0], [1, 0.8, 1]) });
  // The pot's cream band, carried round the lid, so the two read as a set.
  kit.add(P.lathe([[1.04, 0.214], [0.92, 0.28]], 72, 0, 1), { color: C.cream, gloss: 0.85, coat: 0.4, outline: 0 });
  // A steam vent: a chromed eyelet and a dark hole.
  kit.add(P.torus(0.07, 0.02, 8, 18), { color: C.chrome, gloss: 0.92, metal: 1, smudge: 0.4, outline: 0, matrix: at(0.55, 0.385, 0, [Math.PI / 2 - 0.19, 0, 0.19]) });
  kit.add(P.puck(0.055, 0.055, 0.02, 14, 0.005), { color: '#1a1012', gloss: 0.2, outline: 0, fixedColor: true, matrix: at(0.55, 0.38, 0, [0, 0, 0.19]) });
  return kit.build();
}

const steamColor = new THREE.Color(0.9, 0.88, 0.86);
const color = new THREE.Color();

/** Out of the window: dusk, the blue hour, night. */
const SKY: [SkyLook, SkyLook, SkyLook] = [
  { top: '#5a4fb0', horizon: '#ff9a7c', glow: '#ffb070', glowStrength: 0.9, stars: 0, clouds: 0.5, cloud: '#ffc8c8', brightness: 1.2 },
  { top: '#1d2466', horizon: '#c8638b', glow: '#ff8a5c', glowStrength: 0.4, stars: 0.45, clouds: 0.2, cloud: '#b98cb4', brightness: 1.1 },
  { top: '#080b30', horizon: '#232c74', glow: '#3a4aa8', glowStrength: 0.2, stars: 1, clouds: 0, cloud: '#404a80', brightness: 1.05 },
];

/** What the window throws into the room: its lamp and its shaft of light. */
interface WindowLight {
  color: string;
  intensity: number;
  beam: string;
  strength: number;
}
const WINDOW_LIGHT: [WindowLight, WindowLight, WindowLight] = [
  { color: '#ff9a6a', intensity: 0.75, beam: '#ffb38a', strength: 0.09 },
  { color: '#e86ea0', intensity: 0.5, beam: '#ff9ec4', strength: 0.07 },
  { color: '#7d86ff', intensity: 0.42, beam: '#a0a8ff', strength: 0.045 },
];
const q = new THREE.Quaternion();
const e = new THREE.Euler();

function* buildStove(stage: Stage, root: THREE.Group): SceneBuild {
  const set = new Kit();
  addWall(set);
  yield;
  addStoveBody(set);
  yield;
  addBurner(set, 0, 0);
  for (const slot of PAN_SLOTS.slice(0, BURNER_PANS)) {
    addBurner(set, slot.x, slot.z);
    yield;
  }
  addWindow(set);
  yield;
  addForeground(set);
  addEveningProps(set);
  yield;
  dressStove(set);
  yield;
  addToy(stage, root, set.build({ frozen: true }));
  yield;
  // Light slanting in through the window, warm at dusk and cold by night.
  const beam = addLightBeam(root, new THREE.Vector3(-3.95, 4.3, -3.25), new THREE.Vector3(-0.8, 0.1, 1.1), 1, 2.3, '#ff9ec4', 0.075);
  const beamUniforms = (beam.material as THREE.ShaderMaterial).uniforms;

  // The sky outside: dusk, the blue hour, then night with the moon high and twitching.
  const sky = skyUniforms();
  sky.uRange.value.set(-1.55, 1.55);
  sky.uGlowAt.value.set(0.9, -1.6, 0, 0);
  sky.uCraters.value = 1;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.1), skyMaterial(sky, false));
  pane.position.set(WINDOW.x, WINDOW.y, -3.4);
  root.add(pane);

  const pot = addToy(stage, root, potGeometry());
  yield;

  // The lid leans on the back guard until the popcorn sends it flying.
  const lid = addToy(stage, root, lidGeometry());
  yield;
  const lidHome = new THREE.Vector3(3.05, 1.12, -2.62);
  const lidRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.3, -0.2, 0, 'YXZ'));
  lid.position.copy(lidHome);
  lid.quaternion.copy(lidRest);
  lid.scale.setScalar(0.84);

  // Everything else that moves, comes or goes shares one rig.
  const pieces = new SetPieces(root);
  const kettle = pieces.group(root, KETTLE_AT.x, KETTLE_AT.y, KETTLE_AT.z);
  kettle.rotation.y = -0.45;
  pieces.part(kettleGeometry(), kettle);
  const kettleLidHolder = pieces.group(kettle, 0, 0.415, 0);
  pieces.part(kettleLid(), kettleLidHolder);
  // A toy chef keeping an eye on the pot, wooden spoon in hand.
  const chef = toyFigure(pieces, root, { skin: '#ffd2ab', shirt: '#fbf7f0', pants: '#2b3d6b', hair: '#5a3a24', hat: 'chef' });
  chef.root.position.copy(CHEF_AT);
  chef.root.scale.setScalar(0.62);
  chef.root.rotation.y = 0.55;
  pieces.part(spoonGeometry(), pieces.group(chef.armR, 0, -0.27, 0));
  const neon = pieces.group(root, NEON_AT.x, NEON_AT.y, NEON_AT.z);
  neon.scale.setScalar(0.76);
  pieces.part(neonGeometry(), neon);
  pieces.decoration('decor-neon', neon, 0.9);
  const plant = pieces.group(root, -2.3, 2.24, -3.12);
  pieces.part(plantGeometry(), plant);
  pieces.decoration('decor-plant', plant, 0.45);
  // Hidden things to find: the clock's hands, the shaker that sneezes (src/content/props.ts).
  const clockHands = pieces.group(root, CLOCK_AT.x, CLOCK_AT.y, CLOCK_AT.z);
  const hourHand = pieces.part(clockHandGeometry(0.17, 0.036), clockHands);
  const minuteHand = pieces.part(clockHandGeometry(0.25, 0.026), clockHands);
  const pepper = pieces.group(root, PEPPER_AT.x, PEPPER_AT.y, PEPPER_AT.z);
  pieces.part(pepperGeometry(), pepper);
  pieces.build(stage);
  yield;

  const flames = new Flames(root, BURNERS);
  flames.setLit(1);

  const bank = new LightBank(0, [{ at: 0.42, style: 'bulb' }, { style: 'neon' }]);
  const windowLight = new THREE.Color('#e86ea0');
  const lamps: Lamp[] = [
    { position: [0, 0.5, 0], color: '#5f9dff', intensity: 0.9, radius: 3.4, flicker: 0.14 },
    { position: [-3.95, 3.6, -2.5], color: windowLight, intensity: 0.5, radius: 5 },
    { position: [SHELF_LIGHT.x, SHELF_LIGHT.y - 0.3, -2.9], color: '#ffc47a', intensity: 0, radius: 4.6 },
    { position: [NEON_AT.x, NEON_AT.y, -2.8], color: '#ff5fa8', intensity: 0, radius: 3.8 },
  ];

  const potKick = new Spring(0, 420, 15);
  const lidRattle = new Spring(0, 620, 17);
  const chefHop = new Spring(0, 160, 11);
  let steamTimer = 0;
  let kettleTimer = 0;
  let time = 0;
  let strainAmount = 0;
  let lidFlying = false;
  let lidGone = false;
  let chefFlying = false;
  let story = 0;
  const lidVelocity = new THREE.Vector3();
  const lidSpin = new THREE.Vector3();
  const chefVelocity = new THREE.Vector3();
  const spout = new THREE.Vector3();

  const cues = new Cues();
  const pepperWobble = new Wobble(pepper, { axis: 'z', squash: 0.22, turn: 0.32, stiffness: 240, damping: 6 });
  const moonPeek = new Pulse(2.4);
  let peek = 0;
  /** Extra turns a second the clock's hands are making; it settles back to the steady pace. */
  let clockRush = 0;
  let clockAngle = 1.1;
  const clockSpot = new THREE.Vector3(CLOCK_AT.x, CLOCK_AT.y, -2.9);
  const windowSpot = new THREE.Vector3(WINDOW.x, WINDOW.y, -3.3);
  const pepperSpot = new THREE.Vector3(PEPPER_AT.x, PEPPER_AT.y + 0.2, PEPPER_AT.z);
  const sneezeAt = new THREE.Vector3(PEPPER_AT.x - 0.06, PEPPER_AT.y + 0.4, PEPPER_AT.z + 0.08);
  const eggs: EggSpot[] = [
    {
      id: 'egg-clock',
      position: clockSpot,
      radius: 0.45,
      play(ctx) {
        gag.sparkle(ctx, clockSpot, 0.32);
        clockRush = 9;
      },
    },
    {
      id: 'egg-window-moon',
      position: windowSpot,
      radius: 1.5,
      active: () => !moonPeek.busy,
      play(ctx) {
        gag.sparkle(ctx, windowSpot, 0.6, 5);
        moonPeek.start();
      },
    },
    {
      id: 'egg-pepper',
      position: pepperSpot,
      radius: 0.32,
      play(ctx) {
        // It rears back, holds it... and sneezes toward the pot, which pops three more.
        pepperWobble.kick(0.55);
        cues.after(0.34, () => {
          pepperWobble.kick(-1.3);
          gag.puff(ctx, sneezeAt, 0.22, pepperColor, 10);
          for (let i = 0; i < 3; i += 1) {
            cues.after(0.12 + i * 0.1, () => ctx.director.launch(ctx.rng.range(-0.5, 0.5), POT.rimY - 0.15, ctx.rng.range(-0.5, 0.5), { flight: 0.8, scale: 0.46 }));
          }
        });
      },
    },
  ];

  const tell = (u: number, dt: number, instant: boolean, calm: boolean): void => {
    story = u;
    bank.update(u, dt, instant, calm);
    alongStory(u, SKY, (from, to, t) => blendSky(sky, from, to, t));
    alongStory(u, WINDOW_LIGHT, (from, to, t) => {
      windowLight.set(from.color).lerp(color.set(to.color), t);
      lamps[1]!.intensity = from.intensity + (to.intensity - from.intensity) * t;
      (beamUniforms.uColor!.value as THREE.Color).set(from.beam).lerp(color.set(to.beam), t);
      beamUniforms.uStrength!.value = from.strength + (to.strength - from.strength) * t;
    });
    lamps[2]!.intensity = 0.95 * bank.level(LIT.shelf);
    lamps[3]!.intensity = 0.75 * bank.level(LIT.neon);
  };
  // The moon climbs out from behind the sill as the evening goes on.
  const placeMoon = (u: number, shake: number): void => {
    const rise = smooth(0, 0.9, u);
    // Tapped, it comes right up to the glass for a look, whatever the hour, then backs off.
    const x = lerp(lerp(-0.05, -0.62, rise), 0.12, peek);
    const y = lerp(lerp(-1.25, 0.62, rise), -0.12, peek);
    sky.uDisc.value.set(x + Math.sin(time * 47) * shake, y + Math.cos(time * 41) * shake * 0.8, 0.56 * (1 + 0.5 * peek), lerp(1.25, 1.7, Math.max(rise, peek)));
  };

  return {
    lamps,
    eggs,
    kick(strength) {
      potKick.kick(-0.16 - 0.14 * strength);
      if (strength > 0) {
        lidRattle.kick(1.6 * strength);
        chefHop.kick(1.4 * strength);
      }
    },
    unitsChanged(kind, count) {
      if (kind === 'pan') flames.setLit(1 + Math.min(count, BURNER_PANS));
    },
    upgradesChanged(owned, animate) {
      pieces.sync(owned, animate);
      bank.want(LIT.neon, pieces.owns('decor-neon'));
    },
    progress: tell,
    strain(u) {
      strainAmount = u;
    },
    blast(ctx) {
      lidFlying = true;
      lidVelocity.set(-3.5, 15, 3.2);
      lidSpin.set(5, 2.4, 7);
      chefFlying = true;
      chefVelocity.set(-2.2, 9, 3.4);
      strainAmount = 0;
      for (let i = 0; i < 34; i += 1) {
        ctx.director.launch(ctx.rng.range(-0.8, 0.8), POT.rimY + 0.25, ctx.rng.range(-0.8, 0.8), {
          flight: ctx.rng.range(0.7, 1.25),
          scale: ctx.rng.range(0.34, 0.54),
          reach: 1.5,
          quiet: i > 6,
        });
      }
    },
    afterBlast(dt) {
      if (chefFlying) {
        chefVelocity.y -= 22 * dt;
        chef.root.position.addScaledVector(chefVelocity, dt);
        chef.root.rotation.x += dt * 9;
        chef.root.rotation.z += dt * 4;
        if (chef.root.position.y < -14) {
          chefFlying = false;
          chef.root.visible = false;
        }
      }
      if (!lidFlying) return;
      lidVelocity.y -= 22 * dt;
      lid.position.addScaledVector(lidVelocity, dt);
      e.set(lidSpin.x * dt, lidSpin.y * dt, lidSpin.z * dt);
      lid.quaternion.multiply(q.setFromEuler(e));
      if (lid.position.y < -14) {
        lidFlying = false;
        lidGone = true;
        lid.visible = false;
      }
    },
    settleAsMiniature() {
      lidFlying = false;
      lidGone = true;
      lid.visible = false;
      chef.root.visible = false;
      flames.setLit(0);
      // A finished stove is a little lit-up evening scene inside the next room.
      tell(1, 0, true, true);
      placeMoon(1, 0);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      const kick = potKick.update(dt);
      const shake = strainAmount * strainAmount;
      pot.scale.set(1 - kick * 0.018, 1 + kick * 0.03 + shake * 0.03 * Math.sin(time * 52), 1 - kick * 0.018);
      pot.position.x = Math.sin(time * 67) * shake * 0.05;
      pot.position.z = Math.cos(time * 59) * shake * 0.04;

      const rattle = lidRattle.update(dt) + Math.sin(time * 73) * shake * 2.4;
      if (!lidFlying && !lidGone) {
        e.set(0, 0, rattle * 0.016);
        lid.quaternion.copy(lidRest).multiply(q.setFromEuler(e));
        lid.position.copy(lidHome);
        lid.position.y += Math.abs(rattle) * 0.008;
      }

      // The longer the evening, the more often and harder the moon twitches.
      const period = lerp(11, 4.5, story);
      const cycle = time % period;
      const tremble = cycle > period - 1.2 ? Math.sin(((cycle - period + 1.2) * Math.PI) / 1.2) : 0;
      peek = moonPeek.update(dt);
      placeMoon(story, (0.012 + 0.045 * story * story) * tremble + shake * 0.03);

      cues.update(dt);
      pepperWobble.update(dt);
      clockRush *= Math.exp(-dt * 1.6);
      clockAngle += dt * (Math.PI * 2) * (1 / 60 + clockRush);
      minuteHand.rotation.z = -clockAngle;
      hourHand.rotation.z = -clockAngle / 12 - 2.1;

      if (!chefFlying && chef.root.visible) updateChef(dt, ctx);
      updateKettle(dt, ctx);
      pieces.update(dt, ctx);

      steamTimer -= dt * (1 + shake * 6);
      if (steamTimer <= 0) {
        steamTimer = 0.2;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        const radius = r.range(0.2, 0.9);
        ctx.sprites.spawn({
          x: Math.cos(a) * radius,
          y: POT.rimY + (ctx.level > 0.7 ? 0.9 : -0.15),
          z: Math.sin(a) * radius,
          vx: r.range(-0.08, 0.08),
          vy: r.range(0.42, 0.7),
          vz: r.range(-0.05, 0.05),
          drag: 0.25,
          sizeStart: r.range(0.16, 0.24),
          sizeEnd: r.range(0.55, 0.85),
          life: r.range(1.7, 2.5),
          color: steamColor,
          alpha: 0.07,
          kind: SpriteKind.Puff,
          spin: r.range(-0.4, 0.4),
        });
      }
    },
  };

  function updateChef(dt: number, ctx: SceneContext): void {
    const hop = Math.max(0, chefHop.update(dt));
    const scared = strainAmount;
    // Stands on whatever is underfoot, popcorn included.
    const floor = Math.max(CHEF_AT.y, ctx.ground(CHEF_AT.x, CHEF_AT.z) - 0.02);
    chef.root.position.set(CHEF_AT.x + Math.sin(time * 61) * scared * 0.02, floor + hop * 0.12 + Math.abs(Math.sin(time * 3.1)) * 0.008, CHEF_AT.z);
    chef.head.rotation.y = Math.sin(time * 0.6) * 0.4 + 0.2 - scared * 0.2;
    chef.head.rotation.x = Math.sin(time * 1.3) * 0.05 + hop * 0.2;
    // Stirs the air with the spoon; now and then waves; throws both arms up when it gets tense.
    const wave = smooth(0, 0.2, (time % 8.5) - 6.8) * (1 - smooth(1.1, 1.4, (time % 8.5) - 6.8));
    const cheer = Math.min(1, hop * 1.4 + scared);
    chef.armR.rotation.set(lerp(-0.85 + Math.sin(time * 4.2) * 0.22, 0, cheer), 0, lerp(0.15, 2.5, cheer));
    chef.armL.rotation.set(0, 0, lerp(lerp(-0.12, -2.7 + Math.sin(time * 13) * 0.25, wave), -2.5, cheer));
  }

  function updateKettle(dt: number, ctx: SceneContext): void {
    // Late in the evening the kettle comes to the boil: its lid chatters and it starts to steam.
    const boil = smooth(0.6, 0.85, story);
    kettleLidHolder.rotation.z = Math.sin(time * 31) * 0.07 * boil;
    kettleLidHolder.position.y = 0.415 + Math.abs(Math.sin(time * 23)) * 0.012 * boil;
    kettle.position.x = KETTLE_AT.x + Math.sin(time * 57) * 0.004 * boil;
    if (boil <= 0) return;
    kettleTimer -= dt * (0.5 + boil);
    if (kettleTimer > 0) return;
    kettleTimer = 0.09;
    kettle.updateWorldMatrix(true, false);
    root.worldToLocal(kettle.localToWorld(spout.set(0.5, 0.38, 0)));
    const r = ctx.rng;
    ctx.sprites.spawn({ x: spout.x, y: spout.y, z: spout.z, vx: r.range(0.25, 0.5), vy: r.range(0.5, 0.85), vz: r.range(0.05, 0.2), drag: 0.6, sizeStart: 0.05, sizeEnd: r.range(0.3, 0.45), life: r.range(0.9, 1.4), color: steamColor, alpha: 0.16 * boil, kind: SpriteKind.Puff, spin: r.range(-0.6, 0.6) });
  }
}

export const stoveSpec: SceneSpec = {
  id: 0,
  light: {
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
  },
  // From dusk into night: the room light cools and the lamps carry more of the picture.
  story: {
    mid: {
      light: { sunDir: [0.4, 0.95, 0.56], sunColor: '#ffe9da', sunIntensity: 1.24, shadeTint: '#4a4888', sky: '#7a8fe0', skyIntensity: 0.24, ground: '#c07a62', groundIntensity: 0.13, rim: '#a9c4ff', rimIntensity: 0.64, rimDir: [-0.72, 0.34, -0.6], fog: '#0a2433', fogRange: [16, 36], pool: [0, 0.6, 0.1, 4.3], poolFloor: 0.32 },
      grade: { exposure: 1, contrast: 1.05, saturation: 1.08, vignette: 0.34, bloom: 0.6, shadowTint: '#fbf8ff', highlightTint: '#fffaf6', aoTint: '#1c0f26' },
    },
    late: {
      light: { sunDir: [0.36, 0.95, 0.5], sunColor: '#f0eaff', sunIntensity: 1.16, shadeTint: '#3c3f88', sky: '#5d70d4', skyIntensity: 0.22, ground: '#a86c66', groundIntensity: 0.11, rim: '#8fb2ff', rimIntensity: 0.78, rimDir: [-0.72, 0.34, -0.6], fog: '#071a2c', fogRange: [16, 36], pool: [0, 0.6, 0.1, 4.1], poolFloor: 0.29 },
      grade: { exposure: 0.99, contrast: 1.06, saturation: 1.06, vignette: 0.38, bloom: 0.68, shadowTint: '#f2f2ff', highlightTint: '#fff8f0', aoTint: '#180f2c' },
    },
  },
  tiltShift: 0.25,
  grade: {
    exposure: 1,
    contrast: 1.04,
    saturation: 1.08,
    vignette: 0.32,
    bloom: 0.55,
    shadowTint: '#ffffff',
    highlightTint: '#ffffff',
    aoTint: '#1c0f22',
  },
  camera: {
    position: new THREE.Vector3(0.2, 5.05, 13.5),
    target: new THREE.Vector3(0, 1.5, -0.4),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 1.0, 0), distance: 0.6, lift: 3.9 },
  focusPoint: new THREE.Vector3(0, 1, 0),
  focusRange: 3.8,
  aoRadius: 0.42,
  // The window: dusk light slanting into the room.
  shafts: { at: new THREE.Vector3(-3.95, 3.72, -3.3), strength: 0.55, length: 0.7, threshold: 0.85 },
  shadow: { center: new THREE.Vector3(0, 0.8, -0.3), radius: 8.2 },
  pile: vesselPile({
    k: 1,
    floorY: POT.floorY,
    rimY: POT.rimY,
    innerR: POT.innerR,
    outerR: POT.outerR,
    groundY: 0.01,
    size: 10,
    peak: 2.75,
    endSlope: 0.44,
    coreDensityRadius: 2.3,
    outerDensityRadius: 3.9,
    flakeScale: 0.2,
  }),
  debris: ['#cf2f38', '#f6dfb8', '#24232c'],
  homeRadius: POT.innerR * 0.72,
  steamY: POT.rimY,
  spreadRadius: 7.5,
  // The climb out arcs well up, clearing the chairs at the kitchen table.
  nest: { position: new THREE.Vector3(-8.2, -3.3, -15.2), scale: 0.42, rise: 0.4 },

  slots: { pan: PAN_SLOTS, microwave: MICROWAVE_SLOTS, toaster: TOASTER_SLOTS },
  cannon: null,
  perches: [],
  build: buildStove,
};

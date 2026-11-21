import * as THREE from 'three';
import { lerp, Spring } from '../../motion/ease.ts';
import { lightGroup, type Lamp } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addLightBeam } from '../fx/beam.ts';
import { addToy, at, Kit, P, Pattern } from '../geometry/kit.ts';
import { blendSky, skyMaterial, skyUniforms, type SkyLook } from '../materials/sky.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';
import { dressKitchen, fridgeBadge } from './dress.ts';
import { Cues, gag, Pulse, Wobble, type EggSpot } from './eggs.ts';
import { SetPieces, toyFigure } from './pieces.ts';
import { alongStory, LightBank, storyWeights } from './story.ts';
import { vesselPile } from './vessel.ts';

const GROUND = -5.6;
const BOWL = { floorY: 1.15, rimY: 2.3, innerR: 2.0, outerR: 2.25 };
const COUNTER_TOP = -1.5;
/** On the floor beside the cook, who works to the radio. */
const RADIO_AT = new THREE.Vector3(-10.4, GROUND, 9.2);
const noteColor = new THREE.Color(2, 1.6, 0.9);

const C = {
  wall: '#e39aa2',
  wallAlt: '#dc8f99',
  wainscot: '#f0dcb8',
  trim: '#fff0d4',
  floorA: '#5c3650',
  floorB: '#74465f',
  mint: '#7fd8bd',
  mintDark: '#53b39b',
  chrome: '#c3d0dd',
  cream: '#ffeccb',
  butter: '#ffc53f',
  red: '#d8313a',
  sky: '#7cc4ff',
  skyDeep: '#3d7fd6',
  navy: '#20203c',
  wood: '#a9632f',
  woodDark: '#7d4422',
  counter: '#fff4dd',
  night: '#1b2160',
  dusk: '#c8638b',
  moon: '#fff1c4',
  leaf: '#3f9a6a',
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function* addRoom(kit: Kit): Generator<void, void, void> {
  // Checkered floor, built from real tiles so the grout catches light.
  const tile = 3.2;
  for (let ix = -11; ix <= 11; ix += 1) {
    for (let iz = -6; iz <= 8; iz += 1) {
      kit.add(P.box(tile - 0.07, 0.3, tile - 0.07, 0.05, 1), {
        color: (ix + iz) & 1 ? C.floorA : C.floorB,
        coat: 0.42,
        pattern: Pattern.Enamel,
        gloss: 0.55,
        outline: 0,
        matrix: at(ix * tile, GROUND - 0.15, iz * tile - 1.5),
      });
    }
    if (ix % 8 === 0) yield;
  }
  yield;
  kit.add(P.box(80, 0.4, 60, 0.02, 1), { color: '#2c1a2a', gloss: 0, outline: 0, matrix: at(0, GROUND - 0.42, 0) });

  // Back wall in tall painted panels.
  for (let i = -15; i <= 15; i += 1) {
    kit.add(P.box(2.4, 24, 0.3, 0.02, 1), {
      color: i & 1 ? C.wall : C.wallAlt,
      gloss: 0.12,
      pattern: Pattern.Plaster,
      outline: 0,
      matrix: at(i * 2.4, 6.4, -17.5),
    });
  }
  // Wainscot and rails.
  kit.add(P.box(74, 4.6, 0.3, 0.05, 1), { color: C.wainscot, gloss: 0.3, pattern: Pattern.Wood, outline: 0, matrix: at(0, GROUND + 2.3, -17.3) });
  kit.add(P.box(74, 0.26, 0.42, 0.08, 2), { color: C.trim, gloss: 0.45, outline: 0.6, matrix: at(0, GROUND + 4.72, -17.2) });
  kit.add(P.box(74, 0.6, 0.42, 0.08, 2), { color: C.trim, gloss: 0.45, outline: 0.6, matrix: at(0, GROUND + 0.3, -17.2) });
  // Left wall.
  kit.add(P.box(0.3, 24, 60, 0.02, 1), { color: C.wallAlt, gloss: 0.1, outline: 0, matrix: at(-30, 6.4, 8) });
}

function addTable(kit: Kit): void {
  kit.add(P.puck(5.1, 5.2, 0.34, 72, 0.1), {
    color: C.cream,
    gloss: 0.7,
    coat: 0.5,
    pattern: Pattern.Enamel,
    matrix: at(0, -0.33, 0),
    ao: (p) => 0.55 + 0.45 * smooth(2.1, 3.8, Math.hypot(p.x, p.z)),
    colorFn: (p, _n, out) => {
      const a = Math.atan2(p.z, p.x);
      if (Math.floor((a / Math.PI) * 12 + 100) % 2 === 0 && Math.hypot(p.x, p.z) > 3.9) out.set(C.red);
    },
  });
  kit.add(
    P.lathe(
      [
        [0, GROUND],
        [2.3, GROUND],
        [2.2, GROUND + 0.3],
        [0.65, GROUND + 1.1],
        [0.5, -1.6],
        [1.1, -0.6],
        [1.3, -0.33],
        [0, -0.33],
      ],
      36,
      0.12,
    ),
    { color: C.wood, gloss: 0.5, pattern: Pattern.Wood },
  );
}

function addFridge(kit: Kit): void {
  const x = -21;
  const z = -13.9;
  kit.add(P.box(6.2, 12.8, 4.8, 1.05, 6), { color: C.mint, gloss: 0.85, coat: 0.5, pattern: Pattern.Enamel, wear: 0.2, matrix: at(x, GROUND + 6.7, z) });
  for (const dx of [-2.3, 2.3]) kit.add(P.box(0.5, 0.4, 3.4, 0.08, 1), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(x + dx, GROUND + 0.2, z) });
}

/** A wooden tabletop radio with a carrying handle and an aerial; origin at its foot, facing +Z. */
function radioGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.2, 1.4, 1, 0.24, 3), { color: '#b0693c', gloss: 0.6, coat: 0.4, pattern: Pattern.Wood, matrix: at(0, 0.78, 0) });
  kit.add(P.box(1.92, 1.08, 0.06, 0.12, 2), { color: '#f3e2c0', gloss: 0.45, outline: 0, matrix: at(0, 0.8, 0.5) });
  kit.add(P.puck(0.38, 0.37, 0.05, 24, 0.02), { color: '#4a3426', gloss: 0.2, pattern: Pattern.Fabric, outline: 0, matrix: at(-0.45, 0.8, 0.52, [Math.PI / 2, 0, 0]) });
  for (let i = -2; i <= 2; i += 1) kit.add(P.box(0.62, 0.035, 0.03, 0.01, 1), { color: '#c9a46a', gloss: 0.7, metal: 0.6, outline: 0, detail: 1, matrix: at(-0.45, 0.8 + i * 0.13, 0.56) });
  kit.add(P.box(0.72, 0.36, 0.04, 0.04, 1), { color: '#ffe9a6', emissive: 0.35, outline: 0, matrix: at(0.45, 0.96, 0.53) });
  for (const x of [0.25, 0.65]) kit.add(P.puck(0.1, 0.09, 0.12, 16, 0.02), { color: '#e4b252', gloss: 0.84, metal: 1, matrix: at(x, 0.56, 0.56, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.5, 0.055, 8, 18, Math.PI), { color: '#5a3422', gloss: 0.5, matrix: at(0, 1.47, 0) });
  kit.add(P.capsule(0.03, 1.5, 3, 6), { color: '#c8ced6', gloss: 0.9, metal: 1, outline: 0.4, matrix: at(0.78, 2.15, -0.25, [0, 0, -0.42]) });
  kit.add(P.sphere(0.06, 8, 6), { color: '#c8ced6', gloss: 0.9, metal: 1, outline: 0, matrix: at(1.12, 2.86, -0.25) });
  for (const x of [-0.8, 0.8]) kit.add(P.box(0.24, 0.1, 0.7, 0.03, 1), { color: '#5a3422', outline: 0, matrix: at(x, 0.05, 0) });
  return kit.build();
}

/** The tuning needle, pivoting at the origin. */
function radioNeedle(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.03, 0.26, 0.02, 0.01, 1), { color: '#d8473f', outline: 0, matrix: at(0, 0.1, 0) });
  return kit.build();
}

function fridgeDoor(): THREE.BufferGeometry {
  // Hinged on its own left edge, which sits at the local origin.
  const kit = new Kit();
  kit.add(P.box(5.8, 8.4, 0.5, 0.42, 5), { color: C.mint, gloss: 0.88, coat: 0.5, pattern: Pattern.Enamel, wear: 0.2, matrix: at(2.9, -1.9, 0) });
  kit.add(P.box(5.8, 3.2, 0.5, 0.42, 5), { color: C.mint, gloss: 0.88, coat: 0.5, pattern: Pattern.Enamel, wear: 0.2, matrix: at(2.9, 4.1, 0) });
  kit.add(P.box(0.26, 2.1, 0.26, 0.11, 3), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(5.1, 0.7, 0.42) });
  kit.add(P.box(1.8, 0.5, 0.08, 0.1, 2), { color: C.cream, gloss: 0.8, emissive: 0.05, matrix: at(2.9, 4.4, 0.28) });
  kit.add(P.box(1.2, 0.09, 0.03, 0.02, 1), { color: C.red, outline: 0, matrix: at(2.9, 4.4, 0.33) });
  // Refrigerator magnets and a note nobody has read in years.
  kit.add(P.box(1.2, 1.5, 0.03, 0.02, 1), { color: '#fff7d6', gloss: 0.1, matrix: at(1.9, -1.1, 0.27, [0, 0, 0.05]) });
  kit.add(P.sphere(0.13, 8, 6), { color: C.red, gloss: 0.9, matrix: at(1.9, -0.45, 0.32) });
  kit.add(P.sphere(0.16, 8, 6), { color: C.butter, gloss: 0.9, matrix: at(3.6, -2.2, 0.32) });
  kit.add(P.box(0.5, 0.36, 0.08, 0.04, 1), { color: C.sky, gloss: 0.8, matrix: at(3.5, -0.8, 0.3, [0, 0, -0.15]) });
  fridgeBadge(kit);
  // The light inside, seen along the gap once the door has been left ajar.
  kit.add(P.box(0.1, 11.2, 0.3, 0.04, 1), { color: '#d8f0ff', emissive: 1, outline: 0, light: lightGroup(1, LIT.fridge), matrix: at(5.86, 0.3, -0.32) });
  return kit.build();
}

/** Kitchen light groups, in the order they come on as the afternoon turns to evening. */
const LIT = { pendant: 0, strip: 1, fridge: 2, sconceL: 3, sconceR: 4, chandelier: 5 } as const;
const SCONCES: Array<[number, number]> = [[-16.6, 10.6], [-4.2, 10.6]];
const STRIP = { x: 23, y: 4.45, z: -14.95 };
const CHANDELIER_AT = new THREE.Vector3(-13, 13.4, -7.5);
const RUG = { x: -6.6, y: GROUND + 0.135, z: 11.2 };

/** The lived-in layer: chairs at the table, a calendar, cookbooks, wall lamps and a cabinet light. */
function addLivedIn(kit: Kit): void {
  const wood = { color: '#b87542', gloss: 0.4, pattern: Pattern.Wood + 0.4 };
  for (const [x, z, turn] of [[-4.6, -4.9, 0.75], [4.7, -4.8, -0.75]] as const) {
    const seat = GROUND + 3.1;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const place = (lx: number, ly: number, lz: number): THREE.Matrix4 => at(x + lx * c + lz * s, ly, z - lx * s + lz * c, [0, turn, 0]);
    kit.add(P.box(2.6, 0.26, 2.5, 0.1, 2), { ...wood, matrix: place(0, seat, 0) });
    kit.add(P.box(2.5, 0.16, 2.4, 0.06, 1), { color: '#d8473f', gloss: 0.2, pattern: Pattern.Fabric, matrix: place(0, seat + 0.2, 0.05) });
    for (const [lx, lz] of [[-1.05, -1.0], [1.05, -1.0], [-1.05, 1.0], [1.05, 1.0]] as const) {
      kit.add(P.puck(0.14, 0.11, 3.0, 10, 0.03), { ...wood, matrix: place(lx, GROUND, lz) });
    }
    kit.add(P.box(2.6, 0.5, 0.24, 0.1, 2), { ...wood, matrix: place(0, seat + 3.1, -1.12) });
    for (const lx of [-0.8, 0, 0.8]) kit.add(P.puck(0.08, 0.08, 2.8, 8, 0.02), { ...wood, outline: 0.5, matrix: place(lx, seat + 0.1, -1.12) });
  }
  // A calendar beside the fridge, still on a month long gone.
  kit.add(P.box(2.2, 3, 0.05, 0.03, 1), { color: '#fff7e6', gloss: 0.08, pattern: Pattern.Paper, matrix: at(-16.2, 2.6, -17.26) });
  kit.add(P.box(2.2, 1.1, 0.06, 0.03, 1), { color: '#d8313a', gloss: 0.3, outline: 0.4, matrix: at(-16.2, 3.6, -17.24) });
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) kit.add(P.box(0.24, 0.2, 0.01, 0.005, 1), { color: (row * 5 + col) % 7 === 6 ? '#d8313a' : '#8a7a6a', outline: 0, detail: 1, matrix: at(-17 + col * 0.4, 2.55 - row * 0.34, -17.22) });
  }
  // Cookbooks between the jars on the shelf over the stove.
  ['#3f7fd8', '#ffc53f', '#2f9e87'].forEach((color, i) => {
    kit.add(P.box(0.42, 1.5 - i * 0.12, 1.1, 0.05, 1), { color, gloss: 0.35, pattern: Pattern.Paper, matrix: at(-6.25 + i * 0.46, 5.18 + (0.75 - i * 0.06), -16.45, [0, 0, i === 2 ? -0.18 : 0]) });
  });
  // Two wall lamps either side of the pictures.
  for (const [x, y] of SCONCES) {
    const group = lightGroup(1, x < -10 ? LIT.sconceL : LIT.sconceR);
    kit.add(P.puck(0.5, 0.42, 0.18, 20, 0.05), { color: '#e4b252', gloss: 0.84, metal: 1, matrix: at(x, y, -17.33, [Math.PI / 2, 0, 0]) });
    kit.add(P.tube([new THREE.Vector3(x, y, -17.2), new THREE.Vector3(x, y + 0.35, -16.6), new THREE.Vector3(x, y + 0.3, -16.2)], 0.08, 8, 6), { color: '#e4b252', gloss: 0.84, metal: 1 });
    kit.add(P.lathe([[0.22, 0.5], [0.72, -0.5], [0.66, -0.56], [0.18, 0.44]], 24, 0.05, 2), { color: '#fff0d4', gloss: 0.4, emissive: 0.4, light: group, lightKeepsPaint: true, matrix: at(x, y + 0.65, -16.2) });
    kit.add(P.sphere(0.26, 12, 8), { color: '#fff1c4', emissive: 1, outline: 0, light: group, matrix: at(x, y + 0.35, -16.2) });
  }
  // A light tucked under the far cabinet, washing the worktop below it.
  kit.add(P.box(9.6, 0.22, 0.4, 0.06, 2), { color: C.cream, gloss: 0.5, matrix: at(STRIP.x, STRIP.y + 0.05, STRIP.z) });
  kit.add(P.capsule(0.08, 9, 3, 8), { color: '#fff1c4', emissive: 1, outline: 0, light: lightGroup(1, LIT.strip), matrix: at(STRIP.x, STRIP.y - 0.08, STRIP.z + 0.05, [0, 0, Math.PI / 2]) });
}

function chandelierGeometry(): THREE.BufferGeometry {
  // Hangs from a chain that starts well above the picture.
  const kit = new Kit();
  const brass = { color: '#e9bd5c', gloss: 0.9, metal: 1, wear: 0.25 };
  const crystal = { color: '#e9f6ff', gloss: 1, coat: 1, metal: 0.35, outline: 0.3 };
  for (let i = 0; i < 9; i += 1) kit.add(P.torus(0.22, 0.06, 6, 12), { ...brass, outline: 0.3, matrix: at(0, 1.4 + i * 0.85, 0, [0, i * 1.57, 0]) });
  kit.add(P.lathe([[0, -1.2], [0.3, -1], [0.5, -0.2], [0.34, 0.6], [0.2, 1.2], [0, 1.4]], 20, 0.08, 3), brass);
  kit.add(P.torus(2.2, 0.12, 8, 48), { ...brass, matrix: at(0, -0.3, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(1.25, 0.09, 8, 36), { ...brass, matrix: at(0, 0.5, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 2.2;
    const z = Math.sin(a) * 2.2;
    kit.add(P.tube([new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(x * 0.55, -0.55, z * 0.55), new THREE.Vector3(x, -0.3, z)], 0.07, 8, 6), brass);
    kit.add(P.puck(0.24, 0.3, 0.2, 14, 0.05), { ...brass, matrix: at(x, -0.3, z) });
    kit.add(P.capsule(0.12, 0.42, 3, 8), { color: '#fff7e6', gloss: 0.3, emissive: 0.2, light: lightGroup(1, LIT.chandelier), lightKeepsPaint: true, matrix: at(x, 0.2, z) });
    kit.add(P.sphere(0.16, 10, 8), { color: '#ffe9a8', emissive: 1, outline: 0, light: lightGroup(1, LIT.chandelier), matrix: at(x, 0.62, z, [0, 0, 0], [0.8, 1.3, 0.8]) });
    // Drops of cut crystal under every arm, and a ring of them round the hoop.
    for (let d = 0; d < 3; d += 1) kit.add(P.sphere(0.16 - d * 0.03, 6, 4), { ...crystal, matrix: at(x * 0.92, -0.72 - d * 0.34, z * 0.92, [0, a, 0], [0.75, 1.3, 0.75]) });
    const b = a + Math.PI / 6;
    kit.add(P.sphere(0.2, 6, 4), { ...crystal, matrix: at(Math.cos(b) * 1.8, -0.95, Math.sin(b) * 1.8, [0, b, 0], [0.75, 1.4, 0.75]) });
  }
  kit.add(P.sphere(0.42, 8, 6), { ...crystal, matrix: at(0, -1.55, 0, [0, 0.4, 0], [0.8, 1.3, 0.8]) });
  return kit.build();
}

function rugGeometry(): THREE.BufferGeometry {
  // A striped runner in front of the sink, with tassels at both ends.
  const kit = new Kit();
  const bands = ['#2f9e87', '#ffc53f', '#d8473f', '#fff0d4', '#7a5bd0', '#ffc53f', '#2f9e87'];
  const width = 9;
  const depth = 3.8;
  bands.forEach((color, i) => {
    kit.add(P.box(width / bands.length + 0.01, 0.07, depth, 0.02, 1), { color, gloss: 0.05, pattern: Pattern.Fabric + 0.25, outline: 0, fixedColor: true, matrix: at(-width / 2 + (i + 0.5) * (width / bands.length), 0.035, 0) });
  });
  kit.add(P.box(width + 0.1, 0.05, depth + 0.1, 0.02, 1), { color: '#6e2c48', gloss: 0.05, pattern: Pattern.Fabric + 0.25, outline: 0.4, fixedColor: true, matrix: at(0, 0.02, 0) });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i += 1) kit.add(P.capsule(0.045, 0.32, 2, 5), { color: '#fff0d4', gloss: 0.1, outline: 0, fixedColor: true, detail: 1, matrix: at(side * (width / 2 + 0.2), 0.04, -depth / 2 + 0.18 + i * ((depth - 0.36) / 11), [0, 0, Math.PI / 2]) });
  }
  return kit.build();
}

const WINDOW = { x: 10, y: 6.6, w: 9, h: 6.6 };

/** The window frame; the sky is its own pane so the afternoon can turn into evening. */
function addWindow(kit: Kit): void {
  const { x, y, w, h } = WINDOW;
  const frame = { color: C.trim, gloss: 0.45 };
  kit.add(P.box(w + 0.8, 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x, y + h / 2 + 0.1, -17) });
  kit.add(P.box(w + 1.4, 0.45, 1.1, 0.12, 2), { ...frame, matrix: at(x, y - h / 2 - 0.1, -16.8) });
  kit.add(P.box(0.4, h + 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x - w / 2 - 0.1, y, -17) });
  kit.add(P.box(0.4, h + 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x + w / 2 + 0.1, y, -17) });
  kit.add(P.box(0.18, h, 0.26, 0.05, 1), { ...frame, matrix: at(x, y, -17.05) });
  kit.add(P.box(w, 0.18, 0.26, 0.05, 1), { ...frame, matrix: at(x, y + 0.3, -17.05) });
  // Scalloped valance.
  for (let i = -5; i <= 5; i += 1) {
    kit.add(P.sphere(0.56, 14, 10), {
      color: i & 1 ? C.butter : C.cream,
      gloss: 0.15,
      matrix: at(x + i * 0.92, y + h / 2 - 0.25, -16.75, [0, 0, 0], [1, 0.88, 0.45]),
    });
  }
}

function addCounter(kit: Kit): void {
  const left = 2.6;
  const right = 34;
  const cx = (left + right) / 2;
  const width = right - left;
  kit.add(P.box(width, 3.5, 3.6, 0.1, 2), { color: C.cream, gloss: 0.35, matrix: at(cx, GROUND + 1.95, -15.3) });
  kit.add(P.box(width + 0.4, 0.45, 4.1, 0.14, 3), { color: C.counter, gloss: 0.85, coat: 0.45, pattern: Pattern.Enamel, wear: 0.15, matrix: at(cx, COUNTER_TOP - 0.2, -15.2) });
  kit.add(P.box(width, 0.42, 3.4, 0.05, 1), { color: C.navy, gloss: 0.1, outline: 0, matrix: at(cx, GROUND + 0.2, -15.5) });
  for (let i = 0; i < 9; i += 1) {
    const x = left + 1.75 + i * 3.45;
    kit.add(P.box(3.15, 2.8, 0.12, 0.14, 2), { color: i % 2 ? '#ffe2ae' : '#ffe9c2', gloss: 0.45, matrix: at(x, GROUND + 2.05, -13.46) });
    kit.add(P.sphere(0.14, 10, 8), { color: C.red, gloss: 0.9, matrix: at(x + 1.1, GROUND + 3, -13.32) });
  }
  // Upper cabinet on the far side of the window, with a shelf rail.
  kit.add(P.box(11, 5, 2.6, 0.12, 2), { color: C.cream, gloss: 0.35, matrix: at(23, 7.1, -16) });
  for (let i = 0; i < 3; i += 1) {
    kit.add(P.box(3.3, 4.4, 0.1, 0.12, 2), { color: '#ffe9c2', gloss: 0.45, matrix: at(19.4 + i * 3.6, 7.1, -14.66) });
    kit.add(P.sphere(0.12, 8, 7), { color: C.red, gloss: 0.9, matrix: at(20.6 + i * 3.6, 5.5, -14.55) });
  }
  // Sink with a faucet and the rubber duck that lives there.
  kit.add(P.box(5, 0.08, 2.5, 0.04, 1), { color: '#a9b6c4', gloss: 0.85, metal: 1, pattern: Pattern.Brushed, outline: 0, matrix: at(10, COUNTER_TOP + 0.05, -15.2) });
  kit.add(P.tube([new THREE.Vector3(10, COUNTER_TOP, -16.6), new THREE.Vector3(10, COUNTER_TOP + 1.6, -16.6), new THREE.Vector3(10, COUNTER_TOP + 1.9, -15.9), new THREE.Vector3(10, COUNTER_TOP + 1.3, -15.5)], 0.12, 18, 8), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed });
  kit.add(P.sphere(0.42, 12, 9), { color: C.butter, gloss: 0.8, matrix: at(11.6, COUNTER_TOP + 0.42, -15, [0, 0, 0], [1.2, 0.85, 1]) });
  kit.add(P.sphere(0.27, 12, 9), { color: C.butter, gloss: 0.8, matrix: at(11.98, COUNTER_TOP + 0.84, -15) });
  kit.add(P.box(0.2, 0.08, 0.18, 0.03, 1), { color: '#f07a2a', gloss: 0.6, matrix: at(12.3, COUNTER_TOP + 0.8, -15) });
}

function addDecor(kit: Kit): void {
  // Shelf over the stove with jars.
  kit.add(P.box(11, 0.26, 1.5, 0.08, 2), { color: C.wood, gloss: 0.4, pattern: Pattern.Wood, matrix: at(-6.2, 5.05, -16.5) });
  for (const x of [-10.6, -1.8]) kit.add(P.box(0.24, 0.8, 1.2, 0.06, 1), { color: C.woodDark, gloss: 0.3, matrix: at(x, 4.6, -16.7) });
  const jars: Array<[number, string, number]> = [
    [-10, C.red, 0.5],
    [-8.7, C.butter, 0.68],
    [-7.3, C.mint, 0.42],
    [-4.2, C.sky, 0.6],
    [-2.9, C.cream, 0.46],
  ];
  for (const [x, color, r] of jars) {
    kit.add(P.lathe([[0, 0], [r, 0], [r, r * 1.5], [r * 0.62, r * 1.85], [0, r * 1.9]], 20, 0.08, 2), { color, gloss: 0.7, matrix: at(x, 5.18, -16.4) });
  }

  // A mouse hole in the skirting; its owner has noticed the smell.
  kit.add(P.lathe([[0, -0.05], [0.72, -0.05], [0.7, 0.02], [0, 0.03]], 24, 0.02, 1), { color: '#1a0e18', outline: 0, matrix: at(0.2, GROUND + 0.62, -17.02, [Math.PI / 2, 0, 0], [1, 1, 1.25]) });

  // Foreground furniture falls out of focus and frames the picture.
  kit.add(P.lathe([[0, 0], [1.25, 0], [1.6, 1.8], [1.74, 2.05], [0, 2.05]], 28, 0.1), { color: '#d9774e', gloss: 0.45, matrix: at(18.5, GROUND, 15) });
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    kit.add(P.sphere(1.1, 10, 8), {
      color: i % 2 ? C.leaf : '#4cae78',
      gloss: 0.3,
      matrix: at(18.5 + Math.cos(a) * 1.25, GROUND + 3.5 + (i % 3) * 0.75, 15 + Math.sin(a) * 1.25, [0.4, a, 0.5], [0.5, 1.5, 0.3]),
    });
  }
  kit.add(P.box(5, 0.4, 5, 0.16, 2), { color: C.red, gloss: 0.5, matrix: at(-21, GROUND + 3.4, 12) });
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    kit.add(P.box(0.34, 3.4, 0.34, 0.1, 1), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(-21 + dx, GROUND + 1.7, 12 + dz) });
  }
  for (const dx of [-2, 2]) kit.add(P.box(0.32, 4.4, 0.32, 0.1, 1), { color: C.chrome, gloss: 0.9, metal: 1, pattern: Pattern.Brushed, matrix: at(-21 + dx, GROUND + 5.8, 9.9) });
  kit.add(P.box(5, 2, 0.4, 0.16, 2), { color: C.red, gloss: 0.5, matrix: at(-21, GROUND + 7.6, 9.9) });
}

function bowlGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = BOWL;
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, 0.02],
        [1.15, 0.02],
        [1.25, 0.2],
        [1.9, 1.05],
        [o, r - 0.2],
        [o + 0.06, r],
      ],
      84,
      0.12,
      5,
    ),
    { color: C.skyDeep, gloss: 0.9, coat: 0.65, pattern: Pattern.Enamel, wear: 0.15, ao: (p) => 0.55 + 0.45 * smooth(0.1, 1.1, p.y) },
  );
  kit.add(P.lathe([[o + 0.03, r - 0.05], [o + 0.1, r + 0.02], [o + 0.03, r + 0.08], [i, r + 0.06], [i - 0.03, r - 0.05]], 84, 0.03), { color: C.cream, gloss: 0.9 });
  kit.add(P.lathe([[i, r], [i - 0.25, f + 0.5], [i - 0.8, f], [0, f]], 84, 0.2), { color: C.navy, gloss: 0.4, outline: 0, ao: (p) => 0.4 + 0.6 * smooth(f, r, p.y) });
  // Painted dots around the belly.
  for (let n = 0; n < 16; n += 1) {
    const a = (n / 16) * Math.PI * 2;
    kit.add(P.sphere(0.13, 10, 7), { color: C.cream, gloss: 0.8, outline: 0, matrix: at(Math.cos(a) * 1.87, 1.25, Math.sin(a) * 1.87, [0, -a, 0], [0.3, 1, 1]) });
  }
  return kit.build();
}

function clockHand(length: number, width: number): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(width, length, 0.06, width * 0.45, 1), { color: C.navy, gloss: 0.4, outline: 0, matrix: at(0, length / 2 - 0.1, 0) });
  return kit.build();
}

function lampGeometry(): THREE.BufferGeometry {
  // Hangs from the origin.
  const kit = new Kit();
  kit.add(P.capsule(0.05, 6.4, 2, 6), { color: C.navy, gloss: 0.2, outline: 0, matrix: at(0, -3.2, 0) });
  kit.add(P.lathe([[0, -7.9], [2.4, -7.9], [2.3, -7.75], [0.8, -6.8], [0.32, -6.5], [0, -6.45]], 36, 0.08), { color: C.red, gloss: 0.85, coat: 0.55, pattern: Pattern.Enamel, wear: 0.2, matrix: at(0, 0, 0) });
  kit.add(P.sphere(0.72, 18, 12), { color: '#fff3c8', emissive: 1, outline: 0, light: lightGroup(1, LIT.pendant), matrix: at(0, -7.95, 0, [0, 0, 0], [1, 0.62, 1]) });
  return kit.build();
}

const steam = new THREE.Color(0.92, 0.9, 0.88);
const color = new THREE.Color();

/** Out of the window: a bright afternoon, a sunset, then evening. */
const SKY: [SkyLook, SkyLook, SkyLook] = [
  { top: '#4f9fe8', horizon: '#d6ecff', glow: '#fff2c8', glowStrength: 0.25, stars: 0, clouds: 0.75, cloud: '#ffffff', brightness: 1.15 },
  { top: '#4c4cae', horizon: '#ff9a5a', glow: '#ff7a3a', glowStrength: 0.95, stars: 0.08, clouds: 0.5, cloud: '#ffb48a', brightness: 1.15 },
  { top: '#10164e', horizon: '#3a2f7c', glow: '#8a4a9a', glowStrength: 0.25, stars: 1, clouds: 0.1, cloud: '#3a3a6a', brightness: 1.05 },
];

interface WindowLight {
  color: string;
  intensity: number;
  beam: string;
  strength: number;
}

/** What the window throws into the room: afternoon sun, sunset orange, then moonlight. */
const WINDOW_LIGHT: [WindowLight, WindowLight, WindowLight] = [
  { color: '#fff0c8', intensity: 0.95, beam: '#fff0c4', strength: 0.085 },
  { color: '#ff9a5a', intensity: 0.75, beam: '#ffb07a', strength: 0.075 },
  { color: '#a88cff', intensity: 0.5, beam: '#c79bff', strength: 0.05 },
];

function* buildKitchen(stage: Stage, root: THREE.Group): SceneBuild {
  const set = new Kit();
  yield* addRoom(set);
  addTable(set);
  yield;
  addFridge(set);
  yield;
  addWindow(set);
  yield;
  addCounter(set);
  yield;
  addDecor(set);
  addLivedIn(set);
  yield;
  dressKitchen(set, GROUND, COUNTER_TOP);
  yield;
  addToy(stage, root, set.build({ frozen: true }));
  yield;
  // The pool under the pendant lamp, and the light falling in through the window.
  const pendantBeam = (addLightBeam(root, new THREE.Vector3(0, 10.2, 0), new THREE.Vector3(0, GROUND, 0), 1.9, 10, '#ffd9a4', 0.07).material as THREE.ShaderMaterial).uniforms;
  const windowBeam = (addLightBeam(root, new THREE.Vector3(10, 7.2, -16.9), new THREE.Vector3(1, GROUND, -3), 3.2, 6.5, '#c79bff', 0.05).material as THREE.ShaderMaterial).uniforms;
  // Out of the window: an afternoon sky, a sunset, then the moon over the rooftops.
  const sky = skyUniforms();
  sky.uRange.value.set(-WINDOW.h / 2, WINDOW.h / 2);
  sky.uGlowAt.value.set(3, -3.3, 0, 0);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.h), skyMaterial(sky, false));
  pane.position.set(WINDOW.x, WINDOW.y, -17.08);
  root.add(pane);
  const bowl = addToy(stage, root, bowlGeometry());
  yield;

  const door = addToy(stage, root, fridgeDoor());
  door.position.set(-23.9, GROUND + 6.9, -11.35);
  yield;

  // Wall clock over the stove, still telling the time nobody asked for.
  const clockKit = new Kit();
  clockKit.add(P.puck(1.55, 1.45, 0.24, 44, 0.08), { color: C.red, gloss: 0.85, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  clockKit.add(P.puck(1.28, 1.26, 0.27, 44, 0.03), { color: C.cream, gloss: 0.5, outline: 0, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  for (let h = 0; h < 12; h += 1) {
    const a = (h / 12) * Math.PI * 2;
    clockKit.add(P.box(0.08, h % 3 === 0 ? 0.26 : 0.14, 0.03, 0.02, 1), { color: C.navy, outline: 0, matrix: at(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0.29, [0, 0, -a]) });
  }
  const clock = addToy(stage, root, clockKit.build());
  clock.position.set(-3.2, 9.6, -17.1);
  yield;
  const hourHand = new THREE.Mesh(clockHand(0.72, 0.13), toyMaterials().body);
  const minuteHand = new THREE.Mesh(clockHand(1.02, 0.09), toyMaterials().body);
  hourHand.position.set(-3.2, 9.6, -16.78);
  minuteHand.position.set(-3.2, 9.6, -16.75);
  root.add(hourHand, minuteHand);

  const lamp = addToy(stage, root, lampGeometry());
  lamp.position.set(0, 18, 0);
  yield;

  // The mouse darts out to steal one flake, then thinks better of it.
  const mouseKit = new Kit();
  mouseKit.add(P.sphere(0.42, 12, 9), { color: '#8d8592', gloss: 0.3, matrix: at(0, 0.34, 0, [0, 0, 0], [0.86, 0.8, 1.15]) });
  mouseKit.add(P.sphere(0.17, 8, 6), { color: '#a79fae', gloss: 0.3, matrix: at(-0.28, 0.66, 0.06) });
  mouseKit.add(P.sphere(0.17, 8, 6), { color: '#a79fae', gloss: 0.3, matrix: at(0.28, 0.66, 0.06) });
  mouseKit.add(P.sphere(0.05, 6, 5), { color: '#f07a8a', outline: 0, matrix: at(0, 0.3, 0.47) });
  const mouse = addToy(stage, root, mouseKit.build());
  mouse.position.set(0.2, GROUND, -17);
  yield;

  // Toy figures, the bought decorations and anything else that comes and goes share one rig.
  const pieces = new SetPieces(root);
  const kid = toyFigure(pieces, root, { skin: '#f0c49a', shirt: '#3f7fd8', pants: '#ffc53f', hair: '#2a1a14', hat: 'cap', hatColor: '#d8473f' });
  kid.root.position.set(7.4, COUNTER_TOP + 0.03, -14.1);
  kid.root.scale.setScalar(2.1);
  kid.root.rotation.y = -0.25;
  const cook = toyFigure(pieces, root, { skin: '#ffd8b4', shirt: '#d8473f', pants: '#26325e', hair: '#e8e0d8', hat: 'chef' });
  cook.root.position.set(-7.4, GROUND, 10.4);
  cook.root.scale.setScalar(2.6);
  cook.root.rotation.y = 0.6;
  const chandelier = pieces.group(root, CHANDELIER_AT.x, CHANDELIER_AT.y, CHANDELIER_AT.z);
  pieces.part(chandelierGeometry(), chandelier);
  pieces.decoration('decor-chandelier', chandelier, 2.6);
  // Laid half over the round rug, in the open floor in front of the table.
  const rug = pieces.group(root, RUG.x, RUG.y, RUG.z);
  rug.rotation.y = -0.3;
  pieces.part(rugGeometry(), rug);
  pieces.decoration('decor-rug', rug, 3);
  // A hidden thing to find (src/content/props.ts): the radio the cook keeps on.
  const radio = pieces.group(root, RADIO_AT.x, RADIO_AT.y, RADIO_AT.z);
  radio.rotation.y = 0.55;
  pieces.part(radioGeometry(), radio);
  const needle = pieces.part(radioNeedle(), pieces.group(radio, 0.45, 0.9, 0.56));
  pieces.build(stage);
  yield;

  const bank = new LightBank(1, [
    { at: 0.3, style: 'bulb' },
    { at: 0.62, style: 'neon' },
    { at: 0.78, style: 'neon' },
    { at: 0.42, style: 'bulb' },
    { at: 0.48, style: 'bulb' },
    { style: 'bulb' },
  ]);
  const windowLight = new THREE.Color();
  const lamps: Lamp[] = [
    { position: [0, 10, 0], color: '#ffd59a', intensity: 0, radius: 24 },
    { position: [10, 6.6, -14.5], color: windowLight, intensity: 0.55, radius: 12 },
    { position: [STRIP.x, STRIP.y - 1.2, STRIP.z + 1.4], color: '#ffd8a0', intensity: 0, radius: 9 },
    { position: [-19.5, GROUND + 6.5, -10.4], color: '#c6ecff', intensity: 0, radius: 8 },
    { position: [SCONCES[0]![0], SCONCES[0]![1], -15.6], color: '#ffcf8f', intensity: 0, radius: 8 },
    { position: [SCONCES[1]![0], SCONCES[1]![1], -15.6], color: '#ffcf8f', intensity: 0, radius: 8 },
    { position: [CHANDELIER_AT.x, CHANDELIER_AT.y - 1, CHANDELIER_AT.z], color: '#ffe2b0', intensity: 0, radius: 15 },
  ];

  const lampSwing = new Spring(0, 8, 0.55);
  const bowlKick = new Spring(0, 420, 15);
  const kidHop = new Spring(0, 140, 10);
  const chandelierSwing = new Spring(0, 6, 0.7);
  let time = 0;
  let steamTimer = 0;
  let doorOpening = false;

  // Hidden things to find: the fridge, the lamp, the radio.
  const cues = new Cues();
  const fridgeGag = new Pulse(1.9);
  const radioWobble = new Wobble(radio, { axis: 'z', squash: 0.16, turn: 0.12, stiffness: 300, damping: 8 });
  let needleSpin = 0;
  const fridgeSpot = new THREE.Vector3(-21, GROUND + 6.9, -11);
  const lampSpot = new THREE.Vector3(0, 10.6, 0);
  const radioSpot = new THREE.Vector3(RADIO_AT.x, RADIO_AT.y + 1.2, RADIO_AT.z);
  const eggs: EggSpot[] = [
    {
      id: 'egg-fridge',
      position: fridgeSpot,
      radius: 3.6,
      active: () => !doorOpening && !fridgeGag.busy,
      play(ctx) {
        // The door swings wide, and the fridge turns out to be packed with popcorn too.
        fridgeGag.start();
        cues.after(0.32, () => {
          for (let i = 0; i < 14; i += 1) {
            ctx.director.launch(-21 + ctx.rng.range(-2.2, 2.2), GROUND + ctx.rng.range(2.5, 10.5), -10.6, { flight: ctx.rng.range(0.6, 1), scale: ctx.rng.range(0.4, 0.55), quiet: i > 3 });
          }
        });
      },
    },
    {
      id: 'egg-lamp',
      position: lampSpot,
      radius: 1.6,
      play(ctx) {
        gag.sparkle(ctx, lampSpot, 0.8, 5);
        lampSwing.kick(0.36);
        cues.after(0.8, () => ctx.director.launch(0, 9.6, 0, { flight: 0.45, scale: 0.5 }));
      },
    },
    {
      id: 'egg-radio',
      position: radioSpot,
      radius: 1.7,
      play(ctx) {
        // It bounces to the beat while the needle hunts the stations, every one playing popcorn.
        needleSpin = 1;
        for (let beat = 0; beat < 4; beat += 1) {
          cues.after(beat * 0.34, () => {
            radioWobble.kick(0.7);
            const r = ctx.rng;
            ctx.sprites.spawn({ x: radioSpot.x + r.range(-0.6, 0.2), y: radioSpot.y + 0.5, z: radioSpot.z + 0.4, vx: r.range(-0.4, 0.4), vy: r.range(1.4, 2.2), vz: 0.3, drag: 0.8, sizeStart: 0.32, sizeEnd: 0.12, life: 1, color: noteColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: r.range(-2, 2) });
            if (beat % 2 === 1) ctx.director.launch(radioSpot.x, radioSpot.y + 0.4, radioSpot.z, { flight: 0.8, scale: 0.45 });
          });
        }
      },
    },
  ];
  let story = 0;
  let strain = 0;

  const tell = (u: number, dt: number, instant: boolean, calm: boolean): void => {
    story = u;
    bank.update(u, dt, instant, calm);
    alongStory(u, SKY, (from, to, t) => blendSky(sky, from, to, t));
    alongStory(u, WINDOW_LIGHT, (from, to, t) => {
      windowLight.set(from.color).lerp(color.set(to.color), t);
      lamps[1]!.intensity = lerp(from.intensity, to.intensity, t);
      (windowBeam.uColor!.value as THREE.Color).set(from.beam).lerp(color.set(to.beam), t);
      windowBeam.uStrength!.value = lerp(from.strength, to.strength, t);
    });
    lamps[0]!.intensity = 1.15 * bank.level(LIT.pendant);
    pendantBeam.uStrength!.value = 0.07 * bank.level(LIT.pendant);
    lamps[2]!.intensity = 0.9 * bank.level(LIT.strip);
    lamps[3]!.intensity = 0.75 * bank.level(LIT.fridge);
    lamps[4]!.intensity = 0.7 * bank.level(LIT.sconceL);
    lamps[5]!.intensity = 0.7 * bank.level(LIT.sconceR);
    lamps[6]!.intensity = 1.05 * bank.level(LIT.chandelier);
  };

  // The sun sinks out of the afternoon sky; once it has gone, the moon comes up.
  const placeDisc = (u: number, shake: number): void => {
    const [toMid, toLate] = storyWeights(u);
    if (toLate <= 0) {
      sky.uCraters.value = 0;
      sky.uDisc.value.set(lerp(2.4, 3.3, toMid), lerp(2.1, -2.7, toMid), lerp(0.5, 0.68, toMid), lerp(2.6, 2.1, toMid) * (1 - smooth(0.85, 1, toMid) * 0.6));
      sky.uDiscColor.value.set('#fff4d6').lerp(color.set('#ff9a52'), toMid);
    } else {
      sky.uCraters.value = 1;
      sky.uDisc.value.set(lerp(-1.4, -2.4, toLate) + Math.sin(time * 47) * shake, lerp(-2.2, 1.6, toLate) + Math.cos(time * 41) * shake * 0.8, 0.62, lerp(0.6, 1.6, smooth(0, 0.4, toLate)));
      sky.uDiscColor.value.set('#fff1c4');
    }
  };

  return {
    eggs,
    lamps,
    progress: tell,
    upgradesChanged(owned, animate) {
      pieces.sync(owned, animate);
      bank.want(LIT.chandelier, pieces.owns('decor-chandelier'));
    },
    kick(strength) {
      bowlKick.kick(-0.16 - 0.14 * strength);
      if (strength > 0) {
        lampSwing.kick(0.014 * strength);
        chandelierSwing.kick(0.01 * strength);
        kidHop.kick(1.2 * strength);
      }
    },
    strain(u) {
      strain = u;
      lampSwing.kick(u * u * 0.05 * Math.sin(time * 30));
    },
    blast(ctx) {
      doorOpening = true;
      lampSwing.kick(0.5);
      chandelierSwing.kick(0.4);
      // The fridge gives way first, then the window.
      for (let i = 0; i < 24; i += 1) {
        ctx.director.launch(-20 + ctx.rng.range(-2.4, 2.4), GROUND + ctx.rng.range(2, 11), -10.5, { flight: ctx.rng.range(0.7, 1.2), scale: ctx.rng.range(0.4, 0.6), reach: 1.6, quiet: i > 5 });
      }
      for (let i = 0; i < 20; i += 1) {
        ctx.director.launch(WINDOW.x + ctx.rng.range(-4, 4), WINDOW.y + ctx.rng.range(-3, 3), -16.6, { flight: ctx.rng.range(0.7, 1.2), scale: ctx.rng.range(0.4, 0.6), reach: 1.6, quiet: i > 4 });
      }
    },
    afterBlast(dt) {
      if (doorOpening) door.rotation.y = Math.max(-1.9, door.rotation.y - dt * 7);
    },
    settleAsMiniature() {
      door.rotation.y = -1.9;
      kid.root.visible = false;
      cook.root.visible = false;
      tell(1, 0, true, true);
      placeDisc(1, 0);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      const kick = bowlKick.update(dt);
      bowl.scale.set(1 - kick * 0.018, 1 + kick * 0.03, 1 - kick * 0.018);
      lamp.rotation.z = lampSwing.update(dt) + Math.sin(time * 0.7) * 0.012;
      lamp.rotation.x = Math.sin(time * 0.53) * 0.008;
      chandelier.rotation.z = chandelierSwing.update(dt) + Math.sin(time * 0.6 + 1) * 0.006;
      // The hands run fast: time flies when things are out of control.
      minuteHand.rotation.z = -time * 0.5;
      hourHand.rotation.z = -time * 0.5 / 12 - 1;
      // Left ajar once evening comes, so the fridge light shows round the door.
      if (!doorOpening) door.rotation.y = -0.035 * bank.level(LIT.fridge) - strain * strain * 0.06 * Math.abs(Math.sin(time * 40)) - 1.25 * fridgeGag.update(dt);
      cues.update(dt);
      radioWobble.update(dt);
      needleSpin = Math.max(0, needleSpin - dt * 0.7);
      needle.rotation.z = Math.sin(time * 9) * 0.9 * needleSpin;

      const period = lerp(9, 5, story);
      const cycle = time % period;
      const tremble = cycle > period - 1.4 ? Math.sin(((cycle - period + 1.4) * Math.PI) / 1.4) : 0;
      placeDisc(story, (0.03 + 0.08 * story) * tremble + strain * strain * 0.08);

      const peek = (time + 4) % 13;
      const out = smooth(0, 0.3, peek) * (1 - smooth(1.5, 1.8, peek));
      const scurry = smooth(3.4, 3.8, peek) * (1 - smooth(5.2, 5.6, peek));
      mouse.position.z = -17 + out * 0.5 + scurry * 3.2;
      mouse.position.x = 0.2 + scurry * Math.sin(time * 26) * 0.08;
      mouse.scale.setScalar(Math.max(0.001, Math.max(out, scurry)));

      updateFigures(dt, ctx);
      pieces.update(dt, ctx);

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.22;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        const radius = r.range(0.2, 1.6);
        ctx.sprites.spawn({
          x: Math.cos(a) * radius,
          y: BOWL.rimY + (ctx.level > 0.55 ? 2.6 : 0),
          z: Math.sin(a) * radius,
          vx: r.range(-0.14, 0.14),
          vy: r.range(0.75, 1.25),
          vz: r.range(-0.1, 0.1),
          drag: 0.25,
          sizeStart: r.range(0.3, 0.42),
          sizeEnd: r.range(1, 1.5),
          life: r.range(1.7, 2.5),
          color: steam,
          alpha: 0.06,
          kind: SpriteKind.Puff,
          spin: r.range(-0.4, 0.4),
        });
      }
    },
  };

  function updateFigures(dt: number, ctx: SceneContext): void {
    // The kid on the worktop bounces at every pop and waves at whoever is watching.
    const hop = Math.max(0, kidHop.update(dt));
    const scared = strain;
    kid.root.position.y = COUNTER_TOP + 0.03 + hop * 0.35 + Math.abs(Math.sin(time * 2.6)) * 0.03;
    kid.root.position.x = 7.4 + Math.sin(time * 57) * scared * 0.05;
    kid.head.rotation.y = Math.sin(time * 0.5) * 0.5 - 0.3;
    const wave = smooth(0, 0.25, (time % 7) - 4.6) * (1 - smooth(1.4, 1.7, (time % 7) - 4.6));
    const cheer = Math.min(1, hop + scared);
    kid.armR.rotation.set(0, 0, lerp(lerp(0.12, 2.7 + Math.sin(time * 12) * 0.3, wave), 2.5, cheer));
    kid.armL.rotation.set(0, 0, lerp(-0.12, -2.5, cheer));
    // The cook by the table nods off as the evening wears on, until the popcorn wakes them.
    const sleepy = smooth(0.6, 0.95, story) * (1 - Math.min(1, hop * 2 + scared));
    const floor = Math.max(GROUND + (pieces.owns('decor-rug') ? 0.2 : 0), ctx.ground(cook.root.position.x, cook.root.position.z) - 0.05);
    cook.root.position.y = floor + Math.abs(Math.sin(time * 1.6)) * 0.04 * (1 - sleepy);
    cook.head.rotation.x = lerp(Math.sin(time * 0.9) * 0.08, 0.45 + Math.sin(time * 0.7) * 0.05, sleepy);
    cook.head.rotation.y = lerp(Math.sin(time * 0.4) * 0.4, 0, sleepy);
    cook.armL.rotation.set(lerp(-0.6 + Math.sin(time * 3) * 0.2, 0, sleepy), 0, -0.15);
    cook.armR.rotation.set(lerp(-0.6 - Math.sin(time * 3) * 0.2, 0, sleepy), 0, 0.15);
  }
}

const onCounter = (x: number, z: number, rotation: number): UnitSlot => ({ x, y: COUNTER_TOP + 0.03, z, rotation, scale: 1.5 });
const onFloor = (x: number, z: number, rotation: number, scale: number): UnitSlot => ({ x, y: GROUND, z, rotation, scale });

export const kitchenSpec: SceneSpec = {
  id: 1,
  // Afternoon sun to start; the room warms at sunset and is lit by its own lamps by evening.
  light: {
    sunDir: [0.4, 0.93, 0.44],
    sunColor: '#fff6e6',
    sunIntensity: 1.36,
    shadeTint: '#5c4a86',
    sky: '#a8c4f2',
    skyIntensity: 0.31,
    ground: '#d9a070',
    groundIntensity: 0.18,
    rim: '#fff2d0',
    rimIntensity: 0.55,
    rimDir: [-0.6, 0.38, -0.7],
    fog: '#4a2838',
    fogRange: [66, 130],
    pool: [0, 0, 1, 18],
    poolFloor: 0.62,
  },
  story: {
    mid: {
      light: { sunDir: [0.46, 0.86, 0.4], sunColor: '#ffe4c4', sunIntensity: 1.32, shadeTint: '#5a3f7a', sky: '#c79ad0', skyIntensity: 0.25, ground: '#d88a60', groundIntensity: 0.17, rim: '#ffb070', rimIntensity: 0.72, rimDir: [-0.6, 0.3, -0.72], fog: '#3a1a2c', fogRange: [66, 130], pool: [0, 0, 1, 15], poolFloor: 0.55 },
      grade: { exposure: 1, contrast: 1.05, saturation: 1.08, vignette: 0.34, bloom: 0.62, shadowTint: '#fff2f2', highlightTint: '#fff4e4', aoTint: '#2a0f22' },
    },
    late: {
      light: { sunDir: [0.25, 0.97, 0.3], sunColor: '#ffe6c4', sunIntensity: 1.28, shadeTint: '#463a7c', sky: '#6f78c8', skyIntensity: 0.2, ground: '#c07a5c', groundIntensity: 0.13, rim: '#a890ff', rimIntensity: 0.62, rimDir: [-0.7, 0.3, -0.62], fog: '#24122a', fogRange: [66, 130], pool: [0, 0, 1, 12.5], poolFloor: 0.45 },
      grade: { exposure: 0.99, contrast: 1.06, saturation: 1.05, vignette: 0.4, bloom: 0.72, shadowTint: '#f4f0ff', highlightTint: '#fff8ee', aoTint: '#200c24' },
    },
  },
  tiltShift: 0.4,
  grade: {
    exposure: 1.02,
    contrast: 1.04,
    saturation: 1.06,
    vignette: 0.32,
    bloom: 0.55,
    shadowTint: '#fbf8ff',
    highlightTint: '#fffcf4',
    aoTint: '#2a0f22',
  },
  camera: {
    position: new THREE.Vector3(-1.5, 13.5, 58),
    target: new THREE.Vector3(-1.5, 2.2, -3),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 1.3, 0), distance: 0.46, lift: 6.5 },
  focusPoint: new THREE.Vector3(0, 0.6, 2),
  focusRange: 15,
  aoRadius: 1.1,
  // Afternoon sun through the window over the sink.
  shafts: { at: new THREE.Vector3(10, 7.2, -16.9), strength: 0.35, length: 0.7, threshold: 0.9 },
  shadow: { center: new THREE.Vector3(-1, 1, -3), radius: 30 },
  pile: vesselPile({
    k: 1.8,
    floorY: BOWL.floorY,
    rimY: BOWL.rimY,
    innerR: BOWL.innerR,
    outerR: BOWL.outerR,
    groundY: GROUND + 0.02,
    table: { y: 0.02, radius: 5.2 },
    size: 36,
    peak: 7,
    endSlope: 0.5,
    coreDensityRadius: 5.5,
    outerDensityRadius: 12,
    flakeScale: 0.46,
  }),
  debris: ['#3d7fd6', '#ffeccb', '#20203c'],
  homeRadius: BOWL.innerR * 0.72,
  steamY: BOWL.rimY,
  spreadRadius: 24,
  nest: { position: new THREE.Vector3(-41.2, -2.4, -4.9), scale: 0.16, rise: 0.62 },
  slots: {
    pan: [
      onCounter(3.9, -14.6, 0.4),
      onCounter(6.2, -14.8, 1.6),
      onCounter(26.5, -14.5, 2.9),
      onCounter(29.5, -14.8, 4.2),
      onCounter(32.5, -14.5, 5.5),
      { x: 21, y: 9.65, z: -15.8, rotation: 2.2, scale: 1.1 },
      { x: 24.6, y: 9.65, z: -15.8, rotation: 4.1, scale: 1.1 },
    ],
    microwave: [
      { x: 15.2, y: COUNTER_TOP + 0.03, z: -15, rotation: -0.1, scale: 1.75 },
      { x: 19.4, y: COUNTER_TOP + 0.03, z: -15, rotation: 0.05, scale: 1.75 },
      { x: 23.6, y: COUNTER_TOP + 0.03, z: -15, rotation: -0.05, scale: 1.75 },
    ],
    cart: [
      onFloor(-12.5, -2, 0.55, 2.4),
      onFloor(11.4, -6.5, -0.4, 2.4),
      onFloor(-7, -10.5, 0.2, 2.2),
      onFloor(4, -11, -0.1, 2.2),
      onFloor(-17, 3.6, 0.95, 2.5),
      onFloor(17, -1.2, -0.95, 2.5),
    ],
    cannon: [
      onFloor(-16, -8.5, 0.5, 2.3),
      onFloor(19, -8, 2.7, 2.3),
      onFloor(-23, -3, 0.1, 2.5),
      onFloor(24, 2.5, 3.1, 2.5),
    ],
    toaster: [
      { x: 9.1, y: COUNTER_TOP + 0.03, z: -14.7, rotation: 0.1, scale: 1.45 },
      { x: 11.7, y: COUNTER_TOP + 0.03, z: -14.8, rotation: -0.1, scale: 1.45 },
    ],
    // Out to the sides: straight behind the table, the close-up of a new one would be blocked.
    mixer: [onFloor(-11.2, -12.2, 0.3, 2.3), onFloor(13.8, -11.8, -0.3, 2.3)],
  },
  cannon: { position: new THREE.Vector3(12, GROUND, 2.5), rotation: Math.PI - 0.1, scale: 2.5 },
  perches: [
    new THREE.Vector3(-23.2, GROUND + 13.5, -13.2),
    new THREE.Vector3(-21.6, GROUND + 13.5, -13.6),
    new THREE.Vector3(-20, GROUND + 13.5, -13.2),
    new THREE.Vector3(-18.6, GROUND + 13.5, -13.7),
    new THREE.Vector3(7.2, WINDOW.y - WINDOW.h / 2 + 0.55, -16.55),
    new THREE.Vector3(9, WINDOW.y - WINDOW.h / 2 + 0.55, -16.55),
    new THREE.Vector3(11, WINDOW.y - WINDOW.h / 2 + 0.55, -16.55),
    new THREE.Vector3(13, WINDOW.y - WINDOW.h / 2 + 0.55, -16.55),
  ],
  build: buildKitchen,
};

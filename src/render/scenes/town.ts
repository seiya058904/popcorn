import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { Spring } from '../../motion/ease.ts';
import { ringPath } from './paths.ts';
import { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { PopcornSnow } from '../fx/snow.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, addToyInstances, at, Kit, P, Pattern } from '../geometry/kit.ts';
import { lightGroup, type Lamp } from '../core/globals.ts';
import { addSign } from '../materials/sign.ts';
import { blendSky, skyMaterial, skyUniforms, type SkyLook } from '../materials/sky.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';
import { M } from '../machines/common.ts';
import { addRichTree, carDetails, clockTowerDetails, dressHouse, dressPlaza, fountainStatue, wheelGondolas, windowFrameAt, type HouseFrame } from './dress.ts';
import { Cues, gag, type EggSpot } from './eggs.ts';
import { figureGeometry, SetPieces } from './pieces.ts';
import { alongStory, LightBank } from './story.ts';
import { vesselPile } from './vessel.ts';

const FOUNTAIN = { floorY: 0.5, rimY: 2.1, innerR: 5, outerR: 5.8 };
const splashColor = new THREE.Color('#bfe6ff');
const BOARD_R = 104;
const RING_ROAD = 27;
const STROLLERS = 18;

const C = {
  grass: '#7fcf8e',
  grassDeep: '#5fb87a',
  road: '#4d5670',
  line: '#ffe9b8',
  plaza: '#f3dcb4',
  stone: '#e8dcc8',
  stoneDeep: '#b7a892',
  water: '#58b7e8',
  red: '#d8313a',
  gold: '#f0b73a',
  cream: '#ffeccb',
  navy: '#26325e',
  trunk: '#8a5a34',
};

const WALLS = ['#ffd9a8', '#ffb9a8', '#a8dcff', '#ffe58f', '#c9b6ff', '#a9ecc9', '#ffc7dc', '#f7f0df'];
const ROOFS = ['#d8473f', '#3f7fd8', '#e08a2e', '#7a5bd0', '#2f9e87'];

/** Town light groups, in the order they come on through the evening; windows take four in a row. */
const LIT = { lamps: 0, windows: 1, shops: 5, fair: 6, fountain: 7 } as const;
const LAMP_POSTS = 10;
/** Where dressPlaza stands the lamp posts. */
const postAngle = (i: number): number => (i / LAMP_POSTS) * Math.PI * 2 + 0.31;
const POST_R = 16;

/** The sky over the town: a clear afternoon, a sunset, a starry night. */
const SKY: [SkyLook, SkyLook, SkyLook] = [
  { top: '#4f9fe8', horizon: '#b8dcff', glow: '#ffe4c0', glowStrength: 0.25, stars: 0, clouds: 0.3, cloud: '#ffffff', brightness: 2.4 },
  { top: '#3c3c9c', horizon: '#ff9a62', glow: '#ff6a30', glowStrength: 1, stars: 0.15, clouds: 0.3, cloud: '#ffa080', brightness: 2.2 },
  { top: '#070b26', horizon: '#1c2660', glow: '#3040a0', glowStrength: 0.3, stars: 1, clouds: 0.05, cloud: '#2a3060', brightness: 1.6 },
];

/** A phone box, a post box, a hydrant and a bus stop round the back of the square. */
function addStreetProps(kit: Kit): void {
  const facing = (a: number, r: number, build: (place: (x: number, y: number, z: number, extra?: [number, number, number]) => THREE.Matrix4) => void): void => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const turn = Math.atan2(-x, -z);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    build((lx, ly, lz, extra = [0, 0, 0]) => at(x + lx * c + lz * s, ly, z - lx * s + lz * c, [extra[0], turn + extra[1], extra[2]]));
  };
  const red = { color: '#d8313a', gloss: 0.8, coat: 0.4, pattern: Pattern.Enamel };
  facing(4.25, 18.4, (place) => {
    kit.add(P.box(1.5, 3.6, 1.5, 0.12, 2), { ...red, matrix: place(0, 1.9, 0) });
    kit.add(P.box(1.7, 0.3, 1.7, 0.12, 2), { ...red, matrix: place(0, 3.85, 0) });
    kit.add(P.sphere(0.5, 14, 8), { ...red, matrix: place(0, 3.95, 0, [0, 0, 0]) });
    kit.add(P.box(1.1, 2.3, 0.06, 0.03, 1), { color: '#ffe9a6', emissive: 0.5, outline: 0, light: lightGroup(3, LIT.shops), matrix: place(0, 2.1, 0.76) });
    for (let i = 0; i < 3; i += 1) kit.add(P.box(1.15, 0.06, 0.08, 0.02, 1), { ...red, outline: 0, matrix: place(0, 1.3 + i * 0.75, 0.78) });
    kit.add(P.box(1.0, 0.24, 0.08, 0.03, 1), { color: '#fff3cf', emissive: 0.6, outline: 0, light: lightGroup(3, LIT.shops), lightKeepsPaint: true, matrix: place(0, 3.5, 0.78) });
  });
  facing(4.75, 18.4, (place) => {
    kit.add(P.puck(0.12, 0.12, 1.2, 8, 0.03), { color: '#2b3d6b', gloss: 0.6, matrix: place(0, 0, 0) });
    kit.add(P.box(0.9, 0.95, 0.7, 0.3, 3), { color: '#3f7fd8', gloss: 0.8, coat: 0.4, pattern: Pattern.Enamel, matrix: place(0, 1.6, 0) });
    kit.add(P.box(0.5, 0.06, 0.06, 0.02, 1), { color: '#1d1a22', outline: 0, matrix: place(0, 1.8, 0.36) });
  });
  facing(5.15, 18.2, (place) => {
    kit.add(P.puck(0.32, 0.3, 0.9, 14, 0.06), { ...red, matrix: place(0, 0, 0) });
    kit.add(P.sphere(0.32, 12, 8), { ...red, matrix: place(0, 0.92, 0, [0, 0, 0]) });
    for (const side of [-1, 1]) kit.add(P.puck(0.12, 0.12, 0.2, 10, 0.03), { color: '#e4b252', gloss: 0.85, metal: 1, matrix: place(side * 0.34, 0.6, 0, [0, 0, side * Math.PI / 2]) });
  });
  facing(5.55, 19, (place) => {
    for (const side of [-1, 1]) kit.add(P.puck(0.1, 0.1, 3.2, 8, 0.02), { color: '#5a6478', gloss: 0.6, metal: 0.6, matrix: place(side * 1.8, 0, -0.5) });
    kit.add(P.box(4.4, 0.16, 1.8, 0.06, 1), { color: '#2f9e87', gloss: 0.7, coat: 0.4, matrix: place(0, 3.25, 0) });
    kit.add(P.box(3.4, 0.14, 0.7, 0.04, 1), { color: '#ad6f3e', gloss: 0.35, pattern: Pattern.Wood, matrix: place(0, 1, -0.4) });
    kit.add(P.box(3.6, 1.8, 0.06, 0.03, 1), { color: '#ffe9a6', emissive: 0.35, outline: 0, light: lightGroup(3, LIT.shops), matrix: place(0, 2.2, -0.82) });
    kit.add(P.puck(0.06, 0.06, 3.8, 8, 0.02), { color: '#5a6478', gloss: 0.6, metal: 0.6, matrix: place(2.6, 0, 0.4) });
    kit.add(P.puck(0.5, 0.5, 0.1, 20, 0.03), { color: '#3f7fd8', gloss: 0.6, matrix: place(2.6, 3.8, 0.4, [Math.PI / 2, 0, 0]) });
  });
}

function buntingString(length: number, sag: number, seed: number): THREE.BufferGeometry {
  // A string of pennants along local X, its ends at ±length/2, sagging in the middle.
  const kit = new Kit();
  const at01 = (t: number): THREE.Vector3 => new THREE.Vector3((t - 0.5) * length, -sag * (1 - (2 * t - 1) ** 2), 0);
  kit.add(P.tube([at01(0), at01(0.25), at01(0.5), at01(0.75), at01(1)], 0.035, 16, 4), { color: '#f7f0df', gloss: 0.3, outline: 0, fixedColor: true });
  const pennant = new THREE.Shape([new THREE.Vector2(-0.38, 0), new THREE.Vector2(0.38, 0), new THREE.Vector2(0, -0.85)]);
  const flagColors = ['#d8473f', '#ffc53f', '#3f7fd8', '#58c79c', '#ff8fb0', '#fff0d4'];
  const flags = 9;
  for (let i = 0; i < flags; i += 1) {
    const t = (i + 0.5) / flags;
    const p = at01(t);
    const flag = new THREE.ExtrudeGeometry(pennant, { depth: 0.04, bevelEnabled: false });
    kit.add(flag, { color: flagColors[(i + seed) % flagColors.length]!, gloss: 0.2, pattern: Pattern.Fabric + 0.3, outline: 0.4, fixedColor: true, matrix: at(p.x, p.y + 0.02, -0.02, [0, 0, (t - 0.5) * 0.25]) });
  }
  return kit.build();
}

function basketsGeometry(): THREE.BufferGeometry {
  // A hanging basket of flowers on every lamp post.
  const kit = new Kit();
  const flowers = ['#ff6f8e', '#ffd257', '#fff0d4', '#c98bff', '#ff9a52'];
  for (let i = 0; i < LAMP_POSTS; i += 1) {
    const a = postAngle(i);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const x = out.x * (POST_R + 0.75);
    const z = out.z * (POST_R + 0.75);
    kit.add(P.tube([new THREE.Vector3(out.x * POST_R, 3.75, out.z * POST_R), new THREE.Vector3(x, 3.75, z)], 0.05, 1, 5), { color: '#24232b', gloss: 0.4, metal: 0.7, fixedColor: true });
    kit.add(P.lathe([[0, -0.5], [0.42, -0.42], [0.58, -0.1], [0.6, 0], [0, 0]], 16, 0.06, 2), { color: '#a8743e', gloss: 0.2, pattern: Pattern.Fabric + 0.6, fixedColor: true, matrix: at(x, 3.3, z) });
    for (let n = 0; n < 9; n += 1) {
      const b = n * 2.4 + i;
      const r = n === 0 ? 0 : 0.38;
      kit.add(P.sphere(0.17, 8, 6), { color: flowers[(n + i) % flowers.length]!, gloss: 0.25, outline: 0.3, fixedColor: true, matrix: at(x + Math.cos(b) * r, 3.42 + (n % 2) * 0.08, z + Math.sin(b) * r) });
    }
    for (let n = 0; n < 5; n += 1) {
      const b = n * 1.26 + i;
      kit.add(P.capsule(0.07, 0.5 + (n % 3) * 0.2, 2, 5), { color: '#3fa56d', gloss: 0.3, outline: 0.3, fixedColor: true, matrix: at(x + Math.cos(b) * 0.55, 2.95 - (n % 3) * 0.1, z + Math.sin(b) * 0.55, [Math.sin(b) * 0.3, 0, Math.cos(b) * 0.3]) });
    }
  }
  return kit.build();
}

function fountainShowGeometry(): THREE.BufferGeometry {
  // Colored bulbs round the rim and little floodlights at the foot of the basin.
  const kit = new Kit();
  const colors = ['#ff5f8a', '#ffd23f', '#5fe08a', '#4fb4ff', '#b07aff'];
  const { outerR, rimY } = FOUNTAIN;
  for (let i = 0; i < 30; i += 1) {
    const a = (i / 30) * Math.PI * 2;
    kit.add(P.sphere(0.2, 8, 6), { color: colors[i % colors.length]!, emissive: 1, outline: 0, fixedColor: true, light: lightGroup(3, LIT.fountain), matrix: at(Math.cos(a) * (outerR + 0.1), rimY + 0.42, Math.sin(a) * (outerR + 0.1)) });
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * (outerR + 1.2);
    const z = Math.sin(a) * (outerR + 1.2);
    kit.add(P.puck(0.4, 0.34, 0.3, 14, 0.05), { color: '#5a6478', gloss: 0.7, metal: 0.8, fixedColor: true, matrix: at(x, 0.1, z) });
    kit.add(P.lathe([[0, 0], [0.3, 0], [0.34, 0.5], [0, 0.52]], 14, 0.04, 2), { color: '#3a4050', gloss: 0.6, metal: 0.8, fixedColor: true, matrix: at(x, 0.35, z, [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]) });
    kit.add(P.sphere(0.26, 10, 6), { color: colors[i % colors.length]!, emissive: 1, outline: 0, fixedColor: true, light: lightGroup(3, LIT.fountain), matrix: at(x - Math.cos(a) * 0.2, 0.85, z - Math.sin(a) * 0.2, [0, 0, 0], [1, 0.4, 1]) });
  }
  return kit.build();
}

/** Roof shapes, gables twice as likely: the town reads as a town by its roofline. */
const ROOF_KINDS = ['hip', 'gable', 'gable', 'flat', 'mansard'] as const;

function addRoof(kit: Kit, look: Rng, house: HouseFrame, wall: string, roof: string): void {
  const { w, d, h, place } = house;
  const tiles = { color: roof, gloss: 0.3, pattern: 4.72 };
  const trim = { color: new THREE.Color(roof).multiplyScalar(0.78).getStyle(), gloss: 0.35, outline: 0.4, fixedColor: true };
  const kind = ROOF_KINDS[look.int(0, ROOF_KINDS.length)]!;
  if (kind === 'hip') {
    // Hipped, its eaves standing well clear of the walls.
    kit.add(P.lathe([[0, 0], [1, 0], [0, 1]], 4, 0.01, 1), { ...tiles, matrix: place(0, h, 0, [0, Math.PI / 4, 0], [w * 0.8, 3.2, d * 0.8]) });
  } else if (kind === 'gable') {
    // Ridge along the street, gable ends in the wall color, a capped ridge.
    const rise = Math.min(4.2, d * 0.6);
    kit.add(P.prism(w - 0.02, rise - 0.12, d - 0.02), { color: wall, gloss: 0.18, pattern: Pattern.Plaster, outline: 0.5, matrix: place(0, h - 0.02, 0) });
    kit.add(P.prism(w + 0.7, rise, d + 1), { ...tiles, matrix: place(0, h - 0.12, 0) });
    kit.add(P.slab(w + 0.8, 0.22, 0.36), { ...trim, matrix: place(0, h + rise - 0.2, 0) });
  } else if (kind === 'flat') {
    // A flat roof behind a parapet, with a water tank or a stair hut on top.
    const coping = { color: new THREE.Color(wall).multiplyScalar(0.92).getStyle(), gloss: 0.25, outline: 0.4, fixedColor: true };
    kit.add(P.slab(w, 0.12, d), { ...M.concrete, outline: 0, matrix: place(0, h + 0.06, 0) });
    for (const side of [-1, 1]) {
      kit.add(P.slab(w + 0.3, 0.7, 0.3), { ...coping, matrix: place(0, h + 0.35, side * (d / 2)) });
      kit.add(P.slab(0.3, 0.7, d), { ...coping, matrix: place(side * (w / 2), h + 0.35, 0) });
    }
    if (look.next() < 0.5) {
      kit.add(P.puck(0.85, 0.85, 1.5, 12, 0.08), { ...M.darkWood, outline: 0.5, matrix: place(w * 0.18, h + 1.1, -d * 0.12) });
      kit.add(P.lathe([[0, 0], [0.95, 0], [0, 0.5]], 12, 0.02, 1), { ...trim, matrix: place(w * 0.18, h + 2.6, -d * 0.12) });
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
        kit.add(P.slab(0.12, 1, 0.12), { ...M.darkWood, outline: 0, detail: 1, matrix: place(w * 0.18 + lx, h + 0.6, -d * 0.12 + lz) });
      }
    } else {
      kit.add(P.box(1.8, 1.7, 1.8, 0.06, 1), { color: wall, gloss: 0.18, pattern: Pattern.Plaster, outline: 0.5, matrix: place(-w * 0.2, h + 0.95, -d * 0.15) });
      kit.add(P.slab(2.1, 0.16, 2.1), { ...trim, matrix: place(-w * 0.2, h + 1.86, -d * 0.15) });
    }
  } else {
    // Mansard: a steep slate skirt up to a shallow top, with a band where they meet.
    kit.add(P.lathe([[0, 0], [1, 0], [0.74, 0.68], [0, 0.86]], 4, 0.01, 1), { ...tiles, matrix: place(0, h, 0, [0, Math.PI / 4, 0], [w * 0.78, 4, d * 0.78]) });
    kit.add(P.lathe([[0, 0], [1, 0], [1, 1], [0, 1]], 4, 0.01, 1), { ...trim, matrix: place(0, h + 2.66, 0, [0, Math.PI / 4, 0], [w * 0.58, 0.16, d * 0.58]) });
  }
}

function addHouse(kit: Kit, rng: Rng, look: Rng, x: number, z: number, rotation: number): void {
  const w = rng.range(5, 8.5);
  const d = rng.range(5, 7.5);
  const h = rng.range(4.5, 11);
  const wall = WALLS[rng.int(0, WALLS.length)]!;
  const roof = ROOFS[rng.int(0, ROOFS.length)]!;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const place = (lx: number, ly: number, lz: number, extra: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): THREE.Matrix4 =>
    at(x + lx * c + lz * s, ly, z - lx * s + lz * c, [extra[0], rotation + extra[1], extra[2]], scale);
  const house: HouseFrame = { x, z, w, d, h, rotation, place };
  kit.add(P.box(w, h, d, 0.12, 1), { color: wall, gloss: 0.18, pattern: Pattern.Plaster, matrix: place(0, h / 2, 0), ao: (p) => 0.62 + 0.38 * Math.min(1, p.y / 3) });
  addRoof(kit, look, house, wall, roof);
  // A quarter of the windows stay dark all night; the rest light up in four waves.
  const light = (): number => {
    const r = look.next();
    return r < 0.25 ? 0 : lightGroup(3, LIT.windows + Math.min(3, Math.floor(((r - 0.25) / 0.75) * 4)));
  };
  // The front has the door below; the back faces the square and the camera, so it has windows
  // on every floor, and the sides get one per floor where the house is deep enough.
  for (let y = 4; y + 1 < h; y += 2.9) {
    for (const lx of [-w * 0.24, w * 0.24]) windowFrameAt(kit, house, lx, y, light());
  }
  for (let y = 1.7; y + 1 < h; y += 2.9) {
    for (const lx of [-w * 0.24, w * 0.24]) windowFrameAt(kit, house, lx, y, light(), 'back');
    if (d > 5.6) {
      windowFrameAt(kit, house, 0, y, light(), 'right', 1);
      windowFrameAt(kit, house, 0, y, light(), 'left', 1);
    }
  }
  dressHouse(kit, look, house, wall, lightGroup(3, LIT.shops));
}

/**
 * Pauses every few houses and trees, so the town can be built in the background. The houses go
 * into a kit of their own: one huge mesh would take too long to hand to the GPU in a single frame.
 */
function* addTown(kit: Kit, houseKits: [Kit, Kit]): Generator<void, void, void> {
  kit.add(P.puck(BOARD_R + 2, BOARD_R, 6, 96, 0.8), { color: C.grassDeep, gloss: 0.2, matrix: at(0, -6, 0) });
  kit.add(P.puck(BOARD_R, BOARD_R - 0.2, 0.2, 96, 0.08), {
    color: C.grass,
    gloss: 0.08,
    pattern: Pattern.Fabric + 0.05,
    outline: 0,
    matrix: at(0, -0.16, 0),
    ao: (p) => 0.7 + 0.3 * Math.min(1, Math.hypot(p.x, p.z) / 14),
  });
  // Plaza, ring road and four avenues.
  kit.add(P.puck(17, 16.9, 0.08, 72, 0.02), { color: C.plaza, gloss: 0.25, outline: 0, matrix: at(0, 0.02, 0) });
  kit.add(P.torus(RING_ROAD, 3.2, 3, 96), { color: C.road, gloss: 0.18, pattern: Pattern.Rubber + 0.1, outline: 0, matrix: at(0, 0.02, 0, [Math.PI / 2, 0, 0], [1, 1, 0.03]) });
  for (let i = 0; i < 44; i += 1) {
    const a = (i / 44) * Math.PI * 2;
    kit.add(P.box(1.7, 0.04, 0.32, 0.01, 1), { color: C.line, outline: 0, matrix: at(Math.cos(a) * RING_ROAD, 0.12, Math.sin(a) * RING_ROAD, [0, -a + Math.PI / 2, 0]) });
  }
  for (let spoke = 0; spoke < 4; spoke += 1) {
    const a = spoke * (Math.PI / 2) + Math.PI / 4;
    const mid = (RING_ROAD + BOARD_R) / 2 + 2;
    kit.add(P.box(BOARD_R - RING_ROAD, 0.08, 5.6, 0.02, 1), { color: C.road, gloss: 0.18, pattern: Pattern.Rubber + 0.1, outline: 0, matrix: at(Math.cos(a) * mid, 0.03, Math.sin(a) * mid, [0, -a, 0]) });
  }

  const rng = new Rng(2024);
  // Details draw from their own sequence, so the layout of the town never shifts with them.
  const look = new Rng(99);
  yield;
  dressPlaza(kit, look, RING_ROAD, lightGroup(3, LIT.lamps));
  yield;
  let houses = 0;
  let guard = 0;
  while (houses < 74 && guard < 900) {
    guard += 1;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(RING_ROAD + 9, BOARD_R - 8);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Keep the avenues, the cinema plot and the view of the plaza clear.
    const offSpoke = Math.abs(((a - Math.PI / 4 + Math.PI * 4) % (Math.PI / 2)) - Math.PI / 4);
    if (offSpoke > Math.PI / 4 - 6 / r) continue;
    if (x > -48 && x < -4 && z > -46 && z < -4) continue;
    if (z > 42 && Math.abs(x) < 46) continue;
    addHouse(houseKits[houses % 2]!, rng, look, x, z, -a + Math.PI / 2);
    houses += 1;
    if (houses % 2 === 0) yield;
  }
  for (let i = 0; i < 46; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(19, BOARD_R - 5);
    if (r > RING_ROAD - 5 && r < RING_ROAD + 5) continue;
    addRichTree(houseKits[i % 2]!, look, Math.cos(a) * r, Math.sin(a) * r);
    if (i % 6 === 5) yield;
  }
}

function addCinemaFront(kit: Kit): void {
  // The old auditorium, roof off, seen as the town's picture palace.
  const x = -25;
  const z = -7.1;
  kit.add(P.box(25.6, 11.5, 0.8, 0.2, 2), { color: '#a62435', gloss: 0.3, pattern: Pattern.Plaster, matrix: at(x, 5.75, z) });
  kit.add(P.box(15, 3.2, 3, 0.3, 2), { color: C.gold, gloss: 0.75, metal: 0.9, wear: 0.3, matrix: at(x, 7, z + 1.5) });
  // Poster cases and brass doors under the canopy.
  for (const side of [-1, 1]) {
    kit.add(P.box(2.2, 3.2, 0.2, 0.05, 1), { color: C.gold, gloss: 0.75, metal: 0.9, matrix: at(x + side * 6, 2.5, z + 0.5) });
    kit.add(P.box(1.8, 2.8, 0.1, 0.03, 1), { color: side > 0 ? '#3f7fd8' : '#ff8fb0', gloss: 0.5, emissive: 0.35, outline: 0, light: lightGroup(3, LIT.shops), matrix: at(x + side * 6, 2.5, z + 0.62) });
  }
  for (let i = 0; i < 18; i += 1) kit.add(P.sphere(0.22, 6, 5), { color: '#fff1c4', emissive: 1, outline: 0, light: lightGroup(3, LIT.fair), matrix: at(x - 7.1 + i * 0.84, 8.85, z + 3.05) });
  kit.add(P.box(3.4, 4.6, 0.3, 0.1, 1), { color: C.navy, gloss: 0.6, outline: 0, matrix: at(x, 2.3, z + 0.5) });
}

function addClockTower(kit: Kit): void {
  const x = 20;
  const z = -40;
  kit.add(P.box(7, 30, 7, 0.2, 2), { color: C.stone, gloss: 0.14, pattern: 4.3, matrix: at(x, 15, z), ao: (p) => 0.6 + 0.4 * Math.min(1, p.y / 8) });
  kit.add(P.lathe([[0, 0], [1, 0], [0, 1]], 4, 0.01, 1), { color: C.red, gloss: 0.35, pattern: 4.72, matrix: at(x, 30, z, [0, Math.PI / 4, 0], [6.4, 7, 6.4]) });
  // The clock face glows once it gets dark.
  kit.add(P.puck(2.5, 2.4, 0.4, 32, 0.08), { color: C.cream, gloss: 0.5, emissive: 0.45, light: lightGroup(3, LIT.fair), lightKeepsPaint: true, matrix: at(x, 23, z + 3.5, [Math.PI / 2, 0, 0]) });
  clockTowerDetails(kit, x, z);
}

function fountainGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = FOUNTAIN;
  const kit = new Kit();
  kit.add(P.lathe([[0, 0.02], [o + 0.7, 0.02], [o + 0.6, 0.6], [o, 0.9], [o, r], [o + 0.15, r + 0.15], [o - 0.1, r + 0.35], [i + 0.1, r + 0.3], [i, r - 0.1], [i, f + 0.1], [i - 0.3, f], [0, f]], 96, 0.14), {
    color: C.stone,
    gloss: 0.2,
    pattern: Pattern.Plaster,
    ao: (p) => 0.62 + 0.38 * Math.min(1, p.y / 1.4),
  });
  kit.add(P.puck(i - 0.1, i - 0.1, 0.08, 72, 0.02), { color: C.water, gloss: 1, coat: 0.9, outline: 0, matrix: at(0, f + 0.02, 0) });
  fountainStatue(kit, f);
  return kit.build();
}

function wheelGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const R = 11;
  for (const z of [-1, 1]) {
    kit.add(P.torus(R, 0.28, 6, 56), { color: C.red, gloss: 0.7, matrix: at(0, 0, z) });
    for (let i = 0; i < 8; i += 1) kit.add(P.box(R * 2, 0.2, 0.2, 0.05, 1), { color: C.cream, gloss: 0.5, outline: 0.5, matrix: at(0, 0, z, [0, 0, (i / 8) * Math.PI]) });
  }
  kit.add(P.capsule(0.5, 2, 2, 8), { color: C.gold, gloss: 0.8, metal: 1, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  wheelGondolas(kit, R, lightGroup(3, LIT.fair));
  return kit.build();
}


function carGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(3.4, 0.9, 1.6, 0.34, 2), { color: '#ffffff', gloss: 0.88, coat: 0.6, pattern: Pattern.Enamel, matrix: at(0, 0.8, 0) });
  kit.add(P.box(1.8, 0.8, 1.4, 0.3, 2), { color: '#ffffff', gloss: 0.88, coat: 0.6, pattern: Pattern.Enamel, matrix: at(-0.1, 1.5, 0) });
  carDetails(kit);
  for (const x of [-1, 1]) for (const z of [-0.8, 0.8]) kit.add(P.capsule(0.34, 0.1, 2, 8), { color: '#22222c', gloss: 0.2, pattern: Pattern.Rubber, fixedColor: true, matrix: at(x, 0.36, z, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

function moonGeometry(radius: number): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(radius, 36, 24), {
    color: '#fff1c4',
    emissive: 0.8,
    outline: 0,
    colorFn: (p, _n, out) => {
      const x = p.x / radius;
      const y = p.y / radius;
      const crater = Math.max(0, 1 - Math.hypot(x - 0.25, y - 0.34) / 0.3) * 0.2 + Math.max(0, 1 - Math.hypot(x + 0.36, y + 0.14) / 0.21) * 0.2 + Math.max(0, 1 - Math.hypot(x - 0.2, y + 0.48) / 0.16) * 0.18;
      out.multiplyScalar(1 - crater);
    },
  });
  return kit.build();
}

const steam = new THREE.Color(0.92, 0.9, 0.88);
const showColor = new THREE.Color();

function* buildTown(stage: Stage, root: THREE.Group): SceneBuild {
  // The sky is painted live, so day can turn to night over the town.
  const skyLook = skyUniforms();
  skyLook.uRange.value.set(0, 0.515);
  skyLook.uGlowAt.value.set(-0.7, 0.02, 0, 0);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 18), skyMaterial(skyLook, true));
  root.add(sky);
  yield;
  const set = new Kit();
  const houses: [Kit, Kit] = [new Kit(), new Kit()];
  yield* addTown(set, houses);
  addClockTower(set);
  addStreetProps(set);
  yield;
  addToy(stage, root, set.build({ frozen: true }));
  yield;
  for (const kit of houses) {
    addToy(stage, root, kit.build({ frozen: true }));
    yield;
  }
  // The picture palace front stands in the camera's way on arrival, so it rises up afterward.
  const frontKit = new Kit();
  addCinemaFront(frontKit);
  const front = addToy(stage, root, frontKit.build());
  addSign(front, SIGN_TEXT.theatre, { background: '#fff3cf', color: '#a31d28', glow: 0.9 }, 13.2, 1.9, at(-25, 7, -4.02));
  yield;
  const fountain = addToy(stage, root, fountainGeometry());
  yield;

  const wheel = addToy(stage, root, wheelGeometry());
  yield;
  wheel.position.set(56, 14, -30);
  const standKit = new Kit();
  for (const side of [-1, 1]) {
    standKit.add(P.tube([new THREE.Vector3(side * 5, 0, 0), new THREE.Vector3(0, 14, 0)], 0.36, 4, 6), { color: C.cream, gloss: 0.4 });
  }
  const stand = addToy(stage, root, standKit.build());
  stand.position.set(56, 0, -30);
  yield;

  // Cars circling the ring road, unbothered until the very end.
  const cars = addToyInstances(stage, root, carGeometry(), 12);
  const carColors = ['#d8473f', '#ffc53f', '#3f7fd8', '#58c79c', '#ff8fb0', '#f7f0df'];
  const tint = new THREE.Color();
  carColors.concat(carColors).forEach((color, index) => cars.body.setColorAt(index, tint.set(color)));
  cars.ink.instanceColor = cars.body.instanceColor;
  yield;

  // Toy townsfolk out for a walk around the square, until it gets dark and the popcorn deep.
  const strollers = addToyInstances(stage, root, figureGeometry({ skin: '#f2c8a0', shirt: '#ffffff', pants: '#3a3a52', hair: '#4a3020' }), STROLLERS, true, false);
  const clothes = ['#d8473f', '#3f7fd8', '#ffc53f', '#58c79c', '#c98bff', '#ff8fb0', '#f7f0df', '#26325e'];
  for (let i = 0; i < STROLLERS; i += 1) strollers.body.setColorAt(i, tint.set(clothes[i % clothes.length]!));
  strollers.ink.instanceColor = strollers.body.instanceColor;

  const moon = new THREE.Mesh(moonGeometry(19), toyMaterials().body);
  const moonHome = new THREE.Vector3(-108, 112, -190);
  moon.position.copy(moonHome);
  root.add(moon);
  yield;

  // The bought decorations share one rig: bunting between the lamp posts, the fountain's lights.
  const pieces = new SetPieces(root);
  const bunting = pieces.group(root);
  const strings: THREE.Group[] = [];
  for (let i = 0; i < LAMP_POSTS; i += 1) {
    const a = postAngle(i);
    const b = postAngle(i + 1);
    const from = new THREE.Vector3(Math.cos(a) * POST_R, 4.95, Math.sin(a) * POST_R);
    const to = new THREE.Vector3(Math.cos(b) * POST_R, 4.95, Math.sin(b) * POST_R);
    const string = pieces.group(bunting, (from.x + to.x) / 2, 4.95, (from.z + to.z) / 2);
    string.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
    pieces.part(buntingString(from.distanceTo(to), 1.1, i), string, { shadow: false });
    strings.push(string);
  }
  pieces.part(basketsGeometry(), bunting);
  pieces.decoration('decor-bunting', bunting, 0.01);
  const show = pieces.group(root);
  pieces.part(fountainShowGeometry(), show, { shadow: false });
  pieces.decoration('decor-fountain', show, 3);
  pieces.build(stage);
  yield;

  const snow = new PopcornSnow(root, { count: 460, size: 0.95, height: 130, radius: 88, center: [0, 0, -12] });

  const bank = new LightBank(3, [
    { at: 0.38, style: 'bulb' },
    { at: 0.44, style: 'bulb' },
    { at: 0.53, style: 'bulb' },
    { at: 0.63, style: 'bulb' },
    { at: 0.75, style: 'bulb' },
    { at: 0.48, style: 'neon' },
    { at: 0.57, style: 'bulb' },
    { style: 'neon' },
  ]);
  const showLights = [new THREE.Color(), new THREE.Color()];
  const lamps: Lamp[] = [
    ...showLights.map((light, i): Lamp => ({ position: [i ? 3.5 : -3.5, 5.5, i ? -2 : 2], color: light, intensity: 0, radius: 20 })),
    // Every other post throws a pool of light; between them the pools overlap, at half the cost.
    ...Array.from({ length: LAMP_POSTS / 2 }, (_, i): Lamp => ({ position: [Math.cos(postAngle(i * 2)) * POST_R, 4.5, Math.sin(postAngle(i * 2)) * POST_R], color: '#ffcf8a', intensity: 0, radius: 13 })),
  ];

  const kick = new Spring(0, 420, 15);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let time = 0;
  let steamTimer = 0;
  let jetTimer = 0;
  let strain = 0;

  // Hidden things to find (src/content/props.ts): the clock tower and the fountain's golden kernel.
  // The pigeons are the third; they belong to the flock, which the scene runtime keeps.
  const cues = new Cues();
  const clockSpot = new THREE.Vector3(20, 23, -36.2);
  const belfry = new THREE.Vector3(20, 34, -40);
  const statueSpot = new THREE.Vector3(0, FOUNTAIN.floorY + 4.8, 0);
  const eggs: EggSpot[] = [
    {
      id: 'egg-clocktower',
      position: clockSpot,
      radius: 3,
      play(ctx) {
        // It strikes three, and every stroke is a burst of popcorn from the belfry.
        for (let stroke = 0; stroke < 3; stroke += 1) {
          cues.after(stroke * 0.5, () => {
            gag.sparkle(ctx, clockSpot, 2.2, 6);
            gag.burst(ctx, belfry, 6, { flight: 1.5, scale: 0.55 });
          });
        }
      },
    },
    {
      id: 'egg-fountain',
      position: statueSpot,
      radius: 1.3,
      play(ctx) {
        // A wish: in go a handful of kernels instead of coins, with a splash each.
        gag.sparkle(ctx, statueSpot, 1.2, 6);
        for (let i = 0; i < 5; i += 1) {
          cues.after(i * 0.12, () => {
            const r = ctx.rng;
            ctx.director.launch(r.range(-3, 3), 9, 18, { flight: 0.9, scale: 0.42, quiet: i > 0 });
            const a = r.range(0, 6.28);
            for (let d = 0; d < 4; d += 1) {
              ctx.sprites.spawn({ x: Math.cos(a) * 3, y: FOUNTAIN.floorY + 0.6, z: Math.sin(a) * 3, vx: r.range(-1, 1), vy: r.range(2.5, 4), vz: r.range(-1, 1), gravity: 9, sizeStart: 0.28, sizeEnd: 0.08, life: 0.6, color: splashColor, alpha: 0.8, kind: SpriteKind.Drop });
            }
          });
        }
      },
    },
  ];

  const tell = (u: number, dt: number, instant: boolean, calm: boolean): void => {
    bank.update(u, dt, instant, calm);
    alongStory(u, SKY, (from, to, t) => blendSky(skyLook, from, to, t));
    const street = bank.level(LIT.lamps);
    for (let i = 2; i < lamps.length; i += 1) lamps[i]!.intensity = 1.05 * street;
  };

  return {
    lamps,
    eggs,
    progress: tell,
    upgradesChanged(owned, animate) {
      pieces.sync(owned, animate);
      bank.want(LIT.fountain, pieces.owns('decor-fountain'));
    },
    kick(strength) {
      kick.kick(-0.16 - 0.14 * strength);
    },
    strain(u) {
      strain = u;
    },
    enter(u) {
      const rise = Math.min(1, Math.max(0, (u - 0.66) / 0.3));
      front.scale.y = Math.max(0.001, rise * rise * (3 - 2 * rise));
    },
    blast(ctx) {
      // The flash covers the moment the sky gives way to space.
      sky.visible = false;
      moon.visible = false;
      snow.setAmount(0);
      for (let i = 0; i < 48; i += 1) {
        const a = ctx.rng.range(0, 6.28);
        const r = ctx.rng.range(10, 60);
        ctx.director.launch(Math.cos(a) * r, 5, Math.sin(a) * r, { flight: ctx.rng.range(0.8, 1.5), scale: ctx.rng.range(0.42, 0.68), reach: 2, quiet: i > 8 });
      }
    },
    settleAsMiniature() {
      sky.visible = false;
      snow.setAmount(0);
      moon.visible = false;
      cars.commit(0);
      strollers.commit(0);
      // From space the town is a little lit-up night.
      tell(1, 0, true, true);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      cues.update(dt);
      const k = kick.update(dt);
      fountain.scale.set(1 - k * 0.012, 1 + k * 0.02 + strain * strain * 0.03 * Math.sin(time * 48), 1 - k * 0.012);
      wheel.rotation.z = time * 0.16;
      // Traffic slows as the popcorn deepens; at the end it has simply given up.
      const speed = 0.13 * Math.max(0, 1 - ctx.level * 1.15);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2 + (time * speed) * (i % 2 ? 1 : 1);
        const lane = RING_ROAD + (i % 2 ? 1.3 : -1.3);
        p.set(Math.cos(a) * lane, 0.08, Math.sin(a) * lane);
        q.setFromAxisAngle(up, -a - Math.PI / 2);
        m.compose(p, q, s.setScalar(1.25));
        cars.setMatrixAt(i, m);
      }
      cars.commit(12);
      for (let i = 0; i < STROLLERS; i += 1) {
        const dir = i % 3 === 0 ? -1 : 1;
        // They hurry off once the popcorn starts reaching the benches.
        const radius = 14 + (i % 4) * 0.55 + ctx.level * 6;
        const a = (i / STROLLERS) * Math.PI * 2 + dir * time * 0.05;
        p.set(Math.cos(a) * radius, 0.1 + Math.abs(Math.sin(time * 5 + i)) * 0.07, Math.sin(a) * radius);
        q.setFromAxisAngle(up, -a + (dir > 0 ? Math.PI : 0));
        m.compose(p, q, s.setScalar(1.9));
        strollers.setMatrixAt(i, m);
      }
      strollers.commit(ctx.level < 0.8 ? STROLLERS : 0);

      const tremble = (Math.sin(time * 0.8) > 0.55 ? 1 : 0.15) * (0.2 + ctx.level * 0.6);
      moon.position.copy(moonHome);
      moon.position.x += Math.sin(time * 47) * 0.55 * tremble;
      moon.position.y += Math.cos(time * 41) * 0.45 * tremble;
      if (sky.visible) snow.setAmount(Math.max(0, (ctx.level - 0.55) / 0.45) * 0.8);

      strings.forEach((string, i) => (string.rotation.x = Math.sin(time * 1.4 + i * 1.7) * 0.12));
      updateShow(dt, ctx);
      pieces.update(dt, ctx);

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.25;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        ctx.sprites.spawn({ x: Math.cos(a) * r.range(0.5, 3.8), y: FOUNTAIN.rimY + (ctx.level > 0.5 ? 6 : 0), z: Math.sin(a) * r.range(0.5, 3.8), vy: r.range(1.8, 3), drag: 0.25, sizeStart: 0.8, sizeEnd: r.range(2.6, 3.8), life: r.range(1.8, 2.6), color: steam, alpha: 0.05, kind: SpriteKind.Puff, spin: r.range(-0.4, 0.4) });
      }
    },
  };

  function updateShow(dt: number, ctx: SceneContext): void {
    // The light show: the fountain's own lamps run through the rainbow and jets of light leap
    // from the rim in time with them.
    const on = bank.level(LIT.fountain);
    showLights.forEach((light, i) => light.setHSL((time * 0.12 + i * 0.5) % 1, 0.9, 0.55));
    lamps[0]!.intensity = 1.1 * on;
    lamps[1]!.intensity = 1.1 * on;
    bank.dim(LIT.fountain, 0.7 + 0.3 * Math.sin(time * 6));
    if (on < 0.5) return;
    jetTimer -= dt;
    if (jetTimer > 0) return;
    jetTimer = 0.06;
    const r = ctx.rng;
    const a = r.range(0, 6.28);
    const rim = FOUNTAIN.outerR;
    showColor.setHSL((time * 0.12 + a / 6.28) % 1, 0.85, 0.6).multiplyScalar(2.2);
    ctx.sprites.spawn({ x: Math.cos(a) * rim, y: FOUNTAIN.rimY + 0.5, z: Math.sin(a) * rim, vx: -Math.cos(a) * 2.2, vy: r.range(7, 10), vz: -Math.sin(a) * 2.2, gravity: 9, sizeStart: 0.5, sizeEnd: 0.2, life: r.range(0.9, 1.3), color: showColor, alpha: 0.9, additive: 1, kind: SpriteKind.Drop });
  }
}

const slot = (x: number, z: number, rotation: number, scale: number): UnitSlot => ({ x, y: 0.05, z, rotation, scale });

export const townSpec: SceneSpec = {
  id: 3,
  light: {
    sunDir: [0.46, 0.84, 0.42],
    sunColor: '#fff3df',
    sunIntensity: 1.28,
    shadeTint: '#5a6cac',
    sky: '#a9d3ff',
    skyIntensity: 0.34,
    ground: '#a8d39a',
    groundIntensity: 0.18,
    rim: '#ffe7c4',
    rimIntensity: 0.4,
    rimDir: [-0.62, 0.3, -0.7],
    fog: '#bcd9f2',
    fogRange: [190, 420],
    pool: [0, 0, 0, 105],
    poolFloor: 0.74,
  },
  // Afternoon, a long golden sunset, then a moonlit night lit by the town's own lights.
  story: {
    mid: {
      light: { sunDir: [0.78, 0.42, 0.48], sunColor: '#ffc890', sunIntensity: 1.3, shadeTint: '#6a5aa0', sky: '#e0a8c8', skyIntensity: 0.28, ground: '#c89878', groundIntensity: 0.16, rim: '#ffb070', rimIntensity: 0.72, rimDir: [-0.62, 0.3, -0.7], fog: '#f0b8a8', fogRange: [190, 420], pool: [0, 0, 0, 105], poolFloor: 0.72 },
      grade: { exposure: 1, contrast: 1.05, saturation: 1.12, vignette: 0.3, bloom: 0.55, shadowTint: '#f4eaff', highlightTint: '#fff0e0', aoTint: '#2a1f48' },
    },
    late: {
      light: { sunDir: [0.35, 0.82, 0.45], sunColor: '#b8c8ff', sunIntensity: 0.95, shadeTint: '#38488c', sky: '#4a5aa0', skyIntensity: 0.22, ground: '#3a4a6a', groundIntensity: 0.1, rim: '#7d8fff', rimIntensity: 0.58, rimDir: [-0.62, 0.3, -0.7], fog: '#141a3a', fogRange: [190, 420], pool: [0, 0, 0, 92], poolFloor: 0.64 },
      grade: { exposure: 1.03, contrast: 1.06, saturation: 1.04, vignette: 0.36, bloom: 0.82, shadowTint: '#e8ecff', highlightTint: '#f6f6ff', aoTint: '#10183a' },
    },
  },
  tiltShift: 0.6,
  grade: {
    exposure: 1,
    contrast: 1.03,
    saturation: 1.08,
    vignette: 0.26,
    bloom: 0.42,
    shadowTint: '#f6faff',
    highlightTint: '#fffaf0',
    aoTint: '#1b2548',
  },
  camera: {
    position: new THREE.Vector3(-8, 72, 158),
    target: new THREE.Vector3(-8, 9, -6),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 2, 0), distance: 0.2, lift: 16 },
  focusPoint: new THREE.Vector3(0, 2, 2),
  focusRange: 60,
  aoRadius: 3,
  shadow: { center: new THREE.Vector3(-6, 5, 0), radius: 96 },
  pile: vesselPile({
    k: 4.5,
    floorY: FOUNTAIN.floorY,
    rimY: FOUNTAIN.rimY,
    innerR: FOUNTAIN.innerR,
    outerR: FOUNTAIN.outerR,
    groundY: 0.06,
    size: 150,
    peak: 19,
    endSlope: 0.34,
    coreDensityRadius: 18,
    outerDensityRadius: 54,
    flakeScale: 1.25,
  }),
  debris: ['#e8dcc8', '#b7a892', '#58b7e8'],
  homeRadius: FOUNTAIN.innerR * 0.72,
  steamY: FOUNTAIN.rimY,
  spreadRadius: 95,
  nest: {
    position: new THREE.Vector3(14.5, -5.55, 11.5),
    scale: 0.058,
    rise: 0.3,
    tilt: new THREE.Vector3(14.5, 28.45, 11.5),
  },
  slots: {
    cinema: [slot(-44, 6, 0.8, 4.2), slot(-7, -36, 0.1, 4.2), slot(34, 10, -1, 4.2), slot(37, -14, -1.9, 4.2)],
    truck: [slot(-34, 22, 0.9, 2.4), slot(29, 25, 2.4, 2.4), slot(-48, -14, 1.5, 2.4), slot(52, -4, 1.7, 2.4)],
    airship: [
      { x: -60, y: 30, z: -30, rotation: 0.2, scale: 3.6 },
      { x: 44, y: 33, z: -40, rotation: 2.9, scale: 3.6 },
      { x: -24, y: 30, z: -62, rotation: 0.1, scale: 3.4 },
      { x: 60, y: 24, z: 4, rotation: 2.6, scale: 3.4 },
    ],
    factory: [slot(-62, -30, 0.8, 5.2), slot(32, -62, -0.3, 5.2), slot(70, 2, -1.4, 5.2), slot(-70, 14, 1.3, 5.2), slot(60, 34, -2, 5), slot(-52, 44, 2.2, 5), slot(-12, -72, 0.1, 5.2), slot(76, -42, -1, 5)],
    organ: [slot(-10.5, -8, 0.4, 2.5), slot(10.5, -8, -0.4, 2.5)],
  },
  // A ring of track between the plaza and the ring road; each one bought is another car.
  paths: { train: ringPath(0, 0, 20.8, 0.06, { spacing: 6.6, speed: 3, scale: 2.1, capacity: 12 }) },
  cannon: { position: new THREE.Vector3(32, 0.05, 14), rotation: Math.PI - 0.45, scale: 5.5 },
  perches: [
    new THREE.Vector3(20, 37.6, -40),
    new THREE.Vector3(-34, 11.8, -7),
    new THREE.Vector3(-29, 11.8, -7),
    new THREE.Vector3(-24, 11.8, -7),
    new THREE.Vector3(-19, 11.8, -7),
    new THREE.Vector3(-15, 11.8, -7),
  ],
  build: buildTown,
};

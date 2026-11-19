import * as THREE from 'three';
import { Spring } from '../../motion/ease.ts';
import { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { PopcornSnow } from '../fx/snow.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, addToyInstances, at, Kit, P } from '../geometry/kit.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { SceneContext, SceneParts, SceneSpec, UnitSlot } from './types.ts';
import { vesselPile } from './vessel.ts';

const FOUNTAIN = { floorY: 0.5, rimY: 2.1, innerR: 5, outerR: 5.8 };
const BOARD_R = 104;
const RING_ROAD = 27;

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

function addSkyDome(kit: Kit): void {
  const horizon = new THREE.Color('#ffe2c0');
  const zenith = new THREE.Color('#4f9fe8');
  kit.add(P.sphere(330, 28, 16), {
    color: zenith,
    emissive: 1,
    outline: 0,
    gloss: 0,
    matrix: at(0, 0, 0, [0, 0, 0], -1),
    colorFn: (p, _n, out) => out.lerpColors(horizon, zenith, Math.min(1, Math.max(0, p.y / 170)) ** 0.62),
  });
}

function addHouse(kit: Kit, rng: Rng, x: number, z: number, rotation: number): void {
  const w = rng.range(5, 8.5);
  const d = rng.range(5, 7.5);
  const h = rng.range(4.5, 11);
  const wall = WALLS[rng.int(0, WALLS.length)]!;
  const roof = ROOFS[rng.int(0, ROOFS.length)]!;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const place = (lx: number, ly: number, lz: number, extra: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): THREE.Matrix4 =>
    at(x + lx * c + lz * s, ly, z - lx * s + lz * c, [extra[0], rotation + extra[1], extra[2]], scale);
  kit.add(P.box(w, h, d, 0.3, 1), { color: wall, gloss: 0.3, matrix: place(0, h / 2, 0), ao: (p) => 0.62 + 0.38 * Math.min(1, p.y / 3) });
  // Hipped roof: a four-sided cone stretched over the footprint.
  kit.add(P.lathe([[0, 0], [1, 0], [0, 1]], 4, 0.01, 1), { color: roof, gloss: 0.5, matrix: place(0, h, 0, [0, Math.PI / 4, 0], [w * 0.76, 3.2, d * 0.76]) });
  const rows = Math.floor(h / 3.2);
  for (let row = 0; row < rows; row += 1) {
    for (const lx of [-w * 0.24, w * 0.24]) {
      const lit = rng.next() < 0.45;
      kit.add(P.box(1.1, 1.4, 0.12, 0.08, 1), { color: lit ? '#ffe9a6' : C.navy, gloss: 0.8, emissive: lit ? 0.55 : 0, outline: 0, matrix: place(lx, 2 + row * 3, d / 2 + 0.03) });
    }
  }
}

function addTree(kit: Kit, rng: Rng, x: number, z: number): void {
  const h = rng.range(2.4, 3.8);
  kit.add(P.capsule(0.42, h, 2, 6), { color: C.trunk, gloss: 0.2, matrix: at(x, h / 2, z) });
  const leaf = rng.next() < 0.5 ? '#3fa56d' : '#58bd7c';
  kit.add(P.sphere(2.2, 10, 8), { color: leaf, gloss: 0.2, matrix: at(x, h + 1.6, z) });
  kit.add(P.sphere(1.5, 8, 6), { color: leaf, gloss: 0.2, matrix: at(x + 1.2, h + 0.8, z + 0.6) });
}

function addTown(kit: Kit): void {
  kit.add(P.puck(BOARD_R + 2, BOARD_R, 6, 96, 0.8), { color: C.grassDeep, gloss: 0.2, matrix: at(0, -6, 0) });
  kit.add(P.puck(BOARD_R, BOARD_R - 0.2, 0.2, 96, 0.08), {
    color: C.grass,
    gloss: 0.15,
    outline: 0,
    matrix: at(0, -0.16, 0),
    ao: (p) => 0.7 + 0.3 * Math.min(1, Math.hypot(p.x, p.z) / 14),
  });
  // Plaza, ring road and four avenues.
  kit.add(P.puck(17, 16.9, 0.08, 72, 0.02), { color: C.plaza, gloss: 0.25, outline: 0, matrix: at(0, 0.02, 0) });
  kit.add(P.torus(RING_ROAD, 3.2, 3, 96), { color: C.road, gloss: 0.2, outline: 0, matrix: at(0, 0.02, 0, [Math.PI / 2, 0, 0], [1, 1, 0.03]) });
  for (let i = 0; i < 44; i += 1) {
    const a = (i / 44) * Math.PI * 2;
    kit.add(P.box(1.7, 0.04, 0.32, 0.01, 1), { color: C.line, outline: 0, matrix: at(Math.cos(a) * RING_ROAD, 0.12, Math.sin(a) * RING_ROAD, [0, -a + Math.PI / 2, 0]) });
  }
  for (let spoke = 0; spoke < 4; spoke += 1) {
    const a = spoke * (Math.PI / 2) + Math.PI / 4;
    const mid = (RING_ROAD + BOARD_R) / 2 + 2;
    kit.add(P.box(BOARD_R - RING_ROAD, 0.08, 5.6, 0.02, 1), { color: C.road, gloss: 0.2, outline: 0, matrix: at(Math.cos(a) * mid, 0.03, Math.sin(a) * mid, [0, -a, 0]) });
  }

  const rng = new Rng(2024);
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
    addHouse(kit, rng, x, z, -a + Math.PI / 2);
    houses += 1;
  }
  for (let i = 0; i < 46; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(19, BOARD_R - 5);
    if (r > RING_ROAD - 5 && r < RING_ROAD + 5) continue;
    addTree(kit, rng, Math.cos(a) * r, Math.sin(a) * r);
  }
}

function addCinemaFront(kit: Kit): void {
  // The old auditorium, roof off, seen as the town's picture palace.
  const x = -25;
  const z = -7.1;
  kit.add(P.box(25.6, 11.5, 0.8, 0.2, 2), { color: '#a62435', gloss: 0.4, matrix: at(x, 5.75, z) });
  kit.add(P.box(15, 3.2, 3, 0.3, 2), { color: C.gold, gloss: 0.7, emissive: 0.12, matrix: at(x, 7, z + 1.5) });
  kit.add(P.box(13.2, 1.9, 0.2, 0.1, 1), { color: C.cream, gloss: 0.3, emissive: 0.5, outline: 0, matrix: at(x, 7, z + 3.05) });
  for (let i = 0; i < 18; i += 1) kit.add(P.sphere(0.22, 6, 5), { color: '#fff1c4', emissive: 1, outline: 0, matrix: at(x - 7.1 + i * 0.84, 8.85, z + 3.05) });
  kit.add(P.box(3.4, 4.6, 0.3, 0.1, 1), { color: C.navy, gloss: 0.6, outline: 0, matrix: at(x, 2.3, z + 0.5) });
}

function addClockTower(kit: Kit): void {
  const x = 20;
  const z = -40;
  kit.add(P.box(7, 30, 7, 0.4, 2), { color: C.stone, gloss: 0.2, matrix: at(x, 15, z), ao: (p) => 0.6 + 0.4 * Math.min(1, p.y / 8) });
  kit.add(P.lathe([[0, 0], [1, 0], [0, 1]], 4, 0.01, 1), { color: C.red, gloss: 0.5, matrix: at(x, 30, z, [0, Math.PI / 4, 0], [6.4, 7, 6.4]) });
  kit.add(P.puck(2.5, 2.4, 0.4, 32, 0.08), { color: C.cream, gloss: 0.5, matrix: at(x, 23, z + 3.5, [Math.PI / 2, 0, 0]) });
}

function fountainGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = FOUNTAIN;
  const kit = new Kit();
  kit.add(P.lathe([[0, 0.02], [o + 0.7, 0.02], [o + 0.6, 0.6], [o, 0.9], [o, r], [o + 0.15, r + 0.15], [o - 0.1, r + 0.35], [i + 0.1, r + 0.3], [i, r - 0.1], [i, f + 0.1], [i - 0.3, f], [0, f]], 96, 0.14), {
    color: C.stone,
    gloss: 0.3,
    ao: (p) => 0.62 + 0.38 * Math.min(1, p.y / 1.4),
  });
  kit.add(P.puck(i - 0.1, i - 0.1, 0.08, 72, 0.02), { color: C.water, gloss: 1, outline: 0, matrix: at(0, f + 0.02, 0) });
  return kit.build();
}

function wheelGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const R = 11;
  for (const z of [-1, 1]) {
    kit.add(P.torus(R, 0.28, 6, 56), { color: C.red, gloss: 0.7, matrix: at(0, 0, z) });
    for (let i = 0; i < 8; i += 1) kit.add(P.box(R * 2, 0.2, 0.2, 0.05, 1), { color: C.cream, gloss: 0.5, outline: 0.5, matrix: at(0, 0, z, [0, 0, (i / 8) * Math.PI]) });
  }
  kit.add(P.capsule(0.5, 2, 2, 8), { color: C.gold, gloss: 0.8, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

function carGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(3.4, 0.9, 1.6, 0.34, 2), { color: '#ffffff', gloss: 0.9, matrix: at(0, 0.8, 0) });
  kit.add(P.box(1.8, 0.8, 1.4, 0.3, 2), { color: '#ffffff', gloss: 0.9, matrix: at(-0.1, 1.5, 0) });
  kit.add(P.box(1.5, 0.5, 1.46, 0.12, 1), { color: C.navy, gloss: 1, outline: 0, matrix: at(-0.1, 1.55, 0) });
  for (const x of [-1, 1]) for (const z of [-0.8, 0.8]) kit.add(P.capsule(0.34, 0.1, 2, 8), { color: '#22222c', gloss: 0.3, matrix: at(x, 0.36, z, [Math.PI / 2, 0, 0]) });
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

function buildTown(stage: Stage, root: THREE.Group): SceneParts {
  const skyKit = new Kit();
  addSkyDome(skyKit);
  const sky = addToy(stage, root, skyKit.build(), { shadow: false, outline: false });
  const set = new Kit();
  addTown(set);
  addClockTower(set);
  addToy(stage, root, set.build());
  // The picture palace front stands in the camera's way on arrival, so it rises up afterward.
  const frontKit = new Kit();
  addCinemaFront(frontKit);
  const front = addToy(stage, root, frontKit.build());
  const fountain = addToy(stage, root, fountainGeometry());

  const wheel = addToy(stage, root, wheelGeometry());
  wheel.position.set(56, 14, -30);
  const standKit = new Kit();
  for (const side of [-1, 1]) {
    standKit.add(P.tube([new THREE.Vector3(side * 5, 0, 0), new THREE.Vector3(0, 14, 0)], 0.36, 4, 6), { color: C.cream, gloss: 0.4 });
  }
  const stand = addToy(stage, root, standKit.build());
  stand.position.set(56, 0, -30);

  // Cars circling the ring road, unbothered until the very end.
  const cars = addToyInstances(stage, root, carGeometry(), 12);
  const carColors = ['#d8473f', '#ffc53f', '#3f7fd8', '#58c79c', '#ff8fb0', '#f7f0df'];
  const tint = new THREE.Color();
  carColors.concat(carColors).forEach((color, index) => cars.body.setColorAt(index, tint.set(color)));
  cars.ink.instanceColor = cars.body.instanceColor;

  const moon = new THREE.Mesh(moonGeometry(19), toyMaterials().body);
  const moonHome = new THREE.Vector3(-108, 112, -190);
  moon.position.copy(moonHome);
  root.add(moon);

  const snow = new PopcornSnow(root, { count: 460, size: 0.95, height: 130, radius: 88, center: [0, 0, -12] });

  const kick = new Spring(0, 420, 15);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let time = 0;
  let steamTimer = 0;
  let strain = 0;

  return {
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
    },
    update(dt, ctx: SceneContext) {
      time += dt;
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

      const tremble = (Math.sin(time * 0.8) > 0.55 ? 1 : 0.15) * (0.2 + ctx.level * 0.6);
      moon.position.copy(moonHome);
      moon.position.x += Math.sin(time * 47) * 0.55 * tremble;
      moon.position.y += Math.cos(time * 41) * 0.45 * tremble;
      if (sky.visible) snow.setAmount(Math.max(0, (ctx.level - 0.55) / 0.45) * 0.8);

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.25;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        ctx.sprites.spawn({ x: Math.cos(a) * r.range(0.5, 3.8), y: FOUNTAIN.rimY + (ctx.level > 0.5 ? 6 : 0), z: Math.sin(a) * r.range(0.5, 3.8), vy: r.range(1.8, 3), drag: 0.25, sizeStart: 0.8, sizeEnd: r.range(2.6, 3.8), life: r.range(1.8, 2.6), color: steam, alpha: 0.05, kind: SpriteKind.Puff, spin: r.range(-0.4, 0.4) });
      }
    },
  };
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
  },
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

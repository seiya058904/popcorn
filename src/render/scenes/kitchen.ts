import * as THREE from 'three';
import { Spring } from '../../motion/ease.ts';
import type { Stage } from '../core/stage.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addLightBeam } from '../fx/beam.ts';
import { addToy, at, Kit, P, Pattern } from '../geometry/kit.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';
import { dressKitchen, fridgeBadge } from './dress.ts';
import { vesselPile } from './vessel.ts';

const GROUND = -5.6;
const BOWL = { floorY: 1.15, rimY: 2.3, innerR: 2.0, outerR: 2.25 };
const COUNTER_TOP = -1.5;

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
  return kit.build();
}

const WINDOW = { x: 10, y: 6.6, w: 9, h: 6.6 };

function addWindow(kit: Kit): void {
  const { x, y, w, h } = WINDOW;
  const dusk = new THREE.Color(C.dusk);
  const night = new THREE.Color(C.night);
  kit.add(P.box(w, h, 0.14, 0.05, 1), {
    color: C.night,
    gloss: 0,
    emissive: 0.55,
    outline: 0,
    matrix: at(x, y, -17.15),
    colorFn: (p, _n, out) => out.lerpColors(dusk, night, Math.pow(smooth(y - h / 2, y + h / 2 - 0.5, p.y), 0.6)),
  });
  const frame = { color: C.trim, gloss: 0.45 };
  kit.add(P.box(w + 0.8, 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x, y + h / 2 + 0.1, -17) });
  kit.add(P.box(w + 1.4, 0.45, 1.1, 0.12, 2), { ...frame, matrix: at(x, y - h / 2 - 0.1, -16.8) });
  kit.add(P.box(0.4, h + 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x - w / 2 - 0.1, y, -17) });
  kit.add(P.box(0.4, h + 0.4, 0.5, 0.12, 2), { ...frame, matrix: at(x + w / 2 + 0.1, y, -17) });
  kit.add(P.box(0.18, h, 0.26, 0.05, 1), { ...frame, matrix: at(x, y, -17.05) });
  kit.add(P.box(w, 0.18, 0.26, 0.05, 1), { ...frame, matrix: at(x, y + 0.3, -17.05) });
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4;
    kit.add(P.sphere(0.05 + (i % 3) * 0.018, 6, 5), {
      color: C.moon,
      emissive: 1,
      outline: 0,
      matrix: at(x + Math.cos(a) * (1 + i * 0.42), y + 1.8 + Math.sin(a * 1.7) * 1.2, -17.05),
    });
  }
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
  kit.add(P.sphere(0.72, 18, 12), { color: '#fff3c8', emissive: 1, outline: 0, matrix: at(0, -7.95, 0, [0, 0, 0], [1, 0.62, 1]) });
  return kit.build();
}

const steam = new THREE.Color(0.92, 0.9, 0.88);

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
  yield;
  dressKitchen(set, GROUND, COUNTER_TOP);
  yield;
  addToy(stage, root, set.build({ frozen: true }));
  yield;
  // The pool under the pendant lamp, and moonlight falling from the window.
  addLightBeam(root, new THREE.Vector3(0, 10.2, 0), new THREE.Vector3(0, GROUND, 0), 1.9, 10, '#ffd9a4', 0.07);
  addLightBeam(root, new THREE.Vector3(10, 7.2, -16.9), new THREE.Vector3(1, GROUND, -3), 3.2, 6.5, '#c79bff', 0.05);
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

  const moonKit = new Kit();
  moonKit.add(P.sphere(1.25, 40, 28), {
    color: C.moon,
    emissive: 0.9,
    outline: 0,
    colorFn: (p, _n, out) => {
      const crater =
        Math.max(0, 1 - Math.hypot(p.x - 0.3, p.y - 0.42) / 0.36) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x + 0.45, p.y + 0.16) / 0.26) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x - 0.24, p.y + 0.58) / 0.2) * 0.18;
      out.multiplyScalar(1 - crater);
    },
  });
  const moon = new THREE.Mesh(moonKit.build(), toyMaterials().body);
  const moonHome = new THREE.Vector3(WINDOW.x - 2.4, WINDOW.y + 1.6, -17.04);
  moon.position.copy(moonHome);
  moon.scale.z = 0.08;
  root.add(moon);
  yield;

  // The mouse darts out to steal one flake, then thinks better of it.
  const mouseKit = new Kit();
  mouseKit.add(P.sphere(0.42, 12, 9), { color: '#8d8592', gloss: 0.3, matrix: at(0, 0.34, 0, [0, 0, 0], [0.86, 0.8, 1.15]) });
  mouseKit.add(P.sphere(0.17, 8, 6), { color: '#a79fae', gloss: 0.3, matrix: at(-0.28, 0.66, 0.06) });
  mouseKit.add(P.sphere(0.17, 8, 6), { color: '#a79fae', gloss: 0.3, matrix: at(0.28, 0.66, 0.06) });
  mouseKit.add(P.sphere(0.05, 6, 5), { color: '#f07a8a', outline: 0, matrix: at(0, 0.3, 0.47) });
  const mouse = addToy(stage, root, mouseKit.build());
  mouse.position.set(0.2, GROUND, -17);

  const lampSwing = new Spring(0, 8, 0.55);
  const bowlKick = new Spring(0, 420, 15);
  let time = 0;
  let steamTimer = 0;
  let doorOpening = false;

  return {
    kick(strength) {
      bowlKick.kick(-0.16 - 0.14 * strength);
      if (strength > 0) lampSwing.kick(0.014 * strength);
    },
    strain(u) {
      lampSwing.kick(u * u * 0.05 * Math.sin(time * 30));
      door.rotation.y = -u * u * 0.06 * Math.abs(Math.sin(time * 40));
    },
    blast(ctx) {
      doorOpening = true;
      lampSwing.kick(0.5);
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
      moon.visible = false;
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      const kick = bowlKick.update(dt);
      bowl.scale.set(1 - kick * 0.018, 1 + kick * 0.03, 1 - kick * 0.018);
      lamp.rotation.z = lampSwing.update(dt) + Math.sin(time * 0.7) * 0.012;
      lamp.rotation.x = Math.sin(time * 0.53) * 0.008;
      // The hands run fast: time flies when things are out of control.
      minuteHand.rotation.z = -time * 0.5;
      hourHand.rotation.z = -time * 0.5 / 12 - 1;

      const cycle = time % 9;
      const tremble = cycle > 7.6 ? Math.sin(((cycle - 7.6) * Math.PI) / 1.4) : 0;
      moon.position.copy(moonHome);
      moon.position.x += Math.sin(time * 47) * 0.05 * tremble;
      moon.position.y += Math.cos(time * 41) * 0.04 * tremble;

      const peek = (time + 4) % 13;
      const out = smooth(0, 0.3, peek) * (1 - smooth(1.5, 1.8, peek));
      const scurry = smooth(3.4, 3.8, peek) * (1 - smooth(5.2, 5.6, peek));
      mouse.position.z = -17 + out * 0.5 + scurry * 3.2;
      mouse.position.x = 0.2 + scurry * Math.sin(time * 26) * 0.08;
      mouse.scale.setScalar(Math.max(0.001, Math.max(out, scurry)));

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
}

const onCounter = (x: number, z: number, rotation: number): UnitSlot => ({ x, y: COUNTER_TOP + 0.03, z, rotation, scale: 1.5 });
const onFloor = (x: number, z: number, rotation: number, scale: number): UnitSlot => ({ x, y: GROUND, z, rotation, scale });

export const kitchenSpec: SceneSpec = {
  id: 1,
  light: {
    sunDir: [0.36, 0.95, 0.5],
    sunColor: '#fff0da',
    sunIntensity: 1.32,
    shadeTint: '#573f7c',
    sky: '#9aa6dc',
    skyIntensity: 0.26,
    ground: '#d08a68',
    groundIntensity: 0.16,
    rim: '#ffd9b5',
    rimIntensity: 0.5,
    rimDir: [-0.7, 0.3, -0.62],
    fog: '#3a1a2c',
    fogRange: [66, 130],
    pool: [0, 0, 1, 15],
    poolFloor: 0.55,
  },
  grade: {
    exposure: 1,
    contrast: 1.05,
    saturation: 1.06,
    vignette: 0.34,
    bloom: 0.6,
    shadowTint: '#fff4f6',
    highlightTint: '#fffaf2',
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
  lamps: [
    { position: [0, 10, 0], color: '#ffd59a', intensity: 1.15, radius: 24 },
    { position: [10, 6.6, -14.5], color: '#c48cff', intensity: 0.55, radius: 11 },
  ],
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

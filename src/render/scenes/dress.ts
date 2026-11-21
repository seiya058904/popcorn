import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../motion/rng.ts';
import { at, Kit, M, P, paint, Pattern, rod, V } from '../machines/common.ts';

/** Set dressing: the small things that make each place feel lived in. */

function jar(kit: Kit, x: number, y: number, z: number, r: number, h: number, fill: string, lid = M.brass): void {
  kit.add(P.lathe([[r, 0], [r, h * 0.82], [r * 0.72, h * 0.95], [r * 0.72, h]], 18, 0.03, 2), { ...M.glass, lens: 0.5, thickness: 0.04, matrix: at(x, y, z) });
  kit.add(P.puck(r * 0.92, r * 0.92, h * 0.62, 16, 0.02), { color: fill, gloss: 0.2, emissive: 0.08, outline: 0, fixedColor: true, matrix: at(x, y + 0.01, z) });
  kit.add(P.puck(r * 0.8, r * 0.8, h * 0.12, 16, 0.012), { ...lid, matrix: at(x, y + h, z) });
}

// Stove ---------------------------------------------------------------------------

export function dressStove(kit: Kit): void {
  // A wooden shelf on the tiles, above where the heap will reach.
  const y = 3.72;
  const z = -3.28;
  kit.add(P.box(3.9, 0.09, 0.42, 0.03, 2), { ...M.wood, matrix: at(3.45, y, z) });
  for (const x of [1.95, 4.95]) {
    kit.add(P.box(0.06, 0.34, 0.06, 0.012, 1), { ...M.iron, matrix: at(x, y - 0.2, -3.42) });
    rod(kit, V(x, y - 0.3, -3.46), V(x, y - 0.04, -3.14), 0.016, M.iron, 5);
  }
  jar(kit, 2.15, y + 0.05, z, 0.14, 0.42, '#ffc63f');
  jar(kit, 2.58, y + 0.05, z, 0.12, 0.32, '#f6e7cb');
  jar(kit, 2.98, y + 0.05, z, 0.15, 0.5, '#d9772e');
  for (let i = 0; i < 3; i += 1) kit.add(P.box(0.62 - i * 0.05, 0.075, 0.3, 0.012, 1), { ...(i === 1 ? M.red : i === 0 ? M.navy : M.teal), matrix: at(3.72, y + 0.09 + i * 0.08, z, [0, i * 0.12, 0]) });
  // A little plant in a pot.
  kit.add(P.lathe([[0, 0], [0.11, 0], [0.16, 0.2], [0.17, 0.22], [0, 0.2]], 14, 0.015, 1), { ...M.red, matrix: at(4.6, y + 0.05, z) });
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.4;
    kit.add(P.sphere(0.13, 6, 4), { color: i % 2 ? '#3fa56d' : '#58bd7c', gloss: 0.3, outline: 0.4, fixedColor: true, matrix: at(4.6 + Math.cos(a) * 0.09, y + 0.34 + i * 0.03, z + Math.sin(a) * 0.09, [a, 0, 0.5], [0.42, 1.25, 0.18]) });
  }
  // A vent strip and two pilot lamps along the back guard.
  for (let i = 0; i < 16; i += 1) kit.add(P.box(0.2, 0.03, 0.012, 0.004, 1), { ...M.dark, detail: 1, matrix: at(1.6 + i * 0.28, 0.42, -2.945) });
  for (const x of [-2.2, -1.7]) {
    kit.add(P.puck(0.07, 0.06, 0.025, 12, 0.008), { ...M.chrome, outline: 0, matrix: at(x, 0.7, -2.95, [Math.PI / 2, 0, 0]) });
    kit.add(P.sphere(0.04, 8, 6), { color: x < -2 ? '#ff5a4a' : '#ffd27a', emissive: 1, outline: 0, fixedColor: true, matrix: at(x, 0.7, -2.925) });
  }
}

// Kitchen -------------------------------------------------------------------------

export function dressKitchen(kit: Kit, ground: number, counterTop: number): void {
  // Tiled splashback between the worktop and the wall cupboards.
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 42; col += 1) {
      const white = (row + col) % 2 === 0;
      kit.add(P.box(0.72, 0.72, 0.06, 0.03, 1), { color: white ? '#fff6e6' : '#8fd9c6', gloss: 0.8, coat: 0.4, pattern: Pattern.Enamel, outline: 0, fixedColor: true, detail: 1, matrix: at(3.1 + col * 0.76, counterTop + 0.5 + row * 0.76, -17.1) });
    }
  }
  // A big round rug under the table.
  const rugBands = ['#6e2c48', '#d2a06c', '#a83b4c', '#d2a06c', '#6e2c48', '#a83b4c'];
  rugBands.forEach((color, band) => {
    const r = 10.2 - band * 1.55;
    kit.add(P.puck(r, r - 0.04, 0.05 + band * 0.012, 72, 0.01), { color, gloss: 0.03, pattern: Pattern.Fabric + 0.2, outline: 0, fixedColor: true, matrix: at(0, ground + 0.02, 1) });
  });
  // Brass cupboard pulls.
  for (let i = 0; i < 9; i += 1) kit.add(P.capsule(0.05, 0.7, 2, 6), { ...M.brass, outline: 0.4, matrix: at(4.35 + i * 3.45 + 1.1, ground + 3.05, -13.3, [0, 0, Math.PI / 2]) });
  // Kettle waiting by the sink.
  kit.add(P.lathe([[0, 0], [0.62, 0], [0.74, 0.3], [0.62, 0.86], [0.26, 1.06], [0, 1.08]], 22, 0.08, 2), { ...M.chrome, matrix: at(13.6, counterTop + 0.03, -15) });
  kit.add(P.tube([V(13.05, counterTop + 0.72, -15), V(12.72, counterTop + 0.98, -15), V(12.54, counterTop + 1.2, -15)], 0.08, 8, 7), M.chrome);
  kit.add(P.tube([V(13.3, counterTop + 1.12, -15), V(13.6, counterTop + 1.62, -15), V(14, counterTop + 1.12, -15)], 0.055, 12, 7), M.rubber);
  kit.add(P.sphere(0.09, 8, 6), { ...M.red, matrix: at(13.6, counterTop + 1.13, -15) });
  // Curtains on either side of the window.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      kit.add(P.capsule(0.3, 6.2, 2, 8), { ...(i % 2 ? M.canvasCream : paint(M.canvasCream, { color: '#f4c98a' })), outline: 0.2, matrix: at(10 + side * (5.2 + i * 0.28), 6.5, -16.55 + (i % 2) * 0.16) });
    }
  }
  // Framed pictures above the shelf.
  const frames: Array<[number, number, number, number, string, string]> = [
    [-13.4, 10.2, 2.4, 3, '#8fd9c6', '#ffc63f'],
    [-10, 10.8, 3, 2.2, '#ffb1a8', '#d62f38'],
    [-6.6, 9.8, 2, 2.6, '#c9b6ff', '#fff0d4'],
  ];
  for (const [x, y, w, h, back, fore] of frames) {
    kit.add(P.box(w + 0.3, h + 0.3, 0.14, 0.04, 1), { ...M.darkWood, matrix: at(x, y, -17.24) });
    kit.add(P.box(w, h, 0.04, 0.01, 1), { color: back, gloss: 0.2, outline: 0, fixedColor: true, matrix: at(x, y, -17.15) });
    kit.add(P.sphere(Math.min(w, h) * 0.26, 16, 10), { color: fore, gloss: 0.1, outline: 0, fixedColor: true, matrix: at(x, y, -17.13, [0, 0, 0], [1, 1, 0.05]) });
  }
  // A rack of pans hanging over the worktop.
  rod(kit, V(15.3, 4.06, -15.4), V(26.6, 4.06, -15.4), 0.07, M.chrome);
  for (let i = 0; i < 5; i += 1) {
    const x = 16.5 + i * 2.2;
    rod(kit, V(x, 4.06, -15.4), V(x, 3.56, -15.4), 0.02, M.steel, 5);
    kit.add(P.puck(0.5 - i * 0.03, 0.42 - i * 0.03, 0.12, 20, 0.03), { ...(i % 2 ? M.copper : M.iron), matrix: at(x, 3.04 + i * 0.03, -15.4, [Math.PI / 2, 0, 0]) });
  }
}

export function fridgeBadge(kit: Kit): void {
  // Chrome flash and a little maker's badge.
  kit.add(P.box(2.6, 0.16, 0.05, 0.03, 1), { ...M.chrome, outline: 0, matrix: at(2.9, 2.3, 0.28) });
  kit.add(P.lathe([[0, 0], [0.36, 0], [0.34, 0.05], [0, 0.07]], 18, 0.012, 1), { ...M.brass, matrix: at(2.9, 2.3, 0.3, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 7; i += 1) kit.add(P.box(4.6, 0.04, 0.03, 0.008, 1), { ...M.chrome, outline: 0, detail: 1, matrix: at(2.9, -5.6 + i * 0.1, 0.27) });
}

// Cinema --------------------------------------------------------------------------

export function dressCinema(kit: Kit, ground: number, stageR: number): void {
  // Patterned carpet runner down the aisle with brass edging.
  kit.add(P.box(11, 0.05, 88, 0.01, 1), { color: '#7d1e30', gloss: 0.04, pattern: Pattern.Fabric + 0.2, sheen: 0.5, outline: 0, fixedColor: true, matrix: at(0, ground + 0.11, 58) });
  for (const x of [-5.7, 5.7]) kit.add(P.box(0.3, 0.1, 88, 0.02, 1), { ...M.brass, outline: 0, matrix: at(x, ground + 0.12, 58) });
  // Stage boards fanning out from the bucket.
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    kit.add(P.box(stageR - 4.6, 0.02, 0.05, 0.006, 1), { color: '#1f0d16', outline: 0, fixedColor: true, detail: 1, matrix: at(Math.cos(a) * (stageR + 4.2) * 0.5, 0.0, Math.sin(a) * (stageR + 4.2) * 0.5, [0, -a, 0]) });
  }
  // Rosettes along the arch and flutes on the columns.
  for (let i = -6; i <= 6; i += 1) {
    const x = i * 7;
    kit.add(P.torus(0.95, 0.2, 8, 22), { ...M.brass, matrix: at(x, 39, -39.2) });
    kit.add(P.sphere(0.62, 12, 9), { ...M.brass, matrix: at(x, 39, -39.2) });
  }
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i += 1) kit.add(P.box(0.5, 52, 0.3, 0.14, 1), { ...M.brass, gloss: 0.7, outline: 0.3, matrix: at(side * 45 + i * 1.25, 12.5, -39.35) });
    // Boxes for the people who only came to be seen.
    kit.add(P.box(9, 3.4, 8, 0.3, 2), { ...M.deepRed, matrix: at(side * 58, 16, -8) });
    kit.add(P.box(9.5, 0.5, 8.5, 0.12, 2), { ...M.brass, matrix: at(side * 58, 17.9, -8) });
    for (let n = 0; n < 5; n += 1) kit.add(P.sphere(0.32, 8, 6), { ...M.bulb, matrix: at(side * 53.6, 14.9 + (n % 2) * 0.1, -11 + n * 1.5) });
  }
}

// Town ----------------------------------------------------------------------------

/** lampLight is the light group of the street lamps. */
export function dressPlaza(kit: Kit, rng: Rng, ringRoad: number, lampLight = 0): void {
  // Paving in concentric courses.
  for (let ring = 0; ring < 6; ring += 1) {
    const r = 7 + ring * 1.7;
    const stones = Math.round(r * 3.2);
    for (let i = 0; i < stones; i += 1) {
      const a = ((i + (ring % 2) * 0.5) / stones) * Math.PI * 2;
      const tone = ['#f3dcb4', '#ecd1a4', '#f7e4c2', '#e4c796'][rng.int(0, 4)]!;
      kit.add(P.box(1.62, 0.07, (Math.PI * 2 * r) / stones - 0.1, 0.02, 1), { color: tone, gloss: 0.18, pattern: Pattern.Plaster, outline: 0, fixedColor: true, detail: 1, matrix: at(Math.cos(a) * r, 0.1, Math.sin(a) * r, [0, -a, 0]) });
    }
  }
  // Kerbs on both sides of the ring road.
  for (const r of [ringRoad - 3.5, ringRoad + 3.5]) kit.add(P.torus(r, 0.32, 5, 96), { ...M.concrete, outline: 0.3, matrix: at(0, 0.14, 0, [Math.PI / 2, 0, 0]) });
  // Lamp posts, benches and flower beds around the square.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    const x = Math.cos(a) * 16;
    const z = Math.sin(a) * 16;
    kit.add(P.puck(0.2, 0.12, 4.3, 8, 0.02), { ...M.darkIron, matrix: at(x, 0.1, z) });
    kit.add(P.sphere(0.5, 10, 8), { ...M.bulb, light: lampLight || undefined, matrix: at(x, 4.75, z) });
    kit.add(P.puck(0.42, 0.22, 0.22, 10, 0.03), { ...M.darkIron, matrix: at(x, 5.15, z, [Math.PI, 0, 0]) });
    const b = a + 0.31;
    const bx = Math.cos(b) * 15.4;
    const bz = Math.sin(b) * 15.4;
    kit.add(P.box(0.6, 0.12, 2.4, 0.04, 1), { ...M.wood, matrix: at(bx, 0.72, bz, [0, -b, 0]) });
    kit.add(P.box(0.1, 0.56, 2.4, 0.03, 1), { ...M.wood, matrix: at(Math.cos(b) * 15.72, 1.04, Math.sin(b) * 15.72, [0, -b, 0]) });
    for (const s of [-1, 1]) {
      const c = b + (s * 1) / 15.4;
      kit.add(P.box(0.5, 0.56, 0.1, 0.02, 1), { ...M.iron, matrix: at(Math.cos(c) * 15.4, 0.38, Math.sin(c) * 15.4, [0, -b, 0]) });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 11.5;
    const z = Math.sin(a) * 11.5;
    kit.add(P.torus(1.5, 0.24, 6, 24), { ...M.concrete, matrix: at(x, 0.3, z, [Math.PI / 2, 0, 0]) });
    kit.add(P.puck(1.4, 1.4, 0.26, 20, 0.05), { color: '#5a3b28', gloss: 0.05, outline: 0, fixedColor: true, matrix: at(x, 0.12, z) });
    for (let n = 0; n < 16; n += 1) {
      const b = n * 2.4;
      const r = Math.sqrt(n / 16) * 1.25;
      kit.add(P.sphere(0.2, 6, 4), { color: ['#ff6f8e', '#ffd257', '#fff0d4', '#c98bff'][n % 4]!, gloss: 0.2, emissive: 0.1, outline: 0, fixedColor: true, detail: 1, matrix: at(x + Math.cos(b) * r, 0.5 + (n % 3) * 0.05, z + Math.sin(b) * r) });
    }
  }
}

export interface HouseFrame {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotation: number;
  place(lx: number, ly: number, lz: number, extra?: [number, number, number], scale?: number | [number, number, number]): THREE.Matrix4;
}

const AWNINGS = ['#d8473f', '#3f7fd8', '#2f9e87', '#e08a2e'];

/** shopLight is the light group of the shop windows, which come on at dusk. */
export function dressHouse(kit: Kit, rng: Rng, house: HouseFrame, wall: string, shopLight = 0): void {
  const { w, d, h, place } = house;
  // Plinth, cornice and a door with a step.
  kit.add(P.box(w + 0.24, 0.7, d + 0.24, 0.08, 1), { ...M.concrete, outline: 0.5, matrix: place(0, 0.35, 0) });
  kit.add(P.box(w + 0.36, 0.28, d + 0.36, 0.08, 1), { color: new THREE.Color(wall).multiplyScalar(1.06).getStyle(), gloss: 0.3, outline: 0.5, fixedColor: true, matrix: place(0, h - 0.1, 0) });
  const shop = rng.next() < 0.3;
  const front = d / 2 + 0.05;
  kit.add(P.box(1.2, 2.1, 0.1, 0.04, 1), { ...(shop ? M.navy : M.darkWood), outline: 0.4, matrix: place(shop ? w * 0.28 : 0, 1.05, front) });
  kit.add(P.sphere(0.06, 6, 4), { ...M.brass, outline: 0, detail: 1, matrix: place((shop ? w * 0.28 : 0) + 0.42, 1.05, front + 0.08) });
  if (shop) {
    // Shopfront: a big lit window under a striped awning.
    kit.add(P.box(w * 0.42, 1.6, 0.08, 0.03, 1), { color: '#ffe9a6', emissive: 0.6, outline: 0, fixedColor: true, light: shopLight || undefined, matrix: place(-w * 0.2, 1.5, front) });
    kit.add(P.box(w * 0.46, 0.1, 0.12, 0.02, 1), { ...M.darkWood, outline: 0, matrix: place(-w * 0.2, 0.72, front + 0.02) });
    const color = AWNINGS[rng.int(0, AWNINGS.length)]!;
    const stripes = 6;
    const span = w * 0.86;
    for (let i = 0; i < stripes; i += 1) {
      kit.add(P.box(span / stripes - 0.01, 0.05, 1.1, 0.02, 1), { color: i % 2 ? '#fff0d4' : color, gloss: 0.15, pattern: Pattern.Fabric, outline: 0.3, fixedColor: true, matrix: place(-span / 2 + (i + 0.5) * (span / stripes), 2.75, front + 0.48, [0.42, 0, 0]) });
    }
  }
  // A chimney on most roofs.
  if (rng.next() < 0.7) {
    const cx = (rng.next() - 0.5) * w * 0.5;
    const cz = (rng.next() - 0.5) * d * 0.5;
    kit.add(P.box(0.7, 2.2, 0.7, 0.05, 1), { ...M.brick, matrix: place(cx, h + 1.5, cz) });
    kit.add(P.box(0.86, 0.14, 0.86, 0.03, 1), { ...M.concrete, outline: 0.4, matrix: place(cx, h + 2.65, cz) });
  }
}

/** A wall of a house. Its front faces away from the square and its back faces the square. */
export type Face = 'front' | 'back' | 'right' | 'left';

/**
 * A framed window with a sill, `lx` along the wall and `ly` up it. light is the light group that
 * switches it on at night; 0 leaves it dark glass for good. Plain boxes: a window is a few pixels
 * across in the wide shot, where rounded edges cost nine times the triangles and never show.
 */
export function windowFrameAt(kit: Kit, house: HouseFrame, lx: number, ly: number, light: number, face: Face = 'front', detail = 0): void {
  // The wall's outward normal and the direction along it, in the house's own frame.
  const [nx, nz, tx, tz] = face === 'front' ? [0, 1, 1, 0] : face === 'back' ? [0, -1, -1, 0] : face === 'right' ? [1, 0, 0, -1] : [-1, 0, 0, 1];
  const half = nz !== 0 ? house.d / 2 : house.w / 2;
  const on = (along: number, y: number, out: number): THREE.Matrix4 => house.place(tx * along + nx * (half + out), y, tz * along + nz * (half + out));
  const slab = (wide: number, high: number, deep: number): THREE.BufferGeometry => (nz !== 0 ? P.slab(wide, high, deep) : P.slab(deep, high, wide));
  const frame = { color: '#fff8ea', outline: 0, fixedColor: true };
  const glass = light ? { color: '#ffe9a6', emissive: 0.72, outline: 0, fixedColor: true, light } : M.windowPane;
  kit.add(slab(1.3, 1.6, 0.08), { ...frame, gloss: 0.4, detail, matrix: on(lx, ly, 0.01) });
  kit.add(slab(1.06, 1.34, 0.08), { ...glass, detail, matrix: on(lx, ly, 0.05) });
  kit.add(slab(0.05, 1.34, 0.05), { ...frame, detail: Math.max(1, detail), matrix: on(lx, ly, 0.1) });
  kit.add(slab(1.06, 0.05, 0.05), { ...frame, detail: Math.max(1, detail), matrix: on(lx, ly + 0.1, 0.1) });
  kit.add(slab(1.46, 0.09, 0.2), { ...frame, gloss: 0.3, detail, matrix: on(lx, ly - 0.84, 0.08) });
}

const CLUMP_VARIANTS = 6;
const clumpShapes: THREE.BufferGeometry[] = [];

/**
 * A leafy clump of unit size: a ball with its surface pushed in and out, so its outline breaks into
 * tufts and its shading into lit leaves and shaded hollows. Smooth normals, unlike a faceted ball.
 * A few variants are made once and shared by every tree.
 */
function clumpShape(variant: number): THREE.BufferGeometry {
  const cached = clumpShapes[variant];
  if (cached) return cached;
  const ball = new THREE.IcosahedronGeometry(1, 2);
  ball.deleteAttribute('uv');
  ball.deleteAttribute('normal');
  const shape = mergeVertices(ball, 1e-4);
  ball.dispose();
  const seed = variant * 1.7 + 0.4;
  const position = shape.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const tuft = Math.sin(x * 4.1 + seed) * Math.sin(y * 3.7 - seed * 1.3) * Math.sin(z * 4.4 + seed * 0.7);
    const push = 1 + tuft * 0.16;
    // Flatter underneath, as a crown is.
    position.setXYZ(i, x * push, y * push * (y < 0 ? 0.8 : 1), z * push);
  }
  shape.computeVertexNormals();
  clumpShapes[variant] = shape;
  return shape;
}

const BARK = { color: '#7a4e2e', gloss: 0.15, pattern: Pattern.Wood + 0.2, fixedColor: true };
const firDark = new THREE.Color('#1f6b4a');
const firLight = new THREE.Color('#3f9a62');

/** A town tree: mostly round, leafy crowns; some tall and narrow; now and then a fir. */
export function addRichTree(kit: Kit, rng: Rng, x: number, z: number): void {
  const kind = rng.next();
  const h = rng.range(2.4, 3.8);
  // A trunk that flares into roots where it meets the ground.
  kit.add(P.lathe([[0, 0], [0.72, 0], [0.5, 0.12], [0.34, 0.45], [0.28, h * 0.9], [0, h * 0.9]], 10, 0.06, 2), { ...BARK, matrix: at(x, 0, z) });
  if (kind < 0.18) {
    // A fir: tiers of drooping cones, darker inside, lighter where the tips catch the sun.
    for (let t = 0; t < 4; t += 1) {
      const r = 2.1 - t * 0.42;
      kit.add(P.lathe([[0, 0], [r, 0], [r * 0.9, 0.2], [0.08, 1.7], [0, 1.72]], 12, 0.08, 2), {
        color: firDark,
        gloss: 0.12,
        sway: 0.25 + t * 0.15,
        fixedColor: true,
        colorFn: (_p, n, out) => out.lerp(firLight, Math.max(0, n.y) * 0.5),
        matrix: at(x, h * 0.55 + t * 1.15, z, [0, t * 0.9, 0]),
      });
    }
    return;
  }
  const tones = rng.next() < 0.5 ? ['#2f8f5e', '#3fa56d', '#58bd7c'] : ['#3a9a5e', '#58bd7c', '#79cf88'];
  const tall = kind > 0.8;
  const branch = paint(M.wood, { color: '#7a4e2e' });
  rod(kit, V(x, h * 0.7, z), V(x + 0.9, h + 0.5, z + 0.4), 0.13, branch, 5);
  rod(kit, V(x, h * 0.6, z), V(x - 0.7, h + 0.3, z - 0.5), 0.11, branch, 5);
  const clumps = tall ? 10 : 12;
  for (let i = 0; i < clumps; i += 1) {
    const a = i * 2.4 + rng.range(0, 1);
    const ring = i === 0 ? 0 : (tall ? 0.8 : 1.35) + rng.range(-0.2, 0.3);
    const y = h + 1.3 + (i === 0 ? 0.9 : rng.range(-0.8, 0.8)) * (tall ? 2.2 : 1);
    const r = rng.range(0.85, 1.4) * (i === 0 ? 1.3 : 1);
    const lift = Math.min(1, Math.max(0, (y - h) / (tall ? 5 : 2.6)));
    kit.add(clumpShape(Math.floor(rng.next() * CLUMP_VARIANTS)), {
      color: tones[Math.min(2, Math.floor(lift * 3))]!,
      gloss: 0.14,
      outline: 0.35,
      sway: 0.4 + 0.6 * lift,
      fixedColor: true,
      // Lit on top; the hollows under each clump fall into shade.
      colorFn: (_p, n, out) => out.multiplyScalar(0.8 + 0.3 * Math.max(0, n.y)),
      matrix: at(x + Math.cos(a) * ring, y, z + Math.sin(a) * ring, [a, i, 0], tall ? [r * 0.85, r * 1.25, r * 0.85] : r),
    });
  }
}

export function clockTowerDetails(kit: Kit, x: number, z: number): void {
  // Stone quoins, a balcony and a proper clock face with gilded hands.
  for (let i = 0; i < 14; i += 1) {
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      kit.add(P.box(i % 2 ? 1 : 0.7, 0.9, i % 2 ? 0.7 : 1, 0.06, 1), { ...M.concrete, outline: 0.3, matrix: at(x + sx * 3.4, 1.2 + i * 2.05, z + sz * 3.4) });
    }
  }
  kit.add(P.box(8.4, 0.5, 8.4, 0.1, 1), { ...M.concrete, matrix: at(x, 18, z) });
  kit.add(P.box(8, 0.6, 8, 0.1, 1), { ...M.concrete, matrix: at(x, 29.7, z) });
  kit.add(P.torus(2.55, 0.16, 8, 36), { ...M.brass, matrix: at(x, 23, z + 3.92) });
  for (let h = 0; h < 12; h += 1) {
    const a = (h / 12) * Math.PI * 2;
    kit.add(P.box(0.14, h % 3 === 0 ? 0.56 : 0.32, 0.05, 0.02, 1), { ...M.navy, outline: 0, matrix: at(x + Math.sin(a) * 2.02, 23 + Math.cos(a) * 2.02, z + 3.93, [0, 0, -a]) });
  }
  kit.add(P.box(0.18, 1.5, 0.05, 0.03, 1), { ...M.brass, outline: 0, matrix: at(x + 0.38, 23.5, z + 3.98, [0, 0, -0.8]) });
  kit.add(P.box(0.12, 2, 0.05, 0.02, 1), { ...M.brass, outline: 0, matrix: at(x - 0.3, 23.85, z + 4, [0, 0, 0.35]) });
  kit.add(P.sphere(0.2, 10, 8), { ...M.brass, matrix: at(x, 23, z + 4.03) });
  kit.add(P.box(2.2, 3.4, 0.16, 0.5, 2), { ...M.windowPane, matrix: at(x, 11, z + 3.52) });
  rod(kit, V(x, 37, z), V(x, 40.5, z), 0.1, M.brass, 6);
  kit.add(P.sphere(0.34, 10, 8), { ...M.brass, matrix: at(x, 40.6, z) });
}

export function fountainStatue(kit: Kit, floorY: number): void {
  // Tiered basin with a golden kernel on top, the town's proudest monument.
  kit.add(P.lathe([[0, 0], [1.1, 0], [0.5, 0.8], [0.4, 2.2], [2.1, 2.9], [2.2, 3.1], [0.4, 3.1], [0.3, 4.2], [0, 4.2]], 28, 0.1, 2), { ...M.concrete, matrix: at(0, floorY, 0) });
  kit.add(P.sphere(0.72, 18, 14), { ...M.brass, matrix: at(0, floorY + 4.8, 0, [0.3, 0, 0.2], [0.82, 1.08, 0.82]) });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.add(P.sphere(0.13, 6, 4), { ...M.concrete, outline: 0, detail: 2, matrix: at(Math.cos(a) * 2.14, floorY + 3.04, Math.sin(a) * 2.14) });
  }
}

export function carDetails(kit: Kit): void {
  for (const z of [-0.74, 0.74]) kit.add(P.box(1.34, 0.42, 0.04, 0.05, 1), { ...M.windowPane, matrix: at(-0.1, 1.56, z) });
  for (const x of [-0.96, 0.76]) kit.add(P.box(0.04, 0.42, 1.2, 0.03, 1), { ...M.windowPane, matrix: at(x, 1.56, 0) });
  for (const x of [-1, 1]) {
    for (const z of [-0.84, 0.84]) kit.add(P.puck(0.2, 0.2, 0.04, 12, 0.01), { ...M.chrome, outline: 0, matrix: at(x, 0.36, z * 1.08, [z > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]) });
  }
  for (const z of [-0.52, 0.52]) {
    kit.add(P.sphere(0.13, 8, 6), { ...M.bulb, matrix: at(1.68, 0.86, z, [0, 0, 0], [0.5, 1, 1]) });
    kit.add(P.sphere(0.11, 8, 6), { color: '#ff4a3f', emissive: 0.9, outline: 0, fixedColor: true, matrix: at(-1.68, 0.86, z, [0, 0, 0], [0.5, 1, 1]) });
  }
  for (const x of [-1.72, 1.72]) kit.add(P.box(0.08, 0.14, 1.5, 0.04, 1), { ...M.chrome, outline: 0, matrix: at(x, 0.52, 0) });
}

export function wheelGondolas(kit: Kit, radius: number, bulbLight = 0): void {
  const colors = [M.red, M.butter, M.teal, M.navy];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    rod(kit, V(x, y, -1.1), V(x, y, 1.1), 0.09, M.steel, 5);
    // Round cabins, so they look right at any point of the turn.
    kit.add(P.sphere(1.05, 14, 10), { ...colors[i % 4]!, matrix: at(x, y, 0) });
    kit.add(P.torus(1.06, 0.07, 6, 22), { ...M.brass, outline: 0, matrix: at(x, y, 0, [Math.PI / 2, 0, 0]) });
    kit.add(P.sphere(0.2, 8, 6), { ...M.bulb, light: bulbLight || undefined, matrix: at(x, y, 1.12) });
  }
}


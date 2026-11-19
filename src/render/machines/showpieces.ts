import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import type { UnitPath } from '../scenes/types.ts';
import { at, HIDDEN, Kit, M, P, paint, Pattern, puffs, putIf, putLocal, rivets, rod, smooth, V, windUp, type Paint, type UnitDef } from './common.ts';

const GOLD = paint(M.brass, { color: '#e9bf5c', gloss: 0.9, wear: 0.2 });
const LACQUER = { color: '#8c1d2c', gloss: 0.88, coat: 0.6, pattern: Pattern.Enamel, wear: 0.22, fixedColor: true };
const LEATHER = { color: '#7a2e22', gloss: 0.4, pattern: Pattern.Leather, wear: 0.3, fixedColor: true };
const PAPER = { color: '#fff4dc', gloss: 0.1, pattern: Pattern.Paper, outline: 0.3, fixedColor: true };

// Theatre organ -------------------------------------------------------------------------

/** The rank of pipes behind the console, low at the sides and tall in the middle. */
const PIPES = [1, 1.25, 1.5, 1.78, 2.05, 1.78, 1.5, 1.25, 1].map((height, i) => ({ x: -1.1 + i * 0.275, height, radius: 0.08 + height * 0.014 }));
const CHEST_TOP = 1.52;
const PIPE_Z = -0.6;
/** A tune for the pipes, as pipe numbers; it loops. */
const MELODY = [4, 5, 6, 5, 4, 2, 3, 4, 6, 7, 8, 6, 4, 3, 2, 1, 0, 2, 4, 5];
const NOTES_PER_SECOND = 2.6;

function organBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const wood = M.darkWood;
  // Plinth, a lacquered console with gold edges, and the pipe chest behind it.
  kit.add(P.box(2.4, 0.1, 1.2, 0.04, 1), { ...wood, matrix: at(0, 0.05, 0.12) });
  kit.add(P.box(2.2, 0.98, 1.0, 0.12, 3), { ...LACQUER, ao: (p) => 0.7 + 0.3 * smooth(0.1, 0.8, p.y), matrix: at(0, 0.58, 0.1) });
  for (const z of [0.6, -0.4]) kit.add(P.box(2.22, 0.035, 0.035, 0.012, 1), { ...GOLD, outline: 0, matrix: at(0, 1.07, z) });
  for (const x of [-1.1, 1.1]) kit.add(P.box(0.035, 0.98, 0.035, 0.012, 1), { ...GOLD, outline: 0, matrix: at(x, 0.58, 0.6) });
  kit.add(P.box(2.62, 0.46, 0.64, 0.05, 2), { ...wood, matrix: at(0, CHEST_TOP - 0.23, PIPE_Z) });
  kit.add(P.box(2.66, 0.05, 0.68, 0.02, 1), { ...GOLD, matrix: at(0, CHEST_TOP, PIPE_Z) });
  // Two manuals, stepped, with their black keys.
  ([[0.86, 0.66], [0.97, 0.46]] as const).forEach(([y, z]) => {
    kit.add(P.box(1.62, 0.05, 0.26, 0.012, 1), { color: '#fbf2e0', gloss: 0.7, coat: 0.4, outline: 0.4, fixedColor: true, matrix: at(0, y, z) });
    for (let i = 0; i < 23; i += 1) {
      if ([2, 6, 9, 13, 16, 20].includes(i)) continue;
      kit.add(P.box(0.032, 0.035, 0.15, 0.008, 1), { ...M.dark, outline: 0, detail: 1, matrix: at(-0.76 + i * 0.069, y + 0.035, z - 0.05) });
    }
  });
  for (const x of [-0.85, 0.85]) kit.add(P.box(0.08, 0.2, 0.5, 0.02, 1), { ...wood, matrix: at(x, 0.98, 0.55) });
  // A horseshoe of stop tabs in cream, red and black.
  for (let i = 0; i < 16; i += 1) {
    const u = i / 15 - 0.5;
    const color = ['#fbf2e0', '#d8313a', '#fbf2e0', '#2c2630'][i % 4]!;
    kit.add(P.box(0.07, 0.03, 0.1, 0.012, 1), { color, gloss: 0.8, coat: 0.4, outline: 0.3, fixedColor: true, detail: 1, matrix: at(u * 1.7, 1.12, 0.3 - u * u * 0.5, [0.35, u * 1.2, 0]) });
  }
  // Music desk with a page of music on it.
  kit.add(P.box(0.92, 0.5, 0.04, 0.02, 1), { ...wood, matrix: at(0, 1.36, 0.22, [-0.28, 0, 0]) });
  kit.add(P.box(0.66, 0.42, 0.012, 0.004, 1), { ...PAPER, matrix: at(0, 1.37, 0.25, [-0.28, 0, 0]) });
  for (let row = 0; row < 4; row += 1) kit.add(P.box(0.56, 0.006, 0.004, 0.001, 1), { ...M.dark, outline: 0, detail: 2, matrix: at(0, 1.5 - row * 0.09, 0.27 - row * 0.025, [-0.28, 0, 0]) });
  // Pedalboard and a leather bench.
  for (let i = 0; i < 11; i += 1) kit.add(P.box(0.08, 0.04, 0.44, 0.012, 1), { ...(i % 3 === 1 ? M.dark : M.wood), outline: 0.3, matrix: at(-0.55 + i * 0.11, 0.08, 0.86) });
  kit.add(P.box(1.24, 0.13, 0.4, 0.06, 3), { ...LEATHER, matrix: at(0, 0.62, 1.2) });
  for (const x of [-0.52, 0.52]) for (const z of [1.06, 1.34]) kit.add(P.box(0.06, 0.56, 0.06, 0.015, 1), { ...wood, matrix: at(x, 0.28, z) });
  rivets(kit, V(-0.55, 0.69, 1.4), V(0.55, 0.69, 1.4), 9, 0.016, M.brass);
  // A row of bulbs along the chest; the lit one runs with the tune.
  for (let i = 0; i < 9; i += 1) kit.add(P.sphere(0.04, 8, 6), { color: '#ffe6b0', emissive: 0.35, outline: 0, fixedColor: true, matrix: at(PIPES[i]!.x, CHEST_TOP - 0.2, PIPE_Z + 0.33) });
  return kit.build();
}

/** One flue pipe, its foot at the origin: a cone, a mouth and a tall open tube. */
function organPipe(index: number): () => THREE.BufferGeometry {
  return () => {
    const { height, radius } = PIPES[index]!;
    const kit = new Kit();
    kit.add(
      P.lathe([[0, 0], [radius * 0.35, 0], [radius, height * 0.16], [radius, height], [radius * 0.82, height], [radius * 0.82, height * 0.2], [0, height * 0.17]], 20, 0.012, 2),
      { ...GOLD, ao: (p) => 0.75 + 0.25 * smooth(0, height * 0.5, p.y) },
    );
    kit.add(P.box(radius * 1.2, height * 0.06, 0.02, 0.006, 1), { ...M.dark, outline: 0, matrix: at(0, height * 0.22, radius * 0.92) });
    kit.add(P.torus(radius * 1.02, 0.012, 5, 18), { ...GOLD, outline: 0, matrix: at(0, height * 0.16, 0, [Math.PI / 2, 0, 0]) });
    return kit.build();
  };
}

/** The puff of popcorn a sounding pipe blows out of its top. */
function organPlume(): THREE.BufferGeometry {
  const kit = new Kit();
  puffs(kit, 0, 0, 0, 0.16, 0.16, 6, 0.07, 41);
  return kit.build();
}

/** The bulb that lights under the sounding pipe. */
function organSpark(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(0.065, 10, 8), { ...M.bulb });
  return kit.build();
}

function organTrim25(): THREE.BufferGeometry {
  // Earned at 25: a gilded tower of three pipes on each side.
  const kit = new Kit();
  for (const side of [-1, 1]) {
    kit.add(P.box(0.46, 0.9, 0.46, 0.06, 2), { ...LACQUER, matrix: at(side * 1.55, 0.45, -0.2) });
    kit.add(P.box(0.5, 0.05, 0.5, 0.02, 1), { ...GOLD, matrix: at(side * 1.55, 0.92, -0.2) });
    [-0.12, 0, 0.12].forEach((dx, i) => {
      const h = 0.7 + (i === 1 ? 0.25 : 0);
      kit.add(P.lathe([[0, 0], [0.05, 0.1], [0.05, h], [0.04, h], [0, 0.1]], 14, 0.01, 2), { ...GOLD, matrix: at(side * 1.55 + dx, 0.94, -0.2) });
    });
    kit.add(P.sphere(0.07, 10, 8), { ...GOLD, matrix: at(side * 1.55, 1.94, -0.2) });
  }
  return kit.build();
}

function organTrim50(): THREE.BufferGeometry {
  // Earned at 50: a lit arch of bulbs over the pipes, like a movie palace proscenium.
  const kit = new Kit();
  kit.add(P.torus(1.45, 0.05, 8, 48, Math.PI), { ...GOLD, matrix: at(0, CHEST_TOP + 0.05, PIPE_Z - 0.05) });
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI;
    kit.add(P.sphere(0.045, 8, 6), { ...M.bulb, matrix: at(Math.cos(a) * 1.45, CHEST_TOP + 0.05 + Math.sin(a) * 1.45, PIPE_Z + 0.02) });
  }
  return kit.build();
}

// Popcorn train ---------------------------------------------------------------------------

/** Rail gauge and wheel sizes, in model units; the rails sit at y = 0. */
const GAUGE = 0.32;
const DRIVER_R = 0.3;
const DRIVERS = [-0.75, -0.1, 0.55];
const BOGIE_R = 0.2;
const BOGIES = [-0.75, 0.75];
const CRANK = 0.11;

function locoBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const boiler = M.red;
  // Frame and running boards.
  kit.add(P.box(2.9, 0.18, 0.66, 0.04, 2), { ...M.darkIron, matrix: at(0.05, 0.42, 0) });
  for (const z of [-0.42, 0.42]) kit.add(P.box(2.1, 0.03, 0.14, 0.012, 1), { ...M.steel, pattern: Pattern.Tread + 0.2, matrix: at(0.25, 0.56, z) });
  rivets(kit, V(-1.3, 0.42, 0.335), V(1.4, 0.42, 0.335), 12, 0.016, M.steel);
  // The boiler, banded in brass, with its smokebox and door.
  kit.add(P.puck(0.38, 0.38, 1.7, 28, 0.02), { ...boiler, matrix: at(-0.5, 0.92, 0, [0, 0, -Math.PI / 2]) });
  for (const x of [-0.25, 0.3, 0.85]) kit.add(P.torus(0.388, 0.022, 6, 32), { ...M.brass, outline: 0, matrix: at(x, 0.92, 0, [0, Math.PI / 2, 0]) });
  kit.add(P.puck(0.41, 0.41, 0.34, 28, 0.03), { ...M.darkIron, matrix: at(1.18, 0.92, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.34, 0.3, 0.06, 28, 0.02), { ...M.darkIron, gloss: 0.6, matrix: at(1.5, 0.92, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.sphere(0.04, 8, 6), { ...M.brass, matrix: at(1.58, 0.92, 0) });
  for (const y of [0.78, 1.06]) kit.add(P.box(0.02, 0.025, 0.4, 0.008, 1), { ...M.brass, outline: 0, matrix: at(1.565, y, 0) });
  // A flared stack, a brass steam dome and a sand dome.
  kit.add(P.lathe([[0.1, 0], [0.12, 0], [0.12, 0.28], [0.22, 0.5], [0.2, 0.52], [0.09, 0.32], [0.08, 0.02]], 22, 0.02, 2), { ...M.darkIron, matrix: at(1.2, 1.26, 0) });
  kit.add(P.torus(0.21, 0.02, 6, 22), { ...M.brass, outline: 0, matrix: at(1.2, 1.77, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.lathe([[0, 0], [0.18, 0], [0.18, 0.12], [0.12, 0.24], [0, 0.27]], 20, 0.04, 3), { ...M.brass, matrix: at(0.5, 1.26, 0) });
  kit.add(P.lathe([[0, 0], [0.15, 0], [0.15, 0.1], [0.1, 0.2], [0, 0.22]], 18, 0.04, 3), { ...boiler, matrix: at(-0.05, 1.26, 0) });
  // Headlamp and the cowcatcher.
  kit.add(P.box(0.2, 0.22, 0.24, 0.05, 2), { ...M.darkIron, matrix: at(1.44, 1.45, 0) });
  kit.add(P.puck(0.08, 0.08, 0.03, 16, 0.01), { ...M.bulb, matrix: at(1.55, 1.45, 0, [0, 0, -Math.PI / 2]) });
  for (let i = 0; i < 5; i += 1) kit.add(P.box(0.03, 0.03, 0.38, 0.01, 1), { ...M.red, outline: 0.4, matrix: at(1.62 + i * 0.012, 0.36 - i * 0.05, 0, [0, 0, -0.75]) });
  kit.add(P.box(0.05, 0.06, 0.66, 0.015, 1), { ...M.darkIron, matrix: at(1.55, 0.38, 0) });
  // The cab: windows all round, a curved roof, gauges inside.
  kit.add(P.box(0.95, 0.86, 0.9, 0.05, 2), { ...M.red, matrix: at(-0.95, 1.12, 0) });
  for (const z of [-0.452, 0.452]) kit.add(P.box(0.34, 0.3, 0.02, 0.03, 2), { ...M.windowPane, matrix: at(-0.78, 1.28, z) });
  for (const z of [-0.22, 0.22]) kit.add(P.box(0.02, 0.26, 0.24, 0.03, 2), { ...M.windowPane, matrix: at(-0.47, 1.3, z) });
  kit.add(P.box(1.12, 0.07, 1.04, 0.035, 2), { ...M.darkIron, matrix: at(-0.95, 1.58, 0) });
  kit.add(P.box(1.0, 0.04, 0.9, 0.02, 1), { ...M.darkIron, matrix: at(-0.95, 1.63, 0) });
  kit.add(P.box(0.6, 0.03, 0.03, 0.01, 1), { ...M.brass, outline: 0, matrix: at(-0.95, 0.72, 0.452) });
  // Coupler at the back.
  kit.add(P.box(0.2, 0.08, 0.14, 0.02, 1), { ...M.darkIron, matrix: at(-1.48, 0.38, 0) });
  return kit.build();
}

/** An open wagon heaped with popcorn; its paint takes the copy's color. */
function wagonBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.3, 0.14, 0.66, 0.04, 2), { ...M.darkIron, matrix: at(0, 0.42, 0) });
  for (const x of BOGIES) kit.add(P.box(0.62, 0.14, 0.74, 0.03, 1), { ...M.darkIron, matrix: at(x, 0.26, 0) });
  const paintCoat = { color: '#ffffff', gloss: 0.82, coat: 0.45, pattern: Pattern.Enamel, wear: 0.3 };
  kit.add(P.box(2.2, 0.56, 0.86, 0.06, 2), { ...paintCoat, matrix: at(0, 0.78, 0) });
  // Cream bands, corner posts and a floor of tread plate.
  for (const y of [0.56, 1.0]) kit.add(P.box(2.24, 0.06, 0.9, 0.02, 1), { ...M.cream, outline: 0.3, matrix: at(0, y, 0) });
  for (const x of [-1.06, 1.06]) for (const z of [-0.41, 0.41]) kit.add(P.box(0.08, 0.6, 0.08, 0.02, 1), { ...M.darkIron, matrix: at(x, 0.78, z) });
  kit.add(P.box(2.1, 0.02, 0.78, 0.01, 1), { ...M.steel, pattern: Pattern.Tread + 0.2, outline: 0, matrix: at(0, 1.03, 0) });
  puffs(kit, 0, 1.0, 0, 0.92, 0.34, 17, 0.11, 51);
  for (const x of [-1.24, 1.24]) kit.add(P.box(0.18, 0.07, 0.12, 0.02, 1), { ...M.darkIron, matrix: at(x, 0.38, 0) });
  rivets(kit, V(-1.0, 0.78, 0.435), V(1.0, 0.78, 0.435), 6, 0.016, M.brass);
  return kit.build();
}

/**
 * A pair of wheels on an axle, centered on it; the wheels face along Z. A train has a dozen cars
 * with five axles' worth of wheels each, so these are lighter than the big spoked wheels elsewhere.
 */
function axle(radius: number, rim: Paint, spokes: number): () => THREE.BufferGeometry {
  return () => {
    const kit = new Kit();
    rod(kit, V(0, 0, -GAUGE - 0.06), V(0, 0, GAUGE + 0.06), 0.03, M.steel, 6);
    for (const side of [-1, 1]) {
      const z = side * GAUGE;
      kit.add(P.torus(radius, radius * 0.08, 5, 22), { ...M.steel, matrix: at(0, 0, z) });
      kit.add(P.torus(radius * 0.86, radius * 0.055, 4, 22), { ...rim, outline: 0.4, matrix: at(0, 0, z) });
      for (let i = 0; i < spokes / 2; i += 1) {
        kit.add(P.box(radius * 1.7, radius * 0.07, radius * 0.05, radius * 0.015, 1), { ...rim, outline: 0, matrix: at(0, 0, z, [0, 0, (i / (spokes / 2)) * Math.PI]) });
      }
      kit.add(P.puck(radius * 0.2, radius * 0.15, radius * 0.22, 10, 0.01), { ...M.brass, matrix: at(0, 0, z + side * 0.02, [Math.PI / 2, 0, 0]) });
    }
    return kit.build();
  };
}

/** The coupling rods on both sides, centered between the first and last driver. */
function locoRods(): THREE.BufferGeometry {
  const kit = new Kit();
  const span = DRIVERS[2]! - DRIVERS[0]!;
  for (const side of [-1, 1]) {
    kit.add(P.box(span + 0.12, 0.05, 0.03, 0.02, 1), { ...M.steel, matrix: at(0, 0, side * (GAUGE + 0.1)) });
    for (const x of DRIVERS) kit.add(P.puck(0.04, 0.04, 0.04, 10, 0.01), { ...M.brass, outline: 0, matrix: at(x - (DRIVERS[0]! + span / 2), 0, side * (GAUGE + 0.12), [Math.PI / 2, 0, 0]) });
  }
  return kit.build();
}

function locoTrim25(): THREE.BufferGeometry {
  // Earned at 25: a brass bell on a yoke, pennants on the smokebox and a gold stripe.
  const kit = new Kit();
  rod(kit, V(0.2, 1.3, -0.1), V(0.2, 1.48, -0.1), 0.015, M.brass, 5);
  rod(kit, V(0.2, 1.3, 0.1), V(0.2, 1.48, 0.1), 0.015, M.brass, 5);
  kit.add(P.lathe([[0, 0], [0.1, 0], [0.09, 0.04], [0.06, 0.14], [0, 0.16]], 16, 0.015, 2), { ...M.brass, matrix: at(0.2, 1.26, 0) });
  for (const z of [-0.3, 0.3]) {
    rod(kit, V(1.5, 1.2, z), V(1.5, 1.55, z), 0.01, M.steel, 4);
    kit.add(P.box(0.16, 0.1, 0.006, 0.003, 1), { ...M.canvasRed, matrix: at(1.42, 1.5, z) });
  }
  for (const z of [-0.39, 0.39]) kit.add(P.box(1.66, 0.03, 0.01, 0.004, 1), { ...GOLD, outline: 0, matrix: at(0.35, 0.82, z) });
  return kit.build();
}

function wagonTrim25(): THREE.BufferGeometry {
  // Earned at 25: bunting strung along both sides.
  const kit = new Kit();
  for (const z of [-0.47, 0.47]) {
    for (let i = 0; i < 8; i += 1) {
      const color = ['#d8313a', '#ffc63f', '#2b9c93', '#3d6fd6'][i % 4]!;
      kit.add(P.box(0.14, 0.12, 0.006, 0.003, 1), { color, gloss: 0.2, pattern: Pattern.Fabric, outline: 0.3, fixedColor: true, matrix: at(-0.95 + i * 0.27, 0.93, z, [0, 0, Math.PI / 4]) });
    }
  }
  return kit.build();
}

function locoTrim50(): THREE.BufferGeometry {
  // Earned at 50: a gilded nameboard over the cab and a second, gold-capped dome.
  const kit = new Kit();
  kit.add(P.box(0.8, 0.14, 0.04, 0.03, 2), { ...GOLD, matrix: at(-0.95, 1.73, 0.3, [-0.2, 0, 0]) });
  kit.add(P.lathe([[0, 0], [0.13, 0], [0.13, 0.08], [0.08, 0.17], [0, 0.19]], 18, 0.03, 3), { ...GOLD, matrix: at(0.2, 1.26, 0) });
  return kit.build();
}

function wagonTrim50(): THREE.BufferGeometry {
  // Earned at 50: a striped canopy over the load.
  const kit = new Kit();
  for (const x of [-1.0, 1.0]) for (const z of [-0.38, 0.38]) rod(kit, V(x, 1.0, z), V(x, 1.6, z), 0.016, M.brass, 5);
  for (let i = 0; i < 8; i += 1) {
    const cloth = i % 2 ? M.canvasCream : M.canvasRed;
    kit.add(P.box(0.27, 0.025, 0.96, 0.01, 1), { ...cloth, outline: 0.3, matrix: at(-0.95 + i * 0.27, 1.62, 0) });
  }
  return kit.build();
}

/** Rails, sleepers and ballast along the loop, cut into pieces so it can be laid as it goes. */
function trainTrack(path: UnitPath): THREE.BufferGeometry[] {
  const pieces = 36;
  const position = new THREE.Vector3();
  const along = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const gauge = GAUGE * path.scale;
  const placed = (d: number, lift: number, out: THREE.Matrix4): THREE.Matrix4 => {
    path.sample(d, position, along, up);
    across.crossVectors(along, up).normalize();
    along.crossVectors(up, across).normalize();
    out.makeBasis(along, up, across).setPosition(position.addScaledVector(up, lift));
    return out;
  };
  const ballast = { color: '#9a8f86', gloss: 0.05, pattern: Pattern.Plaster + 0.4, outline: 0, fixedColor: true };
  const sleeper = { ...M.darkWood, outline: 0.3 };
  return Array.from({ length: pieces }, (_, piece) => {
    const kit = new Kit();
    const start = (piece / pieces) * path.length;
    const end = ((piece + 1) / pieces) * path.length;
    const step = 0.52 * path.scale;
    for (let d = start; d < end - 1e-3; d += step) {
      const base = placed(d + step / 2, 0, basis);
      kit.add(P.box(step * 1.02, 0.08 * path.scale, gauge * 3.4, 0.02, 1), { ...ballast, matrix: base.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.1 * path.scale, 0)) });
      kit.add(P.box(0.16 * path.scale, 0.07 * path.scale, gauge * 2.7, 0.012, 1), { ...sleeper, matrix: base.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.04 * path.scale, 0)) });
    }
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const m = placed(start + ((end - start) * i) / 6, 0, basis);
        points.push(new THREE.Vector3(0, 0, side * gauge).applyMatrix4(m));
      }
      kit.add(P.tube(points, 0.035 * path.scale, 12, 5), { ...M.steel, outline: 0.5 });
    }
    return kit.build();
  });
}

// Popcorn typhoon -------------------------------------------------------------------------

/** How high the storm floats over the sea, in its own units. */
const HOVER = 1.25;

const cloudWhite = new THREE.Color('#fbfcff');
const cloudBelly = new THREE.Color('#a9b4c8');

/** Cloud paint: sunlit white on top, a grey-blue belly underneath. */
const cloud = (outline: number): Parameters<Kit['add']>[1] => ({
  color: '#ffffff',
  gloss: 0.06,
  outline,
  fixedColor: true,
  colorFn: (_p, n, out) => {
    out.lerpColors(cloudBelly, cloudWhite, smooth(-0.35, 0.55, n.y));
  },
});

function typhoonArms(): THREE.BufferGeometry {
  const kit = new Kit();
  let seed = 77;
  const next = (): number => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  // Three bands winding out from the eye: thick and tall inside, thin and ragged at the edge,
  // with clear gaps between them so the spiral reads from far away.
  for (let arm = 0; arm < 3; arm += 1) {
    const start = (arm / 3) * Math.PI * 2;
    for (let i = 0; i < 40; i += 1) {
      const t = i / 39;
      const a = start + t * Math.PI * 1.5;
      const r = 0.8 + 2.45 * t ** 1.15;
      const width = 0.42 * (1 - t * 0.6);
      for (let k = 0; k < 3; k += 1) {
        const off = (next() - 0.5) * width;
        const rr = r + off;
        const aa = a + (next() - 0.5) * 0.06;
        const size = (0.25 + next() * 0.12) * (1 - 0.45 * t);
        kit.add(P.sphere(size, 10, 7), {
          ...cloud(0.35),
          matrix: at(Math.cos(aa) * rr, 0.24 * (1 - t) + next() * 0.07, Math.sin(aa) * rr, [0, -aa - Math.PI / 2, 0], [1.6, 0.42 + 0.12 * (1 - t), 1]),
        });
      }
    }
  }
  return kit.build();
}

/** The towering ring of cloud round the eye. */
function typhoonEyewall(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 22; i += 1) {
    const a = (i / 22) * Math.PI * 2;
    kit.add(P.sphere(0.27 + (i % 3) * 0.03, 12, 8), { ...cloud(0.45), matrix: at(Math.cos(a) * 0.66, 0.36 + (i % 2) * 0.05, Math.sin(a) * 0.66, [0, -a, 0], [0.9, 1, 0.75]) });
  }
  return kit.build();
}

/** The calm, glowing eye, a kernel of popcorn at its heart. */
function typhoonEye(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.34, 0.3, 0.04, 28, 0.015), { color: '#ffe8a8', emissive: 0.7, outline: 0, fixedColor: true });
  kit.add(P.sphere(0.13, 12, 8), { ...M.popcorn, emissive: 0.6, matrix: at(0, 0.12, 0) });
  return kit.build();
}

/** Popcorn whirled round in the bands, waiting to be flung out. */
function typhoonPopcorn(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    puffs(kit, Math.cos(a) * 1.9, 0.45, Math.sin(a) * 1.9, 0.55, 0.55, 7, 0.1, 61 + i);
  }
  return kit.build();
}

function typhoonTrim25(): THREE.BufferGeometry {
  // Earned at 25: lightning flickering inside the bands.
  const kit = new Kit();
  for (const a of [0.8, 2.9, 4.9]) {
    const points = [V(0, 0.5, 0), V(0.18, 0.25, 0.08), V(0.05, 0.05, 0.02), V(0.24, -0.25, 0.1)].map((p) => p.applyAxisAngle(V(0, 1, 0), -a).add(V(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7)));
    kit.add(P.tube(points, 0.03, 12, 4), { color: '#fff7c8', emissive: 1, outline: 0, fixedColor: true });
  }
  return kit.build();
}

function typhoonTrim50(): THREE.BufferGeometry {
  // Earned at 50: an outer rain band trailing streaks of rain.
  const kit = new Kit();
  for (let i = 0; i < 30; i += 1) {
    const a = (i / 30) * Math.PI * 2;
    kit.add(P.sphere(0.22, 10, 6), { color: '#c9d1df', gloss: 0.08, outline: 0.4, fixedColor: true, matrix: at(Math.cos(a) * 3.55, 0.02, Math.sin(a) * 3.55, [0, -a, 0], [1.3, 0.45, 0.8]) });
    if (i % 2 === 0) kit.add(P.box(0.015, 0.7, 0.015, 0.005, 1), { color: '#a9c4e8', emissive: 0.2, outline: 0, fixedColor: true, matrix: at(Math.cos(a) * 3.55, -0.4, Math.sin(a) * 3.55) });
  }
  return kit.build();
}

function typhoonTrim100(): THREE.BufferGeometry {
  // Earned at 100, its gold milestone: a gilded eye ringed with golden popcorn.
  const kit = new Kit();
  kit.add(P.torus(0.5, 0.06, 8, 32), { ...GOLD, emissive: 0.25, matrix: at(0, 0.12, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    puffs(kit, Math.cos(a) * 0.95, 0.55, Math.sin(a) * 0.95, 0.06, 0.06, 1, 0.08, 71 + i, { ...M.popcorn, color: '#ffd45e', emissive: 0.5 });
  }
  return kit.build();
}

export const SHOWPIECES: Record<'organ' | 'train' | 'typhoon', UnitDef> = {
  organ: {
    parts: [organBody, ...PIPES.map((_, i) => organPipe(i)), organPlume, organSpark, organTrim25, organTrim50],
    shadowParts: 10,
    inkParts: 10,
    interval: [1.8, 3],
    muzzle: [0, CHEST_TOP + 2.2, PIPE_Z],
    signs: [{ text: SIGN_TEXT.organ, style: { background: '#2a1018', color: '#ffd26e', border: '#e9bf5c', glow: 0.6, aspect: 4.2 }, width: 0.84, height: 0.2, matrix: at(0, 0.72, 0.605) }],
    badge: { at: [0, 0.36, 0.61], size: 0.32 },
    pose(st, time, index, tier, base, put) {
      put(0, base);
      // Pipes rise into place one after another when it first comes up.
      const rising = st.enter < 1 ? st.age : 9;
      const beat = time * NOTES_PER_SECOND + index * 1.7;
      const note = MELODY[Math.floor(beat) % MELODY.length]!;
      const phase = beat - Math.floor(beat);
      const chord = st.kick * st.kick;
      PIPES.forEach((pipe, i) => {
        const grow = smooth(0.7 + i * 0.06, 0.95 + i * 0.06, rising);
        const sounding = i === note ? (1 - phase) ** 2 : 0;
        const stretch = 1 + 0.06 * sounding + 0.1 * chord + windUp(st, 0.75) * 0.015 * Math.sin(time * 40 + i);
        putLocal(base, put, 1 + i, pipe.x, CHEST_TOP, PIPE_Z, 0, 0, 0, 1, Math.max(0.001, grow * stretch), 1);
      });
      const pipe = PIPES[note]!;
      const plume = Math.sin(Math.min(1, phase * 1.3) * Math.PI) * (st.enter < 1 ? 0 : 1);
      putLocal(base, put, 10, pipe.x, CHEST_TOP + pipe.height + 0.12 + phase * 0.45, PIPE_Z, 0, time, 0, Math.max(0.001, plume * (1 + chord)));
      putLocal(base, put, 11, pipe.x, CHEST_TOP - 0.2, PIPE_Z + 0.36, 0, 0, 0, 1 + (1 - phase) * 0.5);
      putIf(put, 12, tier >= 1, base);
      putIf(put, 13, tier >= 2, base);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.sparkle(x, y - 0.6 * s, z, 0.4 * s);
      host.sound('work-organ');
    },
  },
  train: {
    // The wagons ride on two of the loco's driver axles, scaled down, rather than axles of their own.
    parts: [locoBody, wagonBody, axle(DRIVER_R, M.red, 12), axle(DRIVER_R, M.red, 12), axle(DRIVER_R, M.red, 12), locoRods, locoTrim25, wagonTrim25, locoTrim50, wagonTrim50],
    shadowParts: 2,
    inkParts: 2,
    interval: [1.4, 2.6],
    tints: ['#ffffff', '#ffd36a', '#8fe0c8', '#8cc4ff', '#ffa9a0', '#e7d4ff'],
    muzzle: [1.0, 1.7, 0],
    signs: [
      { text: SIGN_TEXT.train, style: { background: '#2a1018', color: '#ffd26e', aspect: 2.9 }, width: 0.56, height: 0.18, matrix: at(-1.05, 0.9, 0.454), part: 0 },
      { text: SIGN_TEXT.popcorn, style: { background: '#fff0d4', color: '#a9202d', aspect: 3.2 }, width: 0.72, height: 0.2, matrix: at(0.3, 0.78, 0.434), part: 1 },
    ],
    badge: { at: [-0.6, 0.86, 0.47], size: 0.24 },
    track: trainTrack,
    pose(st, _time, index, tier, base, put) {
      const loco = index === 0;
      put(0, loco ? base : HIDDEN);
      put(1, loco ? HIDDEN : base);
      const drive = st.travel / DRIVER_R;
      const roll = st.travel / BOGIE_R;
      const small = BOGIE_R / DRIVER_R;
      DRIVERS.forEach((x, i) => {
        if (loco) putLocal(base, put, 2 + i, x, DRIVER_R, 0, 0, 0, -drive);
        else if (i < BOGIES.length) putLocal(base, put, 2 + i, BOGIES[i]!, BOGIE_R, 0, 0, 0, -roll, small, small, 1);
        else put(2 + i, HIDDEN);
      });
      // The rods ride the crank pins round, staying level.
      if (loco) putLocal(base, put, 5, (DRIVERS[0]! + DRIVERS[2]!) / 2 + Math.sin(drive) * CRANK, DRIVER_R + Math.cos(drive) * CRANK, 0);
      else put(5, HIDDEN);
      putIf(put, 6, loco && tier >= 1, base);
      putIf(put, 7, !loco && tier >= 1, base);
      putIf(put, 8, loco && tier >= 2, base);
      putIf(put, 9, !loco && tier >= 2, base);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.smoke(x, y, z, 0.45 * s);
      if (host.rng.next() < 0.35) host.sound('work-train');
    },
  },
  typhoon: {
    parts: [typhoonArms, typhoonEyewall, typhoonEye, typhoonPopcorn, typhoonTrim25, typhoonTrim50, typhoonTrim100],
    shadowParts: 2,
    inkParts: 2,
    interval: [1.2, 2.2],
    muzzle: [2.6, HOVER + 0.5, 0],
    pose(st, time, index, tier, base, put) {
      const bob = Math.sin(time * 0.9 + index) * 0.06;
      // Spins counter-clockwise, faster toward the eye; a throw flares the bands for a moment.
      const flare = 1 + 0.12 * st.kick * st.kick;
      putLocal(base, put, 0, 0, HOVER + bob, 0, 0, st.spin * 0.3, 0, flare, 1, flare);
      putLocal(base, put, 1, 0, HOVER + bob, 0, 0, st.spin * 0.75, 0);
      const pulse = 1 + 0.08 * Math.sin(time * 3 + index) + 0.3 * st.kick;
      putLocal(base, put, 2, 0, HOVER + bob + 0.05, 0, 0, 0, 0, pulse, 1, pulse);
      const fling = 1 + 0.55 * st.kick + windUp(st) * 0.08;
      putLocal(base, put, 3, 0, HOVER + bob + Math.sin(time * 2 + index) * 0.08, 0, 0, st.spin * 1.4, 0, fling, 1, fling);
      // Lightning only in flashes.
      const strike = tier >= 1 && Math.sin(time * 7.3 + index * 2.1) * Math.sin(time * 3.1) > 0.7;
      if (strike) putLocal(base, put, 4, 0, HOVER + bob, 0, 0, st.spin * 0.3, 0);
      else put(4, HIDDEN);
      if (tier >= 2) putLocal(base, put, 5, 0, HOVER + bob - 0.1, 0, 0, st.spin * 0.18, 0);
      else put(5, HIDDEN);
      if (tier >= 3) putLocal(base, put, 6, 0, HOVER + bob, 0, 0, -st.spin * 0.5, 0);
      else put(6, HIDDEN);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      if (host.rng.next() < 0.4) host.sound('work-typhoon');
      host.smoke(x, y, z, 0.6 * s);
    },
  },
};

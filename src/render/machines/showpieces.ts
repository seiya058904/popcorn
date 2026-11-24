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
  // Plinth, Art Deco fluted lacquered console with gold pilasters, and stepped pipe chest behind it.
  kit.add(P.box(2.44, 0.11, 1.24, 0.04, 1), { ...wood, matrix: at(0, 0.055, 0.12) });
  kit.add(P.box(2.2, 0.98, 1.0, 0.12, 3), { ...LACQUER, ao: (p) => 0.72 + 0.28 * smooth(0.1, 0.8, p.y), matrix: at(0, 0.58, 0.1) });
  // Art Deco fluted console pilasters and horizontal gold trim bands.
  for (const x of [-1.09, 1.09]) {
    kit.add(P.box(0.11, 1.0, 0.13, 0.025, 1), { ...LACQUER, matrix: at(x, 0.58, 0.57) });
    for (const dx of [-0.028, 0, 0.028]) {
      kit.add(P.slab(0.014, 0.92, 0.02), { ...GOLD, outline: 0, detail: 1, matrix: at(x + dx, 0.58, 0.638) });
    }
    kit.add(P.box(0.14, 0.055, 0.16, 0.015, 1), { ...GOLD, outline: 0.25, matrix: at(x, 1.09, 0.57) });
  }
  for (const z of [0.6, -0.4]) kit.add(P.slab(2.22, 0.036, 0.036), { ...GOLD, outline: 0, matrix: at(0, 1.07, z) });
  kit.add(P.box(2.62, 0.46, 0.64, 0.05, 2), { ...wood, matrix: at(0, CHEST_TOP - 0.23, PIPE_Z) });
  kit.add(P.box(2.68, 0.06, 0.7, 0.02, 1), { ...GOLD, matrix: at(0, CHEST_TOP, PIPE_Z) });
  // Front-rank Trompette flared brass fanfare pipes projecting horizontally from the chest fascia.
  for (const x of [-0.72, -0.36, 0.36, 0.72]) {
    kit.add(P.lathe([[0, 0], [0.02, 0], [0.024, 0.24], [0.068, 0.38], [0.056, 0.38], [0.018, 0.22], [0, 0.04]], 12, 0.006, 1), {
      ...GOLD,
      outline: 0.2,
      detail: 1,
      matrix: at(x, CHEST_TOP - 0.08, PIPE_Z + 0.3, [Math.PI / 2 + 0.14, 0, 0]),
    });
  }
  // Two stepped manuals with lightweight P.slab black accidentals.
  ([[0.86, 0.66], [0.97, 0.46]] as const).forEach(([y, z]) => {
    kit.add(P.box(1.62, 0.05, 0.26, 0.012, 1), { color: '#fbf2e0', gloss: 0.7, coat: 0.4, outline: 0.4, fixedColor: true, matrix: at(0, y, z) });
    for (let i = 0; i < 23; i += 1) {
      if ([2, 6, 9, 13, 16, 20].includes(i)) continue;
      kit.add(P.slab(0.032, 0.034, 0.15), { ...M.dark, outline: 0, detail: 1, matrix: at(-0.76 + i * 0.069, y + 0.034, z - 0.05) });
    }
  });
  for (const x of [-0.85, 0.85]) kit.add(P.box(0.08, 0.21, 0.52, 0.02, 1), { ...wood, matrix: at(x, 0.98, 0.55) });
  // Curved horseshoe bolster rail carrying stop tabs in cream, red and ebony.
  kit.add(P.torus(0.92, 0.038, 6, 26, Math.PI * 0.86), { ...wood, outline: 0.25, matrix: at(0, 1.1, 0.62, [Math.PI / 2, 0, Math.PI * 1.07]) });
  for (let i = 0; i < 16; i += 1) {
    const u = i / 15 - 0.5;
    const color = ['#fbf2e0', '#d8313a', '#fbf2e0', '#2c2630'][i % 4]!;
    kit.add(P.slab(0.068, 0.028, 0.095), { color, gloss: 0.8, coat: 0.4, outline: 0.2, fixedColor: true, detail: 1, matrix: at(u * 1.66, 1.135, 0.28 - u * u * 0.48, [0.35, u * 1.2, 0]) });
  }
  // Music desk with sheet music and a retro brass & emerald-glass banker's lamp.
  kit.add(P.box(0.94, 0.5, 0.04, 0.02, 1), { ...wood, matrix: at(0, 1.36, 0.22, [-0.28, 0, 0]) });
  kit.add(P.slab(0.68, 0.42, 0.012), { ...PAPER, matrix: at(0, 1.37, 0.25, [-0.28, 0, 0]) });
  for (let row = 0; row < 4; row += 1) kit.add(P.slab(0.56, 0.008, 0.004), { ...M.dark, outline: 0, detail: 2, matrix: at(0, 1.5 - row * 0.09, 0.27 - row * 0.025, [-0.28, 0, 0]) });
  // Banker's music lamp perched atop the music desk.
  for (const dx of [-0.18, 0.18]) rod(kit, V(dx, 1.56, 0.14), V(dx, 1.68, 0.24), 0.012, GOLD, 5);
  kit.add(P.capsule(0.046, 0.36, 4, 10), { color: '#1f8a58', gloss: 0.9, coat: 0.6, outline: 0.25, fixedColor: true, matrix: at(0, 1.69, 0.25, [0, 0, Math.PI / 2]) });
  kit.add(P.slab(0.32, 0.02, 0.04), { ...M.bulb, matrix: at(0, 1.648, 0.255) });
  // Pedalboard + two brass-trimmed swell expression shoes + tufted leather bench.
  for (let i = 0; i < 11; i += 1) kit.add(P.slab(0.078, 0.038, 0.44), { ...(i % 3 === 1 ? M.dark : M.wood), outline: 0.25, matrix: at(-0.55 + i * 0.11, 0.08, 0.86) });
  for (const x of [-0.14, 0.14]) {
    kit.add(P.box(0.16, 0.04, 0.26, 0.012, 1), { ...M.darkIron, matrix: at(x, 0.24, 0.68, [0.42, 0, 0]) });
    kit.add(P.slab(0.12, 0.01, 0.2), { ...GOLD, outline: 0, detail: 1, matrix: at(x, 0.262, 0.69, [0.42, 0, 0]) });
  }
  kit.add(P.box(1.24, 0.13, 0.4, 0.06, 2), { ...LEATHER, matrix: at(0, 0.62, 1.2) });
  for (const x of [-0.52, 0.52]) for (const z of [1.06, 1.34]) kit.add(P.box(0.06, 0.56, 0.06, 0.015, 1), { ...wood, matrix: at(x, 0.28, z) });
  rivets(kit, V(-0.55, 0.69, 1.4), V(0.55, 0.69, 1.4), 9, 0.016, M.brass);
  // A row of bulbs along the chest; the lit one runs with the tune.
  for (let i = 0; i < 9; i += 1) kit.add(P.sphere(0.04, 8, 6), { color: '#ffe6b0', emissive: 0.35, outline: 0, fixedColor: true, matrix: at(PIPES[i]!.x, CHEST_TOP - 0.22, PIPE_Z + 0.33) });
  return kit.build();
}

/** One sculpted flue pipe, its foot at the origin: conical foot, beveled upper labium lip, mouth cavity, ears, and tuning scroll. */
function organPipe(index: number): () => THREE.BufferGeometry {
  return () => {
    const { height, radius } = PIPES[index]!;
    const kit = new Kit();
    const mouthY = height * 0.2;
    kit.add(
      P.lathe(
        [
          [0, 0],
          [radius * 0.34, 0],
          [radius * 0.96, mouthY - 0.02],
          [radius * 1.03, mouthY],
          [radius, mouthY + 0.02],
          [radius, height],
          [radius * 0.82, height],
          [radius * 0.82, mouthY + 0.04],
          [0, mouthY],
        ],
        18,
        0.01,
        2,
      ),
      { ...GOLD, ao: (p) => 0.74 + 0.26 * smooth(0, height * 0.5, p.y) },
    );
    // Recessed dark windway mouth cavity.
    kit.add(P.slab(radius * 1.06, height * 0.055, 0.022), { ...M.dark, outline: 0, matrix: at(0, mouthY + height * 0.036, radius * 0.94) });
    // Slanted bevel upper lip (Labium) & flat lower lip shelf.
    kit.add(P.slab(radius * 1.12, height * 0.052, 0.016), { ...GOLD, gloss: 0.95, outline: 0, matrix: at(0, mouthY + height * 0.075, radius * 0.96, [0.34, 0, 0]) });
    kit.add(P.slab(radius * 1.12, 0.02, 0.026), { ...GOLD, outline: 0, matrix: at(0, mouthY + 0.004, radius * 0.96) });
    // Protective side ears (Ears) flanking the flue mouth.
    for (const side of [-1, 1]) {
      kit.add(P.slab(0.014, height * 0.1, 0.042), { ...GOLD, outline: 0, detail: 1, matrix: at(side * radius * 0.58, mouthY + height * 0.052, radius * 0.97) });
    }
    // Tuning collar ring at the top of the pipe.
    kit.add(P.torus(radius * 1.02, 0.012, 5, 16), { ...GOLD, outline: 0, matrix: at(0, height - 0.05, 0, [Math.PI / 2, 0, 0]) });
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
  // Main chassis frame, running boards and front/rear buffer beams with twin spring buffers.
  kit.add(P.box(2.94, 0.18, 0.66, 0.04, 1), { ...M.darkIron, matrix: at(0.05, 0.42, 0) });
  for (const z of [-0.42, 0.42]) kit.add(P.slab(2.12, 0.032, 0.14), { ...M.steel, pattern: Pattern.Tread + 0.2, matrix: at(0.25, 0.56, z) });
  for (const x of [1.54, -1.44]) {
    kit.add(P.slab(0.07, 0.14, 0.84), { ...M.red, outline: 0.35, matrix: at(x, 0.4, 0) });
    const dir = x > 0 ? 1 : -1;
    for (const z of [-0.28, 0.28]) {
      rod(kit, V(x, 0.4, z), V(x + dir * 0.11, 0.4, z), 0.042, M.steel, 6);
    }
  }
  // Steam cylinders with brass end caps + crosshead slide bars on both sides of the front chassis.
  for (const side of [-1, 1]) {
    const z = side * (GAUGE + 0.14);
    kit.add(P.puck(0.145, 0.145, 0.46, 12, 0.015), { ...M.darkIron, matrix: at(0.95, 0.34, z, [0, 0, -Math.PI / 2]) });
    for (const cx of [0.95, 1.41]) kit.add(P.torus(0.146, 0.016, 4, 12), { ...M.brass, outline: 0, matrix: at(cx, 0.34, z, [0, Math.PI / 2, 0]) });
    // Upper and lower steel slide bars for the piston crosshead.
    for (const dy of [-0.045, 0.045]) kit.add(P.slab(0.46, 0.018, 0.022), { ...M.steel, outline: 0, matrix: at(0.74, 0.34 + dy, z) });
    kit.add(P.slab(0.12, 0.085, 0.045), { ...M.brass, outline: 0, matrix: at(0.76, 0.34, z) });
  }
  // Boiler, banded in brass, with boiler handrails on stanchions, smokebox and smokebox door.
  kit.add(P.puck(0.38, 0.38, 1.7, 18, 0.02), { ...boiler, matrix: at(-0.5, 0.92, 0, [0, 0, -Math.PI / 2]) });
  for (const x of [-0.25, 0.3, 0.85]) kit.add(P.torus(0.388, 0.02, 4, 18), { ...M.brass, outline: 0, matrix: at(x, 0.92, 0, [0, Math.PI / 2, 0]) });
  for (const side of [-1, 1]) {
    rod(kit, V(-0.46, 1.06, side * 0.41), V(1.26, 1.06, side * 0.41), 0.012, M.brass, 4);
    for (const x of [-0.25, 0.3, 0.85]) rod(kit, V(x, 1.04, side * 0.35), V(x, 1.06, side * 0.41), 0.01, M.brass, 4);
  }
  kit.add(P.puck(0.41, 0.41, 0.34, 18, 0.03), { ...M.darkIron, matrix: at(1.18, 0.92, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.34, 0.3, 0.06, 16, 0.02), { ...M.darkIron, gloss: 0.6, matrix: at(1.5, 0.92, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.sphere(0.042, 7, 5), { ...M.brass, matrix: at(1.58, 0.92, 0) });
  for (const y of [0.78, 1.06]) kit.add(P.slab(0.02, 0.024, 0.38), { ...M.brass, outline: 0, matrix: at(1.565, y, 0) });
  // Flared smokestack, brass steam dome, sand dome, and brass steam whistle.
  kit.add(P.lathe([[0.1, 0], [0.12, 0], [0.12, 0.28], [0.22, 0.5], [0.2, 0.52], [0.09, 0.32], [0.08, 0.02]], 14, 0.02, 1), { ...M.darkIron, matrix: at(1.2, 1.26, 0) });
  kit.add(P.torus(0.21, 0.02, 4, 14), { ...M.brass, outline: 0, matrix: at(1.2, 1.77, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.lathe([[0, 0], [0.18, 0], [0.18, 0.12], [0.12, 0.24], [0, 0.27]], 12, 0.04, 1), { ...M.brass, matrix: at(0.5, 1.26, 0) });
  kit.add(P.lathe([[0, 0], [0.15, 0], [0.15, 0.1], [0.1, 0.2], [0, 0.22]], 12, 0.04, 1), { ...boiler, matrix: at(-0.05, 1.26, 0) });
  rod(kit, V(-0.34, 1.26, 0.08), V(-0.34, 1.46, 0.08), 0.032, M.brass, 6);
  // Vintage brass-hooded headlamp with visor shroud and warm glowing lens.
  kit.add(P.puck(0.115, 0.115, 0.22, 10, 0.015), { ...M.darkIron, matrix: at(1.34, 1.44, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.torus(0.116, 0.018, 4, 12), { ...M.brass, outline: 0, matrix: at(1.56, 1.44, 0, [0, Math.PI / 2, 0]) });
  kit.add(P.slab(0.08, 0.022, 0.18), { ...M.brass, outline: 0, matrix: at(1.58, 1.545, 0, [0, 0, -0.15]) });
  rod(kit, V(1.54, 1.44, 0), V(1.57, 1.44, 0), 0.09, M.bulb, 10);
  // Classic V-shaped diagonal-slatted cast-iron cowcatcher (replaces the 5 floating pink sticks!).
  const cowZ = [0, -0.11, 0.11, -0.22, 0.22, -0.32, 0.32];
  for (const z of cowZ) {
    const tipX = 1.94 - Math.abs(z) * 0.95;
    rod(kit, V(1.55, 0.34, z), V(tipX, 0.06, z * 0.72), 0.018, M.darkIron, 4);
  }
  // V-shaped base shoe rails + red nose wedge tip.
  for (const side of [-1, 1]) {
    rod(kit, V(1.55, 0.06, side * 0.36), V(1.96, 0.06, 0), 0.024, M.darkIron, 5);
    rod(kit, V(1.55, 0.34, side * 0.34), V(1.55, 0.06, side * 0.36), 0.022, M.darkIron, 4);
  }
  kit.add(P.slab(0.06, 0.07, 0.06), { ...M.red, outline: 0, matrix: at(1.94, 0.07, 0, [0, Math.PI / 4, 0]) });
  // Locomotive cab with mullioned side/front windows, clerestory roof ventilator, and brass trim.
  kit.add(P.box(0.95, 0.86, 0.9, 0.05, 1), { ...M.red, matrix: at(-0.95, 1.12, 0) });
  for (const z of [-0.452, 0.452]) {
    kit.add(P.slab(0.36, 0.32, 0.02), { ...M.windowPane, matrix: at(-0.78, 1.28, z) });
    kit.add(P.slab(0.022, 0.32, 0.028), { ...M.brass, outline: 0, matrix: at(-0.78, 1.28, z) });
    kit.add(P.slab(0.36, 0.022, 0.028), { ...M.brass, outline: 0, matrix: at(-0.78, 1.28, z) });
  }
  for (const z of [-0.22, 0.22]) kit.add(P.slab(0.02, 0.26, 0.24), { ...M.windowPane, matrix: at(-0.47, 1.3, z) });
  kit.add(P.box(1.14, 0.07, 1.06, 0.03, 1), { ...M.darkIron, matrix: at(-0.95, 1.58, 0) });
  kit.add(P.slab(0.68, 0.07, 0.52), { ...M.darkIron, outline: 0.3, matrix: at(-0.95, 1.64, 0) });
  kit.add(P.slab(0.74, 0.03, 0.58), { ...M.brass, outline: 0, matrix: at(-0.95, 1.68, 0) });
  for (const z of [-0.454, 0.454]) kit.add(P.slab(0.62, 0.03, 0.024), { ...M.brass, outline: 0, matrix: at(-0.95, 0.72, z) });
  // Coupler at the back.
  kit.add(P.slab(0.2, 0.08, 0.14), { ...M.darkIron, matrix: at(-1.48, 0.38, 0) });
  return kit.build();
}

/** An open wagon heaped with sculpted popcorn; lightweight P.slab trim keeps 12-car scene budget lean. */
function wagonBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.3, 0.14, 0.66, 0.035, 1), { ...M.darkIron, matrix: at(0, 0.42, 0) });
  for (const x of BOGIES) kit.add(P.slab(0.62, 0.14, 0.74), { ...M.darkIron, matrix: at(x, 0.26, 0) });
  const paintCoat = { color: '#ffffff', gloss: 0.82, coat: 0.45, pattern: Pattern.Enamel, wear: 0.3 };
  kit.add(P.box(2.2, 0.56, 0.86, 0.05, 1), { ...paintCoat, matrix: at(0, 0.78, 0) });
  // Cream trim bands, corner posts, floor tread plate and end buffers (all lightweight P.slab).
  for (const y of [0.56, 1.0]) kit.add(P.slab(2.24, 0.058, 0.9), { ...M.cream, outline: 0.25, matrix: at(0, y, 0) });
  for (const x of [-1.06, 1.06]) for (const z of [-0.41, 0.41]) kit.add(P.slab(0.08, 0.6, 0.08), { ...M.darkIron, matrix: at(x, 0.78, z) });
  kit.add(P.slab(2.1, 0.02, 0.78), { ...M.steel, pattern: Pattern.Tread + 0.2, outline: 0, matrix: at(0, 1.03, 0) });
  // Overflowing load of true sculpted miniature popcorn.
  puffs(kit, 0, 1.02, 0, 0.9, 0.34, 10, 0.155, 51);
  for (const x of [-1.24, 1.24]) kit.add(P.slab(0.18, 0.07, 0.12), { ...M.darkIron, matrix: at(x, 0.38, 0) });
  return kit.build();
}

/**
 * A pair of wheels on an axle, centered on it; spokes use lightweight P.slab (12 tris vs 108 tris)
 * because 18 train cars multiply every triangle across passes.
 */
function axle(radius: number, rim: Paint, spokes: number): () => THREE.BufferGeometry {
  return () => {
    const kit = new Kit();
    rod(kit, V(0, 0, -GAUGE - 0.06), V(0, 0, GAUGE + 0.06), 0.03, M.steel, 6);
    for (const side of [-1, 1]) {
      const z = side * GAUGE;
      kit.add(P.torus(radius, radius * 0.08, 4, 14), { ...M.steel, matrix: at(0, 0, z) });
      kit.add(P.torus(radius * 0.86, radius * 0.055, 4, 14), { ...rim, outline: 0.4, matrix: at(0, 0, z) });
      for (let i = 0; i < spokes / 2; i += 1) {
        kit.add(P.slab(radius * 1.7, radius * 0.065, radius * 0.045), { ...rim, outline: 0, matrix: at(0, 0, z, [0, 0, (i / (spokes / 2)) * Math.PI]) });
      }
      rod(kit, V(0, 0, z - side * 0.05), V(0, 0, z + side * 0.14), radius * 0.18, M.brass, 6);
    }
    return kit.build();
  };
}

/** Coupling rods + eccentric drive link extending to the front steam cylinder crosshead. */
function locoRods(): THREE.BufferGeometry {
  const kit = new Kit();
  const span = DRIVERS[2]! - DRIVERS[0]!;
  for (const side of [-1, 1]) {
    const z = side * (GAUGE + 0.1);
    kit.add(P.slab(span + 0.14, 0.052, 0.03), { ...M.steel, matrix: at(0, 0, z) });
    // Main connecting rod reaching forward toward the steam cylinder crosshead.
    kit.add(P.slab(0.42, 0.036, 0.024), { ...M.steel, outline: 0, matrix: at(span * 0.5 + 0.22, 0.02, z + side * 0.028, [0, 0, 0.08]) });
    for (const x of DRIVERS) {
      const px = x - (DRIVERS[0]! + span / 2);
      rod(kit, V(px, 0, z), V(px, 0, z + side * 0.045), 0.038, { ...M.brass, outline: 0 }, 6);
    }
  }
  return kit.build();
}

function locoTrim25(): THREE.BufferGeometry {
  // Earned at 25: a brass bell on a yoke, pennants on the smokebox and a gold stripe.
  const kit = new Kit();
  rod(kit, V(0.2, 1.3, -0.1), V(0.2, 1.48, -0.1), 0.015, M.brass, 5);
  rod(kit, V(0.2, 1.3, 0.1), V(0.2, 1.48, 0.1), 0.015, M.brass, 5);
  kit.add(P.lathe([[0, 0], [0.1, 0], [0.09, 0.04], [0.06, 0.14], [0, 0.16]], 14, 0.015, 2), { ...M.brass, matrix: at(0.2, 1.26, 0) });
  for (const z of [-0.3, 0.3]) {
    rod(kit, V(1.5, 1.2, z), V(1.5, 1.55, z), 0.01, M.steel, 4);
    kit.add(P.slab(0.16, 0.1, 0.008), { ...M.canvasRed, sway: 0.22, matrix: at(1.42, 1.5, z) });
  }
  for (const z of [-0.39, 0.39]) kit.add(P.slab(1.66, 0.03, 0.01), { ...GOLD, outline: 0, matrix: at(0.35, 0.82, z) });
  return kit.build();
}

function wagonTrim25(): THREE.BufferGeometry {
  // Earned at 25: bunting strung along both sides (lightweight P.slab = 12 tris per pennant).
  const kit = new Kit();
  for (const z of [-0.47, 0.47]) {
    for (let i = 0; i < 8; i += 1) {
      const color = ['#d8313a', '#ffc63f', '#2b9c93', '#3d6fd6'][i % 4]!;
      kit.add(P.slab(0.14, 0.12, 0.008), { color, gloss: 0.2, pattern: Pattern.Fabric, outline: 0.3, fixedColor: true, matrix: at(-0.95 + i * 0.27, 0.93, z, [0, 0, Math.PI / 4]) });
    }
  }
  return kit.build();
}

function locoTrim50(): THREE.BufferGeometry {
  // Earned at 50: a gilded nameboard over the cab and a second, gold-capped dome.
  const kit = new Kit();
  kit.add(P.slab(0.8, 0.14, 0.04), { ...GOLD, matrix: at(-0.95, 1.74, 0.3, [-0.2, 0, 0]) });
  kit.add(P.lathe([[0, 0], [0.13, 0], [0.13, 0.08], [0.08, 0.17], [0, 0.19]], 14, 0.03, 2), { ...GOLD, matrix: at(0.2, 1.26, 0) });
  return kit.build();
}

function wagonTrim50(): THREE.BufferGeometry {
  // Earned at 50: a striped canopy over the load (lightweight P.slab slats).
  const kit = new Kit();
  for (const x of [-1.0, 1.0]) for (const z of [-0.38, 0.38]) rod(kit, V(x, 1.0, z), V(x, 1.6, z), 0.016, M.brass, 4);
  for (let i = 0; i < 8; i += 1) {
    const cloth = i % 2 ? M.canvasCream : M.canvasRed;
    kit.add(P.slab(0.27, 0.025, 0.96), { ...cloth, outline: 0.3, matrix: at(-0.95 + i * 0.27, 1.62, 0) });
  }
  return kit.build();
}

/** Rails, sleepers and ballast along the loop, cut into pieces and yielded every 3 pieces to avoid build spikes. */
function* trainTrackSteps(path: UnitPath): Generator<void, THREE.BufferGeometry[], void> {
  const pieces = 36;
  const position = new THREE.Vector3();
  const along = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const shift = new THREE.Matrix4();
  const placedM = new THREE.Matrix4();
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
  const out: THREE.BufferGeometry[] = [];
  for (let piece = 0; piece < pieces; piece += 1) {
    const kit = new Kit();
    const start = (piece / pieces) * path.length;
    const end = ((piece + 1) / pieces) * path.length;
    const step = 0.52 * path.scale;
    for (let d = start; d < end - 1e-3; d += step) {
      const base = placed(d + step / 2, 0, basis);
      kit.add(P.slab(step * 1.02, 0.08 * path.scale, gauge * 3.4), { ...ballast, matrix: placedM.multiplyMatrices(base, shift.makeTranslation(0, -0.1 * path.scale, 0)) });
      kit.add(P.slab(0.16 * path.scale, 0.07 * path.scale, gauge * 2.7), { ...sleeper, matrix: placedM.multiplyMatrices(base, shift.makeTranslation(0, -0.04 * path.scale, 0)) });
    }
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const m = placed(start + ((end - start) * i) / 6, 0, basis);
        points.push(new THREE.Vector3(0, 0, side * gauge).applyMatrix4(m));
      }
      kit.add(P.tube(points, 0.035 * path.scale, 10, 5), { ...M.steel, outline: 0.5 });
    }
    out.push(kit.build());
    if (piece % 3 === 2 && piece < pieces - 1) yield;
  }
  return out;
}

function trainTrack(path: UnitPath): THREE.BufferGeometry[] {
  const gen = trainTrackSteps(path);
  let res = gen.next();
  while (!res.done) res = gen.next();
  return res.value;
}

// Popcorn typhoon -------------------------------------------------------------------------

/** How high the storm deck floats over the sea, in its own units. */
const HOVER = 1.25;

const cloudTop = new THREE.Color('#fffaf2');
const cloudMid = new THREE.Color('#d2dceb');
const cloudBelly = new THREE.Color('#6f82a3');
const cloudSpray = new THREE.Color('#b6cce2');

/** Volumetric cumulonimbus paint: deep slate storm belly rising smoothly to sunlit ivory-white cloud tops. */
const cloud = (outline: number, heightBoost = 0): Parameters<Kit['add']>[1] => ({
  color: '#ffffff',
  gloss: 0.05,
  soft: 0.55,
  outline,
  fixedColor: true,
  colorFn: (p, n, out) => {
    const sky = smooth(-0.45, 0.65, n.y);
    const alt = smooth(-0.25, 1.15, p.y + heightBoost);
    out.lerpColors(cloudBelly, cloudMid, smooth(0, 0.65, sky * 0.65 + alt * 0.45));
    out.lerp(cloudTop, smooth(0.35, 0.95, sky * 0.6 + alt * 0.55));
  },
  ao: (p, n) => 0.72 + 0.28 * smooth(-0.5, 0.8, n.y * 0.6 + p.y * 0.45),
});

function typhoonArms(): THREE.BufferGeometry {
  const kit = new Kit();
  let seed = 77;
  const next = (): number => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  // Three sculptural cumulonimbus spiral bands climbing from low outer inflow up to towering anvil crests.
  // Interior puffs omit outlines so cauliflower lobes merge cleanly into lush 3D cloud volume.
  for (let arm = 0; arm < 3; arm += 1) {
    const start = (arm / 3) * Math.PI * 2;
    for (let i = 0; i < 24; i += 1) {
      const t = i / 23;
      const a = start + t * Math.PI * 1.52;
      const r = 0.85 + 2.1 * t ** 1.06;
      const climb = (1 - t) ** 0.75;
      const baseY = 0.04 + climb * 0.42;
      // Primary plump cauliflower turret along the spiral spine; elongates smoothly toward the outer wispy tip.
      const mainSize = (0.37 + next() * 0.09) * (1 - 0.44 * t);
      kit.add(P.sphere(mainSize, 9, 7), {
        ...cloud(i % 2 === 0 && t > 0.2 && t < 0.75 ? 0.14 : 0),
        matrix: at(
          Math.cos(a) * r,
          baseY + climb * 0.28 + (next() - 0.3) * 0.07,
          Math.sin(a) * r,
          [0, -a - Math.PI / 2, (next() - 0.5) * 0.16],
          [1.45 + t * 0.55, 0.84 + climb * 0.34 - t * 0.2, 0.96],
        ),
      });
      // Lower storm-belly bulge + upper sunlit cauliflower crown on inner/mid convective band.
      const subCount = t < 0.78 ? 2 : 1;
      for (let k = 0; k < subCount; k += 1) {
        const isTop = k === 0;
        const offR = (isTop ? -0.16 : 0.2) * (1 - t * 0.5) + (next() - 0.5) * 0.16;
        const rr = r + offR;
        const aa = a + (next() - 0.5) * 0.07;
        const size = mainSize * (isTop ? 0.72 + next() * 0.15 : 0.66 + next() * 0.16);
        const y = isTop ? baseY + climb * 0.52 + next() * 0.13 : baseY - 0.14 * climb + next() * 0.06;
        kit.add(P.sphere(size, 8, 6), {
          ...cloud(0, isTop ? 0.25 : -0.25),
          matrix: at(Math.cos(aa) * rr, y, Math.sin(aa) * rr, [0, -aa - Math.PI / 2, 0], [1.32 + t * 0.35, isTop ? 0.92 : 0.62, 0.94]),
        });
      }
    }
  }
  // Low brooding storm-base cloud shelf linking the inner bands underneath.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.add(P.sphere(0.46, 8, 6), {
      ...cloud(0, -0.45),
      matrix: at(Math.cos(a) * 1.18, -0.08, Math.sin(a) * 1.18, [0, -a, 0], [1.45, 0.42, 1.1]),
    });
  }
  return kit.build();
}

/** Towering stadium eyewall amphitheater with a twisting waterspout funnel reaching the sea. */
function typhoonEyewall(): THREE.BufferGeometry {
  const kit = new Kit();
  // Twisting sea-spray waterspout funnel descending from the eyewall base down to the ocean surface.
  kit.add(
    P.lathe(
      [
        [0.48, -1.16],
        [0.32, -1.04],
        [0.19, -0.78],
        [0.24, -0.44],
        [0.36, -0.14],
        [0.54, 0.18],
        [0.64, 0.46],
        [0.54, 0.46],
        [0.42, 0.14],
        [0.22, -0.22],
        [0.12, -0.75],
        [0.22, -1.08],
      ],
      28,
      0.04,
      2,
    ),
    {
      color: '#ffffff',
      gloss: 0.14,
      soft: 0.5,
      outline: 0.14,
      fixedColor: true,
      colorFn: (p, n, out) => {
        const up = smooth(-1.15, 0.45, p.y);
        out.lerpColors(cloudSpray, cloudBelly, smooth(0.15, 0.7, up));
        out.lerp(cloudMid, smooth(0.2, 0.9, n.y) * 0.45);
      },
      ao: (p) => 0.72 + 0.28 * smooth(-1.15, 0.35, p.y),
    },
  );
  // Frothy whitecap spray ring where the funnel kisses the sea.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.add(P.sphere(0.14 + (i % 3) * 0.025, 7, 5), {
      ...cloud(0, 0.3),
      matrix: at(Math.cos(a) * 0.44, -1.12, Math.sin(a) * 0.44, [0, -a, 0], [1.35, 0.55, 0.9]),
    });
  }
  // Towering double-tier eyewall amphitheater flaring outward into an anvil rim.
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const alt = (i % 2) * 0.08;
    // Lower inner wall.
    kit.add(P.sphere(0.32 + (i % 3) * 0.025, 9, 7), {
      ...cloud(0),
      matrix: at(Math.cos(a) * 0.64, 0.48 + alt, Math.sin(a) * 0.64, [0, -a, 0], [0.95, 1.18, 0.85]),
    });
    // Sunlit flaring upper anvil crown.
    const a2 = a + Math.PI / 16;
    kit.add(P.sphere(0.3 + ((i + 1) % 3) * 0.025, 8, 6), {
      ...cloud(i % 2 === 0 ? 0.14 : 0, 0.35),
      matrix: at(Math.cos(a2) * 0.84, 0.92 + (i % 2) * 0.07, Math.sin(a2) * 0.84, [0, -a2, 0], [1.22, 0.78, 0.92]),
    });
  }
  return kit.build();
}

/** The calm, glowing eye with a sculpted golden popcorn core hovering inside the amphitheater. */
function typhoonEye(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.36, 0.32, 0.05, 24, 0.015), { color: '#ffe8a8', emissive: 0.75, outline: 0, fixedColor: true, matrix: at(0, 0.38, 0) });
  kit.add(P.torus(0.34, 0.032, 6, 24), { color: '#ffcf66', emissive: 0.9, outline: 0, fixedColor: true, matrix: at(0, 0.44, 0, [Math.PI / 2, 0, 0]) });
  puffs(kit, 0, 0.56, 0, 0.02, 0.02, 1, 0.24, 69, { ...M.popcorn, color: '#ffe38a', emissive: 0.68 });
  return kit.build();
}

/** Sculpted popcorn flakes whirled up the spiral bands, ready to fling out. */
function typhoonPopcorn(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let arm = 0; arm < 3; arm += 1) {
    const base = (arm / 3) * Math.PI * 2 + 0.55;
    for (let j = 0; j < 5; j += 1) {
      const t = (j + 0.5) / 5;
      const a = base + t * Math.PI * 1.15;
      const r = 1.05 + t * 1.85;
      const y = 0.25 + (1 - t) * 0.88;
      puffs(kit, Math.cos(a) * r, y, Math.sin(a) * r, 0.14, 0.14, 1, 0.14 - t * 0.03, 61 + arm * 7 + j);
    }
  }
  return kit.build();
}

function typhoonTrim25(): THREE.BufferGeometry {
  // Earned at 25: 3D forked lightning arcs flashing from the upper anvil turrets down through the storm belly.
  const kit = new Kit();
  const bolt = { color: '#fff8cc', emissive: 1, outline: 0, fixedColor: true };
  for (const a of [0.8, 2.9, 4.9]) {
    const place = (pts: THREE.Vector3[]) =>
      pts.map((p) => p.applyAxisAngle(V(0, 1, 0), -a).add(V(Math.cos(a) * 1.65, 0, Math.sin(a) * 1.65)));
    kit.add(P.tube(place([V(-0.08, 0.88, -0.04), V(0.14, 0.48, 0.1), V(0.02, 0.16, -0.05), V(0.24, -0.28, 0.12), V(0.12, -0.68, 0.04)]), 0.032, 10, 4), bolt);
    // Secondary branch splitting off mid-bolt.
    kit.add(P.tube(place([V(0.14, 0.48, 0.1), V(0.38, 0.22, 0.26), V(0.52, -0.08, 0.2)]), 0.02, 6, 4), bolt);
    kit.add(P.tube(place([V(0.02, 0.16, -0.05), V(-0.22, -0.14, -0.18), V(-0.34, -0.42, -0.12)]), 0.018, 6, 4), bolt);
  }
  return kit.build();
}

function typhoonTrim50(): THREE.BufferGeometry {
  // Earned at 50: outer wispy cirrus streamers and slanted wind-driven rain curtains beneath the storm deck.
  const kit = new Kit();
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    // Swept cirrus wisp puffs at the storm perimeter.
    kit.add(P.sphere(0.19 + (i % 2) * 0.04, 7, 5), {
      ...cloud(0, 0.2),
      matrix: at(Math.cos(a) * 3.45, 0.12 + (i % 3) * 0.05, Math.sin(a) * 3.45, [0, -a - Math.PI / 2, 0.18], [1.85, 0.42, 0.65]),
    });
    // Wind-slanted rain streaks beneath the mid-outer rain bands (lightweight P.slab = 12 tris each).
    if (i % 2 === 0) {
      const rRain = 2.4 + (i % 4) * 0.26;
      kit.add(P.slab(0.022, 0.95, 0.022), {
        color: '#9fc4ee',
        emissive: 0.26,
        outline: 0,
        fixedColor: true,
        matrix: at(Math.cos(a) * rRain, -0.52, Math.sin(a) * rRain, [0, -a, -0.34]),
      });
    }
  }
  return kit.build();
}

function typhoonTrim100(): THREE.BufferGeometry {
  // Earned at 100, its gold milestone: an engraved golden crown ring around the anvil rim with sculpted golden popcorn.
  const kit = new Kit();
  kit.add(P.torus(0.98, 0.055, 8, 32), { ...GOLD, emissive: 0.25, matrix: at(0, 1.18, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.98, 0.024, 6, 32), { ...GOLD, emissive: 0.4, outline: 0, matrix: at(0, 1.26, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    kit.add(P.sphere(0.055, 7, 5), { ...GOLD, emissive: 0.35, outline: 0, matrix: at(Math.cos(a) * 0.98, 1.24, Math.sin(a) * 0.98) });
    puffs(kit, Math.cos(a + 0.39) * 1.18, 1.24, Math.sin(a + 0.39) * 1.18, 0.04, 0.04, 1, 0.11, 71 + i, { ...M.popcorn, color: '#ffd45e', emissive: 0.55 });
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
    parts: [locoBody, wagonBody, axle(DRIVER_R, M.red, 8), axle(DRIVER_R, M.red, 8), axle(DRIVER_R, M.red, 8), locoRods, locoTrim25, wagonTrim25, locoTrim50, wagonTrim50],
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
    trackSteps: trainTrackSteps,
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

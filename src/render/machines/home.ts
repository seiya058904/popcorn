import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { at, cycleOf, glassCase, HIDDEN, Kit, M, P, paint, Pattern, puffs, putIf, putLocal, rivets, rod, smooth, spokedWheel, V, windUp, type UnitDef, type UnitState } from './common.ts';
import { CART_STOPS, MICROWAVE_DOOR_OPENS, PAN_LID_LANDS } from './entrances.ts';

const LABEL = { color: '#fff4dc', gloss: 0.12, pattern: Pattern.Paper, outline: 0.4, fixedColor: true };

// Saucepan -----------------------------------------------------------------------

function panShell(): THREE.BufferGeometry {
  const kit = new Kit();
  // Enamel outside, clad copper base disc, and dark seasoned steel inside.
  kit.add(P.lathe([[0, 0], [0.61, 0], [0.66, 0.06], [0.675, 0.12]], 36, 0.02, 2), { ...M.copper, outline: 0.35 });
  kit.add(P.lathe([[0.672, 0.11], [0.7, 0.5], [0.74, 0.58], [0.71, 0.62]], 38, 0.03, 3), {
    color: '#ffffff',
    gloss: 0.86,
    coat: 0.55,
    pattern: Pattern.Enamel,
    wear: 0.25,
    ao: (p) => 0.7 + 0.3 * smooth(0.08, 0.32, p.y),
  });
  kit.add(P.lathe([[0.71, 0.62], [0.65, 0.57], [0.62, 0.14], [0, 0.11]], 36, 0.03, 2), { ...M.darkIron, gloss: 0.35, metal: 0.3, outline: 0, ao: (p) => 0.45 + 0.55 * smooth(0.1, 0.55, p.y) });
  kit.add(P.torus(0.725, 0.022, 7, 38), { ...M.steel, outline: 0, matrix: at(0, 0.6, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.67, 0.018, 6, 36), { ...M.brass, outline: 0, matrix: at(0, 0.11, 0, [Math.PI / 2, 0, 0]) });
  puffs(kit, 0, 0.2, 0, 0.42, 0.42, 6, 0.105, 3);
  // Riveted bracket, brass ferrule, bakelite heat-guard ring, and wooden grip with hanging hole.
  kit.add(P.box(0.2, 0.2, 0.17, 0.04, 2), { ...M.steel, matrix: at(0.75, 0.44, 0, [0, 0, -0.14]) });
  rivets(kit, V(0.72, 0.5, 0.09), V(0.72, 0.38, 0.09), 2, 0.024);
  kit.add(P.puck(0.075, 0.062, 0.18, 12, 0.01), { ...M.brass, matrix: at(0.86, 0.45, 0, [0, 0, -Math.PI / 2 - 0.14]) });
  kit.add(P.puck(0.076, 0.072, 0.045, 12, 0.01), { color: '#3b2118', gloss: 0.72, coat: 0.35, fixedColor: true, matrix: at(1.01, 0.47, 0, [0, 0, -Math.PI / 2 - 0.14]) });
  kit.add(P.capsule(0.066, 0.68, 4, 10), { ...M.wood, matrix: at(1.36, 0.525, 0, [0, 0, -Math.PI / 2 - 0.14]) });
  kit.add(P.torus(0.04, 0.012, 6, 14), { ...M.brass, outline: 0, detail: 1, matrix: at(1.74, 0.58, 0) });
  // Sculpted flared pouring spout on the far (-X) rim.
  kit.add(P.lathe([[0, 0], [0.11, 0], [0.08, 0.14], [0, 0.14]], 10, 0.015, 1), { ...M.steel, outline: 0.3, matrix: at(-0.71, 0.57, 0, [0, 0, Math.PI / 2 + 0.32], [1, 1, 1.35]) });
  // Paper price tag tied to the hanging ring and stamped maker's mark on the bracket.
  rod(kit, V(1.74, 0.55, 0), V(1.78, 0.42, 0.03), 0.004, M.dark, 4);
  kit.add(P.slab(0.13, 0.085, 0.006), { ...LABEL, detail: 1, matrix: at(1.79, 0.37, 0.04, [0.1, 0.4, 0.2]) });
  kit.add(P.slab(0.09, 0.05, 0.012), { ...M.brass, outline: 0, detail: 2, matrix: at(0.78, 0.44, 0.09, [0, 0, -0.14]) });
  return kit.build();
}

function panLid(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0.69, 0.005], [0.56, 0.06], [0.3, 0.14], [0, 0.17]], 32, 0.02, 2), { ...M.glassWarm, lens: 0.25, thickness: 0.05 });
  kit.add(P.torus(0.7, 0.026, 7, 36), { ...M.steel, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.1, 0.07, 0.05, 14, 0.01), { ...M.brass, matrix: at(0, 0.165, 0) });
  kit.add(P.sphere(0.09, 12, 9), { ...M.darkWood, gloss: 0.5, matrix: at(0, 0.28, 0, [0, 0, 0], [1, 0.85, 1]) });
  kit.add(P.torus(0.03, 0.009, 5, 10), { ...M.steel, outline: 0, detail: 2, matrix: at(0.38, 0.115, 0, [Math.PI / 2 - 0.3, 0, 0]) });
  return kit.build();
}

// Microwave ----------------------------------------------------------------------

const HINGE: [number, number, number] = [-1.0, 0.68, 0.565];

function microwaveBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const shell = paint(M.cream, {});
  // A real hollow oven: five walls around a lit cavity.
  kit.add(P.box(2.1, 0.07, 1.12, 0.03, 2), { ...shell, matrix: at(0, 1.25, 0) });
  kit.add(P.box(2.1, 0.07, 1.12, 0.03, 2), { ...shell, matrix: at(0, 0.11, 0) });
  kit.add(P.box(0.07, 1.2, 1.12, 0.03, 2), { ...shell, matrix: at(-1.015, 0.68, 0) });
  kit.add(P.box(0.56, 1.2, 1.12, 0.04, 2), { ...shell, matrix: at(0.77, 0.68, 0) });
  kit.add(P.slab(1.5, 1.14, 0.06), { color: '#ffd28d', emissive: 0.5, outline: 0, fixedColor: true, matrix: at(-0.25, 0.68, -0.5) });
  kit.add(P.slab(1.46, 0.02, 1), { color: '#fff0c8', emissive: 0.75, outline: 0, fixedColor: true, matrix: at(-0.25, 1.205, 0.02) });
  kit.add(P.slab(1.46, 0.02, 1), { color: '#c9a877', emissive: 0.2, outline: 0, fixedColor: true, matrix: at(-0.25, 0.155, 0.02) });
  // Vent slots along the top.
  for (let i = 0; i < 9; i += 1) kit.add(P.slab(0.11, 0.012, 0.42), { ...M.dark, detail: 1, matrix: at(-0.8 + i * 0.2, 1.288, -0.2) });
  // Control column with chrome surround bezel, digital screen, knurled timer dial, and tactile keypad.
  kit.add(P.box(0.46, 1.05, 0.022, 0.016, 1), { ...M.chrome, outline: 0.25, matrix: at(0.77, 0.68, 0.562) });
  kit.add(P.slab(0.43, 1.0, 0.03), { color: '#2f2c38', gloss: 0.5, outline: 0, fixedColor: true, matrix: at(0.77, 0.68, 0.568) });
  kit.add(P.slab(0.34, 0.15, 0.012), { color: '#6fe6b6', emissive: 0.95, outline: 0, fixedColor: true, matrix: at(0.77, 1.05, 0.586) });
  kit.add(P.puck(0.11, 0.1, 0.05, 18, 0.012), { ...M.chrome, pattern: Pattern.Knurl, matrix: at(0.77, 0.8, 0.585, [Math.PI / 2, 0, 0]) });
  // Perforated side vent grille + recipe note taped on top.
  kit.add(P.slab(0.012, 0.5, 0.62), { color: '#9aa0a8', gloss: 0.3, metal: 0.5, pattern: Pattern.Perforated + 0.55, outline: 0, fixedColor: true, detail: 1, matrix: at(1.053, 0.82, -0.12) });
  kit.add(P.slab(0.02, 0.56, 0.68), { ...M.chrome, outline: 0, detail: 1, matrix: at(1.049, 0.82, -0.12) });
  kit.add(P.slab(0.32, 0.006, 0.22), { ...LABEL, detail: 1, matrix: at(-0.62, 1.292, 0.28, [0, 0.22, 0]) });
  kit.add(P.slab(0.12, 0.008, 0.05), { color: '#f3e7b0', gloss: 0.5, outline: 0, fixedColor: true, detail: 2, matrix: at(-0.62, 1.295, 0.18, [0, 0.22, 0]) });
  kit.add(P.slab(0.018, 0.09, 0.012), { ...M.red, outline: 0, matrix: at(0.77, 0.84, 0.64) });
  // Raised micro-beveled 3x3 tactile keypad array with door-release bar beneath.
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      kit.add(P.box(0.08, 0.06, 0.026, 0.012, 1), { ...(row === 2 && column === 2 ? M.red : M.steel), outline: 0, detail: 1, matrix: at(0.66 + column * 0.11, 0.58 - row * 0.09, 0.59) });
    }
  }
  kit.add(P.box(0.32, 0.065, 0.032, 0.014, 1), { ...M.chrome, outline: 0.25, matrix: at(0.77, 0.27, 0.59) });
  for (const x of [-0.85, 0.85]) for (const z of [-0.4, 0.4]) kit.add(P.puck(0.075, 0.06, 0.08, 10, 0.012), { ...M.rubber, matrix: at(x, 0, z) });
  return kit.build();
}

/** The door, built around its hinge so it can swing, with chrome chamfer accent trim. */
function microwaveDoor(): THREE.BufferGeometry {
  const kit = new Kit();
  const frame = M.steel;
  for (const y of [-0.5, 0.5]) {
    kit.add(P.box(1.5, 0.1, 0.07, 0.03, 2), { ...frame, matrix: at(0.75, y, 0) });
    kit.add(P.slab(1.42, 0.022, 0.02), { ...M.chrome, outline: 0, matrix: at(0.75, y, 0.036) });
  }
  for (const x of [0.04, 1.46]) kit.add(P.box(0.09, 1.08, 0.07, 0.03, 2), { ...frame, matrix: at(x, 0, 0) });
  kit.add(P.slab(1.32, 0.92, 0.012), { ...M.glassWarm, matrix: at(0.75, 0, 0.005) });
  kit.add(P.capsule(0.032, 0.62, 3, 8), { ...M.chrome, matrix: at(1.36, 0, 0.105) });
  for (const y of [-0.27, 0.27]) kit.add(P.box(0.08, 0.055, 0.1, 0.014, 1), { ...M.chrome, outline: 0.2, matrix: at(1.36, y, 0.06) });
  return kit.build();
}

/** The turntable with roller ring, swollen crinkled paper popcorn bag, and bursting sculpted flakes. */
function microwaveTray(): THREE.BufferGeometry {
  const kit = new Kit();
  // Turntable roller support ring underneath the glass platter.
  kit.add(P.torus(0.26, 0.012, 5, 18), { ...M.steel, outline: 0, matrix: at(0, -0.375, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    kit.add(P.puck(0.022, 0.022, 0.016, 8, 0.004), { ...M.cream, outline: 0, detail: 1, matrix: at(Math.cos(a) * 0.26, -0.375, Math.sin(a) * 0.26, [Math.PI / 2, a, 0]) });
  }
  kit.add(P.puck(0.46, 0.46, 0.022, 26, 0.008), { color: '#d9ecf2', gloss: 1, coat: 0.6, outline: 0, fixedColor: true, matrix: at(0, -0.35, 0) });
  // Swollen crinkled microwave popcorn bag with crimped gusset end folds.
  const print = new THREE.Color('#d62f38');
  kit.add(P.box(0.62, 0.3, 0.46, 0.14, 3), { color: '#fff2d8', gloss: 0.2, emissive: 0.18, pattern: Pattern.Paper, outline: 0.35, fixedColor: true, matrix: at(0, -0.17, 0), colorFn: (p, _n, out) => { if (Math.abs(p.x) > 0.19) out.copy(print); } });
  // Pinched paper end-seal crimps on both sides of the pillowy bag.
  for (const sx of [-1, 1]) {
    kit.add(P.slab(0.06, 0.035, 0.44), { color: '#d62f38', gloss: 0.15, pattern: Pattern.Paper, outline: 0.25, fixedColor: true, matrix: at(sx * 0.33, -0.17, 0, [0, 0, sx * 0.22]) });
  }
  kit.add(P.slab(0.2, 0.012, 0.16), { color: '#ffc63f', gloss: 0.4, pattern: Pattern.Paper, outline: 0, fixedColor: true, detail: 1, matrix: at(0, -0.018, 0) });
  puffs(kit, 0, 0, 0, 0.2, 0.12, 6, 0.08, 8);
  return kit.build();
}

function microwaveTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a brass nameplate, a ring of gold and a little heat chimney.
  kit.add(P.slab(2.14, 0.035, 1.16), { ...M.brass, outline: 0, matrix: at(0, 1.3, 0) });
  kit.add(P.puck(0.14, 0.1, 0.34, 14, 0.02), { ...M.chrome, matrix: at(0.68, 1.31, -0.26) });
  kit.add(P.torus(0.14, 0.024, 6, 18), { ...M.brass, outline: 0, matrix: at(0.68, 1.65, -0.26, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

// Popcorn cart -------------------------------------------------------------------

function cartBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Tongue-and-groove cabinet in red and cream.
  for (let i = 0; i < 9; i += 1) {
    const stripe = i % 2 ? M.cream : M.red;
    kit.add(P.box(0.178, 0.74, 0.96, 0.022, 1), { ...stripe, outline: i === 0 || i === 8 ? 1 : 0.25, matrix: at(-0.712 + i * 0.178, 0.82, 0) });
  }
  kit.add(P.box(1.72, 0.07, 1.08, 0.025, 1), { ...M.brass, matrix: at(0, 1.22, 0) });
  kit.add(P.box(1.72, 0.08, 1.08, 0.025, 1), { ...M.steel, matrix: at(0, 0.43, 0) });
  rivets(kit, V(-0.8, 1.17, 0.49), V(0.8, 1.17, 0.49), 9, 0.016);
  rivets(kit, V(-0.8, 0.49, 0.49), V(0.8, 0.49, 0.49), 9, 0.016);
  // Glass case with warming tray deck, brass edge guard, and sculpted popcorn heap inside.
  glassCase(kit, 0, 1.25, 2.14, 0, 0.74, 0.44, M.brass, 0.05);
  kit.add(P.slab(1.5, 0.04, 0.86), { color: '#fff1c8', emissive: 0.3, outline: 0, fixedColor: true, matrix: at(0, 1.275, 0) });
  kit.add(P.slab(1.42, 0.012, 0.78), { ...M.brass, outline: 0, detail: 1, matrix: at(0, 1.298, 0) });
  puffs(kit, 0, 1.32, 0, 0.62, 0.34, 24, 0.105, 5);
  kit.add(P.box(1.56, 0.05, 0.92, 0.02, 1), { ...M.brass, matrix: at(0, 2.16, 0) });
  // Warm lamp under the awning.
  kit.add(P.sphere(0.07, 10, 8), { ...M.bulb, matrix: at(0.42, 2.06, 0) });
  kit.add(P.puck(0.1, 0.05, 0.05, 12, 0.01), { ...M.brass, outline: 0, matrix: at(0.42, 2.1, 0) });
  // Scalloped canvas awning with brass corner diagonal struts & gold tassel fringe beads.
  for (let i = 0; i < 9; i += 1) {
    const x = -0.92 + i * 0.23;
    const cloth = i % 2 ? M.canvasCream : M.canvasRed;
    for (const side of [-1, 1]) {
      kit.add(P.slab(0.226, 0.03, 0.8), { ...cloth, outline: 0.35, matrix: at(x, 2.42, side * 0.355, [side * 0.42, 0, 0]) });
      kit.add(P.sphere(0.113, 8, 5), { ...cloth, outline: 0.25, matrix: at(x, 2.255, side * 0.735, [0, 0, 0], [1, 0.58, 0.16]) });
      kit.add(P.sphere(0.022, 6, 4), { ...M.brass, outline: 0, detail: 2, matrix: at(x, 2.18, side * 0.74) });
    }
  }
  for (const sx of [-0.74, 0.74]) {
    for (const sz of [-1, 1]) rod(kit, V(sx, 1.98, sz * 0.44), V(sx, 2.28, sz * 0.68), 0.014, M.brass, 5);
  }
  kit.add(P.capsule(0.03, 2.05, 2, 8), { ...M.brass, matrix: at(0, 2.59, 0, [0, 0, Math.PI / 2]) });
  for (const x of [-1.1, 1.1]) kit.add(P.sphere(0.075, 10, 8), { ...M.brass, matrix: at(x, 2.59, 0) });
  // Big spoked wheels on an axle, caster, and push bar with brass mounting flanges.
  rod(kit, V(-0.32, 0.42, -0.62), V(-0.32, 0.42, 0.62), 0.025, M.iron);
  for (const side of [-1, 1]) spokedWheel(kit, -0.32, 0.42, side * 0.6, 0.38, M.butter, 10);
  kit.add(P.box(0.06, 0.3, 0.06, 0.02, 1), { ...M.iron, matrix: at(0.62, 0.26, 0) });
  kit.add(P.sphere(0.1, 10, 8), { ...M.rubber, matrix: at(0.62, 0.1, 0) });
  for (const z of [-0.38, 0.38]) kit.add(P.puck(0.055, 0.048, 0.04, 10, 0.008), { ...M.brass, outline: 0, matrix: at(0.81, 1.06, z, [0, 0, -Math.PI / 2]) });
  kit.add(P.tube([V(0.82, 1.06, -0.38), V(1.2, 1.26, -0.4), V(1.27, 1.32, -0.2), V(1.27, 1.32, 0.2), V(1.2, 1.26, 0.4), V(0.82, 1.06, 0.38)], 0.026, 22, 8), M.chrome);
  kit.add(P.capsule(0.04, 0.26, 3, 8), { ...M.rubber, matrix: at(1.27, 1.32, 0, [Math.PI / 2, 0, 0]) });
  // Scoop hanging on the end, price card, and tread-plate step.
  kit.add(P.sphere(0.075, 10, 6), { ...M.chrome, matrix: at(-0.92, 1.02, 0.2, [0, 0, 0], [1, 0.7, 1]) });
  rod(kit, V(-0.92, 1.04, 0.2), V(-0.9, 1.2, 0.2), 0.012, M.chrome, 5);
  kit.add(P.slab(0.3, 0.19, 0.006), { ...LABEL, detail: 1, matrix: at(0.48, 1.42, 0.42, [-0.25, 0, 0]) });
  for (let row = 0; row < 2; row += 1) kit.add(P.slab(0.2, 0.012, 0.004), { ...M.red, outline: 0, detail: 2, matrix: at(0.48, 1.46 - row * 0.06, 0.427, [-0.25, 0, 0]) });
  kit.add(P.slab(0.34, 0.03, 0.56), { ...M.steel, pattern: Pattern.Tread + 0.3, matrix: at(0.96, 0.36, 0) });
  return kit.build();
}

/** The copper kettle that swings over and dumps a batch. */
function cartKettle(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, -0.15], [0.18, -0.15], [0.23, -0.05], [0.235, 0.09], [0.26, 0.12], [0.2, 0.13], [0, 0.03]], 20, 0.02, 2), { ...M.copper, emissive: 0.08 });
  kit.add(P.torus(0.24, 0.012, 5, 20), { ...M.brass, outline: 0, matrix: at(0, 0.11, 0, [Math.PI / 2, 0, 0]) });
  rod(kit, V(-0.72, 0, 0), V(0.72, 0, 0), 0.016, M.steel, 6);
  kit.add(P.sphere(0.042, 8, 6), { ...M.brass, outline: 0, matrix: at(0.72, 0, 0) });
  puffs(kit, 0, 0.1, 0, 0.14, 0.14, 3, 0.075, 9);
  return kit.build();
}

function cartTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a string of bulbs along the awning.
  for (let i = 0; i < 9; i += 1) {
    const x = -0.92 + i * 0.23;
    for (const side of [-1, 1]) kit.add(P.sphere(0.034, 7, 5), { ...M.bulb, matrix: at(x, 2.2, side * 0.76) });
  }
  return kit.build();
}

// Old drum cannon ----------------------------------------------------------------

export function cannonFrame(): THREE.BufferGeometry {
  const kit = new Kit();
  // A skid of heavy planks with iron straps.
  for (let i = 0; i < 4; i += 1) kit.add(P.box(2.45, 0.13, 0.31, 0.03, 1), { ...M.wood, matrix: at(0, 0.07, -0.48 + i * 0.32) });
  for (const x of [-0.98, 0.98]) {
    kit.add(P.box(0.1, 0.15, 1.36, 0.02, 1), { ...M.iron, matrix: at(x, 0.08, 0) });
    rivets(kit, V(x, 0.16, -0.54), V(x, 0.16, 0.54), 4, 0.022, M.steel);
  }
  for (const side of [-1, 1]) {
    const z = side * 0.54;
    rod(kit, V(-0.72, 0.12, z), V(0, 1.38, z), 0.058, M.iron);
    rod(kit, V(0.72, 0.12, z), V(0, 1.38, z), 0.058, M.iron);
    rod(kit, V(-0.42, 0.62, z), V(0.42, 0.62, z), 0.03, M.iron, 6);
    kit.add(P.puck(0.15, 0.13, 0.1, 16, 0.02), { ...M.brass, matrix: at(0, 1.38, z - side * 0.05, [Math.PI / 2, 0, 0]) });
  }
  // Ratchet pawl bracket on the crank side of the A-frame.
  kit.add(P.slab(0.16, 0.04, 0.035), { ...M.steel, outline: 0.25, matrix: at(-0.18, 1.54, 0.62, [0, 0, -0.42]) });
  // Layered firebox hearth with lower ash drawer, draft damper door, grate and glowing coals.
  kit.add(P.box(0.94, 0.12, 0.72, 0.02, 1), { ...M.iron, matrix: at(0, 0.19, 0) });
  kit.add(P.slab(0.32, 0.08, 0.03), { ...M.steel, outline: 0.25, matrix: at(0, 0.19, 0.37) });
  kit.add(P.box(0.86, 0.16, 0.66, 0.03, 1), { ...M.darkIron, matrix: at(0, 0.33, 0) });
  for (let i = 0; i < 6; i += 1) kit.add(P.slab(0.84, 0.02, 0.02), { ...M.iron, outline: 0, detail: 1, matrix: at(0, 0.42, -0.25 + i * 0.1) });
  for (let i = 0; i < 16; i += 1) {
    const lit = i % 3 === 0;
    kit.add(P.sphere(0.05 + (i % 3) * 0.009, 6, 4), { ...(lit ? M.coal : paint(M.darkIron, { emissive: 0.12, color: '#5a2c1e', metal: 0, outline: 0 })), matrix: at(-0.34 + (i % 6) * 0.135, 0.44 + (i % 2) * 0.02, -0.24 + ((i * 5) % 6) * 0.095) });
  }
  // Tread-plate step and pinned safety notice.
  kit.add(P.slab(0.5, 0.02, 0.28), { ...M.steel, pattern: Pattern.Tread + 0.3, matrix: at(-0.62, 0.145, 0.36) });
  kit.add(P.slab(0.28, 0.006, 0.2), { ...LABEL, detail: 1, matrix: at(0.66, 0.138, 0.2, [0, 0.15, 0]) });
  for (const [x, z] of [[0.54, 0.12], [0.78, 0.3]] as const) kit.add(P.sphere(0.012, 5, 4), { ...M.steel, outline: 0, detail: 2, matrix: at(x, 0.142, z) });
  return kit.build();
}

/** The cast-iron pressure drum with classic T-lock muzzle crossbar, pressure gauge and brass relief valve. */
export function cannonDrum(): THREE.BufferGeometry {
  const kit = new Kit();
  const toX: [number, number, number] = [0, 0, -Math.PI / 2];
  kit.add(P.lathe([[0, -1.08], [0.2, -1.08], [0.42, -0.86], [0.5, -0.45], [0.5, 0.45], [0.42, 0.86], [0.28, 1.04], [0.24, 1.08], [0, 1.08]], 28, 0.08, 3), { ...M.darkIron, gloss: 0.72, metal: 0.82, matrix: at(0, 0, 0, toX) });
  for (const x of [-0.72, -0.25, 0.25, 0.72]) kit.add(P.torus(x * x > 0.4 ? 0.462 : 0.507, 0.03, 6, 28), { ...M.steel, outline: 0.4, matrix: at(x, 0, 0, [0, Math.PI / 2, 0]) });
  for (let ring = 0; ring < 2; ring += 1) {
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + ring;
      kit.add(P.sphere(0.024, 6, 4), { ...M.brass, outline: 0, detail: 1, matrix: at(ring ? 0.25 : -0.25, Math.cos(a) * 0.53, Math.sin(a) * 0.53) });
    }
  }
  // Iconic T-shaped pressure-lock crossbar yoke + clamping screw wrench at the muzzle mouth.
  for (const sy of [-1, 1]) {
    rod(kit, V(0.76, sy * 0.44, 0), V(1.16, sy * 0.34, 0), 0.026, M.steel, 6);
    kit.add(P.sphere(0.038, 6, 4), { ...M.brass, outline: 0, matrix: at(0.76, sy * 0.45, 0) });
  }
  rod(kit, V(1.16, -0.36, 0), V(1.16, 0.36, 0), 0.032, M.steel, 6);
  kit.add(P.puck(0.065, 0.055, 0.16, 10, 0.012), { ...M.brass, matrix: at(1.06, 0, 0, toX) });
  rod(kit, V(1.22, 0, -0.22), V(1.22, 0, 0.22), 0.022, M.brass, 6);
  // Pressure gauge + brass safety relief whistle valve on the drum crown.
  kit.add(P.puck(0.05, 0.05, 0.08, 10, 0.01), { ...M.brass, matrix: at(0, 0.5, 0) });
  kit.add(P.puck(0.13, 0.13, 0.04, 18, 0.012), { ...M.brass, matrix: at(0, 0.59, 0) });
  kit.add(P.puck(0.105, 0.105, 0.01, 18, 0.003), { color: '#fff4dc', emissive: 0.3, outline: 0, fixedColor: true, matrix: at(0, 0.628, 0) });
  kit.add(P.slab(0.012, 0.008, 0.09), { ...M.red, outline: 0, matrix: at(0.02, 0.64, 0.015, [0, 0.7, 0]) });
  // Brass safety relief valve next to the gauge.
  kit.add(P.puck(0.036, 0.032, 0.14, 10, 0.008), { ...M.brass, matrix: at(-0.38, 0.49, 0) });
  kit.add(P.torus(0.048, 0.012, 5, 12), { ...M.brass, outline: 0, matrix: at(-0.38, 0.64, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.1, 0.1, 0.14, 12, 0.02), { ...M.steel, matrix: at(-1.2, 0, 0, toX) });
  return kit.build();
}

export function cannonCap(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, 0], [0.3, 0], [0.3, 0.08], [0.14, 0.16], [0, 0.17]], 22, 0.03, 2), { ...M.red });
  kit.add(P.torus(0.295, 0.016, 6, 22), { ...M.brass, outline: 0, matrix: at(0, 0.03, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.sphere(0.06, 10, 8), { ...M.brass, matrix: at(0, 0.2, 0) });
  return kit.build();
}

/** Cast-iron ratchet flywheel and brass hand crank on the side of the frame. */
function cannonCrank(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.torus(0.21, 0.026, 6, 20), { ...M.brass, matrix: at(0, 0, 0) });
  // Cast-iron toothed ratchet gear ring nestled behind the brass flywheel.
  kit.add(P.puck(0.12, 0.12, 0.035, 12, 0.006), { ...M.darkIron, outline: 0.2, matrix: at(0, 0, -0.04, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    kit.add(P.slab(0.035, 0.055, 0.03), { ...M.darkIron, outline: 0, detail: 1, matrix: at(Math.cos(a) * 0.13, Math.sin(a) * 0.13, -0.022, [0, 0, a]) });
  }
  for (let i = 0; i < 3; i += 1) kit.add(P.slab(0.4, 0.024, 0.024), { ...M.brass, outline: 0, matrix: at(0, 0, 0, [0, 0, (i / 3) * Math.PI]) });
  rod(kit, V(0.2, 0, 0), V(0.2, 0, 0.16), 0.016, M.steel, 6);
  kit.add(P.capsule(0.022, 0.08, 2, 6), { ...M.darkWood, pattern: Pattern.Leather, outline: 0, matrix: at(0.2, 0, 0.2, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

function cannonTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a swaying brass-pole flag and a smoke stack on the firebox.
  rod(kit, V(-0.98, 0.15, 0.5), V(-0.98, 1.3, 0.5), 0.018, M.brass, 6);
  kit.add(P.slab(0.4, 0.22, 0.012), { ...M.canvasRed, sway: 0.25, matrix: at(-0.76, 1.2, 0.5) });
  kit.add(P.puck(0.08, 0.06, 0.34, 10, 0.01), { ...M.iron, matrix: at(0.3, 0.36, -0.22) });
  return kit.build();
}

/** Where a tossed pan's lid is while it comes down after the pan and settles. */
function arrivingLid(st: UnitState): { y: number; rx: number; rz: number } {
  const t = st.age;
  if (st.enter >= 1 || t < 0) return { y: 0, rx: 0, rz: 0 };
  if (t < PAN_LID_LANDS) {
    const k = t / PAN_LID_LANDS;
    return { y: 1.5 * (1 - k) + 1.3 * 4 * k * (1 - k), rx: (1 - k) * 9, rz: (1 - k) * 4 };
  }
  // Spins faster and flatter as it dies away.
  const since = t - PAN_LID_LANDS;
  const lean = 0.3 * Math.exp(-since * 5);
  const phase = 40 * since + 20 * since * since;
  return { y: lean * 0.12, rx: Math.cos(phase) * lean, rz: Math.sin(phase) * lean };
}

export const HOME_MACHINES: Record<'pan' | 'microwave' | 'cart' | 'cannon', UnitDef> = {
  pan: {
    parts: [panShell, panLid],
    inkParts: 2,
    interval: [2.2, 4.2],
    tints: ['#fff0d2', '#ffc94f', '#8fe0c8', '#8cc4ff', '#ffa9a0', '#f2e7ff', '#ffd9a3', '#b8ecd9', '#c3dcff', '#ffc6bd'],
    muzzle: [0, 0.72, 0],
    badge: { at: [0, 0.34, 0.715], size: 0.24 },
    pose(st, time, index, _tier, base, put) {
      put(0, base);
      const arc = 4 * st.kick * (1 - st.kick);
      // The lid chatters more and more as the next batch gets ready to pop.
      const chatter = windUp(st, 0.6) * 0.014 * Math.sin(time * 58 + index);
      const lift = arc * (st.lidSpin !== 0 ? 1.15 : 0.16);
      const landing = arrivingLid(st);
      putLocal(base, put, 1, 0, 0.64 + Math.abs(chatter) + lift + landing.y, 0, arc * 0.32 + chatter * 2 + landing.rx, time * 0.1 + index, st.lidSpin * arc * 0.3 - chatter + landing.rz);
    },
    fire(st, host, x, y, z, s) {
      const gag = host.rng.next() < 0.3;
      st.kick = gag ? 1 : 0.36;
      st.lidSpin = gag ? host.rng.range(4, 7) * host.rng.sign() : 0;
      host.smoke(x, y + 0.1 * s, z, 0.3 * s);
      if (gag) host.sound('work-pan');
    },
  },
  microwave: {
    parts: [microwaveBody, microwaveDoor, microwaveTray, microwaveTrim],
    shadowParts: 2,
    interval: [1.8, 3],
    muzzle: [-0.2, 0.75, 1.15],
    badge: { at: [0.77, 0.22, 0.6], size: 0.2 },
    signs: [{ text: SIGN_TEXT.microwave, style: { background: '#1c3d35', color: '#7ff0c2', glow: 1, aspect: 2.1 }, width: 0.3, height: 0.13, matrix: at(0.77, 1.05, 0.595) }],
    pose(st, _time, _index, tier, base, put) {
      put(0, base);
      // Snaps open at the bell, then eases shut before the next batch.
      let open = st.kick < 0 ? 0 : Math.min(1, st.kick * 1.8);
      // Fresh out of the box, the door gets one proud swing.
      if (st.enter < 1 && st.age > MICROWAVE_DOOR_OPENS) open = Math.max(open, Math.sin(Math.min(1, (st.age - MICROWAVE_DOOR_OPENS) / 0.46) * Math.PI) ** 0.7 * 0.95);
      putLocal(base, put, 1, HINGE[0], HINGE[1], HINGE[2], 0, -open * open * 1.55, 0);
      const swell = 0.72 + cycleOf(st) * 0.5 + Math.sin(st.spin * 7) * windUp(st) * 0.03;
      putLocal(base, put, 2, -0.25, 0.53, 0, 0, st.spin * 1.2, 0, swell, swell, swell);
      putIf(put, 3, tier >= 1, base);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.flash(x, y, z, 0.5 * s);
      host.sound('ding');
    },
  },
  cart: {
    parts: [cartBody, cartKettle, cartTrim],
    shadowParts: 1,
    interval: [1.4, 2.5],
    muzzle: [0, 2.05, 0.5],
    badge: { at: [0.63, 0.84, 0.505], size: 0.26 },
    signs: [{ text: SIGN_TEXT.popcorn, style: { background: '#ffc63f', color: '#8f1f26', border: '#8f1f26', aspect: 2.8 }, width: 0.84, height: 0.3, matrix: at(0, 0.84, 0.494) }],
    pose(st, _time, _index, tier, base, put) {
      put(0, base);
      // Leans back, then tips right over to pour.
      let tip = windUp(st) * -0.32 + st.kick * st.kick * 2.1;
      // On the move the kettle trails behind, then swings when the cart stops.
      if (st.enter < 1) tip += st.age < CART_STOPS ? -0.35 : 0.9 * Math.exp(-(st.age - CART_STOPS) * 3) * Math.sin((st.age - CART_STOPS) * 11);
      putLocal(base, put, 1, 0, 1.86, 0, tip, 0, Math.sin(st.spin) * 0.03);
      putIf(put, 2, tier >= 1, base);
    },
    fire(st, host) {
      st.kick = 1;
      if (host.rng.next() < 0.3) host.sound('work-cart');
    },
  },
  cannon: {
    parts: [cannonFrame, cannonDrum, cannonCrank, cannonTrim],
    shadowParts: 2,
    inkParts: 2,
    interval: [3.4, 5.6],
    muzzle: [1.36, 1.72, 0],
    badge: { at: [0, 0.3, 0.345], size: 0.2 },
    pose(st, _time, _index, tier, base, put) {
      put(0, base);
      const recoil = Math.max(0, st.shake) * 0.22 - windUp(st, 0.8) * 0.03;
      // The landing sets the drum spinning.
      putLocal(base, put, 1, -recoil, 1.42, 0, st.spin * 3 + (1 - st.enter) * 14, 0, 0.26);
      putLocal(base, put, 2, 0, 1.38, 0.68, 0, 0, -st.spin * 2.4);
      put(3, tier >= 1 ? base : HIDDEN);
    },
    fire(st, host, x, y, z, s) {
      st.shake = 1;
      host.flash(x, y, z, 1.1 * s);
      host.smoke(x, y, z, 0.9 * s);
      host.onCannonFired();
    },
  },
};

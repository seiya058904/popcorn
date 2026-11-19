import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { at, cycleOf, HIDDEN, Kit, M, P, paint, Pattern, puffs, putIf, putLocal, rivets, rod, smooth, V, windUp, type PutPart, type UnitDef, type UnitState } from './common.ts';

/** Polished, not brushed: a 1950s appliance shines like a spoon. */
const POLISHED = paint(M.chrome, { color: '#eef2f7', pattern: 0, gloss: 0.97, wear: 0.12 });
const BAKELITE = { color: '#3b2118', gloss: 0.74, coat: 0.35, wear: 0.18, fixedColor: true };
const BAKELITE_RED = { color: '#c8282f', gloss: 0.86, coat: 0.5, wear: 0.15, fixedColor: true };
const GLAZE = { color: '#f4ecdd', gloss: 0.94, coat: 0.7, pattern: Pattern.Glaze, wear: 0.1, fixedColor: true };
const LABEL = { color: '#fff4dc', gloss: 0.12, pattern: Pattern.Paper, outline: 0.4, fixedColor: true };

// Pop-up toaster ----------------------------------------------------------------------

/** Rest height of a brick's base in its slot; it peeks out just above the top. */
const BRICK_REST = 0.7;
const SLOT_Z = 0.2;

function toasterBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Bakelite feet and skirt, chrome loaf on top.
  for (const x of [-0.66, 0.66]) for (const z of [-0.36, 0.36]) kit.add(P.puck(0.075, 0.065, 0.05, 12, 0.015), { ...BAKELITE, matrix: at(x, 0, z) });
  kit.add(P.box(1.62, 0.11, 0.98, 0.05, 2), { ...BAKELITE, matrix: at(0, 0.1, 0) });
  kit.add(P.box(1.5, 0.95, 0.88, 0.3, 6), { ...POLISHED, ao: (p) => 0.7 + 0.3 * smooth(0.15, 0.5, p.y), matrix: at(0, 0.625, 0) });
  // Art deco speed lines on both faces, swept to one side.
  for (const z of [-0.442, 0.442]) {
    for (const [y, width] of [[0.34, 0.86], [0.42, 1.0], [0.5, 0.86]] as const) kit.add(P.box(width, 0.026, 0.03, 0.012, 1), { ...POLISHED, outline: 0.3, matrix: at(-0.12, y, z) });
  }
  // Two slots, each with a chrome lip and a dark well.
  for (const z of [-SLOT_Z, SLOT_Z]) {
    kit.add(P.box(1.16, 0.03, 0.24, 0.1, 3), { ...POLISHED, outline: 0.4, matrix: at(0, 1.093, z) });
    kit.add(P.box(1.06, 0.03, 0.16, 0.07, 3), { ...M.dark, matrix: at(0, 1.104, z) });
    // The heating wires down the walls of each slot, dark until they glow.
    for (const side of [-1, 1]) for (const y of [0.78, 0.9, 1.02]) kit.add(P.box(0.98, 0.012, 0.012, 0.004, 1), { color: '#5a3a30', outline: 0, detail: 1, fixedColor: true, matrix: at(0, y, z + side * 0.07) });
  }
  // Lever track on the right end, a knurled browning knob and its dial.
  kit.add(P.box(0.04, 0.52, 0.08, 0.02, 1), { ...M.dark, matrix: at(0.755, 0.62, SLOT_Z) });
  kit.add(P.puck(0.085, 0.078, 0.07, 18, 0.012), { ...M.chrome, pattern: Pattern.Knurl, matrix: at(0.75, 0.34, -0.16, [0, 0, -Math.PI / 2]) });
  kit.add(P.box(0.012, 0.05, 0.012, 0.004, 1), { ...BAKELITE_RED, outline: 0, matrix: at(0.83, 0.37, -0.16) });
  for (let i = 0; i < 5; i += 1) {
    const a = -0.9 + i * 0.45;
    kit.add(P.box(0.006, 0.022, 0.006, 0.002, 1), { ...M.dark, outline: 0, detail: 2, matrix: at(0.752, 0.34 + Math.cos(a) * 0.13, -0.16 + Math.sin(a) * 0.13) });
  }
  // Crumb tray tab, screws along the skirt, a little nameplate.
  kit.add(P.box(0.3, 0.05, 0.08, 0.02, 1), { ...BAKELITE, matrix: at(0, 0.11, 0.5) });
  rivets(kit, V(-0.62, 0.1, 0.495), V(0.62, 0.1, 0.495), 4, 0.014, M.chrome);
  kit.add(P.box(0.56, 0.18, 0.02, 0.03, 2), { ...M.brass, outline: 0.4, matrix: at(-0.2, 0.75, 0.448) });
  // A cloth-wrapped cord out of the back, with a paper tag tied on.
  const cord = { color: '#7a4a2a', gloss: 0.15, pattern: Pattern.Fabric, outline: 0.4, fixedColor: true };
  kit.add(P.tube([V(-0.55, 0.26, -0.44), V(-0.6, 0.2, -0.62), V(-0.78, 0.03, -0.78), V(-1.12, 0.025, -0.7), V(-1.36, 0.025, -0.42)], 0.024, 28, 6), cord);
  kit.add(P.box(0.14, 0.09, 0.006, 0.01, 1), { ...LABEL, detail: 1, matrix: at(-0.82, 0.08, -0.79, [0.2, 0.6, 0.15]) });
  return kit.build();
}

/** The lever knob, built around the top of its travel. */
function toasterLever(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.08, 0.03, 0.05, 0.01, 1), { ...M.chrome, matrix: at(0.03, 0, 0) });
  kit.add(P.box(0.13, 0.08, 0.2, 0.035, 2), { ...BAKELITE_RED, matrix: at(0.11, 0, 0) });
  return kit.build();
}

/** The heating wires lit up, and the orange glow of the well beneath them. */
function toasterGlow(): THREE.BufferGeometry {
  const kit = new Kit();
  for (const z of [-SLOT_Z, SLOT_Z]) {
    for (const side of [-1, 1]) for (const y of [0.78, 0.9, 1.02]) kit.add(P.box(1, 0.016, 0.016, 0.005, 1), { ...M.coal, matrix: at(0, y, z + side * 0.068) });
    kit.add(P.box(1, 0.02, 0.12, 0.01, 1), { color: '#ff6a24', emissive: 0.8, outline: 0, fixedColor: true, matrix: at(0, 0.66, z) });
  }
  return kit.build();
}

/** A brick of pressed popcorn, its base at the origin. */
function popcornBrick(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.9, 0.44, 0.12, 0.05, 3), { ...M.popcorn, emissive: 0.32, outline: 0.3, matrix: at(0, 0.22, 0) });
  puffs(kit, 0, 0.42, 0, 0.36, 0.03, 6, 0.06, 21);
  puffs(kit, 0, 0.2, 0.05, 0.36, 0.01, 4, 0.05, 22);
  return kit.build();
}

function toasterTrim25(): THREE.BufferGeometry {
  // Earned at 25: a red enamel band round the skirt and a chrome fin between the slots, like the
  // ornament on the hood of a 1950s car, with a red jewel at its tip.
  const kit = new Kit();
  kit.add(P.box(1.66, 0.05, 1.02, 0.025, 2), { ...M.red, matrix: at(0, 0.165, 0) });
  kit.add(P.box(0.86, 0.13, 0.05, 0.05, 3), { ...POLISHED, matrix: at(0.02, 1.15, 0, [0, 0, 0.05], [1, 1, 1]) });
  kit.add(P.box(0.4, 0.08, 0.045, 0.035, 2), { ...POLISHED, outline: 0.4, matrix: at(0.5, 1.18, 0, [0, 0, 0.32]) });
  kit.add(P.sphere(0.045, 12, 8), { ...BAKELITE_RED, matrix: at(0.68, 1.24, 0) });
  return kit.build();
}

function toasterTrim50(): THREE.BufferGeometry {
  // Earned at 50: chrome guard rails round the slots and a thermostat on the left end.
  const kit = new Kit();
  for (const z of [-0.36, 0.36]) rod(kit, V(-0.62, 1.12, z), V(0.62, 1.12, z), 0.018, M.chrome, 6);
  for (const x of [-0.62, 0.62]) for (const z of [-0.36, 0.36]) kit.add(P.sphere(0.03, 8, 6), { ...M.chrome, matrix: at(x, 1.12, z) });
  kit.add(P.puck(0.14, 0.14, 0.05, 20, 0.012), { ...M.brass, matrix: at(-0.76, 0.66, 0, [0, 0, Math.PI / 2]) });
  kit.add(P.puck(0.11, 0.11, 0.01, 20, 0.003), { color: '#fff4dc', emissive: 0.25, outline: 0, fixedColor: true, matrix: at(-0.79, 0.66, 0, [0, 0, Math.PI / 2]) });
  kit.add(P.box(0.01, 0.09, 0.012, 0.003, 1), { ...M.red, outline: 0, matrix: at(-0.8, 0.69, 0.01, [0.6, 0, 0]) });
  return kit.build();
}

// Tilt-head stand mixer -------------------------------------------------------------

/** The head pivots on a pin at the top of the column. */
const MIXER_HINGE: [number, number, number] = [-0.52, 1.16, 0];
const BOWL_X = 0.32;
/** The beater socket under the head, relative to the hinge. */
const SOCKET: [number, number] = [0.84, -0.27];

function mixerBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Enamel base and column take the copy's color; everything chrome stays chrome.
  const enamel = { color: '#ffffff', gloss: 0.86, coat: 0.5, pattern: Pattern.Enamel, wear: 0.25 };
  kit.add(P.box(1.56, 0.2, 0.86, 0.09, 3), { ...enamel, matrix: at(0, 0.1, 0) });
  kit.add(P.box(0.48, 0.98, 0.6, 0.2, 4), { ...enamel, ao: (p) => 0.75 + 0.25 * smooth(0.2, 0.7, p.y), matrix: at(-0.52, 0.68, 0) });
  for (const x of [-0.62, 0.62]) for (const z of [-0.32, 0.32]) kit.add(P.puck(0.06, 0.055, 0.03, 10, 0.01), { ...M.rubber, matrix: at(x, -0.01, z) });
  // Hinge pins, the bowl clamp and its locking lever.
  for (const z of [-0.31, 0.31]) kit.add(P.puck(0.06, 0.06, 0.04, 14, 0.012), { ...M.chrome, matrix: at(MIXER_HINGE[0], MIXER_HINGE[1], z, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.36, 0.34, 0.04, 28, 0.012), { ...M.chrome, matrix: at(BOWL_X, 0.2, 0) });
  kit.add(P.box(0.2, 0.03, 0.04, 0.012, 1), { ...M.chrome, matrix: at(-0.2, 0.32, 0.31, [0, 0, 0.5]) });
  // Speed lever with its notched scale, and a brand plate on the column.
  kit.add(P.box(0.03, 0.34, 0.01, 0.005, 1), { ...M.dark, outline: 0, matrix: at(-0.4, 0.86, 0.302) });
  for (let i = 0; i < 6; i += 1) kit.add(P.box(0.03, 0.006, 0.006, 0.002, 1), { ...M.chrome, outline: 0, detail: 2, matrix: at(-0.37, 0.72 + i * 0.055, 0.302) });
  kit.add(P.box(0.06, 0.04, 0.09, 0.015, 1), { ...M.chrome, matrix: at(-0.4, 0.93, 0.33) });
  kit.add(P.box(0.32, 0.12, 0.02, 0.03, 2), { ...M.chrome, outline: 0.3, matrix: at(-0.52, 0.5, 0.303) });
  // A glazed ceramic bowl with a rolled rim and a loop handle.
  kit.add(
    P.lathe([[0, 0], [0.22, 0], [0.31, 0.06], [0.43, 0.38], [0.47, 0.6], [0.48, 0.64], [0.45, 0.64], [0.42, 0.4], [0.3, 0.12], [0, 0.1]], 40, 0.025, 2),
    { ...GLAZE, ao: (p) => 0.7 + 0.3 * smooth(0.25, 0.8, p.y), matrix: at(BOWL_X, 0.22, 0) },
  );
  kit.add(P.torus(0.475, 0.022, 8, 40), { ...GLAZE, outline: 0.3, matrix: at(BOWL_X, 0.86, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.11, 0.024, 6, 16, Math.PI * 1.2), { ...GLAZE, matrix: at(BOWL_X + 0.5, 0.62, 0, [0, 0, -Math.PI * 0.6]) });
  // A blue stripe fired into the glaze.
  kit.add(P.torus(0.455, 0.012, 4, 40), { color: '#3d6fd6', gloss: 0.9, coat: 0.6, outline: 0, fixedColor: true, matrix: at(BOWL_X, 0.74, 0, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

/** The motor head, built around its hinge. */
function mixerHead(): THREE.BufferGeometry {
  const kit = new Kit();
  const enamel = { color: '#ffffff', gloss: 0.88, coat: 0.55, pattern: Pattern.Enamel, wear: 0.25 };
  kit.add(P.capsule(0.27, 0.72, 8, 22), { ...enamel, matrix: at(0.38, 0.06, 0, [0, 0, Math.PI / 2], [1, 1, 0.94]) });
  // A chrome band, the attachment hub with its knurled cap, and the vented tail.
  kit.add(P.torus(0.272, 0.028, 8, 32), { ...POLISHED, matrix: at(0.72, 0.06, 0, [0, Math.PI / 2, 0], [1, 1, 0.94]) });
  kit.add(P.puck(0.13, 0.11, 0.07, 20, 0.015), { ...POLISHED, matrix: at(0.99, 0.08, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.085, 0.08, 0.05, 18, 0.012), { ...M.chrome, pattern: Pattern.Knurl, matrix: at(1.06, 0.08, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.2, 0.2, 0.025, 24, 0.01), { ...M.darkIron, pattern: Pattern.Perforated + 0.15, matrix: at(-0.27, 0.06, 0, [0, 0, Math.PI / 2]) });
  kit.add(P.box(0.5, 0.025, 0.08, 0.012, 1), { ...POLISHED, outline: 0.3, matrix: at(0.4, 0.34, 0) });
  // The socket the beater hangs from.
  kit.add(P.puck(0.07, 0.06, 0.06, 14, 0.012), { ...M.chrome, matrix: at(SOCKET[0], SOCKET[1] + 0.02, 0) });
  return kit.build();
}

/** A flat beater: a looped paddle on a shaft, hung from the origin. */
function mixerBeater(): THREE.BufferGeometry {
  const kit = new Kit();
  rod(kit, V(0, 0, 0), V(0, -0.22, 0), 0.028, M.chrome, 8);
  kit.add(P.torus(0.15, 0.02, 6, 26), { ...M.chrome, matrix: at(0, -0.4, 0, [0, 0, 0], [1, 1.3, 1]) });
  rod(kit, V(0, -0.22, 0), V(0, -0.58, 0), 0.016, M.chrome, 6);
  return kit.build();
}

/** The batch in the bowl, tumbling the whole time. */
function mixerBatch(): THREE.BufferGeometry {
  const kit = new Kit();
  puffs(kit, 0, 0, 0, 0.34, 0.34, 16, 0.08, 31);
  return kit.build();
}

function mixerTrim25(): THREE.BufferGeometry {
  // Earned at 25: a chrome splash guard on the bowl and chrome edging round the top of the base.
  const kit = new Kit();
  kit.add(P.torus(0.5, 0.03, 6, 40, Math.PI * 1.5), { ...POLISHED, matrix: at(BOWL_X, 0.92, 0, [Math.PI / 2, 0, Math.PI * 0.25]) });
  for (const z of [-0.43, 0.43]) kit.add(P.box(1.5, 0.035, 0.035, 0.015, 1), { ...POLISHED, outline: 0.3, matrix: at(0, 0.19, z) });
  for (const x of [-0.78, 0.78]) kit.add(P.box(0.035, 0.035, 0.8, 0.015, 1), { ...POLISHED, outline: 0.3, matrix: at(x, 0.19, 0) });
  return kit.build();
}

/** Earned at 50: a brass kernel hopper riding on the head, built around the hinge like the head. */
function mixerTrim50(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0.03, 0], [0.06, 0], [0.18, 0.22], [0.18, 0.26], [0.16, 0.26], [0.05, 0.03]], 20, 0.012, 2), { ...M.brass, matrix: at(0.62, 0.3, 0) });
  puffs(kit, 0.62, 0.48, 0, 0.1, 0.1, 4, 0.045, 33, { ...M.popcorn, color: '#f6d58a' });
  return kit.build();
}

/** Head tilt for this moment: up to throw a batch, then easing back down. */
function headTilt(st: UnitState, time: number, index: number): number {
  const u = 1 - st.kick;
  const lift = st.kick <= 0 ? 0 : u < 0.18 ? easeOut(u / 0.18) : 1 - smooth(0.18, 1, u);
  // The motor revs as the batch comes together: the head shivers on its hinge.
  const shiver = windUp(st, 0.6) * 0.012 * Math.sin(time * 61 + index);
  // On arrival it nods hello twice.
  const nod = st.enter < 1 ? 0.24 * Math.max(0, Math.sin(st.age * 9)) * Math.max(0, 1 - st.age / 1.3) : 0;
  return 0.6 * lift + shiver + nod;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const head = new THREE.Matrix4();
const local = new THREE.Matrix4();
const part = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);

/** Places a part carried by the head: hinge, tilt, then the part's own offset and turn. */
function onHead(base: THREE.Matrix4, put: PutPart, index: number, tilt: number, x: number, y: number, spin = 0): void {
  head.compose(p.set(...MIXER_HINGE), q.setFromEuler(e.set(0, 0, tilt)), one);
  local.compose(p.set(x, y, 0), q.setFromEuler(e.set(0, spin, 0)), one);
  part.multiplyMatrices(base, head).multiply(local);
  put(index, part);
}

export const KITCHENWARE: Record<'toaster' | 'mixer', UnitDef> = {
  toaster: {
    parts: [toasterBody, toasterLever, toasterGlow, popcornBrick, popcornBrick, toasterTrim25, toasterTrim50],
    shadowParts: 2,
    inkParts: 2,
    interval: [2, 3.4],
    muzzle: [0, 1.3, 0],
    signs: [{ text: SIGN_TEXT.toaster, style: { background: '#e4b252', color: '#5a2a12', border: '#8a5a1a', aspect: 3.1 }, width: 0.5, height: 0.15, matrix: at(-0.2, 0.75, 0.46) }],
    badge: { at: [0.42, 0.66, 0.45], size: 0.3 },
    pose(st, time, index, tier, base, put) {
      put(0, base);
      const c = cycleOf(st);
      const flying = st.kick > 0.02;
      // Pressed for the bake, snapping back up at the ding.
      const down = flying ? 0 : smooth(0.16, 0.28, c);
      const spring = Math.max(0, st.hop.value) * 0.06;
      putLocal(base, put, 1, 0.76, 0.86 - 0.42 * down + spring, SLOT_Z);
      // The wires glow through the bake and flicker as it finishes.
      const heat = flying ? 0 : smooth(0.3, 0.42, c);
      const flicker = windUp(st, 0.8) > 0 && Math.sin(time * 47 + index * 3) > 0.6;
      putIf(put, 2, heat > 0.5 && !flicker, base);
      // Bricks ride down with the lever, fly at the ding, and burst at the top of their arc.
      const u = 1 - st.kick;
      ([[3, -SLOT_Z, 0], [4, SLOT_Z, 0.07]] as const).forEach(([partIndex, z, delay]) => {
        if (!flying) {
          const back = smooth(0.02, 0.12, c);
          putLocal(base, put, partIndex, 0, BRICK_REST - 0.4 * down, z, 0, 0, 0, 1, Math.max(0.001, back), 1);
          return;
        }
        const t = Math.max(0, u - delay);
        const rise = easeOut(Math.min(1, t / 0.45));
        const burst = 1 - smooth(0.42, 0.62, t);
        if (burst <= 0) {
          put(partIndex, HIDDEN);
          return;
        }
        const side = z > 0 ? 1 : -1;
        putLocal(base, put, partIndex, side * 0.12 * rise, BRICK_REST + 1.5 * rise, z + side * 0.25 * rise, side * t * 2.6, t * 1.2, side * t * 1.4, burst * (1 + 0.25 * (1 - burst)));
      });
      putIf(put, 5, tier >= 1, base);
      putIf(put, 6, tier >= 2, base);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.flash(x, y - 0.1 * s, z, 0.35 * s);
      host.sound('work-toaster');
    },
  },
  mixer: {
    parts: [mixerBody, mixerHead, mixerBeater, mixerBatch, mixerTrim25, mixerTrim50],
    shadowParts: 2,
    inkParts: 2,
    interval: [2.4, 3.8],
    tints: ['#f2564a', '#8fe0c8', '#ffd36a', '#8cc4ff', '#f6eee0', '#ffa9c0'],
    muzzle: [BOWL_X, 1.25, 0],
    signs: [{ text: SIGN_TEXT.mixer, style: { background: '#e9eef3', color: '#a9202d', aspect: 2.7 }, width: 0.28, height: 0.1, matrix: at(-0.52, 0.5, 0.315) }],
    badge: { at: [-0.52, 0.78, 0.31], size: 0.26 },
    pose(st, time, index, tier, base, put) {
      put(0, base);
      const tilt = headTilt(st, time, index);
      onHead(base, put, 1, tilt, 0, 0);
      // The beater spins hardest while the head is down in the batch.
      onHead(base, put, 2, tilt, SOCKET[0], SOCKET[1], st.spin * 5);
      // The batch rolls over and over; thrown out, it is gone until the head comes back down.
      const thrown = st.kick > 0.2 ? smooth(0.2, 0.75, st.kick) : 0;
      const roll = st.spin * 2.4;
      putLocal(base, put, 3, BOWL_X + Math.sin(roll) * 0.04, 0.62 + Math.abs(Math.sin(roll * 1.7)) * 0.05, Math.cos(roll) * 0.04, Math.sin(roll * 0.8) * 0.5, roll, Math.cos(roll) * 0.4, Math.max(0.001, 1 - thrown));
      putIf(put, 4, tier >= 1, base);
      if (tier >= 2) onHead(base, put, 5, tilt, 0, 0);
      else put(5, HIDDEN);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.smoke(x, y, z, 0.3 * s);
      if (host.rng.next() < 0.5) host.sound('work-mixer');
    },
  },
};

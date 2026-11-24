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
  // Bakelite feet, stepped skirt, and streamlined 1950s chrome loaf body.
  for (const x of [-0.66, 0.66]) for (const z of [-0.36, 0.36]) kit.add(P.puck(0.078, 0.065, 0.05, 12, 0.015), { ...BAKELITE, matrix: at(x, 0, z) });
  kit.add(P.box(1.62, 0.11, 0.98, 0.05, 2), { ...BAKELITE, matrix: at(0, 0.1, 0) });
  kit.add(P.box(1.56, 0.03, 0.93, 0.015, 1), { ...POLISHED, outline: 0.3, matrix: at(0, 0.165, 0) });
  kit.add(P.box(1.5, 0.95, 0.88, 0.3, 4), { ...POLISHED, ao: (p) => 0.72 + 0.28 * smooth(0.15, 0.5, p.y), matrix: at(0, 0.625, 0) });
  // Three-tier 1950s Art Deco stepped speed-ribs wrapping front and back faces, with bakelite end accents.
  for (const z of [-0.442, 0.442]) {
    const sign = z > 0 ? 1 : -1;
    for (const [y, width, thick] of [[0.32, 0.78, 0.024], [0.405, 1.04, 0.034], [0.49, 0.9, 0.026]] as const) {
      kit.add(P.box(width, 0.026, thick, 0.012, 1), { ...POLISHED, outline: 0.3, matrix: at(-0.1, y, z) });
    }
    // Recessed deco medallion trim bar at the left sweep tip.
    kit.add(P.slab(0.12, 0.19, 0.016), { ...BAKELITE_RED, outline: 0, detail: 1, matrix: at(-0.62, 0.405, z + sign * 0.002) });
  }
  // Two toast slots with rolled chrome collar bezels, dark wells, and coiled-look heating wires.
  for (const z of [-SLOT_Z, SLOT_Z]) {
    kit.add(P.box(1.2, 0.036, 0.26, 0.1, 2), { ...POLISHED, outline: 0.4, matrix: at(0, 1.092, z) });
    kit.add(P.box(1.12, 0.024, 0.2, 0.08, 2), { ...M.chrome, outline: 0.25, matrix: at(0, 1.106, z) });
    kit.add(P.box(1.06, 0.032, 0.16, 0.07, 2), { ...M.dark, matrix: at(0, 1.108, z) });
    // Heating wires with evenly spaced coil beads along both inner walls.
    for (const side of [-1, 1]) {
      for (const y of [0.8, 0.92, 1.03]) {
        kit.add(P.slab(0.96, 0.012, 0.012), { color: '#5a3a30', outline: 0, detail: 1, fixedColor: true, matrix: at(0, y, z + side * 0.07) });
      }
      for (let c = -3; c <= 3; c += 1) {
        kit.add(P.slab(0.014, 0.24, 0.014), { color: '#472c25', outline: 0, detail: 2, fixedColor: true, matrix: at(c * 0.14, 0.91, z + side * 0.072) });
      }
    }
  }
  // Recessed chrome lever guide bezel + dark slot track on the right end, plus knurled browning dial.
  kit.add(P.box(0.032, 0.62, 0.16, 0.025, 1), { ...POLISHED, outline: 0.35, matrix: at(0.748, 0.62, SLOT_Z) });
  kit.add(P.slab(0.04, 0.52, 0.068), { ...M.dark, matrix: at(0.758, 0.62, SLOT_Z) });
  // Escutcheon bezel under the browning knob.
  kit.add(P.puck(0.115, 0.108, 0.02, 16, 0.008), { ...BAKELITE, outline: 0.3, matrix: at(0.744, 0.34, -0.16, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.085, 0.078, 0.07, 16, 0.012), { ...M.chrome, pattern: Pattern.Knurl, matrix: at(0.754, 0.34, -0.16, [0, 0, -Math.PI / 2]) });
  kit.add(P.slab(0.012, 0.05, 0.014), { ...BAKELITE_RED, outline: 0, matrix: at(0.832, 0.37, -0.16) });
  for (let i = 0; i < 5; i += 1) {
    const a = -0.9 + i * 0.45;
    kit.add(P.slab(0.008, 0.024, 0.008), { ...M.dark, outline: 0, detail: 2, matrix: at(0.756, 0.34 + Math.cos(a) * 0.132, -0.16 + Math.sin(a) * 0.132) });
  }
  // Bakelite side lift handles (classic 1950s Sunbeam/Toastmaster silhouette), crumb tray tab, nameplate.
  kit.add(P.box(0.12, 0.09, 0.36, 0.035, 2), { ...BAKELITE, matrix: at(-0.77, 0.24, 0) });
  kit.add(P.box(0.32, 0.05, 0.08, 0.02, 1), { ...BAKELITE, matrix: at(0, 0.11, 0.5) });
  rivets(kit, V(-0.62, 0.1, 0.495), V(0.62, 0.1, 0.495), 4, 0.014, M.chrome);
  kit.add(P.box(0.56, 0.18, 0.02, 0.03, 2), { ...M.brass, outline: 0.4, matrix: at(-0.2, 0.75, 0.448) });
  // Compact cloth-wrapped power cord tucked behind the rear skirt (never clips the leaning lid or back guard).
  const cord = { color: '#7a4a2a', gloss: 0.15, pattern: Pattern.Fabric, outline: 0.4, fixedColor: true };
  kit.add(P.puck(0.045, 0.038, 0.05, 10, 0.008), { ...M.rubber, outline: 0, matrix: at(-0.32, 0.24, -0.44, [-Math.PI / 2, 0, 0]) });
  kit.add(P.tube([V(-0.32, 0.24, -0.46), V(-0.24, 0.12, -0.51), V(0.08, 0.03, -0.52), V(0.42, 0.026, -0.49)], 0.022, 18, 6), cord);
  kit.add(P.slab(0.13, 0.08, 0.006), { ...LABEL, detail: 1, matrix: at(0.16, 0.075, -0.525, [0.15, 0.2, 0.1]) });
  return kit.build();
}

/** The lever knob, built around the top of its travel. */
function toasterLever(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.08, 0.03, 0.05, 0.01, 1), { ...M.chrome, matrix: at(0.03, 0, 0) });
  kit.add(P.box(0.14, 0.085, 0.22, 0.035, 2), { ...BAKELITE_RED, matrix: at(0.115, 0, 0) });
  kit.add(P.slab(0.012, 0.02, 0.16), { ...POLISHED, outline: 0, matrix: at(0.185, 0, 0) });
  return kit.build();
}

/** The heating wires lit up, and the orange glow of the well beneath them. */
function toasterGlow(): THREE.BufferGeometry {
  const kit = new Kit();
  for (const z of [-SLOT_Z, SLOT_Z]) {
    for (const side of [-1, 1]) for (const y of [0.8, 0.92, 1.03]) kit.add(P.slab(0.98, 0.016, 0.016), { ...M.coal, matrix: at(0, y, z + side * 0.068) });
    kit.add(P.slab(1, 0.02, 0.12), { color: '#ff6a24', emissive: 0.85, outline: 0, fixedColor: true, matrix: at(0, 0.66, z) });
  }
  return kit.build();
}

/** A brick of pressed popcorn, its base at the origin. */
function popcornBrick(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.88, 0.42, 0.115, 0.048, 2), { ...M.popcorn, emissive: 0.36, outline: 0.25, matrix: at(0, 0.22, 0) });
  puffs(kit, 0, 0.4, 0, 0.35, 0.028, 7, 0.065, 21);
  puffs(kit, 0, 0.2, 0.048, 0.34, 0.012, 4, 0.052, 22);
  puffs(kit, 0, 0.2, -0.048, 0.34, 0.012, 3, 0.052, 23);
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
  // Streamlined KitchenAid-inspired enamel base and waisted column; chrome stays chrome.
  const enamel = { color: '#ffffff', gloss: 0.86, coat: 0.5, pattern: Pattern.Enamel, wear: 0.25 };
  // Rounded horseshoe pedestal base + sculpted lower plinth flare.
  kit.add(P.box(1.56, 0.19, 0.86, 0.11, 3), { ...enamel, matrix: at(0, 0.1, 0) });
  kit.add(P.lathe([[0, 0], [0.35, 0], [0.34, 0.1], [0.27, 0.36], [0.24, 0.66], [0.275, 0.94], [0.26, 1.02], [0, 1.04]], 24, 0.04, 2), {
    ...enamel,
    ao: (p) => 0.76 + 0.24 * smooth(0.18, 0.72, p.y),
    matrix: at(-0.52, 0.17, 0, [0, 0, 0], [0.92, 1, 1.12]),
  });
  for (const x of [-0.62, 0.62]) for (const z of [-0.32, 0.32]) kit.add(P.puck(0.06, 0.055, 0.03, 10, 0.01), { ...M.rubber, matrix: at(x, -0.01, z) });
  // Hinge pins, bowl clamping plate, and tilt-head locking lever with ball knob.
  for (const z of [-0.31, 0.31]) kit.add(P.puck(0.062, 0.056, 0.042, 14, 0.012), { ...POLISHED, matrix: at(MIXER_HINGE[0], MIXER_HINGE[1], z, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.37, 0.345, 0.042, 28, 0.012), { ...POLISHED, matrix: at(BOWL_X, 0.195, 0) });
  rod(kit, V(-0.28, 0.24, 0.29), V(-0.12, 0.36, 0.33), 0.016, POLISHED, 6);
  kit.add(P.sphere(0.034, 10, 8), { ...POLISHED, matrix: at(-0.11, 0.37, 0.335) });
  // Graduated speed-control escutcheon plate, recessed slot, ticks, and chrome slider handle.
  kit.add(P.box(0.11, 0.4, 0.02, 0.018, 1), { ...POLISHED, outline: 0.3, matrix: at(-0.39, 0.85, 0.292) });
  kit.add(P.slab(0.026, 0.32, 0.014), { ...M.dark, outline: 0, matrix: at(-0.4, 0.85, 0.302) });
  for (let i = 0; i < 6; i += 1) kit.add(P.slab(0.028, 0.008, 0.008), { ...M.darkIron, outline: 0, detail: 2, matrix: at(-0.365, 0.72 + i * 0.052, 0.305) });
  kit.add(P.box(0.062, 0.042, 0.09, 0.016, 1), { ...POLISHED, matrix: at(-0.4, 0.92, 0.33) });
  kit.add(P.box(0.32, 0.12, 0.02, 0.03, 2), { ...POLISHED, outline: 0.3, matrix: at(-0.52, 0.5, 0.303) });
  // A glazed ceramic bowl with a rolled rim and a loop handle.
  kit.add(
    P.lathe([[0, 0], [0.22, 0], [0.31, 0.06], [0.43, 0.38], [0.47, 0.6], [0.48, 0.64], [0.45, 0.64], [0.42, 0.4], [0.3, 0.12], [0, 0.1]], 36, 0.025, 2),
    { ...GLAZE, ao: (p) => 0.72 + 0.28 * smooth(0.25, 0.8, p.y), matrix: at(BOWL_X, 0.22, 0) },
  );
  kit.add(P.torus(0.475, 0.022, 8, 36), { ...GLAZE, outline: 0.3, matrix: at(BOWL_X, 0.86, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.11, 0.024, 6, 16, Math.PI * 1.2), { ...GLAZE, matrix: at(BOWL_X + 0.5, 0.62, 0, [0, 0, -Math.PI * 0.6]) });
  // A blue stripe fired into the glaze.
  kit.add(P.torus(0.455, 0.012, 4, 36), { color: '#3d6fd6', gloss: 0.9, coat: 0.6, outline: 0, fixedColor: true, matrix: at(BOWL_X, 0.74, 0, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

/** The motor head, built around its hinge. */
function mixerHead(): THREE.BufferGeometry {
  const kit = new Kit();
  const enamel = { color: '#ffffff', gloss: 0.88, coat: 0.55, pattern: Pattern.Enamel, wear: 0.25 };
  kit.add(P.capsule(0.27, 0.72, 8, 22), { ...enamel, matrix: at(0.38, 0.06, 0, [0, 0, Math.PI / 2], [1, 1, 0.94]) });
  // Chrome decorative belt, nose attachment hub with knurled thumbscrew, and seamless dome tail cap.
  kit.add(P.torus(0.272, 0.028, 8, 28), { ...POLISHED, matrix: at(0.72, 0.06, 0, [0, Math.PI / 2, 0], [1, 1, 0.94]) });
  kit.add(P.puck(0.13, 0.11, 0.07, 18, 0.015), { ...POLISHED, matrix: at(0.99, 0.08, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.puck(0.085, 0.08, 0.05, 16, 0.012), { ...M.chrome, pattern: Pattern.Knurl, matrix: at(1.06, 0.08, 0, [0, 0, -Math.PI / 2]) });
  // Contoured chrome dome tail cap hugging the exact rear hemisphere (x = 0.02 down to -0.26) — zero floating disc!
  kit.add(
    P.lathe([[0.276, 0], [0.274, 0.05], [0.256, 0.11], [0.214, 0.18], [0.145, 0.24], [0.065, 0.275], [0, 0.282]], 22, 0.015, 2),
    { ...POLISHED, matrix: at(0.02, 0.06, 0, [0, 0, Math.PI / 2], [1, 1, 0.94]) },
  );
  kit.add(P.torus(0.275, 0.016, 6, 24), { ...POLISHED, outline: 0.25, matrix: at(0.02, 0.06, 0, [0, Math.PI / 2, 0], [1, 1, 0.94]) });
  // Recessed cooling vent louvres conforming to the rear chrome dome.
  for (const dy of [-0.075, -0.025, 0.025, 0.075]) {
    const rAtY = Math.sqrt(Math.max(0.01, 0.27 * 0.27 - dy * dy));
    kit.add(P.slab(0.03, 0.018, rAtY * 0.92), { ...M.darkIron, outline: 0, detail: 1, matrix: at(0.02 - rAtY * 0.98, 0.06 + dy, 0) });
  }
  kit.add(P.box(0.54, 0.026, 0.085, 0.012, 1), { ...POLISHED, outline: 0.3, matrix: at(0.4, 0.335, 0) });
  // Planetary socket under the head.
  kit.add(P.puck(0.078, 0.064, 0.065, 14, 0.012), { ...POLISHED, matrix: at(SOCKET[0], SOCKET[1] + 0.02, 0) });
  return kit.build();
}

/** An industrial flat paddle + multi-wire beater on a shaft, hung from the origin. */
function mixerBeater(): THREE.BufferGeometry {
  const kit = new Kit();
  rod(kit, V(0, 0, 0), V(0, -0.22, 0), 0.028, POLISHED, 8);
  kit.add(P.puck(0.044, 0.036, 0.045, 12, 0.008), { ...POLISHED, outline: 0, matrix: at(0, -0.22, 0) });
  // Outer paddle frame + crossed internal whisk wires.
  kit.add(P.torus(0.155, 0.02, 6, 24), { ...POLISHED, matrix: at(0, -0.4, 0, [0, 0, 0], [1, 1.28, 1]) });
  kit.add(P.torus(0.138, 0.011, 5, 20), { ...POLISHED, outline: 0, matrix: at(0, -0.4, 0, [0, Math.PI / 3, 0], [1, 1.22, 1]) });
  kit.add(P.torus(0.138, 0.011, 5, 20), { ...POLISHED, outline: 0, matrix: at(0, -0.4, 0, [0, -Math.PI / 3, 0], [1, 1.22, 1]) });
  rod(kit, V(0, -0.22, 0), V(0, -0.58, 0), 0.016, POLISHED, 6);
  rod(kit, V(-0.14, -0.4, 0), V(0.14, -0.4, 0), 0.014, POLISHED, 6);
  return kit.build();
}

/** The batch in the bowl, tumbling the whole time. */
function mixerBatch(): THREE.BufferGeometry {
  const kit = new Kit();
  puffs(kit, 0, 0, 0, 0.34, 0.34, 15, 0.082, 31);
  return kit.build();
}

function mixerTrim25(): THREE.BufferGeometry {
  // Earned at 25: a fitted chrome pouring shield seated directly on the bowl rim with 3 rim clips, plus base chrome trim.
  const kit = new Kit();
  // Inner guard collar hugging the rolled bowl rim (y = 0.86, r = 0.475) — zero floating gap!
  kit.add(P.torus(0.482, 0.026, 6, 36, Math.PI * 1.45), { ...POLISHED, matrix: at(BOWL_X, 0.876, 0, [Math.PI / 2, 0, Math.PI * 0.28]) });
  // Flared pouring chute on the front-right bowl rim.
  kit.add(P.box(0.24, 0.03, 0.28, 0.014, 1), { ...POLISHED, outline: 0.3, matrix: at(BOWL_X + 0.34, 0.905, 0.34, [0.35, -0.78, 0.28]) });
  for (const side of [-1, 1]) {
    kit.add(P.slab(0.22, 0.055, 0.018), { ...POLISHED, outline: 0.2, matrix: at(BOWL_X + 0.34 + side * 0.085, 0.92, 0.34 - side * 0.085, [0.35, -0.78, 0.28]) });
  }
  // Three snug chrome clips clasping directly onto the ceramic bowl rim.
  for (const a of [-0.7, 1.25, 2.75]) {
    const cx = BOWL_X + Math.cos(a) * 0.482;
    const cz = Math.sin(a) * 0.482;
    kit.add(P.box(0.055, 0.085, 0.065, 0.012, 1), { ...POLISHED, outline: 0.25, matrix: at(cx, 0.858, cz, [0, -a, 0]) });
  }
  // Base perimeter chrome bumper trim.
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

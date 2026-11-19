import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { at, glassCase, Kit, M, P, paint, Pattern, puffs, putIf, putLocal, rod, smooth, V, windUp, type UnitDef } from './common.ts';
import { CINEMA_TOP } from './entrances.ts';

const TRUCK_WHEEL_RADIUS = 0.46;

// Cinema popcorn machine ---------------------------------------------------------

function cinemaBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Lacquered base with a brass kick plate and two cupboard doors.
  kit.add(P.box(2.2, 1.1, 1.5, 0.08, 2), { ...M.red, matrix: at(0, 0.66, 0) });
  kit.add(P.box(2.26, 0.12, 1.56, 0.03, 1), { ...M.brass, matrix: at(0, 0.06, 0) });
  kit.add(P.box(2.3, 0.08, 1.6, 0.03, 1), { ...M.brass, matrix: at(0, 1.24, 0) });
  for (const x of [-0.53, 0.53]) {
    kit.add(P.box(0.96, 0.8, 0.03, 0.02, 1), { ...M.deepRed, outline: 0, matrix: at(x, 0.66, 0.76) });
    kit.add(P.box(0.8, 0.64, 0.02, 0.012, 1), { ...M.red, outline: 0, matrix: at(x, 0.66, 0.78) });
    kit.add(P.sphere(0.04, 10, 8), { ...M.brass, outline: 0, matrix: at(x + (x < 0 ? 0.36 : -0.36), 0.66, 0.81) });
  }
  // Heated glass cabinet, lit from inside.
  glassCase(kit, 0, 1.28, 2.76, 0, 1.06, 0.7, M.brass, 0.07);
  kit.add(P.box(2.04, 0.04, 1.34, 0.01, 1), { color: '#fff1c8', emissive: 0.55, outline: 0, fixedColor: true, matrix: at(0, 1.3, 0) });
  puffs(kit, 0, 1.35, 0, 0.9, 0.55, 44, 0.12, 2);
  for (const x of [-0.8, 0, 0.8]) kit.add(P.capsule(0.03, 0.34, 3, 8), { ...M.glow, emissive: 1, matrix: at(x, 2.68, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.box(2.3, 0.09, 1.6, 0.03, 1), { ...M.brass, matrix: at(0, 2.8, 0) });
  // Marquee: a sign board in a stepped frame, with fixed bulbs round it.
  kit.add(P.box(2.46, 0.72, 0.24, 0.07, 2), { ...M.red, matrix: at(0, 3.22, 0.1) });
  kit.add(P.box(2.2, 0.48, 0.03, 0.02, 1), { ...M.brass, outline: 0, matrix: at(0, 3.22, 0.225) });
  kit.add(P.lathe([[0, 0], [0.3, 0], [0.2, 0.14], [0.05, 0.2], [0, 0.3]], 12, 0.03, 1), { ...M.brass, matrix: at(0, 3.58, 0.1) });
  // Striped paper bags hanging ready on a brass rail at the side.
  rod(kit, V(1.17, 1.16, -0.45), V(1.17, 1.16, 0.45), 0.014, M.brass, 5);
  for (const z of [-0.3, 0, 0.3]) {
    kit.add(P.box(0.1, 0.26, 0.18, 0.02, 1), { color: '#fff4dc', gloss: 0.12, pattern: Pattern.Paper, outline: 0.4, fixedColor: true, detail: 1, matrix: at(1.2, 0.98, z) });
    kit.add(P.box(0.102, 0.26, 0.05, 0.004, 1), { ...M.red, outline: 0, detail: 2, matrix: at(1.2, 0.98, z) });
  }
  return kit.build();
}

/** The kettle on its arm, which tips the batch into the cabinet. */
function cinemaKettle(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.lathe([[0, -0.2], [0.3, -0.2], [0.38, -0.08], [0.39, 0.13], [0.44, 0.17], [0.34, 0.2], [0, 0.06]], 22, 0.03, 2), { ...M.copper, emissive: 0.1 });
  kit.add(P.torus(0.4, 0.016, 5, 22), { ...M.brass, outline: 0, matrix: at(0, 0.16, 0, [Math.PI / 2, 0, 0]) });
  rod(kit, V(-0.4, 0, 0), V(-0.82, 0.05, 0), 0.03, M.steel, 6);
  kit.add(P.sphere(0.055, 8, 6), { ...M.red, matrix: at(-0.84, 0.05, 0) });
  puffs(kit, 0, 0.13, 0, 0.26, 0.26, 4, 0.1, 7);
  return kit.build();
}

const bulbRow = (phase: number): (() => THREE.BufferGeometry) => () => {
  const kit = new Kit();
  for (let i = 0; i < 26; i += 1) {
    if (i % 2 !== phase) continue;
    const top = i < 13;
    const x = top ? -1.14 + (i / 12) * 2.28 : -1.14 + ((i - 13) / 12) * 2.28;
    kit.add(P.sphere(0.058, 8, 6), { ...M.bulb, matrix: at(x, top ? 3.54 : 2.91, 0.24) });
  }
  return kit.build();
};

// Delivery truck -----------------------------------------------------------------

function truckBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(5.3, 0.2, 1.62, 0.05, 2), { ...M.darkIron, matrix: at(0.1, 0.62, 0) });
  kit.add(P.box(5.1, 0.1, 1.72, 0.03, 1), { ...M.steel, matrix: at(0.05, 0.74, 0) });
  // Cargo box: painted boards, a roof rail and a serving hatch on the near side.
  for (let i = 0; i < 9; i += 1) {
    kit.add(P.box(0.4, 1.76, 1.72, 0.02, 1), { ...(i % 2 ? M.cream : M.red), outline: i === 0 || i === 8 ? 1 : 0.2, matrix: at(-2.1 + i * 0.4, 1.66, 0) });
  }
  kit.add(P.box(3.76, 0.1, 1.86, 0.03, 1), { ...M.brass, matrix: at(-0.5, 2.58, 0) });
  kit.add(P.box(3.76, 0.08, 1.8, 0.025, 1), { ...M.brass, matrix: at(-0.5, 0.82, 0) });
  kit.add(P.box(1.9, 0.86, 0.04, 0.02, 1), { ...M.dark, matrix: at(-0.45, 1.78, 0.865) });
  kit.add(P.box(1.74, 0.72, 0.02, 0.01, 1), { color: '#ffd28d', emissive: 0.6, outline: 0, fixedColor: true, matrix: at(-0.45, 1.78, 0.872) });
  puffs(kit, -0.45, 1.46, 0.92, 0.72, 0.06, 7, 0.11, 4);
  kit.add(P.box(2.06, 0.06, 0.26, 0.02, 1), { ...M.steel, matrix: at(-0.45, 1.34, 1) });
  // Striped drop-down awning over the hatch.
  for (let i = 0; i < 7; i += 1) kit.add(P.box(0.3, 0.03, 0.64, 0.01, 1), { ...(i % 2 ? M.canvasCream : M.canvasRed), outline: 0.3, matrix: at(-1.35 + i * 0.3, 2.34, 1.15, [0.46, 0, 0]) });
  // Rounded cab with real windows.
  kit.add(P.box(1.42, 0.86, 1.68, 0.14, 3), { ...M.butter, matrix: at(2.06, 1.14, 0) });
  kit.add(P.box(1.1, 0.68, 1.56, 0.16, 3), { ...M.butter, matrix: at(1.92, 1.82, 0) });
  // Windscreen, side windows and their rubber seals.
  kit.add(P.box(0.03, 0.46, 1.3, 0.012, 1), { ...M.windowPane, matrix: at(2.475, 1.84, 0) });
  kit.add(P.box(0.022, 0.52, 1.38, 0.008, 1), { ...M.rubber, outline: 0, matrix: at(2.468, 1.84, 0) });
  for (const z of [-0.79, 0.79]) {
    kit.add(P.box(0.72, 0.42, 0.024, 0.01, 1), { ...M.windowPane, matrix: at(1.92, 1.85, z) });
    kit.add(P.box(0.8, 0.5, 0.016, 0.006, 1), { ...M.rubber, outline: 0, matrix: at(1.92, 1.85, z * 0.994) });
    kit.add(P.box(0.14, 0.04, 0.03, 0.01, 1), { ...M.chrome, outline: 0, matrix: at(1.62, 1.34, z * 1.075) });
  }
  // Nose: grille, bumper, lamps, door handle and wing mirrors.
  for (let i = 0; i < 6; i += 1) kit.add(P.box(0.02, 0.05, 0.84, 0.008, 1), { ...M.chrome, outline: 0, detail: 1, matrix: at(2.78, 0.9 + i * 0.075, 0) });
  kit.add(P.box(0.16, 0.2, 1.76, 0.05, 2), { ...M.chrome, matrix: at(2.82, 0.66, 0) });
  for (const z of [-0.6, 0.6]) {
    kit.add(P.puck(0.13, 0.11, 0.06, 14, 0.01), { ...M.chrome, matrix: at(2.76, 1.2, z, [0, 0, -Math.PI / 2]) });
    kit.add(P.sphere(0.1, 10, 8), { ...M.bulb, matrix: at(2.8, 1.2, z, [0, 0, 0], [0.5, 1, 1]) });
    rod(kit, V(2.3, 1.72, z * 1.42), V(2.48, 1.84, z * 1.62), 0.014, M.iron, 5);
    kit.add(P.box(0.05, 0.2, 0.13, 0.02, 1), { ...M.chrome, matrix: at(2.5, 1.86, z * 1.65) });
  }
  // A giant bucket on the roof, so it reads from far away.
  kit.add(P.lathe([[0, 0], [0.5, 0], [0.72, 0.95], [0.67, 0.96], [0, 0.22]], 24, 0.02, 1), { color: '#ffffff', gloss: 0.65, coat: 0.3, fixedColor: true, matrix: at(-0.8, 2.64, 0), colorFn: (p, _n, out) => { if (Math.cos(Math.atan2(p.z, p.x + 0.8) * 8) > 0) out.set('#d62f38'); } });
  puffs(kit, -0.8, 3.46, 0, 0.56, 0.56, 12, 0.2, 6);
  return kit.build();
}

function truckAxle(): THREE.BufferGeometry {
  const kit = new Kit();
  const flat: [number, number, number] = [Math.PI / 2, 0, 0];
  rod(kit, V(0, 0, -0.84), V(0, 0, 0.84), 0.04, M.iron, 6);
  for (const side of [-1, 1]) {
    kit.add(P.puck(0.46, 0.46, 0.3, 24, 0.07), { ...M.rubber, matrix: at(0, 0, side * 0.84 - 0.15, flat) });
    kit.add(P.puck(0.27, 0.25, 0.05, 18, 0.012), { ...M.chrome, outline: 0, matrix: at(0, 0, side * 0.84 + side * 0.15 - 0.025, flat) });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      kit.add(P.sphere(0.028, 6, 4), { ...M.darkIron, outline: 0, detail: 1, matrix: at(Math.cos(a) * 0.17, Math.sin(a) * 0.17, side * 1.0) });
    }
  }
  return kit.build();
}

function truckTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: roof beacons and running lights.
  for (const x of [-2.2, 1.2]) kit.add(P.sphere(0.1, 10, 8), { color: '#ffb648', emissive: 1, outline: 0, fixedColor: true, matrix: at(x, 2.72, 0) });
  for (let i = 0; i < 8; i += 1) kit.add(P.sphere(0.03, 6, 4), { ...M.bulb, matrix: at(-2.2 + i * 0.5, 0.92, 0.88) });
  return kit.build();
}

// Caramel factory ----------------------------------------------------------------

function factoryBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(4.8, 0.14, 3, 0.04, 1), { ...M.concrete, matrix: at(0, 0.07, 0) });
  kit.add(P.box(4.6, 2.2, 2.8, 0.06, 2), { ...paint(M.brick, { pattern: 4.75 }), ao: (p) => 0.68 + 0.32 * Math.min(1, p.y), matrix: at(0, 1.2, 0) });
  kit.add(P.box(4.68, 0.12, 2.88, 0.03, 1), { ...M.concrete, matrix: at(0, 2.34, 0) });
  // Saw-tooth roof with glazed north lights, the silhouette everyone draws for "factory".
  for (let i = 0; i < 4; i += 1) {
    const x = -1.72 + i * 1.15;
    kit.add(P.box(1.26, 0.07, 2.86, 0.02, 1), { ...M.steel, gloss: 0.4, matrix: at(x, 2.78, 0, [0, 0, 0.72]) });
    kit.add(P.box(0.04, 0.86, 2.76, 0.01, 1), { color: '#ffe0a0', emissive: 0.75, outline: 0, fixedColor: true, matrix: at(x + 0.46, 2.76, 0) });
    kit.add(P.box(0.015, 0.84, 2.78, 0.004, 1), { ...M.glassWarm, matrix: at(x + 0.49, 2.76, 0) });
    // Glazing bars divide each north light into panes.
    for (let bar = 0; bar < 7; bar += 1) kit.add(P.box(0.025, 0.84, 0.03, 0.006, 1), { ...M.iron, outline: 0, matrix: at(x + 0.5, 2.76, -1.2 + bar * 0.4) });
    kit.add(P.box(0.025, 0.03, 2.78, 0.006, 1), { ...M.iron, outline: 0, matrix: at(x + 0.5, 2.76, 0) });
  }
  // Arched, glowing windows with stone sills.
  for (let i = 0; i < 4; i += 1) {
    const x = -1.72 + i * 0.86;
    kit.add(P.box(0.52, 0.74, 0.04, 0.03, 1), { color: '#ffd98a', emissive: 0.72, outline: 0, fixedColor: true, matrix: at(x, 1.38, 1.41) });
    kit.add(P.box(0.03, 0.74, 0.03, 0.006, 1), { ...M.iron, outline: 0, matrix: at(x, 1.38, 1.43) });
    kit.add(P.box(0.52, 0.03, 0.03, 0.006, 1), { ...M.iron, outline: 0, matrix: at(x, 1.42, 1.43) });
    kit.add(P.box(0.62, 0.07, 0.14, 0.02, 1), { ...M.concrete, matrix: at(x, 0.98, 1.44) });
  }
  // Loading door with a canopy.
  kit.add(P.box(0.98, 1.26, 0.06, 0.02, 1), { ...M.steel, gloss: 0.3, matrix: at(1.62, 0.76, 1.41) });
  for (let i = 0; i < 8; i += 1) kit.add(P.box(0.92, 0.016, 0.02, 0.004, 1), { ...M.iron, outline: 0, detail: 1, matrix: at(1.62, 0.26 + i * 0.145, 1.45) });
  kit.add(P.box(1.26, 0.05, 0.56, 0.015, 1), { ...M.red, matrix: at(1.62, 1.52, 1.62, [0.2, 0, 0]) });
  // A caramel tank and the pipes that feed the main hall.
  kit.add(P.lathe([[0, 0], [0.42, 0], [0.46, 0.08], [0.46, 1.02], [0.34, 1.26], [0, 1.32]], 22, 0.05, 2), { ...M.copper, matrix: at(-2.72, 0.14, 0.72) });
  for (const y of [0.42, 0.82]) kit.add(P.torus(0.47, 0.018, 5, 24), { ...M.brass, outline: 0, matrix: at(-2.72, y, 0.72, [Math.PI / 2, 0, 0]) });
  kit.add(P.tube([V(-2.72, 1.42, 0.72), V(-2.72, 1.72, 0.72), V(-2.45, 1.92, 0.9), V(-2.3, 1.92, 1.2)], 0.05, 14, 8), M.copper);
  kit.add(P.tube([V(-2.3, 0.5, -0.8), V(-2.62, 0.5, -0.8), V(-2.82, 0.8, -0.8), V(-2.82, 1.7, -0.8), V(-2.3, 2.1, -0.8)], 0.06, 20, 8), M.steel);
  // Main chimney, in brick with a stone cap.
  kit.add(P.lathe([[0, 0], [0.52, 0], [0.38, 3.2], [0.46, 3.3], [0.46, 3.5], [0.34, 3.5], [0.3, 3.2], [0, 3.1]], 20, 0.04, 1), { ...paint(M.brick, { pattern: 4.6 }), matrix: at(-1.6, 2.1, -0.7) });
  kit.add(P.torus(0.44, 0.04, 6, 20), { ...M.concrete, outline: 0, matrix: at(-1.6, 4.9, -0.7, [Math.PI / 2, 0, 0]) });
  // A tread-plate ramp up to the loading door and a shift notice pinned beside it.
  kit.add(P.box(1.04, 0.05, 0.56, 0.015, 1), { ...M.steel, pattern: Pattern.Tread + 0.2, matrix: at(1.62, 0.15, 1.7, [0.12, 0, 0]) });
  kit.add(P.box(0.34, 0.24, 0.015, 0.01, 1), { color: '#fff4dc', gloss: 0.12, pattern: Pattern.Paper, outline: 0.4, fixedColor: true, detail: 1, matrix: at(0.92, 1.05, 1.43) });
  for (let row = 0; row < 3; row += 1) kit.add(P.box(0.24, 0.012, 0.004, 0.002, 1), { ...M.dark, outline: 0, detail: 2, matrix: at(0.92, 1.12 - row * 0.06, 1.44) });
  return kit.build();
}

/** The red valve wheel by the door, always being turned. */
function factoryValve(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.torus(0.17, 0.03, 6, 20), { ...M.red });
  for (let i = 0; i < 3; i += 1) kit.add(P.box(0.33, 0.03, 0.03, 0.01, 1), { ...M.red, outline: 0, matrix: at(0, 0, 0, [0, 0, (i / 3) * Math.PI]) });
  return kit.build();
}

/** Boxes riding a little conveyor out of the door. */
function factoryCrates(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 3; i += 1) {
    kit.add(P.box(0.24, 0.2, 0.24, 0.03, 1), { ...M.wood, matrix: at(i * 0.5, 0, 0) });
    kit.add(P.box(0.25, 0.04, 0.25, 0.01, 1), { ...M.red, outline: 0, matrix: at(i * 0.5, 0.02, 0) });
  }
  return kit.build();
}

function factoryTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a second chimney and a water tower on the roof.
  kit.add(P.lathe([[0, 0], [0.4, 0], [0.3, 2.4], [0.38, 2.5], [0.38, 2.66], [0.26, 2.66], [0, 2.4]], 16, 0.03, 1), { ...paint(M.brick, { pattern: 4.6 }), matrix: at(0.1, 2.1, -0.8) });
  for (const [x, z] of [[1.4, -0.5], [2, -0.5], [1.4, -1.1], [2, -1.1]] as const) rod(kit, V(x, 2.4, z), V(x, 3.3, z), 0.03, M.iron, 6);
  kit.add(P.lathe([[0, 0], [0.46, 0], [0.48, 0.5], [0, 0.82]], 16, 0.04, 2), { ...M.wood, matrix: at(1.7, 3.3, -0.8) });
  return kit.build();
}

export const TOWN_MACHINES: Record<'cinema' | 'truck' | 'factory', UnitDef> = {
  cinema: {
    parts: [cinemaBody, cinemaKettle, bulbRow(0), bulbRow(1)],
    shadowParts: 1,
    interval: [1.1, 2],
    muzzle: [0, 2.3, 0.6],
    badge: { at: [0, 0.82, 0.83], size: 0.28 },
    signs: [{ text: SIGN_TEXT.cinema, style: { background: '#fff3cf', color: '#a31d28', aspect: 4.6, glow: 0.85 }, width: 2.1, height: 0.42, matrix: at(0, 3.22, 0.245) }],
    pose(st, time, index, tier, base, put) {
      put(0, base);
      const arriving = st.enter < 1;
      // It takes a bow at the top of the lift.
      const bow = arriving && st.age > CINEMA_TOP ? Math.sin(Math.min(1, (st.age - CINEMA_TOP) / 0.42) * Math.PI) * 0.8 : 0;
      const tip = windUp(st) * -0.25 + st.kick * st.kick * 1.5 + bow;
      putLocal(base, put, 1, 0.1, 2.3 - st.kick * 0.04, 0, 0, 0, tip);
      // The marquee chases faster on a machine with a following, and races on the way up.
      const chase = Math.floor(time * (arriving ? 16 : tier >= 1 ? 7 : 3.5) + index) % 2 === 0;
      const allLit = tier >= 2 || (arriving && st.age > CINEMA_TOP);
      putIf(put, 2, chase || allLit, base);
      putIf(put, 3, !chase || allLit, base);
    },
    fire(st, host) {
      st.kick = 1;
      if (host.rng.next() < 0.3) host.sound('work-cinema');
    },
  },
  truck: {
    parts: [truckBody, truckAxle, truckAxle, truckTrim],
    shadowParts: 1,
    interval: [1.5, 2.6],
    muzzle: [-0.45, 1.6, 1.4],
    badge: { at: [0.78, 1.06, 0.89], size: 0.32 },
    signs: [{ text: SIGN_TEXT.truck, style: { background: '#fff3d6', color: '#a31d28', border: '#d62f38', aspect: 5 }, width: 1.8, height: 0.36, matrix: at(-0.45, 1.06, 0.875) }],
    pose(st, time, index, tier, base, put) {
      // Backs up a little, then rolls forward to hand the batch over.
      const roll = smooth(0.35, 1, 1 - st.kick) * 0.28 - windUp(st, 0.5) * 0.28 + st.kick * 0.1;
      const idle = Math.sin(time * 9 + index) * 0.006;
      putLocal(base, put, 0, roll, idle, 0, 0, 0, roll * 0.01);
      // Wheels turn by the distance covered, so nothing skids on the way in.
      const turn = -roll * 2.2 - st.spin * 0.05 - st.enterX / TRUCK_WHEEL_RADIUS;
      putLocal(base, put, 1, 1.9 + roll, 0.46, 0, 0, 0, turn);
      putLocal(base, put, 2, -1.5 + roll, 0.46, 0, 0, 0, turn);
      if (tier >= 1) putLocal(base, put, 3, roll, idle, 0);
      else putLocal(base, put, 3, 0, 0, 0, 0, 0, 0, 0);
    },
    fire(st, host) {
      st.kick = 1;
      if (host.rng.next() < 0.3) host.sound('truck-horn');
    },
  },
  factory: {
    parts: [factoryBody, factoryValve, factoryCrates, factoryTrim],
    shadowParts: 1,
    interval: [1.6, 2.8],
    muzzle: [-1.6, 5.7, -0.7],
    badge: { at: [0.43, 1.98, 1.43], size: 0.36 },
    signs: [{ text: SIGN_TEXT.caramel, style: { background: '#ffc63f', color: '#7a2a12', border: '#7a2a12', aspect: 4.2 }, width: 2.1, height: 0.5, matrix: at(0.1, 3.42, 1.32) }],
    pose(st, time, index, tier, base, put) {
      put(0, base);
      putLocal(base, put, 1, -2.32, 0.92, 1.42, 0, 0, st.spin * 1.5);
      const travel = ((time * 0.35 + index * 0.3) % 1) * 0.5;
      putLocal(base, put, 2, 0.98 + travel, 0.32, 1.76, 0, 0, 0);
      putIf(put, 3, tier >= 1, base);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.caramel(x, y, z, s);
      if (host.rng.next() < 0.35) host.sound('work-factory');
    },
  },
};

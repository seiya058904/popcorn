import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { at, Kit, M, P, Pattern, puffs, putIf, putLocal, rod, smooth, V, windUp, type UnitDef } from './common.ts';

const noise = (x: number, y: number, z: number): number =>
  Math.sin(x * 2.1 + y * 1.3) * Math.cos(z * 2.7 - y * 0.9) * 0.5 + Math.sin(x * 5.3 - z * 4.1 + y * 3.7) * 0.28 + Math.sin(z * 9.1 + x * 7.7 - y * 6.3) * 0.14;

// Airship ------------------------------------------------------------------------

const hullRadius = (x: number): number => 1.5 * Math.pow(Math.max(0, 1 - (x / 3.2) ** 2), 0.62);

function airshipBody(): THREE.BufferGeometry {
  const kit = new Kit();
  const stripe = new THREE.Color('#d62f38');
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i += 1) {
    const x = -3.2 + (i / 24) * 6.4;
    profile.push([hullRadius(x), x]);
  }
  profile[0] = [0, -3.2];
  profile[24] = [0, 3.2];
  // Sewn fabric gores in two colors.
  kit.add(P.lathe(profile, 120, 0.01, 1), {
    color: '#ffc63f',
    gloss: 0.55,
    coat: 0.25,
    pattern: Pattern.Fabric,
    fixedColor: true,
    matrix: at(0, 0, 0, [0, 0, -Math.PI / 2]),
    colorFn: (p, _n, out) => {
      if (Math.cos(Math.atan2(p.z, p.y) * 6) > 0.25) out.copy(stripe);
    },
  });
  // Frame hoops show through the skin.
  for (const x of [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4]) {
    kit.add(P.torus(hullRadius(x) + 0.006, 0.014, 5, 44), { ...M.brass, outline: 0, detail: 1, matrix: at(x, 0, 0, [0, Math.PI / 2, 0]) });
  }
  kit.add(P.sphere(0.13, 12, 9), { ...M.brass, matrix: at(3.18, 0, 0) });
  // Cruciform tail with struts.
  for (const rx of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const turn = new THREE.Matrix4().makeRotationX(rx);
    kit.add(P.box(1, 0.86, 0.07, 0.03, 2), { ...M.red, matrix: turn.clone().multiply(at(-2.68, 1.08, 0, [0, 0, 0.32])) });
    kit.add(P.box(0.32, 0.8, 0.09, 0.02, 1), { ...M.cream, outline: 0.4, matrix: turn.clone().multiply(at(-3.08, 1.1, 0, [0, 0, 0.32])) });
  }
  // Gondola: a little railcar with lit windows.
  kit.add(P.box(1.9, 0.44, 0.66, 0.16, 3), { ...M.cream, matrix: at(0.2, -1.86, 0) });
  kit.add(P.box(1.96, 0.05, 0.72, 0.02, 1), { ...M.brass, matrix: at(0.2, -1.7, 0) });
  kit.add(P.box(1.96, 0.05, 0.72, 0.02, 1), { ...M.brass, matrix: at(0.2, -2.06, 0) });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      kit.add(P.box(0.24, 0.17, 0.012, 0.004, 1), { color: '#ffdf9c', emissive: 0.85, outline: 0, fixedColor: true, matrix: at(-0.52 + i * 0.36, -1.84, side * 0.335) });
    }
  }
  for (const x of [-0.5, 0.2, 0.9]) for (const z of [-0.26, 0.26]) rod(kit, V(x, -1.66, z), V(x * 1.05, -1.42, z * 1.4), 0.016, M.iron, 5);
  // Engine pods on outriggers.
  for (const side of [-1, 1]) {
    rod(kit, V(-0.5, -1.68, side * 0.3), V(-0.9, -1.34, side * 1.32), 0.026, M.steel, 6);
    kit.add(P.capsule(0.15, 0.5, 4, 12), { ...M.steel, matrix: at(-0.9, -1.34, side * 1.32, [0, 0, Math.PI / 2]) });
    kit.add(P.torus(0.15, 0.018, 5, 14), { ...M.brass, outline: 0, matrix: at(-0.72, -1.34, side * 1.32, [0, Math.PI / 2, 0]) });
  }
  // The drop hatch underneath.
  kit.add(P.puck(0.3, 0.16, 0.26, 14, 0.03), { ...M.steel, matrix: at(0.2, -2.08, 0, [Math.PI, 0, 0]) });
  puffs(kit, 0.2, -2.42, 0, 0.09, 0.09, 2, 0.08, 3);
  return kit.build();
}

function airshipProp(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 3; i += 1) kit.add(P.box(0.035, 0.84, 0.13, 0.015, 1), { ...M.darkWood, gloss: 0.6, outline: 0.4, matrix: at(0, 0, 0, [(i / 3) * Math.PI, 0.25, 0]) });
  kit.add(P.sphere(0.075, 10, 8), { ...M.chrome, outline: 0 });
  return kit.build();
}

function airshipTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: running lights and a trailing pennant.
  for (let i = 0; i < 9; i += 1) {
    const x = -2.4 + i * 0.6;
    kit.add(P.sphere(0.05, 7, 5), { ...M.bulb, matrix: at(x, -hullRadius(x) - 0.02, 0.1) });
  }
  rod(kit, V(-3.2, 0, 0), V(-4.1, -0.25, 0), 0.012, M.steel, 5);
  kit.add(P.box(0.9, 0.22, 0.01, 0.003, 1), { ...M.canvasRed, matrix: at(-4.1, -0.38, 0, [0, 0, -0.14]) });
  return kit.build();
}

// Volcano furnace ----------------------------------------------------------------

function volcanoBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Cut into separate facets, so the displaced surface reads as broken rock instead of cloth.
  const cone = P.lathe([[0, 0], [2.75, 0], [2.42, 0.42], [1.74, 1.2], [1.06, 2.3], [0.86, 2.86], [0.72, 2.98], [0.54, 2.82], [0.34, 2.32], [0, 2.3]], 54, 0.14, 3).toNonIndexed();
  const position = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.01 || y < 0.03) continue;
    const a = Math.atan2(z, x);
    // Sample around the circle so the seam closes.
    const amount = 1 + noise(Math.cos(a) * 3.2, y * 2.2, Math.sin(a) * 3.2) * 0.2 * smooth(0, 0.4, y) * (1 - smooth(2.3, 2.9, y) * 0.8);
    position.setXYZ(i, x * amount, y + noise(Math.cos(a) * 4.6, y * 1.7, Math.sin(a) * 4.6) * 0.09 * smooth(0, 0.3, y), z * amount);
  }
  cone.computeVertexNormals();
  // Lava runs down the gullies in three winding rivers.
  const lava = (p: THREE.Vector3): number => {
    const a = Math.atan2(p.z, p.x);
    const wander = a * 3 + 0.6 + Math.sin(p.y * 2.4 + a) * 0.5;
    return Math.max(p.y > 2.74 ? 1 : 0, Math.pow(Math.max(0, Math.cos(wander)), 30) * Math.min(1, p.y / 0.7));
  };
  const rock = new THREE.Color('#5b4351');
  const ash = new THREE.Color('#8a7078');
  const hot = new THREE.Color('#ff7a2a');
  kit.add(cone, {
    color: rock,
    gloss: 0.1,
    pattern: Pattern.Rubber,
    fixedColor: true,
    colorFn: (p, n, out) => {
      out.lerp(ash, smooth(0.35, 0.9, n.y) * 0.5);
      out.lerp(hot, lava(p));
    },
    emissiveFn: (p) => lava(p) * 0.9,
  });
  // A riveted furnace ring and feed pipes: someone has industrialized this volcano.
  kit.add(P.torus(2.84, 0.09, 8, 64), { ...M.iron, matrix: at(0, 0.08, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    kit.add(P.box(0.24, 0.16, 0.14, 0.03, 1), { ...M.steel, matrix: at(Math.cos(a) * 2.84, 0.14, Math.sin(a) * 2.84, [0, -a, 0]) });
  }
  kit.add(P.torus(0.95, 0.055, 7, 40), { ...M.steel, matrix: at(0, 2.72, 0, [Math.PI / 2, 0, 0]) });
  for (const a of [0.8, 2.9, 5]) {
    kit.add(P.tube([V(Math.cos(a) * 2.84, 0.16, Math.sin(a) * 2.84), V(Math.cos(a) * 2.34, 1.02, Math.sin(a) * 2.34), V(Math.cos(a) * 1.5, 2.16, Math.sin(a) * 1.5), V(Math.cos(a) * 1, 2.72, Math.sin(a) * 1)], 0.05, 18, 7), M.copper);
  }
  return kit.build();
}

function volcanoGlow(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.58, 0.58, 0.05, 22, 0.01), { color: '#ffb04a', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, 2.42, 0) });
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4;
    kit.add(P.sphere(0.09 + (i % 3) * 0.03, 7, 5), { color: '#ffe08a', emissive: 1, outline: 0, fixedColor: true, matrix: at(Math.cos(a) * (0.1 + i * 0.05), 2.5, Math.sin(a) * (0.1 + i * 0.05)) });
  }
  return kit.build();
}

function volcanoTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a smelter stack with a warning light.
  kit.add(P.puck(0.24, 0.18, 1.1, 12, 0.02), { ...M.iron, matrix: at(1.7, 0.62, 1.2) });
  kit.add(P.torus(0.19, 0.03, 6, 14), { ...M.brass, outline: 0, matrix: at(1.7, 1.72, 1.2, [Math.PI / 2, 0, 0]) });
  kit.add(P.sphere(0.08, 8, 6), { color: '#ff4a2a', emissive: 1, outline: 0, fixedColor: true, matrix: at(1.7, 1.86, 1.2) });
  return kit.build();
}

// Orbital mirror station ----------------------------------------------------------

function orbitalBody(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.56, 0.44, 0.92, 8, 0.05), { ...M.chrome, matrix: at(0, -0.46, 0) });
  kit.add(P.torus(0.6, 0.05, 8, 28), { ...M.brass, matrix: at(0, 0.1, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.5, 0.03, 6, 24), { ...M.brass, outline: 0, matrix: at(0, -0.36, 0, [Math.PI / 2, 0, 0]) });
  // Foil-wrapped service bay and portholes.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    kit.add(P.sphere(0.055, 8, 6), { color: '#bfe6ff', emissive: 0.8, outline: 0, fixedColor: true, matrix: at(Math.cos(a) * 0.52, -0.12, Math.sin(a) * 0.52) });
  }
  const blue = new THREE.Color('#1c3f93');
  const line = new THREE.Color('#7fa8e8');
  for (const side of [-1, 1]) {
    // Lattice boom out to each solar wing.
    rod(kit, V(side * 0.56, 0.1, -0.1), V(side * 1.3, 0.1, -0.1), 0.02, M.steel, 5);
    rod(kit, V(side * 0.56, 0.1, 0.1), V(side * 1.3, 0.1, 0.1), 0.02, M.steel, 5);
    for (let i = 0; i < 4; i += 1) rod(kit, V(side * (0.56 + i * 0.185), 0.1, i % 2 ? 0.1 : -0.1), V(side * (0.745 + i * 0.185), 0.1, i % 2 ? -0.1 : 0.1), 0.012, M.steel, 4);
    kit.add(P.box(2.6, 0.04, 1.08, 0.01, 1), {
      color: blue,
      gloss: 0.9,
      coat: 0.6,
      fixedColor: true,
      matrix: at(side * 2.6, 0.1, 0),
    });
    for (let i = 0; i <= 8; i += 1) kit.add(P.box(0.018, 0.05, 1.08, 0.004, 1), { color: line, gloss: 0.8, metal: 1, outline: 0, detail: 1, fixedColor: true, matrix: at(side * (1.3 + i * 0.325), 0.1, 0) });
    for (const z of [-0.27, 0, 0.27]) kit.add(P.box(2.6, 0.05, 0.016, 0.004, 1), { color: line, gloss: 0.8, metal: 1, outline: 0, detail: 1, fixedColor: true, matrix: at(side * 2.6, 0.1, z) });
    kit.add(P.box(2.66, 0.06, 0.05, 0.01, 1), { ...M.brass, outline: 0, matrix: at(side * 2.6, 0.1, 0.56) });
    kit.add(P.box(2.66, 0.06, 0.05, 0.01, 1), { ...M.brass, outline: 0, matrix: at(side * 2.6, 0.1, -0.56) });
  }
  // Thrusters underneath, and the lit nozzle.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    kit.add(P.lathe([[0, 0], [0.05, 0], [0.11, -0.16], [0.07, -0.16], [0, -0.04]], 10, 0.01, 1), { ...M.steel, matrix: at(Math.cos(a) * 0.3, -0.48, Math.sin(a) * 0.3) });
  }
  kit.add(P.sphere(0.16, 12, 9), { color: '#ffb648', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, -0.56, 0) });
  return kit.build();
}

/** Segmented mirror, aimed at the moon. */
function orbitalMirror(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.add(P.box(0.44, 0.022, 0.21, 0.006, 1), { color: '#f2f7fc', gloss: 1, metal: 1, outline: 0.3, fixedColor: true, matrix: new THREE.Matrix4().makeRotationY(a).multiply(at(0.32, 0.14, 0, [0, 0, 0.3])) });
    kit.add(P.box(0.5, 0.026, 0.33, 0.006, 1), { color: '#dfe9f2', gloss: 1, metal: 1, outline: 0.3, fixedColor: true, matrix: new THREE.Matrix4().makeRotationY(a + 0.26).multiply(at(0.76, 0.34, 0, [0, 0, 0.5])) });
  }
  kit.add(P.torus(1.02, 0.024, 6, 36), { ...M.brass, matrix: at(0, 0.5, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    rod(kit, V(Math.cos(a) * 1, 0.5, Math.sin(a) * 1), V(0, 1.24, 0), 0.012, M.steel, 5);
  }
  kit.add(P.sphere(0.1, 12, 9), { color: '#fff3c0', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, 1.26, 0) });
  kit.add(P.puck(0.14, 0.1, 0.1, 12, 0.02), { ...M.steel, matrix: at(0, 0, 0) });
  return kit.build();
}

function orbitalTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a comms mast with a beacon.
  rod(kit, V(0.3, 0.14, -0.4), V(0.5, 1.05, -0.75), 0.012, M.steel, 5);
  kit.add(P.lathe([[0, 0], [0.16, 0.08], [0.2, 0.12], [0, 0.03]], 12, 0.008, 1), { ...M.chrome, matrix: at(0.5, 1.05, -0.75, [0.4, 0, 0]) });
  kit.add(P.sphere(0.04, 7, 5), { color: '#ff5a4a', emissive: 1, outline: 0, fixedColor: true, matrix: at(0.5, 1.2, -0.75) });
  return kit.build();
}

export const SKY_MACHINES: Record<'airship' | 'volcano' | 'orbital', UnitDef> = {
  airship: {
    parts: [airshipBody, airshipProp, airshipProp, airshipTrim],
    shadowParts: 1,
    interval: [1, 1.9],
    muzzle: [0.2, -2.5, 0],
    dropHeight: 8,
    signs: [{ text: SIGN_TEXT.airship, style: { background: '#fff3d6', color: '#a31d28', border: '#d62f38', aspect: 5.6 }, width: 2.2, height: 0.42, matrix: at(0, 0.02, 1.56) }],
    pose(st, time, index, tier, base, put) {
      const bob = Math.sin(time * 0.7 + index * 2) * 0.22 - st.kick * 0.05;
      const roll = Math.sin(time * 0.45 + index) * 0.035;
      const pitch = Math.sin(time * 0.33 + index * 1.4) * 0.022;
      putLocal(base, put, 0, 0, bob, 0, roll, 0, pitch);
      for (const [part, side] of [[1, -1], [2, 1]] as const) putLocal(base, put, part, -1.32, bob - 1.34, side * 1.32, st.spin * 9, 0, 0);
      if (tier >= 1) putLocal(base, put, 3, 0, bob, 0, roll, 0, pitch);
      else putLocal(base, put, 3, 0, 0, 0, 0, 0, 0, 0);
    },
    fire(st) {
      st.kick = 1;
    },
  },
  volcano: {
    parts: [volcanoBody, volcanoGlow, volcanoTrim],
    shadowParts: 1,
    interval: [0.9, 1.7],
    muzzle: [0, 3, 0],
    dropHeight: 3,
    pose(st, time, index, tier, base, put) {
      put(0, base);
      const breathe = 1 + Math.sin(time * 2.2 + index) * 0.03 + windUp(st) * 0.14 + st.shake * 0.5;
      putLocal(base, put, 1, 0, 0, 0, 0, time * 0.3, 0, breathe, 1, breathe);
      putIf(put, 2, tier >= 1, base);
    },
    fire(st, host, x, y, z, s) {
      st.shake = 1;
      host.flash(x, y, z, 1.2 * s);
      host.ember(x, y, z, s);
      host.smoke(x, y + 0.3 * s, z, 0.8 * s);
    },
  },
  orbital: {
    parts: [orbitalBody, orbitalMirror, orbitalTrim],
    shadowParts: 1,
    interval: [0.9, 1.6],
    muzzle: [0, 1.7, 0],
    dropHeight: 10,
    pose(st, time, index, tier, base, put) {
      const sway = Math.sin(time * 0.3 + index * 1.7) * 0.05;
      const turn = Math.sin(time * 0.12 + index) * 0.5;
      putLocal(base, put, 0, 0, sway, 0, 0, turn, Math.sin(time * 0.2 + index) * 0.03);
      // The mirror draws back, then snaps onto its target.
      putLocal(base, put, 1, 0, 0.46 + sway - windUp(st) * 0.05, 0, 0.16 + st.kick * 0.12, time * 0.08 + index, 0);
      if (tier >= 1) putLocal(base, put, 2, 0, sway, 0, 0, turn, 0);
      else putLocal(base, put, 2, 0, 0, 0, 0, 0, 0, 0);
    },
    fire(st, host, x, y, z, s) {
      st.kick = 1;
      host.flash(x, y, z, 0.8 * s);
      host.sound('orbital-zap');
    },
  },
};

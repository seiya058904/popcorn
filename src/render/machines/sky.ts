import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { at, Kit, M, P, Pattern, puffs, putIf, putLocal, rod, smooth, V, windUp, type UnitDef } from './common.ts';
import { smoothLatheSeam } from '../geometry/kit.ts';
import { ORBITAL_UNFOLD } from './entrances.ts';

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
  // Sewn fabric gores in 72 segments (40% fewer tris than 120, silky silhouette preserved).
  kit.add(P.lathe(profile, 72, 0.01, 1), {
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
    kit.add(P.torus(hullRadius(x) + 0.006, 0.014, 5, 36), { ...M.brass, outline: 0, detail: 1, matrix: at(x, 0, 0, [0, Math.PI / 2, 0]) });
  }
  // Ribbed brass mooring nose cone with mooring eye.
  kit.add(P.lathe([[0, 0], [0.42, 0], [0.36, 0.08], [0.22, 0.18], [0.08, 0.28], [0, 0.34]], 18, 0.012, 1), { ...M.brass, matrix: at(3.04, 0, 0, [0, 0, -Math.PI / 2]) });
  kit.add(P.torus(0.055, 0.014, 5, 12), { ...M.brass, outline: 0, matrix: at(3.38, 0, 0) });
  // Streamlined tapered cruciform tail fins with wire tension bracing cables.
  for (const rx of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const turn = new THREE.Matrix4().makeRotationX(rx);
    kit.add(P.box(1.06, 0.72, 0.065, 0.025, 1), { ...M.red, matrix: turn.clone().multiply(at(-2.58, 0.94, 0, [0, 0, 0.38])) });
    kit.add(P.box(0.56, 0.44, 0.055, 0.02, 1), { ...M.red, outline: 0.3, matrix: turn.clone().multiply(at(-2.82, 1.32, 0, [0, 0, 0.16])) });
    kit.add(P.slab(0.28, 0.78, 0.085), { ...M.cream, outline: 0.4, matrix: turn.clone().multiply(at(-3.12, 1.08, 0, [0, 0, 0.24])) });
    // Diagonal tension wire bracing from fin tip back onto the hull skin.
    const tip = V(-2.72, 1.38, 0).applyMatrix4(turn);
    const anchorA = V(-1.72, 1.08, 0.42).applyMatrix4(turn);
    const anchorB = V(-1.72, 1.08, -0.42).applyMatrix4(turn);
    rod(kit, tip, anchorA, 0.008, M.steel, 4);
    rod(kit, tip, anchorB, 0.008, M.steel, 4);
  }
  // Gondola: a little railcar with lit windows and twin split drop-bay doors underneath.
  kit.add(P.box(1.9, 0.44, 0.66, 0.14, 2), { ...M.cream, matrix: at(0.2, -1.86, 0) });
  kit.add(P.box(1.96, 0.05, 0.72, 0.02, 1), { ...M.brass, matrix: at(0.2, -1.7, 0) });
  kit.add(P.box(1.96, 0.05, 0.72, 0.02, 1), { ...M.brass, matrix: at(0.2, -2.06, 0) });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      kit.add(P.slab(0.24, 0.17, 0.012), { color: '#ffdf9c', emissive: 0.85, outline: 0, fixedColor: true, matrix: at(-0.52 + i * 0.36, -1.84, side * 0.335) });
    }
  }
  for (const x of [-0.5, 0.2, 0.9]) for (const z of [-0.26, 0.26]) rod(kit, V(x, -1.66, z), V(x * 1.05, -1.42, z * 1.4), 0.016, M.iron, 5);
  // Engine nacelles on outriggers with twin brass exhaust pipes.
  for (const side of [-1, 1]) {
    const z = side * 1.32;
    rod(kit, V(-0.5, -1.68, side * 0.3), V(-0.9, -1.34, z), 0.026, M.steel, 6);
    rod(kit, V(-0.9, -1.34, z), V(-0.9, -0.96, side * 0.88), 0.014, M.iron, 4);
    kit.add(P.capsule(0.15, 0.52, 4, 12), { ...M.steel, matrix: at(-0.9, -1.34, z, [0, 0, Math.PI / 2]) });
    kit.add(P.torus(0.15, 0.018, 5, 14), { ...M.brass, outline: 0, matrix: at(-0.72, -1.34, z, [0, Math.PI / 2, 0]) });
    // Side exhaust manifold pipe running aft along each engine pod.
    rod(kit, V(-0.76, -1.26, z + side * 0.14), V(-1.18, -1.22, z + side * 0.17), 0.02, M.copper, 5);
  }
  // Twin hinged bomb-bay drop doors flanking the popcorn chute.
  kit.add(P.puck(0.3, 0.16, 0.26, 14, 0.03), { ...M.steel, matrix: at(0.2, -2.08, 0, [Math.PI, 0, 0]) });
  for (const side of [-1, 1]) {
    kit.add(P.slab(0.56, 0.035, 0.24), { ...M.red, outline: 0.3, matrix: at(0.2, -2.18, side * 0.26, [side * 0.65, 0, 0]) });
  }
  puffs(kit, 0.2, -2.42, 0, 0.09, 0.09, 2, 0.09, 3);
  return kit.build();
}

function airshipProp(): THREE.BufferGeometry {
  const kit = new Kit();
  for (let i = 0; i < 3; i += 1) kit.add(P.slab(0.035, 0.84, 0.13), { ...M.darkWood, gloss: 0.6, outline: 0.4, matrix: at(0, 0, 0, [(i / 3) * Math.PI, 0.25, 0]) });
  kit.add(P.sphere(0.075, 10, 8), { ...M.chrome, outline: 0 });
  return kit.build();
}

function airshipTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: running lights and a wind-swaying trailing pennant.
  for (let i = 0; i < 9; i += 1) {
    const x = -2.4 + i * 0.6;
    kit.add(P.sphere(0.05, 7, 5), { ...M.bulb, matrix: at(x, -hullRadius(x) - 0.02, 0.1) });
  }
  rod(kit, V(-3.2, 0, 0), V(-4.1, -0.25, 0), 0.012, M.steel, 5);
  kit.add(P.slab(0.95, 0.24, 0.012), { ...M.canvasRed, sway: 0.45, matrix: at(-4.1, -0.38, 0, [0, 0, -0.14]) });
  return kit.build();
}

// Volcano furnace ----------------------------------------------------------------

function volcanoBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Stratified Basalt Terraces: clean stepped geological ledges with broad radial ribs and smooth lava channels
  // (no crumpled high-frequency facet noise).
  const profile: Array<[number, number]> = [
    [0, 0],
    [2.82, 0], [2.72, 0.28], [2.44, 0.42], [2.36, 0.72],
    [2.08, 0.88], [1.96, 1.24], [1.68, 1.42], [1.56, 1.82],
    [1.3, 2.02], [1.18, 2.42], [0.98, 2.74], [0.88, 2.94],
    [0.74, 3.0], [0.62, 2.92], [0.54, 2.66], [0.46, 2.34], [0, 2.3],
  ];
  const cone = P.lathe(profile, 64, 0.07, 2);
  const gully = (a: number, y: number): number => Math.pow(Math.max(0, Math.cos(a * 3 + 0.55 + Math.sin(y * 1.8) * 0.28)), 16);
  const position = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.01 || y < 0.04) continue;
    const a = Math.atan2(z, x);
    // Broad sculpted basalt buttress ribs (6 ridges) instead of noisy foil crumple.
    const rib = Math.cos(a * 6 + 0.2) * 0.055 + Math.cos(a * 3 - 0.5) * 0.04;
    const slope = smooth(0.05, 0.45, y) * (1 - smooth(2.5, 2.96, y) * 0.75);
    const cut = gully(a, y) * smooth(0.25, 0.65, y) * (1 - smooth(2.65, 2.95, y));
    const radial = 1 + rib * slope - cut * 0.065;
    const rimWave = Math.sin(a * 5 + 0.4) * 0.045 * smooth(2.65, 2.96, y);
    position.setXYZ(i, x * radial, y + rimWave, z * radial);
  }
  cone.computeVertexNormals();
  smoothLatheSeam(cone, 64);

  const lava = (p: THREE.Vector3): number => {
    const a = Math.atan2(p.z, p.x);
    const r = Math.hypot(p.x, p.z);
    const rimGlow = smooth(2.74, 2.92, p.y) * smooth(0.9, 0.58, r);
    const channel = gully(a, p.y) * 1.45 * smooth(0.15, 0.55, p.y) * (1 - smooth(2.75, 2.95, p.y));
    return Math.min(1, Math.max(rimGlow * 0.75, channel));
  };
  const basalt = new THREE.Color('#3e2e3c');
  const terrace = new THREE.Color('#644e5d');
  const ash = new THREE.Color('#806a76');
  const magma = new THREE.Color('#ff6e1f');
  const magmaHot = new THREE.Color('#ffd058');
  kit.add(cone, {
    color: basalt,
    gloss: 0.14,
    fixedColor: true,
    colorFn: (p, n, out) => {
      // Clean geological strata highlighting the horizontal basalt ledges.
      const stepShelf = smooth(0.38, 0.88, n.y);
      const band = 0.5 + 0.5 * Math.sin(p.y * 6.8 + Math.sin(Math.atan2(p.z, p.x) * 3) * 0.45);
      out.lerp(terrace, stepShelf * 0.55 + smooth(0.55, 0.85, band) * 0.25);
      out.lerp(ash, stepShelf * smooth(1.6, 2.8, p.y) * 0.42);
      const l = lava(p);
      out.lerp(magma, smooth(0.08, 0.75, l));
      out.lerp(magmaHot, smooth(0.7, 1.0, l) * 0.65);
    },
    emissiveFn: (p) => lava(p) * 0.92,
    ao: (p, n) => 0.68 + 0.32 * smooth(0, 1.4, p.y) * (0.85 + 0.15 * smooth(-0.3, 0.7, n.y)),
  });

  // Angular faceted basalt rock shards around the rim and base (replacing blobby spheres).
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.18;
    const sz = 0.12 + (i % 3) * 0.035;
    kit.add(P.box(sz * 1.4, sz * 0.85, sz, 0.02, 1), {
      color: i % 2 ? '#4d3a48' : '#644e5d',
      gloss: 0.12,
      fixedColor: true,
      detail: 1,
      matrix: at(Math.cos(a) * 0.84, 2.94, Math.sin(a) * 0.84, [0.2 * (i % 3), -a + 0.3, 0.15]),
    });
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.42;
    const sz = 0.18 + (i % 3) * 0.06;
    kit.add(P.box(sz * 1.35, sz * 0.85, sz * 1.1, 0.03, 1), {
      color: '#42313f',
      gloss: 0.1,
      fixedColor: true,
      detail: 1,
      matrix: at(Math.cos(a) * 3.0, sz * 0.36, Math.sin(a) * 3.0, [0.18, -a + 0.5, -0.14]),
    });
  }

  // Industrial steam-toy volcano harness: riveted cast-iron base collar, mid tension band, flanged rim collar.
  kit.add(P.torus(2.85, 0.09, 8, 48), { ...M.iron, matrix: at(0, 0.08, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.add(P.box(0.24, 0.18, 0.14, 0.025, 1), { ...M.steel, matrix: at(Math.cos(a) * 2.85, 0.14, Math.sin(a) * 2.85, [0, -a, 0]) });
    kit.add(P.sphere(0.028, 6, 4), { ...M.brass, outline: 0, detail: 2, matrix: at(Math.cos(a) * 2.96, 0.15, Math.sin(a) * 2.96) });
  }
  // Mid-slope iron reinforcing ring + crater lip collar.
  kit.add(P.torus(1.74, 0.052, 7, 40), { ...M.iron, matrix: at(0, 1.36, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.97, 0.058, 7, 36), { ...M.steel, matrix: at(0, 2.72, 0, [Math.PI / 2, 0, 0]) });

  // Copper steam-feed pipes with bolted brass flanges at base, mid-band and summit.
  for (const a of [0.85, 2.95, 5.05]) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    kit.add(P.tube([V(ca * 2.84, 0.16, sa * 2.84), V(ca * 2.26, 0.96, sa * 2.26), V(ca * 1.78, 1.42, sa * 1.78), V(ca * 1.36, 2.18, sa * 1.36), V(ca * 1.0, 2.72, sa * 1.0)], 0.052, 16, 7), M.copper);
    for (const [rF, yF] of [[2.84, 0.24], [1.78, 1.42], [1.02, 2.66]] as const) {
      kit.add(P.torus(0.074, 0.022, 5, 12), { ...M.brass, outline: 0, detail: 1, matrix: at(ca * rF, yF, sa * rF, [0, -a, 0.65]) });
    }
  }

  // Maintenance access ladder up the right-front flank to the mid-collar.
  const ladA = 0.42;
  const ladC = Math.cos(ladA);
  const ladS = Math.sin(ladA);
  for (const side of [-0.14, 0.14]) {
    const tx = -ladS * side;
    const tz = ladC * side;
    rod(kit, V(ladC * 2.84 + tx, 0.14, ladS * 2.84 + tz), V(ladC * 1.82 + tx, 1.4, ladS * 1.82 + tz), 0.02, M.steel, 5);
  }
  for (let r = 0; r < 6; r += 1) {
    const t = (r + 0.5) / 6;
    const rr = 2.84 + (1.82 - 2.84) * t;
    const yy = 0.14 + (1.4 - 0.14) * t;
    kit.add(P.slab(0.024, 0.024, 0.28), { ...M.steel, outline: 0, detail: 1, matrix: at(ladC * rr, yy, ladS * rr, [0, -ladA, 0]) });
  }

  // Arched cast-iron firebox furnace door with vaulted crown, coals behind grate, and side pressure gauge.
  const door = (m: THREE.Matrix4): THREE.Matrix4 => at(0, 0.4, 2.48, [-0.55, 0, 0]).multiply(m);
  kit.add(P.box(0.88, 0.62, 0.14, 0.05, 2), { ...M.darkIron, matrix: door(at(0, 0, 0)) });
  kit.add(P.torus(0.42, 0.065, 6, 18, Math.PI), { ...M.darkIron, matrix: door(at(0, 0.26, 0.02)) });
  kit.add(P.slab(0.7, 0.48, 0.06), { color: '#1a1215', gloss: 0.3, outline: 0, fixedColor: true, matrix: door(at(0, 0.02, 0.05)) });
  kit.add(P.slab(0.62, 0.38, 0.04), { ...M.coal, matrix: door(at(0, 0.02, 0.075)) });
  // Vertical cast-iron firebox grate bars over the glowing coals.
  for (let i = -2; i <= 2; i += 1) {
    kit.add(P.slab(0.042, 0.42, 0.036), { ...M.darkIron, outline: 0, matrix: door(at(i * 0.13, 0.02, 0.098)) });
  }
  for (const x of [-0.37, 0.37]) {
    for (const y of [-0.23, 0.23]) kit.add(P.sphere(0.03, 6, 4), { ...M.steel, outline: 0, detail: 1, matrix: door(at(x, y, 0.08)) });
  }
  kit.add(P.torus(0.072, 0.018, 6, 14), { ...M.brass, matrix: door(at(0.32, 0, 0.11)) });
  // Brass steam pressure gauge mounted right of the firebox door.
  kit.add(P.puck(0.14, 0.13, 0.055, 16, 0.014), { ...M.brass, matrix: door(at(0.62, 0.12, 0.04, [Math.PI / 2, 0, 0])) });
  kit.add(P.puck(0.105, 0.105, 0.012, 16, 0.004), { color: '#fff4dc', emissive: 0.35, outline: 0, fixedColor: true, matrix: door(at(0.62, 0.12, 0.092, [Math.PI / 2, 0, 0])) });
  kit.add(P.slab(0.016, 0.08, 0.01), { ...M.red, outline: 0, matrix: door(at(0.635, 0.14, 0.102, [0, 0, -0.55])) });
  return kit.build();
}

/** Deep caldera magma lake with dark floating basalt crust islands and glowing orange-white fissures. */
function volcanoGlow(): THREE.BufferGeometry {
  const kit = new Kit();
  // Incandescent magma core pool deep inside the crater.
  kit.add(P.puck(0.6, 0.6, 0.05, 22, 0.01), { color: '#ff8a2b', emissive: 0.98, outline: 0, fixedColor: true, matrix: at(0, 2.46, 0) });
  kit.add(P.puck(0.38, 0.38, 0.04, 18, 0.01), { color: '#ffe48a', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, 2.49, 0) });
  // Floating dark cooled basalt crust islands leaving glowing lava fissures between them.
  const islands: Array<[number, number, number, number, number]> = [
    [-0.18, 0.14, 0.24, 0.18, 0.4],
    [0.2, 0.16, 0.22, 0.16, -0.5],
    [0.14, -0.2, 0.25, 0.17, 0.9],
    [-0.22, -0.16, 0.2, 0.16, -0.8],
    [0.02, 0.01, 0.14, 0.12, 0.2],
  ];
  for (const [x, z, w, d, ry] of islands) {
    kit.add(P.box(w, 0.06, d, 0.016, 1), { color: '#261820', gloss: 0.22, outline: 0, fixedColor: true, matrix: at(x, 2.53, z, [0.05, ry, -0.04]) });
  }
  return kit.build();
}

function volcanoTrim(): THREE.BufferGeometry {
  const kit = new Kit();
  // Earned at 25: a riveted smelter exhaust stack with copper tie-in pipe and warning beacon.
  kit.add(P.puck(0.25, 0.18, 1.15, 14, 0.02), { ...M.iron, matrix: at(1.7, 0.62, 1.2) });
  kit.add(P.torus(0.23, 0.026, 6, 14), { ...M.steel, outline: 0, matrix: at(1.7, 1.15, 1.2, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.19, 0.032, 6, 14), { ...M.brass, outline: 0, matrix: at(1.7, 1.76, 1.2, [Math.PI / 2, 0, 0]) });
  rod(kit, V(1.7, 1.15, 1.2), V(1.3, 1.4, 0.9), 0.04, M.copper, 6);
  kit.add(P.sphere(0.085, 8, 6), { color: '#ff4a2a', emissive: 1, outline: 0, fixedColor: true, matrix: at(1.7, 1.9, 1.2) });
  return kit.build();
}

// Orbital mirror station ----------------------------------------------------------

function orbitalBody(): THREE.BufferGeometry {
  const kit = new Kit();
  // Kapton gold-foil thermal-blanket octagonal service module with chrome instrument collar.
  const kapton = { color: '#e8ad38', gloss: 0.88, metal: 0.92, pattern: Pattern.Brushed + 0.4, wear: 0.18, fixedColor: true };
  kit.add(P.puck(0.56, 0.46, 0.62, 8, 0.04), { ...kapton, matrix: at(0, -0.46, 0) });
  kit.add(P.puck(0.5, 0.46, 0.32, 16, 0.03), { ...M.chrome, matrix: at(0, 0.14, 0) });
  kit.add(P.torus(0.6, 0.048, 7, 24), { ...M.brass, matrix: at(0, 0.14, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(0.52, 0.03, 6, 20), { ...M.brass, outline: 0, matrix: at(0, -0.38, 0, [Math.PI / 2, 0, 0]) });
  // Illuminated telemetry portholes around the service bay.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    kit.add(P.sphere(0.055, 8, 6), { color: '#bfe6ff', emissive: 0.8, outline: 0, fixedColor: true, matrix: at(Math.cos(a) * 0.53, -0.12, Math.sin(a) * 0.53) });
  }
  // White thermal radiator fins projecting fore/aft perpendicular to the solar wings.
  for (const sz of [-1, 1]) {
    kit.add(P.slab(0.03, 0.38, 0.56), { ...M.cream, gloss: 0.5, outline: 0.25, matrix: at(0, -0.12, sz * 0.78) });
    for (const dy of [-0.1, 0.1]) kit.add(P.slab(0.042, 0.02, 0.52), { ...M.steel, outline: 0, detail: 1, matrix: at(0, -0.12 + dy, sz * 0.78) });
  }
  const blue = new THREE.Color('#1c3f93');
  const line = new THREE.Color('#7fa8e8');
  for (const side of [-1, 1]) {
    // Solar-wing gimbal rotary yoke & lattice truss boom.
    kit.add(P.puck(0.11, 0.11, 0.14, 12, 0.015), { ...M.brass, matrix: at(side * 0.56, 0.1, 0, [0, 0, side * Math.PI / 2]) });
    rod(kit, V(side * 0.56, 0.1, -0.12), V(side * 1.3, 0.1, -0.12), 0.02, M.steel, 5);
    rod(kit, V(side * 0.56, 0.1, 0.12), V(side * 1.3, 0.1, 0.12), 0.02, M.steel, 5);
    for (let i = 0; i < 4; i += 1) rod(kit, V(side * (0.56 + i * 0.185), 0.1, i % 2 ? 0.12 : -0.12), V(side * (0.745 + i * 0.185), 0.1, i % 2 ? -0.12 : 0.12), 0.012, M.steel, 4);
    kit.add(P.box(2.6, 0.04, 1.08, 0.01, 1), {
      color: blue,
      gloss: 0.9,
      coat: 0.6,
      fixedColor: true,
      matrix: at(side * 2.6, 0.1, 0),
    });
    for (let i = 0; i <= 8; i += 1) kit.add(P.slab(0.018, 0.05, 1.08), { color: line, gloss: 0.8, metal: 1, outline: 0, detail: 1, fixedColor: true, matrix: at(side * (1.3 + i * 0.325), 0.1, 0) });
    for (const z of [-0.27, 0, 0.27]) kit.add(P.slab(2.6, 0.05, 0.016), { color: line, gloss: 0.8, metal: 1, outline: 0, detail: 1, fixedColor: true, matrix: at(side * 2.6, 0.1, z) });
    kit.add(P.slab(2.66, 0.06, 0.05), { ...M.brass, outline: 0, matrix: at(side * 2.6, 0.1, 0.56) });
    kit.add(P.slab(2.66, 0.06, 0.05), { ...M.brass, outline: 0, matrix: at(side * 2.6, 0.1, -0.56) });
  }
  // Quad RCS attitude thruster clusters around lower bus + main ion glow bell.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    kit.add(P.lathe([[0, 0], [0.05, 0], [0.11, -0.16], [0.07, -0.16], [0, -0.04]], 10, 0.01, 1), { ...M.steel, matrix: at(ca * 0.3, -0.48, sa * 0.3) });
    // Quad RCS pod jutting outward with twin micro nozzles.
    kit.add(P.slab(0.11, 0.11, 0.11), { ...M.steel, outline: 0.2, detail: 1, matrix: at(ca * 0.58, -0.32, sa * 0.58, [0, -a, 0]) });
    for (const dy of [-0.05, 0.05]) {
      kit.add(P.puck(0.022, 0.036, 0.06, 6, 0.004), { ...M.brass, outline: 0, detail: 2, matrix: at(ca * 0.64, -0.32 + dy, sa * 0.64, [0, -a, Math.PI / 2]) });
    }
  }
  kit.add(P.sphere(0.16, 10, 8), { color: '#ffb648', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, -0.56, 0) });
  return kit.build();
}

/** Interlocking parabolic segmented mirror array with rear circular truss ring and crystalline focusing core. */
function orbitalMirror(): THREE.BufferGeometry {
  const kit = new Kit();
  // Interlocking parabolic mirror petals (tighter brass-rimmed inner & outer rings).
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const rot = new THREE.Matrix4().makeRotationY(a);
    kit.add(P.slab(0.45, 0.024, 0.25), { color: '#f2f7fc', gloss: 1, metal: 1, outline: 0.25, fixedColor: true, matrix: rot.clone().multiply(at(0.32, 0.13, 0, [0, 0, 0.32])) });
    kit.add(P.slab(0.52, 0.026, 0.39), { color: '#dfe9f2', gloss: 1, metal: 1, outline: 0.25, fixedColor: true, matrix: new THREE.Matrix4().makeRotationY(a + 0.26).multiply(at(0.76, 0.34, 0, [0, 0, 0.52])) });
    // Rear structural radial backing rib supporting each outer mirror segment.
    if (i % 2 === 0) rod(kit, V(0, 0.04, 0), V(Math.cos(a) * 0.98, 0.44, Math.sin(a) * 0.98), 0.014, M.steel, 4);
  }
  // Rear truss hoop & front collector perimeter ring.
  kit.add(P.torus(0.64, 0.02, 5, 24), { ...M.steel, outline: 0, matrix: at(0, 0.22, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(1.03, 0.026, 6, 32), { ...M.brass, matrix: at(0, 0.5, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    rod(kit, V(Math.cos(a) * 1.02, 0.5, Math.sin(a) * 1.02), V(0, 1.24, 0), 0.015, M.steel, 5);
  }
  // Crystalline faceted focusing lens core ringed in brass.
  kit.add(P.torus(0.13, 0.016, 5, 16), { ...M.brass, outline: 0, matrix: at(0, 1.26, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.sphere(0.115, 8, 6), { color: '#fff4c4', emissive: 1, outline: 0, fixedColor: true, matrix: at(0, 1.26, 0, [0, 0.4, 0], [1, 1.25, 1]) });
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
    badge: { at: [-1.7, 0.02, 1.48], size: 0.42 },
    signs: [{ text: SIGN_TEXT.airship, style: { background: '#fff3d6', color: '#a31d28', border: '#d62f38', aspect: 5.6 }, width: 2.2, height: 0.42, matrix: at(0, 0.02, 1.56) }],
    pose(st, time, index, tier, base, put) {
      const bob = Math.sin(time * 0.7 + index * 2) * 0.22 - st.kick * 0.05;
      const roll = Math.sin(time * 0.45 + index) * 0.035;
      const pitch = Math.sin(time * 0.33 + index * 1.4) * 0.022;
      putLocal(base, put, 0, 0, bob, 0, roll, 0, pitch);
      // Full power on the way in, easing back once it is on station.
      const props = st.spin * 9 + (1 - st.enter) * 40;
      for (const [part, side] of [[1, -1], [2, 1]] as const) putLocal(base, put, part, -1.32, bob - 1.34, side * 1.32, props, 0, 0);
      if (tier >= 1) putLocal(base, put, 3, 0, bob, 0, roll, 0, pitch);
      else putLocal(base, put, 3, 0, 0, 0, 0, 0, 0, 0);
    },
    fire(st, host) {
      st.kick = 1;
      if (host.rng.next() < 0.35) host.sound('airship-drop');
    },
  },
  volcano: {
    parts: [volcanoBody, volcanoGlow, volcanoTrim],
    shadowParts: 1,
    interval: [0.9, 1.7],
    muzzle: [0, 3, 0],
    badge: { at: [0, 0.75, 1.42], size: 0.4, rx: -0.45 },
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
      if (host.rng.next() < 0.4) host.sound('work-volcano');
    },
  },
  orbital: {
    parts: [orbitalBody, orbitalMirror, orbitalTrim],
    shadowParts: 1,
    interval: [0.9, 1.6],
    muzzle: [0, 1.7, 0],
    badge: { at: [0, 0.55, 0.5], size: 0.26 },
    pose(st, time, index, tier, base, put) {
      const sway = Math.sin(time * 0.3 + index * 1.7) * 0.05;
      const turn = Math.sin(time * 0.12 + index) * 0.5;
      putLocal(base, put, 0, 0, sway, 0, 0, turn, Math.sin(time * 0.2 + index) * 0.03);
      // The mirror draws back, then snaps onto its target.
      // The mirror stays folded until the station has nearly docked.
      const unfold = st.enter < 1 ? Math.max(0.001, smooth(ORBITAL_UNFOLD[0], ORBITAL_UNFOLD[1], st.age)) : 1;
      putLocal(base, put, 1, 0, 0.46 + sway - windUp(st) * 0.05, 0, 0.16 + st.kick * 0.12, time * 0.08 + index + (1 - unfold) * 3, 0, unfold);
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

import * as THREE from 'three';
import { lerp, Spring } from '../../motion/ease.ts';
import type { Stage } from '../core/stage.ts';
import { Flames } from '../fx/flames.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, at, Kit, P, Pattern } from '../geometry/kit.ts';
import { toyMaterials } from '../materials/toy.ts';
import type { SceneContext, SceneParts, SceneSpec, UnitSlot } from './types.ts';
import { vesselPile } from './vessel.ts';

export const POT = { floorY: 0.68, rimY: 1.46, innerR: 1.12, outerR: 1.24 };

const C = {
  teal: '#14646b',
  tealDeep: '#0f525a',
  grout: '#08323a',
  mint: '#46b39a',
  mintDeep: '#2f8f80',
  cream: '#f6dfb8',
  butter: '#ffc23e',
  red: '#cf2f38',
  navy: '#20203c',
  drip: '#1d2c44',
  iron: '#24232c',
  chrome: '#b9c7d6',
  sky: '#1d2466',
  dusk: '#c8638b',
  moon: '#fff1c4',
};

/** Finished runs unlock new enamel colors for the pot. */
const POT_SKINS = ['#cf2f38', '#3fae94', '#f0b02c', '#4c8be0', '#2d2c3a', '#c3cdd8'];
let potColor = POT_SKINS[0]!;

export function setPotSkin(index: number): void {
  potColor = POT_SKINS[Math.min(index, POT_SKINS.length - 1)]!;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const PAN_Y_BURNER = 0.26;
const PAN_Y_TOP = 0.01;

/** The first four pans get a burner; later ones stand on the enamel. */
const PAN_SLOTS: UnitSlot[] = [
  { x: -3.3, y: PAN_Y_BURNER, z: 0.8, rotation: 0.5 },
  { x: 3.45, y: PAN_Y_BURNER, z: 0.95, rotation: 2.2 },
  { x: -3.15, y: PAN_Y_BURNER, z: -1.5, rotation: 3.9 },
  { x: 5.05, y: PAN_Y_BURNER, z: -1.2, rotation: 5.6 },
  { x: -5.75, y: PAN_Y_TOP, z: -0.35, rotation: 7.3 },
  { x: 5.95, y: PAN_Y_TOP, z: 0.6, rotation: 9 },
  { x: -1.55, y: PAN_Y_TOP, z: -2.25, rotation: 10.7 },
  { x: -5.2, y: PAN_Y_TOP, z: -2.1, rotation: 12.4 },
];
const BURNER_PANS = 4;

const MICROWAVE_SLOTS: UnitSlot[] = [
  // On the window sill, where a growing heap cannot hide them.
  { x: -4.85, y: 2.24, z: -3.12, rotation: 0.08, scale: 0.62 },
  { x: -3.05, y: 2.24, z: -3.12, rotation: -0.08, scale: 0.62 },
  { x: 1.9, y: PAN_Y_TOP, z: -2.65, rotation: -0.08, scale: 0.92 },
];

const BURNERS: THREE.Vector3Tuple[] = [
  [0, 0.03, 0],
  ...PAN_SLOTS.slice(0, BURNER_PANS).map((slot): THREE.Vector3Tuple => [slot.x, 0.03, slot.z]),
];

function addWall(kit: Kit): void {
  kit.add(P.box(21.8, 8.95, 0.3, 0.02, 1), { color: C.grout, gloss: 0, outline: 0, matrix: at(0, 4.4, -3.75) });
  const tile = 0.74;
  const gap = 0.055;
  let seed = 7;
  const next = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < 11; row += 1) {
    for (let col = -13; col <= 13; col += 1) {
      const x = col * (tile + gap);
      const y = 0.45 + row * (tile + gap);
      const tint = new THREE.Color((row + col) & 1 ? C.teal : C.tealDeep).offsetHSL(0, 0, (next() - 0.5) * 0.016);
      kit.add(P.box(tile, tile, 0.09, 0.035, 1), {
        color: tint,
        gloss: 0.6,
        outline: 0,
        matrix: at(x, y, -3.58, [(next() - 0.5) * 0.012, (next() - 0.5) * 0.012, 0]),
      });
    }
  }
}

function addStoveBody(kit: Kit): void {
  const contact = (p: THREE.Vector3): number => lerp(0.5, 1, smooth(1.15, 2.4, Math.hypot(p.x, p.z)));
  kit.add(P.box(14.4, 0.34, 6.5, 0.14, 4), { color: C.mint, gloss: 0.62, coat: 0.24, pattern: Pattern.Enamel, ao: contact, matrix: at(0, -0.17, -0.3) });
  kit.add(P.box(14.7, 0.1, 6.8, 0.05, 2), { color: C.chrome, gloss: 1, matrix: at(0, -0.38, -0.3) });
  kit.add(P.box(14.4, 1.75, 0.7, 0.12, 3), { color: C.cream, gloss: 0.55, matrix: at(0, -1.3, 2.72) });
  kit.add(P.box(14.4, 4, 6, 0.1, 1), { color: C.mintDeep, gloss: 0.3, outline: 0, matrix: at(0, -3.2, -0.4) });

  // Back guard: the unmistakable 1950s range silhouette.
  kit.add(P.box(14.4, 1.2, 0.5, 0.2, 4), { color: C.mint, gloss: 0.62, matrix: at(0, 0.54, -3.2) });
  kit.add(P.box(14.0, 0.12, 0.56, 0.05, 2), { color: C.chrome, gloss: 1, matrix: at(0, 1.12, -3.18) });

  const clock = at(-0.2, 0.58, -2.95, [Math.PI / 2, 0, 0]);
  kit.add(P.puck(0.42, 0.38, 0.07, 40, 0.02), { color: C.chrome, gloss: 1, matrix: clock });
  kit.add(P.puck(0.34, 0.33, 0.085, 40, 0.01), { color: C.cream, gloss: 0.5, outline: 0, matrix: clock });
  for (let hour = 0; hour < 12; hour += 1) {
    const a = (hour / 12) * Math.PI * 2;
    kit.add(P.box(0.022, 0.05, 0.01, 0.004, 1), {
      color: C.navy,
      outline: 0,
      matrix: at(-0.2 + Math.sin(a) * 0.27, 0.58 + Math.cos(a) * 0.27, -2.86, [0, 0, -a]),
    });
  }

  for (let i = -3; i <= 3; i += 1) {
    const x = i * 1.75;
    kit.add(P.puck(0.3, 0.26, 0.05, 28, 0.015), { color: C.chrome, gloss: 1, matrix: at(x, -1.05, 3.07, [Math.PI / 2, 0, 0]) });
    kit.add(P.puck(0.2, 0.16, 0.2, 24, 0.04), { color: C.red, gloss: 0.9, matrix: at(x, -1.05, 3.1, [Math.PI / 2, 0, 0]) });
    kit.add(P.box(0.05, 0.2, 0.04, 0.012, 1), { color: C.cream, outline: 0, matrix: at(x, -1.05, 3.31, [0, 0, i * 0.55]) });
  }
}

function addBurner(kit: Kit, x: number, z: number): void {
  kit.add(P.puck(0.86, 0.82, 0.03, 40, 0.012), { color: C.drip, gloss: 0.7, outline: 0, matrix: at(x, 0, z) });
  kit.add(P.torus(0.84, 0.018, 8, 48), { color: C.chrome, gloss: 1, outline: 0, matrix: at(x, 0.03, z, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.4, 0.33, 0.09, 28, 0.03), { color: C.iron, gloss: 0.3, outline: 0.6, matrix: at(x, 0.02, z) });
  kit.add(P.torus(0.74, 0.042, 8, 40), { color: C.iron, gloss: 0.35, matrix: at(x, 0.255, z, [Math.PI / 2, 0, 0]) });
  for (let a = 0; a < 4; a += 1) {
    const angle = (a / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = x + Math.cos(angle) * 0.56;
    const cz = z + Math.sin(angle) * 0.56;
    kit.add(P.box(0.4, 0.07, 0.085, 0.03, 2), { color: C.iron, gloss: 0.35, matrix: at(cx, 0.255, cz, [0, -angle, 0]) });
    kit.add(P.box(0.075, 0.25, 0.075, 0.03, 2), {
      color: C.iron,
      gloss: 0.3,
      matrix: at(x + Math.cos(angle) * 0.74, 0.125, z + Math.sin(angle) * 0.74),
    });
  }
}

const WINDOW = { x: -3.95, y: 3.72 };

function addWindow(kit: Kit): void {
  const { x: cx, y: cy } = WINDOW;
  const duskColor = new THREE.Color(C.dusk);
  const skyColor = new THREE.Color(C.sky);
  kit.add(P.box(3.2, 3.1, 0.12, 0.05, 2), {
    color: C.sky,
    gloss: 0,
    emissive: 0.5,
    outline: 0,
    matrix: at(cx, cy, -3.46),
    colorFn: (p, _n, out) => {
      out.lerpColors(duskColor, skyColor, Math.pow(smooth(cy - 1.55, cy + 1.35, p.y), 0.62));
    },
  });
  const frame = { color: C.cream, gloss: 0.45 };
  kit.add(P.box(3.5, 0.18, 0.24, 0.07, 3), { ...frame, matrix: at(cx, cy + 1.58, -3.38) });
  kit.add(P.box(3.8, 0.2, 0.46, 0.07, 3), { ...frame, matrix: at(cx, cy - 1.58, -3.28) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx - 1.67, cy, -3.38) });
  kit.add(P.box(0.18, 3.2, 0.24, 0.07, 3), { ...frame, matrix: at(cx + 1.67, cy, -3.38) });
  kit.add(P.box(0.08, 3.1, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy, -3.39) });
  kit.add(P.box(3.2, 0.08, 0.12, 0.03, 2), { ...frame, matrix: at(cx, cy + 0.1, -3.39) });

  const stars: Array<[number, number, number]> = [
    [-1.1, 1.05, 0.035],
    [-0.5, 0.75, 0.025],
    [0.9, 1.2, 0.03],
    [1.25, 0.55, 0.022],
    [-1.3, 0.35, 0.024],
    [0.3, 0.62, 0.02],
  ];
  for (const [x, y, r] of stars) {
    kit.add(P.sphere(r, 8, 6), { color: C.moon, emissive: 1, outline: 0, matrix: at(cx + x, cy + y, -3.38) });
  }

  for (let i = -4; i <= 4; i += 1) {
    kit.add(P.sphere(0.23, 16, 10), {
      color: i % 2 === 0 ? C.butter : C.cream,
      gloss: 0.15,
      matrix: at(cx + i * 0.39, cy + 1.4, -3.27, [0, 0, 0], [1, 0.86, 0.45]),
    });
  }
}

function addForeground(kit: Kit): void {
  kit.add(
    P.lathe(
      [
        [0, 0],
        [0.32, 0],
        [0.28, 0.6],
        [0.21, 0.82],
        [0, 0.88],
      ],
      24,
      0.06,
    ),
    { color: C.cream, gloss: 0.7, matrix: at(-5.9, 0, 2.05) },
  );
  kit.add(P.sphere(0.23, 20, 12), { color: C.chrome, gloss: 1, matrix: at(-5.9, 0.82, 2.05, [0, 0, 0], [1, 0.62, 1]) });
  kit.add(P.box(1.3, 0.1, 0.76, 0.05, 3), { color: C.butter, gloss: 0.55, matrix: at(5.7, 0.05, 2.2, [0, 0.3, 0]) });
  kit.add(P.box(0.86, 0.32, 0.44, 0.05, 2), { color: '#ffe48a', gloss: 0.4, matrix: at(5.7, 0.26, 2.2, [0, 0.3, 0]) });
}

function potGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = POT;
  const kit = new Kit();
  const body = (p: THREE.Vector3): number => lerp(0.6, 1, smooth(0.3, 0.8, p.y));
  kit.add(
    P.lathe(
      [
        [0, 0.3],
        [1.08, 0.3],
        [1.2, 0.42],
        [o, r - 0.12],
        [o + 0.03, r - 0.04],
      ],
      84,
      0.09,
      6,
    ),
    { color: potColor, gloss: 0.95, ao: body },
  );
  kit.add(
    P.lathe(
      [
        [o + 0.02, r - 0.06],
        [o + 0.055, r - 0.01],
        [o + 0.02, r + 0.03],
        [i + 0.015, r + 0.025],
        [i - 0.012, r - 0.03],
      ],
      84,
      0.02,
    ),
    { color: C.cream, gloss: 0.85 },
  );
  kit.add(
    P.lathe(
      [
        [i, r - 0.02],
        [i - 0.025, f + 0.2],
        [i - 0.2, f],
        [0, f],
      ],
      84,
      0.14,
    ),
    { color: C.navy, gloss: 0.4, outline: 0, ao: (p) => lerp(0.4, 1, smooth(f, r, p.y)) },
  );
  kit.add(
    P.lathe(
      [
        [o - 0.006, 0.95],
        [o + 0.011, 0.96],
        [o + 0.011, 1.07],
        [o - 0.006, 1.08],
      ],
      84,
      0.006,
      2,
    ),
    { color: C.cream, gloss: 0.9, outline: 0 },
  );
  for (const side of [-1, 1]) {
    const ear = at(side * (o + 0.1), r - 0.3, 0, [Math.PI / 2, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    kit.add(P.torus(0.19, 0.05, 12, 28, Math.PI), { color: C.cream, gloss: 0.8, matrix: ear });
  }
  return kit.build();
}

function lidGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, -0.03],
        [1.3, -0.03],
        [1.32, 0.02],
        [1.22, 0.1],
        [0.82, 0.32],
        [0.3, 0.42],
        [0, 0.43],
      ],
      72,
      0.08,
      6,
    ),
    { color: potColor, gloss: 0.95 },
  );
  kit.add(
    P.lathe(
      [
        [1.24, 0.02],
        [1.325, 0],
        [1.33, 0.04],
        [1.25, 0.09],
      ],
      72,
      0.015,
      2,
    ),
    { color: C.cream, gloss: 0.9, outline: 0 },
  );
  kit.add(P.puck(0.14, 0.1, 0.1, 20, 0.03), { color: C.chrome, gloss: 1, matrix: at(0, 0.41, 0) });
  kit.add(P.sphere(0.21, 24, 16), { color: C.cream, gloss: 0.9, matrix: at(0, 0.6, 0, [0, 0, 0], [1, 0.8, 1]) });
  return kit.build();
}

const steamColor = new THREE.Color(0.9, 0.88, 0.86);
const q = new THREE.Quaternion();
const e = new THREE.Euler();

function buildStove(stage: Stage, root: THREE.Group): SceneParts {
  const set = new Kit();
  addWall(set);
  addStoveBody(set);
  addBurner(set, 0, 0);
  for (const slot of PAN_SLOTS.slice(0, BURNER_PANS)) addBurner(set, slot.x, slot.z);
  addWindow(set);
  addForeground(set);
  addToy(stage, root, set.build());

  const pot = addToy(stage, root, potGeometry());

  // The lid leans on the back guard until the popcorn sends it flying.
  const lid = addToy(stage, root, lidGeometry());
  const lidHome = new THREE.Vector3(3.05, 1.12, -2.62);
  const lidRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.3, -0.2, 0, 'YXZ'));
  lid.position.copy(lidHome);
  lid.quaternion.copy(lidRest);
  lid.scale.setScalar(0.84);

  const moonKit = new Kit();
  moonKit.add(P.sphere(0.56, 40, 28), {
    color: C.moon,
    emissive: 0.9,
    outline: 0,
    colorFn: (p, _n, out) => {
      const crater =
        Math.max(0, 1 - Math.hypot(p.x - 0.14, p.y - 0.2) / 0.16) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x + 0.2, p.y + 0.08) / 0.11) * 0.2 +
        Math.max(0, 1 - Math.hypot(p.x - 0.1, p.y + 0.27) / 0.09) * 0.18;
      out.multiplyScalar(1 - crater);
    },
  });
  const moon = new THREE.Mesh(moonKit.build(), toyMaterials().body);
  const moonHome = new THREE.Vector3(WINDOW.x - 0.62, WINDOW.y + 0.62, -3.4);
  moon.position.copy(moonHome);
  moon.scale.z = 0.12;
  root.add(moon);

  const flames = new Flames(root, BURNERS);
  flames.setLit(1);

  const potKick = new Spring(0, 420, 15);
  const lidRattle = new Spring(0, 620, 17);
  let steamTimer = 0;
  let time = 0;
  let strainAmount = 0;
  let lidFlying = false;
  let lidGone = false;
  const lidVelocity = new THREE.Vector3();
  const lidSpin = new THREE.Vector3();

  return {
    kick(strength) {
      potKick.kick(-0.16 - 0.14 * strength);
      if (strength > 0) lidRattle.kick(1.6 * strength);
    },
    unitsChanged(kind, count) {
      if (kind === 'pan') flames.setLit(1 + Math.min(count, BURNER_PANS));
    },
    strain(u) {
      strainAmount = u;
    },
    blast(ctx) {
      lidFlying = true;
      lidVelocity.set(-3.5, 15, 3.2);
      lidSpin.set(5, 2.4, 7);
      strainAmount = 0;
      for (let i = 0; i < 34; i += 1) {
        ctx.director.launch(ctx.rng.range(-0.8, 0.8), POT.rimY + 0.25, ctx.rng.range(-0.8, 0.8), {
          flight: ctx.rng.range(0.7, 1.25),
          scale: ctx.rng.range(0.34, 0.54),
          reach: 1.5,
          quiet: i > 6,
        });
      }
    },
    afterBlast(dt) {
      if (!lidFlying) return;
      lidVelocity.y -= 22 * dt;
      lid.position.addScaledVector(lidVelocity, dt);
      e.set(lidSpin.x * dt, lidSpin.y * dt, lidSpin.z * dt);
      lid.quaternion.multiply(q.setFromEuler(e));
      if (lid.position.y < -14) {
        lidFlying = false;
        lidGone = true;
        lid.visible = false;
      }
    },
    settleAsMiniature() {
      lidFlying = false;
      lidGone = true;
      lid.visible = false;
      flames.setLit(0);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      const kick = potKick.update(dt);
      const shake = strainAmount * strainAmount;
      pot.scale.set(1 - kick * 0.018, 1 + kick * 0.03 + shake * 0.03 * Math.sin(time * 52), 1 - kick * 0.018);
      pot.position.x = Math.sin(time * 67) * shake * 0.05;
      pot.position.z = Math.cos(time * 59) * shake * 0.04;

      const rattle = lidRattle.update(dt) + Math.sin(time * 73) * shake * 2.4;
      if (!lidFlying && !lidGone) {
        e.set(0, 0, rattle * 0.016);
        lid.quaternion.copy(lidRest).multiply(q.setFromEuler(e));
        lid.position.copy(lidHome);
        lid.position.y += Math.abs(rattle) * 0.008;
      }

      const cycle = time % 11;
      const tremble = cycle > 9.8 ? Math.sin(((cycle - 9.8) * Math.PI) / 1.2) : 0;
      moon.position.copy(moonHome);
      moon.position.x += Math.sin(time * 47) * 0.012 * tremble;
      moon.position.y += Math.cos(time * 41) * 0.009 * tremble;

      steamTimer -= dt * (1 + shake * 6);
      if (steamTimer <= 0) {
        steamTimer = 0.2;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        const radius = r.range(0.2, 0.9);
        ctx.sprites.spawn({
          x: Math.cos(a) * radius,
          y: POT.rimY + (ctx.level > 0.7 ? 0.9 : -0.15),
          z: Math.sin(a) * radius,
          vx: r.range(-0.08, 0.08),
          vy: r.range(0.42, 0.7),
          vz: r.range(-0.05, 0.05),
          drag: 0.25,
          sizeStart: r.range(0.16, 0.24),
          sizeEnd: r.range(0.55, 0.85),
          life: r.range(1.7, 2.5),
          color: steamColor,
          alpha: 0.07,
          kind: SpriteKind.Puff,
          spin: r.range(-0.4, 0.4),
        });
      }
    },
  };
}

export const stoveSpec: SceneSpec = {
  id: 0,
  light: {
    sunDir: [0.42, 0.95, 0.56],
    sunColor: '#fff0d6',
    sunIntensity: 1.3,
    shadeTint: '#4d4580',
    sky: '#7f9bd6',
    skyIntensity: 0.26,
    ground: '#c9825a',
    groundIntensity: 0.14,
    rim: '#a6dcff',
    rimIntensity: 0.6,
    rimDir: [-0.72, 0.34, -0.6],
    fog: '#0a2a33',
    fogRange: [16, 36],
    pool: [0, 0.6, 0.1, 4.3],
    poolFloor: 0.34,
  },
  grade: {
    exposure: 1,
    contrast: 1.04,
    saturation: 1.08,
    vignette: 0.32,
    bloom: 0.55,
    shadowTint: '#ffffff',
    highlightTint: '#ffffff',
    aoTint: '#1c0f22',
  },
  camera: {
    position: new THREE.Vector3(0.2, 5.05, 13.5),
    target: new THREE.Vector3(0, 1.5, -0.4),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 1.0, 0), distance: 0.6, lift: 3.9 },
  focusPoint: new THREE.Vector3(0, 1, 0),
  focusRange: 3.8,
  aoRadius: 0.42,
  shadow: { center: new THREE.Vector3(0, 0.8, -0.3), radius: 8.2 },
  pile: vesselPile({
    k: 1,
    floorY: POT.floorY,
    rimY: POT.rimY,
    innerR: POT.innerR,
    outerR: POT.outerR,
    groundY: 0.01,
    size: 10,
    peak: 2.75,
    endSlope: 0.44,
    coreDensityRadius: 2.3,
    outerDensityRadius: 3.9,
    flakeScale: 0.2,
  }),
  homeRadius: POT.innerR * 0.72,
  steamY: POT.rimY,
  spreadRadius: 7.5,
  nest: { position: new THREE.Vector3(-8.2, -3.3, -15.2), scale: 0.42 },
  lamps: [
    { position: [0, 0.5, 0], color: '#5f9dff', intensity: 0.9, radius: 3.4, flicker: 0.14 },
    { position: [-3.95, 3.6, -2.5], color: '#e86ea0', intensity: 0.5, radius: 5 },
  ],
  slots: { pan: PAN_SLOTS, microwave: MICROWAVE_SLOTS },
  cannon: null,
  perches: [],
  build: buildStove,
};

import * as THREE from 'three';
import { Spring } from '../../motion/ease.ts';
import { globals } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, addToyInstances, at, Kit, P, type ToyInstances } from '../geometry/kit.ts';
import type { SceneContext, SceneParts, SceneSpec, UnitSlot } from './types.ts';
import { vesselPile } from './vessel.ts';

const GROUND = -9;
const BUCKET = { floorY: 2.2, rimY: 4.6, innerR: 3.4, outerR: 3.85 };
const STAGE_R = 14;

const C = {
  wall: '#6d1524',
  wallLight: '#842030',
  curtain: '#c4202f',
  curtainDeep: '#8f1423',
  gold: '#f0b73a',
  goldDeep: '#b9801f',
  seat: '#b3202f',
  seatDark: '#7c1422',
  floor: '#2b1420',
  aisle: '#4a1c2c',
  cream: '#ffeccb',
  red: '#d8313a',
  navy: '#20203c',
  head: '#2a1a2a',
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// The feature presentation: a moon that keeps twitching, which nobody in the audience notices.
const screenFragment = /* glsl */ `
uniform float uTime, uTear;
varying vec2 vUv;
float circle(vec2 p, vec2 c, float r) { return smoothstep(r + 0.006, r - 0.006, length(p - c)); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(2.05, 1.0);
  float flicker = 0.92 + 0.08 * sin(uTime * 37.0) * sin(uTime * 13.0);
  vec3 sky = mix(vec3(0.16, 0.2, 0.62), vec3(0.9, 0.42, 0.55), smoothstep(0.1, -0.5, p.y));
  float wobble = sin(uTime * 41.0) * 0.004 * (0.5 + 0.5 * sin(uTime * 0.9));
  vec2 c = vec2(0.34 + wobble, 0.13 + wobble * 0.6);
  float moon = circle(p, c, 0.2);
  float crater = circle(p, c + vec2(0.06, 0.07), 0.05) + circle(p, c + vec2(-0.08, -0.03), 0.035);
  vec3 col = mix(sky, vec3(1.1, 1.0, 0.76) * (1.0 - crater * 0.14), moon);
  float ground = smoothstep(-0.24, -0.26, p.y + 0.03 * sin(p.x * 9.0 + 1.0) + 0.02 * sin(p.x * 21.0));
  col = mix(col, vec3(0.08, 0.05, 0.2), ground);
  float reel = fract(uTime * 0.11);
  float grain = fract(sin(dot(floor(vUv * 220.0) + floor(uTime * 12.0), vec2(12.9, 78.2))) * 43758.5);
  col *= flicker * (0.96 + grain * 0.06) * (1.0 - 0.45 * smoothstep(0.42, 0.52, abs(reel - 0.5)) * 0.2);
  // The screen bulges and tears as the popcorn behind it pushes through.
  float tear = uTear * smoothstep(0.55, 0.0, length(p + vec2(0.0, 0.05)) + 0.08 * sin(atan(p.y, p.x) * 11.0));
  col = mix(col, vec3(1.6, 1.42, 1.05), smoothstep(0.1, 0.5, tear));
  gl_FragColor = vec4(col * 1.05, 1.0);
}
`;

function addHall(kit: Kit): void {
  kit.add(P.box(150, 1, 130, 0.05, 1), { color: C.floor, gloss: 0.15, outline: 0, matrix: at(0, GROUND - 0.5, 20) });
  kit.add(P.box(14, 0.08, 90, 0.03, 1), { color: C.aisle, gloss: 0.1, outline: 0, matrix: at(0, GROUND + 0.05, 58) });
  // Back wall with pilasters and side walls in paneled velvet.
  kit.add(P.box(130, 60, 1, 0.05, 1), { color: C.wall, gloss: 0.1, outline: 0, matrix: at(0, 19, -46) });
  for (const side of [-1, 1]) {
    kit.add(P.box(1, 60, 130, 0.05, 1), { color: C.wall, gloss: 0.1, outline: 0, matrix: at(side * 63, 19, 18) });
    for (let i = 0; i < 6; i += 1) {
      const z = -30 + i * 20;
      kit.add(P.box(1.2, 44, 2.4, 0.3, 2), { color: C.wallLight, gloss: 0.2, matrix: at(side * 62, 12, z) });
      // Art-deco wall sconces that glow against the velvet.
      kit.add(P.lathe([[0, 0], [1.7, 0], [1.05, 2.2], [0, 2.4]], 16, 0.1, 2), { color: '#ffe3a0', emissive: 0.85, outline: 0, matrix: at(side * 60.8, 8, z + 10) });
    }
  }
}

function addStage(kit: Kit): void {
  kit.add(P.puck(STAGE_R + 0.5, STAGE_R, 9, 90, 0.3), {
    color: C.wallLight,
    gloss: 0.3,
    matrix: at(0, GROUND, 0),
    ao: (p) => 0.55 + 0.45 * smooth(GROUND, -2, p.y),
  });
  kit.add(P.torus(STAGE_R, 0.3, 8, 90), { color: C.gold, gloss: 0.9, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(STAGE_R, STAGE_R - 0.1, 0.1, 90, 0.04), {
    color: '#3d1a2a',
    gloss: 0.5,
    outline: 0,
    matrix: at(0, -0.08, 0),
    ao: (p) => 0.5 + 0.5 * smooth(4, 8, Math.hypot(p.x, p.z)),
  });
  // Footlights around the front of the stage.
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    kit.add(P.sphere(0.34, 8, 6), { color: '#ffe9b0', emissive: 1, outline: 0, matrix: at(Math.cos(a) * (STAGE_R - 0.75), 0.25, Math.sin(a) * (STAGE_R - 0.75)) });
  }
}

function addProscenium(kit: Kit): void {
  kit.add(P.box(92, 5, 3, 0.8, 3), { color: C.gold, gloss: 0.75, matrix: at(0, 39, -41) });
  for (const side of [-1, 1]) {
    kit.add(P.box(4.4, 54, 3, 0.8, 3), { color: C.gold, gloss: 0.75, matrix: at(side * 45, 12.5, -41) });
    // Heavy folded curtains, gathered to each side.
    for (let i = 0; i < 9; i += 1) {
      const x = side * (43 - i * 1.9);
      kit.add(P.capsule(1.25, 38, 3, 10), {
        color: i % 2 ? C.curtain : C.curtainDeep,
        gloss: 0.3,
        outline: i === 8 ? 1 : 0.35,
        matrix: at(x, 16 + i * 0.25, -39.5 + (i % 2) * 0.7, [0, 0, side * i * 0.008]),
        ao: (p) => 0.55 + 0.45 * smooth(GROUND, 8, p.y),
      });
    }
  }
  for (let i = -11; i <= 11; i += 1) {
    kit.add(P.sphere(2.3, 12, 9), { color: i & 1 ? C.curtain : C.curtainDeep, gloss: 0.3, outline: 0.5, matrix: at(i * 3.65, 35.5, -39.3, [0, 0, 0], [1, 1.15, 0.6]) });
  }
  // Marquee letters of light along the arch.
  for (let i = -20; i <= 20; i += 1) {
    kit.add(P.sphere(0.32, 8, 6), { color: '#fff1c4', emissive: 1, outline: 0, matrix: at(i * 2.1, 38.9, -39.4) });
  }
}

function addSnackBar(kit: Kit): void {
  // The kitchen diorama now sits on the concession counter like a window display.
  kit.add(P.box(21, 5.2, 12.5, 0.3, 2), { color: C.red, gloss: 0.6, matrix: at(-40.8, GROUND + 2.6, -4.4) });
  for (let i = 0; i < 8; i += 1) kit.add(P.box(1.25, 4.4, 0.2, 0.08, 1), { color: i % 2 ? C.cream : C.red, gloss: 0.6, outline: 0, matrix: at(-49.4 + i * 2.5, GROUND + 2.6, 1.9) });
  kit.add(P.box(22, 0.5, 13.5, 0.14, 2), { color: C.gold, gloss: 0.85, matrix: at(-40.8, GROUND + 5.45, -4.4) });
  // A dark inlay and a ring of bulbs, so the top still reads when the camera sweeps across it.
  const top = GROUND + 5.7;
  kit.add(P.box(20.4, 0.05, 11.9, 0.02, 1), { color: '#4d1020', gloss: 0.55, outline: 0, matrix: at(-40.8, top + 0.01, -4.4) });
  const bulb = (x: number, z: number): void => {
    kit.add(P.sphere(0.2, 8, 6), { color: '#ffe9b0', emissive: 1, outline: 0, matrix: at(x, top + 0.14, z) });
  };
  for (let i = 0; i <= 13; i += 1) {
    const x = -50.6 + i * 1.507;
    bulb(x, -10.75);
    bulb(x, 1.95);
  }
  for (let i = 1; i < 8; i += 1) {
    const z = -10.75 + i * 1.5875;
    bulb(-50.6, z);
    bulb(-31, z);
  }
}

function seatGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(3, 0.7, 2.6, 0.3, 2), { color: '#ffffff', gloss: 0.4, matrix: at(0, 1.9, 0) });
  kit.add(P.box(3, 3, 0.6, 0.28, 2), { color: '#ffffff', gloss: 0.4, matrix: at(0, 3.5, 1.2, [0.14, 0, 0]) });
  for (const side of [-1, 1]) kit.add(P.box(0.32, 1.9, 2.4, 0.12, 1), { color: '#2d1520', gloss: 0.5, matrix: at(side * 1.65, 1, 0.1) });
  return kit.build();
}

function headGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(0.92, 12, 9), { color: '#ffffff', gloss: 0.25, matrix: at(0, 6.1, 0.75) });
  kit.add(P.capsule(0.95, 1.2, 3, 10), { color: '#ffffff', gloss: 0.2, matrix: at(0, 4.2, 0.8) });
  return kit.build();
}

function bucketGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o } = BUCKET;
  const kit = new Kit();
  const stripes = 18;
  for (let s = 0; s < stripes; s += 1) {
    const a0 = (s / stripes) * Math.PI * 2;
    const arc = (Math.PI * 2) / stripes;
    const geometry = new THREE.LatheGeometry(
      [new THREE.Vector2(2.75, 0.02), new THREE.Vector2(o, r)],
      6,
      a0,
      arc,
    );
    geometry.computeVertexNormals();
    kit.add(geometry, { color: s % 2 ? C.cream : C.red, gloss: 0.7, outline: 0, ao: (p) => 0.6 + 0.4 * smooth(0, 1.6, p.y) });
  }
  kit.add(P.lathe([[0, 0.02], [2.72, 0.02], [o - 0.08, r - 0.04], [o - 0.15, r - 0.04]], 72, 0.02, 1), { color: C.red, gloss: 0.4 });
  kit.add(P.lathe([[o - 0.03, r - 0.1], [o + 0.12, r], [o + 0.03, r + 0.12], [i + 0.02, r + 0.1], [i - 0.03, r - 0.05]], 72, 0.04), { color: C.gold, gloss: 0.9 });
  kit.add(P.lathe([[i, r], [i - 0.12, f + 0.4], [i - 0.6, f], [0, f]], 72, 0.2), { color: C.navy, gloss: 0.3, outline: 0, ao: (p) => 0.4 + 0.6 * smooth(f, r, p.y) });
  return kit.build();
}

/** One belt on each side of the stage, climbing from the carts up to the popcorn machines. */
const BELT = { x: 26, nearZ: 7, farZ: -19, nearY: GROUND + 6, farY: GROUND + 10.5 };
const beltHeightAt = (z: number): number => BELT.nearY + ((BELT.nearZ - z) / (BELT.nearZ - BELT.farZ)) * (BELT.farY - BELT.nearY);

function beltGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const { x, nearZ, farZ, nearY, farY } = BELT;
  const run = nearZ - farZ;
  const rise = farY - nearY;
  const length = Math.hypot(run, rise);
  const pitch = Math.atan2(rise, run);
  const z = (nearZ + farZ) / 2;
  const y = (nearY + farY) / 2;
  for (const side of [-1, 1]) {
    const cx = side * x;
    kit.add(P.box(3, 0.5, length, 0.14, 2), { color: '#2d2b36', gloss: 0.4, matrix: at(cx, y - 0.3, z, [pitch, 0, 0]) });
    kit.add(P.box(2.5, 0.1, length + 0.4, 0.04, 1), { color: '#4a4757', gloss: 0.25, outline: 0, matrix: at(cx, y - 0.02, z, [pitch, 0, 0]) });
    for (const rail of [-1, 1]) kit.add(P.box(0.16, 0.34, length, 0.06, 1), { color: C.gold, gloss: 0.8, matrix: at(cx + rail * 1.5, y + 0.08, z, [pitch, 0, 0]) });
    for (let i = 0; i <= 3; i += 1) {
      const postZ = farZ + 1 + (i * (run - 2)) / 3;
      const top = beltHeightAt(postZ) - 0.4;
      for (const rail of [-1, 1]) kit.add(P.box(0.3, top - GROUND, 0.3, 0.08, 1), { color: '#2d2b36', gloss: 0.3, matrix: at(cx + rail * 1.2, (top + GROUND) / 2, postZ) });
    }
  }
  return kit.build();
}

function beltLoadGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(0.72, 10, 8), { color: '#fff2d2', gloss: 0.12, matrix: at(0, 0.48, 0) });
  kit.add(P.sphere(0.48, 8, 6), { color: '#ffe9bd', gloss: 0.12, matrix: at(0.55, 0.32, 0.2) });
  kit.add(P.sphere(0.42, 8, 6), { color: '#ffe9bd', gloss: 0.12, matrix: at(-0.5, 0.3, -0.2) });
  return kit.build();
}

const BELT_LOADS = 26;

const steam = new THREE.Color(0.92, 0.9, 0.88);
const beamColor = new THREE.Color(0.9, 0.85, 0.65);

function buildCinema(stage: Stage, root: THREE.Group): SceneParts {
  const set = new Kit();
  addHall(set);
  addStage(set);
  addProscenium(set);
  addSnackBar(set);
  addToy(stage, root, set.build());
  const bucket = addToy(stage, root, bucketGeometry());

  const screenUniforms = { uTime: globals.uTime, uTear: { value: 0 } };
  const screenGeometry = new THREE.PlaneGeometry(82, 40, 40, 20);
  const screen = new THREE.Mesh(
    screenGeometry,
    new THREE.ShaderMaterial({ name: 'cinema-screen', vertexShader: screenVertex, fragmentShader: screenFragment, uniforms: screenUniforms }),
  );
  screen.position.set(0, 16, -44.6);
  root.add(screen);
  const screenRest = (screenGeometry.getAttribute('position') as THREE.BufferAttribute).array.slice();

  // Rows of seats, each with an audience member who only came for the snacks.
  const seats: ToyInstances = addToyInstances(stage, root, seatGeometry(), 176);
  const heads: ToyInstances = addToyInstances(stage, root, headGeometry(), 176);
  const seatColor = new THREE.Color(C.seat);
  const headColor = new THREE.Color();
  const hues = ['#ffcfa8', '#f0b68a', '#c98d62', '#8f5e3e', '#ffd9bb'];
  const audience: Array<{ x: number; z: number; ry: number; phase: number; flung: number; vx: number; vy: number }> = [];
  for (let row = 0; row < 8; row += 1) {
    const z = 24 + row * 5.6;
    const y = GROUND + row * 0.5;
    for (let col = -11; col <= 10; col += 1) {
      const x = (col + 0.5) * 4.4 + (col >= 0 ? 4 : -4);
      const curve = (x * x) / 900;
      const index = audience.length;
      const m = at(x, y, z - curve, [0, -x * 0.008, 0]);
      seats.setMatrixAt(index, m);
      seats.body.setColorAt(index, seatColor);
      headColor.set(hues[(index * 7) % hues.length]!);
      heads.body.setColorAt(index, headColor);
      audience.push({ x, z: z - curve, ry: -x * 0.008, phase: index * 1.37, flung: 0, vx: 0, vy: 0 });
    }
  }
  seats.ink.instanceColor = seats.body.instanceColor;
  heads.ink.instanceColor = heads.body.instanceColor;
  seats.commit(audience.length);

  // The cart-to-cinema supply line, built by the "影院专线" upgrade.
  const belt = addToy(stage, root, beltGeometry());
  belt.visible = false;
  const beltLoads = addToyInstances(stage, root, beltLoadGeometry(), BELT_LOADS, false);
  let beltOn = false;

  const bucketKick = new Spring(0, 420, 15);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let time = 0;
  let steamTimer = 0;
  let dustTimer = 0;
  let strain = 0;
  let blasted = false;

  return {
    kick(strength) {
      bucketKick.kick(-0.16 - 0.14 * strength);
    },
    upgradesChanged(owned) {
      beltOn = owned.includes('syn-cart-cinema');
      belt.visible = beltOn;
      if (!beltOn) beltLoads.commit(0);
    },
    strain(u) {
      strain = u;
      // The screen bows outward, pushed from behind.
      const pos = screenGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        const x = screenRest[i * 3]!;
        const y = screenRest[i * 3 + 1]!;
        const d = 1 - Math.min(1, Math.hypot(x / 41, y / 20));
        pos.setZ(i, d * d * u * u * 9);
      }
      pos.needsUpdate = true;
      screenUniforms.uTear.value = u * u * 0.4;
    },
    blast(ctx) {
      blasted = true;
      screenUniforms.uTear.value = 2;
      for (const person of audience) {
        person.flung = 0.001;
        person.vx = ctx.rng.range(-3, 3);
        person.vy = ctx.rng.range(14, 30);
      }
      for (let i = 0; i < 44; i += 1) {
        ctx.director.launch(ctx.rng.range(-16, 16), ctx.rng.range(10, 24), -40, { flight: ctx.rng.range(0.8, 1.4), scale: ctx.rng.range(0.45, 0.7), reach: 2.2, quiet: i > 8 });
      }
    },
    afterBlast(dt) {
      for (const person of audience) if (person.flung > 0) person.flung += dt;
    },
    settleAsMiniature() {
      blasted = true;
      screenUniforms.uTear.value = 2;
      heads.commit(0);
      belt.visible = false;
      beltOn = false;
      beltLoads.commit(0);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      if (beltOn) {
        const span = BELT.nearZ - BELT.farZ;
        for (let i = 0; i < BELT_LOADS; i += 1) {
          const side = i % 2 === 0 ? -1 : 1;
          const travelled = ((i / BELT_LOADS) * span + time * 3.4) % span;
          e.set(0, i * 2.4, 0);
          q.setFromEuler(e);
          const z = BELT.nearZ - travelled;
          p.set(side * BELT.x + Math.sin(i * 3.7) * 0.4, beltHeightAt(z) + 0.04, z);
          m.compose(p, q, s.setScalar(0.85 + (i % 3) * 0.12));
          beltLoads.setMatrixAt(i, m);
        }
        s.set(1, 1, 1);
        beltLoads.commit(BELT_LOADS);
      }
      const kick = bucketKick.update(dt);
      bucket.scale.set(1 - kick * 0.018, 1 + kick * 0.03 + strain * strain * 0.03 * Math.sin(time * 50), 1 - kick * 0.018);
      audience.forEach((person, index) => {
        const chew = Math.max(0, Math.sin(time * 2.4 + person.phase)) * 0.14;
        // Everyone leans toward the snacks, not the film.
        p.set(person.x, GROUND + Math.floor(index / 22) * 0.5 + chew * 0.5, person.z);
        let spin = 0;
        if (person.flung > 0) {
          const t = person.flung;
          p.x += person.vx * t;
          p.z += 16 * t;
          p.y += person.vy * t - 18 * t * t;
          spin = t * 6;
        }
        e.set(-0.12 + chew * 0.5 + spin, person.ry, spin * 0.6);
        q.setFromEuler(e);
        m.compose(p, q, s);
        heads.setMatrixAt(index, m);
      });
      heads.commit(blasted && audience[0]!.flung > 4 ? 0 : audience.length);

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.22;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        const radius = r.range(0.4, 2.8);
        ctx.sprites.spawn({ x: Math.cos(a) * radius, y: BUCKET.rimY + (ctx.level > 0.5 ? 5 : 0), z: Math.sin(a) * radius, vx: r.range(-0.2, 0.2), vy: r.range(1.2, 2), vz: r.range(-0.2, 0.2), drag: 0.25, sizeStart: 0.55, sizeEnd: r.range(1.8, 2.6), life: r.range(1.7, 2.5), color: steam, alpha: 0.05, kind: SpriteKind.Puff, spin: r.range(-0.4, 0.4) });
      }
      // Dust drifting through the projector beam: the room's constant motion.
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = 0.07;
        const r = ctx.rng;
        const t = r.next();
        ctx.sprites.spawn({ x: r.range(-14, 14) * t, y: 34 - 16 * (1 - t) + r.range(-3, 3) * t, z: 72 - 110 * (1 - t) * 0.92, vx: r.range(-0.4, 0.4), vy: r.range(-0.25, 0.25), drag: 0.2, sizeStart: 0.1, sizeEnd: 0.16, life: r.range(2, 3.4), color: beamColor, alpha: 0.5, additive: 1, kind: SpriteKind.Drop });
      }
    },
  };
}

const floorSlot = (x: number, z: number, rotation: number, scale: number): UnitSlot => ({ x, y: GROUND, z, rotation, scale });
const stageSlot = (angle: number, radius: number, scale: number, turn = 0): UnitSlot => ({
  x: Math.cos(angle) * radius,
  y: 0.02,
  z: Math.sin(angle) * radius,
  rotation: -angle + turn,
  scale,
});

export const cinemaSpec: SceneSpec = {
  id: 2,
  light: {
    sunDir: [0.3, 0.95, 0.42],
    sunColor: '#ffe9c8',
    sunIntensity: 1.42,
    shadeTint: '#55305f',
    sky: '#b89ad0',
    skyIntensity: 0.2,
    ground: '#b5404a',
    groundIntensity: 0.2,
    rim: '#ffcf9a',
    rimIntensity: 0.55,
    rimDir: [-0.6, 0.25, -0.75],
    fog: '#1c0a14',
    fogRange: [110, 240],
    pool: [0, 0, 2, 27],
    poolFloor: 0.36,
  },
  grade: {
    exposure: 1.02,
    contrast: 1.07,
    saturation: 1.05,
    vignette: 0.42,
    bloom: 0.72,
    shadowTint: '#fff2f4',
    highlightTint: '#fff8ee',
    aoTint: '#1c0814',
  },
  camera: {
    position: new THREE.Vector3(-3, 26, 104),
    target: new THREE.Vector3(-3, 8, -6),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 3, 0), distance: 0.34, lift: 11 },
  focusPoint: new THREE.Vector3(0, 2, 3),
  focusRange: 30,
  aoRadius: 2,
  shadow: { center: new THREE.Vector3(-3, 3, 4), radius: 58 },
  pile: vesselPile({
    k: 3,
    floorY: BUCKET.floorY,
    rimY: BUCKET.rimY,
    innerR: BUCKET.innerR,
    outerR: BUCKET.outerR,
    groundY: GROUND + 0.05,
    table: { y: 0.03, radius: STAGE_R },
    size: 74,
    peak: 13.5,
    endSlope: 0.54,
    coreDensityRadius: 10,
    outerDensityRadius: 23,
    flakeScale: 0.78,
  }),
  homeRadius: BUCKET.innerR * 0.72,
  steamY: BUCKET.rimY,
  spreadRadius: 46,
  nest: { position: new THREE.Vector3(-25, 1.9, -24.5), scale: 0.2, rise: 0.85 },
  slots: {
    pan: [stageSlot(2.5, 11.5, 2.2), stageSlot(0.7, 11.5, 2.2), stageSlot(3.3, 11.8, 2.2), stageSlot(-0.1, 11.8, 2.2), stageSlot(2.0, 8.6, 2), stageSlot(1.15, 8.6, 2)],
    cart: [floorSlot(-24, 8, 0.6, 4), floorSlot(24, 8, -0.6, 4), floorSlot(-33, 14, 0.9, 4), floorSlot(33, 14, -0.9, 4)],
    cinema: [floorSlot(-16, -26, 0.25, 3.6), floorSlot(16, -26, -0.25, 3.6), floorSlot(-28, -22, 0.4, 3.6), floorSlot(28, -22, -0.4, 3.6), floorSlot(-36, 2, 0.8, 3.8), floorSlot(38, 2, -0.8, 3.8), floorSlot(-6, -30, 0.1, 3.4), floorSlot(6, -30, -0.1, 3.4)],
  },
  cannon: { position: new THREE.Vector3(20, GROUND, 5), rotation: Math.PI - 0.25, scale: 5 },
  perches: [
    new THREE.Vector3(-30, 41.9, -40.5),
    new THREE.Vector3(-20, 41.9, -40.5),
    new THREE.Vector3(-10, 41.9, -40.5),
    new THREE.Vector3(2, 41.9, -40.5),
    new THREE.Vector3(14, 41.9, -40.5),
    new THREE.Vector3(26, 41.9, -40.5),
  ],
  build: buildCinema,
};

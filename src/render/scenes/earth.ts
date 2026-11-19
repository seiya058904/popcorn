import * as THREE from 'three';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, Spring } from '../../motion/ease.ts';
import { Rng } from '../../motion/rng.ts';
import { globals } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { PopcornSnow } from '../fx/snow.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, at, Kit, P } from '../geometry/kit.ts';
import { GLSL_LIGHT_PARS, GLSL_UTIL } from '../materials/glsl.ts';
import { popcornUniforms } from '../materials/popcorn.ts';
import { toyMaterials } from '../materials/toy.ts';
import { PieceBatches } from '../popcorn/batches.ts';
import type { PileShape } from '../popcorn/pile.ts';
import type { FinalePlan, SceneContext, SceneParts, SceneSpec, UnitSlot } from './types.ts';

const R = 34;
const K = 3.5;
const CRATER = { floorY: 2.4, rimY: 5.2, innerR: 4.6, outerR: 5.5, skirtR: 13 };
const MOON_R = 12.5;
const MOON_HOME = new THREE.Vector3(-64, 40, -56);

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const sphereY = (r: number): number => Math.sqrt(Math.max(0, R * R - r * r)) - R;

const coneY = (r: number): number => lerp(CRATER.rimY, sphereY(CRATER.skirtR), smooth(CRATER.outerR, CRATER.skirtR, r) ** 0.8);

function groundAt(r: number): number {
  return r < CRATER.skirtR ? Math.max(sphereY(r), coneY(r)) : sphereY(r);
}

const peakAt = (level: number): number => lerp(CRATER.floorY + 0.35, 11.5, level ** 0.85);
const slopeAt = (level: number): number => lerp(1.15, 0.5, level);
const craterMound = (r: number, level: number): number => peakAt(level) - K * slopeAt(level) * (r / K) ** 1.35;
const capRadius = (level: number): number => lerp(CRATER.outerR, 31, level ** 1.15);

export const earthPile: PileShape = {
  centerX: 0,
  centerZ: 0,
  size: 66,
  k: K,
  flakeScale: 0.62,
  wallHeight: CRATER.rimY,
  floor(x, z) {
    const r = Math.hypot(x, z);
    if (r < CRATER.innerR) return CRATER.floorY;
    if (r < CRATER.outerR + 0.15) return CRATER.rimY;
    return groundAt(r);
  },
  mound(x, z, level, wobble) {
    const r = Math.hypot(x, z);
    if (r < CRATER.outerR + 0.15) return craterMound(r, level);
    const crest = craterMound(CRATER.innerR, level) - CRATER.rimY;
    if (crest <= 0) return groundAt(r) - K;
    // The popcorn settles over the planet as a thickening ice cap.
    const reach = capRadius(level) * (1 + wobble * 0.12);
    const u = r / reach;
    if (u >= 1) return groundAt(r) - K;
    return groundAt(r) + (0.5 * K + Math.min(crest, 3.2)) * (1 - u * u) ** 0.6 - 0.1;
  },
  landingRadius(level) {
    const crest = craterMound(CRATER.innerR, level) - CRATER.rimY;
    return crest > 0 ? Math.min(CRATER.innerR + crest * 2.2, capRadius(level) * 0.75) : CRATER.innerR * 0.9;
  },
  density(x, z) {
    const r = Math.hypot(x, z);
    return r < 5 ? 0.7 : lerp(1, 0.3, smooth(8, 28, r));
  },
  clearance(x, z) {
    const r = Math.hypot(x, z);
    if (r < CRATER.innerR) return smooth(CRATER.innerR - 0.15, CRATER.innerR - 0.8, r);
    return smooth(CRATER.outerR + 0.3, CRATER.outerR + 1, r);
  },
};

const globeVertex = /* glsl */ `
attribute vec4 aMat;
varying vec3 vWorld, vNormal, vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const globeFragment = /* glsl */ `
uniform float uSnow, uSpin;
uniform vec3 uPopCream, uPopShade;
varying vec3 vWorld, vNormal, vDir;

float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec3 p) { return gnoise(p) * 0.55 + gnoise(p * 2.1 + 3.1) * 0.3 + gnoise(p * 4.3 + 7.7) * 0.15; }

void main() {
  float c = cos(uSpin), s = sin(uSpin);
  vec3 d = vec3(vDir.x * c - vDir.z * s, vDir.y, vDir.x * s + vDir.z * c);
  float land = smoothstep(0.5, 0.53, fbm(d * 2.6 + 11.0));
  float inland = smoothstep(0.54, 0.64, fbm(d * 2.6 + 11.0));
  vec3 ocean = mix(vec3(0.04, 0.26, 0.66), vec3(0.06, 0.42, 0.78), smoothstep(0.3, 0.5, fbm(d * 2.6 + 11.0)));
  vec3 ground = mix(vec3(0.3, 0.68, 0.34), vec3(0.74, 0.62, 0.3), inland * smoothstep(0.1, 0.55, gnoise(d * 5.0 + 2.0)));
  vec3 albedo = mix(ocean, ground, land);
  float gloss = mix(0.75, 0.1, land);

  // Popcorn snow advances from the pole, breaking into drifts at its edge.
  float line = 1.0 - uSnow * 2.15;
  float edge = fbm(vDir * 5.0) * 0.26;
  float snow = smoothstep(line - 0.02, line + 0.05, vDir.y + edge - 0.13);
  vec2 cell = worley(vDir.xz * 18.0 + vDir.y * 11.0);
  vec3 drift = mix(uPopShade, uPopCream, smoothstep(0.1, 0.62, 1.0 - cell.x));
  drift = mix(drift, vec3(1.0, 0.96, 0.86), 0.45);

  vec3 cloudP = d * 3.4 + vec3(uTime * 0.03, 0.0, uTime * 0.018);
  float cloud = smoothstep(0.56, 0.68, fbm(cloudP));
  albedo = mix(albedo, vec3(0.98), cloud * 0.85);
  albedo = mix(albedo, drift, snow);
  gloss = mix(gloss, 0.08, max(snow, cloud));

  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 col = toyLight(albedo, N, V, vWorld, gloss, 1.0, sunShadow(vWorld, N));
  float atmosphere = pow(1.0 - sat(dot(N, V)), 3.0);
  col += vec3(0.32, 0.56, 1.0) * atmosphere * 0.85;
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

function craterGeometry(): THREE.BufferGeometry {
  const { floorY: f, rimY: r, innerR: i, outerR: o, skirtR: s } = CRATER;
  const kit = new Kit();
  const profile: Array<[number, number]> = [[s + 1, sphereY(s + 1) - 0.8]];
  for (let n = 0; n <= 24; n += 1) {
    const radius = lerp(s, o, n / 24);
    profile.push([radius, coneY(radius) + 0.05]);
  }
  profile.push([o - 0.3, r + 0.3], [i + 0.25, r + 0.25], [i, r - 0.2], [i - 0.15, f + 0.3], [i - 0.7, f], [0, f]);
  const rock = new THREE.Color('#5b4150');
  const ridge = new THREE.Color('#84606e');
  const glow = new THREE.Color('#ff7a2f');
  const inner = new THREE.Color('#2a1820');
  kit.add(P.lathe(profile, 72, 0.12, 2), {
    color: rock,
    gloss: 0.12,
    colorFn: (p, _n, out) => {
      const rr = Math.hypot(p.x, p.z);
      const a = Math.atan2(p.z, p.x);
      out.lerpColors(rock, ridge, 0.5 + 0.5 * Math.sin(a * 11 + rr * 1.3));
      if (rr < i + 0.08) out.copy(inner);
      else out.lerp(glow, smooth(o + 1.4, o - 0.1, rr));
    },
  });
  return kit.build();
}

function moonGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.sphere(MOON_R, 44, 30), {
    color: '#fff1c4',
    gloss: 0.1,
    colorFn: (p, _n, out) => {
      const x = p.x / MOON_R;
      const y = p.y / MOON_R;
      const crater = Math.max(0, 1 - Math.hypot(x - 0.28, y - 0.32) / 0.28) * 0.2 + Math.max(0, 1 - Math.hypot(x + 0.34, y + 0.14) / 0.2) * 0.2 + Math.max(0, 1 - Math.hypot(x - 0.16, y + 0.46) / 0.15) * 0.18;
      out.multiplyScalar(1 - crater);
    },
  });
  return kit.build();
}

function starsGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const top = new THREE.Color('#0c0a30');
  const low = new THREE.Color('#2a1650');
  kit.add(P.sphere(420, 24, 14), { color: top, emissive: 1, outline: 0, gloss: 0, matrix: at(0, 0, 0, [0, 0, 0], -1), colorFn: (p, _n, out) => out.lerpColors(low, top, clamp01(p.y / 260 + 0.5)) });
  const rng = new Rng(555);
  for (let i = 0; i < 240; i += 1) {
    const a = rng.range(0, 6.28);
    const y = rng.range(-0.4, 1);
    const r = Math.sqrt(1 - y * y);
    kit.add(P.sphere(rng.range(0.5, 1.5), 5, 4), {
      color: rng.next() < 0.3 ? '#ffe9b0' : '#dbe6ff',
      emissive: 1,
      outline: 0,
      matrix: at(Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400),
    });
  }
  return kit.build();
}

function fingerSegment(length: number, radius: number): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.capsule(radius, length, 5, 14), { color: '#ffd2ab', gloss: 0.25, matrix: at(0, length / 2, 0) });
  return kit.build();
}

function palmGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  // Knuckles run along Z, so the fingers close in the plane of the screen.
  kit.add(P.box(18, 50, 44, 8.5, 5), { color: '#ffd2ab', gloss: 0.25 });
  kit.add(P.capsule(13, 44, 5, 14), { color: '#ffd2ab', gloss: 0.25, matrix: at(0, -46, 0) });
  kit.add(P.torus(14.2, 2.2, 8, 28), { color: '#d8313a', gloss: 0.8, matrix: at(0, -34, 0, [Math.PI / 2, 0, 0]) });
  return kit.build();
}

interface Finger {
  base: THREE.Group;
  middle: THREE.Group;
  tip: THREE.Group;
}

const steam = new THREE.Color(0.95, 0.92, 0.9);
const lava = new THREE.Color(2.6, 1, 0.25);
const flashColor = new THREE.Color(3, 2.4, 1.5);
const debris = new THREE.Color('#fff2d2');
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

const HEAT_START = 3;
const POP_AT = 8.3;
const HAND_IN = 12;
const GRAB_AT = 15.6;
const HAND_OUT = 17;
const FINALE_END = 20.4;
const HAND_SCALE = 1.55;
const HAND_REST = new THREE.Vector3(104, 26, 6);
const LEAVE_X = 330;
const LEAVE_Y = 60;

function buildEarth(stage: Stage, root: THREE.Group): SceneParts {
  const sky = new THREE.Group();
  root.add(sky);
  addToy(stage, sky, starsGeometry(), { shadow: false, outline: false });

  const globeUniforms = {
    ...globals,
    uPopCream: popcornUniforms.uPopCream,
    uPopShade: popcornUniforms.uPopShade,
    uSnow: { value: 0 },
    uSpin: { value: 0 },
  };
  const hash31 = 'float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n';
  const globeKit = new Kit();
  globeKit.add(new THREE.SphereGeometry(R, 128, 88), { color: '#ffffff', outline: 1.4 });
  const globeGeometry = globeKit.build();
  const globe = new THREE.Mesh(
    globeGeometry,
    new THREE.ShaderMaterial({
      name: 'globe',
      vertexShader: globeVertex,
      fragmentShader: `${GLSL_UTIL}\n${hash31}${GLSL_LIGHT_PARS}\n${globeFragment}`,
      uniforms: globeUniforms,
    }),
  );
  globe.position.y = -R;
  root.add(globe);
  const globeInk = new THREE.Mesh(globeGeometry, toyMaterials().outline);
  globeInk.position.y = -R;
  root.add(globeInk);
  stage.shadow.add(globe, toyMaterials().depth);

  const crater = addToy(stage, root, craterGeometry());

  const moon = new THREE.Group();
  moon.position.copy(MOON_HOME);
  sky.add(moon);
  addToy(stage, moon, moonGeometry());

  // The moon's true form: a kernel the size of a moon.
  const moonFlake = new PieceBatches(stage, sky, 1);
  const flakeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 1.3, 0.2));
  const snow = new PopcornSnow(root, { count: 560, size: 0.4, height: 86, radius: 50, center: [0, -14, -4] });

  // The hand: a palm with four two-jointed fingers and a thumb.
  const hand = new THREE.Group();
  hand.visible = false;
  sky.add(hand);
  addToy(stage, hand, palmGeometry());
  const segment = (parent: THREE.Object3D, length: number, radius: number, x: number, y: number, z: number): THREE.Group => {
    const joint = new THREE.Group();
    joint.position.set(x, y, z);
    parent.add(joint);
    addToy(stage, joint, fingerSegment(length, radius));
    return joint;
  };
  hand.scale.setScalar(HAND_SCALE);
  const fingers: Finger[] = [-15.5, -5.2, 5.2, 15.5].map((z, index) => {
    const length = index === 1 || index === 2 ? 25 : 21;
    const base = segment(hand, length, 5.2, 5, 25, z);
    const middle = segment(base, length * 0.8, 4.7, 0, length, 0);
    const tip = segment(middle, length * 0.62, 4.2, 0, length * 0.8, 0);
    return { base, middle, tip };
  });
  const thumbBase = segment(hand, 22, 6.2, -8, 2, 0);
  const thumbTip = segment(thumbBase, 17, 5.4, 0, 22, 0);

  const craterKick = new Spring(0, 420, 15);
  let time = 0;
  let steamTimer = 0;
  let spin = 0;
  let finaleTime = -1;
  let popped = false;
  let lavaTimer = 0;
  let grabbed = false;
  const carried = new THREE.Vector3();

  const setFingers = (curl: number): void => {
    fingers.forEach((finger, index) => {
      // Fingers fan out and close slightly out of step, so they read as four, not one.
      const spread = (index - 1.5) * 0.17 * (1 - curl * 0.55);
      const lag = 1 - Math.abs(index - 1.5) * 0.09;
      finger.base.rotation.set(spread, 0, 0.08 + index * 0.035 + curl * 0.5 * lag);
      finger.middle.rotation.z = 0.1 + curl * 0.86 * lag;
      finger.tip.rotation.z = 0.08 + curl * 0.72 * lag;
    });
    thumbBase.rotation.z = 1.5 - curl * 0.42;
    thumbTip.rotation.z = -0.15 - curl * 0.85;
  };

  const showMoonFlake = (scale: number, pop: number, glow: number): void => {
    moonFlake.begin();
    m.compose(MOON_HOME, q.copy(flakeQuat), s.setScalar(scale));
    moonFlake.push(0, m, pop, glow);
    moonFlake.end();
  };

  const placeHand = (t: number): void => {
    // In from the right, fingers over the top of the planet, then away with it.
    const enter = easeOutCubic(clamp01((t - HAND_IN) / (GRAB_AT - HAND_IN - 0.5)));
    const leave = easeInOutCubic(clamp01((t - HAND_OUT) / (FINALE_END - 0.9 - HAND_OUT)));
    const lift = smooth(GRAB_AT + 0.1, HAND_OUT, t) * 7;
    carried.set(leave * LEAVE_X, lift + leave * LEAVE_Y, 0);
    hand.position.set(lerp(330, HAND_REST.x, enter), HAND_REST.y, HAND_REST.z).add(carried);
    hand.rotation.set(0, 0, Math.PI / 2 - 0.06 - leave * 0.12);
    setFingers(smooth(GRAB_AT - 0.9, GRAB_AT + 0.05, t));
    if (t >= GRAB_AT) grabbed = true;
    if (grabbed) {
      // The planet leaves with the hand; the sky stays behind.
      root.position.copy(carried);
      sky.position.copy(carried).negate();
    }
  };

  const finale: FinalePlan = {
    duration: FINALE_END,
    beats: [
      [HEAT_START, 'moon-heat'],
      [POP_AT - 0.75, 'moon-silence'],
      [POP_AT, 'moon-pop'],
      [HAND_IN, 'hand'],
      [GRAB_AT, 'grab'],
    ],
    camera(t) {
      // One wide two-shot holds both the planet and the moon for the whole ending.
      const u = easeInOutCubic(clamp01(t / 3));
      const out = easeInOutCubic(clamp01((t - HAND_IN + 1) / 3));
      return {
        position: new THREE.Vector3(lerp(8, -8, u) + out * 16, lerp(30, 20, u), lerp(128, 192, u) + out * 26),
        target: new THREE.Vector3(lerp(0, -18, u) + out * 16, lerp(-14, 0, u), lerp(0, -16, u)),
      };
    },
    update(t, dt, ctx) {
      finaleTime = t;
      globeUniforms.uSnow.value = 1;
      snow.setAmount(1);
      const heat = smooth(HEAT_START, POP_AT - 0.75, t);
      if (!popped) {
        const tremble = heat * heat * 0.9;
        const swell = 1 + heat * heat * 0.42;
        moon.position.set(MOON_HOME.x + Math.sin(t * 61) * tremble, MOON_HOME.y + Math.cos(t * 53) * tremble, MOON_HOME.z);
        moon.scale.setScalar(swell);
        if (t >= POP_AT) {
          popped = true;
          moon.visible = false;
          for (let i = 0; i < 50; i += 1) {
            const a = ctx.rng.range(0, 6.28);
            const b = ctx.rng.range(-1, 1);
            const r = Math.sqrt(1 - b * b);
            const speed = ctx.rng.range(8, 34);
            ctx.sprites.spawn({ x: MOON_HOME.x, y: MOON_HOME.y, z: MOON_HOME.z, vx: Math.cos(a) * r * speed, vy: b * speed, vz: Math.sin(a) * r * speed, drag: 0.5, sizeStart: ctx.rng.range(0.6, 1.8), sizeEnd: 0.4, life: ctx.rng.range(1.6, 3.2), color: debris, alpha: 1, kind: SpriteKind.Fleck, spin: ctx.rng.range(-4, 4) });
          }
          ctx.sprites.spawn({ x: MOON_HOME.x, y: MOON_HOME.y, z: MOON_HOME.z, sizeStart: 34, sizeEnd: 70, life: 0.5, color: flashColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: 0.5 });
          ctx.sprites.spawn({ x: MOON_HOME.x, y: MOON_HOME.y, z: MOON_HOME.z, sizeStart: 14, sizeEnd: 90, life: 0.9, color: flashColor, alpha: 0.5, additive: 1, kind: SpriteKind.Ring });
        }
      }
      if (popped) {
        const age = t - POP_AT;
        const pop = age < 0.16 ? lerp(0.1, 1.28, easeOutCubic(age / 0.16)) : 1 + 0.28 * Math.exp(-(age - 0.16) * 7) * Math.cos((age - 0.16) * 22);
        flakeQuat.premultiply(q.setFromAxisAngle(v.set(0.3, 1, 0.2).normalize(), dt * 0.1));
        showMoonFlake(MOON_R * 1.5 * easeOutBack(clamp01(age / 0.2), 1.4), pop, Math.exp(-age * 2.4));
      }
      if (t >= HAND_IN - 0.1) {
        hand.visible = true;
        placeHand(t);
      }
    },
    showFinal() {
      finaleTime = FINALE_END;
      globeUniforms.uSnow.value = 1;
      snow.setAmount(1);
      popped = true;
      moon.visible = false;
      showMoonFlake(MOON_R * 1.5, 1, 0);
    },
  };

  return {
    finale,
    kick(strength) {
      craterKick.kick(-0.14 - 0.12 * strength);
    },
    update(dt, ctx: SceneContext) {
      time += dt;
      spin += dt * 0.022;
      globeUniforms.uSpin.value = spin;
      const k = craterKick.update(dt);
      crater.scale.set(1 - k * 0.008, 1 + k * 0.016, 1 - k * 0.008);
      if (finaleTime < 0) {
        globeUniforms.uSnow.value = 0.1 + ctx.level * 0.86;
        snow.setAmount(0.25 + ctx.level * 0.75);
        const tremble = 0.28 + ctx.level * ctx.level * 1.1;
        moon.position.set(MOON_HOME.x + Math.sin(time * 49) * 0.13 * tremble, MOON_HOME.y + Math.cos(time * 43) * 0.11 * tremble, MOON_HOME.z);
      }
      moon.rotation.y = time * 0.02;

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.2;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        ctx.sprites.spawn({ x: Math.cos(a) * r.range(0.5, 3.2), y: CRATER.rimY + (ctx.level > 0.4 ? 5 : 0), z: Math.sin(a) * r.range(0.5, 3.2), vy: r.range(1.6, 2.8), drag: 0.25, sizeStart: 0.7, sizeEnd: r.range(2.2, 3.2), life: r.range(1.6, 2.4), color: steam, alpha: 0.06, kind: SpriteKind.Puff });
      }
      lavaTimer -= dt;
      if (lavaTimer <= 0) {
        lavaTimer = 0.09;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        ctx.sprites.spawn({ x: Math.cos(a) * r.range(4.8, 5.4), y: CRATER.rimY + 0.2, z: Math.sin(a) * r.range(4.8, 5.4), vx: r.range(-1, 1), vy: r.range(2, 5), vz: r.range(-1, 1), gravity: 7, sizeStart: 0.2, sizeEnd: 0.05, life: 0.65, color: lava, alpha: 1, additive: 1, kind: SpriteKind.Drop });
      }
    },
  };
}

const onPlanet = (x: number, z: number, rotation: number, scale: number): UnitSlot => ({ x, y: sphereY(Math.hypot(x, z)) - 0.1, z, rotation, scale });

export const earthSpec: SceneSpec = {
  id: 4,
  light: {
    sunDir: [0.62, 0.62, 0.48],
    sunColor: '#fff4e2',
    sunIntensity: 1.42,
    shadeTint: '#27306e',
    sky: '#6f86d8',
    skyIntensity: 0.2,
    ground: '#34407f',
    groundIntensity: 0.12,
    rim: '#8fb8ff',
    rimIntensity: 0.7,
    rimDir: [-0.7, 0.25, -0.65],
    fog: '#0c0a30',
    fogRange: [400, 900],
    pool: [0, 0, 0, 400],
    poolFloor: 1,
  },
  grade: {
    exposure: 1.02,
    contrast: 1.08,
    saturation: 1.08,
    vignette: 0.38,
    bloom: 0.8,
    shadowTint: '#f0f2ff',
    highlightTint: '#fff9f0',
    aoTint: '#0a0a2c',
  },
  camera: {
    position: new THREE.Vector3(8, 30, 128),
    target: new THREE.Vector3(0, -14, 0),
    fov: 27,
  },
  close: { target: new THREE.Vector3(0, 3, 0), distance: 0.34, lift: 12 },
  focusPoint: new THREE.Vector3(0, 0, 8),
  focusRange: 70,
  aoRadius: 2,
  shadow: { center: new THREE.Vector3(0, -12, 0), radius: 60 },
  pile: earthPile,
  homeRadius: CRATER.innerR * 0.72,
  steamY: CRATER.rimY,
  spreadRadius: 46,
  nest: null,
  lamps: [{ position: [0, CRATER.rimY + 1, 0], color: '#ff7a30', intensity: 1.3, radius: 26, flicker: 0.1 }],
  slots: {
    airship: [
      { x: -27, y: 7, z: -6, rotation: 0.2, scale: 1.5 },
      { x: 26, y: 9, z: -9, rotation: 2.9, scale: 1.5 },
      { x: -9, y: 14, z: -20, rotation: 0.1, scale: 1.4 },
    ],
    orbital: [
      { x: -41, y: -3, z: -6, rotation: 0.4, scale: 1.8 },
      { x: 40, y: 0, z: -8, rotation: -0.4, scale: 1.8 },
      { x: -40, y: -32, z: 4, rotation: 0.2, scale: 1.7 },
    ],
    factory: [onPlanet(-21, 2, 1.5, 2), onPlanet(20, -8, -2, 2), onPlanet(4, 22, 0, 2)],
    volcano: [onPlanet(-11, -13, 0.7, 2.4), onPlanet(13, -14, -0.7, 2.4), onPlanet(-20, -9, 1.2, 2.3), onPlanet(22, 7, -1.4, 2.3), onPlanet(-3, -21, 0.1, 2.3), onPlanet(-24, 11, 1.1, 2.2), onPlanet(23, 13, -1.1, 2.2), onPlanet(9, 24, -0.3, 2.2)],
  },
  cannon: { position: new THREE.Vector3(10.5, sphereY(13) + 0.1, 8), rotation: Math.PI - 0.7, scale: 2.5 },
  perches: [],
  build: buildEarth,
};

import * as THREE from 'three';
import { SIGN_TEXT } from '../../content/signs.ts';
import { lerp, Spring } from '../../motion/ease.ts';
import { lightGroup, type Lamp } from '../core/globals.ts';
import { globals } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { addLightBeam } from '../fx/beam.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addToy, addToyInstances, at, Kit, P, Pattern, type ToyInstances } from '../geometry/kit.ts';
import { PartRig, RIG_HIDDEN, type RigPart } from '../geometry/rig.ts';
import { M } from '../machines/common.ts';
import { addSign } from '../materials/sign.ts';
import type { SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';
import { dressCinema } from './dress.ts';
import { Cues, Pulse, type EggSpot } from './eggs.ts';
import { SetPieces, toyFigure } from './pieces.ts';
import { LightBank, storyWeights } from './story.ts';
import { vesselPile } from './vessel.ts';

const GROUND = -9;
/** The curtain cord hangs just inside the gathered curtain on the left, its top at this point. */
const CORD_AT = new THREE.Vector3(-26.2, 31, -38.2);
const CORD_LENGTH = 17;
/** The one in the front row who came for the film after all. */
const FAN = 11;
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

// The programme changes as the night goes on: an intermission card while the house lights are up,
// the countdown leader as they dim, then the feature, in which a moon keeps twitching and the
// popcorn on the ground keeps popping. uShow runs 0, 1, 2 through the three reels.
const screenFragment = /* glsl */ `
uniform float uTime, uTear, uShow;
varying vec2 vUv;
float circle(vec2 p, vec2 c, float r) { return smoothstep(r + 0.006, r - 0.006, length(p - c)); }
float box(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return smoothstep(0.006, -0.006, max(d.x, d.y)); }

// A popcorn bucket under a spotlight, framed by chasing marquee bulbs.
vec3 intermission(vec2 p) {
  vec3 col = mix(vec3(0.42, 0.05, 0.1), vec3(0.95, 0.3, 0.25), smoothstep(0.9, 0.0, length(p * vec2(0.8, 1.2))));
  vec2 q = p - vec2(0.0, -0.12);
  float width = mix(0.16, 0.22, (q.y + 0.2) / 0.4);
  float bucket = step(abs(q.x), width) * step(-0.2, q.y) * step(q.y, 0.2);
  float stripe = step(0.5, fract((q.x / width) * 2.5 + 0.25));
  col = mix(col, mix(vec3(1.0, 0.95, 0.85), vec3(0.85, 0.1, 0.14), stripe), bucket);
  float puffs = 0.0;
  for (int i = 0; i < 7; i++) {
    float a = float(i) / 6.0;
    puffs = max(puffs, circle(p, vec2(-0.2 + a * 0.4, 0.13 + sin(a * 9.0) * 0.04 + 0.01 * sin(uTime * 3.0 + a * 6.0)), 0.075));
  }
  col = mix(col, vec3(1.0, 0.97, 0.86), puffs);
  vec2 edge = abs(p) - vec2(0.94, 0.42);
  float rim = smoothstep(0.03, 0.0, abs(max(edge.x, edge.y)));
  float bulbs = step(0.55, fract((p.x + p.y) * 9.0 - uTime * 2.0));
  return col + vec3(1.6, 1.25, 0.6) * rim * bulbs;
}

// Seven-segment digits for the countdown.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return smoothstep(0.016, 0.009, length(pa - ba * h));
}
float digit(vec2 p, float n) {
  // Segments a to g, lit per digit 1, 2 and 3.
  float a = n > 1.5 ? 1.0 : 0.0;
  float b = 1.0;
  float c = n < 1.5 || n > 2.5 ? 1.0 : 0.0;
  float d = n > 1.5 ? 1.0 : 0.0;
  float e = n > 1.5 && n < 2.5 ? 1.0 : 0.0;
  float g = n > 1.5 ? 1.0 : 0.0;
  float s = 0.0;
  s = max(s, a * segment(p, vec2(-0.06, 0.12), vec2(0.06, 0.12)));
  s = max(s, b * segment(p, vec2(0.07, 0.11), vec2(0.07, 0.01)));
  s = max(s, c * segment(p, vec2(0.07, -0.01), vec2(0.07, -0.11)));
  s = max(s, d * segment(p, vec2(-0.06, -0.12), vec2(0.06, -0.12)));
  s = max(s, e * segment(p, vec2(-0.07, -0.01), vec2(-0.07, -0.11)));
  s = max(s, g * segment(p, vec2(-0.06, 0.0), vec2(0.06, 0.0)));
  return s;
}

vec3 leader(vec2 p) {
  float t = uTime * 0.9;
  float sweep = fract(t);
  float a = fract(atan(p.x, p.y) / 6.2831853 + 0.5);
  float r = length(p);
  vec3 col = vec3(0.62, 0.6, 0.56) * mix(0.82, 1.0, step(a, sweep)) * smoothstep(1.4, 0.2, r);
  col *= 1.0 - 0.5 * (smoothstep(0.012, 0.0, abs(r - 0.3)) + smoothstep(0.012, 0.0, abs(r - 0.36)));
  col *= 1.0 - 0.4 * (smoothstep(0.006, 0.0, abs(p.x)) + smoothstep(0.006, 0.0, abs(p.y)));
  col = mix(col, vec3(0.08), digit(p * 0.5, 3.0 - mod(floor(t), 3.0)));
  return col;
}

vec3 feature(vec2 p) {
  vec3 sky = mix(vec3(0.16, 0.2, 0.62), vec3(0.9, 0.42, 0.55), smoothstep(0.1, -0.5, p.y));
  float wobble = sin(uTime * 41.0) * 0.004 * (0.5 + 0.5 * sin(uTime * 0.9));
  vec2 c = vec2(0.34 + wobble, 0.13 + wobble * 0.6);
  float moon = circle(p, c, 0.2);
  float crater = circle(p, c + vec2(0.06, 0.07), 0.05) + circle(p, c + vec2(-0.08, -0.03), 0.035);
  vec3 col = mix(sky, vec3(1.1, 1.0, 0.76) * (1.0 - crater * 0.14), moon);
  float ground = smoothstep(-0.24, -0.26, p.y + 0.03 * sin(p.x * 9.0 + 1.0) + 0.02 * sin(p.x * 21.0));
  col = mix(col, vec3(0.08, 0.05, 0.2), ground);
  // Kernels hop along the ground and burst into white puffs, one after another.
  for (int i = 0; i < 5; i++) {
    float f = float(i);
    float life = fract(uTime * 0.42 + f * 0.23);
    float x = -0.8 + fract(f * 0.37 + 0.11) * 1.4;
    float y = -0.22 + abs(sin(life * 9.42)) * 0.12 * (1.0 - life);
    float size = life < 0.7 ? 0.018 : mix(0.02, 0.07, smoothstep(0.7, 0.78, life));
    vec3 tone = life < 0.7 ? vec3(1.0, 0.65, 0.15) : vec3(1.05, 1.0, 0.88);
    col = mix(col, tone, circle(p, vec2(x, y), size) * (1.0 - smoothstep(0.92, 1.0, life)));
  }
  return col;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(2.05, 1.0);
  float flicker = 0.92 + 0.08 * sin(uTime * 37.0) * sin(uTime * 13.0);
  vec3 col;
  if (uShow < 1.0) col = mix(intermission(p), leader(p), uShow);
  else col = mix(leader(p), feature(p), uShow - 1.0);
  // The change of reel flashes white for a moment.
  col += vec3(0.8) * (1.0 - abs(fract(uShow) - 0.5) * 2.0) * step(0.001, fract(uShow));
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
  kit.add(P.box(150, 1, 130, 0.05, 1), { color: C.floor, gloss: 0.08, pattern: Pattern.Fabric + 0.2, outline: 0, matrix: at(0, GROUND - 0.5, 20) });
  kit.add(P.box(14, 0.08, 90, 0.03, 1), { color: C.aisle, gloss: 0.1, outline: 0, matrix: at(0, GROUND + 0.05, 58) });
  // Back wall with pilasters and side walls in paneled velvet.
  kit.add(P.box(130, 60, 1, 0.05, 1), { color: C.wall, gloss: 0.08, pattern: Pattern.Fabric + 0.15, outline: 0, matrix: at(0, 19, -46) });
  for (const side of [-1, 1]) {
    kit.add(P.box(1, 60, 130, 0.05, 1), { color: C.wall, gloss: 0.08, pattern: Pattern.Fabric + 0.15, outline: 0, matrix: at(side * 63, 19, 18) });
    for (let i = 0; i < 6; i += 1) {
      const z = -30 + i * 20;
      kit.add(P.box(1.2, 44, 2.4, 0.3, 2), { color: C.wallLight, gloss: 0.2, matrix: at(side * 62, 12, z) });
      // Art-deco wall sconces that glow against the velvet: the house lights.
      kit.add(P.lathe([[0, 0], [1.7, 0], [1.05, 2.2], [0, 2.4]], 16, 0.1, 2), { color: '#ffe3a0', emissive: 0.85, outline: 0, light: lightGroup(2, LIT.house), matrix: at(side * 60.8, 8, z + 10) });
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
  kit.add(P.torus(STAGE_R, 0.3, 8, 90), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(STAGE_R, STAGE_R - 0.1, 0.1, 90, 0.04), {
    color: '#5a2a30',
    gloss: 0.7,
    coat: 0.5,
    pattern: Pattern.Wood + 0.1,
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

/** A gold curtain cord with a tassel, hanging from its top at the origin. */
function cordGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const gold = { color: '#e8b44a', gloss: 0.7, metal: 0.6, pattern: Pattern.Fabric };
  kit.add(P.capsule(0.2, CORD_LENGTH, 3, 8), { ...gold, matrix: at(0, -CORD_LENGTH / 2, 0) });
  kit.add(P.sphere(0.55, 12, 9), { ...gold, matrix: at(0, -CORD_LENGTH - 0.3, 0) });
  kit.add(P.lathe([[0, 0], [0.55, 0], [0.95, -2.2], [0, -2.3]], 14, 0.08, 2), { ...gold, color: '#d99a2e', matrix: at(0, -CORD_LENGTH - 0.6, 0) });
  return kit.build();
}

function addProscenium(kit: Kit): void {
  kit.add(P.box(92, 5, 3, 0.8, 3), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3, matrix: at(0, 39, -41) });
  for (const side of [-1, 1]) {
    kit.add(P.box(4.4, 54, 3, 0.8, 3), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3, matrix: at(side * 45, 12.5, -41) });
    // Heavy folded curtains, gathered to each side.
    for (let i = 0; i < 9; i += 1) {
      const x = side * (43 - i * 1.9);
      kit.add(P.capsule(1.25, 38, 3, 10), {
        color: i % 2 ? C.curtain : C.curtainDeep,
        gloss: 0.22,
        pattern: Pattern.Fabric,
        sheen: 0.85,
        outline: i === 8 ? 1 : 0.35,
        matrix: at(x, 16 + i * 0.25, -39.5 + (i % 2) * 0.7, [0, 0, side * i * 0.008]),
        ao: (p) => 0.55 + 0.45 * smooth(GROUND, 8, p.y),
      });
    }
  }
  for (let i = -11; i <= 11; i += 1) {
    kit.add(P.sphere(2.3, 12, 9), { color: i & 1 ? C.curtain : C.curtainDeep, gloss: 0.22, pattern: Pattern.Fabric, sheen: 0.85, outline: 0.5, matrix: at(i * 3.65, 35.5, -39.3, [0, 0, 0], [1, 1.15, 0.6]) });
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
  kit.add(P.box(22, 0.5, 13.5, 0.14, 2), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3, matrix: at(-40.8, GROUND + 5.45, -4.4) });
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
  kit.add(P.box(3, 0.7, 2.6, 0.3, 2), { color: '#ffffff', gloss: 0.2, pattern: Pattern.Fabric, sheen: 0.7, matrix: at(0, 1.9, 0) });
  kit.add(P.box(3, 3, 0.6, 0.28, 2), { color: '#ffffff', gloss: 0.2, pattern: Pattern.Fabric, sheen: 0.7, matrix: at(0, 3.5, 1.2, [0.14, 0, 0]) });
  for (const side of [-1, 1]) {
    kit.add(P.box(0.32, 1.9, 2.4, 0.12, 1), { color: '#2d1520', gloss: 0.5, matrix: at(side * 1.65, 1, 0.1) });
    // Armrests capped in polished wood.
    kit.add(P.box(0.46, 0.14, 2.3, 0.07, 2), { ...{ color: '#6d3f24', gloss: 0.6, pattern: Pattern.Wood }, fixedColor: true, matrix: at(side * 1.65, 2.02, 0.1) });
  }
  kit.add(P.box(3.12, 3.1, 0.26, 0.14, 2), { color: '#3a1420', gloss: 0.55, coat: 0.2, fixedColor: true, matrix: at(0, 3.5, 1.58, [0.14, 0, 0]) });
  kit.add(P.box(0.56, 0.26, 0.05, 0.03, 1), { color: '#e4b252', gloss: 0.84, metal: 1, smudge: 0.4, outline: 0, fixedColor: true, detail: 1, matrix: at(0, 4.55, 1.85, [0.14, 0, 0]) });
  return kit.build();
}

/** What each audience member can be made of; every copy shows a few of these. */
const CROWD = { body: 0, skin: [1, 2, 3], hair: [4, 5, 6, 7], bucket: 8 } as const;
const CROWD_SKINS = ['#f6c9a4', '#c98d62', '#8a5a3c'];

/**
 * A seated toy filmgoer seen from behind its seat: shoulders and arms in a shirt that takes the
 * copy's color, a head in one of three skin tones, and hair, a bun or a cap. Some hold a bucket up.
 * Every part is in the same seat-relative space as the old head-and-body piece.
 */
function crowdParts(): RigPart[] {
  // Seated, their shadows would only fall on the seat in front: not worth a pass.
  const part = (build: (kit: Kit) => void, shadow = false): RigPart => {
    const kit = new Kit();
    build(kit);
    return { geometry: kit.build(), shadow };
  };
  const shirt = { color: '#ffffff', gloss: 0.45, coat: 0.2, soft: 0.4 };
  const body = part((kit) => {
    // Torso: round-shouldered, narrowing to the seat.
    kit.add(P.lathe([[0, 0], [0.95, 0], [1.1, 0.5], [1.08, 1.3], [0.92, 1.7], [0.5, 1.92], [0.3, 1.95], [0, 1.95]], 12, 0.12, 1), { ...shirt, matrix: at(0, 3.25, 0.8) });
    kit.add(P.torus(0.33, 0.07, 4, 12), { color: '#f4efe6', gloss: 0.4, soft: 0.4, fixedColor: true, matrix: at(0, 5.18, 0.8, [Math.PI / 2, 0, 0]) });
    // Arms resting on the armrests.
    for (const side of [-1, 1]) {
      kit.add(P.capsule(0.3, 1.1, 2, 6), { ...shirt, matrix: at(side * 1.18, 4.25, 0.75, [0, 0, side * 0.18]) });
      kit.add(P.capsule(0.27, 0.9, 2, 6), { ...shirt, matrix: at(side * 1.34, 3.45, 0.35, [1.2, 0, 0]) });
    }
  });
  const head = (skin: string): RigPart =>
    part((kit) => {
      const paint = { color: skin, gloss: 0.32, soft: 0.9, fixedColor: true };
      kit.add(P.capsule(0.3, 0.3, 2, 6), { ...paint, matrix: at(0, 5.3, 0.78) });
      kit.add(P.sphere(0.92, 12, 9), { ...paint, matrix: at(0, 6.1, 0.75) });
      for (const side of [-1, 1]) kit.add(P.sphere(0.2, 6, 4), { ...paint, matrix: at(side * 0.9, 6.05, 0.8, [0, 0, 0], [0.5, 1, 0.8]) });
    });
  const hair = (build: (kit: Kit) => void): RigPart => part(build);
  const hairPaint = (color: string) => ({ color, gloss: 0.42, soft: 0.3, fixedColor: true });
  return [
    body,
    ...CROWD_SKINS.map(head),
    // Short and dark: a cap of hair over the back and crown.
    hair((kit) => kit.add(P.sphere(0.97, 12, 7), { ...hairPaint('#2e2220'), matrix: at(0, 6.22, 0.82, [0.25, 0, 0], [1, 0.92, 1]) })),
    // A brown bob down to the collar.
    hair((kit) => {
      kit.add(P.sphere(1.0, 12, 7), { ...hairPaint('#6b4128'), matrix: at(0, 6.15, 0.85, [0, 0, 0], [1.04, 1, 1]) });
      kit.add(P.capsule(0.9, 0.5, 2, 10), { ...hairPaint('#6b4128'), matrix: at(0, 5.6, 0.98, [0, 0, 0], [1.05, 1, 0.8]) });
    }),
    // Blonde, gathered in a bun.
    hair((kit) => {
      kit.add(P.sphere(0.97, 12, 7), { ...hairPaint('#e0b25e'), matrix: at(0, 6.18, 0.82, [0.1, 0, 0], [1, 0.95, 1]) });
      kit.add(P.sphere(0.42, 8, 6), { ...hairPaint('#e0b25e'), matrix: at(0, 6.75, 1.45) });
    }),
    // A red cap, worn forwards.
    hair((kit) => {
      kit.add(P.sphere(0.97, 12, 6), { color: '#d62f38', gloss: 0.3, pattern: Pattern.Fabric, fixedColor: true, matrix: at(0, 6.3, 0.75, [0, 0, 0], [1, 0.85, 1]) });
      kit.add(P.box(1.0, 0.08, 0.8, 0.04, 1), { color: '#b0222c', gloss: 0.3, fixedColor: true, matrix: at(0, 6.35, -0.25, [-0.15, 0, 0]) });
      kit.add(P.sphere(0.09, 6, 4), { color: '#b0222c', gloss: 0.3, fixedColor: true, matrix: at(0, 7.12, 0.75) });
    }),
    // A striped bucket held up beside the head, heaped with popcorn.
    part((kit) => {
      // One lathe, striped by angle: eight separate boards cost many times the triangles.
      kit.add(P.lathe([[0, 0], [0.34, 0], [0.46, 1.0], [0.43, 1.0], [0, 0.12]], 16, 0.02, 1), {
        color: '#fff3df',
        gloss: 0.4,
        fixedColor: true,
        matrix: at(1.4, 4.9, 0.2),
        colorFn: (p, _n, out) => {
          if (Math.cos(Math.atan2(p.z - 0.2, p.x - 1.4) * 4) > 0) out.set('#d62f38');
        },
      });
      for (const [x, y, z, r] of [[1.32, 5.98, 0.16, 0.2], [1.52, 5.96, 0.28, 0.18], [1.4, 6.12, 0.3, 0.16], [1.48, 5.95, 0.04, 0.17]] as const) {
        kit.add(P.sphere(r, 7, 5), { ...M.popcorn, matrix: at(x, y, z, [x * 3, y, z * 5], [1, 0.85, 1]) });
      }
    }),
  ];
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
    kit.add(geometry, { color: s % 2 ? C.cream : C.red, gloss: 0.72, coat: 0.3, outline: 0, ao: (p) => 0.6 + 0.4 * smooth(0, 1.6, p.y) });
  }
  kit.add(P.lathe([[0, 0.02], [2.72, 0.02], [o - 0.08, r - 0.04], [o - 0.15, r - 0.04]], 72, 0.02, 1), { color: C.red, gloss: 0.4 });
  kit.add(P.lathe([[o - 0.03, r - 0.1], [o + 0.12, r], [o + 0.03, r + 0.12], [i + 0.02, r + 0.1], [i - 0.03, r - 0.05]], 72, 0.04), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3 });
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
    for (const rail of [-1, 1]) kit.add(P.box(0.16, 0.34, length, 0.06, 1), { color: C.gold, gloss: 0.8, metal: 1, wear: 0.3, matrix: at(cx + rail * 1.5, y + 0.08, z, [pitch, 0, 0]) });
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

/** Cinema light groups: the house lights, the exit signs, and three sets of twinkling stars. */
const LIT = { house: 0, exit: 1, starsA: 2, starsB: 3, starsC: 4 } as const;
const STAR_GROUPS = [LIT.starsA, LIT.starsB, LIT.starsC];
/** The reels the projector runs as the night goes on: intermission, countdown, feature. */
const REELS = [0.3, 0.62];

/** Exit signs and a stack of film cans: the details of a working picture house. */
function addHouseDetails(kit: Kit): void {
  for (const side of [-1, 1]) {
    for (const z of [26, 66]) {
      const sign = at(side * 62.2, 7, z, [0, -side * Math.PI / 2, 0]);
      const on = (dx: number, dy: number, dz: number, rz = 0): THREE.Matrix4 => sign.clone().multiply(at(dx, dy, dz, [0, 0, rz]));
      kit.add(P.box(3.6, 1.5, 0.5, 0.15, 2), { color: '#2a2a32', gloss: 0.6, matrix: sign });
      kit.add(P.box(3.2, 1.1, 0.2, 0.08, 1), { color: '#3fe07a', emissive: 0.9, outline: 0, light: lightGroup(2, LIT.exit), matrix: on(0, 0, 0.2) });
      // A white arrow pointing the way out.
      const white = { color: '#ffffff', emissive: 0.9, outline: 0, light: lightGroup(2, LIT.exit) };
      kit.add(P.box(1.5, 0.16, 0.06, 0.04, 1), { ...white, matrix: on(-0.1, 0, 0.32) });
      for (const turn of [0.75, -0.75]) kit.add(P.box(0.6, 0.16, 0.06, 0.04, 1), { ...white, matrix: on(0.48, -Math.sign(turn) * 0.18, 0.32, turn) });
    }
  }
  // Film cans stacked by the stage, waiting for the next show.
  for (let i = 0; i < 4; i += 1) {
    kit.add(P.puck(1.5, 1.5, 0.32, 28, 0.08), { color: i % 2 ? '#8c96a4' : '#a8b2c0', gloss: 0.75, metal: 0.9, pattern: Pattern.Brushed, matrix: at(-18.5 + i * 0.12, GROUND + i * 0.34, 18.5, [0, i * 0.7, 0]) });
  }
  kit.add(P.puck(1.55, 1.55, 0.06, 28, 0.02), { color: '#d8313a', gloss: 0.3, pattern: Pattern.Paper, outline: 0.4, matrix: at(-18.14, GROUND + 1.36, 18.5) });
}

function carpetGeometry(): THREE.BufferGeometry {
  // A red carpet up the aisle to the stage, roped off with brass posts and velvet.
  const kit = new Kit();
  const from = STAGE_R + 0.6;
  const to = 64;
  const length = to - from;
  kit.add(P.box(7.6, 0.06, length, 0.02, 1), { color: '#c4142a', gloss: 0.12, pattern: Pattern.Fabric + 0.3, sheen: 0.55, outline: 0, fixedColor: true, matrix: at(0, 0.03, from + length / 2) });
  for (const x of [-3.9, 3.9]) kit.add(P.box(0.24, 0.08, length, 0.03, 1), { color: '#f0b73a', gloss: 0.85, metal: 1, outline: 0, fixedColor: true, matrix: at(x, 0.04, from + length / 2) });
  const posts = 8;
  for (const x of [-4.6, 4.6]) {
    let previous: THREE.Vector3 | null = null;
    for (let i = 0; i < posts; i += 1) {
      const z = from + 1.2 + (i * (length - 2.4)) / (posts - 1);
      kit.add(P.puck(0.5, 0.42, 0.16, 18, 0.05), { color: '#f0b73a', gloss: 0.9, metal: 1, wear: 0.2, fixedColor: true, matrix: at(x, 0, z) });
      kit.add(P.puck(0.1, 0.1, 2.7, 10, 0.03), { color: '#f0b73a', gloss: 0.9, metal: 1, wear: 0.2, fixedColor: true, matrix: at(x, 0.1, z) });
      kit.add(P.sphere(0.24, 12, 8), { color: '#f0b73a', gloss: 0.9, metal: 1, fixedColor: true, matrix: at(x, 2.95, z) });
      const top = new THREE.Vector3(x, 2.68, z);
      if (previous) kit.add(P.tube([previous, new THREE.Vector3(x, 2.05, (previous.z + z) / 2), top], 0.13, 14, 8), { color: '#7a0c1e', gloss: 0.3, pattern: Pattern.Fabric + 0.5, sheen: 0.9, fixedColor: true });
      previous = top;
    }
  }
  return kit.build();
}

/**
 * A starry sky of fairy lights: strings of stars hung in front of both curtains, from under the
 * pelmet down toward the stage. Every third star belongs to `group`, so three sets twinkle out of step.
 */
/**
 * One star of the light strings at unit size: a bead and five rays. Made once and placed at every
 * size, because building hundreds of rounded rays one by one held up a frame for tens of ms.
 */
let starShape: THREE.BufferGeometry | null = null;
function unitStar(): THREE.BufferGeometry {
  if (starShape) return starShape;
  const kit = new Kit();
  kit.add(P.sphere(0.7, 6, 4), { color: '#ffffff' });
  for (let ray = 0; ray < 5; ray += 1) {
    const a = (ray / 5) * Math.PI * 2;
    kit.add(P.box(0.3, 1.5, 0.2, 0.12, 1), { color: '#ffffff', matrix: at(Math.sin(a) * 0.75, Math.cos(a) * 0.75, 0, [0, 0, -a]) });
  }
  starShape = kit.build();
  return starShape;
}

/** One side's strings of one light group: small enough to build within a step. */
function starsGeometry(group: number, side: number): THREE.BufferGeometry {
  const kit = new Kit();
  const shape = unitStar();
  const star = { color: '#fff3c8', emissive: 1, outline: 0, fixedColor: true, light: lightGroup(2, STAR_GROUPS[group]!) };
  const wire = { color: '#3a2a20', gloss: 0.4, outline: 0, fixedColor: true };
  for (let string = 0; string < 7; string += 1) {
    const x = side * (27.5 + string * 2.3);
    const top = 35.5;
    const bottom = 9 + ((string * 7) % 5) * 2.2;
    if (group === 0) kit.add(P.tube([new THREE.Vector3(x, top, -36.6), new THREE.Vector3(x, bottom, -36.6)], 0.05, 1, 4), wire);
    const count = Math.round((top - bottom) / 2.6);
    for (let i = 0; i < count; i += 1) {
      if ((i + string) % 3 !== group) continue;
      const y = top - 1.2 - i * ((top - bottom - 1.2) / (count - 1));
      const size = 0.42 + ((i * 13 + string * 7) % 5) * 0.06;
      kit.add(shape, { ...star, matrix: at(x, y, -36.4, [0, 0, (i + string) * 0.6], size) });
    }
  }
  return kit.build();
}

function usherTorch(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.capsule(0.05, 0.2, 3, 8), { color: '#2b2230', gloss: 0.6, fixedColor: true, matrix: at(0, -0.02, 0.06, [Math.PI / 2, 0, 0]) });
  kit.add(P.sphere(0.055, 8, 6), { color: '#fff4c8', emissive: 1, outline: 0, fixedColor: true, light: lightGroup(2, LIT.exit), matrix: at(0, -0.02, 0.2) });
  return kit.build();
}

const steam = new THREE.Color(0.92, 0.9, 0.88);
const beamColor = new THREE.Color(0.9, 0.85, 0.65);
const color = new THREE.Color();

function* buildCinema(stage: Stage, root: THREE.Group): SceneBuild {
  const set = new Kit();
  addHall(set);
  yield;
  addStage(set);
  yield;
  addProscenium(set);
  yield;
  addSnackBar(set);
  yield;
  dressCinema(set, GROUND, STAGE_R);
  addHouseDetails(set);
  yield;
  addToy(stage, root, set.build({ frozen: true }));
  yield;
  addSign(root, SIGN_TEXT.popcorn, { background: '#ffc63f', color: '#8f1f26', border: '#8f1f26', glow: 0.4 }, 9, 2.4, at(-40.8, GROUND + 2.9, 2.08));
  // The projector's beam, drifting through the dark over the audience; it shows more as the lights go down.
  const projector = (addLightBeam(root, new THREE.Vector3(0, 35, 74), new THREE.Vector3(0, 16, -44), 1.2, 34, '#cdd8ff', 0.035).material as THREE.ShaderMaterial).uniforms;
  const bucket = addToy(stage, root, bucketGeometry());
  yield;

  const screenUniforms = { uTime: globals.uTime, uTear: { value: 0 }, uShow: { value: 0 } };
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
  // The audience: one part rig, every member built from a body, a head and maybe hair and a bucket.
  const crowd = new PartRig(stage, root, crowdParts(), 176);
  const looks: number[][] = [];
  const shirts = ['#3f6fd8', '#d64545', '#3ea36b', '#e0a23a', '#8b5cc7', '#2a8f9c', '#f0e6d6', '#555a6e'];
  const shirtColor = new THREE.Color();
  const seatColor = new THREE.Color(C.seat);
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
      const hair = (index * 5 + row * 3) % 5;
      looks.push([CROWD.body, CROWD.skin[(index * 7 + row) % 3]!, ...(hair < 4 ? [CROWD.hair[hair]!] : []), ...((index * 13 + row) % 10 < 3 ? [CROWD.bucket] : [])]);
      crowd.setColor(index, shirtColor.set(shirts[(index * 3 + row) % shirts.length]!));
      for (let part = 0; part < crowd.partCount; part += 1) crowd.setMatrix(index, part, RIG_HIDDEN);
      audience.push({ x, z: z - curve, ry: -x * 0.008, phase: index * 1.37, flung: 0, vx: 0, vy: 0 });
    }
  }
  seats.ink.instanceColor = seats.body.instanceColor;
  seats.commit(audience.length);
  const fanSeat = audience[FAN]!;

  // The cart-to-cinema supply line, built by the "影院专线" upgrade.
  const belt = addToy(stage, root, beltGeometry());
  belt.visible = false;
  const beltLoads = addToyInstances(stage, root, beltLoadGeometry(), BELT_LOADS, false);
  let beltOn = false;
  yield;

  // The usher and the bought decorations share one rig.
  const pieces = new SetPieces(root);
  const usher = toyFigure(pieces, root, { skin: '#f2c8a0', shirt: '#a3172b', pants: '#1f1a2e', hair: '#3a2418', hat: 'pillbox', hatColor: '#a3172b' });
  usher.root.scale.setScalar(5.2);
  pieces.part(usherTorch(), pieces.group(usher.armR, 0, -0.27, 0));
  // Each of these takes a while to build, so the frame can be drawn in between.
  yield;
  const carpet = pieces.group(root, 0, GROUND + 0.13, 0);
  pieces.part(carpetGeometry(), carpet);
  pieces.decoration('decor-carpet', carpet, 6);
  yield;
  const stars = pieces.group(root);
  // One side of one string of lights a step: all of them in one went over 35 ms of a frame.
  for (let group = 0; group < STAR_GROUPS.length; group += 1) {
    for (const side of [-1, 1]) {
      pieces.part(starsGeometry(group, side), stars, { shadow: false });
      yield;
    }
  }
  pieces.decoration('decor-stars', stars, 0.01);
  // A hidden thing to find (src/content/props.ts): the curtain cord.
  const cord = pieces.group(root, CORD_AT.x, CORD_AT.y, CORD_AT.z);
  pieces.part(cordGeometry(), cord);
  yield;
  yield* pieces.build(stage);

  const bank = new LightBank(2, [{ at: 0 }, { at: 0 }, { style: 'bulb' }, { style: 'bulb' }, { style: 'bulb' }]);
  const screenLight = new THREE.Color('#8d9dff');
  const lamps: Lamp[] = [
    ...[0.5, 1.55, 2.6, 3.65, 4.7, 5.75].map((a) => ({
      position: [Math.cos(a) * (STAGE_R - 0.75), 0.9, Math.sin(a) * (STAGE_R - 0.75)] as [number, number, number],
      color: '#ffc774',
      intensity: 0.75,
      radius: 9,
    })),
    { position: [0, 20, -34], color: screenLight, intensity: 0.9, radius: 52 },
    { position: [-56, 10, 10], color: '#ffcf8f', intensity: 0, radius: 44 },
    { position: [56, 10, 10], color: '#ffcf8f', intensity: 0, radius: 44 },
  ];
  let show = 0;
  let story = 0;

  const tell = (u: number, dt: number, instant: boolean, calm: boolean): void => {
    story = u;
    // The house lights go down as the programme gets going.
    const [toMid, toLate] = storyWeights(u);
    const house = lerp(lerp(1, 0.4, toMid), 0.1, toLate);
    bank.dim(LIT.house, house);
    bank.update(u, dt, instant, calm);
    lamps[7]!.intensity = 0.85 * house;
    lamps[8]!.intensity = 0.85 * house;
    projector.uStrength!.value = lerp(lerp(0.018, 0.034, toMid), 0.052, toLate) * beamFlicker;
    // The projectionist changes reels with a quick flash; reduced motion just cuts.
    const reel = u >= REELS[1]! ? 2 : u >= REELS[0]! ? 1 : 0;
    show = instant || calm ? reel : show + Math.sign(reel - show) * Math.min(Math.abs(reel - show), dt * 1.6);
    screenUniforms.uShow.value = show;
  };

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

  // Hidden things to find: the projector's beam, a fan in the front row, the curtain cord.
  const cues = new Cues();
  const rewind = new Pulse(0.9);
  const fanStand = new Pulse(2.4);
  const cordTug = new Spring(0, 90, 7);
  let beamFlicker = 1;
  const beamSpot = new THREE.Vector3(0, 28.4, 32.7);
  const fanSpot = new THREE.Vector3(fanSeat.x, GROUND + 1.6, fanSeat.z);
  const cordSpot = new THREE.Vector3(CORD_AT.x, CORD_AT.y - CORD_LENGTH - 1, CORD_AT.z + 0.5);
  const eggs: EggSpot[] = [
    {
      id: 'egg-projector',
      position: beamSpot,
      radius: 3.5,
      active: () => !blasted && !rewind.busy,
      play(ctx) {
        // The film stutters into rewind, and popcorn flies off the screen back into the bucket.
        rewind.start();
        cues.after(0.5, () => {
          for (let i = 0; i < 12; i += 1) {
            cues.after(i * 0.05, () => ctx.director.launch(ctx.rng.range(-18, 18), ctx.rng.range(8, 24), -40, { flight: ctx.rng.range(1.1, 1.5), scale: 0.5, quiet: i > 2 }));
          }
        });
      },
    },
    {
      id: 'egg-audience',
      position: fanSpot,
      radius: 2.6,
      active: () => !blasted && !fanStand.busy,
      play(ctx) {
        // Up on his feet, clapping, and the bucket in his hands goes everywhere.
        fanStand.start();
        cues.after(0.35, () => {
          for (let i = 0; i < 6; i += 1) ctx.director.launch(fanSpot.x + ctx.rng.range(-0.6, 0.6), fanSpot.y + 2.6, fanSpot.z, { flight: ctx.rng.range(0.5, 0.8), scale: 0.45, quiet: i > 1 });
        });
      },
    },
    {
      id: 'egg-curtain',
      position: cordSpot,
      radius: 2.6,
      active: () => !blasted,
      play(ctx) {
        // One tug, and it turns out the stage is full of popcorn behind the curtain too.
        cordTug.kick(-14);
        cues.after(0.25, () => {
          for (let i = 0; i < 16; i += 1) {
            cues.after(i * 0.03, () => ctx.director.launch(ctx.rng.range(-22, 22), ctx.rng.range(2, 22), -37, { flight: ctx.rng.range(0.9, 1.4), scale: ctx.rng.range(0.45, 0.6), quiet: i > 3 }));
          }
        });
      },
    },
  ];

  return {
    eggs,
    lamps,
    progress: tell,
    kick(strength) {
      bucketKick.kick(-0.16 - 0.14 * strength);
    },
    upgradesChanged(owned, animate) {
      // The carts feed the cinema machines once the cinema's chain is bought.
      beltOn = owned.includes('line-chain-2');
      belt.visible = beltOn;
      if (!beltOn) beltLoads.commit(0);
      pieces.sync(owned, animate);
      for (const group of STAR_GROUPS) bank.want(group, pieces.owns('decor-stars'));
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
      tell(1, 0, true, true);
      screenUniforms.uTear.value = 2;
      usher.root.visible = false;
      crowd.commit(0);
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
      cues.update(dt);
      const stand = fanStand.update(dt);
      const flicker = rewind.update(dt);
      beamFlicker = flicker > 0 ? 0.25 + 1.6 * Math.abs(Math.sin(time * 61)) * flicker : 1;
      cord.position.y = CORD_AT.y + cordTug.update(dt);
      cord.rotation.z = Math.sin(time * 0.8) * 0.01 + cordTug.velocity * 0.004;
      audience.forEach((person, index) => {
        const chew = Math.max(0, Math.sin(time * 2.4 + person.phase)) * 0.14;
        // Everyone leans toward the snacks, not the film, until the feature has them on their
        // feet, front rows first, cheering and bouncing.
        const row = Math.floor(index / 22);
        const up = blasted ? 0 : smooth(0.74 + row * 0.018, 0.8 + row * 0.018, story);
        const cheer = up * Math.max(0, Math.sin(time * 5.2 + person.phase)) * 0.45;
        p.set(person.x + Math.sin(time * 1.7 + person.phase) * up * 0.25, GROUND + row * 0.5 + chew * 0.5 * (1 - up) + up * 1.7 + cheer, person.z);
        let spin = 0;
        if (person.flung > 0) {
          const t = person.flung;
          p.x += person.vx * t;
          p.z += 16 * t;
          p.y += person.vy * t - 18 * t * t;
          spin = t * 6;
        }
        let clap = 0;
        if (index === FAN && stand > 0) {
          // Standing up for the film: hops on the spot and sways, clapping.
          p.y += stand * 2.4 + Math.abs(Math.sin(time * 12)) * 0.5 * stand;
          clap = Math.sin(time * 18) * 0.12 * stand;
        }
        e.set(-0.12 + chew * 0.5 + spin, person.ry + clap, spin * 0.6 + clap);
        q.setFromEuler(e);
        m.compose(p, q, s);
        for (const part of looks[index]!) crowd.setMatrix(index, part, m);
      });
      crowd.commit(blasted && audience[0]!.flung > 4 ? 0 : audience.length);
      updateUsher(ctx);
      pieces.update(dt, ctx);
      // The screen lights the room in the colors of whatever is showing.
      const flickerLight = 0.9 + 0.1 * Math.sin(time * 37) * Math.sin(time * 13);
      screenLight.set(show < 1 ? '#ffb08a' : '#d8d8e8').lerp(color.set(show < 1 ? '#d8d8e8' : '#8d9dff'), show < 1 ? show : show - 1);
      lamps[6]!.intensity = lerp(0.7, 0.95, show / 2) * flickerLight;

      steamTimer -= dt;
      if (steamTimer <= 0) {
        steamTimer = 0.22;
        const r = ctx.rng;
        const a = r.range(0, 6.28);
        const radius = r.range(0.4, 2.8);
        ctx.sprites.spawn({ x: Math.cos(a) * radius, y: BUCKET.rimY + (ctx.level > 0.5 ? 5 : 0), z: Math.sin(a) * radius, vx: r.range(-0.2, 0.2), vy: r.range(1.2, 2), vz: r.range(-0.2, 0.2), drag: 0.25, sizeStart: 0.55, sizeEnd: r.range(1.8, 2.6), life: r.range(1.7, 2.5), color: steam, alpha: 0.05, kind: SpriteKind.Puff, spin: r.range(-0.4, 0.4) });
      }
      STAR_GROUPS.forEach((group, i) => bank.dim(group, 0.45 + 0.55 * Math.abs(Math.sin(time * (0.9 + i * 0.37) + i * 2.1))));
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

  function updateUsher(ctx: SceneContext): void {
    // Up and down the aisle with a torch, turning at each end; once the feature starts the
    // usher stops at the front to watch it too.
    const watching = smooth(0.72, 0.8, story);
    const leg = time / USHER_WALK;
    const along = (1 - Math.cos((leg % 1) * Math.PI)) / 2;
    const forward = Math.floor(leg) % 2 === 0;
    const z = lerp(lerp(24, 60, forward ? along : 1 - along), 17.5, watching);
    const turnBack = Math.min(1, Math.min(leg % 1, 1 - (leg % 1)) * 8);
    const step = Math.abs(Math.sin(time * 4.4)) * (1 - watching) * turnBack;
    const floor = Math.max(GROUND + (pieces.owns('decor-carpet') ? 0.19 : 0), ctx.ground(0, z) - 0.1);
    usher.root.position.set(Math.sin(time * 0.37) * 0.8 * (1 - watching), floor + step * 0.12, z);
    usher.root.rotation.y = lerp(forward ? Math.PI : 0, Math.PI, watching);
    usher.head.rotation.y = Math.sin(time * 0.8) * 0.6 * (1 - watching);
    usher.armR.rotation.set(lerp(-1.25 + Math.sin(time * 1.3) * 0.15, -0.2, watching), 0, 0.1);
    usher.armL.rotation.set(Math.sin(time * 4.4) * 0.35 * (1 - watching), 0, -0.12);
  }
}

/** Seconds for the usher to walk the aisle one way. */
const USHER_WALK = 19;

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
    sky: '#c6a2d4',
    skyIntensity: 0.3,
    ground: '#c0504a',
    groundIntensity: 0.27,
    rim: '#ffcf9a',
    rimIntensity: 0.55,
    rimDir: [-0.6, 0.25, -0.75],
    fog: '#2a1018',
    fogRange: [110, 240],
    pool: [0, 0, 2, 27],
    poolFloor: 0.54,
  },
  // House lights up for the intermission, down for the countdown, out for the feature: the stage
  // keeps its spotlight and the screen lights the rest.
  story: {
    mid: {
      light: { sunDir: [0.3, 0.95, 0.42], sunColor: '#ffe9c8', sunIntensity: 1.42, shadeTint: '#55305f', sky: '#b89ad0', skyIntensity: 0.2, ground: '#b5404a', groundIntensity: 0.2, rim: '#ffcf9a', rimIntensity: 0.55, rimDir: [-0.6, 0.25, -0.75], fog: '#1c0a14', fogRange: [110, 240], pool: [0, 0, 2, 27], poolFloor: 0.36 },
      grade: { exposure: 1.02, contrast: 1.07, saturation: 1.05, vignette: 0.42, bloom: 0.72, shadowTint: '#fff2f4', highlightTint: '#fff8ee', aoTint: '#1c0814' },
    },
    late: {
      light: { sunDir: [0.28, 0.96, 0.4], sunColor: '#ffe6c8', sunIntensity: 1.38, shadeTint: '#4a2c66', sky: '#8d86d8', skyIntensity: 0.12, ground: '#9a3448', groundIntensity: 0.14, rim: '#9db0ff', rimIntensity: 0.68, rimDir: [-0.6, 0.25, -0.75], fog: '#12060e', fogRange: [110, 240], pool: [0, 0, 2, 25], poolFloor: 0.22 },
      grade: { exposure: 1.01, contrast: 1.09, saturation: 1.06, vignette: 0.5, bloom: 0.86, shadowTint: '#f6f0ff', highlightTint: '#fff6ec', aoTint: '#160612' },
    },
  },
  tiltShift: 0.55,
  grade: {
    exposure: 1.03,
    contrast: 1.06,
    saturation: 1.05,
    vignette: 0.36,
    bloom: 0.64,
    shadowTint: '#fff4f2',
    highlightTint: '#fffaf0',
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
  // Dust in the projector's beam, showing more as the house lights go down.
  ambience: [{ look: 'mote', center: [0, 26, 20], half: [6, 5, 35], rate: 12, story: [0.1, 0.4, 2, 3] }],
  // The picture throws its light back through the dusty air of the hall.
  shafts: { at: new THREE.Vector3(0, 16, -44.6), strength: 0.35, length: 0.55, threshold: 1.0 },
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
  debris: ['#d8313a', '#ffeccb', '#f0b73a'],
  homeRadius: BUCKET.innerR * 0.72,
  steamY: BUCKET.rimY,
  spreadRadius: 46,
  nest: { position: new THREE.Vector3(-25, 1.9, -24.5), scale: 0.2, rise: 0.85 },

  slots: {
    pan: [stageSlot(2.5, 11.5, 2.2), stageSlot(0.7, 11.5, 2.2), stageSlot(3.3, 11.8, 2.2), stageSlot(-0.1, 11.8, 2.2), stageSlot(2.0, 8.6, 2), stageSlot(1.15, 8.6, 2)],
    cart: [floorSlot(-24, 8, 0.6, 4), floorSlot(24, 8, -0.6, 4), floorSlot(-33, 14, 0.9, 4), floorSlot(33, 14, -0.9, 4)],
    truck: [floorSlot(-21, -7, 0.9, 2.3), floorSlot(21, -12, 2.3, 2.3), floorSlot(-40, 0, 0.5, 2.4), floorSlot(41, -2, 2.65, 2.4)],
    cinema: [floorSlot(-16, -26, 0.25, 3.6), floorSlot(16, -26, -0.25, 3.6), floorSlot(-28, -22, 0.4, 3.6), floorSlot(28, -22, -0.4, 3.6), floorSlot(-36, 2, 0.8, 3.8), floorSlot(38, 2, -0.8, 3.8), floorSlot(-6, -30, 0.1, 3.4), floorSlot(6, -30, -0.1, 3.4)],
    mixer: [stageSlot(0.25, 12.3, 2.3), stageSlot(2.9, 12.3, 2.3)],
    // Flanking the stage behind the bucket, facing the house, as in the old movie palaces.
    organ: [stageSlot(4.3, 10.6, 2.2, 4.3 + 0.18), stageSlot(5.12, 10.6, 2.2, 5.12 - 0.18)],
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

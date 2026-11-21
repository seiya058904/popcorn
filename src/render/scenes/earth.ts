import * as THREE from 'three';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, Spring } from '../../motion/ease.ts';
import type { Stage } from '../core/stage.ts';
import { PopcornSnow } from '../fx/snow.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { addLightBeam } from '../fx/beam.ts';
import { addToy, at, Kit, P, Pattern, smoothLatheSeam } from '../geometry/kit.ts';
import { globals, lightGroup } from '../core/globals.ts';
import { GLSL_LIGHT_PARS, GLSL_UTIL } from '../materials/glsl.ts';
import { POPCORN_SHADING, popcornUniforms } from '../materials/popcorn.ts';
import { toyMaterials } from '../materials/toy.ts';
import { PieceBatches } from '../popcorn/batches.ts';
import type { PileShape } from '../popcorn/pile.ts';
import { planetRingPath, planetUp } from './paths.ts';
import { Cues, gag, Pulse, Wobble, type EggSpot } from './eggs.ts';
import { NEON_PINK, neonPop, SetPieces, toyFigure } from './pieces.ts';
import { LightBank, storyWeights } from './story.ts';
import type { FinalePlan, SceneContext, SceneBuild, SceneSpec, UnitSlot } from './types.ts';

const R = 34;
const K = 3.5;
const CRATER = { floorY: 2.4, rimY: 5.2, innerR: 4.6, outerR: 5.5, skirtR: 13 };
const MOON_R = 12.5;
/**
 * Clear of the machines, the interface and the camera's climb out of the town: a satellite off the
 * planet's lower right limb, a cloud above its left side.
 */
const SATELLITE_AT = new THREE.Vector3(25, -11, 38);
const CLOUD_AT = new THREE.Vector3(-16, 9, 16);
const shutterColor = new THREE.Color(3, 3, 3);
const heatColor = new THREE.Color(2.6, 1.1, 0.35);
const rainColor = new THREE.Color('#fff1cf');
const MOON_HOME = new THREE.Vector3(-64, 40, -56);

const ORBITAL_SLOTS: UnitSlot[] = [
  { x: -41, y: -3, z: -6, rotation: 0.4, scale: 1.8 },
  { x: 40, y: 0, z: -8, rotation: -0.4, scale: 1.8 },
  { x: -40, y: -32, z: 4, rotation: 0.2, scale: 1.7 },
];

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
/**
 * How far the heap spreads over the planet. It stops where the globe still slopes gently: farther
 * out the grid can only bridge the steep curve, and the heap broke into square steps there.
 * Beyond it the popcorn is painted on the globe as drifts.
 */
const capRadius = (level: number): number => lerp(CRATER.outerR, 26, level ** 1.15);

/**
 * The drifts cover the globe above this height (on a unit globe). The line keeps a little ahead
 * of the heap, so the continents stay in sight for most of the stage, then rushes south in the
 * last stretch to bury the whole planet before the moon goes off.
 */
const snowLine = (level: number): number => {
  const cap = capRadius(level);
  return Math.sqrt(R * R - cap * cap) / R - 0.12 - 1.4 * smooth(0.72, 1, level);
};

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
uniform float uSnowLine, uSpin, uCities;
varying vec3 vWorld, vNormal, vDir;

float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec3 p) { return gnoise(p) * 0.55 + gnoise(p * 2.1 + 3.1) * 0.3 + gnoise(p * 4.3 + 7.7) * 0.15; }
// More octaves for coastlines and mountain ranges, which are seen up close.
float fbmFine(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += gnoise(p) * amp;
    p = p * 2.07 + vec3(1.7, 9.2, 4.4);
    amp *= 0.5;
  }
  return sum / 0.94;
}

// Screen-space bump from a height, as used for the drifts.
vec3 bumpBy(vec3 N, float h) {
  vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * N - grad);
}

void main() {
  float c = cos(uSpin), s = sin(uSpin);
  vec3 d = vec3(vDir.x * c - vDir.z * s, vDir.y, vDir.x * s + vDir.z * c);
  // Continents from warped noise, so coasts wander into bays and peninsulas instead of blobs.
  vec3 q = d * 2.4 + 11.0;
  vec3 warp = vec3(gnoise(q * 0.9 + 1.3), gnoise(q * 0.9 + 7.9), gnoise(q * 0.9 + 3.1)) - 0.5;
  float height = fbmFine(q + warp * 1.25) * 1.06 - 0.03;
  float land = smoothstep(0.5, 0.508, height);
  float inland = smoothstep(0.53, 0.62, height);
  float beach = smoothstep(0.5, 0.505, height) * (1.0 - smoothstep(0.505, 0.52, height));
  float peaks = smoothstep(0.61, 0.69, height + gnoise(d * 22.0) * 0.04);
  float lat = abs(d.y);

  // Deep blue water, turquoise over the shelves along every coast.
  vec3 ocean = mix(vec3(0.015, 0.09, 0.34), vec3(0.03, 0.3, 0.62), smoothstep(0.3, 0.47, height));
  ocean = mix(ocean, vec3(0.08, 0.62, 0.66), smoothstep(0.455, 0.5, height) * 0.8);
  // Land by climate: forest and meadow, a belt of dry country either side of the tropics.
  float dryness = smoothstep(0.12, 0.3, lat) * (1.0 - smoothstep(0.34, 0.48, lat));
  float desert = smoothstep(0.35, 0.65, dryness + (gnoise(d * 6.0 + 2.0) - 0.5) * 0.8) * inland;
  vec3 ground = mix(vec3(0.13, 0.42, 0.2), vec3(0.36, 0.6, 0.26), smoothstep(0.3, 0.7, gnoise(d * 9.0 + 4.0)));
  ground = mix(ground, vec3(0.8, 0.64, 0.36), desert);
  ground = mix(ground, vec3(0.48, 0.4, 0.38), peaks * 0.8);
  ground = mix(ground, vec3(0.95, 0.96, 1.0), smoothstep(0.69, 0.74, height) * 0.9);
  ground = mix(ground, vec3(0.96, 0.87, 0.64), beach);
  // Ice at the poles of the real planet, before the popcorn takes over.
  float ice = smoothstep(0.86, 0.92, lat + gnoise(d * 7.0) * 0.06);
  vec3 albedo = mix(mix(ocean, ground, land), vec3(0.92, 0.96, 1.0), ice);
  float gloss = mix(0.86, 0.1, max(land, ice));

  vec3 cloudP = d * 3.4 + vec3(uTime * 0.03, 0.0, uTime * 0.018);
  float cloudShape = fbm(cloudP) + gnoise(cloudP * 3.1) * 0.06 + gnoise(cloudP * 7.3) * 0.025;
  float cloud = smoothstep(0.54, 0.68, cloudShape);
  // Clouds throw a soft shadow onto the ground beneath them.
  float cloudShade = smoothstep(0.54, 0.66, fbm(cloudP + uSunDir * 0.12));
  albedo *= 1.0 - cloudShade * 0.32;
  albedo = mix(albedo, vec3(0.98), cloud * 0.85);
  gloss = mix(gloss, 0.08, cloud);

  vec3 N = normalize(vNormal);
  vec3 Ng = N;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // Relief on land: ranges catch the light on one side and fall into shade on the other.
  N = bumpBy(N, height * 0.55 * land * (1.0 - cloud) * (1.0 - ice));
  // Small moving waves break the sun's reflection on the sea into a glinting path.
  // Toward the rim the waves would be finer than a pixel and only sparkle, so they fade out; and
  // only open sea, not land, ice or cloud, has any to work out.
  float wet = smoothstep(0.15, 0.55, dot(Ng, V)) * (1.0 - land) * (1.0 - cloud) * (1.0 - ice);
  float waves = wet > 0.001 ? gnoise(d * 90.0 + vec3(uTime * 0.25, 0.0, uTime * 0.18)) + gnoise(d * 170.0 - vec3(0.0, uTime * 0.3, 0.0)) * 0.35 : 0.0;
  N = bumpBy(N, waves * 0.0035 * wet);
  float shadow = sunShadow(vWorld, N);
  vec3 col = toyLight(albedo, N, V, vWorld, gloss, 1.0, shadow);
  // Popcorn drifts advance from the pole, breaking up at their edge. They are lit exactly like
  // the heap, puffs and creases included, so heap and drift read as one material.
  float edge = fbm(vDir * 5.0) * 0.26;
  float snow = smoothstep(uSnowLine - 0.02, uSnowLine + 0.05, vDir.y + edge - 0.13);
  if (snow > 0.0) {
    // Seen from above the planet this projection stays even, so the drifts never smear into lines.
    vec2 flat_ = vDir.xz / (1.0 + abs(vDir.y));
    vec2 cell = worley(flat_ * 30.0);
    float puff = sat(1.0 - cell.x * 1.1);
    float gap = smoothstep(0.0, 0.34, cell.y - cell.x);
    float bump = (puff * 0.8 + sat(1.0 - worley(flat_ * 84.0 + 3.0).x) * 0.2) * 0.7;
    // Screen-space bump: the puffs catch the sun and drop into their creases.
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    vec3 r1 = cross(dpy, Ng), r2 = cross(Ng, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(bump) * r1 + dFdy(bump) * r2);
    vec3 Nd = normalize(abs(det) * Ng - grad);
    float crease = 0.55 + (1.0 - gap) * 0.25 + (1.0 - puff) * 0.25;
    vec3 drift = popcornShade(Nd, V, vWorld, sat(crease), 0.0, 1.0, 0.0, shadow, mix(0.08, 0.5, puff));
    // Thin cloud over the drifts: full white cloud read as holes torn in the popcorn.
    col = mix(col, drift, snow * (1.0 - cloud * 0.3));
  }
  // City lights come out on the night side as the planet turns: clusters on land, with a scatter
  // of smaller towns between them, all gone under the ice and the popcorn.
  if (uCities > 0.0) {
    vec2 grid = vec2(atan(d.z, d.x) * 6.0, asin(clamp(d.y, -1.0, 1.0)) * 12.0);
    float big = smoothstep(0.34, 0.1, worley(grid).x);
    float small = smoothstep(0.16, 0.05, worley(grid * 3.3 + 7.0).x) * 0.55;
    float night = smoothstep(0.12, -0.22, dot(Ng, uSunDir));
    // The painted light is soft all round; the night side needs to go properly dark to read.
    col *= 1.0 - 0.62 * smoothstep(0.1, -0.32, dot(Ng, uSunDir)) * uCities;
    // Under the popcorn the lights still glow, softened, as if through snow.
    float city = max(big, small) * inland * (1.0 - ice) * (1.0 - snow * 0.55) * (1.0 - cloud * 0.75);
    col += vec3(1.6, 1.05, 0.42) * city * night * uCities * (0.85 + 0.15 * sin(uTime * 3.0 + grid.x * 9.0));
  }
  // The air glows blue on the day side and warm along the line where night begins.
  float atmosphere = pow(1.0 - sat(dot(Ng, V)), 3.0);
  float sunward = dot(Ng, uSunDir);
  float dusk = smoothstep(-0.3, 0.0, sunward) * (1.0 - smoothstep(0.0, 0.35, sunward));
  col += (vec3(0.32, 0.56, 1.0) * mix(0.35, 1.0, smoothstep(-0.25, 0.4, sunward)) + vec3(1.0, 0.45, 0.2) * dusk * 0.6) * atmosphere * 0.85;
  // The same warm band lies on the ground where the sun is setting.
  col += albedo * vec3(1.0, 0.42, 0.18) * dusk * 0.18 * (1.0 - snow);
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

function* craterGeometry(): Generator<void, THREE.BufferGeometry, void> {
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
  // Smooth rock pushed about into ridges and gullies: broad planes that take the light, rather
  // than a scatter of facets that only glitter.
  const cone = P.lathe(profile, 128, 0.12, 2);
  const position = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let n = 0; n < position.count; n += 1) {
    const x = position.getX(n);
    const y = position.getY(n);
    const z = position.getZ(n);
    const rr = Math.hypot(x, z);
    if (rr < o + 0.25 || rr > s - 0.2) continue;
    const a = Math.atan2(z, x);
    const lump = Math.sin(a * 7 + y * 1.3) * Math.cos(a * 13 - rr * 0.9) * 0.5 + Math.sin(a * 23 + rr * 2.1) * 0.25;
    position.setXYZ(n, x, y + lump * 0.42 * smooth(o, o + 2, rr) * (1 - smooth(s - 2, s, rr)), z);
  }
  cone.computeVertexNormals();
  smoothLatheSeam(cone, 128);
  const lavaAt = (p: THREE.Vector3): number => {
    const rr = Math.hypot(p.x, p.z);
    const a = Math.atan2(p.z, p.x);
    const rivers = Math.pow(Math.max(0, Math.cos(a * 5 + 0.8 + Math.sin(rr * 0.8 + a * 2) * 0.55)), 26) * (1 - smooth(s - 3, s, rr));
    return rr < i + 0.08 ? 0 : Math.max(smooth(o + 1.1, o - 0.1, rr), rivers);
  };
  yield;
  // The Kit asks for color, then glow, for each vertex in turn, so the lava is worked out once.
  let lava = 0;
  kit.add(cone, {
    color: rock,
    gloss: 0.1,
    colorFn: (p, _n, out) => {
      const rr = Math.hypot(p.x, p.z);
      const a = Math.atan2(p.z, p.x);
      lava = lavaAt(p);
      out.lerpColors(rock, ridge, 0.5 + 0.5 * Math.sin(a * 11 + rr * 1.3));
      // Strata: the cone was built up in layers, each a slightly different rock.
      out.lerp(ridge, smooth(0.6, 0.9, 0.5 + 0.5 * Math.sin(p.y * 2.6 + Math.sin(a * 5 + rr) * 0.8)) * 0.35);
      if (rr < i + 0.08) out.copy(inner);
      else out.lerp(glow, lava);
    },
    emissiveFn: () => lava * 0.75,
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

/**
 * Deep space round the planet: indigo above, violet below, faint nebulae and a milky band, and
 * stars of every size that twinkle. Drawn in one pass on the inside of a large sphere.
 */
const spaceFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uTop, uLow;
varying vec3 vDir;
float snoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float sfbm(vec3 p) { return snoise(p) * 0.55 + snoise(p * 2.2 + 4.1) * 0.3 + snoise(p * 4.6 + 1.3) * 0.15; }
// One layer of stars: a few cells of a grid round the sky hold a star each.
vec3 starLayer(vec3 d, float scale, float density, float seed) {
  vec3 p = d * scale + seed;
  vec3 cell = floor(p);
  float h = hash31(cell);
  if (h < 1.0 - density) return vec3(0.0);
  vec3 center = vec3(hash31(cell + 1.7), hash31(cell + 5.3), hash31(cell + 9.1)) * 0.6 + 0.2;
  float r = length(fract(p) - center);
  // At least a pixel wide wherever they are, so they never shimmer away to nothing.
  float px = length(fwidth(p));
  float size = max(0.06, px * 0.9);
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
  float bright = (0.6 + 2.2 * pow(fract(h * 97.0), 3.0)) * twinkle * min(1.0, 0.06 / size);
  vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.88, 0.7), step(0.7, fract(h * 13.0)));
  return tint * bright * smoothstep(size, 0.0, r);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uLow, uTop, sat(d.y * 0.65 + 0.5));
  float n = sfbm(d * 2.3 + 1.0);
  float n2 = sfbm(d * 4.2 + 7.0);
  col += vec3(0.32, 0.08, 0.42) * smoothstep(0.48, 0.85, n) * 0.22;
  col += vec3(0.04, 0.2, 0.32) * smoothstep(0.55, 0.9, n2) * 0.16;
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.45))) * 3.2, 2.0));
  col += vec3(0.22, 0.17, 0.34) * band * (0.2 + 0.5 * n2);
  col += starLayer(d, 70.0, 0.06, 0.0);
  col += starLayer(d, 150.0, 0.05 + band * 0.12, 31.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

function spaceMesh(): THREE.Mesh {
  const hash31 = 'float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n';
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 20),
    new THREE.ShaderMaterial({
      name: 'space',
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${GLSL_UTIL}\n${hash31}${spaceFragment}`,
      uniforms: { uTime: globals.uTime, uTop: { value: new THREE.Color('#0c0a30') }, uLow: { value: new THREE.Color('#2a1650') } },
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

const SKIN = { color: '#ffd2ab', gloss: 0.28 };
const CREASE = { color: '#e9a184', gloss: 0.2, outline: 0 };

/**
 * One bone of a finger, from its joint at the origin up +Y. Fingers curl toward -X, so the back
 * of the hand, with its knuckle creases and nails, faces +X.
 */
function fingerSegment(length: number, radius: number, tip = false): THREE.BufferGeometry {
  const kit = new Kit();
  // Slightly tapered, with a rounded end below the joint so a bent finger never shows a seam.
  const end = tip ? radius * 0.86 : radius * 0.92;
  kit.add(
    P.lathe([[0, -radius * 0.95], [radius * 0.72, -radius * 0.68], [radius, 0], [radius * 0.96, length * 0.55], [end, length], [end * 0.7, length + end * 0.6], [0, length + end * 0.95]], 26, radius * 0.35, 4),
    SKIN,
  );
  // Two soft creases over the joint on the back.
  for (const y of [radius * 0.12, radius * 0.4]) {
    kit.add(P.torus(radius * 1.0, radius * 0.045, 4, 14, Math.PI * 0.6), { ...CREASE, matrix: at(0, y, 0, [Math.PI / 2, 0, Math.PI * 0.3]) });
  }
  if (tip) {
    // A glossy nail with its pale half-moon.
    kit.add(P.box(radius * 0.22, length * 0.52, radius * 1.15, radius * 0.28, 3), { color: '#ffe8de', gloss: 0.85, coat: 0.6, outline: 0.4, matrix: at(radius * 0.86, length * 0.64, 0) });
    kit.add(P.sphere(radius * 0.34, 12, 8), { color: '#fff6f0', gloss: 0.8, outline: 0, matrix: at(radius * 0.94, length * 0.44, 0, [0, 0, 0], [0.25, 0.45, 1.1]) });
  }
  return kit.build();
}

/** The palm, knuckles along Z; the palm itself faces -X, the back of the hand +X. */
function palmGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(18, 50, 44, 8.8, 6), SKIN);
  for (const z of [-15.5, -5.2, 5.2, 15.5]) {
    // Knuckles on the back, pads on the palm side under each finger.
    kit.add(P.sphere(5.6, 18, 12), { ...SKIN, matrix: at(5.4, 23, z, [0, 0, 0], [0.8, 0.85, 1]) });
    kit.add(P.sphere(5.8, 18, 12), { ...SKIN, matrix: at(-6.2, 19, z * 0.98, [0, 0, 0], [0.55, 0.72, 0.95]) });
  }
  // The heel of the hand: the thumb's mound and the pad opposite it.
  kit.add(P.sphere(12, 20, 14), { ...SKIN, matrix: at(-5.2, -10, 10, [0, 0, 0], [0.5, 1.1, 0.9]) });
  kit.add(P.sphere(10.5, 20, 14), { ...SKIN, matrix: at(-5.2, -11, -12, [0, 0, 0], [0.45, 1.05, 0.85]) });
  // Palm lines: heart, head and life.
  const line = (points: THREE.Vector3[]): void => {
    kit.add(P.tube(points, 0.55, 18, 5), CREASE);
  };
  line([new THREE.Vector3(-9.1, 12, -19), new THREE.Vector3(-9.2, 13.5, -6), new THREE.Vector3(-9.1, 11, 6), new THREE.Vector3(-8.8, 13, 15)]);
  line([new THREE.Vector3(-9.1, 4, -18), new THREE.Vector3(-9.2, 3, -4), new THREE.Vector3(-9.1, 0, 8)]);
  line([new THREE.Vector3(-9.0, 8, 12), new THREE.Vector3(-9.2, -2, 6), new THREE.Vector3(-9.0, -14, 4)]);
  // Wrist and a red cuff with two buttons.
  kit.add(P.capsule(13, 44, 5, 16), { ...SKIN, matrix: at(0, -46, 0) });
  kit.add(P.torus(14.2, 2.2, 8, 32), { color: '#d8313a', gloss: 0.8, matrix: at(0, -34, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(15.2, 15.2, 9, 32, 1.5), { color: '#d8313a', gloss: 0.55, pattern: 5.5, matrix: at(0, -44, 0) });
  for (const y of [-38.5, -43]) kit.add(P.sphere(1.3, 10, 8), { color: '#f2c14e', gloss: 0.9, metal: 1, outline: 0, matrix: at(15.3, y, 0) });
  return kit.build();
}

/** Earth light groups: the neon ad ring once bought, and the lights on the launch tower. */
const LIT = { ring: 0, pad: 1 } as const;
/**
 * The moon starts far off and small, high in the corner of the picture, and closes in on MOON_PLAY
 * as the planet fills up; the ending then glides it on to MOON_HOME, where its own camera wants it.
 */
const MOON_FAR = new THREE.Vector3(-150, -60, -420);
const MOON_PLAY = new THREE.Vector3(-52, -11, -128);
/** Seconds the ending takes to bring the moon from where play left it. */
const MOON_GLIDE = 2.6;
/** Where the toy astronaut stands on the moon, as a direction from its center. */
const ASTRONAUT_ON = new THREE.Vector3(-0.38, 0.84, 0.39).normalize();
const PAD_AT = new THREE.Vector3(-28, 0, -2);
const RING_RADIUS = 50;
const UP = new THREE.Vector3(0, 1, 0);

function rocketGeometry(): THREE.BufferGeometry {
  // A toy rocket on its pad beside a red launch tower; the windows light up after dark.
  const kit = new Kit();
  const white = { color: '#f4f2ee', gloss: 0.8, coat: 0.45 };
  const red = { color: '#d8313a', gloss: 0.85, coat: 0.45 };
  kit.add(P.puck(3.1, 2.9, 0.6, 28, 0.15), { color: '#b7ad9f', gloss: 0.15, pattern: 7.3 });
  kit.add(P.lathe([[0, 0.6], [1.0, 0.6], [1.15, 1.0], [1.15, 4.4], [0.95, 5.5], [0.5, 6.3], [0, 6.7]], 28, 0.12, 3), { ...white, matrix: at(0, 0.3, 0) });
  kit.add(P.lathe([[0.97, 5.42], [0.98, 5.45], [0.55, 6.25], [0.52, 6.25]], 28, 0.05, 2), { ...red, matrix: at(0, 0.3, 0) });
  kit.add(P.torus(1.16, 0.08, 6, 28), { ...red, outline: 0.4, matrix: at(0, 2.2, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    kit.add(P.box(0.14, 1.6, 1.1, 0.06, 1), { ...red, matrix: at(Math.cos(a) * 1.3, 1.5, Math.sin(a) * 1.3, [0, -a, 0.12]) });
  }
  for (const y of [3.3, 4.3]) {
    kit.add(P.puck(0.34, 0.34, 0.12, 16, 0.04), { color: '#e4b252', gloss: 0.85, metal: 1, matrix: at(0, y, 1.1, [Math.PI / 2, 0, 0]) });
    kit.add(P.puck(0.26, 0.26, 0.14, 16, 0.03), { color: '#ffe9a6', emissive: 0.7, outline: 0, light: lightGroup(4, LIT.pad), matrix: at(0, y, 1.12, [Math.PI / 2, 0, 0]) });
  }
  // The tower: four red legs, cross-braced, with a walkway arm and warning lights on top.
  for (const [x, z] of [[2.2, -0.7], [3.6, -0.7], [2.2, 0.7], [3.6, 0.7]] as const) kit.add(P.box(0.22, 7.6, 0.22, 0.06, 1), { ...red, matrix: at(x, 4.2, z) });
  for (let level = 0; level < 6; level += 1) {
    const y = 1.2 + level * 1.2;
    for (const z of [-0.7, 0.7]) kit.add(P.box(1.4, 0.12, 0.12, 0.04, 1), { ...red, outline: 0.4, matrix: at(2.9, y, z, [0, 0, level % 2 ? 0.6 : -0.6]) });
  }
  kit.add(P.box(1.5, 0.18, 0.5, 0.05, 1), { color: '#5a6478', gloss: 0.5, metal: 0.6, matrix: at(1.6, 4.8, 0) });
  for (const x of [2.2, 3.6]) kit.add(P.sphere(0.18, 8, 6), { color: '#ff4a3f', emissive: 1, outline: 0, light: lightGroup(4, LIT.pad), matrix: at(x, 8.1, 0) });
  return kit.build();
}

function flagGeometry(): THREE.BufferGeometry {
  // Planted next to the astronaut: a pole and a red flag with a golden kernel on it.
  const kit = new Kit();
  kit.add(P.puck(0.04, 0.04, 2.1, 8, 0.01), { color: '#d3dce6', gloss: 0.9, metal: 1 });
  kit.add(P.box(1.1, 0.7, 0.04, 0.03, 1), { color: '#d8313a', gloss: 0.3, pattern: Pattern.Fabric, matrix: at(0.56, 1.7, 0) });
  kit.add(P.sphere(0.2, 10, 8), { color: '#ffc63f', gloss: 0.6, outline: 0, matrix: at(0.56, 1.7, 0.03, [0, 0, 0], [1, 1.2, 0.3]) });
  return kit.build();
}

function adRingGeometry(): THREE.BufferGeometry {
  // A great ring round the planet carrying six neon 「砰」, readable from anywhere in orbit.
  const kit = new Kit();
  const steel = { color: '#5a6478', gloss: 0.7, metal: 0.8, wear: 0.3 };
  kit.add(P.torus(RING_RADIUS, 0.55, 6, 120), { ...steel, matrix: at(0, 0, 0, [Math.PI / 2, 0, 0]) });
  kit.add(P.torus(RING_RADIUS, 0.22, 4, 120), { color: '#ffd23f', gloss: 0.6, emissive: 0.6, outline: 0, light: lightGroup(4, LIT.ring), matrix: at(0, 0.62, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * RING_RADIUS;
    const z = Math.sin(a) * RING_RADIUS;
    const turn = Math.PI / 2 - a;
    kit.add(P.box(0.5, 2.6, 0.5, 0.1, 1), { ...steel, matrix: at(x, 1.3, z, [0, turn, 0]) });
    neonPop(kit, at(x, 4.6, z, [0, turn, 0], 3.2), { ...NEON_PINK, light: lightGroup(4, LIT.ring) });
  }
  return kit.build();
}

const auroraVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld, vNormal;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Curtains of buttery light, rippling and drifting round the pole.
const auroraFragment = /* glsl */ `
uniform float uTime, uStrength;
varying vec2 vUv;
varying vec3 vWorld, vNormal;
void main() {
  float around = vUv.x * 6.2831853;
  float streaks = 0.55 + 0.45 * sin(around * 38.0 + sin(around * 5.0 + uTime * 0.6) * 3.0 + uTime * 0.9);
  streaks *= 0.6 + 0.4 * sin(around * 11.0 - uTime * 0.4);
  float height = vUv.y;
  float fade = smoothstep(0.0, 0.18, height) * (1.0 - smoothstep(0.45, 1.0, height));
  vec3 color = mix(vec3(1.0, 0.82, 0.32), vec3(1.0, 0.55, 0.7), smoothstep(0.2, 0.95, height));
  float face = 0.4 + 0.6 * abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
  gl_FragColor = vec4(color * streaks * fade * face * uStrength, 0.0);
}
`;

/** The aurora: a wavy band of curtain round the crater, standing clear of the popcorn cap. */
function auroraMesh(): THREE.Mesh {
  const around = 180;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= around; i += 1) {
    const a = (i / around) * Math.PI * 2;
    const r = 19 + Math.sin(a * 3) * 2.2 + Math.sin(a * 7 + 1) * 1.1;
    const base = sphereY(r) + 6;
    const top = base + 9 + Math.sin(a * 5 + 2) * 3;
    for (const [y, v] of [[base, 0], [top, 1]] as const) {
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(i / around, v);
    }
    if (i < around) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      name: 'aurora',
      vertexShader: auroraVertex,
      fragmentShader: auroraFragment,
      uniforms: { uTime: globals.uTime, uStrength: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      // Alpha holds the floor reflection mask, which light in the air must not touch.
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  );
  mesh.renderOrder = 3;
  return mesh;
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

/** A little camera satellite in gold foil with two solar wings; centered, lens toward +Z. */
function satelliteGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(2.4, 2, 2, 0.2, 2), { color: '#e8b44a', gloss: 0.8, metal: 0.9, pattern: Pattern.Brushed });
  for (const side of [-1, 1]) {
    kit.add(P.box(0.6, 0.18, 0.18, 0.05, 1), { color: '#c8ced6', gloss: 0.8, metal: 1, outline: 0, matrix: at(side * 1.5, 0, 0) });
    kit.add(P.box(4.6, 0.1, 1.9, 0.05, 1), { color: '#2c4f9e', gloss: 0.9, coat: 0.6, matrix: at(side * 4.1, 0, 0) });
    for (let i = 1; i < 4; i += 1) kit.add(P.box(0.06, 0.12, 1.9, 0.01, 1), { color: '#c8ced6', outline: 0, detail: 1, matrix: at(side * (1.8 + i * 1.15), 0, 0) });
  }
  kit.add(P.puck(0.55, 0.5, 0.4, 20, 0.05), { color: '#1c1e28', gloss: 0.95, coat: 0.9, matrix: at(0, 0.1, 1.1, [Math.PI / 2, 0, 0]) });
  kit.add(P.puck(0.32, 0.32, 0.05, 20, 0.02), { color: '#7cc4ff', gloss: 1, emissive: 0.3, outline: 0, matrix: at(0, 0.1, 1.33, [Math.PI / 2, 0, 0]) });
  kit.add(P.lathe([[0, 0], [0.9, 0.35], [0.95, 0.42], [0, 0.12]], 18, 0.02, 1), { color: '#f4f6fa', gloss: 0.5, matrix: at(0, 1, -0.4, [-0.5, 0, 0]) });
  return kit.build();
}

/** A fat toy cloud; origin at its middle. */
function cloudGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  const puffsAt: Array<[number, number, number, number]> = [[0, 0.3, 0, 2.2], [-2.1, -0.2, 0.2, 1.6], [2.2, -0.1, -0.1, 1.7], [-1, 1.2, -0.3, 1.5], [1.1, 1.1, 0.3, 1.4], [0.2, -0.7, 0.8, 1.5]];
  for (const [x, y, z, r] of puffsAt) kit.add(P.sphere(r, 16, 12), { color: '#ffffff', gloss: 0.15, matrix: at(x, y, z, [0, 0, 0], [1, 0.82, 0.9]) });
  return kit.build();
}

function* buildEarth(stage: Stage, root: THREE.Group): SceneBuild {
  const sky = new THREE.Group();
  root.add(sky);
  sky.add(spaceMesh());
  yield;

  const globeUniforms = {
    ...globals,
    ...popcornUniforms,
    uSnowLine: { value: 2 },
    uSpin: { value: 0 },
    uCities: { value: 0 },
  };
  const hash31 = 'float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n';
  const globeKit = new Kit();
  globeKit.add(new THREE.SphereGeometry(R, 128, 88), { color: '#ffffff', outline: 1.4 });
  const globeGeometry = globeKit.build();
  yield;
  const globe = new THREE.Mesh(
    globeGeometry,
    new THREE.ShaderMaterial({
      name: 'globe',
      vertexShader: globeVertex,
      fragmentShader: `${GLSL_UTIL}\n${hash31}${GLSL_LIGHT_PARS}\n${POPCORN_SHADING}\n${globeFragment}`,
      uniforms: globeUniforms,
    }),
  );
  globe.position.y = -R;
  root.add(globe);
  const globeInk = new THREE.Mesh(globeGeometry, toyMaterials().outline);
  globeInk.position.y = -R;
  root.add(globeInk);
  stage.shadow.add(globe, toyMaterials().depth);
  // A thin blue shell of air around the planet.
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.055, 64, 40),
    new THREE.ShaderMaterial({
      name: 'atmosphere',
      vertexShader: 'varying vec3 vN, vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform vec3 uSunDir, uCenter;
        varying vec3 vN, vP;
        void main() {
          float g = pow(abs(dot(normalize(vN), normalize(cameraPosition - vP))), 3.0);
          float sunward = dot(normalize(vP - uCenter), uSunDir);
          float dusk = smoothstep(-0.3, 0.0, sunward) * (1.0 - smoothstep(0.0, 0.35, sunward));
          vec3 glow = vec3(0.3, 0.55, 1.0) * mix(0.3, 1.0, smoothstep(-0.25, 0.4, sunward)) + vec3(1.0, 0.45, 0.2) * dusk * 0.7;
          gl_FragColor = vec4(glow * g * 0.75, 0.0);
        }`,
      uniforms: { uSunDir: globals.uSunDir, uCenter: { value: new THREE.Vector3(0, -R, 0) } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  );
  air.position.y = -R;
  root.add(air);
  yield;

  const crater = addToy(stage, root, yield* craterGeometry());
  yield;

  const moon = new THREE.Group();
  moon.position.copy(MOON_HOME);
  sky.add(moon);
  addToy(stage, moon, moonGeometry());
  yield;

  // The moon's true form: a kernel the size of a moon.
  const moonFlake = new PieceBatches(stage, sky, 1);
  const flakeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 1.3, 0.2));
  const snow = new PopcornSnow(root, { count: 560, size: 0.4, height: 86, radius: 50, center: [0, -14, -4] });
  yield;

  // The hand: a palm with four two-jointed fingers and a thumb.
  const hand = new THREE.Group();
  hand.visible = false;
  sky.add(hand);
  addToy(stage, hand, palmGeometry());
  yield;
  const segment = (parent: THREE.Object3D, length: number, radius: number, x: number, y: number, z: number, tip = false): THREE.Group => {
    const joint = new THREE.Group();
    joint.position.set(x, y, z);
    parent.add(joint);
    addToy(stage, joint, fingerSegment(length, radius, tip));
    return joint;
  };
  hand.scale.setScalar(HAND_SCALE);
  // Middle finger longest, then ring, index and little finger, as on a real hand.
  const LENGTHS = [19, 24, 26, 23];
  const fingers: Finger[] = [-15.5, -5.2, 5.2, 15.5].map((z, index) => {
    const length = LENGTHS[index]!;
    const radius = index === 0 ? 4.7 : 5.2;
    const base = segment(hand, length, radius, 4, 25, z);
    const middle = segment(base, length * 0.78, radius * 0.92, 0, length, 0);
    const tip = segment(middle, length * 0.6, radius * 0.84, 0, length * 0.78, 0, true);
    return { base, middle, tip };
  });
  yield;
  const thumbBase = segment(hand, 22, 6.2, -8, 2, 0);
  const thumbTip = segment(thumbBase, 17, 5.4, 0, 22, 0, true);

  // Every orbital mirror turns on the moon for the finale.
  const moonBeams = ORBITAL_SLOTS.map((slot) => {
    const beam = addLightBeam(root, new THREE.Vector3(slot.x, slot.y + 2.6, slot.z), MOON_HOME, 0.5, MOON_R * 0.55, '#ffd28a', 0);
    beam.visible = false;
    return beam;
  });
  let orbitals = 0;
  const setBeams = (strength: number): void => {
    moonBeams.forEach((beam, index) => {
      beam.visible = strength > 0 && index < orbitals;
      (beam.material as THREE.ShaderMaterial).uniforms.uStrength!.value = strength;
    });
  };

  // The astronaut, the launch pad and the ad ring share one rig; the aurora is a light of its own.
  const pieces = new SetPieces(root);
  const astronaut = toyFigure(pieces, sky, { skin: '#f4f6fa', shirt: '#f4f6fa', pants: '#e3e6ec', hat: 'helmet' });
  astronaut.root.scale.setScalar(2.5);
  const flag = pieces.group(sky);
  flag.scale.setScalar(2.5);
  pieces.part(flagGeometry(), flag);
  const pad = pieces.group(root, PAD_AT.x, sphereY(Math.hypot(PAD_AT.x, PAD_AT.z)) - 0.15, PAD_AT.z);
  pad.quaternion.setFromUnitVectors(UP, planetUp(R, pad.position.x, pad.position.y, pad.position.z));
  pad.scale.setScalar(1.25);
  pieces.part(rocketGeometry(), pad);
  const ringTilt = pieces.group(root, 0, -R, 0);
  ringTilt.rotation.set(0.3, 0, -0.2);
  const ring = pieces.group(ringTilt);
  pieces.part(adRingGeometry(), ring, { shadow: false });
  pieces.decoration('decor-ring', ringTilt, 14);
  // Hidden things to find (src/content/props.ts): a satellite with a camera, a cloud. The moon is the third.
  const satellite = pieces.group(root, SATELLITE_AT.x, SATELLITE_AT.y, SATELLITE_AT.z);
  satellite.rotation.set(0.25, 0.9, 0.15);
  pieces.part(satelliteGeometry(), satellite);
  const cloud = pieces.group(root, CLOUD_AT.x, CLOUD_AT.y, CLOUD_AT.z);
  pieces.part(cloudGeometry(), cloud);
  pieces.build(stage);
  const aurora = auroraMesh();
  aurora.visible = false;
  root.add(aurora);
  const auroraStrength = (aurora.material as THREE.ShaderMaterial).uniforms.uStrength!;
  let auroraWanted = 0;
  const bank = new LightBank(4, [{ style: 'neon' }, { at: 0.42, style: 'bulb' }]);
  yield;

  const craterKick = new Spring(0, 420, 15);
  const astronautHop = new Spring(0, 60, 6);
  let time = 0;
  let steamTimer = 0;
  let spin = 0;
  let finaleTime = -1;
  let popped = false;

  const cues = new Cues();
  const selfie = new Pulse(1.6);
  const cloudWobble = new Wobble(cloud, { axis: 'z', squash: 0.3, turn: 0.08, stiffness: 160, damping: 5 });
  const moonSquish = new Spring(0, 140, 6);
  let rain = 0;
  const lens = new THREE.Vector3();
  const satelliteSpot = SATELLITE_AT.clone();
  const cloudSpot = CLOUD_AT.clone();
  const moonSpot = new THREE.Vector3();
  const eggs: EggSpot[] = [
    {
      id: 'egg-satellite',
      position: satelliteSpot,
      radius: 4.5,
      active: () => finaleTime < 0 && !selfie.busy,
      play(ctx) {
        // It turns round to face the camera and takes a picture of itself, popcorn planet behind.
        selfie.start();
        cues.after(0.75, () => {
          satellite.updateMatrixWorld();
          root.worldToLocal(satellite.localToWorld(lens.set(0, 0.1, 1.5)));
          ctx.sprites.spawn({ x: lens.x, y: lens.y, z: lens.z, sizeStart: 2, sizeEnd: 16, life: 0.32, color: shutterColor, alpha: 1, additive: 1, kind: SpriteKind.Puff });
          gag.sparkle(ctx, lens, 2.5, 6);
        });
      },
    },
    {
      id: 'egg-cloud',
      position: cloudSpot,
      radius: 4,
      active: () => finaleTime < 0,
      play() {
        // A squeeze, and down comes popcorn rain.
        cloudWobble.kick(1);
        rain = 1.6;
      },
    },
    {
      id: 'egg-moon',
      position: moonSpot,
      radius: MOON_R,
      active: () => finaleTime < 0 && !popped,
      play(ctx) {
        // It wobbles like a poked jelly and gives off heat; the astronaut jumps.
        moonSquish.kick(-9);
        astronautHop.kick(5);
        for (let i = 0; i < 3; i += 1) cues.after(i * 0.18, () => ctx.sprites.spawn({ x: moon.position.x, y: moon.position.y, z: moon.position.z, sizeStart: MOON_R * moon.scale.x * 1.8, sizeEnd: MOON_R * moon.scale.x * 3.4, life: 0.6, color: heatColor, alpha: 0.45, additive: 1, kind: SpriteKind.Ring }));
        gag.puff(ctx, v.copy(moon.position).addScaledVector(UP, MOON_R * moon.scale.x), 4, steam, 8);
      },
    },
  ];
  let lavaTimer = 0;
  let grabbed = false;
  let story = 0;
  const carried = new THREE.Vector3();
  const astronautVelocity = new THREE.Vector3();
  const standing = new THREE.Quaternion().setFromUnitVectors(UP, ASTRONAUT_ON);
  const faceCamera = new THREE.Quaternion().setFromAxisAngle(UP, 0.55);

  const tell = (u: number, dt: number, instant: boolean, calm: boolean): void => {
    story = u;
    bank.update(u, dt, instant, calm);
    const [toMid, toLate] = storyWeights(u);
    globeUniforms.uCities.value = lerp(lerp(0, 0.55, toMid), 1, toLate);
    auroraStrength.value += (auroraWanted - auroraStrength.value) * (instant ? 1 : Math.min(1, dt * 1.5));
    aurora.visible = auroraStrength.value > 0.01;
  };

  /** The astronaut keeps to the moon, hops in the low gravity, and waves now and then. */
  const updateAstronaut = (dt: number): void => {
    const hop = Math.max(0, astronautHop.update(dt));
    if (!popped) {
      const scale = moon.scale.x;
      astronaut.root.position.copy(ASTRONAUT_ON).multiplyScalar((MOON_R - 0.1) * scale + hop * 1.4).add(moon.position);
      astronaut.root.quaternion.copy(standing).multiply(faceCamera);
      astronaut.root.scale.setScalar(2.5 * scale);
      flag.position.copy(v.copy(ASTRONAUT_ON).applyAxisAngle(UP, 0.32)).multiplyScalar((MOON_R - 0.15) * scale).add(moon.position);
      flag.quaternion.copy(standing).multiply(faceCamera);
      flag.scale.setScalar(2.5 * scale);
      if (Math.floor(time / 6.5) !== Math.floor((time - dt) / 6.5)) astronautHop.kick(4);
    } else {
      // Thrown clear when the moon goes pop, tumbling off into space.
      astronautVelocity.y -= 3 * dt;
      astronaut.root.position.addScaledVector(astronautVelocity, dt);
      astronaut.root.rotateX(dt * 2.2);
      astronaut.root.rotateZ(dt * 1.3);
      flag.visible = false;
    }
    const wave = smooth(0, 0.2, (time % 9) - 6) * (1 - smooth(1.6, 1.9, (time % 9) - 6));
    astronaut.armR.rotation.set(0, 0, lerp(0.15, 2.7 + Math.sin(time * 10) * 0.3, wave));
    astronaut.armL.rotation.set(0, 0, -0.15 - hop * 0.6);
    astronaut.head.rotation.y = Math.sin(time * 0.5) * 0.4;
  };

  const setFingers = (curl: number, t: number): void => {
    fingers.forEach((finger, index) => {
      // Each finger closes a beat after its neighbor, and each joint after the one before it,
      // the way a real hand wraps round something; until then the fingers stir a little.
      const own = clamp01(curl * 1.15 - index * 0.04);
      const near = smooth(0, 0.65, own);
      const mid = smooth(0.12, 0.85, own);
      const far = smooth(0.28, 1, own);
      const stir = (1 - own) * 0.04 * Math.sin(t * 2.3 + index * 1.4);
      const spread = (index - 1.5) * 0.17 * (1 - near * 0.6);
      const lag = 1 - Math.abs(index - 1.5) * 0.09;
      finger.base.rotation.set(spread, 0, 0.1 + index * 0.035 + stir + near * 0.55 * lag);
      finger.middle.rotation.z = 0.12 + stir * 0.8 + mid * 0.95 * lag;
      finger.tip.rotation.z = 0.1 + stir * 0.6 + far * 0.78 * lag;
    });
    thumbBase.rotation.z = 1.5 - smooth(0, 0.7, curl) * 0.42;
    thumbTip.rotation.z = -0.15 - smooth(0.2, 1, curl) * 0.85;
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
    setFingers(smooth(GRAB_AT - 0.9, GRAB_AT + 0.05, t), t);
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
      globeUniforms.uSnowLine.value = -2;
      snow.setAmount(1);
      const heat = smooth(HEAT_START, POP_AT - 0.75, t);
      setBeams(popped ? 0 : heat * 0.5);
      if (!popped) {
        const tremble = heat * heat * 0.9;
        const swell = 1 + heat * heat * 0.42;
        moon.position.lerpVectors(MOON_PLAY, MOON_HOME, easeInOutCubic(clamp01(t / MOON_GLIDE)));
        moon.position.x += Math.sin(t * 61) * tremble;
        moon.position.y += Math.cos(t * 53) * tremble;
        moon.scale.setScalar(swell);
        if (t >= POP_AT) {
          popped = true;
          moon.visible = false;
          astronautVelocity.copy(ASTRONAUT_ON).multiplyScalar(26).add(v.set(6, 4, 8));
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
      globeUniforms.uSnowLine.value = -2;
      snow.setAmount(1);
      popped = true;
      moon.visible = false;
      astronaut.root.visible = false;
      flag.visible = false;
      setBeams(0);
      showMoonFlake(MOON_R * 1.5, 1, 0);
    },
  };

  return {
    finale,
    eggs,
    progress: tell,
    upgradesChanged(owned, animate) {
      pieces.sync(owned, animate);
      bank.want(LIT.ring, pieces.owns('decor-ring'));
      auroraWanted = owned.includes('decor-aurora') ? 1 : 0;
      if (!animate) auroraStrength.value = auroraWanted;
    },
    unitsChanged(kind, count) {
      if (kind === 'orbital') orbitals = count;
    },
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
        globeUniforms.uSnowLine.value = snowLine(ctx.level);
        snow.setAmount(0.25 + ctx.level * 0.75);
        // The moon draws in as the planet fills up, until it hangs where the ending needs it.
        const approach = smooth(0, 1, story);
        const tremble = 0.28 + ctx.level * ctx.level * 1.1;
        moon.position.lerpVectors(MOON_FAR, MOON_PLAY, approach);
        moon.position.x += Math.sin(time * 49) * 0.13 * tremble;
        moon.position.y += Math.cos(time * 43) * 0.11 * tremble;
        moon.scale.setScalar(lerp(0.55, 1, approach));
        const squish = moonSquish.update(dt) * 0.08;
        moon.scale.multiply(v.set(1 - squish * 0.5, 1 + squish, 1 - squish * 0.5));
        moonSpot.copy(moon.position);
      }
      cues.update(dt);
      cloudWobble.update(dt);
      cloud.position.y = CLOUD_AT.y + Math.sin(time * 0.5) * 0.5;
      const look = selfie.update(dt);
      satellite.rotation.set(0.25 + Math.sin(time * 0.3) * 0.05, lerp(0.9 + time * 0.05, 0.25, look), 0.15);
      if (rain > 0) {
        rain -= dt;
        const r = ctx.rng;
        for (let i = 0; i < 3; i += 1) {
          ctx.sprites.spawn({ x: cloud.position.x + r.range(-2.6, 2.6), y: cloud.position.y - 1.2, z: cloud.position.z + r.range(-1.2, 1.2), vy: -r.range(2, 4), gravity: 14, sizeStart: 0.45, sizeEnd: 0.35, life: 0.9, color: rainColor, alpha: 1, kind: SpriteKind.Fleck, spin: r.range(-6, 6) });
        }
      }
      moon.rotation.y = time * 0.02;
      ring.rotation.y = time * 0.035;
      if (astronaut.root.visible) updateAstronaut(dt);
      pieces.update(dt, ctx);

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
/** Storms lean with the sea under them, so they lie flat on the curve of the planet. */
const overSea = (x: number, z: number, rotation: number, scale: number): UnitSlot => {
  const y = sphereY(Math.hypot(x, z));
  return { x, y, z, rotation, scale, up: planetUp(R, x, y, z) };
};

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
  // The planet turns away from the sun: night creeps over its left side and the cities light up.
  story: {
    mid: {
      light: { sunDir: [0.76, 0.48, 0.36], sunColor: '#fff4e2', sunIntensity: 1.42, shadeTint: '#26306e', sky: '#6a80d4', skyIntensity: 0.19, ground: '#323e7c', groundIntensity: 0.11, rim: '#94bcff', rimIntensity: 0.75, rimDir: [-0.7, 0.25, -0.65], fog: '#0c0a30', fogRange: [400, 900], pool: [0, 0, 0, 400], poolFloor: 1 },
      grade: { exposure: 1.02, contrast: 1.08, saturation: 1.08, vignette: 0.39, bloom: 0.85, shadowTint: '#eef0ff', highlightTint: '#fff9f0', aoTint: '#0a0a2c' },
    },
    late: {
      light: { sunDir: [0.88, 0.3, 0.3], sunColor: '#fff0dc', sunIntensity: 1.42, shadeTint: '#222a68', sky: '#5f74cc', skyIntensity: 0.23, ground: '#2c346a', groundIntensity: 0.1, rim: '#a0c0ff', rimIntensity: 0.82, rimDir: [-0.7, 0.25, -0.65], fog: '#0a0828', fogRange: [400, 900], pool: [0, 0, 0, 400], poolFloor: 1 },
      grade: { exposure: 1.03, contrast: 1.09, saturation: 1.08, vignette: 0.42, bloom: 0.92, shadowTint: '#eaeeff', highlightTint: '#fff8ee', aoTint: '#08082a' },
    },
  },
  tiltShift: 0.35,
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
  // Now and then a meteor across the stars.
  ambience: [{ look: 'meteor', center: [0, 70, -120], half: [140, 30, 10], rate: 0.25 }],
  // One capture above the crater sees the bright planet below it, which is wrong for its far sides.
  envDiffuse: 0.15,
  shadow: { center: new THREE.Vector3(0, -12, 0), radius: 60 },
  pile: earthPile,
  debris: ['#5b4150', '#ff7a2f', '#84606e'],
  homeRadius: CRATER.innerR * 0.72,
  vesselRadius: CRATER.skirtR,
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
    orbital: ORBITAL_SLOTS,
    factory: [onPlanet(-21, 2, 1.5, 2), onPlanet(20, -8, -2, 2), onPlanet(4, 22, 0, 2)],
    volcano: [onPlanet(-11, -13, 0.7, 2.4), onPlanet(13, -14, -0.7, 2.4), onPlanet(-20, -9, 1.2, 2.3), onPlanet(22, 7, -1.4, 2.3), onPlanet(-3, -21, 0.1, 2.3), onPlanet(-24, 11, 1.1, 2.2), onPlanet(23, 13, -1.1, 2.2), onPlanet(9, 24, -0.3, 2.2)],
    typhoon: [overSea(-13, 19, 0.3, 1.35), overSea(17, -2, 1.1, 1.3), overSea(-7, -27, 2, 1.25)],
  },
  // Round the crater's skirt, leaning with the planet as it goes.
  paths: { train: planetRingPath(R, 14.4, 0, { spacing: 4.4, speed: 2.2, scale: 1.4, capacity: 10 }) },
  cannon: { position: new THREE.Vector3(10.5, sphereY(13) + 0.1, 8), rotation: Math.PI - 0.7, scale: 2.5 },
  perches: [],
  build: buildEarth,
};

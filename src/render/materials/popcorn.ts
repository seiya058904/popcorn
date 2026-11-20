import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_LIGHT_PARS, GLSL_UTIL, SHADOW_DEPTH_FRAGMENT } from './glsl.ts';

/** Values a flavor controls. Linear colors, swapped live by flavor upgrades. */
export const popcornUniforms = {
  uPopCream: { value: new THREE.Color('#fffaf0') },
  uPopShade: { value: new THREE.Color('#fbd596') },
  uPopDeep: { value: new THREE.Color('#d0822f') },
  uPopHull: { value: new THREE.Color('#8a4a1e') },
  uPopCool: { value: new THREE.Color('#bfae9f') },
  uKernel: { value: new THREE.Color('#f7a51c') },
  uPopSheen: { value: 0.3 },
  // The incoming flavor, revealed by an expanding ring around uWave.xy.
  uCreamB: { value: new THREE.Color('#fffaf0') },
  uShadeB: { value: new THREE.Color('#fbd596') },
  uDeepB: { value: new THREE.Color('#d0822f') },
  uHullB: { value: new THREE.Color('#8a4a1e') },
  uSheenB: { value: 0.3 },
  uWave: { value: new THREE.Vector3(0, 0, -1) },
  uEffect: { value: new THREE.Vector2(0, 0) },
  /** 0 to 1 while a frenzy is on: the popcorn glitters and runs a little warmer. */
  uFrenzy: { value: 0 },
};

/** Each heap owns one of these, so two scenes can show their heaps at once during a transition. */
export function createPileUniforms(): PileUniforms {
  return {
    uPileTex: { value: null },
    uPileCliff: { value: null },
    uPileMin: { value: new THREE.Vector2() },
    uPileSize: { value: 1 },
    uPileTexel: { value: 1 / 180 },
    uLumpScale: { value: 7 },
    uPieceK: { value: 1 },
  };
}

export interface PileUniforms {
  uPileTex: { value: THREE.Texture | null };
  uPileCliff: { value: THREE.Texture | null };
  uPileMin: { value: THREE.Vector2 };
  uPileSize: { value: number };
  uPileTexel: { value: number };
  uLumpScale: { value: number };
  uPieceK: { value: number };
}

const shading = /* glsl */ `
uniform vec3 uPopCream, uPopShade, uPopDeep, uPopHull, uPopCool, uKernel;
uniform float uPopSheen, uSheenB, uFrenzy;
uniform vec3 uCreamB, uShadeB, uDeepB, uHullB, uWave;
uniform vec2 uEffect;

vec3 hsv(float h, float s, float v) {
  vec3 k = abs(fract(vec3(h) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), sat(k - 1.0), s);
}

// Special flavors change the surface itself, not only its color.
void flavorEffect(float kind, inout vec3 base, vec3 N, vec3 V, vec3 P, float band, float shadow) {
  if (kind < 0.5) return;
  float seed = hash31(floor(P * 34.0));
  if (kind < 1.5) {
    // Salt: tiny crystals that catch the light as the view moves.
    vec3 facet = normalize(N + (vec3(seed, fract(seed * 7.3), fract(seed * 13.7)) - 0.5) * 1.3);
    base += vec3(1.1, 1.2, 1.3) * step(0.9, seed) * pow(sat(dot(facet, normalize(uSunDir + V))), 40.0) * 3.0 * shadow;
  } else if (kind < 2.5) {
    float hue = fract(dot(P, vec3(0.23, 0.17, 0.19)) + uTime * 0.03);
    base = mix(base, hsv(hue, 0.6, 1.0) * (0.55 + 0.55 * band), 0.72);
  } else if (kind < 3.5) {
    float twinkle = 0.5 + 0.5 * sin(uTime * 3.0 + seed * 40.0);
    base += vec3(0.14, 0.06, 0.3) * (0.5 + 0.5 * sin(P.x * 3.0 + P.z * 2.0));
    base += vec3(0.95, 1.0, 1.4) * step(0.95, seed) * twinkle * 2.6;
  } else if (kind < 4.5) {
    base += vec3(1.0, 0.72, 0.3) * studioReflection(reflect(-V, N)) * mix(0.45, 1.0, shadow) * 0.95;
  } else {
    float hue = fract(sat(dot(N, V)) * 1.2 + uTime * 0.06 + P.y * 0.12);
    base = mix(base, hsv(hue, 0.55, 1.0) * (0.6 + 0.5 * band), 0.55);
  }
}

float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}

// Foamy puffed-starch surface, added per pixel so flakes hold up in close-up.
vec3 puffGradient(vec3 p) {
  const float e = 0.04;
  float n = noise3(p) + noise3(p * 2.3) * 0.45;
  float x = noise3(p + vec3(e, 0, 0)) + noise3((p + vec3(e, 0, 0)) * 2.3) * 0.45;
  float y = noise3(p + vec3(0, e, 0)) + noise3((p + vec3(0, e, 0)) * 2.3) * 0.45;
  float z = noise3(p + vec3(0, 0, e)) + noise3((p + vec3(0, 0, e)) * 2.3) * 0.45;
  return (vec3(x, y, z) - n) / e;
}

vec3 popcornShade(vec3 N, vec3 V, vec3 P, float crease, float core, float pop, float glow, float shadow, float ao) {
  float ndl = dot(N, uSunDir);
  float wrap = sat((ndl + 0.7) / 1.7);
  float lit = min(wrap, mix(0.4, 1.0, shadow));
  float stepped = smoothstep(0.3, 0.4, lit) * 0.4 + smoothstep(0.54, 0.68, lit) * 0.6;
  float band = mix(lit, stepped, 0.55);
  float pool = lightPool(P);

  float wave = smoothstep(uWave.z + 0.4, uWave.z - 0.4, length(P.xz - uWave.xy));
  vec3 cream = mix(uPopCream, uCreamB, wave);
  vec3 shade = mix(uPopShade, uShadeB, wave);
  vec3 deep = mix(uPopDeep, uDeepB, wave);
  vec3 hull = mix(uPopHull, uHullB, wave);
  float sheenAmount = mix(uPopSheen, uSheenB, wave);

  vec3 base = mix(shade, cream, band);
  base = mix(base * mix(uPopCool, vec3(1.0), sat(N.y * 0.6 + 0.66)), base, band);
  float crevice = sat(crease * (1.0 - band * 0.45));
  // Crevices stay a tint rather than a dark line, so strong flavors still look puffed and airy.
  base = mix(base, deep, crevice * 0.62);
  base = mix(base, hull, smoothstep(0.3, 0.85, core));
  flavorEffect(wave > 0.5 ? uEffect.y : uEffect.x, base, N, V, P, band, shadow);
  // A bright band rides the leading edge of a new flavor as it spreads.
  float front = smoothstep(0.42, 0.0, abs(length(P.xz - uWave.xy) - uWave.z)) * step(0.0, uWave.z);
  base += cream * front * 0.3;
  base *= mix(vec3(0.74, 0.54, 0.32), vec3(1.0), ao);

  // Light bleeding through thin puffs keeps the white from going chalky.
  float through = pow(sat(dot(V, -uSunDir + N * 0.45) * 0.5 + 0.5), 3.0);
  base += shade * through * 0.32 * (1.0 - core) * mix(0.5, 1.0, shadow);

  float ndv = sat(dot(N, V));
  vec3 H = normalize(uSunDir + V);
  float sheen = pow(sat(dot(N, H)), 22.0);
  base += cream * smoothstep(0.3, 0.8, sheen) * sheenAmount * shadow * (1.0 - crevice);
  float rim = pow(1.0 - ndv, 3.0) * sat(dot(N, uRimDir) * 0.8 + 0.4);
  base += uRimColor * rim * 0.6 * ao;
  base *= (uSunColor * 0.5 + 0.38) * mix(0.66, 1.0, pool);
  base += cream * lampDiffuse(P, N) * 0.42 * ao;
  if (uFrenzy > 0.0) {
    // Frenzy: buttery warmth and a glitter of sugar that sparkles on and off.
    base *= mix(vec3(1.0), vec3(1.08, 1.0, 0.86), uFrenzy);
    // Cells of a few pixels, so the glitter is the same size in every scene.
    float grain = hash31(vec3(floor(gl_FragCoord.xy / 3.0), floor(uTime * 7.0)));
    base += vec3(1.4, 1.1, 0.6) * step(0.985, grain) * uFrenzy * mix(0.5, 1.0, shadow) * (1.0 - crevice);
  }

  // The unpopped kernel: glossy amber that heats up before it bursts.
  float kernelBand = toonBand(min(sat(ndl * 0.5 + 0.5), mix(0.25, 1.0, shadow)));
  vec3 kernel = mix(uKernel * vec3(0.5, 0.26, 0.2), uKernel * 1.12, kernelBand);
  // The pale germ at the tip; a dark spot here would read as an eye.
  kernel = mix(kernel, uKernel * vec3(1.15, 1.2, 1.5) * mix(0.55, 1.0, kernelBand), smoothstep(0.0, 1.0, core) * 0.5);
  float glint = pow(sat(dot(N, H)), 90.0);
  kernel += vec3(1.0, 0.9, 0.7) * smoothstep(0.25, 0.55, glint) * 0.9;
  kernel += uRimColor * rim * 0.5;
  // Heat deepens the color instead of washing it out, so the swell stays a saturated ember.
  kernel = mix(kernel, kernel * vec3(1.05, 0.46, 0.14), glow * 0.9);
  kernel += vec3(0.95, 0.2, 0.015) * glow * (0.04 + 0.62 * pow(1.0 - ndv, 1.8));

  vec3 col = mix(kernel, base, smoothstep(0.12, 0.5, pop));
  // The burst itself is briefly hotter than the finished flake.
  col += vec3(1.0, 0.72, 0.4) * smoothstep(0.15, 0.45, pop) * glow * 0.9;
  return col;
}
`;

/**
 * Every flake shape shares one triangle list; its vertices come from an atlas texture, five rows per
 * shape: flake position, flake normal, kernel position, kernel normal, toast shading.
 */
const flakeAtlas = /* glsl */ `
uniform highp sampler2D tFlakes;
vec3 flakeRow(int shape, int row) { return texelFetch(tFlakes, ivec2(gl_VertexID, shape * 5 + row), 0).xyz; }
`;

const pieceVertex = /* glsl */ `
${flakeAtlas}
attribute vec4 iState;
varying vec3 vWorld, vNormal, vShade, vObject;
varying vec2 vPop;
varying float vGold;
varying mat3 vRotation;
void main() {
  int shape = int(iState.z + 0.5);
  vGold = iState.w;
  vec3 flakePos = flakeRow(shape, 0);
  float pop = iState.x;
  vec3 p = mix(flakeRow(shape, 2), flakePos, pop);
  vec3 n = normalize(mix(flakeRow(shape, 3), flakeRow(shape, 1), sat(pop * 1.6)));
  mat4 world = modelMatrix * instanceMatrix;
  vec4 wp = world * vec4(p, 1.0);
  vWorld = wp.xyz;
  mat3 normalMat = transpose(inverse(mat3(world)));
  vNormal = normalize(normalMat * n);
  vRotation = normalMat;
  vObject = flakePos;
  vShade = flakeRow(shape, 4);
  vPop = iState.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const pieceFragment = /* glsl */ `
varying vec3 vWorld, vNormal, vShade, vObject;
varying vec2 vPop;
varying float vGold;
varying mat3 vRotation;
void main() {
  vec3 N = normalize(vNormal);
  float puffed = smoothstep(0.2, 0.7, vPop.x) * (1.0 - vShade.y);
  vec3 g = puffGradient(vObject * 9.0);
  N = normalize(N - normalize(vRotation * g + 1e-5) * min(length(g), 3.0) * 0.1 * puffed);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float shadow = sunShadow(vWorld, N);
  vec3 col = popcornShade(N, V, vWorld, vShade.x, vShade.y, vPop.x, vPop.y, shadow, 1.0 - vShade.x * 0.3);
  if (vGold > 0.5) {
    // Gold leaf: the piece's own light and shade, recolored, with a hard bright sheen.
    float light = dot(col, vec3(0.3, 0.55, 0.15));
    float sheen = pow(sat(dot(N, normalize(uSunDir + V))), 30.0);
    col = vec3(1.0, 0.72, 0.2) * (0.3 + 1.3 * light) + vec3(1.0, 0.92, 0.6) * smoothstep(0.2, 0.6, sheen) * 1.4 * mix(0.4, 1.0, shadow);
  }
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

const pieceDepthVertex = /* glsl */ `
${flakeAtlas}
attribute vec4 iState;
void main() {
  int shape = int(iState.z + 0.5);
  vec3 p = mix(flakeRow(shape, 2), flakeRow(shape, 0), iState.x);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}
`;

const pilePars = /* glsl */ `
uniform sampler2D uPileTex, uPileCliff;
uniform vec2 uPileMin;
uniform float uPileSize, uPileTexel;
// Grid points land exactly on texel centers, so a drop stays one cell wide.
vec2 pileUv(vec2 xz) { return (xz - uPileMin) / uPileSize * (1.0 - uPileTexel) + 0.5 * uPileTexel; }
// Rise over run of the resting heap, stored up to CLIFF_RANGE in pile.ts. Popcorn cannot stand
// steeper than a couple of units, so more than that is the grid bridging a rim or a table edge.
float pileCliff(vec2 uv) { return textureLod(uPileCliff, uv, 0.0).r * 6.0; }
// True for a grid cell that only spans a drop. Judged per whole cell from its four corners,
// so the heap ends in a clean line instead of slivers climbing up the wall behind it.
bool pileBridge(vec2 uv) {
  ivec2 size = textureSize(uPileTex, 0);
  ivec2 c = clamp(ivec2(floor(uv * vec2(size) - 0.5)), ivec2(0), size - 2);
  float cliff = 0.0, low = 1e9, high = -1e9;
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    ivec2 t = c + ivec2(x, y);
    cliff = max(cliff, texelFetch(uPileCliff, t, 0).r * 6.0);
    float h = texelFetch(uPileTex, t, 0).r;
    low = min(low, h);
    high = max(high, h);
  }
  return cliff > 2.2 && high - low > uPileSize * uPileTexel * 1.05;
}
`;

const surfaceVertex = /* glsl */ `
${pilePars}
${flakeAtlas}
uniform float uPieceK;
attribute float iShape;
attribute vec4 iPlace, iQuat;
varying vec3 vWorld, vLocal, vNormal, vShade, vPileNormal;
varying float vBury, vDepth, vTone;
vec3 rotateQ(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec2 uv = pileUv(iPlace.xy);
  vec4 h = textureLod(uPileTex, uv, 0.0);
  float e = uPileTexel * 2.0;
  float dx = textureLod(uPileTex, uv + vec2(e, 0.0), 0.0).r - textureLod(uPileTex, uv - vec2(e, 0.0), 0.0).r;
  float dz = textureLod(uPileTex, uv + vec2(0.0, e), 0.0).r - textureLod(uPileTex, uv - vec2(0.0, e), 0.0).r;
  vPileNormal = normalize(vec3(-dx, uPileSize * e * 2.0, -dz));
  float depth = h.r - h.b;
  vDepth = depth;
  vTone = fract(iPlace.x * 13.7 + iPlace.y * 7.3);
  float reveal = smoothstep(0.0, 0.1 * uPieceK, depth);
  float jiggle = h.g;
  float scale = iPlace.w * reveal * h.a * (1.0 + jiggle * 0.5) * (1.0 - smoothstep(2.0, 2.6, pileCliff(uv)));
  vec4 q = normalize(iQuat + vec4(jiggle * sin(iPlace.x * 31.0 + uTime * 26.0) * 0.7, 0.0, jiggle * cos(iPlace.y * 29.0 + uTime * 23.0) * 0.7, 0.0));
  int shape = int(iShape + 0.5);
  vec3 p = rotateQ(q, flakeRow(shape, 0) * scale);
  vec3 wp = vec3(iPlace.x, h.r + iPlace.z + jiggle * 0.05 * uPieceK, iPlace.y) + p;
  vLocal = wp;
  vWorld = (modelMatrix * vec4(wp, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * rotateQ(q, flakeRow(shape, 1)));
  vPileNormal = normalize(mat3(modelMatrix) * vPileNormal);
  vShade = flakeRow(shape, 4);
  vBury = iPlace.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const surfaceFragment = /* glsl */ `
uniform float uPieceK;
varying vec3 vWorld, vLocal, vNormal, vShade, vPileNormal;
varying float vBury, vDepth, vTone;
void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  if (dist < 24.0 * uPieceK) {
    vec3 g = puffGradient(vLocal * 42.0 / uPieceK);
    N = normalize(N - normalize(g + 1e-5) * min(length(g), 3.0) * 0.07 * (1.0 - vShade.y));
  }
  // Leaning every flake toward the heap normal makes the whole mound read as one lit form.
  vec3 lightN = normalize(N * 0.7 + normalize(vPileNormal) * 0.62);
  float shadow = sunShadow(vWorld + vPileNormal * 0.1 * uPieceK, vPileNormal);
  // Flakes seated deeper in the heap sit in each other's shade.
  float ao = smoothstep(-0.11, 0.02, vBury / uPieceK) * (1.0 - vShade.x * 0.3);
  ao *= mix(0.62, 1.0, smoothstep(0.0, 0.42, vDepth / uPieceK));
  vec3 col = popcornShade(lightN, V, vWorld, vShade.x, vShade.y, 1.0, 0.0, shadow, ao);
  col *= mix(vec3(1.0, 0.91, 0.78), vec3(1.05, 1.03, 1.0), vTone);
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

const heapVertex = /* glsl */ `
${pilePars}
uniform float uPieceK;
varying vec3 vWorld;
varying vec2 vXZ;
void main() {
  vec2 xz = position.xz;
  vec4 h = textureLod(uPileTex, pileUv(xz), 0.0);
  vec4 wp = modelMatrix * vec4(xz.x, h.r - 0.03 * uPieceK, xz.y, 1.0);
  vWorld = wp.xyz;
  vXZ = xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const heapFragment = /* glsl */ `
${pilePars}
uniform float uLumpScale, uPieceK;
varying vec3 vWorld;
varying vec2 vXZ;
float pileHeight(vec2 uv) { return texture2D(uPileTex, uv).r; }
void main() {
  vec2 uv = pileUv(vXZ);
  vec4 h = texture2D(uPileTex, uv);
  if (h.r - h.b < 0.015 * uPieceK || pileBridge(uv)) discard;
  float e = uPileTexel;
  float world = uPileSize * e * 2.0;
  vec3 N = normalize(vec3(pileHeight(uv - vec2(e, 0.0)) - pileHeight(uv + vec2(e, 0.0)), world, pileHeight(uv - vec2(0.0, e)) - pileHeight(uv + vec2(0.0, e))));

  // Far away the heap is only this pattern, so it must still read as separate puffs.
  // Projecting along the dominant axis keeps it from stretching down steep slopes;
  // where two projections meet, the seam reads as one more crack between puffs.
  vec3 facing = abs(N);
  vec2 sheet = facing.y > 0.62 ? vXZ : facing.x > facing.z ? vec2(vXZ.y, h.r) : vec2(vXZ.x, h.r);
  vec2 p = sheet * uLumpScale / uPieceK + 0.35 * vec2(vnoise(sheet * 3.1 / uPieceK), vnoise(sheet * 3.1 / uPieceK + 9.0));
  vec2 w = worley(p);
  float puff = sat(1.0 - w.x * 1.1);
  float gap = smoothstep(0.0, 0.34, w.y - w.x);
  vec2 q = vec2(worley(p + vec2(0.05, 0.0)).x - w.x, worley(p + vec2(0.0, 0.05)).x - w.x) * 7.0;
  N = normalize(N + vec3(q.x, 0.0, q.y) * 0.7);

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float shadow = sunShadow(vWorld + vec3(0.0, 0.06 * uPieceK, 0.0), N);
  // The heap under the flakes stays toasted and dark, so gaps read as depth.
  float crease = 0.55 + (1.0 - gap) * 0.25 + (1.0 - puff) * 0.25;
  vec3 col = popcornShade(N, V, vWorld, sat(crease), 0.0, 1.0, 0.0, shadow, mix(0.08, 0.5, puff));
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

const heapDepthVertex = /* glsl */ `
${pilePars}
varying vec2 vXZ;
void main() {
  vec2 xz = position.xz;
  vXZ = xz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(xz.x, textureLod(uPileTex, pileUv(xz), 0.0).r, xz.y, 1.0);
}
`;

// Bare ground must cast nothing, or the grid would throw a jagged skirt around every wall.
const heapDepthFragment = /* glsl */ `
${pilePars}
uniform float uPieceK;
varying vec2 vXZ;
void main() {
  vec2 uv = pileUv(vXZ);
  vec4 h = texture2D(uPileTex, uv);
  if (h.r - h.b < 0.015 * uPieceK || pileBridge(uv)) discard;
  gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}
`;

const sharedUniforms = { ...globals, ...popcornUniforms };
const hash31 = 'float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n';
const fragmentHead = `${GLSL_UTIL}\n${hash31}${GLSL_LIGHT_PARS}\n${shading}\n`;

/**
 * The popcorn lighting model, for other surfaces that must read as the same popcorn (the drifts
 * on the planet). Needs GLSL_UTIL, hash31 and GLSL_LIGHT_PARS before it, and popcornUniforms.
 */
export const POPCORN_SHADING = shading;
const depthFragment = SHADOW_DEPTH_FRAGMENT;
const satDefine = '#define sat(x) clamp(x, 0.0, 1.0)\n';

export interface PieceMaterials {
  piece: THREE.ShaderMaterial;
  pieceDepth: THREE.ShaderMaterial;
}

export interface PileMaterials {
  surface: THREE.ShaderMaterial;
  heap: THREE.ShaderMaterial;
  heapDepth: THREE.ShaderMaterial;
}

let shared: PieceMaterials | null = null;

/** The near-camera flake atlas; the batches fill it in when they are first built. */
export const pieceAtlas = { value: null as THREE.Texture | null };
/** The heap-surface flake atlas, shared by every heap. */
export const surfaceAtlas = { value: null as THREE.Texture | null };

export function pieceMaterials(): PieceMaterials {
  shared ??= {
    piece: new THREE.ShaderMaterial({
      name: 'popcorn-piece',
      vertexShader: satDefine + pieceVertex,
      fragmentShader: fragmentHead + pieceFragment,
      uniforms: { ...sharedUniforms, tFlakes: pieceAtlas },
    }),
    pieceDepth: new THREE.ShaderMaterial({
      name: 'popcorn-piece-depth',
      vertexShader: pieceDepthVertex,
      fragmentShader: depthFragment,
      uniforms: { tFlakes: pieceAtlas },
    }),
  };
  return shared;
}

export function createPileMaterials(own: PileUniforms): PileMaterials {
  const uniforms = { ...sharedUniforms, ...own, tFlakes: surfaceAtlas };
  return {
    surface: new THREE.ShaderMaterial({
      name: 'popcorn-surface',
      vertexShader: `uniform float uTime;\n${surfaceVertex}`,
      fragmentShader: fragmentHead + surfaceFragment,
      uniforms,
    }),
    heap: new THREE.ShaderMaterial({
      name: 'popcorn-heap',
      vertexShader: heapVertex,
      fragmentShader: fragmentHead + heapFragment,
      uniforms,
    }),
    heapDepth: new THREE.ShaderMaterial({
      name: 'popcorn-heap-depth',
      vertexShader: heapDepthVertex,
      fragmentShader: heapDepthFragment,
      uniforms,
    }),
  };
}

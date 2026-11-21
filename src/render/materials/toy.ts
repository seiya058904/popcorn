import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_INSTANCE_WORLD, GLSL_LIGHT_PARS, GLSL_RIG_SKIP, GLSL_UTIL, SHADOW_DEPTH_FRAGMENT } from './glsl.ts';

const toyVertex = /* glsl */ `
attribute vec4 aMat, aMat2, aMat3;
attribute float aTint;
varying vec3 vWorld, vNormal, vColor, vLocal;
varying vec4 vMat, vMat2, vMat3;
${GLSL_INSTANCE_WORLD}
void main() {
  mat4 world = worldMatrixOf();
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLocal = position;
  vNormal = normalize(transpose(inverse(mat3(world))) * normal);
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= mix(vec3(1.0), instanceColor, aTint);
  #endif
  vMat = aMat;
  vMat2 = aMat2;
  vMat3 = aMat3;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const toyFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
varying vec3 vWorld, vNormal, vColor, vLocal;
varying vec4 vMat, vMat2, vMat3;

float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3d(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), u.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

// Patterns laid on a surface pick the two axes that run along it; level is 1 on tops and bottoms.
vec2 alongSurface(vec3 q, float level) {
  return level > 0.5 ? q.xz : vec2(q.x + q.z, q.y);
}

// Surface relief painted per pixel. Returns height; tone scales the paint.
float surfacePattern(float id, vec3 q, float level, inout float tone, inout float finest) {
  float h = 0.0;
  if (id < 1.5) { // brushed metal
    finest = 70.0;
    h = noise3d(q * vec3(2.0, 70.0, 70.0));
    tone = 0.96 + h * 0.08;
  } else if (id < 2.5) { // baked enamel, a faint orange peel
    finest = 46.0;
    h = noise3d(q * 20.0) * 0.6 + noise3d(q * 46.0) * 0.4;
  } else if (id < 3.5) { // wood grain
    finest = 50.0;
    float rings = length(q.xz * vec2(1.0, 0.32)) * 20.0 + noise3d(q * vec3(1.6, 0.5, 1.6)) * 7.0;
    float g = 0.5 + 0.5 * sin(rings);
    float fiber = noise3d(q * vec3(50.0, 3.0, 50.0));
    tone = mix(0.76, 1.08, g) * (0.94 + fiber * 0.12);
    h = g * 0.45 + fiber * 0.55;
  } else if (id < 4.5) { // brick courses
    finest = 12.0;
    float v = q.y / 0.17;
    float row = floor(v);
    float u = (q.x + q.z) / 0.4 + mod(row, 2.0) * 0.5;
    vec2 cell = vec2(fract(u), fract(v));
    vec2 edge = min(cell, 1.0 - cell) / vec2(1.0, 0.42);
    float brick = smoothstep(0.03, 0.09, min(edge.x, edge.y));
    float shade = hash21(vec2(floor(u), row));
    tone = mix(1.32, 0.86 + shade * 0.26, brick) * (0.95 + noise3d(q * 18.0) * 0.1);
    h = brick * (0.9 + noise3d(q * 30.0) * 0.1);
  } else if (id < 5.5) { // woven cloth
    finest = 80.0;
    float a = sin(q.x * 80.0 + q.z * 80.0), b = sin(q.y * 80.0);
    tone = 0.95 + 0.05 * a * b;
    h = 0.5 + 0.25 * (a + b);
  } else if (id < 6.5) { // pebbled rubber
    finest = 54.0;
    h = noise3d(q * 54.0);
    tone = 0.97 + h * 0.05;
  } else if (id < 7.5) { // painted plaster: soft mottling, so large walls are never one flat color
    finest = 34.0;
    tone = 0.95 + noise3d(q * 2.4) * 0.07 + noise3d(q * 9.0) * 0.03;
    h = noise3d(q * 34.0);
  } else if (id < 8.5) { // knurling: two sets of diagonal grooves
    finest = 64.0;
    float a = abs(sin((q.x + q.y + q.z) * 64.0));
    float b = abs(sin((q.x - q.y + q.z * 0.5) * 64.0));
    h = a * b;
    tone = 0.82 + 0.24 * h;
  } else if (id < 9.5) { // perforated sheet: staggered round holes
    vec2 g = alongSurface(q, level) * 18.0;
    g.x += mod(floor(g.y), 2.0) * 0.5;
    float d = length(fract(g) - 0.5);
    float hole = 1.0 - smoothstep(0.24, 0.31, d);
    finest = 20.0;
    tone = mix(1.0, 0.16, hole);
    h = 1.0 - hole;
  } else if (id < 10.5) { // tread plate: lozenges turning a quarter from cell to cell
    vec2 g = alongSurface(q, level) * 9.0;
    vec2 c = fract(g) - 0.5;
    float turn = mod(floor(g.x) + floor(g.y), 2.0);
    vec2 r = turn < 0.5 ? vec2(c.x + c.y, c.x - c.y) : vec2(c.x - c.y, c.x + c.y);
    float lozenge = 1.0 - smoothstep(0.1, 0.16, length(vec2(r.x * 0.32, r.y)));
    finest = 12.0;
    tone = 0.94 + lozenge * 0.12;
    h = lozenge;
  } else if (id < 11.5) { // glaze: pooled color and a fine crackle
    finest = 16.0;
    float crackle = 1.0 - smoothstep(0.0, 0.035, abs(noise3d(q * 13.0) - 0.5));
    tone = 0.96 + noise3d(q * 2.5) * 0.08 - crackle * 0.07;
    h = noise3d(q * 6.0) * 0.4 - crackle * 0.3;
  } else if (id < 12.5) { // leather: pebbled grain over soft creases
    finest = 44.0;
    float grain = 1.0 - abs(noise3d(q * 44.0) * 2.0 - 1.0);
    tone = 0.9 + noise3d(q * 5.0) * 0.12 + grain * 0.05;
    h = grain * 0.7 + noise3d(q * 9.0) * 0.3;
  } else { // paper: fibers and a slightly uneven press
    finest = 56.0;
    tone = 0.95 + noise3d(q * vec3(56.0, 9.0, 56.0)) * 0.06 + noise3d(q * 3.0) * 0.04;
    h = noise3d(q * 56.0) * 0.5;
  }
  return h;
}

vec3 bumped(vec3 N, vec3 P, float h, float amount) {
  vec3 dx = dFdx(P), dy = dFdy(P);
  vec3 r1 = cross(dy, N), r2 = cross(N, dx);
  float det = dot(dx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * amount;
  return normalize(abs(det) * N - g);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float gloss = vMat.x, emissive = vMat.y, ao = vMat.z;
  float metal = vMat2.x, coat = vMat2.y, wear = vMat2.w;
  vec3 albedo = vColor;
  if (emissive > 1.5) {
    // Part of a light group. Switched off, a window or bulb is dark, glossy glass; a painted
    // part (group numbers past 40) just stops glowing.
    float code = floor(emissive * 0.5);
    float painted = step(40.5, code);
    float lit = uLit[int(code - painted * 40.0) - 1];
    emissive = (emissive - code * 2.0) * lit;
    float glass = (1.0 - painted) * (1.0 - lit);
    albedo *= mix(vec3(1.0), vec3(0.3, 0.34, 0.42), glass);
    gloss = mix(gloss, 0.9, glass);
  }

  // Curvature in the model's own units: a bevel catches light at any distance.
  float curve = length(fwidth(N)) / (length(fwidth(vLocal)) + 1e-5);
  float edge = smoothstep(5.0, 16.0, curve);

  float code = vMat2.z;
  if (code > 0.5) {
    float id = floor(code);
    float scale = pow(2.0, fract(code) * 6.0 - 3.0);
    vec3 q = vLocal * scale;
    float tone = 1.0, finest = 40.0;
    float h = surfacePattern(id, q, step(0.7, abs(N.y)), tone, finest);
    // Relief finer than a pixel would only shimmer, so it fades out with distance. It is gone well
    // before half a cycle per pixel, or glossy paint in strong sun glitters with it.
    float visible = smoothstep(0.42, 0.1, length(fwidth(q)) * finest);
    albedo *= mix(1.0, tone, max(visible, 0.45));
    float relief = id < 1.5 ? 0.0012
      : id > 3.5 && id < 4.5 ? 0.012
      : id > 9.5 && id < 10.5 ? 0.007
      : id > 10.5 && id < 11.5 ? 0.0008
      : id > 12.5 ? 0.0008
      : 0.004;
    N = bumped(N, vLocal, h, relief * visible / scale);
  }
  if (wear > 0.0) {
    float scuff = smoothstep(0.42, 0.72, noise3d(vLocal * 9.0));
    albedo = mix(albedo, albedo * 1.2 + vec3(0.07, 0.06, 0.05), edge * scuff * wear);
    gloss *= 1.0 - edge * scuff * wear * 0.4;
  }

  float velvet = max(vMat3.y, 0.0), neon = step(vMat3.y, -0.5), soft = vMat3.z, smudge = vMat3.w;
  if (smudge > 0.0) {
    // Fingerprints and wiped streaks: patches of duller gloss that break up a mirror finish.
    float print = smoothstep(0.42, 0.78, noise3d(vLocal * 7.0 + noise3d(vLocal * 2.3) * 1.8));
    gloss *= 1.0 - smudge * print * 0.5;
    albedo *= 1.0 - smudge * print * 0.05;
  }

  float shadow = sunShadow(vWorld, N);
  vec3 col = surfaceLight(albedo, N, V, vWorld, gloss, ao, shadow, metal, coat);
  float ndv = sat(dot(N, V));
  if (velvet > 0.0) {
    // Pile catches light at grazing angles and swallows it face on.
    float graze = pow(1.0 - ndv, 2.2);
    vec3 fiber = mix(albedo, vec3(1.0), 0.3);
    vec3 around = ambientLight(N) + uSunColor * sat(dot(N, uSunDir) * 0.5 + 0.5) * mix(0.35, 1.0, shadow) * 0.6;
    col = col * mix(1.0, 0.72, velvet * (1.0 - graze)) + fiber * around * graze * velvet * 0.85;
  }
  if (soft > 0.0) {
    // Soft vinyl: light creeps a little way into the shade, warm where it turns away.
    float ndl = dot(N, uSunDir);
    float edgeGlow = sat(1.0 - abs(ndl + 0.1) * 2.2);
    col += albedo * uSunColor * vec3(1.0, 0.62, 0.5) * edgeGlow * soft * 0.22 * mix(0.5, 1.0, shadow);
  }
  // A thin highlight along every bevel, which is what makes small parts look machined.
  vec3 R = reflect(-V, N);
  if (edge > 0.002) col += (envRadiance(R, 0.3) + uSunColor * 0.35) * edge * mix(0.03, 0.2, max(gloss, metal)) * mix(0.4, 1.0, ao);
  col = mix(col, albedo * (1.0 + emissive * 1.6), sat(emissive));
  // A lit tube is white-hot along its middle; its color lives in the glow around it.
  if (neon > 0.5) col += mix(albedo, vec3(1.0), 0.75) * pow(ndv, 2.5) * sat(emissive) * 1.4;
  float mirror = coat * smoothstep(0.75, 0.97, N.y) * (0.22 + 0.78 * pow(1.0 - ndv, 3.0));
  // Alpha carries how much screen-space reflection this pixel wants.
  gl_FragColor = vec4(applyFog(col, dist), 1.0 - mirror);
}
`;

const outlineVertex = /* glsl */ `
attribute vec4 aMat;
attribute float aTint;
uniform vec2 uResolution;
uniform float uOutlinePx, uOutlineRefDist;
varying vec3 vColor;
varying float vDist;
${GLSL_INSTANCE_WORLD}
${GLSL_RIG_SKIP}
void main() {
  mat4 world = worldMatrixOf();
  vec4 wp = world * vec4(position, 1.0);
  vec3 wn = normalize(transpose(inverse(mat3(world))) * normal);
  vec4 clip = projectionMatrix * viewMatrix * wp;
  vec2 dir = (projectionMatrix * viewMatrix * vec4(wn, 0.0)).xy;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(0.0);
  float scale = clamp(uOutlineRefDist / clip.w, 0.4, 1.35);
  float px = uOutlinePx * aMat.w * scale * step(0.001, aMat.w);
  clip.xy += dir * px * 2.0 / uResolution * clip.w;
  clip.z += 0.00025 * clip.w;
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= mix(vec3(1.0), instanceColor, aTint);
  #endif
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = clip;
  RIG_SKIP(aPart.y)
}
`;

const outlineFragment = /* glsl */ `
uniform vec3 uFogColor;
uniform vec2 uFogRange;
varying vec3 vColor;
varying float vDist;
void main() {
  // A thin line in a deep shade of the local paint: a seam, not a cartoon contour.
  vec3 ink = vColor * 0.3 + vec3(0.016, 0.01, 0.014);
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(ink, uFogColor, f), 1.0);
}
`;

const depthVertex = /* glsl */ `
${GLSL_INSTANCE_WORLD}
${GLSL_RIG_SKIP}
void main() {
  gl_Position = projectionMatrix * viewMatrix * worldMatrixOf() * vec4(position, 1.0);
  RIG_SKIP(aPart.z)
}
`;

const glassVertex = /* glsl */ `
attribute vec4 aMat, aMat2;
varying vec3 vWorld, vNormal, vColor, vLocal;
varying float vThickness, vLens, vViewDepth;
${GLSL_INSTANCE_WORLD}
void main() {
  mat4 world = worldMatrixOf();
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLocal = position;
  vNormal = normalize(transpose(inverse(mat3(world))) * normal);
  vColor = color;
  vThickness = aMat.x * length(world[1].xyz);
  vLens = aMat2.x;
  vec4 view = viewMatrix * wp;
  vViewDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const glassVaryings = /* glsl */ `
varying vec3 vWorld, vNormal, vColor, vLocal;
varying float vThickness, vLens, vViewDepth;
`;

/** The simple glass of the lower quality tiers: reflections over a slight veil, in one draw. */
const glassFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
${glassVaryings}
void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float ndv = sat(dot(N, V));
  float fresnel = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 reflected = envRadiance(R, 0.03) + uSunColor * studioSoft(R, 0.05) * 1.4 + lampSheen(vWorld, N, V, 0.08);
  float thick = pow(1.0 - ndv, 2.0);
  vec3 col = reflected * fresnel + vColor * (0.025 + thick * 0.16);
  float alpha = sat(0.1 + thick * 0.42 + fresnel * 0.7);
  // Premultiplied: the reflection adds light while the tint only slightly veils what is behind.
  gl_FragColor = vec4(applyFog(col, dist), alpha);
}
`;

const refractionPars = /* glsl */ `
uniform sampler2D tSceneColor, tSceneDepth;
uniform float uDispersion, uBlurPx;
uniform vec2 uSceneSize, uNearFar, uFocus;
uniform mat4 uViewProjection;

float sceneDepth(vec2 uv) {
  float d = textureLod(tSceneDepth, uv, 0.0).r * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - d * (uNearFar.y - uNearFar.x));
}
`;

/**
 * What is seen through the glass. Each piece writes depth, so only the nearest pane survives:
 * adding every pane up would show the things behind a display case twice.
 */
const glassBodyFragment = /* glsl */ `
${GLSL_UTIL}
${refractionPars}
${glassVaryings}
const float IOR = 1.5;

// Follows one ray through the glass and returns where on screen it comes out.
vec2 throughGlass(vec3 N, vec3 I, float eta, float gap, vec2 here) {
  vec3 T = refract(I, N, eta);
  float along = max(dot(T, -N), 0.25);
  // A pane hands the ray back parallel but shifted; a curved piece keeps it bent.
  vec3 exitPoint = vWorld + T * vThickness / along;
  vec3 hit = exitPoint + normalize(mix(I, T, vLens)) * gap;
  vec4 clip = uViewProjection * vec4(hit, 1.0);
  vec2 uv = clamp(clip.xy / clip.w * 0.5 + 0.5, vec2(0.001), vec2(0.999));
  // Whatever stands in front of the glass cannot be seen through it, so the ray eases back
  // toward the straight view as it nears such a thing. A hard switch would leave a torn edge.
  float inFront = vViewDepth - sceneDepth(uv);
  return mix(uv, here, smoothstep(-vThickness, vThickness * 2.0, inFront));
}

vec3 texel(vec2 uv) { return min(textureLod(tSceneColor, uv, 0.0).rgb, vec3(6.0)); }

// The same focus falloff as the depth of field, which cannot reach what glass has moved.
float blurAmount(float z) {
  float d = z - uFocus.x;
  return clamp(((d > 0.0 ? d : -d * 0.45) - uFocus.y * 0.35) / uFocus.y, 0.0, 1.0);
}

vec3 sceneAt(vec2 uv) {
  float z = sceneDepth(uv);
  float coc = blurAmount(z);
  float radius = coc * smoothstep(0.02, 0.4, coc) * uBlurPx;
  vec3 sum = texel(uv);
  float weight = 1.0;
  if (radius >= 0.5) {
    for (int i = 1; i <= 8; i++) {
      float t = sqrt(float(i) / 8.0);
      float a = float(i) * 2.39996323;
      vec2 q = uv + vec2(cos(a), sin(a)) * t * radius / uSceneSize;
      // Something sharp in front must not bleed into the soft background behind it.
      float nearer = sceneDepth(q);
      float w = nearer < z - 0.15 ? blurAmount(nearer) : 1.0;
      sum += texel(q) * w;
      weight += w;
    }
  }
  return sum / weight;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = sat(dot(N, V));
  float fresnel = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec2 here = gl_FragCoord.xy / uSceneSize;
  // Hand-poured glass is never quite flat.
  vec3 ripple = vec3(sin(vLocal.y * 23.0 + vLocal.x * 7.0), sin(vLocal.x * 19.0 - vLocal.z * 11.0), sin(vLocal.z * 21.0 + vLocal.y * 5.0));
  vec3 bent = normalize(N + ripple * 0.012);
  vec3 I = -V;
  float gap = clamp(sceneDepth(here) - vViewDepth, 0.0, vThickness * 16.0);
  float eta = 1.0 / IOR;
  vec3 through;
  if (uDispersion > 0.5) {
    through = vec3(
      sceneAt(throughGlass(bent, I, eta * 1.012, gap, here)).r,
      sceneAt(throughGlass(bent, I, eta, gap, here)).g,
      sceneAt(throughGlass(bent, I, eta * 0.988, gap, here)).b
    );
  } else {
    through = sceneAt(throughGlass(bent, I, eta, gap, here));
  }
  // The longer the path through the glass, the more of its color the light picks up.
  float thick = pow(1.0 - ndv, 2.0);
  vec3 tint = pow(max(vColor, vec3(0.02)), vec3(0.16 + thick * 1.5));
  // Alpha 2 tells the later passes this pixel is glass: no focus blur, no floor reflection.
  gl_FragColor = vec4(through * tint * (1.0 - fresnel), 2.0);
}
`;

/** Reflections off every pane, near and far, added over what the glass let through. */
const glassSurfaceFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
${refractionPars}
${glassVaryings}
void main() {
  // Depth testing is off here, because the nearest pane has already written its depth.
  if (vViewDepth > sceneDepth(gl_FragCoord.xy / uSceneSize) + vThickness * 0.5) discard;
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float ndv = sat(dot(N, V));
  float fresnel = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 reflected = envRadiance(R, 0.03) + uSunColor * studioSoft(R, 0.05) * 1.4 + lampSheen(vWorld, N, V, 0.08);
  float thick = pow(1.0 - ndv, 2.0);
  float fog = sat((dist - uFogRange.x) / (uFogRange.y - uFogRange.x));
  gl_FragColor = vec4((reflected * fresnel + vColor * thick * 0.05) * (1.0 - fog * fog * (3.0 - 2.0 * fog)), 0.0);
}
`;

export interface ToyMaterials {
  body: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
  depth: THREE.ShaderMaterial;
  glass: THREE.ShaderMaterial;
  glassBody: THREE.ShaderMaterial;
  glassSurface: THREE.ShaderMaterial;
}

/** What glass needs to know about the picture behind it; the stage fills these in each frame. */
export const glassUniforms = {
  tSceneColor: { value: null as THREE.Texture | null },
  tSceneDepth: { value: null as THREE.Texture | null },
  uSceneSize: { value: new THREE.Vector2(1, 1) },
  uNearFar: { value: new THREE.Vector2(0.5, 120) },
  uViewProjection: { value: new THREE.Matrix4() },
  uDispersion: { value: 0 },
  /** Distance in focus and how quickly focus falls off. */
  uFocus: { value: new THREE.Vector2(10, 3) },
  uBlurPx: { value: 0 },
};

let shared: ToyMaterials | null = null;

export function toyMaterials(): ToyMaterials {
  shared ??= makeToyMaterials({}, {});
  return shared;
}

/**
 * The same materials for one part rig. They compile to the shared programs; only the texture that
 * holds the rig's part matrices is its own.
 */
export function rigToyMaterials(parts: THREE.Texture): ToyMaterials {
  return makeToyMaterials({ tParts: { value: parts } }, { USE_PART_RIG: '' });
}

/** Ink materials are recognized by this flag, whichever rig they belong to. */
export const isInk = (material: THREE.Material | THREE.Material[]): boolean => !Array.isArray(material) && material.userData.ink === true;

function makeToyMaterials(extra: Record<string, THREE.IUniform>, defines: Record<string, string>): ToyMaterials {
  const uniforms = { ...globals, ...extra };
  const outline = new THREE.ShaderMaterial({
    name: 'toy-outline',
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    uniforms,
    defines,
    vertexColors: true,
    side: THREE.BackSide,
  });
  outline.userData.ink = true;
  return {
    body: new THREE.ShaderMaterial({
      name: 'toy',
      vertexShader: toyVertex,
      fragmentShader: toyFragment,
      uniforms,
      defines,
      vertexColors: true,
    }),
    outline,
    depth: new THREE.ShaderMaterial({
      name: 'toy-depth',
      vertexShader: depthVertex,
      // The depth also goes into a color copy that the soft shadows read without comparing.
      fragmentShader: SHADOW_DEPTH_FRAGMENT,
      uniforms: extra,
      defines,
      // Back faces in the shadow map remove self-shadow streaks on grazing walls.
      side: THREE.BackSide,
    }),
    glass: new THREE.ShaderMaterial({
      name: 'toy-glass',
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      uniforms,
      defines,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      // The destination alpha holds the reflection mask and must survive.
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
    glassBody: new THREE.ShaderMaterial({
      name: 'toy-glass-body',
      vertexShader: glassVertex,
      fragmentShader: glassBodyFragment,
      uniforms: { ...uniforms, ...glassUniforms },
      defines,
      vertexColors: true,
      blending: THREE.NoBlending,
    }),
    glassSurface: new THREE.ShaderMaterial({
      name: 'toy-glass-surface',
      vertexShader: glassVertex,
      fragmentShader: glassSurfaceFragment,
      uniforms: { ...uniforms, ...glassUniforms },
      defines,
      vertexColors: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  };
}

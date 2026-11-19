import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_INSTANCE_WORLD, GLSL_LIGHT_PARS, GLSL_UTIL } from './glsl.ts';

const toyVertex = /* glsl */ `
attribute vec4 aMat, aMat2;
attribute float aTint;
varying vec3 vWorld, vNormal, vColor, vLocal;
varying vec4 vMat, vMat2;
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
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const toyFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
varying vec3 vWorld, vNormal, vColor, vLocal;
varying vec4 vMat, vMat2;

float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3d(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), u.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

// Surface relief painted per pixel. Returns height; tone scales the paint.
float surfacePattern(float id, vec3 q, inout float tone, inout float finest) {
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
  } else { // painted plaster: soft mottling, so large walls are never one flat color
    finest = 34.0;
    tone = 0.95 + noise3d(q * 2.4) * 0.07 + noise3d(q * 9.0) * 0.03;
    h = noise3d(q * 34.0);
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

  // Curvature in the model's own units: a bevel catches light at any distance.
  float curve = length(fwidth(N)) / (length(fwidth(vLocal)) + 1e-5);
  float edge = smoothstep(5.0, 16.0, curve);

  float code = vMat2.z;
  if (code > 0.5) {
    float id = floor(code);
    float scale = pow(2.0, fract(code) * 6.0 - 3.0);
    vec3 q = vLocal * scale;
    float tone = 1.0, finest = 40.0;
    float h = surfacePattern(id, q, tone, finest);
    // Relief finer than a pixel would only shimmer, so it fades out with distance.
    float visible = smoothstep(0.7, 0.18, length(fwidth(q)) * finest);
    albedo *= mix(1.0, tone, max(visible, 0.45));
    N = bumped(N, vLocal, h, (id > 3.5 && id < 4.5 ? 0.012 : 0.004) * visible / scale);
  }
  if (wear > 0.0) {
    float scuff = smoothstep(0.42, 0.72, noise3d(vLocal * 9.0));
    albedo = mix(albedo, albedo * 1.2 + vec3(0.07, 0.06, 0.05), edge * scuff * wear);
    gloss *= 1.0 - edge * scuff * wear * 0.4;
  }

  float shadow = sunShadow(vWorld, N);
  vec3 col = surfaceLight(albedo, N, V, vWorld, gloss, ao, shadow, metal, coat);
  // A thin highlight along every bevel, which is what makes small parts look machined.
  vec3 R = reflect(-V, N);
  col += (envColor(R) + uSunColor * 0.35) * edge * mix(0.03, 0.2, max(gloss, metal)) * mix(0.4, 1.0, ao);
  col = mix(col, albedo * (1.0 + emissive * 1.6), sat(emissive));
  float ndv = sat(dot(N, V));
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
void main() { gl_Position = projectionMatrix * viewMatrix * worldMatrixOf() * vec4(position, 1.0); }
`;

const glassVertex = /* glsl */ `
varying vec3 vWorld, vNormal, vColor;
${GLSL_INSTANCE_WORLD}
void main() {
  mat4 world = worldMatrixOf();
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(transpose(inverse(mat3(world))) * normal);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const glassFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
varying vec3 vWorld, vNormal, vColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float ndv = sat(dot(N, V));
  float fresnel = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 reflected = envColor(R) + uSunColor * studioSoft(R, 0.05) * 1.4 + lampSheen(vWorld, N, V, 0.08);
  float thick = pow(1.0 - ndv, 2.0);
  vec3 col = reflected * fresnel + vColor * (0.025 + thick * 0.16);
  float alpha = sat(0.07 + thick * 0.28 + fresnel * 0.7);
  // Premultiplied: the reflection adds light while the tint only slightly veils what is behind.
  gl_FragColor = vec4(applyFog(col, dist), alpha);
}
`;

export interface ToyMaterials {
  body: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
  depth: THREE.ShaderMaterial;
  glass: THREE.ShaderMaterial;
}

let shared: ToyMaterials | null = null;

export function toyMaterials(): ToyMaterials {
  if (shared) return shared;
  shared = {
    body: new THREE.ShaderMaterial({
      name: 'toy',
      vertexShader: toyVertex,
      fragmentShader: toyFragment,
      uniforms: globals,
      vertexColors: true,
    }),
    outline: new THREE.ShaderMaterial({
      name: 'toy-outline',
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      uniforms: globals,
      vertexColors: true,
      side: THREE.BackSide,
    }),
    depth: new THREE.ShaderMaterial({
      name: 'toy-depth',
      vertexShader: depthVertex,
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
      colorWrite: false,
      // Back faces in the shadow map remove self-shadow streaks on grazing walls.
      side: THREE.BackSide,
    }),
    glass: new THREE.ShaderMaterial({
      name: 'toy-glass',
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      uniforms: globals,
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
  };
  return shared;
}

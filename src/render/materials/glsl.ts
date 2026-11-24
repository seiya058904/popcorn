/** Shared GLSL. All colors are linear; tone mapping happens once, in the composite pass. */

export const GLSL_UTIL = /* glsl */ `
#define sat(x) clamp(x, 0.0, 1.0)
const float PI = 3.14159265;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

// Distance to the nearest cell point and to the second nearest: the puffy popcorn pattern.
vec2 worley(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float a = 8.0, b = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < a) { b = a; a = d; } else if (d < b) { b = d; }
  }
  return sqrt(vec2(a, b));
}

// Same as worley(), also returning the vector to the nearest cell center for analytic bump normals.
vec2 worleyGrad(vec2 p, out vec2 bestR) {
  vec2 n = floor(p), f = fract(p);
  float a = 8.0, b = 8.0;
  bestR = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < a) { b = a; a = d; bestR = r; } else if (d < b) { b = d; }
  }
  return sqrt(vec2(a, b));
}
`;

export const GLSL_FOG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform vec2 uFogRange;

vec3 applyFog(vec3 color, float dist) {
  float f = sat((dist - uFogRange.x) / (uFogRange.y - uFogRange.x));
  return mix(color, uFogColor, f * f * (3.0 - 2.0 * f));
}
`;

export const GLSL_SUN = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uShadeTint, uSkyColor, uGroundColor, uRimColor, uRimDir;
uniform float uPoolFloor;
uniform vec4 uPool;

// The key light falls off like a stage spot, which keeps the eye on the popcorn.
float lightPool(vec3 P) {
  float d = length((P - uPool.xyz) * vec3(1.0, 0.45, 1.0));
  return mix(uPoolFloor, 1.0, smoothstep(uPool.w * 1.5, uPool.w * 0.4, d));
}

// Three soft painted bands, with a little continuous shading left in for richness.
float toonBand(float w) {
  float stepped = smoothstep(0.30, 0.36, w) * 0.5 + smoothstep(0.60, 0.66, w) * 0.5;
  return mix(w, stepped, 0.72);
}
`;

export const GLSL_SHADOW = /* glsl */ `
uniform highp sampler2DShadow uShadowMap;
uniform highp sampler2D uShadowDepth;
uniform mat4 uShadowMatrix;
uniform float uShadowTexel, uShadowSoftness, uShadowOffset;
uniform vec4 uShadowPenumbra;

// Precomputed 8-tap Vogel blocker-search disk and 11-tap isotropic Poisson PCF disk (+ center = 12).
// Rotating per pixel with Interleaved Gradient Noise breaks up cross-hatch artifacts on small parts.
const vec2 BLOCKER_DISK[8] = vec2[8](
  vec2( 0.2500,  0.0000),
  vec2(-0.3193,  0.2925),
  vec2( 0.0493, -0.5568),
  vec2( 0.4090,  0.5197),
  vec2(-0.7351, -0.1516),
  vec2( 0.6744, -0.4824),
  vec2(-0.2367,  0.8698),
  vec2(-0.3886, -0.8879)
);

const vec2 PCF_DISK[11] = vec2[11](
  // Stage-1 cardinal ring (4 balanced quadrants) for conservative early-out check.
  vec2( 0.7200,  0.1900),
  vec2(-0.1900,  0.7200),
  vec2(-0.7200, -0.1900),
  vec2( 0.1900, -0.7200),
  // Stage-2 remaining 7 Poisson taps for smooth penumbra edges.
  vec2( 0.2900,  0.2200),
  vec2(-0.3600,  0.1400),
  vec2( 0.0800, -0.3900),
  vec2( 0.8900, -0.3700),
  vec2(-0.8800,  0.3800),
  vec2( 0.4200,  0.8600),
  vec2(-0.4400, -0.8400)
);

float sunShadow(vec3 worldPos, vec3 N) {
  float slope = 1.0 - sat(dot(N, uSunDir));
  vec4 c = uShadowMatrix * vec4(worldPos + N * uShadowOffset * (2.3 + 5.5 * slope), 1.0);
  vec3 p = c.xyz / c.w;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - 0.0006;
  // Interleaved Gradient Noise per-pixel rotation trades stair-steps and hatching for fine grain.
  float a = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ca = cos(a), sa = sin(a);
  mat2 rot = mat2(ca, sa, -sa, ca);

  float penumbra = uShadowSoftness;
  float blockers = -1.0;
  if (uShadowPenumbra.x >= 0.5) {
    float sum = 0.0, count = 0.0;
    mat2 reach = rot * (uShadowTexel * uShadowPenumbra.w);
    for (int i = 0; i < 8; i++) {
      float d = textureLod(uShadowDepth, p.xy + reach * BLOCKER_DISK[i], 0.0).r;
      if (d < z) { sum += d; count += 1.0; }
    }
    blockers = count;
    if (count >= 0.5) {
      penumbra = clamp((z - sum / count) * uShadowPenumbra.y, uShadowPenumbra.z, uShadowPenumbra.w);
    }
  }

  mat2 turn = rot * (uShadowTexel * penumbra);
  float s = texture(uShadowMap, vec3(p.xy, z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[0], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[1], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[2], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[3], z));

  // Conservative two-stage early-out: only exit when blocker search AND 5-tap PCF agree completely,
  // preserving thin rods and wheel spokes while skipping 7 taps across open sunlight and deep umbra.
  if (blockers >= 0.0) {
    if (blockers < 0.5 && s >= 4.99) return 1.0;
    if (blockers > 7.5 && s <= 0.01) return 0.0;
  }

  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[4], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[5], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[6], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[7], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[8], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[9], z));
  s += texture(uShadowMap, vec3(p.xy + turn * PCF_DISK[10], z));
  return s / 12.0;
}
`;

export const GLSL_ENV = /* glsl */ `
uniform vec3 uEnvTop, uEnvHorizon, uEnvBottom;
uniform samplerCube uEnvA, uEnvB;
uniform float uEnvMix, uEnvOn, uEnvGain, uEnvDiffuse;
uniform vec3 uAmbientCube[6];
uniform vec4 uBounce;
uniform vec3 uBounceColor;

// Studio softboxes evaluated analytically: the glossy reflections that make enamel read as a toy.
float softRect(vec2 p, vec2 center, vec2 half_, float edge) {
  vec2 d = abs(p - center) - half_;
  return smoothstep(edge, 0.0, max(d.x, d.y));
}

float studioSoft(vec3 R, float edge) {
  float light = 0.0;
  if (R.y > 0.02) {
    vec2 q = R.xz / R.y;
    light += softRect(q, vec2(0.25, 0.1), vec2(0.62, 0.36), edge);
    light += 0.45 * softRect(q, vec2(-1.5, -0.4), vec2(0.2, 0.9), edge * 1.15);
  }
  if (R.x > 0.02) {
    vec2 q = R.zy / R.x;
    light += 0.4 * softRect(q, vec2(0.1, 0.45), vec2(0.5, 0.16), edge * 0.85);
  }
  return light;
}

float studioReflection(vec3 R) {
  return studioSoft(R, 0.12);
}

vec3 envColor(vec3 R) {
  vec3 above = mix(uEnvHorizon, uEnvTop, smoothstep(0.0, 0.75, R.y));
  return mix(above, uEnvBottom, smoothstep(0.0, -0.55, R.y));
}

// The captured room in direction R, blurred for a roughness. The mip follows three's PMREM:
// the inverse of PMREMGenerator.lodToRoughness over its five levels.
vec3 probeRadiance(vec3 R, float rough) {
  float r = sat(rough);
  float lod = 5.0 * r * (2.0 - r);
  vec3 a = textureLod(uEnvA, R, lod).rgb;
  // Away from a change of look, one capture is all there is to read.
  vec3 b = uEnvMix > 0.002 ? textureLod(uEnvB, R, lod).rgb : a;
  return min(mix(a, b, uEnvMix), vec3(12.0)) * uEnvGain;
}

// What a shiny surface sees: the room itself once its probe is ready, the painted gradient before.
vec3 envRadiance(vec3 R, float rough) {
  vec3 painted = envColor(R);
  if (uEnvOn <= 0.0) return painted;
  return mix(painted, probeRadiance(R, rough), uEnvOn);
}

// The room's soft light from each of six sides, read once from the roughest level of the capture.
vec3 roomAmbient(vec3 N) {
  vec3 n2 = N * N;
  return n2.x * (N.x > 0.0 ? uAmbientCube[0] : uAmbientCube[1])
    + n2.y * (N.y > 0.0 ? uAmbientCube[2] : uAmbientCube[3])
    + n2.z * (N.z > 0.0 ? uAmbientCube[4] : uAmbientCube[5]);
}

// Soft fill from all around: part painted, part the light the room really bounces about.
vec3 ambientLight(vec3 N) {
  vec3 hemi = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  if (uEnvOn <= 0.0) return hemi;
  return mix(hemi, roomAmbient(N) * (0.55 * uEnvGain), uEnvOn * uEnvDiffuse);
}

// The heap is the brightest thing in the picture: it fills the faces turned toward it.
vec3 heapBounce(vec3 P, vec3 N) {
  if (uBounce.w <= 0.0) return vec3(0.0);
  vec3 L = uBounce.xyz - P;
  float d = length(L);
  float fall = sat(1.0 - d / uBounce.w);
  return uBounceColor * fall * fall * sat(dot(N, L / max(d, 1e-4)) * 0.75 + 0.25);
}
`;

export const GLSL_LAMPS = /* glsl */ `
#define MAX_LAMPS 16
uniform vec4 uLampPos[MAX_LAMPS];
uniform vec3 uLampColor[MAX_LAMPS];
uniform int uLampCount;

// Geometric specular antialiasing (after Kaplanyan 2016): where the normal turns within a pixel,
// the highlight widens instead of sparkling.
float filteredRough(vec3 N, float rough) {
  vec3 dn = fwidth(N);
  return sqrt(sat(rough * rough + min(dot(dn, dn) * 2.0, 0.18)));
}

float ggx(float ndh, float a) {
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-5);
}

// Local lights: broad wrapped diffuse for colored spill on anything nearby.
vec3 lampDiffuse(vec3 P, vec3 N) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < uLampCount; i++) {
    vec3 L = uLampPos[i].xyz - P;
    float r = uLampPos[i].w;
    float d2 = dot(L, L);
    float fall = sat(1.0 - d2 / (r * r));
    if (fall <= 0.0) continue;
    sum += uLampColor[i] * fall * fall * sat(dot(N, L / sqrt(d2 + 1e-4)) * 0.7 + 0.3);
  }
  return sum;
}

vec3 lampSheen(vec3 P, vec3 N, vec3 V, float rough) {
  vec3 sum = vec3(0.0);
  float a = max(rough * rough, 0.012);
  for (int i = 0; i < uLampCount; i++) {
    vec3 L = uLampPos[i].xyz - P;
    float r = uLampPos[i].w;
    float d2 = dot(L, L);
    float fall = sat(1.0 - d2 / (r * r));
    if (fall <= 0.0) continue;
    L /= sqrt(d2 + 1e-4);
    float ndl = dot(N, L);
    if (ndl <= 0.0) continue;
    sum += uLampColor[i] * fall * fall * ndl * min(ggx(sat(dot(N, normalize(L + V))), a) * 0.25, 6.0);
  }
  return sum;
}

// Both of the above in one pass over the lamps, for surfaces that want both.
void lampLight(vec3 P, vec3 N, vec3 V, float rough, out vec3 diffuse, out vec3 sheen) {
  diffuse = vec3(0.0);
  sheen = vec3(0.0);
  float a = max(rough * rough, 0.012);
  for (int i = 0; i < uLampCount; i++) {
    vec3 L = uLampPos[i].xyz - P;
    float r = uLampPos[i].w;
    float d2 = dot(L, L);
    float fall = sat(1.0 - d2 / (r * r));
    if (fall <= 0.0) continue;
    L /= sqrt(d2 + 1e-4);
    float ndl = dot(N, L);
    vec3 light = uLampColor[i] * fall * fall;
    diffuse += light * sat(ndl * 0.7 + 0.3);
    if (ndl > 0.0) sheen += light * ndl * min(ggx(sat(dot(N, normalize(L + V))), a) * 0.25, 6.0);
  }
}
`;

export const GLSL_SURFACE = /* glsl */ `
uniform float uLit[40];

// Painted bands stay as a soft undertone; metal, enamel and lacquer respond like real materials.
vec3 surfaceLight(vec3 albedo, vec3 N, vec3 V, vec3 P, float gloss, float ao, float shadow, float metal, float coat) {
  float ndl = dot(N, uSunDir);
  float w = sat(ndl * 0.5 + 0.5);
  float lit = min(w, mix(0.22, 1.0, shadow));
  float band = mix(lit, toonBand(lit), 0.5);
  float pool = lightPool(P);
  vec3 sun = uSunColor * pool;
  vec3 paint = albedo * (1.0 - metal * 0.94);
  vec3 shade = paint * uShadeTint * mix(0.72, 1.0, pool);
  vec3 mid = paint * mix(uShadeTint, sun, 0.62);
  vec3 light = paint * sun;
  vec3 col = band < 0.5 ? mix(shade, mid, band * 2.0) : mix(mid, light, band * 2.0 - 1.0);

  float rough = filteredRough(N, mix(0.6, 0.07, gloss));
  vec3 lampSpill, lampGloss;
  lampLight(P, N, V, rough, lampSpill, lampGloss);
  vec3 hemi = ambientLight(N);
  col += paint * (hemi + lampSpill + heapBounce(P, N)) * ao;
  col *= mix(0.55, 1.0, ao);

  float ndv = sat(dot(N, V));
  float fresnel = pow(1.0 - ndv, 5.0);
  vec3 F0 = mix(vec3(0.03 + 0.1 * gloss), albedo, metal);
  vec3 F = F0 + (vec3(1.0) - F0) * fresnel * mix(0.35, 1.0, gloss);
  vec3 R = reflect(-V, N);
  float occlusion = mix(0.35, 1.0, ao);
  float boxes = studioSoft(R, mix(0.05, 0.42, rough)) * mix(0.3, 1.0, shadow);
  // Rough surfaces gather their reflection from nearer the normal, as three's PMREM sampling does.
  vec3 Rr = normalize(mix(R, N, rough * rough * rough * rough));
  col += (envRadiance(Rr, rough) * mix(0.55, 1.0, gloss) + sun * boxes * 1.25) * F * occlusion;
  // Bare metal never falls to pure black: a room always has something for it to reflect.
  col += albedo * metal * (hemi * 0.9 + sun * 0.09) * occlusion;
  if (coat > 0.0) {
    float coatF = 0.04 + 0.96 * fresnel;
    col += (envRadiance(R, filteredRough(N, 0.05)) + sun * studioSoft(R, 0.05) * mix(0.3, 1.0, shadow)) * coatF * coat * occlusion;
  }

  vec3 H = normalize(uSunDir + V);
  float a = max(rough * rough, 0.012);
  col += sun * F * min(ggx(sat(dot(N, H)), a) * 0.25, 7.0) * sat(ndl) * shadow;
  col += lampGloss * F * 2.0;

  float rim = pow(1.0 - ndv, 3.0) * sat(dot(N, uRimDir) * 0.8 + 0.35);
  col += uRimColor * rim * mix(0.45, 1.0, ao) * 0.75;
  return col;
}

vec3 toyLight(vec3 albedo, vec3 N, vec3 V, vec3 P, float gloss, float ao, float shadow) {
  return surfaceLight(albedo, N, V, P, gloss, ao, shadow, 0.0, 0.0);
}
`;

export const GLSL_LIGHT_PARS = `${GLSL_FOG}\n${GLSL_SUN}\n${GLSL_SHADOW}\n${GLSL_ENV}\n${GLSL_LAMPS}\n${GLSL_SURFACE}`;

/** Signed cofactor normal matrix: exact replacement for transpose(inverse(m)) without full 3x3 inverse. */
export const GLSL_NORMAL_MAT = /* glsl */ `
mat3 adjugate3(mat3 m) {
  vec3 c0 = cross(m[1], m[2]);
  vec3 c1 = cross(m[2], m[0]);
  vec3 c2 = cross(m[0], m[1]);
  float det = dot(m[0], c0);
  float inv = abs(det) > 1e-12 ? 1.0 / det : 0.0;
  return mat3(c0, c1, c2) * inv;
}
`;

/** Every shadow caster writes its depth as a color too: see penumbraTexels. */
export const SHADOW_DEPTH_FRAGMENT = 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }';

/**
 * Where a vertex sits in the world. A part rig draws many moving parts in one call: every vertex
 * says which part it belongs to, and each copy's part matrices are read from a small float texture
 * laid out one copy per row, four texels (the matrix columns) per part.
 */
export const GLSL_INSTANCE_WORLD = /* glsl */ `
#ifdef USE_PART_RIG
  // x: part index, y: 1 if the part is outlined, z: 1 if it casts a shadow.
  attribute vec3 aPart;
  uniform highp sampler2D tParts;
#endif
mat4 worldMatrixOf() {
  #ifdef USE_PART_RIG
    int x = int(aPart.x + 0.5) * 4;
    int y = gl_InstanceID;
    return modelMatrix * mat4(
      texelFetch(tParts, ivec2(x, y), 0),
      texelFetch(tParts, ivec2(x + 1, y), 0),
      texelFetch(tParts, ivec2(x + 2, y), 0),
      texelFetch(tParts, ivec2(x + 3, y), 0)
    );
  #elif defined(USE_INSTANCING)
    return modelMatrix * instanceMatrix;
  #else
    return modelMatrix;
  #endif
}
`;

/**
 * Parts left out of a pass collapse to a point outside the view, so they cost no pixels at all.
 * Used as the last statement of main(), after every varying has been written.
 */
export const GLSL_RIG_SKIP = /* glsl */ `
#ifdef USE_PART_RIG
  #define RIG_SKIP(flag) if (flag < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
#else
  #define RIG_SKIP(flag)
#endif
`;

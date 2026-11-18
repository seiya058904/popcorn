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
`;

export const GLSL_LIGHT_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uShadeTint, uSkyColor, uGroundColor, uRimColor, uRimDir, uFogColor;
uniform vec2 uFogRange;
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowTexel, uShadowSoftness, uPoolFloor;
uniform vec4 uPool;

// The key light falls off like a stage spot, which keeps the eye on the popcorn.
float lightPool(vec3 P) {
  float d = length((P - uPool.xyz) * vec3(1.0, 0.45, 1.0));
  return mix(uPoolFloor, 1.0, smoothstep(uPool.w * 1.5, uPool.w * 0.4, d));
}

float sunShadow(vec3 worldPos, vec3 N) {
  float slope = 1.0 - sat(dot(N, uSunDir));
  vec4 c = uShadowMatrix * vec4(worldPos + N * (0.012 + 0.03 * slope), 1.0);
  vec3 p = c.xyz / c.w;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float r = uShadowTexel * uShadowSoftness;
  float z = p.z - 0.0006;
  float s = texture(uShadowMap, vec3(p.xy, z)) * 2.0;
  s += texture(uShadowMap, vec3(p.xy + vec2( 0.92,  0.38) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-0.38,  0.92) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-0.92, -0.38) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2( 0.38, -0.92) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2( 0.48,  0.14) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-0.14,  0.48) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-0.48, -0.14) * r, z));
  s += texture(uShadowMap, vec3(p.xy + vec2( 0.14, -0.48) * r, z));
  return s / 10.0;
}

vec3 applyFog(vec3 color, float dist) {
  float f = sat((dist - uFogRange.x) / (uFogRange.y - uFogRange.x));
  return mix(color, uFogColor, f * f * (3.0 - 2.0 * f));
}

// Three soft painted bands, with a little continuous shading left in for richness.
float toonBand(float w) {
  float stepped = smoothstep(0.30, 0.36, w) * 0.5 + smoothstep(0.60, 0.66, w) * 0.5;
  return mix(w, stepped, 0.72);
}

// Studio softboxes evaluated analytically: the glossy reflections that make enamel read as a toy.
float softRect(vec2 p, vec2 center, vec2 half_, float edge) {
  vec2 d = abs(p - center) - half_;
  return smoothstep(edge, 0.0, max(d.x, d.y));
}

float studioReflection(vec3 R) {
  float light = 0.0;
  if (R.y > 0.02) {
    vec2 q = R.xz / R.y;
    light += softRect(q, vec2(0.25, 0.1), vec2(0.62, 0.36), 0.12);
    light += 0.45 * softRect(q, vec2(-1.5, -0.4), vec2(0.2, 0.9), 0.14);
  }
  if (R.x > 0.02) {
    vec2 q = R.zy / R.x;
    light += 0.4 * softRect(q, vec2(0.1, 0.45), vec2(0.5, 0.16), 0.1);
  }
  return light;
}

vec3 toyLight(vec3 albedo, vec3 N, vec3 V, vec3 P, float gloss, float ao, float shadow) {
  float ndl = dot(N, uSunDir);
  float w = sat(ndl * 0.5 + 0.5);
  float lit = min(w, mix(0.22, 1.0, shadow));
  float band = toonBand(lit);
  float pool = lightPool(P);
  vec3 sun = uSunColor * pool;
  vec3 shade = albedo * uShadeTint * mix(0.72, 1.0, pool);
  vec3 mid = albedo * mix(uShadeTint, sun, 0.62);
  vec3 light = albedo * sun;
  vec3 col = band < 0.5 ? mix(shade, mid, band * 2.0) : mix(mid, light, band * 2.0 - 1.0);

  vec3 hemi = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  col += albedo * hemi * ao;
  col *= mix(0.55, 1.0, ao);

  float ndv = sat(dot(N, V));
  float fresnel = pow(1.0 - ndv, 4.0);
  vec3 R = reflect(-V, N);
  float env = studioReflection(R) * mix(0.3, 1.0, shadow);
  col += sun * env * gloss * (0.16 + 0.75 * fresnel);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(sat(dot(N, H)), mix(24.0, 220.0, gloss));
  col += sun * smoothstep(0.35, 0.65, spec) * gloss * 0.55 * shadow;

  float rim = pow(1.0 - ndv, 3.0) * sat(dot(N, uRimDir) * 0.8 + 0.35);
  col += uRimColor * rim * mix(0.45, 1.0, ao);
  return col;
}
`;

/** Normal transform that stays correct under the non-uniform squash used everywhere. */
export const GLSL_INSTANCE_WORLD = /* glsl */ `
mat4 worldMatrixOf() {
  #ifdef USE_INSTANCING
    return modelMatrix * instanceMatrix;
  #else
    return modelMatrix;
  #endif
}
`;

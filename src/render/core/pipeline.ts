import * as THREE from 'three';
import type { QualitySettings } from './quality.ts';

export interface PostParams {
  exposure: number;
  contrast: number;
  saturation: number;
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  vignette: number;
  grain: number;
  bloom: number;
  focusDistance: number;
  focusRange: number;
  maxBlurPx: number;
  aoRadius: number;
  aoStrength: number;
  /** How far reflections search, in world units. */
  reflectionRange: number;
  aoTint: THREE.Color;
  flash: number;
  flashColor: THREE.Color;
  chroma: number;
  /** Radial screen distortion: uv center, ring radius, strength. */
  shock: THREE.Vector4;
}

export function defaultPostParams(): PostParams {
  return {
    exposure: 1,
    contrast: 1.04,
    saturation: 1.08,
    shadowTint: new THREE.Color(1, 1, 1),
    highlightTint: new THREE.Color(1, 1, 1),
    vignette: 0.32,
    grain: 0.012,
    bloom: 0.55,
    focusDistance: 10,
    focusRange: 3.2,
    maxBlurPx: 8,
    aoRadius: 0.42,
    aoStrength: 1,
    reflectionRange: 6,
    aoTint: new THREE.Color('#1c0f22'),
    flash: 0,
    flashColor: new THREE.Color(1, 0.95, 0.85),
    chroma: 0,
    shock: new THREE.Vector4(0.5, 0.5, 0, 0),
  };
}

const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const depthHelpers = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uNearFar, uProjScale, uProjShift;
float linearDepth(vec2 uv) {
  float d = textureLod(tDepth, uv, 0.0).r * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - d * (uNearFar.y - uNearFar.x));
}
vec3 viewPosition(vec2 uv) {
  float z = linearDepth(uv);
  return vec3((uv * 2.0 - 1.0 + uProjShift) / uProjScale * z, -z);
}
`;

const aoFragment = /* glsl */ `
${depthHelpers}
uniform float uRadius;
uniform vec2 uPixel;
varying vec2 vUv;
const int TAPS = 18;
void main() {
  vec3 P = viewPosition(vUv);
  if (-P.z > uNearFar.y * 0.95) { gl_FragColor = vec4(1.0); return; }
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float angle = noise * 6.2831853;
  float pxRadius = uRadius * uProjScale.y * 0.5 / -P.z / uPixel.y;
  pxRadius = min(pxRadius, 90.0);
  float sum = 0.0;
  float r2 = uRadius * uRadius;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float a = angle + t * 43.98;
    // Every other tap stays close, for the tight dark line where things touch.
    bool contact = mod(float(i), 2.0) > 0.5;
    float reach = contact ? 0.26 : 1.0;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * t * pxRadius * reach * uPixel;
    vec3 v = viewPosition(uv) - P;
    float vv = dot(v, v);
    float falloff = max(0.0, 1.0 - vv / (r2 * reach * reach));
    sum += falloff * max(0.0, dot(v, N) / sqrt(vv + 1e-5) - 0.12) * (contact ? 1.25 : 1.0);
  }
  float ao = clamp(1.0 - 2.5 * sum / float(TAPS), 0.0, 1.0);
  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

const aoBlurFragment = /* glsl */ `
${depthHelpers}
uniform sampler2D tSource;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  float z = linearDepth(vUv);
  float sum = textureLod(tSource, vUv, 0.0).r, weight = 1.0;
  for (int i = -3; i <= 3; i++) {
    if (i == 0) continue;
    vec2 uv = vUv + uDirection * float(i);
    float w = exp(-abs(linearDepth(uv) - z) * 9.0) * (1.0 - abs(float(i)) / 4.5);
    sum += textureLod(tSource, uv, 0.0).r * w;
    weight += w;
  }
  gl_FragColor = vec4(vec3(sum / weight), 1.0);
}
`;

const dofFragment = /* glsl */ `
${depthHelpers}
uniform sampler2D tColor;
uniform vec2 uPixel;
uniform float uFocus, uRange, uMaxBlur;
varying vec2 vUv;
const int TAPS = 26;
// Things nearer than the focus stay sharper: the player's machines live there.
float cocAt(float z) { float d = z - uFocus; return clamp(((d > 0.0 ? d : -d * 0.45) - uRange * 0.35) / uRange, 0.0, 1.0); }
void main() {
  float zCenter = linearDepth(vUv);
  float center = cocAt(zCenter);
  vec3 sum = textureLod(tColor, vUv, 0.0).rgb;
  float weight = 1.0;
  float radius = center * uMaxBlur;
  for (int i = 1; i <= TAPS; i++) {
    float t = sqrt(float(i) / float(TAPS));
    float a = float(i) * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * t * max(radius, 1.0) * uPixel;
    float z = linearDepth(uv);
    // Something sharp in front must not bleed into the blurred background behind it.
    float w = z < zCenter - 0.15 ? cocAt(z) : 1.0;
    vec3 c = min(textureLod(tColor, uv, 0.0).rgb, vec3(6.0));
    sum += c * w;
    weight += w;
  }
  gl_FragColor = vec4(sum / weight, center);
}
`;

const reflectFragment = /* glsl */ `
${depthHelpers}
uniform sampler2D tColor;
uniform float uRange;
uniform vec3 uUp;
varying vec2 vUv;
const int STEPS = 26;
vec2 toUv(vec3 q) { return (q.xy / -q.z * uProjScale - uProjShift) * 0.5 + 0.5; }
void main() {
  float mask = 1.0 - textureLod(tColor, vUv, 0.0).a;
  if (mask < 0.02) { gl_FragColor = vec4(0.0); return; }
  vec3 P = viewPosition(vUv);
  // Only floors ask for reflections, so the surface normal is simply "up".
  vec3 N = uUp;
  vec3 V = normalize(P);
  vec3 R = reflect(V, N);
  float stride = uRange / float(STEPS);
  vec3 q = P + N * stride * 0.25;
  float found = 0.0;
  vec2 uv = vUv;
  float travelled = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float grow = stride * (1.0 + float(i) * 0.07);
    q += R * grow;
    travelled += grow;
    if (q.z > -0.02) break;
    uv = toUv(q);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float gap = -q.z - linearDepth(uv);
    if (gap > 0.0 && gap < grow * 2.5) {
      vec3 a = q - R * grow, b = q;
      for (int k = 0; k < 4; k++) {
        vec3 m = (a + b) * 0.5;
        if (-m.z - linearDepth(toUv(m)) > 0.0) b = m; else a = m;
      }
      uv = toUv(b);
      found = 1.0;
      break;
    }
  }
  vec2 border = min(uv, 1.0 - uv);
  float fade = found * smoothstep(0.0, 0.07, min(border.x, border.y)) * (1.0 - smoothstep(0.55, 1.0, travelled / (uRange * 1.9)));
  gl_FragColor = vec4(min(textureLod(tColor, uv, 0.0).rgb, vec3(6.0)), mask * fade);
}
`;

const prefilterFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uPixel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0,  1.0)).rgb;
  c = min(c * 0.25, vec3(8.0));
  float luma = max(c.r, max(c.g, c.b));
  float knee = 0.22, threshold = 1.02;
  float soft = clamp(luma - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, luma - threshold) / max(luma, 1e-4), 1.0);
}
`;

const downFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uPixel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSource, vUv).rgb * 4.0;
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const upFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uPixel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSource, vUv + uPixel * vec2(-2.0, 0.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2( 2.0, 0.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2(0.0, -2.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2(0.0,  2.0)).rgb;
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0, -1.0)).rgb * 2.0;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0, -1.0)).rgb * 2.0;
  c += texture2D(tSource, vUv + uPixel * vec2(-1.0,  1.0)).rgb * 2.0;
  c += texture2D(tSource, vUv + uPixel * vec2( 1.0,  1.0)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`;

const compositeFragment = /* glsl */ `
${depthHelpers}
uniform sampler2D tColor, tBloom, tAo, tBlur, tReflect;
uniform float uExposure, uContrast, uSaturation, uVignette, uGrain, uBloom, uTime, uFlash, uChroma, uAoStrength, uAspect;
uniform float uHasBlur, uHasAo, uHasReflect, uFocus, uRange;
uniform vec2 uMirrorPixel;
uniform vec3 uShadowTint, uHighlightTint, uFlashColor, uAoTint;
uniform vec4 uShock;
varying vec2 vUv;

// Khronos neutral tone mapping keeps candy colors true and only rolls off highlights.
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 sampleScene(vec2 uv) {
  vec4 scene = texture2D(tColor, uv);
  vec3 col = scene.rgb;
  if (uHasBlur > 0.5) {
    // Full-resolution depth decides the mix, so in-focus silhouettes stay crisp.
    float d = linearDepth(uv) - uFocus;
    float coc = clamp(((d > 0.0 ? d : -d * 0.45) - uRange * 0.35) / uRange, 0.0, 1.0);
    // Alpha above 1 marks refracting glass. What it shows no longer lines up with the depth
    // buffer, so it has done its own focus blur already.
    float glass = clamp(scene.a - 1.0, 0.0, 1.0);
    col = mix(col, texture2D(tBlur, uv).rgb, smoothstep(0.02, 0.4, coc) * (1.0 - glass));
  }
  return col;
}

void main() {
  vec2 uv = vUv;
  if (uShock.w != 0.0) {
    vec2 d = (uv - uShock.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    float ring = exp(-pow((r - uShock.z) * 9.0, 2.0));
    uv -= normalize(d + 1e-5) / vec2(uAspect, 1.0) * ring * uShock.w;
  }
  vec3 col;
  if (uChroma > 0.0) {
    vec2 off = (uv - 0.5) * uChroma;
    col = vec3(sampleScene(uv + off).r, sampleScene(uv).g, sampleScene(uv - off).b);
  } else {
    col = sampleScene(uv);
  }
  if (uHasReflect > 0.5) {
    // A small blur turns the reflection into a soft sheen on polished tile.
    vec4 mirror = texture2D(tReflect, uv) * 0.28;
    mirror += texture2D(tReflect, uv + uMirrorPixel * vec2(1.6, 0.7)) * 0.18;
    mirror += texture2D(tReflect, uv + uMirrorPixel * vec2(-1.6, -0.7)) * 0.18;
    mirror += texture2D(tReflect, uv + uMirrorPixel * vec2(0.7, -2.4)) * 0.18;
    mirror += texture2D(tReflect, uv + uMirrorPixel * vec2(-0.7, 2.4)) * 0.18;
    float amount = clamp(mirror.a, 0.0, 1.0);
    if (amount > 0.001) col = mix(col, mirror.rgb / max(mirror.a, 0.001) * amount + col * (1.0 - amount), amount);
  }
  if (uHasAo > 0.5) {
    float ao = texture2D(tAo, uv).r;
    ao = mix(1.0, ao, uAoStrength);
    col *= mix(uAoTint * 2.2, vec3(1.0), ao);
  }
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = neutral(col);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col *= mix(uShadowTint, uHighlightTint, smoothstep(0.0, 0.8, luma));
  col = mix(vec3(0.18), col, uContrast);

  vec2 v = (vUv - 0.5) * vec2(uAspect * 0.72, 1.0);
  float vig = smoothstep(0.32, 0.92, length(v));
  col *= 1.0 - vig * uVignette * vec3(0.92, 1.0, 0.94);
  col = mix(col, uFlashColor, uFlash);

  col = toSrgb(max(col, vec3(0.0)));
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Mip {
  down: THREE.WebGLRenderTarget;
  up: THREE.WebGLRenderTarget;
}

const hdrOptions: THREE.RenderTargetOptions = {
  type: THREE.HalfFloatType,
  format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  generateMipmaps: false,
};

export class PostPipeline {
  readonly params = defaultPostParams();
  private readonly renderer: THREE.WebGLRenderer;
  private quality: QualitySettings;
  private hdr!: THREE.WebGLRenderTarget;
  private aoA!: THREE.WebGLRenderTarget;
  private aoB!: THREE.WebGLRenderTarget;
  private blur!: THREE.WebGLRenderTarget;
  private mirror!: THREE.WebGLRenderTarget;
  private mips: Mip[] = [];
  private width = 0;
  private height = 0;

  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.Camera();
  private readonly quad: THREE.Mesh;

  private readonly depthUniforms = {
    tDepth: { value: null as THREE.Texture | null },
    uNearFar: { value: new THREE.Vector2(0.1, 200) },
    uProjScale: { value: new THREE.Vector2(1, 1) },
    uProjShift: { value: new THREE.Vector2(0, 0) },
  };
  private readonly aoMat = this.pass(aoFragment, { uRadius: { value: 0.4 }, uPixel: { value: new THREE.Vector2() } }, true);
  private readonly aoBlurMat = this.pass(aoBlurFragment, { tSource: { value: null }, uDirection: { value: new THREE.Vector2() } }, true);
  private readonly dofMat = this.pass(
    dofFragment,
    { tColor: { value: null }, uPixel: { value: new THREE.Vector2() }, uFocus: { value: 10 }, uRange: { value: 3 }, uMaxBlur: { value: 10 } },
    true,
  );
  private readonly reflectMat = this.pass(reflectFragment, { tColor: { value: null }, uRange: { value: 6 }, uUp: { value: new THREE.Vector3(0, 1, 0) } }, true);
  private readonly prefilterMat = this.pass(prefilterFragment, { tSource: { value: null }, uPixel: { value: new THREE.Vector2() } });
  private readonly downMat = this.pass(downFragment, { tSource: { value: null }, uPixel: { value: new THREE.Vector2() } });
  private readonly upMat = this.pass(upFragment, { tSource: { value: null }, uPixel: { value: new THREE.Vector2() } }, false, true);
  private readonly compositeMat = this.pass(
    compositeFragment,
    {
      tColor: { value: null },
      tBloom: { value: null },
      tAo: { value: null },
      tBlur: { value: null },
      tReflect: { value: null },
      uHasBlur: { value: 0 },
      uHasAo: { value: 0 },
      uHasReflect: { value: 0 },
      uMirrorPixel: { value: new THREE.Vector2() },
      uFocus: { value: 10 },
      uRange: { value: 3 },
      uExposure: { value: 1 },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uBloom: { value: 0 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uChroma: { value: 0 },
      uAoStrength: { value: 1 },
      uAspect: { value: 1 },
      uShadowTint: { value: new THREE.Color() },
      uHighlightTint: { value: new THREE.Color() },
      uFlashColor: { value: new THREE.Color() },
      uAoTint: { value: new THREE.Color() },
      uShock: { value: new THREE.Vector4() },
    },
    true,
  );

  constructor(renderer: THREE.WebGLRenderer, quality: QualitySettings) {
    this.renderer = renderer;
    this.quality = quality;
    this.quad = new THREE.Mesh(this.triangle(), this.compositeMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.disposeTargets();
    this.width = 0;
  }

  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.hdr;
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width * this.quality.renderScale));
    const h = Math.max(2, Math.round(height * this.quality.renderScale));
    if (w === this.width && h === this.height) return;
    this.disposeTargets();
    this.width = w;
    this.height = h;

    const depth = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    this.hdr = new THREE.WebGLRenderTarget(w, h, {
      ...hdrOptions,
      depthBuffer: true,
      depthTexture: depth,
      samples: this.quality.msaa,
    });
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    const aoOptions: THREE.RenderTargetOptions = { ...hdrOptions, type: THREE.UnsignedByteType };
    this.aoA = new THREE.WebGLRenderTarget(hw, hh, aoOptions);
    this.aoB = new THREE.WebGLRenderTarget(hw, hh, aoOptions);
    this.blur = new THREE.WebGLRenderTarget(hw, hh, hdrOptions);
    this.mirror = new THREE.WebGLRenderTarget(hw, hh, hdrOptions);
    this.mips = [];
    let mw = hw;
    let mh = hh;
    for (let level = 0; level < this.quality.bloomLevels; level += 1) {
      this.mips.push({
        down: new THREE.WebGLRenderTarget(mw, mh, hdrOptions),
        up: new THREE.WebGLRenderTarget(mw, mh, hdrOptions),
      });
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
    }
  }

  /** Runs every pass after the scene has been drawn into `sceneTarget`. */
  finish(camera: THREE.PerspectiveCamera, time: number, outputWidth: number, outputHeight: number): void {
    const p = this.params;
    const color = this.hdr.texture;
    const depthUniforms = this.depthUniforms;
    depthUniforms.tDepth.value = this.hdr.depthTexture;
    depthUniforms.uNearFar.value.set(camera.near, camera.far);
    const e = camera.projectionMatrix.elements;
    depthUniforms.uProjScale.value.set(e[0]!, e[5]!);
    depthUniforms.uProjShift.value.set(e[8]!, e[9]!);

    const hasAo = this.quality.ambientOcclusion && p.aoStrength > 0;
    if (hasAo) {
      const pixel = new THREE.Vector2(1 / this.aoA.width, 1 / this.aoA.height);
      this.aoMat.uniforms.uRadius!.value = p.aoRadius;
      this.aoMat.uniforms.uPixel!.value.copy(pixel);
      this.draw(this.aoMat, this.aoA);
      this.aoBlurMat.uniforms.tSource!.value = this.aoA.texture;
      this.aoBlurMat.uniforms.uDirection!.value.set(pixel.x, 0);
      this.draw(this.aoBlurMat, this.aoB);
      this.aoBlurMat.uniforms.tSource!.value = this.aoB.texture;
      this.aoBlurMat.uniforms.uDirection!.value.set(0, pixel.y);
      this.draw(this.aoBlurMat, this.aoA);
    }

    const hasBlur = this.quality.depthOfField && p.maxBlurPx > 0;
    if (hasBlur) {
      const u = this.dofMat.uniforms;
      u.tColor!.value = color;
      u.uPixel!.value.set(1 / this.width, 1 / this.height);
      u.uFocus!.value = p.focusDistance;
      u.uRange!.value = p.focusRange;
      u.uMaxBlur!.value = p.maxBlurPx * (this.height / 1080);
      this.draw(this.dofMat, this.blur);
    }

    if (this.quality.reflections) {
      this.reflectMat.uniforms.tColor!.value = color;
      this.reflectMat.uniforms.uRange!.value = p.reflectionRange;
      this.reflectMat.uniforms.uUp!.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      this.draw(this.reflectMat, this.mirror);
    }

    this.runBloom(color);

    const c = this.compositeMat.uniforms;
    c.tColor!.value = color;
    c.tBloom!.value = this.mips[0]!.up.texture;
    c.tAo!.value = this.aoA.texture;
    c.tBlur!.value = this.blur.texture;
    c.tReflect!.value = this.mirror.texture;
    c.uHasReflect!.value = this.quality.reflections ? 1 : 0;
    c.uMirrorPixel!.value.set(1 / this.mirror.width, 1 / this.mirror.height);
    c.uHasBlur!.value = hasBlur ? 1 : 0;
    c.uHasAo!.value = hasAo ? 1 : 0;
    c.uFocus!.value = p.focusDistance;
    c.uRange!.value = p.focusRange;
    c.uExposure!.value = p.exposure;
    c.uContrast!.value = p.contrast;
    c.uSaturation!.value = p.saturation;
    c.uVignette!.value = p.vignette;
    c.uGrain!.value = p.grain;
    c.uBloom!.value = p.bloom;
    c.uTime!.value = time;
    c.uFlash!.value = p.flash;
    c.uChroma!.value = p.chroma;
    c.uAoStrength!.value = p.aoStrength;
    c.uAspect!.value = outputWidth / outputHeight;
    c.uShadowTint!.value.copy(p.shadowTint);
    c.uHighlightTint!.value.copy(p.highlightTint);
    c.uFlashColor!.value.copy(p.flashColor);
    c.uAoTint!.value.copy(p.aoTint);
    c.uShock!.value.copy(p.shock);
    this.draw(this.compositeMat, null);
  }

  private runBloom(color: THREE.Texture): void {
    const mips = this.mips;
    this.prefilterMat.uniforms.tSource!.value = color;
    this.prefilterMat.uniforms.uPixel!.value.set(1 / this.width, 1 / this.height);
    this.draw(this.prefilterMat, mips[0]!.down);
    for (let level = 1; level < mips.length; level += 1) {
      const source = mips[level - 1]!.down;
      this.downMat.uniforms.tSource!.value = source.texture;
      this.downMat.uniforms.uPixel!.value.set(1 / source.width, 1 / source.height);
      this.draw(this.downMat, mips[level]!.down);
    }
    let source = mips[mips.length - 1]!.down;
    for (let level = mips.length - 2; level >= 0; level -= 1) {
      const target = mips[level]!;
      this.upMat.uniforms.tSource!.value = source.texture;
      this.upMat.uniforms.tBase!.value = target.down.texture;
      this.upMat.uniforms.uPixel!.value.set(0.5 / source.width, 0.5 / source.height);
      this.draw(this.upMat, target.up);
      source = target.up;
    }
    if (mips.length === 1) {
      this.upMat.uniforms.tSource!.value = mips[0]!.down.texture;
      this.upMat.uniforms.tBase!.value = mips[0]!.down.texture;
      this.draw(this.upMat, mips[0]!.up);
    }
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  private pass(
    fragment: string,
    uniforms: Record<string, THREE.IUniform>,
    useDepth = false,
    addBase = false,
  ): THREE.ShaderMaterial {
    const source = addBase
      ? fragment
          .replace('uniform sampler2D tSource;', 'uniform sampler2D tSource, tBase;')
          .replace('gl_FragColor = vec4(c / 12.0, 1.0);', 'gl_FragColor = vec4(c / 12.0 * 0.82 + texture2D(tBase, vUv).rgb, 1.0);')
      : fragment;
    return new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: source,
      uniforms: {
        ...uniforms,
        ...(useDepth ? this.depthUniforms : {}),
        ...(addBase ? { tBase: { value: null } } : {}),
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  private triangle(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return geometry;
  }

  private disposeTargets(): void {
    if (this.width === 0) return;
    this.hdr.depthTexture?.dispose();
    this.hdr.dispose();
    this.aoA.dispose();
    this.aoB.dispose();
    this.blur.dispose();
    this.mirror.dispose();
    for (const mip of this.mips) {
      mip.down.dispose();
      mip.up.dispose();
    }
  }
}

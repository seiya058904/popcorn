import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_FOG, GLSL_UTIL } from './glsl.ts';

/**
 * A painted sky that can change with the time of day: the view out of a window, or the dome over
 * the town. Colors are linear; the scene's story moves them along as it fills up.
 */
export interface SkyUniforms {
  uTop: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  /** Warm glow low in the sky, strongest toward uGlowAt; its strength is in uGlowAt.w. */
  uGlow: { value: THREE.Color };
  uGlowAt: { value: THREE.Vector4 };
  uStars: { value: number };
  uClouds: { value: number };
  uCloudColor: { value: THREE.Color };
  /** A sun or moon: x and y (a window's own units, or a direction's azimuth and height on the dome), radius, brightness. */
  uDisc: { value: THREE.Vector4 };
  uDiscColor: { value: THREE.Color };
  /** 1 paints craters on the disc, for a moon. */
  uCraters: { value: number };
  uBrightness: { value: number };
  /** Window only: the heights where the gradient starts and ends. */
  uRange: { value: THREE.Vector2 };
}

const vertex = /* glsl */ `
varying vec3 vLocal, vWorld;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_FOG}
uniform vec3 uTop, uHorizon, uGlow, uCloudColor, uDiscColor;
uniform vec4 uGlowAt, uDisc;
uniform float uStars, uClouds, uCraters, uBrightness;
uniform vec2 uRange;
varying vec3 vLocal, vWorld;

float cloudNoise(vec2 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 + 2.3) * 0.15;
}

void main() {
#ifdef DOME
  vec3 dir = normalize(vLocal);
  float height = sat(dir.y);
  // Stars and clouds are laid on the dome by azimuth and height.
  vec2 sky = vec2(atan(dir.z, dir.x) * 4.0, dir.y * 3.2);
  vec2 here = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
  float starScale = 60.0;
  float t = pow(sat((height - uRange.x) / (uRange.y - uRange.x)), 0.62);
#else
  float t = sat((vLocal.y - uRange.x) / (uRange.y - uRange.x));
  vec2 sky = vLocal.xy * 0.9;
  vec2 here = vLocal.xy;
  float starScale = 7.0;
  t = pow(t, 0.62);
#endif
  vec3 col = mix(uHorizon, uTop, t);
  // The low glow of a sunset, brightest under the sun and fading upward.
  float toward = exp(-length((here - uGlowAt.xy) * vec2(0.6, 1.4)) * 1.2);
  col += uGlow * uGlowAt.w * (1.0 - t) * (0.45 + toward);

  if (uClouds > 0.0) {
    vec2 drift = sky + vec2(uTime * 0.02, 0.0);
    float c = smoothstep(0.52, 0.72, cloudNoise(drift * vec2(0.8, 1.6)));
    // Lit from below by the low sun, a little darker on top.
    vec3 cloud = mix(uCloudColor, uCloudColor * 0.82 + uGlow * 0.3 * uGlowAt.w, smoothstep(0.55, 0.9, cloudNoise(drift * vec2(0.8, 1.6) + 0.05)));
    col = mix(col, cloud, c * uClouds * (1.0 - t * 0.5));
  }

  if (uStars > 0.0) {
    vec2 cell = floor(sky * starScale);
    vec2 inCell = fract(sky * starScale) - 0.5;
    vec2 seed = hash22(cell);
    float size = mix(0.04, 0.11, seed.x * seed.x);
    float star = smoothstep(size, size * 0.3, length(inCell - (seed - 0.5) * 0.7)) * step(0.72, seed.y);
    float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + seed.x * 3.0) + seed.y * 40.0);
    col += vec3(1.0, 0.95, 0.85) * star * twinkle * uStars * (0.4 + t) * 2.2;
  }

  if (uDisc.w > 0.0) {
    vec2 d = here - uDisc.xy;
    float r = length(d) / uDisc.z;
    float disc = smoothstep(1.0, 0.96, r);
    vec3 face = uDiscColor;
    if (uCraters > 0.5) {
      vec2 q = d / uDisc.z;
      float crater = smoothstep(0.3, 0.26, length(q - vec2(0.25, 0.36))) * 0.2
        + smoothstep(0.21, 0.18, length(q + vec2(0.38, 0.14))) * 0.2
        + smoothstep(0.17, 0.14, length(q - vec2(0.18, -0.5))) * 0.18;
      // Shaded toward one side, so the moon reads as a ball and not a coin.
      face *= (1.0 - crater) * mix(0.82, 1.08, sat(0.5 + q.x * 0.35 + q.y * 0.35));
    }
    col = mix(col, face * uDisc.w, disc);
    col += uDiscColor * uDisc.w * 0.18 * exp(-max(r - 1.0, 0.0) * 2.6) * (1.0 - disc);
  }

  col *= uBrightness;
#ifdef DOME
  // Only half the haze: the dome is the far distance already, and full fog would flatten it.
  col = mix(col, applyFog(col, length(cameraPosition - vWorld)), 0.45);
#endif
  gl_FragColor = vec4(col, 1.0);
}
`;

export function skyUniforms(): SkyUniforms {
  return {
    uTop: { value: new THREE.Color('#1d2466') },
    uHorizon: { value: new THREE.Color('#c8638b') },
    uGlow: { value: new THREE.Color('#ff9a5c') },
    uGlowAt: { value: new THREE.Vector4(0, -1, 0, 0) },
    uStars: { value: 0 },
    uClouds: { value: 0 },
    uCloudColor: { value: new THREE.Color('#ffffff') },
    uDisc: { value: new THREE.Vector4(0, 0, 0.5, 0) },
    uDiscColor: { value: new THREE.Color('#fff1c4') },
    uCraters: { value: 0 },
    uBrightness: { value: 1 },
    uRange: { value: new THREE.Vector2(-1, 1) },
  };
}

/** `dome`: an inside-out sphere around the scene instead of a flat pane facing +Z. */
export function skyMaterial(uniforms: SkyUniforms, dome: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: dome ? 'sky-dome' : 'sky-window',
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...globals, ...uniforms },
    defines: dome ? { DOME: '' } : {},
    side: dome ? THREE.BackSide : THREE.FrontSide,
  });
}

/** One time of day for a sky; the story blends between a few of these. */
export interface SkyLook {
  top: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  glow: THREE.ColorRepresentation;
  glowStrength: number;
  stars: number;
  clouds: number;
  cloud: THREE.ColorRepresentation;
  brightness: number;
}

const a = new THREE.Color();
const b = new THREE.Color();

/** Sets the sky partway between two looks. */
export function blendSky(uniforms: SkyUniforms, from: SkyLook, to: SkyLook, t: number): void {
  uniforms.uTop.value.copy(a.set(from.top)).lerp(b.set(to.top), t);
  uniforms.uHorizon.value.copy(a.set(from.horizon)).lerp(b.set(to.horizon), t);
  uniforms.uGlow.value.copy(a.set(from.glow)).lerp(b.set(to.glow), t);
  uniforms.uCloudColor.value.copy(a.set(from.cloud)).lerp(b.set(to.cloud), t);
  uniforms.uGlowAt.value.w = from.glowStrength + (to.glowStrength - from.glowStrength) * t;
  uniforms.uStars.value = from.stars + (to.stars - from.stars) * t;
  uniforms.uClouds.value = from.clouds + (to.clouds - from.clouds) * t;
  uniforms.uBrightness.value = from.brightness + (to.brightness - from.brightness) * t;
}

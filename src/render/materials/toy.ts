import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_INSTANCE_WORLD, GLSL_LIGHT_PARS, GLSL_UTIL } from './glsl.ts';

const toyVertex = /* glsl */ `
attribute vec4 aMat;
varying vec3 vWorld, vNormal, vColor;
varying vec4 vMat;
${GLSL_INSTANCE_WORLD}
void main() {
  mat4 world = worldMatrixOf();
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(transpose(inverse(mat3(world))) * normal);
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const toyFragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_LIGHT_PARS}
varying vec3 vWorld, vNormal, vColor;
varying vec4 vMat;
void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float gloss = vMat.x, emissive = vMat.y, ao = vMat.z;
  float shadow = sunShadow(vWorld, N);
  vec3 col = toyLight(vColor, N, V, vWorld, gloss, ao, shadow);
  col = mix(col, vColor * (1.0 + emissive * 1.6), sat(emissive));
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
}
`;

const outlineVertex = /* glsl */ `
attribute vec4 aMat;
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
    vColor *= instanceColor;
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
  // Ink takes a deep version of the local paint instead of flat black.
  vec3 ink = vColor * 0.16 + vec3(0.016, 0.009, 0.014);
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(ink, uFogColor, f), 1.0);
}
`;

const depthVertex = /* glsl */ `
${GLSL_INSTANCE_WORLD}
void main() { gl_Position = projectionMatrix * viewMatrix * worldMatrixOf() * vec4(position, 1.0); }
`;

export interface ToyMaterials {
  body: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
  depth: THREE.ShaderMaterial;
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
  };
  return shared;
}

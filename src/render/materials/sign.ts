import * as THREE from 'three';
import { globals } from '../core/globals.ts';
import { GLSL_FOG, GLSL_INSTANCE_WORLD, GLSL_LAMPS, GLSL_SHADOW, GLSL_SUN, GLSL_UTIL } from './glsl.ts';

export interface SignStyle {
  background: string;
  color: string;
  border?: string;
  /** Width over height of the painted board. */
  aspect?: number;
  /** 0 is lit like paint, 1 glows like a light box. */
  glow?: number;
}

const HEIGHT = 128;
const textures = new Map<string, THREE.CanvasTexture>();
const materials = new Map<string, THREE.ShaderMaterial>();

function signTexture(text: string, style: SignStyle): THREE.CanvasTexture {
  const aspect = style.aspect ?? 3;
  const key = `${text}|${style.background}|${style.color}|${style.border ?? ''}|${aspect}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1024, Math.round(HEIGHT * aspect));
  canvas.height = HEIGHT;
  const c = canvas.getContext('2d')!;
  c.fillStyle = style.background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (style.border) {
    c.strokeStyle = style.border;
    c.lineWidth = 8;
    c.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  }
  let size = HEIGHT * 0.66;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `${size}px Kuaile, sans-serif`;
  const room = canvas.width * 0.86;
  const measured = c.measureText(text).width;
  if (measured > room) {
    size *= room / measured;
    c.font = `${size}px Kuaile, sans-serif`;
  }
  c.fillStyle = style.color;
  c.fillText(text, canvas.width / 2, canvas.height * 0.53);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  textures.set(key, texture);
  return texture;
}

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld, vNormal;
${GLSL_INSTANCE_WORLD}
void main() {
  mat4 world = worldMatrixOf();
  #ifdef USE_PART_RIG
    if (dot(world[0].xyz, world[0].xyz) < 1e-10) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
  #endif
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUv = uv;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${GLSL_UTIL}
${GLSL_FOG}
${GLSL_SUN}
${GLSL_SHADOW}
${GLSL_LAMPS}
uniform sampler2D tSign;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vWorld, vNormal;
void main() {
  vec3 paint = texture2D(tSign, vUv).rgb;
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  float shadow = sunShadow(vWorld, N);
  float ndl = sat(dot(N, uSunDir) * 0.5 + 0.5);
  vec3 lit = paint * (uSunColor * lightPool(vWorld) * ndl * mix(0.4, 1.0, shadow) * 0.8 + mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5) + lampDiffuse(vWorld, N));
  gl_FragColor = vec4(applyFog(mix(lit, paint * 1.7, uGlow), dist), 1.0);
}
`;

/** `rig` is the part texture of the machine the sign is fixed to; its geometry then carries `aPart`. */
export function signMaterial(text: string, style: SignStyle, rig?: THREE.Texture): THREE.ShaderMaterial {
  const glow = style.glow ?? 0;
  const key = `${text}|${style.background}|${style.color}|${style.border ?? ''}|${style.aspect ?? 3}|${glow}|${rig?.uuid ?? ''}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.ShaderMaterial({
      name: 'sign',
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { ...globals, tSign: { value: signTexture(text, style) }, uGlow: { value: glow }, ...(rig ? { tParts: { value: rig } } : {}) },
      defines: rig ? { USE_PART_RIG: '' } : {},
    });
    materials.set(key, material);
  }
  return material;
}

/** A flat painted board facing +Z before `matrix` is applied. A rig part makes it ride on that part. */
export function signGeometry(width: number, height: number, matrix: THREE.Matrix4, part?: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height).applyMatrix4(matrix);
  if (part !== undefined) {
    const tags = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < tags.length; i += 3) tags[i] = part;
    geometry.setAttribute('aPart', new THREE.BufferAttribute(tags, 3));
  }
  return geometry;
}

export function addSign(parent: THREE.Object3D, text: string, style: SignStyle, width: number, height: number, matrix: THREE.Matrix4): THREE.Mesh {
  const mesh = new THREE.Mesh(signGeometry(width, height, matrix), signMaterial(text, { aspect: width / height, ...style }));
  parent.add(mesh);
  return mesh;
}

import * as THREE from 'three';
import { globals } from '../core/globals.ts';

export const SpriteKind = { Puff: 0, Star: 1, Ring: 2, Fleck: 3, Drop: 4 } as const;

export interface SpriteSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  gravity?: number;
  drag?: number;
  sizeStart: number;
  sizeEnd: number;
  life: number;
  color: THREE.Color;
  alpha: number;
  additive?: number;
  kind: number;
  spin?: number;
}

const vertex = /* glsl */ `
uniform float uTime;
attribute vec4 iPos;   // xyz, born
attribute vec4 iVel;   // xyz, life
attribute vec4 iMove;  // gravity, drag, sizeStart, sizeEnd
attribute vec4 iColor; // rgb, alpha
attribute vec3 iStyle; // kind, additive, spin
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vStyle;
varying float vAge;
void main() {
  float age = (uTime - iPos.w) / iVel.w;
  vAge = age;
  vUv = position.xy;
  vColor = iColor;
  vStyle = iStyle;
  if (age < 0.0 || age >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float t = age * iVel.w;
  float d = max(iMove.y, 0.001);
  float moved = (1.0 - exp(-d * t)) / d;
  vec3 p = iPos.xyz + iVel.xyz * moved;
  p.y -= 0.5 * iMove.x * t * t;
  float ease = 1.0 - (1.0 - age) * (1.0 - age);
  float size = mix(iMove.z, iMove.w, ease);
  float a = iStyle.z * t + iPos.w * 37.0;
  vec2 c = vec2(cos(a), sin(a));
  vec2 q = mat2(c.x, c.y, -c.y, c.x) * position.xy * size;
  vec4 view = viewMatrix * vec4(p, 1.0);
  view.xy += q;
  gl_Position = projectionMatrix * view;
}
`;

const fragment = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vStyle;
varying float vAge;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float r = length(vUv);
  float kind = vStyle.x;
  float a = 0.0;
  float fade = 1.0 - vAge;
  if (kind < 0.5) {
    float n = noise(vUv * 3.0 + vColor.rg * 10.0 + vAge * 1.4);
    a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.55) * fade * fade;
  } else if (kind < 1.5) {
    float s = abs(vUv.x * vUv.y);
    a = smoothstep(0.1, 0.0, s + r * 0.06) * smoothstep(1.0, 0.1, r);
    a += smoothstep(0.34, 0.0, r);
    a *= fade;
  } else if (kind < 2.5) {
    float w = mix(0.2, 0.03, vAge);
    a = smoothstep(w, 0.0, abs(r - 0.8)) * fade;
  } else if (kind < 3.5) {
    float ang = atan(vUv.y, vUv.x);
    float edge = 0.62 + 0.2 * sin(ang * 3.0 + vColor.r * 9.0);
    a = smoothstep(edge + 0.06, edge - 0.02, r) * smoothstep(0.0, 0.2, fade);
  } else {
    a = smoothstep(1.0, 0.72, r) * smoothstep(0.0, 0.25, fade);
  }
  if (a < 0.003) discard;
  float alpha = a * vColor.a;
  gl_FragColor = vec4(vColor.rgb * alpha, alpha * (1.0 - vStyle.y));
}
`;

/** One draw call of GPU-animated sprites; the CPU only writes when something spawns. */
export class Sprites {
  readonly mesh: THREE.Mesh;
  private readonly capacity: number;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly move: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private dirty = false;

  constructor(parent: THREE.Object3D, capacity = 1200) {
    this.capacity = capacity;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (size: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = attr(4);
    this.vel = attr(4);
    this.move = attr(4);
    this.color = attr(4);
    this.style = attr(3);
    for (let i = 0; i < capacity; i += 1) {
      this.pos.setW(i, -1000);
      this.vel.setW(i, 1);
    }
    geometry.setAttribute('iPos', this.pos);
    geometry.setAttribute('iVel', this.vel);
    geometry.setAttribute('iMove', this.move);
    geometry.setAttribute('iColor', this.color);
    geometry.setAttribute('iStyle', this.style);
    geometry.instanceCount = capacity;
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        name: 'sprites',
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: globals.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    parent.add(this.mesh);
  }

  spawn(s: SpriteSpawn): void {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    this.pos.setXYZW(i, s.x, s.y, s.z, globals.uTime.value);
    this.vel.setXYZW(i, s.vx ?? 0, s.vy ?? 0, s.vz ?? 0, s.life);
    this.move.setXYZW(i, s.gravity ?? 0, s.drag ?? 0, s.sizeStart, s.sizeEnd);
    this.color.setXYZW(i, s.color.r, s.color.g, s.color.b, s.alpha);
    this.style.setXYZ(i, s.kind, s.additive ?? 0, s.spin ?? 0);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.pos.needsUpdate = true;
    this.vel.needsUpdate = true;
    this.move.needsUpdate = true;
    this.color.needsUpdate = true;
    this.style.needsUpdate = true;
  }
}

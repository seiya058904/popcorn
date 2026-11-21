import * as THREE from 'three';
import { globals } from '../core/globals.ts';

/**
 * Puff: soft smoke, steam and dust, lit by the scene's sun unless additive. Star: a four-point
 * glint. Ring: a widening ring. Fleck: a little ragged chip. Drop: a round dot. Spark: a hot streak
 * stretched along its own motion.
 */
export const SpriteKind = { Puff: 0, Star: 1, Ring: 2, Fleck: 3, Drop: 4, Spark: 5 } as const;

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
uniform vec3 uSunDir;
attribute vec4 iPos;   // xyz, born
attribute vec4 iVel;   // xyz, life
attribute vec4 iMove;  // gravity, drag, sizeStart, sizeEnd
attribute vec4 iColor; // rgb, alpha
attribute vec3 iStyle; // kind, additive, spin
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vStyle, vLight;
varying float vAge;
void main() {
  float age = (uTime - iPos.w) / iVel.w;
  vAge = age;
  vUv = position.xy;
  vColor = iColor;
  vStyle = iStyle;
  vLight = vec3(0.0, 0.0, 1.0);
  if (age < 0.0 || age >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float t = age * iVel.w;
  float d = max(iMove.y, 0.001);
  float moved = (1.0 - exp(-d * t)) / d;
  vec3 p = iPos.xyz + iVel.xyz * moved;
  p.y -= 0.5 * iMove.x * t * t;
  float ease = 1.0 - (1.0 - age) * (1.0 - age);
  float size = mix(iMove.z, iMove.w, ease);
  float scale = length(modelMatrix[0].xyz);
  vec4 view = viewMatrix * modelMatrix * vec4(p, 1.0);
  if (iStyle.x > 4.5) {
    // A spark is drawn as a streak along the way it is moving on screen, longer the faster it goes.
    vec3 velocity = iVel.xyz * exp(-d * t) - vec3(0.0, iMove.x * t, 0.0);
    vec2 onScreen = (viewMatrix * modelMatrix * vec4(velocity, 0.0)).xy;
    float speed = length(onScreen);
    vec2 along = speed > 1e-4 ? onScreen / speed : vec2(0.0, 1.0);
    // (across, along) stays a rotation, so the quad keeps its winding and is not culled.
    vec2 across = vec2(along.y, -along.x);
    view.xy += (along * position.y * (size + speed * 0.06) + across * position.x * size * 0.55) * scale;
  } else {
    float a = iStyle.z * t + iPos.w * 37.0;
    vec2 c = vec2(cos(a), sin(a));
    mat2 turn = mat2(c.x, c.y, -c.y, c.x);
    view.xy += turn * position.xy * size * scale;
    // The sun as seen in the sprite's own turned frame, for lighting smoke as a little ball.
    vec3 sun = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
    vLight = vec3(transpose(turn) * sun.xy, sun.z);
    // Smoke is pulled toward the camera by part of its size, so a puff does not cut a hard line
    // where it meets the ground or the heap.
    if (iStyle.x < 0.5) view.z = min(view.z + size * scale * 0.6, view.z * 0.5);
  }
  gl_Position = projectionMatrix * view;
}
`;

const fragment = /* glsl */ `
uniform vec3 uSunColor, uShadeTint, uSkyColor;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vStyle, vLight;
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
  vec3 rgb = vColor.rgb;
  if (kind < 0.5) {
    float n = noise(vUv * 3.0 + vColor.rg * 10.0 + vAge * 1.4);
    a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.55) * fade * fade;
    if (vStyle.y < 0.5) {
      // Lit like a little ball of vapour: bright toward the sun, the scene's shade on the far side.
      vec3 N = vec3(vUv * 0.85, sqrt(max(0.0, 1.0 - dot(vUv, vUv) * 0.72)));
      float lit = clamp(dot(N, normalize(vLight)) * 0.5 + 0.5, 0.0, 1.0);
      rgb *= mix(uShadeTint * 0.8 + uSkyColor, uSunColor * 0.85 + uSkyColor * 0.6, lit);
    }
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
  } else if (kind < 4.5) {
    a = smoothstep(1.0, 0.72, r) * smoothstep(0.0, 0.25, fade);
  } else {
    // A white-hot core fading out along the streak.
    a = pow(max(0.0, 1.0 - r), 1.6) * smoothstep(0.0, 0.3, fade);
    rgb = mix(rgb, vec3(max(rgb.r, max(rgb.g, rgb.b))), smoothstep(0.5, 0.0, r) * 0.5);
  }
  if (a < 0.003) discard;
  float alpha = a * vColor.a;
  gl_FragColor = vec4(rgb * alpha, alpha * (1.0 - vStyle.y));
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
  /** The slots written since the last flush, as a range that may wrap past the end. */
  private firstDirty = -1;
  private dirtyCount = 0;

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
        uniforms: { uTime: globals.uTime, uSunDir: globals.uSunDir, uSunColor: globals.uSunColor, uShadeTint: globals.uShadeTint, uSkyColor: globals.uSkyColor },
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
    if (this.firstDirty < 0) this.firstDirty = i;
    this.dirtyCount = Math.min(this.capacity, this.dirtyCount + 1);
  }

  /** Uploads only the slots written since the last frame, not the whole pool. */
  flush(): void {
    if (this.firstDirty < 0) return;
    const start = this.firstDirty;
    const end = start + this.dirtyCount;
    for (const attribute of [this.pos, this.vel, this.move, this.color, this.style]) {
      attribute.clearUpdateRanges();
      const size = attribute.itemSize;
      if (end <= this.capacity) {
        attribute.addUpdateRange(start * size, this.dirtyCount * size);
      } else {
        attribute.addUpdateRange(start * size, (this.capacity - start) * size);
        attribute.addUpdateRange(0, (end - this.capacity) * size);
      }
      attribute.needsUpdate = true;
    }
    this.firstDirty = -1;
    this.dirtyCount = 0;
  }
}

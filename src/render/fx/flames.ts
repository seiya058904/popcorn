import * as THREE from 'three';
import { globals } from '../core/globals.ts';

const TONGUES = 22;

const vertex = /* glsl */ `
uniform float uTime;
attribute vec3 aFlame; // height along tongue, phase, outward lean
varying float vTip, vPhase;
void main() {
  float tip = aFlame.x;
  float phase = aFlame.y;
  float flicker = 0.78 + 0.22 * sin(uTime * 17.0 + phase * 6.0) + 0.1 * sin(uTime * 31.0 + phase * 13.0);
  vec3 p = position;
  p.y *= flicker;
  vec2 radial = normalize(p.xz + 1e-4);
  p.xz += radial * tip * tip * aFlame.z;
  p.xz += vec2(sin(uTime * 13.0 + phase * 9.0), cos(uTime * 11.0 + phase * 7.0)) * tip * tip * 0.018;
  vTip = tip;
  vPhase = phase;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}
`;

const fragment = /* glsl */ `
varying float vTip, vPhase;
void main() {
  vec3 core = vec3(0.32, 0.72, 2.6);
  vec3 edge = vec3(0.05, 0.2, 1.3);
  vec3 base = vec3(0.9, 1.5, 2.6);
  vec3 col = mix(base, mix(core, edge, smoothstep(0.25, 0.9, vTip)), smoothstep(0.0, 0.3, vTip));
  float a = (1.0 - smoothstep(0.55, 1.0, vTip)) * 0.92;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

function tongueRing(): THREE.BufferGeometry {
  const positions: number[] = [];
  const flame: number[] = [];
  const indices: number[] = [];
  const rows = 4;
  const sides = 5;
  for (let t = 0; t < TONGUES; t += 1) {
    const angle = (t / TONGUES) * Math.PI * 2;
    const cx = Math.cos(angle) * 0.46;
    const cz = Math.sin(angle) * 0.46;
    const phase = t * 0.618;
    const base = positions.length / 3;
    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows;
      const radius = 0.062 * Math.sin(Math.PI * (0.12 + v * 0.88)) * (1 - v * 0.2);
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * Math.PI * 2;
        positions.push(cx + Math.cos(a) * radius, v * 0.24, cz + Math.sin(a) * radius);
        flame.push(v, phase, 0.11);
      }
    }
    for (let r = 0; r < rows; r += 1) {
      for (let s = 0; s < sides; s += 1) {
        const a = base + r * sides + s;
        const b = base + r * sides + ((s + 1) % sides);
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFlame', new THREE.Float32BufferAttribute(flame, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Burner flames, one instance per lit burner. */
export class Flames {
  readonly mesh: THREE.InstancedMesh;

  constructor(parent: THREE.Object3D, burners: readonly THREE.Vector3Tuple[]) {
    this.mesh = new THREE.InstancedMesh(
      tongueRing(),
      new THREE.ShaderMaterial({
        name: 'flames',
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: globals.uTime },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      }),
      burners.length,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const matrix = new THREE.Matrix4();
    burners.forEach((b, index) => {
      matrix.makeTranslation(b[0], b[1], b[2]);
      this.mesh.setMatrixAt(index, matrix);
    });
    parent.add(this.mesh);
  }

  setLit(count: number): void {
    this.mesh.count = count;
  }
}

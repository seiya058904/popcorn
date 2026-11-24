import * as THREE from 'three';
import { Rng } from '../../motion/rng.ts';
import { globals } from '../core/globals.ts';
import { GLSL_FOG, GLSL_SUN, GLSL_UTIL } from '../materials/glsl.ts';
import { popcornUniforms } from '../materials/popcorn.ts';
import { lowFlake } from '../popcorn/batches.ts';

const vertex = /* glsl */ `
uniform float uTime, uSnowSize, uSnowHeight, uSnowRadius, uSnowAmount;
attribute vec3 aShade;
attribute vec4 iSeed;
varying vec3 vWorld, vNormal, vShade;
void main() {
  float speed = 0.09 + iSeed.z * 0.08;
  float fall = fract(iSeed.w - uTime * speed);
  vec3 c = vec3(iSeed.x, 0.0, iSeed.y) * uSnowRadius;
  c.y = (fall - 0.25) * uSnowHeight;
  c.x += sin(uTime * 0.7 + iSeed.w * 40.0) * uSnowSize * 1.2;
  c.z += cos(uTime * 0.6 + iSeed.z * 40.0) * uSnowSize * 1.2;
  float a = uTime * (0.6 + iSeed.z) + iSeed.w * 20.0;
  mat3 spin = mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a));
  float visible = step(iSeed.z, uSnowAmount);
  vec3 p = spin * position * uSnowSize * visible + c;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * spin * normal);
  vShade = aShade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform vec3 uPopCream, uPopShade, uPopDeep;
varying vec3 vWorld, vNormal, vShade;
void main() {
  vec3 N = normalize(vNormal);
  float band = toonBand(sat(dot(N, uSunDir) * 0.5 + 0.5));
  vec3 col = mix(uPopShade, uPopCream, band);
  col = mix(col, uPopDeep, vShade.x * 0.7);
  col *= uSunColor * 0.5 + 0.4;
  gl_FragColor = vec4(applyFog(col, distance(cameraPosition, vWorld)), 1.0);
}
`;

/** Popcorn snow: a fixed pool of falling flakes animated entirely on the GPU. */
export class PopcornSnow {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { uSnowAmount: { value: number } };

  constructor(parent: THREE.Object3D, options: { count: number; size: number; height: number; radius: number; center: THREE.Vector3Tuple }) {
    const rng = new Rng(808);
    const base = lowFlake(1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    geometry.setAttribute('aShade', base.getAttribute('aShade'));
    const seeds = new Float32Array(options.count * 4);
    for (let i = 0; i < options.count; i += 1) {
      const r = Math.sqrt(rng.next());
      const a = rng.range(0, 6.28);
      seeds.set([Math.cos(a) * r, Math.sin(a) * r, rng.next(), rng.next()], i * 4);
    }
    geometry.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = options.count;
    this.uniforms = { uSnowAmount: { value: 0 } };
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        name: 'popcorn-snow',
        vertexShader: vertex,
        fragmentShader: `${GLSL_UTIL}\n${GLSL_FOG}\n${GLSL_SUN}\n${fragment}`,
        uniforms: {
          ...globals,
          uPopCream: popcornUniforms.uPopCream,
          uPopShade: popcornUniforms.uPopShade,
          uPopDeep: popcornUniforms.uPopDeep,
          uSnowSize: { value: options.size },
          uSnowHeight: { value: options.height },
          uSnowRadius: { value: options.radius },
          ...this.uniforms,
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.position.set(...options.center);
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** 0 is no snow; 1 is the whole pool falling. */
  setAmount(amount: number): void {
    this.uniforms.uSnowAmount.value = amount;
    this.mesh.visible = amount > 0.001;
  }
}

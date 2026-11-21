import * as THREE from 'three';
import { globals } from './globals.ts';

/**
 * Face size of a capture. three's PMREM generator works at 256 at the least, and that is enough
 * for the sharpest chrome on a toy.
 */
export const PROBE_SIZE = 256;

/** The three story looks a probe is captured in: the start, the middle and the late look. */
export const PROBE_LOOKS = [0, 0.5, 1] as const;

/** What a scene does so the probe sees it in one of its story looks. */
export interface ProbeLook {
  /** Puts lights, light groups and anything else that moves along the story into look `index`. */
  apply(index: number): void;
  /** Draws the scene's shadow map for the capture. */
  shadow(): void;
  /** Called once every look is captured, to hand the set back. */
  restore(): void;
}

/** Reads the roughest level of a capture along the six axes: the room's soft light from each side. */
const ambientFragment = /* glsl */ `
uniform samplerCube tMap;
void main() {
  int i = int(gl_FragCoord.x);
  vec3 d = i == 0 ? vec3(1.0, 0.0, 0.0) : i == 1 ? vec3(-1.0, 0.0, 0.0) : i == 2 ? vec3(0.0, 1.0, 0.0)
    : i == 3 ? vec3(0.0, -1.0, 0.0) : i == 4 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
  gl_FragColor = vec4(textureLod(tMap, d, 5.0).rgb, 1.0);
}
`;

interface Shared {
  generator: THREE.PMREMGenerator;
  target: THREE.WebGLCubeRenderTarget;
  camera: THREE.CubeCamera;
  ambientTarget: THREE.WebGLRenderTarget;
  ambientScene: THREE.Scene;
  ambientMaterial: THREE.ShaderMaterial;
  ambientCamera: THREE.Camera;
  ambientPixels: Float32Array;
}

let shared: Shared | null = null;

function sharedParts(renderer: THREE.WebGLRenderer): Shared {
  if (!shared) {
    const target = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, depthBuffer: true });
    const camera = new THREE.CubeCamera(0.1, 1400, target);
    camera.coordinateSystem = renderer.coordinateSystem;
    camera.updateCoordinateSystem();
    const ambientMaterial = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: ambientFragment,
      uniforms: { tMap: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(triangle, ambientMaterial);
    quad.frustumCulled = false;
    const ambientScene = new THREE.Scene();
    ambientScene.add(quad);
    shared = {
      generator: new THREE.PMREMGenerator(renderer),
      target,
      camera,
      ambientTarget: new THREE.WebGLRenderTarget(6, 1, { type: THREE.FloatType, depthBuffer: false, generateMipmaps: false }),
      ambientScene,
      ambientMaterial,
      ambientCamera: new THREE.Camera(),
      ambientPixels: new Float32Array(24),
    };
  }
  return shared;
}

/**
 * The set of one scene as seen from just above its heap, in each of the scene's three story looks,
 * prefiltered for every roughness. With it, shiny things reflect the room they stand in, the
 * window, the lamps, the curtain, instead of a painted gradient.
 */
export class SceneProbe {
  readonly maps: [THREE.WebGLCubeRenderTarget | null, THREE.WebGLCubeRenderTarget | null, THREE.WebGLCubeRenderTarget | null] = [null, null, null];
  /** Each look's soft light from the six sides (+x, -x, +y, -y, +z, -z), three floats a side. */
  readonly ambient: [Float32Array, Float32Array, Float32Array] = [new Float32Array(18), new Float32Array(18), new Float32Array(18)];

  private disposed = false;

  /** True once every look is captured. */
  get ready(): boolean {
    return this.maps.every((map) => map !== null);
  }

  /**
   * Captures one face per step; each `yield` is a point where a frame may be drawn in between.
   * `root` is drawn with its children hidden unless `keep` says otherwise, from `position` in the
   * root's own coordinates. Frames in between put the live scene's light back by themselves.
   * `immediate` reads the soft light back at once, for a build nobody is playing through; otherwise
   * the read waits for the GPU without holding up a frame, and each look shows once it has arrived.
   */
  *capture(renderer: THREE.WebGLRenderer, root: THREE.Object3D, keep: (child: THREE.Object3D) => boolean, position: THREE.Vector3, near: number, look: ProbeLook, immediate: boolean): Generator<void, void, void> {
    this.disposed = false;
    const parts = sharedParts(renderer);
    const { generator, target, camera } = parts;
    for (let index = 0; index < PROBE_LOOKS.length; index += 1) {
      for (let face = 0; face < 6; face += 1) {
        const hidden = hideOthers(root, keep);
        look.apply(index);
        look.shadow();
        // The capture is lit the painted way, so a probe never sees an older probe.
        const envOn = globals.uEnvOn.value;
        const bounce = globals.uBounce.value.w;
        globals.uEnvOn.value = 0;
        globals.uBounce.value.w = 0;
        root.updateMatrixWorld(true);
        camera.position.copy(position);
        root.localToWorld(camera.position);
        const eye = camera.children[face] as THREE.PerspectiveCamera;
        eye.near = near;
        eye.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(target, face);
        renderer.clear(true, true, false);
        renderer.render(root, eye);
        renderer.setRenderTarget(previous);
        globals.uEnvOn.value = envOn;
        globals.uBounce.value.w = bounce;
        for (const node of hidden) node.visible = true;
        yield;
      }
      const map = generator.fromCubemap(target.texture);
      const place = (): void => {
        if (this.disposed) {
          map.dispose();
          return;
        }
        this.maps[index]?.dispose();
        this.maps[index] = map;
      };
      const read = readAmbient(renderer, parts, map, this.ambient[index]!, immediate);
      if (read) void read.then(place);
      else place();
      yield;
    }
    look.restore();
  }

  dispose(): void {
    this.disposed = true;
    for (let index = 0; index < this.maps.length; index += 1) {
      this.maps[index]?.dispose();
      this.maps[index] = null;
    }
  }
}

/**
 * Six texels of the capture's roughest level, read back once: shading the soft fill from them
 * costs no texture reads at all. Read at once when `immediate`; otherwise without waiting for the
 * GPU, and the returned promise settles once `out` is filled.
 */
function readAmbient(renderer: THREE.WebGLRenderer, parts: Shared, map: THREE.WebGLCubeRenderTarget, out: Float32Array, immediate: boolean): Promise<void> | null {
  parts.ambientMaterial.uniforms.tMap!.value = map.texture;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(parts.ambientTarget);
  renderer.render(parts.ambientScene, parts.ambientCamera);
  renderer.setRenderTarget(previous);
  const copy = (pixels: Float32Array): void => {
    for (let side = 0; side < 6; side += 1) {
      for (let c = 0; c < 3; c += 1) out[side * 3 + c] = pixels[side * 4 + c]!;
    }
  };
  if (immediate) {
    renderer.readRenderTargetPixels(parts.ambientTarget, 0, 0, 6, 1, parts.ambientPixels);
    copy(parts.ambientPixels);
    return null;
  }
  // Its own buffer: the next look may be read before this one arrives.
  const pixels = new Float32Array(24);
  return renderer.readRenderTargetPixelsAsync(parts.ambientTarget, 0, 0, 6, 1, pixels).then(() => copy(pixels));
}

function hideOthers(root: THREE.Object3D, keep: (child: THREE.Object3D) => boolean): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = [];
  for (const child of root.children) {
    if (child.visible && !keep(child)) {
      child.visible = false;
      hidden.push(child);
    }
  }
  return hidden;
}

/**
 * Shows two captures, blended `mix` of the way from `a` to `b`, at strength `on` (0 falls back to
 * the painted gradient). A missing capture switches the probe off.
 */
export function bindEnvironment(
  a: THREE.WebGLCubeRenderTarget | null,
  b: THREE.WebGLCubeRenderTarget | null,
  mix: number,
  on: number,
  ambientA?: Float32Array,
  ambientB?: Float32Array,
): void {
  const ready = a !== null && b !== null;
  if (ambientA && ambientB) {
    const cube = globals.uAmbientCube.value;
    for (let side = 0; side < 6; side += 1) {
      const i = side * 3;
      cube[side]!.setRGB(
        ambientA[i]! + (ambientB[i]! - ambientA[i]!) * mix,
        ambientA[i + 1]! + (ambientB[i + 1]! - ambientA[i + 1]!) * mix,
        ambientA[i + 2]! + (ambientB[i + 2]! - ambientA[i + 2]!) * mix,
      );
    }
  }
  globals.uEnvA.value = a?.texture ?? null;
  globals.uEnvB.value = b?.texture ?? null;
  globals.uEnvMix.value = mix;
  globals.uEnvOn.value = ready ? on : 0;
}

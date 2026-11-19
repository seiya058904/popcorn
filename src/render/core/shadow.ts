import * as THREE from 'three';
import { globals } from './globals.ts';

const SHADOW_LAYER = 1;

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * Apparent size of the sun, as the tangent of its angular radius. The real sun is about 0.005;
 * a toy diorama under a big soft studio light reads better with a much larger one.
 */
const SUN_SIZE = 0.035;
/** Narrowest and widest shadow filter, in texels, when shadows soften with distance. */
const MIN_SOFTNESS = 1.4;
const MAX_SOFTNESS = 13;

const white = new THREE.Color(1, 1, 1);
const savedClear = new THREE.Color();

/** One directional shadow map. Casters are registered with an explicit depth material. */
export class ShadowPass {
  readonly camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.5, 40);
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly casters = new Map<THREE.Mesh, THREE.Material>();
  private readonly center = new THREE.Vector3();
  private radius = 8;

  setFrustum(center: THREE.Vector3Like, radius: number): void {
    this.center.copy(center);
    this.radius = radius;
  }

  /** `soft`: shadows harden where things touch and soften with distance; otherwise one even filter. */
  setSize(size: number, soft = false): void {
    globals.uShadowPenumbra.value.x = soft ? 1 : 0;
    if (this.target?.width === size) return;
    this.target?.dispose();
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    // Casters also write their depth as a color: a comparing depth texture can only answer
    // "lit or not", and a soft shadow needs to know how far away the blocker is.
    this.target = new THREE.WebGLRenderTarget(size, size, {
      depthTexture: depth,
      format: THREE.RedFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    globals.uShadowMap.value = depth;
    globals.uShadowDepth.value = this.target.texture;
    globals.uShadowTexel.value = 1 / size;
  }

  add(mesh: THREE.Mesh, depthMaterial: THREE.Material): void {
    mesh.layers.enable(SHADOW_LAYER);
    this.casters.set(mesh, depthMaterial);
  }

  /** Stops everything under `root` from casting, e.g. a scene that has become a tiny prop. */
  removeTree(root: THREE.Object3D): void {
    root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) this.remove(node as THREE.Mesh);
    });
  }

  remove(mesh: THREE.Mesh): void {
    mesh.layers.disable(SHADOW_LAYER);
    this.casters.delete(mesh);
  }

  /** Asks for the depth programs of every caster under `root`, as they will be drawn. */
  compile(renderer: THREE.WebGLRenderer, root: THREE.Object3D, scene: THREE.Scene): void {
    if (!this.target) return;
    const originals: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
    root.traverse((node) => {
      const depth = this.casters.get(node as THREE.Mesh);
      if (!depth) return;
      originals.push([node as THREE.Mesh, (node as THREE.Mesh).material]);
      (node as THREE.Mesh).material = depth;
    });
    renderer.setRenderTarget(this.target);
    renderer.compile(root, this.camera, scene);
    for (const [mesh, material] of originals) mesh.material = material;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): void {
    if (!this.target) return;
    const r = this.radius;
    const cam = this.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = r * 0.05;
    cam.far = r * 4;
    cam.position.copy(this.center).addScaledVector(globals.uSunDir.value, r * 2);
    cam.lookAt(this.center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cam.layers.set(SHADOW_LAYER);
    const size = this.target.width;
    globals.uShadowOffset.value = (2 * r) / size;
    // Depth runs linearly from near to far under an orthographic light, so a step in depth is
    // a fixed distance; over that distance the sun's disc spreads the edge by SUN_SIZE per unit.
    const penumbra = globals.uShadowPenumbra.value;
    penumbra.y = (((cam.far - cam.near) * SUN_SIZE) / (2 * r)) * size;
    penumbra.z = MIN_SOFTNESS * (size / 2048);
    penumbra.w = MAX_SOFTNESS * (size / 2048);

    globals.uShadowMatrix.value
      .copy(BIAS)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    const originals: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
    for (const [mesh, depth] of this.casters) {
      originals.push([mesh, mesh.material]);
      mesh.material = depth;
    }
    renderer.setRenderTarget(this.target);
    // The automatic clear fills the color copy with the far plane, where nothing blocks the light.
    renderer.getClearColor(savedClear);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(white, 1);
    renderer.render(scene, cam);
    renderer.setClearColor(savedClear, alpha);
    for (const [mesh, material] of originals) mesh.material = material;
  }
}

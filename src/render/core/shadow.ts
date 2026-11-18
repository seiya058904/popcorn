import * as THREE from 'three';
import { globals } from './globals.ts';

const SHADOW_LAYER = 1;

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

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

  setSize(size: number): void {
    if (this.target?.width === size) return;
    this.target?.dispose();
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      depthTexture: depth,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    globals.uShadowMap.value = depth;
    globals.uShadowTexel.value = 1 / size;
  }

  add(mesh: THREE.Mesh, depthMaterial: THREE.Material): void {
    mesh.layers.enable(SHADOW_LAYER);
    this.casters.set(mesh, depthMaterial);
  }

  remove(mesh: THREE.Mesh): void {
    mesh.layers.disable(SHADOW_LAYER);
    this.casters.delete(mesh);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
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
    globals.uShadowOffset.value = (2 * r) / this.target.width;

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
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    for (const [mesh, material] of originals) mesh.material = material;
  }
}

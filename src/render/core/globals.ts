import * as THREE from 'three';

/** Uniform objects shared by reference across every material. */
export const globals = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uShadeTint: { value: new THREE.Color(0.3, 0.3, 0.45) },
  uSkyColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
  uGroundColor: { value: new THREE.Color(0.15, 0.12, 0.12) },
  uRimColor: { value: new THREE.Color(0.5, 0.6, 0.9) },
  uRimDir: { value: new THREE.Vector3(-0.6, 0.3, -0.7).normalize() },
  uFogColor: { value: new THREE.Color(0.1, 0.08, 0.1) },
  uFogRange: { value: new THREE.Vector2(14, 40) },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowTexel: { value: 1 / 2048 },
  uShadowSoftness: { value: 5 },
  /** World size of one shadow texel, so bias follows the scale of the current scene. */
  uShadowOffset: { value: 0.005 },
  /** Pool of key light: xyz center, radius in w. */
  uPool: { value: new THREE.Vector4(0, 0, 0, 100) },
  uPoolFloor: { value: 0.5 },
  uResolution: { value: new THREE.Vector2(1280, 720) },
  uOutlinePx: { value: 2 },
  uOutlineRefDist: { value: 10 },
};

export type GlobalUniforms = typeof globals;

export interface LightRig {
  sunDir: [number, number, number];
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  shadeTint: THREE.ColorRepresentation;
  sky: THREE.ColorRepresentation;
  skyIntensity: number;
  ground: THREE.ColorRepresentation;
  groundIntensity: number;
  rim: THREE.ColorRepresentation;
  rimIntensity: number;
  rimDir: [number, number, number];
  fog: THREE.ColorRepresentation;
  fogRange: [number, number];
  pool: [number, number, number, number];
  poolFloor: number;
}

export function applyLightRig(rig: LightRig): void {
  globals.uSunDir.value.set(...rig.sunDir).normalize();
  globals.uSunColor.value.set(rig.sunColor).multiplyScalar(rig.sunIntensity);
  globals.uShadeTint.value.set(rig.shadeTint);
  globals.uSkyColor.value.set(rig.sky).multiplyScalar(rig.skyIntensity);
  globals.uGroundColor.value.set(rig.ground).multiplyScalar(rig.groundIntensity);
  globals.uRimColor.value.set(rig.rim).multiplyScalar(rig.rimIntensity);
  globals.uRimDir.value.set(...rig.rimDir).normalize();
  globals.uFogColor.value.set(rig.fog);
  globals.uFogRange.value.set(...rig.fogRange);
  globals.uPool.value.set(...rig.pool);
  globals.uPoolFloor.value = rig.poolFloor;
}

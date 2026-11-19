import * as THREE from 'three';

export const MAX_LAMPS = 16;

/**
 * Lit things in a scene (windows, bulbs, neon) belong to numbered groups that the scene switches
 * on and off as it fills up; a group at 0 shows them as dark glass. Each scene owns eight.
 */
export const LIGHT_GROUPS = 40;
export const GROUPS_PER_SCENE = 8;

/** The number to paint with for one of a scene's light groups; `index` runs from 0 to 7. */
export function lightGroup(scene: number, index: number): number {
  return scene * GROUPS_PER_SCENE + index + 1;
}

/** Refracting glass, drawn after everything else so it can look at the finished scene. */
export const GLASS_LAYER = 2;

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
  /** Nearest depth seen by the light, readable without comparison, for working out penumbras. */
  uShadowDepth: { value: null as THREE.Texture | null },
  /**
   * Soft shadows that harden where things touch: x is 1 when on, y the penumbra in texels per
   * unit of depth between blocker and receiver, z and w the narrowest and widest filter in texels.
   */
  uShadowPenumbra: { value: new THREE.Vector4(0, 0, 1.5, 14) },
  /** Brightness of each light group, 0 off to 1 on. */
  uLit: { value: new Float32Array(LIGHT_GROUPS).fill(1) },
  /** Pool of key light: xyz center, radius in w. */
  uPool: { value: new THREE.Vector4(0, 0, 0, 100) },
  uPoolFloor: { value: 0.5 },
  /** Small local lights: xyz position and radius, then color times intensity. */
  uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
  uLampColor: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Color(0, 0, 0)) },
  uLampCount: { value: 0 },
  /** What shiny surfaces see: the room above, around and below them. */
  uEnvTop: { value: new THREE.Color(0.5, 0.5, 0.6) },
  uEnvHorizon: { value: new THREE.Color(0.3, 0.3, 0.3) },
  uEnvBottom: { value: new THREE.Color(0.12, 0.1, 0.1) },
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

export interface Lamp {
  position: [number, number, number];
  color: THREE.ColorRepresentation;
  intensity: number;
  radius: number;
  /** 0 is steady; higher values make it waver like a flame. */
  flicker?: number;
}

/**
 * Up to `limit` of the scene's own lamps, then any short-lived event lights that are lit. Lamps
 * switched off are skipped, so they cost nothing per pixel.
 */
export function applyLamps(lamps: readonly Lamp[], time: number, limit: number, events: readonly Lamp[] = []): void {
  let count = 0;
  const write = (lamp: Lamp, seed: number): void => {
    const waver = lamp.flicker ? 1 + lamp.flicker * (Math.sin(time * 11 + seed * 2.1) * 0.6 + Math.sin(time * 23 + seed) * 0.4) : 1;
    globals.uLampPos.value[count]!.set(lamp.position[0], lamp.position[1], lamp.position[2], lamp.radius);
    globals.uLampColor.value[count]!.set(lamp.color).multiplyScalar(lamp.intensity * waver);
    count += 1;
  };
  for (let i = 0; i < lamps.length && count < Math.min(limit, MAX_LAMPS); i += 1) {
    if (lamps[i]!.intensity > 0.004) write(lamps[i]!, i);
  }
  for (let i = 0; i < events.length && count < MAX_LAMPS; i += 1) {
    if (events[i]!.intensity > 0.004) write(events[i]!, i + 7);
  }
  globals.uLampCount.value = count;
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
  globals.uEnvTop.value.set(rig.sky).multiplyScalar(0.85);
  globals.uEnvHorizon.value.set(rig.fog).multiplyScalar(0.8);
  globals.uEnvBottom.value.set(rig.ground).multiplyScalar(0.5);
}

import * as THREE from 'three';
import type { UnitPath } from './types.ts';

type PathOptions = Omit<UnitPath, 'length' | 'sample'>;

/** A level ring around a center, run counter-clockwise seen from above. */
export function ringPath(cx: number, cz: number, radius: number, y: number, options: PathOptions): UnitPath {
  const length = Math.PI * 2 * radius;
  return {
    ...options,
    length,
    sample(distance, position, tangent, up) {
      const a = distance / radius;
      position.set(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius);
      tangent.set(-Math.sin(a), 0, Math.cos(a));
      up.set(0, 1, 0);
    },
  };
}

/**
 * A ring of latitude on a ball whose top touches y = 0 (the center is `planetRadius` below), so
 * whatever rides it leans with the ground. `lift` raises it off the surface along the normal.
 */
export function planetRingPath(planetRadius: number, ringRadius: number, lift: number, options: PathOptions): UnitPath {
  const length = Math.PI * 2 * ringRadius;
  const center = new THREE.Vector3(0, -planetRadius, 0);
  const surfaceY = Math.sqrt(Math.max(0, planetRadius * planetRadius - ringRadius * ringRadius)) - planetRadius;
  return {
    ...options,
    length,
    sample(distance, position, tangent, up) {
      const a = distance / ringRadius;
      position.set(Math.cos(a) * ringRadius, surfaceY, Math.sin(a) * ringRadius);
      up.copy(position).sub(center).normalize();
      position.addScaledVector(up, lift);
      tangent.set(-Math.sin(a), 0, Math.cos(a));
    },
  };
}

/** The surface normal of that same ball at a point on it, for machines standing on the planet. */
export function planetUp(planetRadius: number, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y + planetRadius, z).normalize();
}

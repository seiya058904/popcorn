import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../motion/rng.ts';

export const FLAKE_SHAPES = 10;

/**
 * Popcorn comes in two kinds: "butterfly" flakes with wings flung out in every direction, and
 * round, crinkled "mushroom" heads. These shapes are mushrooms; the rest are butterflies.
 */
const MUSHROOM_SHAPES: ReadonlySet<number> = new Set([3, 6, 9]);

export const isMushroom = (shape: number): boolean => MUSHROOM_SHAPES.has(shape);

interface Vec {
  x: number;
  y: number;
  z: number;
}

const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function randomUnit(rng: Rng): THREE.Vector3 {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
}

function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fade = (t: number): number => t * t * (3 - 2 * t);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const h = (a: number, b: number, c: number): number => {
    const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

interface Lobe {
  center: THREE.Vector3;
  size: number;
  /** Angular radius of the puff, in radians. */
  width: number;
}

/**
 * One popcorn piece as a radial function over the sphere. The kernel is a second radial
 * function over the same directions, so the mesh can morph from kernel to flake.
 */
export function createFlakeGeometry(shape: number, detail: number): THREE.BufferGeometry {
  const rng = new Rng(9001 + shape * 137);
  const sphere = new THREE.IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-4);
  sphere.dispose();

  const hull = randomUnit(rng);
  // The kernel's flat sides face along `face`; it is widest along `side`.
  const side = new THREE.Vector3().crossVectors(hull, Math.abs(hull.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const face = new THREE.Vector3().crossVectors(hull, side);
  const lobes: Lobe[] = [];
  const mushroom = isMushroom(shape);
  // Mushrooms are many even bumps around a ball; butterflies a few big wings and some small ones.
  const lobeCount = mushroom ? 14 + (shape % 3) : 7 + (shape % 4);
  for (let i = 0; i < lobeCount; i += 1) {
    let center = randomUnit(rng);
    // Lobes burst away from the hull, like the wings of a real flake.
    if (!mushroom && center.dot(hull) > 0.3) center = center.addScaledVector(hull, -1.4).normalize();
    for (const other of lobes) {
      if (center.dot(other.center) > (mushroom ? 0.86 : 0.8)) center = center.sub(other.center.clone().multiplyScalar(0.55)).normalize();
    }
    const big = i < 3;
    lobes.push({
      center,
      size: mushroom ? rng.range(0.86, 0.98) : big ? rng.range(0.92, 1.14) : rng.range(0.62, 0.88),
      width: mushroom ? rng.range(0.62, 0.78) : big ? rng.range(0.95, 1.2) : rng.range(0.5, 0.75),
    });
  }
  // Close-up flakes get a second, finer layer of crinkles.
  const fine = detail >= FLAKE_DETAIL_HIGH ? 1 : 0;

  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = pos.count;
  const kernel = new Float32Array(count * 3);
  const shade = new Float32Array(count * 4);
  const dir = new THREE.Vector3();
  const warped = new THREE.Vector3();
  const seed = shape * 17.3;

  for (let i = 0; i < count; i += 1) {
    dir.fromBufferAttribute(pos, i).normalize();
    const nx = valueNoise3(dir.x * 2.2 + seed, dir.y * 2.2, dir.z * 2.2) - 0.5;
    const ny = valueNoise3(dir.x * 2.2, dir.y * 2.2 + seed, dir.z * 2.2) - 0.5;
    const nz = valueNoise3(dir.x * 2.2, dir.y * 2.2, dir.z * 2.2 + seed) - 0.5;
    const warp = mushroom ? 0.22 : 0.42;
    warped.set(dir.x + nx * warp, dir.y + ny * warp, dir.z + nz * warp).normalize();

    let best = 0;
    let second = 0;
    let sum = 0;
    for (const lobe of lobes) {
      // Each puff is a round bubble: a spherical cap, so neighbours meet in creases, not in ridges.
      const t = Math.acos(Math.max(-1, Math.min(1, dot(warped, lobe.center)))) / lobe.width;
      const value = t < 1 ? lobe.size * Math.sqrt(1 - t * t) : 0;
      sum += Math.pow(value, 9);
      if (value > best) {
        second = best;
        best = value;
      } else if (value > second) {
        second = value;
      }
    }
    const field = Math.pow(sum, 1 / 9);
    const blister = valueNoise3(dir.x * 5.2 + seed, dir.y * 5.2, dir.z * 5.2);
    const crinkle = (valueNoise3(dir.x * 23 + seed, dir.y * 23, dir.z * 23 - seed) - 0.5) * 0.035 * fine;
    const wrinkle =
      Math.pow(blister, 2) * (mushroom ? 0.22 : 0.17) - 0.05 + (valueNoise3(dir.x * 11 + seed, dir.y * 11, dir.z * 11) - 0.5) * (mushroom ? 0.09 : 0.06) + crinkle;
    const hullDot = dot(dir, hull);
    const core = smooth(0.87, 0.97, hullDot) * (0.65 + 0.35 * valueNoise3(dir.x * 16, dir.y * 16 + seed, dir.z * 16));
    // A mushroom is a round head: its lobes are pulled in toward one even ball.
    const body = mushroom ? 0.42 + 0.58 * field : 0.27 + 0.8 * field;
    let radius = body + wrinkle * smooth(0.25, 0.6, field);
    radius *= 1 - (mushroom ? 0.18 : 0.34) * smooth(0.6, 0.98, hullDot);
    pos.setXYZ(i, dir.x * radius, dir.y * radius, dir.z * radius);

    // Folds between lobes and low valleys both toast darker; butterfly wings get slightly deeper crease contrast.
    const fold = 1 - smooth(0, mushroom ? 0.16 : 0.195, best - second);
    const valley = 1 - smooth(0.22, 0.62, field);
    shade[i * 4] = Math.min(1, Math.max(fold * smooth(0.1, 0.5, best) * (mushroom ? 0.82 : 0.88), valley * 0.92));
    shade[i * 4 + 1] = core;
    shade[i * 4 + 2] = field;
    // Where along the kernel this point lies, crown 0 to tip 1, for the kernel's own colouring.
    shade[i * 4 + 3] = (hullDot + 1) * 0.5;

    // Kernel: a plump, smooth popping-corn grain — rounded broad crown tapering gently to a short
    // blunt tip cap without a pinched lightbulb neck, fuller front-to-back with a faint embryo dimple.
    const axial = hullDot;
    const across = dot(dir, side);
    const through = dot(dir, face);
    const taper = smooth(-0.62, 0.96, axial);
    const width = 0.525 * (1 - 0.34 * taper);
    const depth = width * (0.82 - 0.08 * taper);
    const ellipse = 1 / Math.sqrt((axial * axial) / (0.61 * 0.61) + (across * across) / (width * width) + (through * through) / (depth * depth));
    const tip = 0.052 * Math.pow(Math.max(0, axial), 5);
    // Slightly flattened crown with a subtle dried-kernel crown dimple and a gentle germ groove on one face.
    const crown = 1 - 0.06 * smooth(-0.76, -1, axial);
    const germ = 0.032 * smooth(0.25, 0.85, through) * smooth(-0.35, 0.2, axial) * (1 - smooth(0.25, 0.78, axial)) * (1 - smooth(0.15, 0.6, Math.abs(across)));
    const dent = 0.01 * Math.sin(dir.x * 7 + seed) * Math.sin(dir.z * 6);
    const kernelRadius = ellipse * crown + tip - germ + dent;
    kernel[i * 3] = dir.x * kernelRadius;
    kernel[i * 3 + 1] = dir.y * kernelRadius;
    kernel[i * 3 + 2] = dir.z * kernelRadius;
  }
  geometry.computeVertexNormals();

  const kernelGeometry = new THREE.BufferGeometry();
  kernelGeometry.setAttribute('position', new THREE.BufferAttribute(kernel, 3));
  kernelGeometry.setIndex(geometry.getIndex());
  kernelGeometry.computeVertexNormals();

  geometry.setAttribute('aKernelPos', new THREE.BufferAttribute(kernel, 3));
  geometry.setAttribute('aKernelNormal', kernelGeometry.getAttribute('normal'));
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  return geometry;
}

/** Near-camera flakes: 2,420 triangles. */
export const FLAKE_DETAIL_HIGH = 10;
/** Heap surface flakes: 500 triangles. */
export const FLAKE_DETAIL_LOW = 4;

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Stage } from '../../src/render/core/stage.ts';
import { at, Kit, P } from '../../src/render/geometry/kit.ts';
import { FLAKE_DETAIL_LOW, FLAKE_SHAPES } from '../../src/render/geometry/popcorn.ts';
import { PartRig, RIG_HIDDEN, ToyRig } from '../../src/render/geometry/rig.ts';
import { ATLAS_ROWS, flakeAtlas, lowFlake } from '../../src/render/popcorn/batches.ts';

/** Just enough of a stage for building rigs: nothing is drawn in these tests. */
function fakeStage(): Stage {
  const casters: THREE.Mesh[] = [];
  return { shadow: { add: (mesh: THREE.Mesh) => casters.push(mesh) }, addGlass: () => undefined, casters } as unknown as Stage;
}

function boxPart(size: number, glass = false): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(size, size, size, 0.02, 1), { color: '#ff0000', matrix: at(0, size / 2, 0) });
  if (glass) kit.add(P.box(size, size, 0.01, 0.002, 1), { color: '#c6ecf6', glass: true });
  return kit.build();
}

/** The matrix a vertex shader would read for one copy and part. */
function readPart(rig: PartRig, copy: number, part: number): THREE.Matrix4 {
  const data = rig.texture.image.data as Float32Array;
  const width = rig.texture.image.width;
  const base = (copy * width + part * 4) * 4;
  return new THREE.Matrix4().fromArray(data, base);
}

describe('part rigs', () => {
  it('merge every part into one mesh and tag each vertex with its part and passes', () => {
    const parts = [boxPart(1), boxPart(0.5), boxPart(0.25)];
    const counts = parts.map((geometry) => geometry.getAttribute('position').count);
    const rig = new PartRig(fakeStage(), new THREE.Group(), [{ geometry: parts[0]! }, { geometry: parts[1]!, ink: false }, { geometry: parts[2]!, shadow: false }], 3);
    const tags = rig.body.geometry.getAttribute('aPart');
    expect(tags.count).toBe(counts[0]! + counts[1]! + counts[2]!);
    const at = (vertex: number) => [tags.getX(vertex), tags.getY(vertex), tags.getZ(vertex)];
    expect(at(0)).toEqual([0, 1, 1]);
    expect(at(counts[0]!)).toEqual([1, 0, 1]);
    expect(at(counts[0]! + counts[1]!)).toEqual([2, 1, 0]);
    // One mesh per pass, sharing one geometry.
    expect(rig.ink?.geometry).toBe(rig.body.geometry);
  });

  it('keeps the triangle list pointing at each part of the merged vertices', () => {
    const parts = [boxPart(1), boxPart(0.5)];
    const firstIndices = parts[0]!.getIndex()!.count;
    const firstVertices = parts[0]!.getAttribute('position').count;
    const rig = new PartRig(fakeStage(), new THREE.Group(), parts.map((geometry) => ({ geometry })), 1);
    const index = rig.body.geometry.getIndex()!;
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = firstIndices; i < index.count; i += 1) lowest = Math.min(lowest, index.getX(i));
    expect(lowest).toBe(firstVertices);
  });

  it('stores each copy and part matrix where the shader reads it', () => {
    const rig = new PartRig(fakeStage(), new THREE.Group(), [{ geometry: boxPart(1) }, { geometry: boxPart(1) }], 4);
    const matrices = [
      [0, 0, at(1, 2, 3)],
      [0, 1, at(-4, 0, 1, [0.3, 0.2, 0.1], [2, 1, 0.5])],
      [3, 1, at(7, -2, 5, [0, 1.2, 0])],
    ] as const;
    for (const [copy, part, matrix] of matrices) rig.setMatrix(copy, part, matrix);
    // The texture holds 32-bit floats, as the GPU does.
    for (const [copy, part, matrix] of matrices) {
      readPart(rig, copy, part).elements.forEach((value, i) => expect(value).toBeCloseTo(matrix.elements[i]!, 5));
    }
  });

  it('draws nothing when nothing is on show, and shows exactly the committed copies', () => {
    const rig = new PartRig(fakeStage(), new THREE.Group(), [{ geometry: boxPart(1, true) }], 5);
    expect(rig.all.every((mesh) => mesh.count === 0)).toBe(true);
    rig.commit(3);
    expect(rig.all.length).toBe(5);
    expect(rig.all.every((mesh) => mesh.count === 3)).toBe(true);
  });

  it('can be culled as one, from a sphere around every copy', () => {
    const rig = new PartRig(fakeStage(), new THREE.Group(), [{ geometry: boxPart(1) }], 2);
    rig.setBounds(new THREE.Sphere(new THREE.Vector3(1, 2, 3), 4));
    expect(rig.all.every((mesh) => mesh.frustumCulled && mesh.boundingSphere?.radius === 4)).toBe(true);
    rig.setBounds(null);
    expect(rig.all.every((mesh) => !mesh.frustumCulled)).toBe(true);
  });
});

describe('toy rigs', () => {
  it('follow the empty objects that stand for their pieces, and hide hidden ones', () => {
    const space = new THREE.Group();
    space.position.set(10, 0, 0);
    const toy = new ToyRig();
    const arm = toy.part(space, boxPart(1));
    const hand = toy.part(arm, boxPart(0.5));
    const clock = { value: 0 };
    const rig = toy.build(fakeStage(), space, clock);
    arm.position.set(0, 2, 0);
    arm.rotation.z = 0.5;
    hand.position.set(1, 0, 0);
    space.updateMatrixWorld(true);
    clock.value = 1;
    rig.body.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    const expected = hand.matrixWorld.clone().premultiply(space.matrixWorld.clone().invert());
    readPart(rig, 0, 1).elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]!, 6));

    arm.visible = false;
    clock.value = 2;
    rig.body.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    expect(readPart(rig, 0, 0).elements).toEqual(RIG_HIDDEN.elements);
    // The hand is hidden with its parent, so nothing at all is drawn.
    expect(readPart(rig, 0, 1).elements).toEqual(RIG_HIDDEN.elements);
    expect(rig.body.count).toBe(0);
  });
});

describe('the flake atlas', () => {
  it('holds every shape on the shared triangle list, five rows each', () => {
    const atlas = flakeAtlas(FLAKE_DETAIL_LOW);
    const vertices = lowFlake(0).getAttribute('position').count;
    expect(atlas.texture.image.width).toBe(vertices);
    expect(atlas.texture.image.height).toBe(FLAKE_SHAPES * ATLAS_ROWS.length);
    const data = atlas.texture.image.data as Float32Array;
    for (let shape = 0; shape < FLAKE_SHAPES; shape += 1) {
      const flake = lowFlake(shape);
      expect(Array.from(flake.getIndex()!.array)).toEqual(Array.from(atlas.index.array));
      ATLAS_ROWS.forEach((name, row) => {
        const attribute = flake.getAttribute(name);
        for (const vertex of [0, Math.floor(vertices / 2), vertices - 1]) {
          const at = ((shape * ATLAS_ROWS.length + row) * vertices + vertex) * 4;
          expect(data[at]).toBeCloseTo(attribute.getX(vertex), 5);
          expect(data[at + 2]).toBeCloseTo(attribute.getZ(vertex), 5);
        }
      });
    }
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_RECIPES } from '../../src/audio/bank.ts';
import { SAMPLE_RATE, synthSpace } from '../../src/audio/dsp.ts';
import { BED_LAYERS, bedMix, spaceForStage, SPACES } from '../../src/audio/mix.ts';
import { STAGES } from '../../src/content/stages.ts';
import * as THREE from 'three';
import { CALM_ENTRANCE, ENTRANCES, type Entrance, type EntrancePose } from '../../src/render/machines/entrances.ts';
import { planetRingPath, ringPath } from '../../src/render/scenes/paths.ts';
import { COMBO_PITCH, comboColor, comboTier, reachedTier } from '../../src/render/fx/combo.ts';
import { photoFileName } from '../../src/ui/photo.ts';

const restPose = (): EntrancePose => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });

function poseAt(entrance: Entrance, t: number): EntrancePose {
  const pose = restPose();
  entrance.pose(t, pose, 0);
  return pose;
}

describe('the production mix', () => {
  it('has a recording for every layer', () => {
    for (const layer of BED_LAYERS) expect(SOUND_RECIPES[layer], layer).toBeTypeOf('function');
  });

  it('is silent with no production and brings each layer in on the way up', () => {
    expect(Object.values(bedMix(0).layers).every((gain) => gain === 0)).toBe(true);
    for (const layer of BED_LAYERS) {
      const loudest = Math.max(...Array.from({ length: 73 }, (_, i) => bedMix(i / 10).layers[layer]));
      expect(loudest, layer).toBeGreaterThan(0.1);
    }
  });

  it('adds weight at the end: the deepest layers only arrive late', () => {
    expect(bedMix(4).layers['layer-rumble']).toBe(0);
    expect(bedMix(5).layers['layer-swell']).toBe(0);
    expect(bedMix(7).layers['layer-rumble']).toBeGreaterThan(1);
    expect(bedMix(7).musicBassDb).toBeLessThan(-6);
  });

  it('clears more room for clicks as the heap gets louder', () => {
    expect(bedMix(7).clickDuck).toBeGreaterThan(bedMix(1).clickDuck);
  });
});

describe('rooms', () => {
  it('has one for every scene, and later stages stay in the last one', () => {
    expect(SPACES).toHaveLength(STAGES.length);
    expect(spaceForStage(99)).toBe(SPACES.length - 1);
  });

  it('builds a different tail for each ear, at any sample rate', () => {
    for (const rate of [SAMPLE_RATE, 48000]) {
      for (const space of SPACES) {
        const left = synthSpace(space, 0, rate);
        const right = synthSpace(space, 1, rate);
        expect(left.length).toBe(Math.ceil((space.preDelay + space.decay) * rate));
        expect(left.some((value, index) => value !== right[index]), space.name).toBe(true);
        expect(Math.max(...left.subarray(0, 8000).map(Math.abs))).toBeLessThanOrEqual(0.8001);
      }
    }
  });
});

describe('machine paths', () => {
  const options = { spacing: 4, speed: 2, scale: 1.5, capacity: 8 };
  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const up = new THREE.Vector3();

  it('runs a level ring all the way round, heading along it', () => {
    const path = ringPath(2, -1, 10, 0.5, options);
    expect(path.length).toBeCloseTo(Math.PI * 20);
    for (const d of [0, 7, path.length / 3, path.length - 1]) {
      path.sample(d, position, tangent, up);
      expect(Math.hypot(position.x - 2, position.z + 1)).toBeCloseTo(10);
      expect(position.y).toBeCloseTo(0.5);
      expect(tangent.dot(new THREE.Vector3(position.x - 2, 0, position.z + 1))).toBeCloseTo(0);
      expect(up.y).toBe(1);
    }
    path.sample(path.length, position, tangent, up);
    const end = position.clone();
    path.sample(0, position, tangent, up);
    expect(end.distanceTo(position)).toBeLessThan(1e-6);
  });

  it('keeps a planet ring on the ground, leaning with it', () => {
    const path = planetRingPath(34, 14, 0, options);
    for (const d of [0, 11, 40]) {
      path.sample(d, position, tangent, up);
      // On the ball whose center is 34 below the top.
      expect(position.distanceTo(new THREE.Vector3(0, -34, 0))).toBeCloseTo(34);
      expect(up.dot(position.clone().add(new THREE.Vector3(0, 34, 0)).normalize())).toBeCloseTo(1);
      expect(tangent.dot(up)).toBeCloseTo(0);
    }
  });
});

describe('machine entrances', () => {
  const kinds = Object.keys(ENTRANCES) as Array<keyof typeof ENTRANCES>;

  it('covers all fifteen machines', () => {
    expect(kinds).toHaveLength(15);
  });

  it.each(kinds)('%s ends exactly where the machine stands, so it never snaps into place', (kind) => {
    const entrance = ENTRANCES[kind];
    const end = poseAt(entrance, entrance.seconds);
    for (const axis of ['x', 'y', 'z', 'rx', 'rz'] as const) expect(Math.abs(end[axis]), axis).toBeLessThan(0.02);
    for (const axis of ['sx', 'sy', 'sz'] as const) expect(Math.abs(end[axis] - 1), axis).toBeLessThan(0.02);
  });

  it.each(kinds)('%s really moves, and its timed events happen while it does', (kind) => {
    const entrance = ENTRANCES[kind];
    const start = poseAt(entrance, 0.02);
    const end = poseAt(entrance, entrance.seconds);
    const change = Object.keys(start).reduce((sum, key) => sum + Math.abs(start[key as keyof EntrancePose] - end[key as keyof EntrancePose]), 0);
    expect(change).toBeGreaterThan(0.2);
    entrance.beats.reduce((previous, beat) => {
      expect(beat.at).toBeGreaterThanOrEqual(previous);
      expect(beat.at).toBeLessThan(entrance.seconds);
      return beat.at;
    }, 0);
  });

  it('are all different from one another', () => {
    const signatures = kinds.map((kind) => JSON.stringify(poseAt(ENTRANCES[kind], 0.3)));
    expect(new Set(signatures).size).toBe(kinds.length);
  });

  it('stay out of the way with reduced motion', () => {
    expect(CALM_ENTRANCE.beats).toHaveLength(0);
    expect(CALM_ENTRANCE.seconds).toBeLessThan(0.4);
    const pose = poseAt(CALM_ENTRANCE, 0);
    expect(Math.hypot(pose.x, pose.y, pose.z)).toBe(0);
  });
});

describe('machine sounds', () => {
  const dir = 'src/render/machines';
  const names = readdirSync(dir).flatMap((file) => [...readFileSync(join(dir, file), 'utf8').matchAll(/\bsound\('([a-z-]+)'/g)].map((match) => match[1]!));

  it('only uses sounds that exist', () => {
    expect(names.length).toBeGreaterThan(15);
    for (const name of names) expect(SOUND_RECIPES[name], name).toBeTypeOf('function');
  });

  it('gives every machine its own arrival', () => {
    for (const kind of Object.keys(ENTRANCES)) expect(names, kind).toContain(`arrive-${kind}`);
  });

  it('gives the four new machines a working sound', () => {
    for (const name of ['ding', 'truck-horn', 'airship-drop', 'orbital-zap']) expect(names, name).toContain(name);
  });
});

describe('combo tiers', () => {
  it('steps up at 12, 24, 48 and 96, and says when a click reached a new tier', () => {
    expect([11, 12, 23, 24, 47, 48, 95, 96, 400].map(comboTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([12, 24, 36, 48, 60, 96, 108].map(reachedTier)).toEqual([true, true, false, true, false, true, false]);
  });

  it('gives each tier its own light, the top one turning through the rainbow', () => {
    const a = comboColor(4, 0, new THREE.Color());
    const b = comboColor(4, 0.5, new THREE.Color());
    expect(a.equals(b)).toBe(false);
    expect(comboColor(1, 0, new THREE.Color()).equals(comboColor(2, 0, new THREE.Color()))).toBe(false);
    expect(comboColor(2, 0, new THREE.Color()).equals(comboColor(2, 0.7, new THREE.Color()))).toBe(true);
    // The sound climbs with every tier.
    for (let i = 1; i < COMBO_PITCH.length; i += 1) expect(COMBO_PITCH[i]).toBeGreaterThan(COMBO_PITCH[i - 1]!);
  });
});

describe('photo mode', () => {
  it('names a photo after its scene and the moment it was taken', () => {
    const at = new Date(2026, 10, 22, 9, 5, 7);
    expect(photoFileName(0, at)).toBe('popcorn-stove-20261122-090507.png');
    expect(photoFileName(4, at)).toBe('popcorn-earth-20261122-090507.png');
    // Past the last scene (the ending) it stays the planet.
    expect(photoFileName(9, at)).toBe('popcorn-earth-20261122-090507.png');
  });

  it('has a shutter sound', () => {
    expect(SOUND_RECIPES['ui-shutter'], 'ui-shutter').toBeTypeOf('function');
    expect(SOUND_RECIPES['ui-shutter']!().length).toBeGreaterThan(0);
  });
});

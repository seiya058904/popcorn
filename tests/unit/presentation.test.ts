import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_RECIPES } from '../../src/audio/bank.ts';
import { SAMPLE_RATE, synthSpace } from '../../src/audio/dsp.ts';
import { BED_LAYERS, bedMix, spaceForStage, SPACES } from '../../src/audio/mix.ts';
import { STAGES } from '../../src/content/stages.ts';
import { CALM_ENTRANCE, ENTRANCES, type Entrance, type EntrancePose } from '../../src/render/machines/entrances.ts';

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

describe('machine entrances', () => {
  const kinds = Object.keys(ENTRANCES) as Array<keyof typeof ENTRANCES>;

  it('covers all ten machines', () => {
    expect(kinds).toHaveLength(10);
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

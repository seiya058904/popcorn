import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyLamps, globals, LIGHT_GROUPS, lightGroup, type Lamp } from '../../src/render/core/globals.ts';
import { Kit, P } from '../../src/render/geometry/kit.ts';
import { SetPieces } from '../../src/render/scenes/pieces.ts';
import { alongStory, LightBank, mixRig, moodScratch, storyMood, storyWeights, type Story } from '../../src/render/scenes/story.ts';
import type { SceneContext } from '../../src/render/scenes/types.ts';
import { cinemaSpec } from '../../src/render/scenes/cinema.ts';
import { earthSpec } from '../../src/render/scenes/earth.ts';
import { kitchenSpec } from '../../src/render/scenes/kitchen.ts';
import { stoveSpec } from '../../src/render/scenes/stove.ts';
import { townSpec } from '../../src/render/scenes/town.ts';

const SPECS = [stoveSpec, kitchenSpec, cinemaSpec, townSpec, earthSpec];
const hex = (color: THREE.ColorRepresentation): string => new THREE.Color(color).getHexString();

describe('the story of a scene', () => {
  it('moves through its three looks in order and stays put at either end', () => {
    expect(storyWeights(0)).toEqual([0, 0]);
    expect(storyWeights(1)).toEqual([1, 1]);
    let previous = storyWeights(0);
    for (let i = 1; i <= 100; i += 1) {
      const weights = storyWeights(i / 100);
      expect(weights[0]).toBeGreaterThanOrEqual(previous[0]);
      expect(weights[1]).toBeGreaterThanOrEqual(previous[1]);
      // The late look only starts once the middle one has fully arrived.
      if (weights[1] > 0) expect(weights[0]).toBe(1);
      previous = weights;
    }
  });

  it('gives every scene a story whose light starts at the spec and ends at the late look', () => {
    for (const spec of SPECS) {
      const story = spec.story as Story;
      expect(story, `scene ${spec.id}`).toBeDefined();
      const start = storyMood(spec.light, spec.grade, story, 0, moodScratch());
      expect(hex(start.rig.sunColor)).toBe(hex(spec.light.sunColor));
      expect(start.grade.exposure).toBeCloseTo(spec.grade.exposure);
      const end = storyMood(spec.light, spec.grade, story, 1, moodScratch());
      expect(hex(end.rig.sunColor)).toBe(hex(story.late.light.sunColor));
      expect(end.rig.sunIntensity).toBeCloseTo(story.late.light.sunIntensity);
      expect(end.grade.bloom).toBeCloseTo(story.late.grade.bloom);
    }
  });

  it('blends light without making new objects once it has its scratch space', () => {
    const scratch = moodScratch();
    const rig = scratch.rig;
    const color = scratch.rig.sunColor;
    storyMood(townSpec.light, townSpec.grade, townSpec.story, 0.7, scratch);
    expect(scratch.rig).toBe(rig);
    expect(scratch.rig.sunColor).toBe(color);
    // Halfway between two rigs, colors and numbers land halfway too.
    const mixed = mixRig(townSpec.light, townSpec.story!.late.light, 0.5);
    expect(mixed.sunIntensity).toBeCloseTo((townSpec.light.sunIntensity + townSpec.story!.late.light.sunIntensity) / 2);
  });

  it('walks a three-step look along the story', () => {
    const seen: Array<[string, string, number]> = [];
    const looks: [string, string, string] = ['day', 'dusk', 'night'];
    for (const u of [0, 0.3, 0.6, 1]) alongStory(u, looks, (from, to, t) => seen.push([from, to, Number(t.toFixed(2))]));
    expect(seen[0]).toEqual(['day', 'dusk', 0]);
    expect(seen[1]![0]).toBe('day');
    expect(seen[2]![0]).toBe('dusk');
    expect(seen[3]).toEqual(['dusk', 'night', 1]);
  });
});

describe('light groups', () => {
  it('number eight per scene without overlapping', () => {
    const all = new Set<number>();
    for (let scene = 0; scene < 5; scene += 1) for (let index = 0; index < 8; index += 1) all.add(lightGroup(scene, index));
    expect(all.size).toBe(40);
    expect(Math.min(...all)).toBe(1);
    expect(Math.max(...all)).toBe(LIGHT_GROUPS);
  });

  it('travel in the glow channel, where the shader can take them apart again', () => {
    const kit = new Kit();
    kit.add(P.box(1, 1, 1), { color: '#ffffff', emissive: 0.72, light: lightGroup(3, 2) });
    kit.add(P.box(1, 1, 1), { color: '#ffffff', emissive: 0.45, light: lightGroup(3, 6), lightKeepsPaint: true });
    kit.add(P.box(1, 1, 1), { color: '#ffffff', emissive: 1 });
    const glow = kit.build().getAttribute('aMat');
    const decode = (value: number): { group: number; painted: boolean; emissive: number } => {
      const code = Math.floor(value * 0.5);
      const painted = code > 40;
      return { group: code - (painted ? 40 : 0), painted, emissive: value - code * 2 };
    };
    const first = decode(glow.getY(0));
    expect(first.group).toBe(lightGroup(3, 2));
    expect(first.painted).toBe(false);
    expect(first.emissive).toBeCloseTo(0.72);
    const painted = decode(glow.getY(glow.count / 3 + 1));
    expect(painted.group).toBe(lightGroup(3, 6));
    expect(painted.painted).toBe(true);
    expect(painted.emissive).toBeCloseTo(0.45);
    // Ordinary glow stays below the range that means a group.
    expect(glow.getY(glow.count - 1)).toBe(1);
  });

  it('switch on in turn as the scene fills, and fade back out', () => {
    const bank = new LightBank(2, [{ at: 0.3 }, { at: 0.6, style: 'neon' }, {}]);
    const lit = (index: number): number => globals.uLit.value[lightGroup(2, index) - 1]!;
    bank.update(0.1, 0.1, true, false);
    expect([lit(0), lit(1), lit(2)]).toEqual([0, 0, 0]);
    for (let i = 0; i < 30; i += 1) bank.update(0.4, 0.05, false, false);
    expect(lit(0)).toBe(1);
    expect(lit(1)).toBe(0);
    bank.want(2, true);
    for (let i = 0; i < 30; i += 1) bank.update(0.7, 0.05, false, false);
    expect([lit(0), lit(1), lit(2)]).toEqual([1, 1, 1]);
    bank.dim(0, 0.25);
    bank.update(0.7, 0.05, false, false);
    expect(lit(0)).toBeCloseTo(0.25);
    for (let i = 0; i < 30; i += 1) bank.update(0, 0.05, false, false);
    expect(lit(1)).toBe(0);
  });

  it('stutters when neon catches, but only fades with reduced motion', () => {
    const neon = new LightBank(1, [{ at: 0.5, style: 'neon' }]);
    neon.update(0, 0, true, false);
    const levels: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      neon.update(1, 1 / 30, false, false);
      levels.push(neon.level(0));
    }
    // Somewhere in the first third of a second it drops back before it holds.
    expect(levels.some((level, i) => i > 0 && level < levels[i - 1]!)).toBe(true);
    expect(levels[levels.length - 1]).toBe(1);
    const calm = new LightBank(1, [{ at: 0.5, style: 'neon' }]);
    calm.update(0, 0, true, true);
    const calmLevels: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      calm.update(1, 1 / 30, false, true);
      calmLevels.push(calm.level(0));
    }
    expect(calmLevels.every((level, i) => i === 0 || level >= calmLevels[i - 1]!)).toBe(true);
  });
});

describe('lamps', () => {
  it('skip anything switched off and keep room for event lights', () => {
    const lamp = (intensity: number): Lamp => ({ position: [0, 0, 0], color: '#ffffff', intensity, radius: 4 });
    applyLamps([lamp(1), lamp(0), lamp(0.5)], 0, 12, [lamp(0), lamp(2)]);
    expect(globals.uLampCount.value).toBe(3);
    applyLamps([lamp(1), lamp(1), lamp(1)], 0, 2, [lamp(2)]);
    // The quality limit applies to the scene's own lamps, not to a moment's flash.
    expect(globals.uLampCount.value).toBe(3);
  });
});

describe('set pieces', () => {
  const context = (): SceneContext =>
    ({ time: 0, level: 0, intensity: 0, attract: false, rng: { range: (a: number) => a, next: () => 0.5 }, sprites: { spawn: () => undefined }, ground: () => 0 }) as unknown as SceneContext;

  it('keep a decoration hidden until it is owned, then pop it in', () => {
    const root = new THREE.Group();
    const pieces = new SetPieces(root);
    const neon = pieces.group(root);
    neon.scale.setScalar(0.8);
    pieces.part(P.box(1, 1, 1), neon);
    pieces.decoration('decor-neon', neon, 1);
    expect(neon.visible).toBe(false);
    pieces.sync(['decor-neon'], true);
    expect(neon.visible).toBe(true);
    expect(neon.scale.x).toBeLessThan(0.01);
    const ctx = context();
    for (let i = 0; i < 60; i += 1) pieces.update(1 / 60, ctx);
    expect(neon.scale.x).toBeCloseTo(0.8);
    pieces.sync([], true);
    expect(neon.visible).toBe(false);
  });

  it('show an owned decoration straight away when a save is loaded', () => {
    const root = new THREE.Group();
    const pieces = new SetPieces(root);
    const rug = pieces.group(root);
    pieces.decoration('decor-rug', rug, 1);
    pieces.sync(['decor-rug'], false);
    expect(rug.visible).toBe(true);
    expect(rug.scale.x).toBe(1);
    expect(pieces.owns('decor-rug')).toBe(true);
  });
});

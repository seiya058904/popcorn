import * as THREE from 'three';
import { globals, GROUPS_PER_SCENE, type LightRig } from '../core/globals.ts';
import type { Grade } from './types.ts';

/**
 * How a scene changes as it fills up. Each one has three looks: its own light at the start, a
 * middle look and a late one, which the camera's light and color grade blend through. The set
 * itself follows along through the scene's `progress` hook.
 */
export interface Mood {
  light: LightRig;
  grade: Grade;
}

export interface Story {
  mid: Mood;
  late: Mood;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far toward the middle look, and from there toward the late one, a scene is at progress u. */
export function storyWeights(u: number): [number, number] {
  return [smooth(STORY_MID[0], STORY_MID[1], u), smooth(STORY_LATE[0], STORY_LATE[1], u)];
}

/**
 * Walks something with three looks along the story: from the first look to the middle one, then
 * on to the late one, calling `apply` with the pair in play and how far between them it is.
 */
export function alongStory<T>(u: number, looks: readonly [T, T, T], apply: (from: T, to: T, t: number) => void): void {
  const [toMid, toLate] = storyWeights(u);
  if (toLate > 0) apply(looks[1], looks[2], toLate);
  else apply(looks[0], looks[1], toMid);
}

/** Progress over which a scene moves into its middle look, and then into its late one. */
const STORY_MID = [0.12, 0.5] as const;
const STORY_LATE = [0.55, 0.92] as const;

const colorA = new THREE.Color();
const colorB = new THREE.Color();

export function blankRig(): LightRig {
  return {
    sunDir: [0, 1, 0],
    sunColor: new THREE.Color(),
    sunIntensity: 1,
    shadeTint: new THREE.Color(),
    sky: new THREE.Color(),
    skyIntensity: 0,
    ground: new THREE.Color(),
    groundIntensity: 0,
    rim: new THREE.Color(),
    rimIntensity: 0,
    rimDir: [0, 0, 1],
    fog: new THREE.Color(),
    fogRange: [1, 2],
    pool: [0, 0, 0, 1],
    poolFloor: 1,
  };
}

export function blankGrade(): Grade {
  return {
    exposure: 1,
    contrast: 1,
    saturation: 1,
    vignette: 0,
    bloom: 0,
    shadowTint: new THREE.Color(),
    highlightTint: new THREE.Color(),
    aoTint: new THREE.Color(),
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const logLerp = (a: number, b: number, t: number): number => Math.exp(lerp(Math.log(a), Math.log(b), t));

/** `out` must have been made by blankRig: its colors and tuples are written in place. */
function mixColor(out: THREE.ColorRepresentation, a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): void {
  (out as THREE.Color).copy(colorA.set(a)).lerp(colorB.set(b), t);
}

/** Light partway from `a` to `b`. Without `out` the result is a new object. */
export function mixRig(a: LightRig, b: LightRig, t: number, out: LightRig = blankRig()): LightRig {
  for (let i = 0; i < 3; i += 1) {
    out.sunDir[i] = lerp(a.sunDir[i]!, b.sunDir[i]!, t);
    out.rimDir[i] = lerp(a.rimDir[i]!, b.rimDir[i]!, t);
    out.pool[i] = lerp(a.pool[i]!, b.pool[i]!, t);
  }
  mixColor(out.sunColor, a.sunColor, b.sunColor, t);
  mixColor(out.shadeTint, a.shadeTint, b.shadeTint, t);
  mixColor(out.sky, a.sky, b.sky, t);
  mixColor(out.ground, a.ground, b.ground, t);
  mixColor(out.rim, a.rim, b.rim, t);
  mixColor(out.fog, a.fog, b.fog, t);
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  out.skyIntensity = lerp(a.skyIntensity, b.skyIntensity, t);
  out.groundIntensity = lerp(a.groundIntensity, b.groundIntensity, t);
  out.rimIntensity = lerp(a.rimIntensity, b.rimIntensity, t);
  out.fogRange[0] = logLerp(a.fogRange[0], b.fogRange[0], t);
  out.fogRange[1] = logLerp(a.fogRange[1], b.fogRange[1], t);
  out.pool[3] = logLerp(a.pool[3], b.pool[3], t);
  out.poolFloor = lerp(a.poolFloor, b.poolFloor, t);
  return out;
}

export function mixGrade(a: Grade, b: Grade, t: number, out: Grade = blankGrade()): Grade {
  out.exposure = lerp(a.exposure, b.exposure, t);
  out.contrast = lerp(a.contrast, b.contrast, t);
  out.saturation = lerp(a.saturation, b.saturation, t);
  out.vignette = lerp(a.vignette, b.vignette, t);
  out.bloom = lerp(a.bloom, b.bloom, t);
  mixColor(out.shadowTint, a.shadowTint, b.shadowTint, t);
  mixColor(out.highlightTint, a.highlightTint, b.highlightTint, t);
  mixColor(out.aoTint, a.aoTint, b.aoTint, t);
  return out;
}

/** Scratch space for storyMood, so a frame of camera work allocates nothing. */
export interface MoodScratch {
  rig: LightRig;
  grade: Grade;
  stepRig: LightRig;
  stepGrade: Grade;
}

export function moodScratch(): MoodScratch {
  return { rig: blankRig(), grade: blankGrade(), stepRig: blankRig(), stepGrade: blankGrade() };
}

/** The light and grade of a scene at progress u, written into `scratch.rig` and `scratch.grade`. */
export function storyMood(light: LightRig, grade: Grade, story: Story | undefined, u: number, scratch: MoodScratch): MoodScratch {
  if (!story) {
    mixRig(light, light, 0, scratch.rig);
    mixGrade(grade, grade, 0, scratch.grade);
    return scratch;
  }
  mixRig(light, story.mid.light, smooth(STORY_MID[0], STORY_MID[1], u), scratch.stepRig);
  mixGrade(grade, story.mid.grade, smooth(STORY_MID[0], STORY_MID[1], u), scratch.stepGrade);
  mixRig(scratch.stepRig, story.late.light, smooth(STORY_LATE[0], STORY_LATE[1], u), scratch.rig);
  mixGrade(scratch.stepGrade, story.late.grade, smooth(STORY_LATE[0], STORY_LATE[1], u), scratch.grade);
  return scratch;
}

export interface LightSwitch {
  /** Progress at which the group switches on; leave out for a group the scene drives itself. */
  at?: number;
  /** Neon and tubes stutter on; bulbs warm up. */
  style?: 'neon' | 'bulb';
}

/** Neon catching: on, off, on, nearly off, on. */
const STUTTER: Array<[number, number]> = [[0, 1], [0.05, 0.12], [0.11, 0.9], [0.2, 0.25], [0.27, 1]];
const STUTTER_END = 0.34;
const WARM_UP = 0.32;
const FADE_OUT = 0.3;

/**
 * One scene's eight light groups. Each switches on as the scene fills past its own point, or when
 * the scene says so, and is written to the shared uniform the toy shader reads.
 */
export class LightBank {
  private readonly base: number;
  private readonly switches: readonly LightSwitch[];
  private readonly shown: number[];
  private readonly wanted: Array<boolean | null>;
  private readonly since: number[];
  private readonly scale: number[];

  constructor(scene: number, switches: readonly LightSwitch[]) {
    if (switches.length > GROUPS_PER_SCENE) throw new Error(`A scene has ${GROUPS_PER_SCENE} light groups`);
    this.base = scene * GROUPS_PER_SCENE;
    this.switches = switches;
    this.shown = switches.map(() => 0);
    this.wanted = switches.map(() => null);
    this.since = switches.map(() => 0);
    this.scale = switches.map(() => 1);
    this.write();
  }

  /** Turns a group the scene drives itself on or off; it stutters or warms up like the others. */
  want(index: number, on: boolean): void {
    this.wanted[index] = on;
  }

  /** Dims or brightens a group continuously, on top of whether it is switched on. */
  dim(index: number, scale: number): void {
    this.scale[index] = scale;
  }

  isOn(index: number): boolean {
    return this.shown[index]! > 0.5;
  }

  /** How bright a group is right now, 0 to 1, for lamps that should follow it. */
  level(index: number): number {
    return this.shown[index]! * this.scale[index]!;
  }

  /** `instant` skips the switching, for a freshly loaded save; `calm` replaces stutter with a fade. */
  update(u: number, dt: number, instant: boolean, calm: boolean): void {
    this.switches.forEach((entry, index) => {
      const on = entry.at !== undefined ? u >= entry.at : this.wanted[index] === true;
      const shown = this.shown[index]!;
      if (instant) {
        this.shown[index] = on ? 1 : 0;
        this.since[index] = 9;
        return;
      }
      if (on) {
        if (shown <= 0 || this.since[index]! < 0) this.since[index] = 0;
        this.since[index]! += dt;
        const s = this.since[index]!;
        if (calm) this.shown[index] = Math.min(1, shown + dt / 0.5);
        else if (entry.style === 'neon' && s < STUTTER_END) this.shown[index] = stutter(s);
        else if (entry.style !== 'neon' && s < WARM_UP) this.shown[index] = Math.max(shown, (s / WARM_UP) ** 2);
        else this.shown[index] = 1;
      } else {
        this.since[index] = -1;
        this.shown[index] = Math.max(0, shown - dt / FADE_OUT);
      }
    });
    this.write();
  }

  private write(): void {
    const lit = globals.uLit.value;
    for (let i = 0; i < this.switches.length; i += 1) lit[this.base + i] = this.shown[i]! * this.scale[i]!;
  }
}

function stutter(s: number): number {
  let value = 1;
  for (const [at, level] of STUTTER) if (s >= at) value = level;
  return value;
}

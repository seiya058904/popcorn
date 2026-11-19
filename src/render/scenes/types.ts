import type * as THREE from 'three';
import type { Rng } from '../../motion/rng.ts';
import type { Lamp, LightRig } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import type { Sprites } from '../fx/sprites.ts';
import type { PopDirector } from '../popcorn/director.ts';
import type { PileShape } from '../popcorn/pile.ts';
import type { Story } from './story.ts';

export interface Grade {
  exposure: number;
  contrast: number;
  saturation: number;
  vignette: number;
  bloom: number;
  shadowTint: THREE.ColorRepresentation;
  highlightTint: THREE.ColorRepresentation;
  aoTint: THREE.ColorRepresentation;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface UnitSlot {
  x: number;
  y: number;
  z: number;
  rotation?: number;
  scale?: number;
  /** Leans the machine so its up follows this direction, e.g. the ground of a small planet. */
  up?: THREE.Vector3;
}

/**
 * A closed loop that machines ride along one behind another, like cars on a ring track. Its
 * slots are recomputed every frame; the first copy leads.
 */
export interface UnitPath {
  /** Length of the whole loop, in scene units. */
  length: number;
  /** Where the loop is `distance` along, which way it runs there and which way is up. */
  sample(distance: number, position: THREE.Vector3, tangent: THREE.Vector3, up: THREE.Vector3): void;
  /** Gap between one copy and the next, in scene units. */
  spacing: number;
  /** Scene units per second. */
  speed: number;
  scale: number;
  /** Most copies that fit on the loop. */
  capacity: number;
}

export interface HeroCannonPose {
  position: THREE.Vector3;
  rotation: number;
  scale: number;
}

/** The closing show, played by the last scene once the run has ended. */
export interface FinalePlan {
  duration: number;
  beats: Array<[number, FinaleBeat]>;
  camera(t: number): { position: THREE.Vector3; target: THREE.Vector3 };
  update(t: number, dt: number, ctx: SceneContext): void;
  /** Jumps to the aftermath, for a save that has already seen the ending. */
  showFinal(): void;
}

export type FinaleBeat = 'moon-heat' | 'moon-silence' | 'moon-pop' | 'hand' | 'grab';

export interface SceneContext {
  time: number;
  level: number;
  /** Rate of the whole economy on a log scale, 0 when idle. */
  intensity: number;
  /** True behind the title screen. */
  attract: boolean;
  sprites: Sprites;
  director: PopDirector;
  rng: Rng;
  /** Height of the popcorn, or of the floor where there is none, so figures can stand on top. */
  ground(x: number, z: number): number;
}

/** The hand-built, scene-specific part of a stage. */
export interface SceneParts {
  /** Animates ambient life: clocks, lamps, steam, gags. */
  update(dt: number, ctx: SceneContext): void;
  /** Reaction to a manual pop or machine activity. */
  kick?(strength: number): void;
  /** Build-up before the breakout, u from 0 to 1. */
  strain?(u: number, ctx: SceneContext): void;
  /** The moment the container gives way. */
  blast?(ctx: SceneContext): void;
  /** Free-flight of anything thrown by the blast. */
  afterBlast?(dt: number, ctx: SceneContext): void;
  /** Upgrades that change the set, such as a conveyor between machines. `animate` is false when a save is loaded. */
  upgradesChanged?(owned: readonly string[], animate: boolean): void;
  /**
   * How full the scene is, 0 to 1, every frame before update: the set moves along its story.
   * `instant` means a save was just loaded, so lights and the like should be where they belong at once;
   * `calm` asks for reduced motion, so lights fade instead of stuttering on.
   */
  progress?(u: number, dt: number, instant: boolean, calm: boolean): void;
  /** The scene's own lamps, when it switches them on and off; otherwise the spec's are used. */
  lamps?: Lamp[];
  /** Progress of the camera arriving in this scene, 0..1, for anything that must clear the path. */
  enter?(u: number): void;
  /** Called when this scene becomes a small prop inside the next one. */
  settleAsMiniature?(): void;
  finale?: FinalePlan;
  /** Tells the set how many units of a kind are on show, e.g. to light burners. */
  unitsChanged?(kind: UnitKindName, count: number): void;
}

export interface SceneSpec {
  id: number;
  light: LightRig;
  /** The middle and late looks the light and grade move through as the scene fills up. */
  story?: Story;
  /** Strength of the miniature-photography focus band in the wide shot, 0 to 1. */
  tiltShift?: number;
  /** Colors of the pieces thrown out when the vessel bursts. */
  debris?: string[];
  /** Practical lights that spill onto everything nearby. */
  lamps?: Lamp[];
  grade: Grade;
  camera: CameraPose;
  /** Opening framing, easing to `camera` as the heap needs room. */
  close: { target: THREE.Vector3; distance: number; lift: number };
  focusPoint: THREE.Vector3;
  focusRange: number;
  aoRadius: number;
  shadow: { center: THREE.Vector3; radius: number };
  pile: PileShape;
  homeRadius: number;
  /** Footprint of the big central object, when it is much wider than its opening. */
  vesselRadius?: number;
  /** Where this scene's heap center throws steam from. */
  steamY: number;
  /** Radius the flavor color has to travel to cover the whole heap. */
  spreadRadius: number;
  /** Placement of this scene inside the next one. */
  nest: { position: THREE.Vector3; scale: number; /** Local up direction when placed on a curved surface. */ tilt?: THREE.Vector3; /** How steeply the camera climbs out, relative to its distance. */ rise?: number } | null;
  slots: Partial<Record<UnitKindName, UnitSlot[]>>;
  /** Machines that travel instead of standing still. */
  paths?: Partial<Record<UnitKindName, UnitPath>>;
  cannon: HeroCannonPose | null;
  perches: THREE.Vector3[];
  /**
   * Builds the set a few milliseconds at a time: every `yield` is a point where the game may draw
   * a frame before going on, so a scene can be prepared in the background without a stall.
   */
  build(stage: Stage, root: THREE.Group): SceneBuild;
}

/** A scene set under construction; see SceneSpec.build. */
export type SceneBuild = Generator<void, SceneParts, void>;

export type UnitKindName =
  | 'pan'
  | 'microwave'
  | 'cart'
  | 'cannon'
  | 'cinema'
  | 'truck'
  | 'factory'
  | 'airship'
  | 'volcano'
  | 'orbital'
  | 'toaster'
  | 'mixer'
  | 'organ'
  | 'train'
  | 'typhoon';

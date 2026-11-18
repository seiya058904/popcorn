import type * as THREE from 'three';
import type { Rng } from '../../motion/rng.ts';
import type { LightRig } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import type { Sprites } from '../fx/sprites.ts';
import type { PopDirector } from '../popcorn/director.ts';
import type { PileShape } from '../popcorn/pile.ts';

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
  /** Called when this scene becomes a small prop inside the next one. */
  settleAsMiniature?(): void;
  finale?: FinalePlan;
  /** Tells the set how many units of a kind are on show, e.g. to light burners. */
  unitsChanged?(kind: UnitKindName, count: number): void;
}

export interface SceneSpec {
  id: number;
  light: LightRig;
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
  /** Where this scene's heap center throws steam from. */
  steamY: number;
  /** Radius the flavor color has to travel to cover the whole heap. */
  spreadRadius: number;
  /** Placement of this scene inside the next one. */
  nest: { position: THREE.Vector3; scale: number; /** Local up direction when placed on a curved surface. */ tilt?: THREE.Vector3 } | null;
  slots: Partial<Record<UnitKindName, UnitSlot[]>>;
  cannon: HeroCannonPose | null;
  perches: THREE.Vector3[];
  build(stage: Stage, root: THREE.Group): SceneParts;
}

export type UnitKindName = 'pan' | 'cart' | 'cannon' | 'cinema' | 'factory' | 'volcano';

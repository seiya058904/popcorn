import * as THREE from 'three';
import type { CannonResult } from '../events/game-events.ts';
import type { Rng } from '../motion/rng.ts';
import type { Stage } from './core/stage.ts';
import { Flock } from './fx/flock.ts';
import { Shovel } from './fx/shovel.ts';
import { SpriteKind, Sprites } from './fx/sprites.ts';
import { HeroCannon } from './hero-cannon.ts';
import { PieceBatches } from './popcorn/batches.ts';
import { PopDirector } from './popcorn/director.ts';
import { FlavorShow } from './popcorn/flavor.ts';
import { Pile } from './popcorn/pile.ts';
import type { SceneContext, SceneParts, SceneSpec, UnitKindName } from './scenes/types.ts';
import { UnitRig, type UnitHost } from './units.ts';

const UNIT_ORDER: UnitKindName[] = ['pan', 'cart', 'cannon', 'cinema', 'factory', 'volcano'];
/** New machines wait for the shovel to dig before they drop in. */
const UNIT_DROP_DELAY = 0.24;
/** Most machine-launched flakes per second; the rest are implied by the heap and the sound. */
const MACHINE_LAUNCHES_PER_SECOND = 7;

const flashColor = new THREE.Color(2.4, 1.8, 1);
const smokeColor = new THREE.Color(0.55, 0.5, 0.5);

export interface RuntimeHooks {
  onBurst(position: THREE.Vector3, combo: number, gain: number, manual: boolean): void;
  onLand(gain: number): void;
  onSquash(): void;
  onMachineCannon(): void;
}

/** Everything alive in one scene. Once outgrown it stays on as a static prop in the next one. */
export class SceneRuntime {
  readonly spec: SceneSpec;
  readonly root = new THREE.Group();
  readonly parts: SceneParts;
  readonly pile: Pile;
  readonly sprites: Sprites;
  readonly batches: PieceBatches | null = null;
  readonly director: PopDirector | null = null;
  readonly shovel: Shovel | null = null;
  readonly flavor: FlavorShow | null = null;
  readonly heroCannon: HeroCannon | null = null;
  readonly flock: Flock | null = null;
  private readonly rigs = new Map<UnitKindName, UnitRig>();
  private readonly rng: Rng;
  private launchBudget = 0;
  private live: boolean;

  constructor(stage: Stage, spec: SceneSpec, rng: Rng, hooks: RuntimeHooks, live: boolean) {
    this.spec = spec;
    this.rng = rng;
    this.live = live;
    this.parts = spec.build(stage, this.root);
    this.pile = new Pile(stage, this.root, spec.pile, live);
    this.sprites = new Sprites(this.root);
    if (!live) {
      this.pile.setLevel(1);
      this.pile.update(0);
      this.parts.settleAsMiniature?.();
      return;
    }
    this.pile.setLevel(0);
    this.pile.update(0);
    const k = spec.pile.k;
    this.batches = new PieceBatches(stage, this.root);
    this.director = new PopDirector(
      this.pile,
      this.batches,
      this.sprites,
      rng,
      {
        onSquash: () => {
          this.parts.kick?.(0);
          hooks.onSquash();
        },
        onBurst: (position, combo, gain, manual) => {
          if (manual) this.parts.kick?.(1);
          hooks.onBurst(position, combo, gain, manual);
        },
        onLand: (_position, gain) => hooks.onLand(gain),
      },
      spec.homeRadius,
    );
    this.shovel = new Shovel(stage, this.root, this.sprites, rng, k);
    this.flavor = new FlavorShow(stage, this.root, this.sprites, rng, spec.spreadRadius, k);
    if (spec.perches.length > 0) this.flock = new Flock(stage, this.root, spec.perches, 0.62 * k, rng);
    if (spec.cannon) this.heroCannon = new HeroCannon(stage, this.root, spec.cannon, this.sprites, this.director, rng);

    const host: UnitHost = {
      rng,
      launch: (x, y, z) => {
        if (this.launchBudget < 1) return;
        this.launchBudget -= 1;
        this.director!.launch(x, y, z);
      },
      flash: (x, y, z, size) =>
        this.sprites.spawn({ x, y, z, sizeStart: size, sizeEnd: size * 1.5, life: 0.11, color: flashColor, alpha: 1, additive: 1, kind: SpriteKind.Star }),
      smoke: (x, y, z, size) =>
        this.sprites.spawn({ x, y, z, vy: size * 0.8, drag: 1.5, sizeStart: size * 0.4, sizeEnd: size * 1.3, life: 0.9, color: smokeColor, alpha: 0.26, kind: SpriteKind.Puff }),
      onCannonFired: () => {
        this.flock?.scare();
        hooks.onMachineCannon();
      },
    };
    for (const kind of UNIT_ORDER) {
      const slots = spec.slots[kind];
      if (slots) this.rigs.set(kind, new UnitRig(stage, this.root, kind, slots, host));
    }
  }

  get isLive(): boolean {
    return this.live;
  }

  syncUnits(owned: readonly number[], animate: boolean): void {
    UNIT_ORDER.forEach((kind, index) => {
      const rig = this.rigs.get(kind);
      if (!rig) return;
      rig.sync(owned[index]!, animate, UNIT_DROP_DELAY);
      this.parts.unitsChanged?.(kind, rig.visible);
    });
  }

  fireCannon(result: CannonResult): void {
    this.heroCannon?.fire(result);
    if (result !== 'overpressure') this.flock?.scare();
  }

  update(dt: number, ctx: Omit<SceneContext, 'sprites' | 'director' | 'rng'>, cooling: boolean): void {
    const director = this.director;
    if (director) {
      const full: SceneContext = { ...ctx, sprites: this.sprites, director, rng: this.rng };
      this.launchBudget = Math.min(4, this.launchBudget + dt * MACHINE_LAUNCHES_PER_SECOND);
      this.pile.setLevel(ctx.level);
      director.update(dt);
      this.shovel?.update(dt);
      this.flavor?.update(dt, this.spec.pile.centerX, this.pile.heightAt(this.spec.pile.centerX, this.spec.pile.centerZ), this.spec.pile.centerZ);
      this.heroCannon?.update(dt, cooling);
      this.flock?.update(dt);
      const tempo = 1 + Math.min(1.6, ctx.intensity * 0.28);
      for (const rig of this.rigs.values()) rig.update(dt, ctx.time, tempo);
      this.parts.update(dt, full);
    }
    this.pile.update(dt);
    this.sprites.flush();
  }

  context(time: number, level: number, intensity: number): SceneContext | null {
    return this.director ? { time, level, intensity, sprites: this.sprites, director: this.director, rng: this.rng } : null;
  }

  /** Called once this scene has been outgrown and shrinks into a prop in the next one. */
  retire(): void {
    this.live = false;
    this.pile.setSurfaceVisible(false);
    this.batches && (this.batches.group.visible = false);
    this.sprites.mesh.visible = false;
    this.director?.hideHopper(false);
    this.parts.settleAsMiniature?.();
  }
}

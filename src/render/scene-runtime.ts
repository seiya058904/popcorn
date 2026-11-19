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

/** Same order as the producers, so a unit's index in the save picks its rig. */
const UNIT_ORDER: UnitKindName[] = ['pan', 'microwave', 'cart', 'cannon', 'cinema', 'truck', 'factory', 'airship', 'volcano', 'orbital'];
/** The vessel simmers on its own, matching the small income it makes without any machine. */
const SIMMER_POPS_PER_SECOND = 0.55;
/** New machines wait for the shovel to dig before they drop in. */
const UNIT_DROP_DELAY = 0.24;
/** Most machine-launched flakes per second; the rest are implied by the heap and the sound. */
const MACHINE_LAUNCHES_PER_SECOND = 7;

const flashColor = new THREE.Color(2.4, 1.8, 1);
const smokeColor = new THREE.Color(0.55, 0.5, 0.5);
const caramelColor = new THREE.Color('#d99a58');
const emberColor = new THREE.Color(2.8, 1.05, 0.25);

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
  private fountainBudget = 0;
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
      heightAt: (x, z) => this.pile.heightAt(x, z),
      flash: (x, y, z, size) =>
        this.sprites.spawn({ x, y, z, sizeStart: size, sizeEnd: size * 1.5, life: 0.11, color: flashColor, alpha: 1, additive: 1, kind: SpriteKind.Star }),
      smoke: (x, y, z, size) =>
        this.sprites.spawn({ x, y, z, vy: size * 0.8, drag: 1.5, sizeStart: size * 0.4, sizeEnd: size * 1.3, life: 0.9, color: smokeColor, alpha: 0.26, kind: SpriteKind.Puff }),
      caramel: (x, y, z, size) => {
        for (let i = 0; i < 2; i += 1) {
          this.sprites.spawn({ x, y, z, vx: rng.range(-0.3, 0.3) * size, vy: rng.range(0.8, 1.3) * size, vz: rng.range(-0.3, 0.3) * size, drag: 0.5, sizeStart: 0.4 * size, sizeEnd: rng.range(1.1, 1.6) * size, life: rng.range(1.6, 2.4), color: caramelColor, alpha: 0.5, kind: SpriteKind.Puff, spin: rng.range(-0.5, 0.5) });
        }
      },
      ember: (x, y, z, size) => {
        for (let i = 0; i < 5; i += 1) {
          this.sprites.spawn({ x, y, z, vx: rng.range(-1, 1) * size, vy: rng.range(1.6, 3.6) * size, vz: rng.range(-1, 1) * size, gravity: 4 * size, sizeStart: 0.1 * size, sizeEnd: 0.02 * size, life: rng.range(0.5, 0.9), color: emberColor, alpha: 1, additive: 1, kind: SpriteKind.Drop });
        }
      },
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

  machinePoints(): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (const rig of this.rigs.values()) rig.collectPoints(points);
    return points;
  }

  /** QA: shows one copy of a machine alone and says where it is. */
  isolateMachine(kind: UnitKindName): ReturnType<UnitRig['firstCopy']> {
    for (const [other, rig] of this.rigs) {
      if (other === kind) rig.keepOnlyFirst();
      else rig.hide();
    }
    return this.rigs.get(kind)?.firstCopy() ?? null;
  }

  syncUpgrades(owned: readonly string[]): void {
    this.parts.upgradesChanged?.(owned);
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
      this.updateFountain(dt, ctx.intensity, ctx.attract);
      this.heroCannon?.update(dt, cooling);
      this.flock?.update(dt);
      const tempo = 1 + Math.min(1.6, ctx.intensity * 0.28);
      for (const rig of this.rigs.values()) rig.update(dt, ctx.time, tempo);
      this.parts.update(dt, full);
    }
    this.pile.update(dt);
    this.sprites.flush();
  }

  /**
   * Past a certain output single pops stop making sense:
   * the vessel turns into a fountain, and its height carries the scale.
   */
  private updateFountain(dt: number, intensity: number, attract: boolean): void {
    const k = this.spec.pile.k;
    const rate = attract ? 1.3 : Math.max(SIMMER_POPS_PER_SECOND, Math.min(26, (intensity - 1.2) * 11));
    this.fountainBudget = Math.min(5, this.fountainBudget + rate * dt);
    while (this.fountainBudget >= 1) {
      this.fountainBudget -= 1;
      this.popFromVessel(k);
    }
  }

  private popFromVessel(k: number): void {
    const a = this.rng.range(0, 6.28);
    const r = this.rng.range(0, this.spec.homeRadius * 0.7);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    this.director!.launch(x, this.pile.heightAt(x, z) + 0.2 * k, z, {
      flight: this.rng.range(0.85, 1.35),
      scale: this.rng.range(0.26, 0.42),
      reach: 1.3,
      quiet: true,
    });
  }

  /** One pop made by the stirring machine. */
  autoPop(): void {
    if (this.director) this.popFromVessel(this.spec.pile.k);
  }

  setDetail(fraction: number): void {
    this.pile.setDetail(fraction);
  }

  context(time: number, level: number, intensity: number): SceneContext | null {
    return this.director ? { time, level, intensity, attract: false, sprites: this.sprites, director: this.director, rng: this.rng } : null;
  }

  /** As the camera pulls away, this scene stops casting shadows: they would be too small to see. */
  beginShrinking(stage: Stage): void {
    stage.shadow.removeTree(this.root);
    this.flock?.setHidden(true);
  }

  setFlockHidden(hidden: boolean): void {
    this.flock?.setHidden(hidden);
  }

  /** Called once this scene has been outgrown and shrinks into a prop in the next one. */
  retire(stage: Stage): void {
    this.live = false;
    stage.shadow.removeTree(this.root);
    this.pile.setSurfaceVisible(false);
    if (this.batches) this.batches.group.visible = false;
    this.sprites.mesh.visible = false;
    this.director?.hideHopper(false);
    if (this.heroCannon) this.heroCannon.group.visible = false;
    // Only the pans are still large enough to read at miniature scale.
    for (const [kind, rig] of this.rigs) if (kind !== 'pan') rig.hide();
    this.flock?.setHidden(true);
    this.shovel?.hide();
    this.flavor?.hide();
    this.parts.settleAsMiniature?.();
  }
}

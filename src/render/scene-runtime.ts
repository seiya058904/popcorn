import * as THREE from 'three';
import type { CannonResult } from '../events/game-events.ts';
import type { Rng } from '../motion/rng.ts';
import type { Stage } from './core/stage.ts';
import { UPGRADE_BY_ID } from '../content/upgrades.ts';
import { Cracks, Debris, Parcel } from './fx/breakout.ts';
import { Flock } from './fx/flock.ts';
import { Shovel } from './fx/shovel.ts';
import { SpriteKind, Sprites } from './fx/sprites.ts';
import { Stirrer } from './fx/stirrer.ts';
import { HeroCannon } from './hero-cannon.ts';
import { toyMaterials } from './materials/toy.ts';
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

/** Two of the same machine noise never overlap closer than this. */
const SOUND_GAP = 0.45;
/** Landings closer together than this count as one, as far as the camera is concerned. */
const THUMP_GAP = 0.4;
const dustColor = new THREE.Color('#c9b8a2');
const sparkleColor = new THREE.Color(2.4, 2, 1.1);
const comboColor = new THREE.Color(2, 1.5, 0.7);
const flashColor = new THREE.Color(2.4, 1.8, 1);
const smokeColor = new THREE.Color(0.55, 0.5, 0.5);
const caramelColor = new THREE.Color('#d99a58');
const emberColor = new THREE.Color(2.8, 1.05, 0.25);

export interface RuntimeHooks {
  onBurst(position: THREE.Vector3, combo: number, gain: number, manual: boolean): void;
  onLand(gain: number): void;
  onSquash(): void;
  onMachineCannon(): void;
  onMachineSound(name: string): void;
  onMachineThump(): void;
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
  private readonly stirrer: Stirrer | null = null;
  private readonly debris: Debris | null = null;
  private readonly cracks: Cracks | null = null;
  private readonly parcel: Parcel | null = null;
  private readonly soundClock = new Map<string, number>();
  private clock = 0;
  private lastThump = -9;
  /** While the camera is right up against a machine, nothing should fly into the lens. */
  holdLaunches = false;
  /** The player asked for reduced motion, so machines arrive without any flourish. */
  calmEntrances = false;
  private readonly rigs = new Map<UnitKindName, UnitRig>();
  private readonly rng: Rng;
  private launchBudget = 0;
  private fountainBudget = 0;
  private live: boolean;

  constructor(stage: Stage, spec: SceneSpec, rng: Rng, hooks: RuntimeHooks, live: boolean) {
    this.spec = spec;
    this.rng = rng;
    this.live = live;
    this.root.userData.budgetScene = spec.id;
    // Labels what each draw call belongs to, for the budget report. Costs nothing at run time.
    const tagNew = (label: string): void => {
      for (const child of this.root.children) child.userData.budget ??= label;
    };
    this.parts = spec.build(stage, this.root);
    tagNew('set');
    this.pile = new Pile(stage, this.root, spec.pile, live);
    tagNew('pile');
    this.sprites = new Sprites(this.root);
    tagNew('sprites');
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
    tagNew('flying');
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
    tagNew('director');
    this.shovel = new Shovel(stage, this.root, this.sprites, rng, k);
    tagNew('shovel');
    this.flavor = new FlavorShow(stage, this.root, this.sprites, rng, spec.spreadRadius, k);
    tagNew('flavor');
    if (spec.perches.length > 0) this.flock = new Flock(stage, this.root, spec.perches, 0.62 * k, rng);
    tagNew('flock');
    this.stirrer = new Stirrer(stage, this.root, spec.steamY, spec.homeRadius / 0.72, k);
    tagNew('stirrer');
    this.debris = new Debris(stage, this.root, spec.debris ?? ['#ffeccb'], k);
    this.cracks = new Cracks(stage, this.root, rng, (spec.homeRadius / 0.72) * 1.13, spec.steamY, k);
    this.parcel = new Parcel(stage, this.root, k);
    tagNew('breakout');
    if (spec.cannon) this.heroCannon = new HeroCannon(stage, this.root, spec.cannon, this.sprites, this.director, rng);
    tagNew('hero-cannon');

    const runtime = this;
    const host: UnitHost = {
      rng,
      get calm() {
        return runtime.calmEntrances;
      },
      launch: (x, y, z) => {
        if (this.launchBudget < 1 || this.holdLaunches) return;
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
      dust: (x, y, z, size) => {
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * 6.28 + rng.range(-0.25, 0.25);
          const speed = rng.range(1.5, 2.6) * size;
          this.sprites.spawn({ x, y: y + 0.05 * size, z, vx: Math.cos(a) * speed, vy: rng.range(0.05, 0.3) * size, vz: Math.sin(a) * speed, drag: 3.2, sizeStart: 0.22 * size, sizeEnd: rng.range(0.55, 0.85) * size, life: rng.range(0.45, 0.75), color: dustColor, alpha: 0.34, kind: SpriteKind.Puff, spin: rng.range(-1, 1) });
        }
      },
      sparkle: (x, y, z, size) => {
        this.sprites.spawn({ x, y, z, sizeStart: 0.3 * size, sizeEnd: 1.8 * size, life: 0.5, color: sparkleColor, alpha: 0.75, additive: 1, kind: SpriteKind.Ring });
        for (let i = 0; i < 7; i += 1) {
          const a = rng.range(0, 6.28);
          this.sprites.spawn({ x, y, z, vx: Math.cos(a) * 1.8 * size, vy: rng.range(0.8, 2.6) * size, vz: Math.sin(a) * 1.8 * size, gravity: 3.5 * size, sizeStart: 0.24 * size, sizeEnd: 0.03 * size, life: rng.range(0.45, 0.8), color: sparkleColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: rng.range(-4, 4) });
        }
      },
      thump: () => {
        if (this.clock - this.lastThump < THUMP_GAP) return;
        this.lastThump = this.clock;
        hooks.onMachineThump();
      },
      onCannonFired: () => {
        this.flock?.scare();
        hooks.onMachineCannon();
      },
      sound: (name) => {
        if (this.clock - (this.soundClock.get(name) ?? -9) < SOUND_GAP) return;
        this.soundClock.set(name, this.clock);
        hooks.onMachineSound(name);
      },
    };
    for (const kind of UNIT_ORDER) {
      const slots = spec.slots[kind];
      if (slots) this.rigs.set(kind, new UnitRig(stage, this.root, kind, slots, host));
      tagNew(`machine:${kind}`);
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

  private rigFor(unit: number): UnitRig | undefined {
    return this.rigs.get(UNIT_ORDER[unit]!);
  }

  /** The first copy of a machine, if this scene has a place for it. */
  machineFocus(unit: number): ReturnType<UnitRig['firstCopy']> {
    const rig = this.rigFor(unit);
    return rig && rig.visible > 0 ? rig.firstCopy() : null;
  }

  hasMachine(unit: number): boolean {
    return this.rigFor(unit) !== undefined;
  }

  /** Sparkles over every copy of a machine that has just reached a milestone. */
  celebrate(unit: number): void {
    const k = this.spec.pile.k;
    for (const p of this.rigFor(unit)?.positions() ?? []) {
      this.sprites.spawn({ x: p.x, y: p.y, z: p.z, sizeStart: 0.4 * k, sizeEnd: 2.2 * k, life: 0.55, color: sparkleColor, alpha: 0.8, additive: 1, kind: SpriteKind.Ring });
      for (let i = 0; i < 6; i += 1) {
        const a = this.rng.range(0, 6.28);
        this.sprites.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 2 * k, vy: this.rng.range(1, 3.2) * k, vz: Math.sin(a) * 2 * k, gravity: 4 * k, sizeStart: 0.28 * k, sizeEnd: 0.04 * k, life: this.rng.range(0.5, 0.9), color: sparkleColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: this.rng.range(-4, 4) });
      }
    }
  }

  /** A burst from the vessel when a run of clicks reaches a round number. */
  comboBurst(power: number): void {
    if (!this.director) return;
    const k = this.spec.pile.k;
    const top = this.pile.heightAt(this.spec.pile.centerX, this.spec.pile.centerZ) + 0.2 * k;
    this.sprites.spawn({ x: 0, y: top, z: 0, sizeStart: 0.5 * k, sizeEnd: (2 + power) * k, life: 0.42, color: comboColor, alpha: 0.75, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 4 + power * 2; i += 1) this.popFromVessel(k);
  }

  dropParcel(): void {
    if (this.parcel) this.parcel.drop(this.rng, this.pile.heightAt(this.spec.pile.centerX, this.spec.pile.centerZ));
  }

  /** Pressure on the vessel, from the first tremble to the moment it gives way. */
  strain(u: number, ctx: SceneContext | null): void {
    if (ctx) this.parts.strain?.(u, ctx);
    this.cracks?.set(u);
  }

  burstVessel(): void {
    this.debris?.burst(this.rng, this.spec.homeRadius / 0.72, this.spec.steamY);
    this.cracks?.hide();
  }

  /** Machines drop in one after another as the camera arrives. */
  dropInMachines(): void {
    let delay = 0.05;
    for (const rig of this.rigs.values()) {
      rig.dropIn(delay);
      delay += 0.12;
    }
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
    let pops = 0;
    for (const id of owned) {
      const effect = UPGRADE_BY_ID.get(id)?.effect;
      if (effect?.kind === 'autoPops') pops += effect.perSecond;
    }
    this.stirrer?.setPower(pops);
    this.parts.upgradesChanged?.(owned);
  }

  fireCannon(result: CannonResult): void {
    this.heroCannon?.fire(result);
    if (result !== 'overpressure') this.flock?.scare();
  }

  update(dt: number, ctx: Omit<SceneContext, 'sprites' | 'director' | 'rng'>, cooling: boolean): void {
    this.clock += dt;
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
      this.stirrer?.update(dt, this.pile.heightAt(this.spec.pile.centerX, this.spec.pile.centerZ));
      this.debris?.update(dt);
      if (this.parcel?.update(dt, (x, z) => this.pile.heightAt(x, z))) this.parts.kick?.(0.5);
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
    if (!this.director) return;
    this.popFromVessel(this.spec.pile.k);
    this.stirrer?.kick();
  }

  setDetail(fraction: number): void {
    this.pile.setDetail(fraction);
  }

  context(time: number, level: number, intensity: number): SceneContext | null {
    return this.director ? { time, level, intensity, attract: false, sprites: this.sprites, director: this.director, rng: this.rng } : null;
  }

  /** As the camera pulls away, this scene stops casting shadows: they would be too small to see. */
  beginShrinking(stage: Stage): void {
    stage.setGlassDistant(this.root);
    stage.shadow.removeTree(this.root);
    this.dropOutlines();
    for (const rig of this.rigs.values()) rig.hideSigns();
    this.flock?.setHidden(true);
  }

  setFlockHidden(hidden: boolean): void {
    this.flock?.setHidden(hidden);
  }

  /** A scene seen from far away has no use for outlines, and each one is a draw call. */
  private dropOutlines(): void {
    const ink = toyMaterials().outline;
    this.root.traverse((node) => {
      if ((node as THREE.Mesh).material === ink) node.visible = false;
    });
  }

  /** Called once this scene has been outgrown and shrinks into a prop in the next one. */
  retire(stage: Stage): void {
    this.live = false;
    stage.setGlassDistant(this.root);
    stage.shadow.removeTree(this.root);
    this.dropOutlines();
    this.pile.setSurfaceVisible(false);
    if (this.batches) this.batches.group.visible = false;
    this.sprites.mesh.visible = false;
    this.director?.hideHopper(false);
    if (this.heroCannon) this.heroCannon.group.visible = false;
    // Only the pans are still large enough to read at miniature scale.
    for (const [kind, rig] of this.rigs) if (kind !== 'pan') rig.hide();
    this.flock?.setHidden(true);
    this.stirrer?.hide();
    this.debris?.hide();
    this.cracks?.hide();
    this.parcel?.hide();
    this.shovel?.hide();
    this.flavor?.hide();
    this.parts.settleAsMiniature?.();
  }
}

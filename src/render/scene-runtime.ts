import * as THREE from 'three';
import type { CannonResult } from '../events/game-events.ts';
import type { Rng } from '../motion/rng.ts';
import { applyLamps, applyLightRig, type Lamp } from './core/globals.ts';
import { PROBE_LOOKS, SceneProbe } from './core/probe.ts';
import type { Stage } from './core/stage.ts';
import { UPGRADE_BY_ID } from '../content/upgrades.ts';
import { Cracks, Debris, Parcel } from './fx/breakout.ts';
import { Flock } from './fx/flock.ts';
import { Shovel } from './fx/shovel.ts';
import { comboColor as tierColor } from './fx/combo.ts';
import { SpriteKind, Sprites } from './fx/sprites.ts';
import { Stirrer } from './fx/stirrer.ts';
import { runAmbience } from './fx/ambience.ts';
import { HeroCannon } from './hero-cannon.ts';
import { isInk } from './materials/toy.ts';
import { PieceBatches } from './popcorn/batches.ts';
import { PopDirector } from './popcorn/director.ts';
import { FlavorShow } from './popcorn/flavor.ts';
import { Pile } from './popcorn/pile.ts';
import { EGGS } from '../content/props.ts';
import type { EggSpot } from './scenes/eggs.ts';
import { moodScratch, storyMood } from './scenes/story.ts';
import type { SceneContext, SceneParts, SceneSpec, UnitKindName } from './scenes/types.ts';
import { UnitRig, type UnitHost } from './units.ts';

/** Same order as the producers, so a unit's index in the save picks its rig. */
const UNIT_ORDER: UnitKindName[] = ['pan', 'microwave', 'cart', 'cannon', 'cinema', 'truck', 'factory', 'airship', 'volcano', 'orbital', 'toaster', 'mixer', 'organ', 'train', 'typhoon'];
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
const burstColor = new THREE.Color();
const flashColor = new THREE.Color(2.4, 1.8, 1);
const smokeColor = new THREE.Color(0.55, 0.5, 0.5);
const caramelColor = new THREE.Color('#d99a58');
const PIGEON_EGG = 'egg-pigeons';
/** Scratch for turning a world-space ray into a scene's own space. */
const sceneRay = new THREE.Ray();
const toScene = new THREE.Matrix4();
const heapBox = new THREE.Box3();
const heapPoint = new THREE.Vector3();
const emberColor = new THREE.Color(2.8, 1.05, 0.25);
const butterColor = new THREE.Color('#ffd25a').multiplyScalar(1.3);

export interface RuntimeHooks {
  onBurst(position: THREE.Vector3, combo: number, gain: number, manual: boolean, golden: boolean): void;
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
  // Filled in by construct(), which runs to the end before anything else touches the runtime.
  parts!: SceneParts;
  pile!: Pile;
  sprites!: Sprites;
  batches: PieceBatches | null = null;
  director: PopDirector | null = null;
  shovel: Shovel | null = null;
  flavor: FlavorShow | null = null;
  heroCannon: HeroCannon | null = null;
  flock: Flock | null = null;
  private stirrer: Stirrer | null = null;
  private debris: Debris | null = null;
  private cracks: Cracks | null = null;
  private parcel: Parcel | null = null;
  private readonly stage: Stage;
  private readonly hooks: RuntimeHooks;
  private readonly soundClock = new Map<string, number>();
  private clock = 0;
  private lastThump = -9;
  /** While the camera is right up against a machine, nothing should fly into the lens. */
  holdLaunches = false;
  /** The player asked for reduced motion, so machines arrive without any flourish. */
  calmEntrances = false;
  /** Set when a save is loaded: the next story step jumps straight to where the scene should be. */
  snapStory = true;
  private readonly rigs = new Map<UnitKindName, UnitRig>();
  /** Hidden things that belong to the runtime rather than the scene, such as the pigeons. */
  private readonly ownEggs: EggSpot[] = [];
  private readonly rng: Rng;
  /** The set seen from above the heap in each story look, for reflections (core/probe.ts). */
  readonly probe = new SceneProbe();
  private launchBudget = 0;
  /** Seconds until each ambient emitter sends out its next particle. */
  private readonly ambientDue: number[] = [];
  /** Seconds until the next flake tumbles down the heap. */
  private tumbleIn = 2;
  private butterDue = 0;
  private fountainBudget = 0;
  private live: boolean;

  /** Cheap: the scene itself is made by construct(). */
  constructor(stage: Stage, spec: SceneSpec, rng: Rng, hooks: RuntimeHooks, live: boolean) {
    this.stage = stage;
    this.spec = spec;
    this.rng = rng;
    this.hooks = hooks;
    this.live = live;
    this.root.userData.budgetScene = spec.id;
  }

  /** Builds the whole scene in steps of a few milliseconds; see SceneSpec.build. */
  *construct(): Generator<void, void, void> {
    const { stage, spec, rng, hooks, live } = this;
    // Labels what each draw call belongs to, for the budget report. Costs nothing at run time.
    const tagNew = (label: string): void => {
      for (const child of this.root.children) child.userData.budget ??= label;
    };
    this.parts = yield* spec.build(stage, this.root);
    tagNew('set');
    yield;
    this.pile = new Pile(stage, this.root, spec.pile, live);
    yield* this.pile.build(stage);
    tagNew('pile');
    this.sprites = new Sprites(this.root);
    tagNew('sprites');
    yield;
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
    yield;
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
        onBurst: (position, combo, gain, manual, golden) => {
          if (manual) this.parts.kick?.(1);
          hooks.onBurst(position, combo, gain, manual, golden);
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
    yield;
    if (spec.perches.length > 0) this.flock = new Flock(stage, this.root, spec.perches, 0.62 * k, rng);
    if (this.flock && EGGS.some((egg) => egg.id === PIGEON_EGG && egg.stage === spec.id)) this.ownEggs.push(this.pigeonEgg(this.flock));
    tagNew('flock');
    this.stirrer = new Stirrer(stage, this.root, spec.steamY, spec.homeRadius / 0.72, k);
    tagNew('stirrer');
    yield;
    this.debris = new Debris(stage, this.root, spec.debris ?? ['#ffeccb'], k);
    this.cracks = new Cracks(stage, this.root, rng, (spec.homeRadius / 0.72) * 1.13, spec.steamY, k);
    this.parcel = new Parcel(stage, this.root, k);
    tagNew('breakout');
    if (spec.cannon) this.heroCannon = new HeroCannon(stage, this.root, spec.cannon, this.sprites, this.director, rng);
    tagNew('hero-cannon');
    yield;

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
          this.sprites.spawn({ x, y, z, vx: rng.range(-1, 1) * size, vy: rng.range(1.6, 3.6) * size, vz: rng.range(-1, 1) * size, gravity: 4 * size, sizeStart: 0.07 * size, sizeEnd: 0.02 * size, life: rng.range(0.5, 0.9), color: emberColor, alpha: 1, additive: 1, kind: SpriteKind.Spark });
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
      const path = spec.paths?.[kind] ?? null;
      if (!slots && !path) continue;
      this.rigs.set(kind, yield* UnitRig.create(stage, this.root, kind, slots ?? [], host, path));
      tagNew(`machine:${kind}`);
      yield;
    }
  }

  /**
   * Captures the probe a face per step. Runs once the scene's shaders and buffers are on the GPU,
   * so nothing compiles or uploads in the middle of it. The scene is put into each story look in
   * turn, then snaps back to where it belongs on its next update.
   */
  *captureProbe(immediate: boolean): Generator<void, void, void> {
    const { spec, stage } = this;
    const k = spec.pile.k;
    const position = spec.probe?.clone() ?? new THREE.Vector3(spec.pile.centerX, spec.steamY + 0.9 * k, spec.pile.centerZ);
    const scratch = moodScratch();
    yield* this.probe.capture(stage.renderer, this.root, (child) => child.userData.budget === 'set', position, 0.05 * k, {
      apply: (index) => {
        const u = PROBE_LOOKS[index]!;
        this.parts.progress?.(u, 0, true, true);
        const mood = storyMood(spec.light, spec.grade, spec.story, u, scratch);
        applyLightRig(mood.rig);
        applyLamps(this.lamps, 0, stage.quality.lamps);
      },
      shadow: () => {
        stage.shadow.setFrustum(spec.shadow.center, spec.shadow.radius);
        stage.shadow.render(stage.renderer, this.root);
      },
      restore: () => {
        this.snapStory = true;
      },
    }, immediate);
  }

  /** After a capture step on the scene that is on screen: back to its own story look at once. */
  resnapStory(): void {
    this.snapStory = true;
  }

  get isLive(): boolean {
    return this.live;
  }

  /** `lead` holds new machines back, as while their ticket is still flying in. */
  syncUnits(owned: readonly number[], animate: boolean, lead = 0): void {
    UNIT_ORDER.forEach((kind, index) => {
      const rig = this.rigs.get(kind);
      if (!rig) return;
      rig.sync(owned[index]!, animate, Math.max(UNIT_DROP_DELAY, lead));
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

  /** The ray in this scene's own space. */
  private toScene(ray: THREE.Ray): THREE.Ray {
    return sceneRay.copy(ray).applyMatrix4(toScene.copy(this.root.matrixWorld).invert());
  }

  /**
   * Where a ray (world space) first meets the heap's surface, marched over its height field; null
   * if it misses, or meets only bare floor.
   */
  heapHit(ray: THREE.Ray, out: THREE.Vector3): THREE.Vector3 | null {
    const local = this.toScene(ray);
    const { pile } = this;
    const shape = pile.shape;
    const k = shape.k;
    const reach = this.spec.spreadRadius;
    const top = pile.heightAt(shape.centerX, shape.centerZ) + k;
    heapBox.min.set(shape.centerX - reach, -1e6, shape.centerZ - reach);
    heapBox.max.set(shape.centerX + reach, top, shape.centerZ + reach);
    if (!local.intersectBox(heapBox, heapPoint)) return null;
    const step = 0.12 * k;
    let before = local.origin.distanceTo(heapPoint);
    const end = before + reach * 3 + top;
    for (let t = before; t < end; t += step) {
      local.at(t, heapPoint);
      if (heapPoint.y > pile.heightAt(heapPoint.x, heapPoint.z)) {
        before = t;
        continue;
      }
      // Narrow it down between the last step above the surface and this one below.
      let above = before;
      let below = t;
      for (let i = 0; i < 6; i += 1) {
        const mid = (above + below) / 2;
        local.at(mid, heapPoint);
        if (heapPoint.y > pile.heightAt(heapPoint.x, heapPoint.z)) above = mid;
        else below = mid;
      }
      local.at(below, heapPoint);
      if (pile.heightAt(heapPoint.x, heapPoint.z) - shape.floor(heapPoint.x, heapPoint.z) < 0.05 * k) return null;
      return this.root.localToWorld(out.copy(heapPoint));
    }
    return null;
  }

  /** The machine copy a ray (world space) meets first, if any. */
  pickMachine(ray: THREE.Ray): { unit: number; copy: number; distance: number } | null {
    const local = this.toScene(ray);
    let best: { unit: number; copy: number; distance: number } | null = null;
    for (const [kind, rig] of this.rigs) {
      const hit = rig.pick(local);
      if (hit && (!best || hit.distance < best.distance)) best = { unit: UNIT_ORDER.indexOf(kind), ...hit };
    }
    return best;
  }

  /** The hidden thing a ray (world space) passes over, if any is there to be found right now. */
  pickEgg(ray: THREE.Ray): EggSpot | null {
    const local = this.toScene(ray);
    let best: EggSpot | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const spot of this.eggs) {
      if (!this.canFind(spot)) continue;
      if (local.distanceSqToPoint(spot.position) > spot.radius * spot.radius) continue;
      const distance = local.origin.distanceTo(spot.position);
      if (distance < nearest) {
        nearest = distance;
        best = spot;
      }
    }
    return best;
  }

  get eggs(): readonly EggSpot[] {
    return this.ownEggs.length ? [...(this.parts.eggs ?? []), ...this.ownEggs] : (this.parts.eggs ?? []);
  }

  /** The pigeons: tapped, they all take off, and drop the popcorn they were holding. */
  private pigeonEgg(flock: Flock): EggSpot {
    const roost = flock.perches.slice(1);
    const centre = roost.reduce((sum, perch) => sum.add(perch), new THREE.Vector3()).divideScalar(Math.max(1, roost.length));
    return {
      id: PIGEON_EGG,
      position: centre,
      radius: 8,
      active: () => flock.settled,
      play(ctx) {
        flock.scare();
        for (const perch of flock.perches) ctx.director.launch(perch.x, perch.y, perch.z, { flight: ctx.rng.range(0.9, 1.3), scale: 0.45, quiet: true });
      },
    };
  }

  /** There to be found: not busy, not gone, and not under the heap. */
  canFind(spot: EggSpot): boolean {
    if (spot.active && !spot.active()) return false;
    const { x, y, z } = spot.position;
    return !this.pile.covers(x, z) || this.pile.heightAt(x, z) < y + spot.radius * 0.3;
  }

  pokeMachine(unit: number, copy: number): void {
    this.rigFor(unit)?.poke(copy);
  }

  /** Lifts the copy under the pointer; -1 for none. */
  hoverMachine(unit: number, copy: number): void {
    const kind = unit >= 0 ? UNIT_ORDER[unit] : undefined;
    for (const [other, rig] of this.rigs) rig.setHover(other === kind ? copy : -1);
  }

  /** Where a new machine of this kind will stand, in this scene's space; else over the heap, where parcels drop. */
  arrivalPoint(unit: number, copy: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.rigFor(unit)?.slotPoint(copy, out)) return out;
    const shape = this.pile.shape;
    return out.set(shape.centerX, this.pile.heightAt(shape.centerX, shape.centerZ) + 0.6 * shape.k, shape.centerZ);
  }

  /** A bought ticket landed: a ring and a puff of sparkles where the machine is about to arrive. */
  arrivalSparkle(point: THREE.Vector3): void {
    const k = this.spec.pile.k;
    const { x, y, z } = point;
    this.sprites.spawn({ x, y, z, sizeStart: 0.3 * k, sizeEnd: 1.6 * k, life: 0.45, color: sparkleColor, alpha: 0.7, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      this.sprites.spawn({ x, y, z, vx: Math.cos(a) * 2.2 * k, vy: this.rng.range(0.8, 2.6) * k, vz: Math.sin(a) * 2.2 * k, gravity: 5 * k, drag: 1.2, sizeStart: 0.22 * k, sizeEnd: 0.04 * k, life: this.rng.range(0.45, 0.8), color: sparkleColor, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: this.rng.range(-4, 4) });
    }
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
  /**
   * Every 12 clicks in a run: a ring over the heap and a few extra pops. Each tier (12, 24, 48, 96)
   * changes the ring's color and adds sparks; the top tier's rings run through the rainbow.
   */
  comboBurst(power: number, tier: number, hue: number): void {
    if (!this.director) return;
    const k = this.spec.pile.k;
    const x = this.spec.pile.centerX;
    const z = this.spec.pile.centerZ;
    const top = this.pile.heightAt(x, z) + 0.2 * k;
    const rings = tier >= 4 ? 3 : tier >= 3 ? 2 : 1;
    for (let i = 0; i < rings; i += 1) {
      this.sprites.spawn({ x, y: top, z, sizeStart: (0.5 + i * 0.3) * k, sizeEnd: (2 + power + i * 0.8) * k, life: 0.42 + i * 0.08, color: tierColor(tier, hue + i / 3, burstColor), alpha: 0.75, additive: 1, kind: SpriteKind.Ring });
    }
    for (let i = 0; i < (tier - 1) * 6; i += 1) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(2.5, 5) * k;
      this.sprites.spawn({ x, y: top, z, vx: Math.cos(a) * speed, vy: this.rng.range(3, 6) * k, vz: Math.sin(a) * speed, gravity: 12 * k, drag: 0.8, sizeStart: 0.12 * k, sizeEnd: 0.04 * k, life: this.rng.range(0.45, 0.75), color: tierColor(tier, hue + i / 7, burstColor), alpha: 1.2, additive: 1, kind: SpriteKind.Spark });
    }
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

  /** As the vessel bursts: hot sparks flung out, and a ring of dust racing along the ground. */
  blastEffects(): void {
    const { pile, sprites, rng } = this;
    const shape = pile.shape;
    const k = shape.k;
    const x = shape.centerX;
    const z = shape.centerZ;
    const top = pile.heightAt(x, z);
    const floor = shape.floor(x + (this.spec.homeRadius / 0.72) * 1.4, z);
    for (let i = 0; i < 26; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const speed = rng.range(4, 9) * k;
      sprites.spawn({ x, y: top, z, vx: Math.cos(a) * speed, vy: rng.range(4, 10) * k, vz: Math.sin(a) * speed, gravity: 16 * k, drag: 0.6, sizeStart: 0.14 * k, sizeEnd: 0.05 * k, life: rng.range(0.6, 1.1), color: emberColor, alpha: 1, additive: 1, kind: SpriteKind.Spark });
    }
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const speed = rng.range(5, 8) * k;
      sprites.spawn({ x: x + Math.cos(a) * 0.6 * k, y: floor + 0.15 * k, z: z + Math.sin(a) * 0.6 * k, vx: Math.cos(a) * speed, vy: rng.range(0.1, 0.6) * k, vz: Math.sin(a) * speed, drag: 2.4, sizeStart: 0.5 * k, sizeEnd: rng.range(1.6, 2.4) * k, life: rng.range(0.8, 1.3), color: dustColor, alpha: 0.4, kind: SpriteKind.Puff, spin: rng.range(-1, 1) });
    }
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

  /** `animate` when something was just bought, rather than a save loaded. */
  syncUpgrades(owned: readonly string[], animate = false): void {
    let pops = 0;
    for (const id of owned) {
      const effect = UPGRADE_BY_ID.get(id)?.effect;
      if (effect?.kind === 'autoPops') pops += effect.perSecond;
    }
    this.stirrer?.setPower(pops);
    this.parts.upgradesChanged?.(owned, animate && !this.calmEntrances);
  }

  /** The lamps lighting this scene right now. */
  get lamps(): readonly Lamp[] {
    return this.parts.lamps ?? this.spec.lamps ?? [];
  }

  fireCannon(result: CannonResult): void {
    this.heroCannon?.fire(result);
    if (result !== 'overpressure') this.flock?.scare();
  }

  private readonly ground = (x: number, z: number): number => this.pile.heightAt(x, z);

  update(dt: number, ctx: Omit<SceneContext, 'sprites' | 'director' | 'rng' | 'ground'>, cooling: boolean): void {
    this.clock += dt;
    const director = this.director;
    if (director) {
      const full: SceneContext = { ...ctx, sprites: this.sprites, director, rng: this.rng, ground: this.ground };
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
      this.parts.progress?.(Math.min(1, ctx.level), dt, this.snapStory, this.calmEntrances);
      this.snapStory = false;
      this.parts.update(dt, full);
      if (this.spec.ambience && !ctx.attract) runAmbience(this.spec.ambience, this.ambientDue, dt, Math.min(1, ctx.level), this.spec.pile.k, this.sprites, this.rng, this.calmEntrances);
      this.tumble(dt, ctx.intensity, ctx.attract);
    }
    this.pile.update(dt);
    this.sprites.flush();
  }

  /**
   * A busy heap is never quite still: now and then a flake near the top slips and tumbles down the
   * slope. Only for show, so nothing is earned or heard.
   */
  private tumble(dt: number, intensity: number, attract: boolean): void {
    if (attract || this.holdLaunches || !this.director || this.pile.currentLevel < 0.08) return;
    this.tumbleIn -= dt * Math.min(2.5, 0.4 + intensity * 0.3);
    if (this.tumbleIn > 0) return;
    this.tumbleIn = this.rng.range(1.2, 3);
    const shape = this.pile.shape;
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0.1, 0.45) * shape.landingRadius(this.pile.currentLevel);
    const x = shape.centerX + Math.cos(a) * r;
    const z = shape.centerZ + Math.sin(a) * r;
    this.director.launch(x, this.pile.heightAt(x, z) + 0.04 * shape.k, z, { flight: this.rng.range(0.35, 0.5), scale: this.rng.range(0.32, 0.42), reach: 1.05, silent: true });
  }

  /** Flecks of butter drifting down over the heap during a frenzy, thicker as it builds. */
  butterRain(dt: number, amount: number): void {
    if (amount < 0.05 || this.calmEntrances) return;
    this.butterDue -= dt * amount * 14;
    const shape = this.pile.shape;
    const k = shape.k;
    const reach = shape.landingRadius(this.pile.currentLevel) * 0.9;
    while (this.butterDue <= 0) {
      this.butterDue += this.rng.range(0.5, 1.5);
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * reach;
      const x = shape.centerX + Math.cos(a) * r;
      const z = shape.centerZ + Math.sin(a) * r;
      const y = this.pile.heightAt(shape.centerX, shape.centerZ) + this.rng.range(1.5, 3) * k;
      this.sprites.spawn({ x, y, z, vx: this.rng.range(-0.3, 0.3) * k, vy: -0.4 * k, vz: this.rng.range(-0.3, 0.3) * k, gravity: 0.5 * k, drag: 1.2, sizeStart: 0.075 * k, sizeEnd: 0.05 * k, life: this.rng.range(1.6, 2.4), color: butterColor, alpha: 1, additive: 0.5, kind: SpriteKind.Fleck, spin: this.rng.range(-8, 8) });
    }
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
    return this.director ? { time, level, intensity, attract: false, sprites: this.sprites, director: this.director, rng: this.rng, ground: this.ground } : null;
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
    this.root.traverse((node) => {
      const material = (node as THREE.Mesh).material;
      if (material && isInk(material)) node.visible = false;
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
    // Its reflections were for its own room, which the camera has left for good.
    this.probe.dispose();
  }
}

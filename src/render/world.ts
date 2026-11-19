import * as THREE from 'three';
import { STAGES } from '../content/stages.ts';
import type { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';
import { clamp01, easeInOutCubic, lerp } from '../motion/ease.ts';
import type { ImpactDirector } from '../motion/impact.ts';
import { Rng } from '../motion/rng.ts';
import { tuning } from '../motion/tuning.ts';
import { showIntensity } from '../sim/economy.ts';
import type { Simulation } from '../sim/simulation.ts';
import { applyLamps, applyLightRig, globals, type LightRig } from './core/globals.ts';
import { QUALITY } from './core/quality.ts';
import type { Stage } from './core/stage.ts';
import { SceneRuntime, type RuntimeHooks } from './scene-runtime.ts';
import { cinemaSpec } from './scenes/cinema.ts';
import { earthSpec } from './scenes/earth.ts';
import { kitchenSpec } from './scenes/kitchen.ts';
import { setPotSkin, stoveSpec } from './scenes/stove.ts';
import { townSpec } from './scenes/town.ts';
import type { FinaleBeat, Grade, SceneSpec } from './scenes/types.ts';

export type BreakBeat = 'strain' | 'silence' | 'blast' | 'arrive';

export interface WorldHooks {
  onBurst(screenX: number, screenY: number, combo: number, gain: number, manual: boolean): void;
  onLand(gain: number): void;
  onMachineCannon(): void;
  onBreakBeat(beat: BreakBeat, stage: number): void;
  onFinaleBeat(beat: FinaleBeat): void;
  onFinaleDone(): void;
}

/** Scenes in play order; later milestones extend this list. */
export const SCENES: SceneSpec[] = [stoveSpec, kitchenSpec, cinemaSpec, townSpec, earthSpec];

const STRAIN_END = 0.5;
const ZOOM_START = 0.86;
const ZOOM_END = 2.55;
const TRANSITION_END = 2.7;
const HOPPER_HIT_RADIUS_REM = 5.2;
/** How many camera positions are tried when fitting the machines into the picture. */
const FRAMING_STEPS = 12;
const FRAMING_MARGIN = 0.05;
/** Keeps the whole play area sharp; only the distant background goes soft. */
const FOCUS_DEPTH = 1.8;
const REFLECTION_REACH = 14;

const ndc = new THREE.Vector2();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const colorA = new THREE.Color();
const colorB = new THREE.Color();

const smoothstep = (x: number, a: number, b: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  focusDistance: number;
  focusRange: number;
  aoRadius: number;
  shadowCenter: THREE.Vector3;
  shadowRadius: number;
  rig: LightRig;
  grade: Grade;
}

interface Transition {
  from: SceneRuntime;
  to: SceneRuntime;
  stage: number;
  t: number;
  blasted: boolean;
  startPose: Pose | null;
  silenced: boolean;
  arrived: boolean;
}

const logLerp = (a: number, b: number, t: number): number => Math.exp(lerp(Math.log(a), Math.log(b), t));

function mixRig(a: LightRig, b: LightRig, t: number): LightRig {
  const color = (x: THREE.ColorRepresentation, y: THREE.ColorRepresentation): THREE.Color => colorA.set(x).lerp(colorB.set(y), t).clone();
  const tuple3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return {
    sunDir: tuple3(a.sunDir, b.sunDir),
    sunColor: color(a.sunColor, b.sunColor),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    shadeTint: color(a.shadeTint, b.shadeTint),
    sky: color(a.sky, b.sky),
    skyIntensity: lerp(a.skyIntensity, b.skyIntensity, t),
    ground: color(a.ground, b.ground),
    groundIntensity: lerp(a.groundIntensity, b.groundIntensity, t),
    rim: color(a.rim, b.rim),
    rimIntensity: lerp(a.rimIntensity, b.rimIntensity, t),
    rimDir: tuple3(a.rimDir, b.rimDir),
    fog: color(a.fog, b.fog),
    fogRange: [logLerp(a.fogRange[0], b.fogRange[0], t), logLerp(a.fogRange[1], b.fogRange[1], t)],
    pool: [lerp(a.pool[0], b.pool[0], t), lerp(a.pool[1], b.pool[1], t), lerp(a.pool[2], b.pool[2], t), logLerp(a.pool[3], b.pool[3], t)],
    poolFloor: lerp(a.poolFloor, b.poolFloor, t),
  };
}

function mixGrade(a: Grade, b: Grade, t: number): Grade {
  const color = (x: THREE.ColorRepresentation, y: THREE.ColorRepresentation): THREE.Color => colorA.set(x).lerp(colorB.set(y), t).clone();
  return {
    exposure: lerp(a.exposure, b.exposure, t),
    contrast: lerp(a.contrast, b.contrast, t),
    saturation: lerp(a.saturation, b.saturation, t),
    vignette: lerp(a.vignette, b.vignette, t),
    bloom: lerp(a.bloom, b.bloom, t),
    shadowTint: color(a.shadowTint, b.shadowTint),
    highlightTint: color(a.highlightTint, b.highlightTint),
    aoTint: color(a.aoTint, b.aoTint),
  };
}

export class World {
  readonly root = new THREE.Group();
  /** Manual gains still in the air; the counter catches up as they land. */
  pendingGain = 0;
  /** Fraction of the window taken by the shop, used to center the action. */
  uiInset = 0.2;
  /** Playback speed for breakouts and the ending. */
  showSpeed = 1;
  /** Replaces sweeping camera moves with cuts hidden by a flash. */
  reduceMotion = false;
  /** Behind the title screen the camera drifts and the pot pops on its own. */
  attract = false;
  private readonly stage: Stage;
  private readonly sim: Simulation;
  private readonly hooks: WorldHooks;
  private readonly impact: ImpactDirector;
  private readonly rng = new Rng(77);
  private readonly raycaster = new THREE.Raycaster();
  private readonly runtimes: SceneRuntime[] = [];
  private readonly runtimeHooks: RuntimeHooks;
  private currentIndex = -1;
  private transition: Transition | null = null;
  private level = 0;
  private time = 0;
  private cameraLocked = false;
  private intensity = 0;
  private shownInset = 0.2;
  /** How far the camera has opened to keep the machines in view, 0 close to 1 wide. */
  private frameOpen = 0;
  private wantedOpen = 0;
  private framedInset = Number.NaN;
  private readonly framingCamera = new THREE.PerspectiveCamera();

  constructor(stage: Stage, sim: Simulation, bus: EventBus<GameEvents>, impact: ImpactDirector, hooks: WorldHooks) {
    this.stage = stage;
    this.sim = sim;
    this.hooks = hooks;
    this.impact = impact;
    stage.scene.add(this.root);
    this.runtimeHooks = {
      onSquash: () => undefined,
      onBurst: (position, combo, gain, manual) => {
        v.copy(position);
        this.current?.root.localToWorld(v);
        v.project(this.stage.camera);
        const canvas = this.stage.renderer.domElement;
        this.hooks.onBurst((v.x * 0.5 + 0.5) * canvas.clientWidth, (0.5 - v.y * 0.5) * canvas.clientHeight, combo, gain, manual);
      },
      onLand: (gain) => {
        this.pendingGain = Math.max(0, this.pendingGain - gain);
        this.hooks.onLand(gain);
      },
      onMachineCannon: () => this.hooks.onMachineCannon(),
    };

    bus.on('auto_popped', () => this.current?.autoPop());
    bus.on('producer_purchased', ({ spent }) => {
      this.current?.syncUnits(this.sim.state.owned, true);
      this.updateFraming();
      this.scoopPayment(spent);
    });
    bus.on('upgrade_purchased', ({ spent }) => {
      this.scoopPayment(spent);
      this.current?.syncUpgrades(this.sim.state.upgrades);
    });
    bus.on('flavor_unlocked', ({ flavor, spent }) => {
      this.scoopPayment(spent);
      this.current?.flavor?.play(flavor);
      this.impact.hit('medium');
    });
    bus.on('cannon_fired', ({ result }) => {
      this.current?.fireCannon(result);
      this.impact.hit(result === 'overpressure' ? 'medium' : 'large');
      if (result !== 'overpressure') this.shockAtCannon();
    });
    bus.on('stage_broken', ({ stage: broken }) => this.beginBreak(broken));
    bus.on('hopper_spawned', () => this.current?.director?.showHopper());
    bus.on('hopper_caught', () => {
      this.current?.director?.hideHopper(true);
      this.impact.hit('medium');
    });
    bus.on('hopper_escaped', () => this.current?.director?.hideHopper(false));
  }

  get current(): SceneRuntime | null {
    return this.runtimes[this.currentIndex] ?? null;
  }

  get inTransition(): boolean {
    return this.transition !== null;
  }

  private sceneIndexForStage(stage: number): number {
    return Math.min(stage, SCENES.length - 1);
  }

  private runtime(index: number, live: boolean): SceneRuntime {
    let runtime = this.runtimes[index];
    if (!runtime) {
      runtime = new SceneRuntime(this.stage, SCENES[index]!, this.rng, this.runtimeHooks, live);
      this.runtimes[index] = runtime;
    }
    return runtime;
  }

  /**
   * Builds the following scene ahead of time. This runs at load and inside the blast's hit-stop,
   * the two moments a long frame cannot be seen, so the next breakout starts without a stall.
   */
  private prepareNext(): void {
    const next = this.currentIndex + 1;
    if (next >= SCENES.length || this.runtimes[next]) return;
    this.stage.preload(this.runtime(next, true).root);
  }

  /** Puts `inner` where it belongs inside `outer`, as a small prop. */
  private nest(inner: SceneRuntime, outer: SceneRuntime): void {
    const nest = inner.spec.nest!;
    outer.root.add(inner.root);
    inner.root.position.copy(nest.position);
    inner.root.scale.setScalar(nest.scale);
    inner.root.quaternion.copy(this.nestTurn(inner.spec));
  }

  private nestTurn(spec: SceneSpec): THREE.Quaternion {
    const tilt = spec.nest?.tilt;
    return tilt ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tilt.clone().normalize()) : new THREE.Quaternion();
  }

  /** Jumps straight to the scene matching the save, without any animation. */
  private showScene(index: number): void {
    const runtime = this.runtime(index, true);
    this.root.add(runtime.root);
    runtime.root.position.set(0, 0, 0);
    runtime.root.scale.setScalar(1);
    runtime.root.visible = true;
    this.currentIndex = index;
    if (index > 0) {
      const previous = this.runtime(index - 1, false);
      if (previous.isLive) previous.retire(this.stage);
      else this.stage.shadow.removeTree(previous.root);
      this.nest(previous, runtime);
    }
    // Only this scene and the one nested inside it stay in the world.
    this.runtimes.forEach((other, i) => {
      if (other && i !== index && i !== index - 1) other.root.removeFromParent();
    });
    runtime.syncUnits(this.sim.state.owned, false);
    runtime.syncUpgrades(this.sim.state.upgrades);
    runtime.flavor?.sync(this.sim.state.flavors);
    this.updateFraming();
    this.frameOpen = this.wantedOpen;
    this.applyRest(1);
    this.prepareNext();
  }

  /** Finds the closest camera position that still shows every machine the player owns. */
  private updateFraming(): void {
    const runtime = this.current;
    this.framedInset = this.uiInset;
    this.wantedOpen = 0;
    if (!runtime) return;
    const points = runtime.machinePoints();
    if (points.length === 0) return;
    const camera = this.framingCamera;
    camera.copy(this.stage.camera);
    const left = -1 + FRAMING_MARGIN;
    const right = 1 - 2 * Math.max(0, this.uiInset) - FRAMING_MARGIN;
    const limitY = 1 - FRAMING_MARGIN * 2;
    const aim = (open: number): void => {
      const pose = this.restPose(runtime.spec, 0, open);
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      camera.updateMatrixWorld();
    };
    const inFrame = (point: THREE.Vector3): boolean => {
      v.copy(point).project(camera);
      return v.x >= left && v.x <= right && Math.abs(v.y) <= limitY;
    };
    // Machines that do not fit even in the widest shot must not hold the camera open.
    aim(1);
    const reachable = points.filter(inFrame);
    for (let step = 0; step <= FRAMING_STEPS; step += 1) {
      const open = step / FRAMING_STEPS;
      aim(open);
      this.wantedOpen = open;
      if (reachable.every(inFrame)) return;
    }
  }

  /** Places the framing at once, without the usual glide. */
  snapInset(inset: number): void {
    this.uiInset = inset;
    this.shownInset = inset;
  }

  qualityChanged(): void {
    const fraction = this.stage.quality.pileInstances / QUALITY.ultra.pileInstances;
    for (const runtime of this.runtimes) runtime?.setDetail(fraction);
  }

  /** Matches presentation to a freshly loaded save without replaying any animation. */
  syncToSave(): void {
    setPotSkin(this.sim.state.legacy.potSkin);
    this.transition = null;
    this.pendingGain = 0;
    this.showScene(this.sceneIndexForStage(this.sim.state.stage));
    this.level = this.targetLevel();
    this.current!.pile.setLevel(this.level);
    this.current!.pile.update(0);
    if (this.sim.hopperActive) this.current!.director?.showHopper();
    if (this.sim.state.ended) {
      this.finaleTime = -2;
      this.current!.parts.finale?.showFinal();
      this.hooks.onFinaleDone();
    }
  }

  private targetLevel(): number {
    const shown = Math.max(0, this.sim.state.totalEarned - this.pendingGain);
    const stage = this.currentIndex;
    const from = stage > 0 ? STAGES[stage - 1]!.threshold : 0;
    const to = STAGES[stage]!.threshold;
    return clamp01((Math.log1p(shown) - Math.log1p(from)) / (Math.log1p(to) - Math.log1p(from)));
  }

  // Input ------------------------------------------------------------------------

  /** Called directly from the input handler, so the response is in the very next frame. */
  click(clientX: number, clientY: number): void {
    const runtime = this.current;
    const director = runtime?.director;
    if (!runtime || !director) return;
    if (director.hopperVisible && this.sim.hopperActive) {
      v.copy(director.hopperPosition);
      runtime.root.localToWorld(v);
      v.project(this.stage.camera);
      const canvas = this.stage.renderer.domElement;
      const dx = (v.x * 0.5 + 0.5) * canvas.clientWidth - clientX;
      const dy = (0.5 - v.y * 0.5) * canvas.clientHeight - clientY;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (Math.hypot(dx, dy) < HOPPER_HIT_RADIUS_REM * rem) {
        this.sim.catchHopper();
        return;
      }
    }
    const { count, gainEach } = this.sim.click();
    const canvas = this.stage.renderer.domElement;
    ndc.set((clientX / canvas.clientWidth) * 2 - 1, 1 - (clientY / canvas.clientHeight) * 2);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    this.pendingGain += count * gainEach;
    director.click(this.raycaster.ray, count, gainEach);
  }

  setCannonCharge(charge: number, charging: boolean): void {
    this.current?.heroCannon?.setCharge(charge, charging);
  }

  private scoopPayment(spent: number): void {
    const runtime = this.current;
    if (!runtime?.shovel) return;
    const pile = runtime.pile;
    const k = pile.shape.k;
    const budget = Math.max(this.sim.state.popcorn + spent, 1);
    const strength = 0.45 + 0.55 * clamp01(spent / budget);
    const a = this.rng.range(0.4, 1.3);
    const radius = Math.max(0.3 * k, pile.shape.landingRadius(this.level) * 0.72);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    runtime.shovel.scoop(x, pile.heightAt(x, z), z, strength, (digX, digZ, power) => {
      pile.impact(digX, digZ, 2.6 * power, 0.75 * k);
      runtime.parts.kick?.(0.6);
    });
  }

  private shockAtCannon(): void {
    const cannon = this.current?.heroCannon;
    if (!cannon) return;
    cannon.muzzle(v).project(this.stage.camera);
    this.shock.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.shockT = 0;
  }

  private readonly shock = new THREE.Vector2();
  private shockT = -1;

  // Breakthrough --------------------------------------------------------------------

  private beginBreak(broken: number): void {
    const nextIndex = broken + 1;
    if (nextIndex >= SCENES.length) {
      if (this.current?.parts.finale && this.finaleTime === -1) this.finaleTime = 0;
      return;
    }
    if (!this.current) return;
    if (this.transition) this.finishTransition();
    if (this.currentIndex !== broken) return;
    const from = this.current;
    this.transition = {
      from,
      to: this.runtime(nextIndex, true),
      stage: broken,
      t: 0,
      blasted: false,
      startPose: null,
      silenced: false,
      arrived: false,
    };
    this.transition.to.root.visible = false;
    this.hooks.onBreakBeat('strain', broken);
  }

  /** Long shows can always be skipped. */
  skipTransition(): void {
    if (this.transition) this.finishTransition();
    else if (this.finaleTime >= 0) this.endFinale();
  }

  get inFinale(): boolean {
    return this.finaleTime >= 0;
  }

  private endFinale(): void {
    this.finaleTime = -2;
    const parts = this.current?.parts;
    parts?.finale?.showFinal();
    const root = this.current?.root;
    root?.position.set(0, 0, 0);
    this.hooks.onFinaleDone();
  }

  private updateFinale(dt: number): void {
    const plan = this.current?.parts.finale;
    if (!plan) return;
    const before = this.finaleTime;
    const step = dt * this.showSpeed;
    this.finaleTime += step;
    for (const [at, beat] of plan.beats) {
      if (before < at && this.finaleTime >= at) {
        this.hooks.onFinaleBeat(beat);
        if (beat === 'moon-pop') this.impact.hit('epic');
        if (beat === 'grab') this.impact.hit('large');
      }
    }
    const ctx = this.current!.context(this.time, 1, this.intensity);
    if (ctx) plan.update(this.finaleTime, step, ctx);
    if (this.finaleTime >= plan.duration) this.endFinale();
  }

  private startBlast(tr: Transition): void {
    tr.blasted = true;
    const from = tr.from;
    const ctx = from.context(this.time, 1, this.intensity);
    if (ctx) from.parts.blast?.(ctx);
    this.impact.hit('epic');
    this.hooks.onBreakBeat('blast', tr.stage);

    // From here on the old scene lives inside the new one, so the camera can simply pull away.
    tr.startPose = this.poseInNextScene(from.spec);
    this.root.add(tr.to.root);
    tr.to.root.visible = true;
    tr.to.root.position.set(0, 0, 0);
    tr.to.root.scale.setScalar(1);
    this.nest(from, tr.to);
    from.beginShrinking(this.stage);
    // Whatever was nested inside the old scene is now too small to matter.
    this.runtimes[SCENES.indexOf(from.spec) - 1]?.root.removeFromParent();
    this.currentIndex = SCENES.indexOf(tr.to.spec);
    tr.to.syncUnits(this.sim.state.owned, false);
    this.updateFraming();
    this.frameOpen = this.wantedOpen;
    tr.to.syncUpgrades(this.sim.state.upgrades);
    tr.to.flavor?.sync(this.sim.state.flavors);
    tr.to.setFlockHidden(true);
    tr.to.parts.enter?.(0);
    this.level = 0;
    this.prepareNext();
  }

  /** The camera and light of a scene, re-expressed in the coordinates of the scene that swallows it. */
  private poseInNextScene(spec: SceneSpec): Pose {
    const nest = spec.nest!;
    const m = nest.scale;
    const turn = this.nestTurn(spec);
    const toParent = (p: THREE.Vector3): THREE.Vector3 => p.clone().multiplyScalar(m).applyQuaternion(turn).add(nest.position);
    const camera = this.stage.camera;
    const rig = spec.light;
    const c = toParent(new THREE.Vector3(...(rig.pool.slice(0, 3) as [number, number, number])));
    return {
      position: toParent(camera.position),
      target: toParent(this.cameraTarget),
      fov: camera.fov,
      focusDistance: this.stage.post.params.focusDistance * m,
      focusRange: this.stage.post.params.focusRange * m,
      aoRadius: spec.aoRadius * m,
      shadowCenter: toParent(spec.shadow.center),
      shadowRadius: spec.shadow.radius * m,
      rig: { ...rig, pool: [c.x, c.y, c.z, rig.pool[3] * m], fogRange: [rig.fogRange[0] * m, rig.fogRange[1] * m] },
      grade: spec.grade,
    };
  }

  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    if (!tr.blasted) this.startBlast(tr);
    tr.from.retire(this.stage);
    // The scene nested inside the old one has become far too small to see.
    this.runtimes[SCENES.indexOf(tr.from.spec) - 1]?.root.removeFromParent();
    tr.to.parts.enter?.(1);
    tr.to.setFlockHidden(false);
    this.transition = null;
    if (!tr.arrived) this.hooks.onBreakBeat('arrive', tr.stage);
    this.stage.post.params.shock.w = 0;
  }

  private updateTransition(dt: number): void {
    const tr = this.transition!;
    tr.t += dt * this.showSpeed;
    const t = tr.t;
    if (!tr.silenced && t >= STRAIN_END) {
      tr.silenced = true;
      this.hooks.onBreakBeat('silence', tr.stage);
    }
    if (!tr.blasted && t >= STRAIN_END + tuning.breakSilenceMs / 1000) this.startBlast(tr);
    if (!tr.arrived && t >= ZOOM_END - 0.35) {
      tr.arrived = true;
      this.hooks.onBreakBeat('arrive', tr.stage);
    }
    if (tr.blasted) tr.to.parts.enter?.(clamp01((t - ZOOM_START) / (ZOOM_END - ZOOM_START)));
    if (t >= TRANSITION_END) this.finishTransition();
  }

  // Frame ---------------------------------------------------------------------------

  update(deltaSeconds: number): void {
    const dt = deltaSeconds;
    this.time += dt;
    this.intensity = showIntensity(this.sim.perSecond);

    const wanted = this.sceneIndexForStage(this.sim.state.stage);
    if (!this.transition && wanted !== this.currentIndex) this.showScene(wanted);

    const tr = this.transition;
    if (tr) this.updateTransition(dt);
    const active = this.transition;

    // During the silent beat the old scene hangs in slow motion.
    let sceneDt = dt;
    if (active && !active.blasted && active.t > STRAIN_END) sceneDt = dt * 0.12;

    if (!active || active.blasted) {
      this.level += (this.targetLevel() - this.level) * (1 - Math.exp(-dt * 7));
    }

    const current = this.current!;
    const cooling = this.sim.state.cannonCooldown > 0;
    const shared = { time: this.time, level: this.level, intensity: this.intensity, attract: this.attract };
    if (active && !active.blasted) {
      const u = clamp01(active.t / STRAIN_END);
      const ctx = active.from.context(this.time, 1, this.intensity);
      if (ctx) active.from.parts.strain?.(u, ctx);
      active.from.pile.setLevel(1 + u * 0.05);
      active.from.update(sceneDt, { ...shared, level: 1 + u * 0.05 }, cooling);
    } else {
      current.update(dt, shared, cooling);
      if (active) {
        const ctx = active.from.context(this.time, 1, this.intensity);
        if (ctx) {
          active.from.parts.afterBlast?.(dt, ctx);
          active.from.update(dt, { ...shared, level: 1 }, cooling);
        }
      }
    }

    if (this.finaleTime >= 0) this.updateFinale(dt);
    // The framing glides when the interface comes or goes.
    this.shownInset += (this.uiInset - this.shownInset) * (1 - Math.exp(-dt * 3));
    if (Math.abs(this.uiInset - this.framedInset) > 0.01) this.updateFraming();
    this.frameOpen += (this.wantedOpen - this.frameOpen) * (1 - Math.exp(-dt * 1.6));
    this.applyView(dt);
  }

  private readonly cameraTarget = new THREE.Vector3();
  /** -1 before the ending, -2 after it, otherwise seconds into the closing show. */
  private finaleTime = -1;

  private restPose(spec: SceneSpec, level: number, open = this.frameOpen): Pose {
    const t = Math.max(smoothstep(level, 0.3, 0.92), open);
    const near = 1 - (1 - spec.close.distance) * (1 - t);
    const target = spec.close.target.clone().lerp(spec.camera.target, t);
    const position = spec.camera.position.clone().sub(spec.camera.target).multiplyScalar(near).add(target);
    position.y += spec.close.lift * (1 - t);
    // A tight opening shot gets a tight shadow map, so close-ups stay crisp.
    const shadowTight = lerp(0.62, 1, t);
    return {
      position,
      target,
      fov: spec.camera.fov,
      focusDistance: position.distanceTo(spec.focusPoint),
      focusRange: spec.focusRange * near * FOCUS_DEPTH,
      aoRadius: spec.aoRadius,
      shadowCenter: spec.close.target.clone().lerp(spec.shadow.center, t),
      shadowRadius: spec.shadow.radius * shadowTight,
      rig: spec.light,
      grade: spec.grade,
    };
  }

  private applyRest(level: number): void {
    this.applyPose(this.restPose(this.current!.spec, level));
  }

  private applyView(dt: number): void {
    if (this.cameraLocked) return;
    const tr = this.transition;
    const rest = this.restPose(this.current!.spec, this.level);
    let pose = rest;
    const plan = this.current!.parts.finale;
    if (plan && this.finaleTime !== -1) {
      const shot = plan.camera(this.finaleTime === -2 ? plan.duration : this.finaleTime);
      pose = { ...rest, position: shot.position, target: shot.target, focusDistance: shot.position.distanceTo(shot.target), focusRange: 150, shadowCenter: new THREE.Vector3(0, -14, 0), shadowRadius: 62 };
    } else if (tr && !(this.reduceMotion && tr.blasted)) {
      if (!tr.blasted) {
        // The camera leans in while the pressure builds.
        const push = easeInOutCubic(clamp01(tr.t / (STRAIN_END + 0.3)));
        pose = { ...rest, position: rest.position.clone().lerp(rest.target, push * 0.08) };
      } else {
        const u = easeInOutCubic(clamp01((tr.t - ZOOM_START) / (ZOOM_END - ZOOM_START)));
        pose = this.blendPose(tr.startPose!, rest, u, tr.from.spec.nest?.rise ?? 0.1);
      }
    }
    if (this.attract) {
      // A slow drift around the pot while the title is up.
      const angle = Math.sin(this.time * 0.13) * 0.16;
      const offset = pose.position.clone().sub(pose.target).applyAxisAngle(up.set(0, 1, 0), angle);
      pose = { ...pose, position: pose.target.clone().add(offset) };
    }
    this.applyPose(pose);

    const post = this.stage.post.params;
    post.flash = this.impact.flash;
    post.chroma = this.impact.chroma;
    if (this.shockT >= 0) {
      this.shockT += dt;
      const u = this.shockT / 0.55;
      if (u >= 1 || this.impact.prefs.reduceMotion) {
        this.shockT = -1;
        post.shock.w = 0;
      } else {
        post.shock.set(this.shock.x, this.shock.y, u * 0.9, 0.035 * (1 - u) * (1 - u));
      }
    }
  }

  private blendPose(a: Pose, b: Pose, t: number, rise: number): Pose {
    const toCamA = v.copy(a.position).sub(a.target);
    const toCamB = v2.copy(b.position).sub(b.target);
    const distance = logLerp(toCamA.length(), toCamB.length(), t);
    const dir = toCamA.clone().normalize().lerp(toCamB.clone().normalize(), t).normalize();
    // The target travels on the same logarithmic schedule, keeping the shrinking scene in frame.
    const w = (Math.pow(toCamB.length() / toCamA.length(), t) - 1) / (toCamB.length() / toCamA.length() - 1);
    const target = a.target.clone().lerp(b.target, w);
    const position = target.clone().addScaledVector(dir, distance);
    // The camera climbs up and out, so it clears the walls of the room it is leaving.
    position.y += Math.sin(t * Math.PI) * distance * rise;
    return {
      position,
      target,
      fov: lerp(a.fov, b.fov, t),
      focusDistance: logLerp(a.focusDistance, b.focusDistance, t),
      focusRange: logLerp(a.focusRange, b.focusRange, t),
      aoRadius: logLerp(a.aoRadius, b.aoRadius, t),
      shadowCenter: a.shadowCenter.clone().lerp(b.shadowCenter, w),
      shadowRadius: logLerp(a.shadowRadius, b.shadowRadius, t),
      rig: mixRig(a.rig, b.rig, t),
      grade: mixGrade(a.grade, b.grade, t),
    };
  }

  private applyPose(pose: Pose): void {
    const { camera, post, shadow } = this.stage;
    camera.position.copy(pose.position);
    this.cameraTarget.copy(pose.target);
    camera.fov = pose.fov;
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();

    const { shakeX, shakeY, shakeRoll } = this.impact;
    const distance = pose.position.distanceTo(pose.target);
    if (shakeX !== 0 || shakeY !== 0) {
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const scale = distance * 0.075;
      camera.position.addScaledVector(right, shakeX * scale).addScaledVector(up, shakeY * scale);
      camera.rotateZ(shakeRoll);
    }
    camera.near = Math.max(0.05, distance * 0.03);
    // Far enough for the sky domes even when the camera is close to the action.
    camera.far = 1400;
    this.stage.viewShiftX = this.shownInset * 0.46;
    camera.updateProjectionMatrix();

    applyLightRig(pose.rig);
    applyLamps(this.current?.spec.lamps ?? [], this.time, this.stage.quality.lamps);
    shadow.setFrustum(pose.shadowCenter, pose.shadowRadius);
    globals.uOutlineRefDist.value = distance * 0.72;

    const p = post.params;
    p.focusDistance = pose.focusDistance;
    p.focusRange = pose.focusRange;
    p.aoRadius = pose.aoRadius;
    p.reflectionRange = pose.aoRadius * REFLECTION_REACH;
    p.exposure = pose.grade.exposure;
    p.contrast = pose.grade.contrast;
    p.saturation = pose.grade.saturation;
    p.vignette = pose.grade.vignette;
    p.bloom = pose.grade.bloom;
    p.shadowTint.set(pose.grade.shadowTint);
    p.highlightTint.set(pose.grade.highlightTint);
    p.aoTint.set(pose.grade.aoTint);
  }

  // QA --------------------------------------------------------------------------------

  /** QA camera override for close inspection. */
  viewFrom(position: THREE.Vector3Tuple, target: THREE.Vector3Tuple, fov: number): void {
    this.cameraLocked = true;
    const { camera, post } = this.stage;
    camera.position.set(...position);
    camera.fov = fov;
    camera.lookAt(...target);
    this.stage.viewShiftX = 0;
    camera.updateProjectionMatrix();
    post.params.focusDistance = camera.position.distanceTo(v.set(...target));
    post.params.focusRange = 1.4;
  }

  /** QA view for judging a single flake at hero size. */
  showcase(): void {
    const director = this.current?.director;
    if (!director) return;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 6; i += 1) {
      const x = -1.04 + (i % 3) * 1.04;
      const y = 3.1 + (i < 3 ? 0.5 : -0.5);
      q.setFromEuler(e.set(i * 1.3 + 0.4, i * 2.1 + 0.8, i * 0.7));
      director.display(i, x, y, 0.5, 0.46, 1, q);
    }
    this.viewFrom([0, 3.3, 5.5], [0, 3.1, 0.5], 26);
    this.stage.post.params.focusRange = 2;
  }
}

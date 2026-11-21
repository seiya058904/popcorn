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
import { applyLamps, applyLightRig, globals, type Lamp, type LightRig } from './core/globals.ts';
import { releaseSharedShapes } from './geometry/kit.ts';
import { QUALITY } from './core/quality.ts';
import { bindEnvironment } from './core/probe.ts';
import type { Stage } from './core/stage.ts';
import { popcornUniforms } from './materials/popcorn.ts';
import { SceneRuntime, type RuntimeHooks } from './scene-runtime.ts';
import { alongStory, mixGrade, mixRig, moodScratch, storyMood } from './scenes/story.ts';
import { cinemaSpec } from './scenes/cinema.ts';
import { earthSpec } from './scenes/earth.ts';
import { kitchenSpec } from './scenes/kitchen.ts';
import { setPotSkin, stoveSpec } from './scenes/stove.ts';
import { townSpec } from './scenes/town.ts';
import { gag, type EggSpot } from './scenes/eggs.ts';
import type { FinaleBeat, Grade, SceneSpec, UnitKindName } from './scenes/types.ts';

export type BreakBeat = 'strain' | 'silence' | 'blast' | 'arrive';

export interface WorldHooks {
  onBurst(screenX: number, screenY: number, combo: number, gain: number, manual: boolean, golden: boolean): void;
  onLand(gain: number): void;
  onMachineCannon(): void;
  onMachineSound(name: string): void;
  /** A run of clicks reached a round number. */
  onCombo(count: number): void;
  onBreakBeat(beat: BreakBeat, stage: number): void;
  onFinaleBeat(beat: FinaleBeat): void;
  onFinaleDone(): void;
  /** Where the music is within its beat, 0 to 1, so the frenzy lights can pulse in time. */
  beatPhase(): number;
  /** A hidden thing was tapped; `first` the first time it was ever found. */
  onEgg(id: string, first: boolean, screenX: number, screenY: number): void;
  /** A working machine was poked. */
  onPoke(unit: number): void;
  /** What the pointer rests on changed: a machine, a hidden thing, or nothing. */
  onHover(target: HoverTarget): void;
}

export type HoverTarget = { kind: 'machine'; unit: number } | { kind: 'egg' } | null;

/** Scenes in play order; later milestones extend this list. */
export const SCENES: SceneSpec[] = [stoveSpec, kitchenSpec, cinemaSpec, townSpec, earthSpec];

const STRAIN_END = 0.85;
const ZOOM_START = 1.21;
const ZOOM_END = 3.1;
const TRANSITION_END = 3.25;
/** The breakout camera overshoots its new framing by this share, over the last part of the climb. */
const SETTLE_OVERSHOOT = 0.03;
const SETTLE_FROM = 0.72;
/** Share of a frame's camera travel smeared into motion blur at the climb's fastest. */
const BREAKOUT_BLUR = 0.75;
/** The vessel starts to tremble and crack when the scene is this close to bursting. */
const PRESSURE_FROM = 0.955;
const PRESSURE_SHARE = 0.5;
const COMBO_STEP = 12;
/** A found egg can be tapped again for its gag, but not faster than this. */
const EGG_COOLDOWN = 4;
/** Now and then an egg not yet found twinkles, somewhere between these many seconds apart. */
const WINK_EVERY: [number, number] = [22, 40];
/** The close look at a machine bought for the first time. */
const SPOTLIGHT_IN = 0.45;
const SPOTLIGHT_HOLD = 1.55;
const SPOTLIGHT_OUT = 0.55;
const SPOTLIGHT_DISTANCE = 2.45;
/** Directions tried for a close-up, as turns away from the scene's wide shot. */
const SPOTLIGHT_TURNS = [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8];
const HOPPER_HIT_RADIUS_REM = 5.2;
/** How many camera positions are tried when fitting the machines into the picture. */
const FRAMING_STEPS = 12;
const FRAMING_MARGIN = 0.05;
/** Keeps the whole play area sharp; only the distant background goes soft. */
const FOCUS_DEPTH = 1.8;
const REFLECTION_REACH = 14;
/** Milliseconds per frame spent building the next scene in the background. */
const BUILD_BUDGET_MS = 4;
/** The miniature focus band, for scenes that do not set their own strength. */
const TILT_SHIFT = 0.4;
/** Short-lived lights for big moments: a cannon shot, a golden kernel, a breakout. */
const FLASH_LIGHTS = 2;
const FLASH_ATTACK = 0.035;
/** Event lights are this much dimmer with reduced motion, which also tones down flashes. */
const CALM_FLASH = 0.5;
const frenzyWarm = new THREE.Color('#ffd9a8');
const frenzyLampColor = new THREE.Color('#ffae4a');
const bounceLight = new THREE.Color();
const frenzyEdge = new THREE.Color('#ff9a3c');
/** How long the rays from a golden kernel last. */
const FLARE_SECONDS = 0.8;
/** The three story looks a room probe holds, by index. */
const LOOKS = [0, 1, 2] as const;

interface Flash {
  lamp: Lamp & { color: THREE.Color };
  peak: number;
  age: number;
  decay: number;
}

const ndc = new THREE.Vector2();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();

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
  /** Strength of the miniature focus band. */
  tilt: number;
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
  /** Off for captures, which must come out the same every time: they build scenes in one go. */
  backgroundBuilds = true;
  /** The scene being built in the background, if any. */
  private job: {
    index: number;
    runtime: SceneRuntime;
    steps: Generator<void, void, void>;
    phase: 'build' | 'compile' | 'upload' | 'probe';
    pending: THREE.Object3D[];
    /** The reflection capture, once everything is on the GPU. */
    probe: Generator<void, void, void> | null;
    longestStepMs: number;
    longestProbeStepMs: number;
  } | null = null;

  /** True while the next scene is still being built, compiled or uploaded in the background. */
  get preparing(): boolean {
    return this.job !== null;
  }

  private readonly stage: Stage;
  private readonly sim: Simulation;
  private readonly hooks: WorldHooks;
  private readonly impact: ImpactDirector;
  private readonly rng = new Rng(77);
  private readonly raycaster = new THREE.Raycaster();
  /** When each egg can play its gag again. */
  private readonly eggReady = new Map<string, number>();
  private winkTimer = 30;
  /** Where the pointer last moved over the canvas, waiting for the next frame to be looked at. */
  private hoverAt: { x: number; y: number } | null = null;
  private hovered: HoverTarget = null;
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
  private spotlight: { center: THREE.Vector3; size: number; yaw: number; elevation: number; t: number } | null = null;
  private readonly flashes: Flash[] = Array.from({ length: FLASH_LIGHTS }, () => ({
    lamp: { position: [0, 0, 0], color: new THREE.Color(), intensity: 0, radius: 1 },
    peak: 0,
    age: 9,
    decay: 0.3,
  }));
  private readonly frenzyLamp: Lamp & { color: THREE.Color } = { position: [0, 0, 0], color: new THREE.Color(), intensity: 0, radius: 1 };
  /** Lit after the scene's own lamps whenever they are on. */
  private readonly eventLamps: Lamp[] = [...this.flashes.map((flash) => flash.lamp), this.frenzyLamp];
  /** 0 to 1, easing in and out with a frenzy. */
  private frenzy = 0;
  private readonly mood = moodScratch();

  constructor(stage: Stage, sim: Simulation, bus: EventBus<GameEvents>, impact: ImpactDirector, hooks: WorldHooks) {
    this.stage = stage;
    this.sim = sim;
    this.hooks = hooks;
    this.impact = impact;
    stage.scene.add(this.root);
    this.runtimeHooks = {
      onSquash: () => undefined,
      onBurst: (position, combo, gain, manual, golden) => {
        v.copy(position);
        this.current?.root.localToWorld(v);
        if (golden) {
          this.flashLight(v, '#ffcf3a', 2.4, (this.current?.spec.pile.k ?? 1) * 3.4, 0.4);
          // Rays of gold out of the burst, for a moment.
          this.flare.copy(v);
          this.flareT = 0;
        }
        v.project(this.stage.camera);
        const canvas = this.stage.renderer.domElement;
        this.hooks.onBurst((v.x * 0.5 + 0.5) * canvas.clientWidth, (0.5 - v.y * 0.5) * canvas.clientHeight, combo, gain, manual, golden);
      },
      onLand: (gain) => {
        this.pendingGain = Math.max(0, this.pendingGain - gain);
        this.hooks.onLand(gain);
      },
      onMachineCannon: () => this.hooks.onMachineCannon(),
      onMachineSound: (name) => this.hooks.onMachineSound(name),
      onMachineThump: () => this.impact.hit('medium'),
    };

    bus.on('auto_popped', () => this.current?.autoPop());
    bus.on('producer_purchased', ({ producer, owned, quantity, milestone, spent }) => {
      const runtime = this.current;
      runtime?.syncUnits(this.sim.state.owned, true);
      this.updateFraming();
      this.scoopPayment(spent);
      if (!runtime) return;
      if (!runtime.hasMachine(producer)) runtime.dropParcel();
      else if (owned === quantity && producer > 0) this.startSpotlight(producer);
      if (milestone) {
        runtime.celebrate(producer);
        this.impact.hit('medium');
      }
    });
    bus.on('upgrade_purchased', ({ spent }) => {
      this.scoopPayment(spent);
      this.current?.syncUpgrades(this.sim.state.upgrades, true);
    });
    bus.on('flavor_unlocked', ({ flavor, spent }) => {
      this.scoopPayment(spent);
      this.current?.flavor?.play(flavor);
      this.impact.hit('medium');
    });
    bus.on('cannon_fired', ({ result }) => {
      this.current?.fireCannon(result);
      this.impact.hit(result === 'overpressure' ? 'medium' : 'large');
      if (result === 'overpressure') return;
      this.shockAtCannon();
      const cannon = this.current?.heroCannon;
      const k = this.current?.spec.pile.k ?? 1;
      if (cannon) this.flashLight(cannon.muzzle(v2), result === 'perfect' ? '#ffd27a' : '#ffa552', result === 'perfect' ? 4 : 3, k * 9, 0.22);
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
    if (runtime) return runtime;
    // Needed before the background build got there: finish it now. Normally it is long done.
    if (this.job?.index === index) {
      this.finishJob();
      return this.runtimes[index]!;
    }
    runtime = new SceneRuntime(this.stage, SCENES[index]!, this.rng, this.runtimeHooks, live);
    const steps = runtime.construct();
    while (steps.next().done !== true);
    releaseSharedShapes();
    // Only a scene that is played in needs its room for reflections; a nested one is too small.
    if (live) {
      const probe = runtime.captureProbe(true);
      while (probe.next().done !== true);
    }
    this.runtimes[index] = runtime;
    return runtime;
  }

  /**
   * Starts building the following scene. In play it is built a few milliseconds per frame while
   * the current scene runs, its shaders compile off the main thread, and its buffers go to the GPU
   * one piece per frame, so the next breakout finds it ready and nothing ever stalls.
   */
  private prepareNext(): void {
    const next = this.currentIndex + 1;
    if (next >= SCENES.length || this.runtimes[next] || this.job?.index === next) return;
    const runtime = new SceneRuntime(this.stage, SCENES[next]!, this.rng, this.runtimeHooks, true);
    this.job = { index: next, runtime, steps: runtime.construct(), phase: 'build', pending: [], probe: null, longestStepMs: 0, longestProbeStepMs: 0 };
    if (!this.backgroundBuilds) this.finishJob();
  }

  /** Works on the background build for about `budgetMs` milliseconds. */
  private advanceJob(budgetMs: number): void {
    const job = this.job;
    if (!job) return;
    const start = performance.now();
    while (performance.now() - start < budgetMs) {
      if (job.phase === 'build') {
        const before = performance.now();
        const done = job.steps.next().done === true;
        job.longestStepMs = Math.max(job.longestStepMs, performance.now() - before);
        if (done) {
          releaseSharedShapes();
          this.stage.requestCompile(job.runtime.root);
          job.phase = 'compile';
          return;
        }
      } else if (job.phase === 'compile') {
        // The driver compiles in parallel; drawing before it is done would block.
        if (!this.stage.programsReady()) return;
        job.pending = [...job.runtime.root.children];
        job.phase = 'upload';
      } else if (job.phase === 'upload') {
        const piece = job.pending.shift();
        if (piece) this.stage.preload(piece);
        if (job.pending.length === 0) {
          job.probe = job.runtime.captureProbe(false);
          job.phase = 'probe';
        }
        // Uploads are big and few: one per frame keeps each frame short.
        return;
      } else {
        // One face of the reflection capture per frame: each is a full draw of the set.
        const before = performance.now();
        const done = job.probe!.next().done === true;
        job.longestProbeStepMs = Math.max(job.longestProbeStepMs, performance.now() - before);
        if (done) this.completeJob();
        return;
      }
    }
  }

  private finishJob(): void {
    const job = this.job;
    if (!job) return;
    if (job.phase === 'build') {
      while (job.steps.next().done !== true);
      releaseSharedShapes();
    }
    this.stage.preload(job.runtime.root);
    const probe = job.probe ?? job.runtime.captureProbe(true);
    while (probe.next().done !== true);
    this.completeJob();
  }

  private completeJob(): void {
    const job = this.job!;
    this.runtimes[job.index] = job.runtime;
    if (__QA__) {
      job.runtime.root.userData.longestBuildStepMs = job.longestStepMs;
      job.runtime.root.userData.longestProbeStepMs = job.longestProbeStepMs;
    }
    this.job = null;
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
    runtime.snapStory = true;
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

  /** A ray from the camera through a point on the canvas. */
  private rayAt(clientX: number, clientY: number): THREE.Ray {
    const canvas = this.stage.renderer.domElement;
    ndc.set((clientX / canvas.clientWidth) * 2 - 1, 1 - (clientY / canvas.clientHeight) * 2);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.raycaster.ray;
  }

  /** What a press would act on, besides popping: a hidden thing first, then a machine. */
  private targetAt(clientX: number, clientY: number): { egg: EggSpot } | { unit: number; copy: number } | null {
    const runtime = this.current;
    if (!runtime || this.transition || this.finaleTime !== -1 || this.attract) return null;
    const ray = this.rayAt(clientX, clientY);
    const egg = runtime.pickEgg(ray);
    if (egg) return { egg };
    const machine = runtime.pickMachine(ray);
    return machine ? { unit: machine.unit, copy: machine.copy } : null;
  }

  /** The pointer moved over the canvas; it is looked at once per frame. */
  hover(clientX: number, clientY: number): void {
    this.hoverAt = { x: clientX, y: clientY };
  }

  /** The pointer left the canvas. */
  unhover(): void {
    this.hoverAt = null;
    this.setHovered(null, -1);
  }

  private setHovered(target: HoverTarget, copy: number): void {
    this.current?.hoverMachine(target?.kind === 'machine' ? target.unit : -1, copy);
    const same = target?.kind === this.hovered?.kind && (target?.kind !== 'machine' || (this.hovered?.kind === 'machine' && target.unit === this.hovered.unit));
    this.hovered = target;
    if (!same) this.hooks.onHover(target);
  }

  private updateHover(): void {
    if (!this.hoverAt) return;
    const target = this.targetAt(this.hoverAt.x, this.hoverAt.y);
    if (!target) this.setHovered(null, -1);
    else if ('egg' in target) this.setHovered({ kind: 'egg' }, -1);
    else this.setHovered({ kind: 'machine', unit: target.unit }, target.copy);
  }

  /** A press on something in the scene: an egg plays its gag, a machine gets poked. */
  private pressTarget(clientX: number, clientY: number): void {
    const runtime = this.current;
    const target = this.targetAt(clientX, clientY);
    if (!runtime || !target) return;
    if ('egg' in target) {
      const { egg } = target;
      if ((this.eggReady.get(egg.id) ?? 0) > this.time) return;
      this.eggReady.set(egg.id, this.time + EGG_COOLDOWN);
      const ctx = runtime.context(this.time, this.level, this.intensity);
      if (ctx) egg.play(ctx);
      const first = this.sim.findEgg(egg.id);
      this.hooks.onEgg(egg.id, first, clientX, clientY);
      return;
    }
    if (this.sim.poke(target.unit)) {
      runtime.pokeMachine(target.unit, target.copy);
      this.hooks.onPoke(target.unit);
    }
  }

  /** Now and then one egg not yet found in this scene catches the light. */
  private updateWink(dt: number): void {
    const runtime = this.current;
    if (!runtime || this.transition || this.attract || this.finaleTime !== -1) return;
    this.winkTimer -= dt;
    if (this.winkTimer > 0) return;
    this.winkTimer = WINK_EVERY[0] + Math.random() * (WINK_EVERY[1] - WINK_EVERY[0]);
    const found = this.sim.state.legacy.found;
    const hidden = runtime.eggs.filter((spot) => !found.includes(spot.id) && runtime.canFind(spot));
    const spot = hidden[Math.floor(Math.random() * hidden.length)];
    const ctx = spot ? runtime.context(this.time, this.level, this.intensity) : null;
    if (spot && ctx) gag.wink(ctx, spot.position, runtime.spec.pile.k);
  }

  /**
   * Called directly from the input handler, so the response is in the very next frame. `press`
   * is a real press; holding the button repeats the pop without poking anything again.
   */
  click(clientX: number, clientY: number, press = true): void {
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
    if (press) this.pressTarget(clientX, clientY);
    const { count, gainEach, golden } = this.sim.click();
    this.rayAt(clientX, clientY);
    this.pendingGain += count * gainEach;
    if (golden) {
      // The other kernels pay what a plain click would; the golden one carries the rest.
      const plainEach = gainEach / this.sim.derived.goldenMultiplier;
      director.click(this.raycaster.ray, count, plainEach, count * gainEach - plainEach * (count - 1));
    } else {
      director.click(this.raycaster.ray, count, gainEach);
    }
    // A click during a machine's close-up means the player wants the game back.
    if (this.spotlight) this.spotlight.t = Math.max(this.spotlight.t, SPOTLIGHT_IN + SPOTLIGHT_HOLD);
    const combo = director.comboCount;
    if (combo > 0 && combo % COMBO_STEP === 0) {
      const power = Math.min(3, combo / (COMBO_STEP * 2));
      runtime.comboBurst(power);
      this.hooks.onCombo(combo);
      const { pile } = runtime;
      const k = pile.shape.k;
      v.set(pile.shape.centerX, pile.heightAt(pile.shape.centerX, pile.shape.centerZ) + k, pile.shape.centerZ);
      this.flashLight(runtime.root.localToWorld(v), '#ffc070', 1.1 + power * 0.5, k * 4.5, 0.28);
    }
  }

  private startSpotlight(producer: number): void {
    if (this.reduceMotion || this.attract || this.transition || this.finaleTime !== -1) return;
    const copy = this.current?.machineFocus(producer);
    if (copy) this.spotlight = { center: copy.center, size: copy.size, ...this.spotlightDirection(copy.center, copy.size, copy.rotation), t: 0 };
  }

  /**
   * The scene's wide shot is composed so every machine can be seen, so the close-up starts from
   * that direction, then turns just far enough for the big pot and its heap not to block it.
   */
  private spotlightDirection(center: THREE.Vector3, size: number, rotation: number): { yaw: number; elevation: number } {
    const runtime = this.current!;
    const wide = runtime.spec.camera.position;
    const dx = wide.x - center.x;
    const dz = wide.z - center.z;
    const base = Math.atan2(dx, dz);
    const elevation = THREE.MathUtils.clamp(Math.atan2(wide.y - center.y, Math.hypot(dx, dz)), 0.14, 0.5);
    const distance = size * SPOTLIGHT_DISTANCE * Math.cos(elevation);
    const blocked = Math.max(runtime.spec.vesselRadius ?? (runtime.spec.homeRadius / 0.72) * 1.3, runtime.pile.shape.landingRadius(this.level));
    const front = rotation + 0.55;
    const toFront = Math.sin(front - base) >= 0 ? 1 : -1;
    let best = base;
    let bestClearance = -1;
    for (const turn of SPOTLIGHT_TURNS) {
      for (const side of turn === 0 ? [1] : [toFront, -toFront]) {
        const yaw = base + turn * side;
        const ex = center.x + Math.sin(yaw) * distance;
        const ez = center.z + Math.cos(yaw) * distance;
        // Closest the line of sight comes to the middle of the scene, seen from above.
        const lx = ex - center.x;
        const lz = ez - center.z;
        const along = clamp01(-(center.x * lx + center.z * lz) / (lx * lx + lz * lz));
        const clearance = Math.hypot(center.x + lx * along, center.z + lz * along);
        if (clearance > blocked) return { yaw, elevation };
        if (clearance > bestClearance) {
          bestClearance = clearance;
          best = yaw;
        }
      }
    }
    // Standing right beside the big object: the view from the far side is the clearest there is.
    return { yaw: best, elevation };
  }

  private spotlightPose(rest: Pose): Pose {
    const s = this.spotlight!;
    const u = easeInOutCubic(clamp01(s.t / SPOTLIGHT_IN)) * (1 - easeInOutCubic(clamp01((s.t - SPOTLIGHT_IN - SPOTLIGHT_HOLD) / SPOTLIGHT_OUT)));
    const distance = s.size * SPOTLIGHT_DISTANCE;
    const a = s.yaw + s.t * 0.06;
    const flat = distance * Math.cos(s.elevation);
    const eye = v2.set(s.center.x + Math.sin(a) * flat, s.center.y + distance * Math.sin(s.elevation), s.center.z + Math.cos(a) * flat);
    // Aiming a little high leaves the machine clear of the counter at the top of the screen.
    const aim = s.center.clone();
    aim.y += s.size * 0.1;
    return {
      ...rest,
      position: rest.position.clone().lerp(eye, u),
      target: rest.target.clone().lerp(aim, u),
      focusDistance: lerp(rest.focusDistance, distance, u),
      focusRange: lerp(rest.focusRange, s.size * 1.1, u),
      tilt: rest.tilt * (1 - u),
    };
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
    from.burstVessel();
    from.blastEffects();
    this.punch = 1;
    this.hooks.onBreakBeat('blast', tr.stage);

    // From here on the old scene lives inside the new one, so the camera can simply pull away.
    tr.startPose = this.poseInNextScene(from.spec);
    this.root.add(tr.to.root);
    tr.to.root.visible = true;
    tr.to.root.position.set(0, 0, 0);
    tr.to.root.scale.setScalar(1);
    this.nest(from, tr.to);
    // The burst lights up the room the old scene has just become a corner of.
    from.root.updateWorldMatrix(true, false);
    this.flashLight(from.root.localToWorld(v.set(0, from.spec.steamY, 0)), '#ffd08a', 4.5, tr.to.spec.pile.k * 16, 0.8);
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
    // The scene leaves in its late look, which is where its story ended.
    const late = storyMood(spec.light, spec.grade, spec.story, 1, moodScratch());
    const rig = late.rig;
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
      grade: late.grade,
      tilt: this.stage.post.params.tilt.x,
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
    if (!tr.arrived) this.arrive(tr);
    this.stage.post.params.shock.w = 0;
  }

  private arrive(tr: Transition): void {
    tr.arrived = true;
    tr.to.dropInMachines();
    this.hooks.onBreakBeat('arrive', tr.stage);
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
    if (!tr.arrived && t >= ZOOM_END - 0.35) this.arrive(tr);
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
    // Shows get the whole frame; the next scene is built in the quiet in between.
    if (!active && this.finaleTime < 0) this.advanceJob(BUILD_BUDGET_MS);
    this.updateHover();
    this.updateWink(dt);

    // During the silent beat the old scene hangs in slow motion.
    let sceneDt = dt;
    if (active && !active.blasted && active.t > STRAIN_END) sceneDt = dt * 0.12;

    if (!active || active.blasted) {
      this.level += (this.targetLevel() - this.level) * (1 - Math.exp(-dt * 7));
    }
    if (this.spotlight) {
      this.spotlight.t += dt;
      if (this.spotlight.t >= SPOTLIGHT_IN + SPOTLIGHT_HOLD + SPOTLIGHT_OUT) this.spotlight = null;
    }
    if (this.current) {
      this.current.holdLaunches = this.spotlight !== null;
      this.current.calmEntrances = this.reduceMotion;
    }

    const current = this.current!;
    const cooling = this.sim.state.cannonCooldown > 0;
    const shared = { time: this.time, level: this.level, intensity: this.intensity, attract: this.attract };
    if (active && !active.blasted) {
      const u = clamp01(active.t / STRAIN_END);
      // Carries straight on from the pressure that was already building.
      active.from.strain(PRESSURE_SHARE + (1 - PRESSURE_SHARE) * u, active.from.context(this.time, 1, this.intensity));
      active.from.pile.setLevel(1 + u * 0.05);
      active.from.update(sceneDt, { ...shared, level: 1 + u * 0.05 }, cooling);
    } else {
      if (!active && !this.attract && this.finaleTime === -1 && this.sim.state.stage < SCENES.length) {
        const pressure = smoothstep(this.targetLevel(), PRESSURE_FROM, 1);
        if (pressure > 0) {
          current.strain(pressure * PRESSURE_SHARE, current.context(this.time, this.level, this.intensity));
          this.impact.rumble(pressure * 0.55);
        }
      }
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
    // Settle exactly once the glide is invisible, instead of creeping on for many seconds.
    if (Math.abs(this.uiInset - this.shownInset) < 1e-4) this.shownInset = this.uiInset;
    if (Math.abs(this.uiInset - this.framedInset) > 0.01) this.updateFraming();
    this.frameOpen += (this.wantedOpen - this.frameOpen) * (1 - Math.exp(-dt * 1.6));
    this.updateEventLights(dt);
    this.punch = Math.max(0, this.punch - dt / 0.9);
    this.applyView(dt);
  }

  private readonly cameraTarget = new THREE.Vector3();
  /** -1 before the ending, -2 after it, otherwise seconds into the closing show. */
  private finaleTime = -1;

  /**
   * The resting camera for this scene. Without `out` it returns a pose of its own; the per-frame
   * path passes a scratch pose, so a still camera allocates nothing.
   */
  private restPose(spec: SceneSpec, level: number, open = this.frameOpen, out?: Pose): Pose {
    const t = Math.max(smoothstep(level, 0.3, 0.92), open);
    const near = 1 - (1 - spec.close.distance) * (1 - t);
    const pose = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), shadowCenter: new THREE.Vector3() } as Pose;
    const target = pose.target.copy(spec.close.target).lerp(spec.camera.target, t);
    const position = pose.position.copy(spec.camera.position).sub(spec.camera.target).multiplyScalar(near).add(target);
    position.y += spec.close.lift * (1 - t);
    // A tight opening shot gets a tight shadow map, so close-ups stay crisp.
    const shadowTight = lerp(0.62, 1, t);
    pose.fov = spec.camera.fov;
    pose.focusDistance = position.distanceTo(spec.focusPoint);
    pose.focusRange = spec.focusRange * near * FOCUS_DEPTH;
    pose.aoRadius = spec.aoRadius;
    pose.shadowCenter.copy(spec.close.target).lerp(spec.shadow.center, t);
    pose.shadowRadius = spec.shadow.radius * shadowTight;
    // The light follows the scene's story, which moves with how full it is, not with the framing.
    const mood = storyMood(spec.light, spec.grade, spec.story, spec === this.current?.spec ? this.level : 0, this.mood);
    pose.rig = mood.rig;
    pose.grade = mood.grade;
    // The miniature look belongs to the wide shot; the close opening view stays plain.
    pose.tilt = (spec.tiltShift ?? TILT_SHIFT) * t;
    return pose;
  }

  private readonly scratchPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), shadowCenter: new THREE.Vector3() } as Pose;

  private applyRest(level: number): void {
    this.applyPose(this.restPose(this.current!.spec, level));
  }

  private applyView(dt: number): void {
    if (this.cameraLocked) return;
    const tr = this.transition;
    const rest = this.restPose(this.current!.spec, this.level, this.frameOpen, this.scratchPose);
    let pose = rest;
    let motion = 0;
    /** During the climb out of a breakout, how far the light has moved from the old room to the new. */
    let roomBlend = -1;
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
        const x = clamp01((tr.t - ZOOM_START) / (ZOOM_END - ZOOM_START));
        // It pulls back a few per cent past the new framing and eases home before the zoom ends.
        const settle = this.reduceMotion ? 0 : SETTLE_OVERSHOOT * Math.sin(Math.PI * smoothstep(x, SETTLE_FROM, 1));
        pose = this.blendPose(tr.startPose!, rest, easeInOutCubic(x) + settle, tr.from.spec.nest?.rise ?? 0.1);
        roomBlend = Math.min(1, easeInOutCubic(x));
        // Blur follows the camera's speed, which peaks halfway through the climb.
        motion = this.reduceMotion ? 0 : BREAKOUT_BLUR * Math.sin(Math.PI * x);
      }
    }
    if (this.spotlight && !tr && this.finaleTime === -1) pose = this.spotlightPose(rest);
    // A held camera is never quite still, and it leans a little toward wherever the pointer is.
    if (!tr && this.finaleTime === -1 && !this.spotlight) pose = this.livelyPose(pose, dt);
    if (this.attract) {
      // A slow drift around the pot while the title is up.
      const angle = Math.sin(this.time * 0.13) * 0.16;
      const offset = pose.position.clone().sub(pose.target).applyAxisAngle(up.set(0, 1, 0), angle);
      pose = { ...pose, position: pose.target.clone().add(offset) };
    }
    this.applyPose(pose);
    this.applyRoomLight(tr && tr.blasted ? tr : null, roomBlend, dt);

    const post = this.stage.post.params;
    post.motion = motion;
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
    // Past 1 only the camera's distance and aim overshoot; the look of the scene stays put.
    const c = Math.min(1, t);
    // The camera climbs up and out, so it clears the walls of the room it is leaving.
    position.y += Math.sin(c * Math.PI) * distance * rise;
    return {
      position,
      target,
      fov: lerp(a.fov, b.fov, c),
      focusDistance: logLerp(a.focusDistance, b.focusDistance, c),
      focusRange: logLerp(a.focusRange, b.focusRange, c),
      aoRadius: logLerp(a.aoRadius, b.aoRadius, c),
      shadowCenter: a.shadowCenter.clone().lerp(b.shadowCenter, Math.min(1, w)),
      shadowRadius: logLerp(a.shadowRadius, b.shadowRadius, c),
      rig: mixRig(a.rig, b.rig, c),
      grade: mixGrade(a.grade, b.grade, c),
      tilt: lerp(a.tilt, b.tilt, c),
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
    applyLamps(this.current?.lamps ?? [], this.time, this.stage.quality.lamps, this.eventLamps);
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
    p.tilt.set(pose.tilt, 0.5, 0.2);
    const tr = this.transition;
    if (tr && tr.silenced && !tr.blasted) {
      p.saturation *= 0.72;
      p.vignette += 0.12;
    }
    if (this.punch > 0) {
      p.saturation *= 1 + 0.3 * this.punch;
      p.exposure *= 1 + 0.06 * this.punch;
    }
    p.edgeGlow.setRGB(0, 0, 0);
    if (this.frenzy > 0) {
      // A frenzy runs warm and bright, and the glow swells on every beat.
      const f = this.frenzy;
      const beat = this.reduceMotion ? 0 : (1 - this.hooks.beatPhase()) ** 4;
      p.exposure *= 1 + 0.05 * f;
      p.saturation *= 1 + 0.1 * f;
      p.bloom += (0.16 + 0.14 * beat) * f;
      p.highlightTint.lerp(frenzyWarm, 0.4 * f);
      // A warm glow creeps in from the edges of the picture, swelling with the beat.
      p.edgeGlow.copy(frenzyEdge).multiplyScalar(0.16 * f * (0.65 + 0.35 * beat));
    }
  }

  private shaftFade = 0;
  /** Where a golden kernel burst, in the world, and how long ago. */
  private readonly flare = new THREE.Vector3();
  private flareT = FLARE_SECONDS;
  /** The burst of colour as a vessel gives way, fading from 1. */
  private punch = 0;
  /** The pointer's place in the window, -1 to 1, eased; the camera leans toward it. */
  private readonly lean = new THREE.Vector2();
  private readonly livePose = {} as Pose;

  /**
   * A slow handheld breath and a lean toward the pointer, a fraction of a degree each, so the
   * miniature feels looked at rather than rendered. None of it with reduced camera motion. Captures
   * have no pointer and step the clock themselves, so they still come out the same every time.
   */
  private livelyPose(pose: Pose, dt: number): Pose {
    if (this.reduceMotion) return pose;
    const canvas = this.stage.renderer.domElement;
    const at = this.hoverAt;
    const wantX = at ? (at.x / Math.max(1, canvas.clientWidth)) * 2 - 1 : 0;
    const wantY = at ? (at.y / Math.max(1, canvas.clientHeight)) * 2 - 1 : 0;
    const ease = 1 - Math.exp(-dt * 2.2);
    this.lean.x += (wantX - this.lean.x) * ease;
    this.lean.y += (wantY - this.lean.y) * ease;
    const t = this.time;
    const breath = this.attract ? 0 : 1;
    const yaw = (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.37 + 1.3) * 0.4) * 0.004 * breath - this.lean.x * 0.008;
    const pitch = (Math.sin(t * 0.29 + 0.7) * 0.6 + Math.sin(t * 0.41) * 0.4) * 0.003 * breath + this.lean.y * 0.005;
    if (yaw === 0 && pitch === 0) return pose;
    const live = this.livePose;
    Object.assign(live, pose);
    const toCam = v.copy(pose.position).sub(pose.target).applyAxisAngle(up.set(0, 1, 0), yaw);
    right.crossVectors(up, toCam).normalize();
    toCam.applyAxisAngle(right, pitch);
    live.position = this.livePosition.copy(pose.target).add(toCam);
    live.target = this.liveTarget.copy(pose.target);
    return live;
  }

  private readonly livePosition = new THREE.Vector3();
  private readonly liveTarget = new THREE.Vector3();

  /**
   * Light that belongs to the room rather than to the camera: what shiny things reflect, the glow
   * thrown back off the heap, and the shafts in the air. During a breakout's climb the reflections
   * move from the late look of the old room to the new one.
   */
  private applyRoomLight(tr: Transition | null, blend: number, dt: number): void {
    const runtime = this.current;
    if (!runtime) return;
    const quality = this.stage.quality;
    const on = quality.probes ? 1 : 0;
    const probe = runtime.probe;
    if (tr && blend >= 0) {
      const old = tr.from.probe;
      bindEnvironment(old.maps[2], probe.maps[0], blend, on, old.ambient[2], probe.ambient[0]);
    } else {
      alongStory(this.level, LOOKS, (from, to, t) => bindEnvironment(probe.maps[from], probe.maps[to], t, on, probe.ambient[from], probe.ambient[to]));
    }
    globals.uEnvGain.value = runtime.spec.envGain ?? 1;
    globals.uEnvDiffuse.value = runtime.spec.envDiffuse ?? 0.6;
    globals.uWind.value = this.reduceMotion ? (runtime.spec.wind ?? 0.06) * 0.35 : (runtime.spec.wind ?? 0.06);

    // The heap fills what stands around it, more as it grows, and only as much as it is lit itself.
    const { pile, spec } = runtime;
    const shape = pile.shape;
    const k = shape.k;
    const reach = Math.max(shape.landingRadius(this.level) * 2.4, 1.6 * k);
    v.set(shape.centerX, pile.heightAt(shape.centerX, shape.centerZ) * 0.6 + 0.2 * k, shape.centerZ);
    runtime.root.localToWorld(v);
    const scale = runtime.root.matrixWorld.getMaxScaleOnAxis();
    globals.uBounce.value.set(v.x, v.y, v.z, reach * scale);
    const strength = (spec.bounce ?? 0.3) * (0.3 + 0.7 * this.level);
    const lit = globals.uSunColor.value;
    const sky = globals.uSkyColor.value;
    globals.uBounceColor.value
      .copy(popcornUniforms.uPopCream.value)
      .multiply(bounceLight.setRGB(lit.r * 0.5 + sky.r, lit.g * 0.5 + sky.g, lit.b * 0.5 + sky.b))
      .multiplyScalar(strength);

    // Shafts toward a window, a projector or the sun; gone while the camera is in flight.
    const post = this.stage.post.params;
    const shafts = spec.shafts;
    this.shaftFade += ((tr || this.transition ? 0 : 1) - this.shaftFade) * (1 - Math.exp(-dt * 3));
    post.shafts.z = 0;
    post.shaftRadius = 0;
    const camera = this.stage.camera;
    if (this.flareT < FLARE_SECONDS) {
      this.flareT += dt;
      const u = Math.min(1, this.flareT / FLARE_SECONDS);
      v.copy(this.flare).project(camera);
      if (quality.shafts && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 && v.z < 1) {
        post.shafts.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, 0.9 * (1 - u) * (1 - u) * (this.reduceMotion ? 0.5 : 1), 0.45);
        post.shaftThreshold = 0.95;
        post.shaftRadius = 0.1;
        return;
      }
    }
    if (!shafts || !quality.shafts || this.shaftFade < 0.01) return;
    if (shafts.sun) {
      v.copy(globals.uSunDir.value).multiplyScalar(camera.far * 0.5).add(camera.position);
    } else if (shafts.at) {
      runtime.root.localToWorld(v.copy(shafts.at));
    } else {
      return;
    }
    // A source behind the camera throws nothing toward it.
    const ahead = v2.copy(v).sub(camera.position).normalize().dot(camera.getWorldDirection(up));
    v.project(camera);
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    const seen = smoothstep(ahead, 0.05, 0.3) * (1 - smoothstep(off, 1.3, 2.6));
    post.shafts.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, shafts.strength * seen * this.shaftFade, shafts.length ?? 0.6);
    post.shaftThreshold = shafts.threshold ?? 0.9;
  }

  /** A brief light at a point in the world, for a moment the whole set should feel. */
  private flashLight(at: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, radius: number, decay: number): void {
    let flash = this.flashes[0]!;
    for (const other of this.flashes) if (other.age > flash.age) flash = other;
    flash.lamp.position[0] = at.x;
    flash.lamp.position[1] = at.y;
    flash.lamp.position[2] = at.z;
    flash.lamp.color.set(color);
    flash.lamp.radius = radius;
    flash.peak = intensity * (this.reduceMotion ? CALM_FLASH : 1);
    flash.age = 0;
    flash.decay = decay;
  }

  private updateEventLights(dt: number): void {
    for (const flash of this.flashes) {
      flash.age += dt;
      const level = flash.age < FLASH_ATTACK ? flash.age / FLASH_ATTACK : Math.exp(-(flash.age - FLASH_ATTACK) / flash.decay);
      flash.lamp.intensity = level * flash.peak < 0.004 ? 0 : level * flash.peak;
    }
    const wanted = this.sim.state.frenzy > 0 && !this.attract ? 1 : 0;
    this.frenzy += (wanted - this.frenzy) * (1 - Math.exp(-dt * 2.5));
    if (this.frenzy < 0.002) this.frenzy = 0;
    popcornUniforms.uFrenzy.value = this.frenzy;
    const lamp = this.frenzyLamp;
    const runtime = this.current;
    if (!runtime || this.frenzy === 0) {
      lamp.intensity = 0;
      return;
    }
    // A warm light hangs over the heap and throbs with the music.
    const { pile } = runtime;
    const k = pile.shape.k;
    v.set(pile.shape.centerX, pile.heightAt(pile.shape.centerX, pile.shape.centerZ) + 3 * k, pile.shape.centerZ);
    runtime.root.localToWorld(v);
    lamp.position[0] = v.x;
    lamp.position[1] = v.y;
    lamp.position[2] = v.z;
    lamp.color.copy(frenzyLampColor);
    lamp.radius = runtime.spec.spreadRadius * 0.55;
    const pulse = this.reduceMotion ? 0.5 : (1 - this.hooks.beatPhase()) ** 3;
    lamp.intensity = this.frenzy * (0.5 + 0.7 * pulse);
    runtime.butterRain(dt, this.frenzy);
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

  /** QA view of one machine from any side. */
  viewMachine(kind: UnitKindName, angle: number): void {
    const copy = this.current?.isolateMachine(kind);
    if (!copy) return;
    const distance = copy.size * 2.45;
    const a = angle + copy.rotation;
    const lift = distance * 0.3;
    this.viewFrom(
      [copy.center.x + Math.sin(a) * distance, copy.center.y + lift, copy.center.z + Math.cos(a) * distance],
      [copy.center.x, copy.center.y, copy.center.z],
      26,
    );
    this.stage.post.params.focusRange = distance * 0.5;
    this.stage.post.params.reflectionRange = copy.size * 2;
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

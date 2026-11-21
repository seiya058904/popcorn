import { AudioEngine } from './audio/engine.ts';
import { MUSIC_HOME } from './audio/music.ts';
import { HOLD_POP } from './content/skills.ts';
import { EventBus } from './events/bus.ts';
import type { GameEvents } from './events/game-events.ts';
import { ImpactDirector } from './motion/impact.ts';
import { SaveManager, type LoadOutcome } from './platform/saves.ts';
import { defaultSettings, loadSettings, saveSettings, type Settings } from './platform/settings.ts';
import { memoryStore, openStore, type KeyValueStore } from './platform/storage.ts';
import type { QualityTier } from './render/core/quality.ts';
import { COMBO_PITCH } from './render/fx/combo.ts';
import { Stage } from './render/core/stage.ts';
import type { FinaleBeat } from './render/scenes/types.ts';
import { World, type BreakBeat } from './render/world.ts';
import { showIntensity } from './sim/economy.ts';
import { Simulation } from './sim/simulation.ts';
import { FixedStepper } from './sim/stepper.ts';
import { feedback } from './ui/feedback.ts';
import { FlyIn } from './ui/flyin.ts';
import { Hud } from './ui/hud.ts';
import { ICONS } from './ui/icons.ts';
import { setMotion } from './ui/motion.ts';
import { Menus } from './ui/menu.ts';
import { PhotoMode, photoFileName } from './ui/photo.ts';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  capture: boolean;
  quality?: QualityTier;
}

/** Longest the start waits for the driver's parallel shader compiles before drawing anyway. */
const COMPILE_WAIT_MS = 15_000;

/** What each hidden thing sounds like when it is tapped. */
const EGG_SOUNDS: Record<string, string> = {
  'egg-clock': 'ding',
  'egg-window-moon': 'chime',
  'egg-pepper': 'shake',
  'egg-fridge': 'boing',
  'egg-lamp': 'ding',
  'egg-radio': 'combo',
  'egg-projector': 'unveil',
  'egg-audience': 'combo',
  'egg-curtain': 'shake',
  'egg-pigeons': 'pigeons',
  'egg-clocktower': 'ding',
  'egg-fountain': 'catch',
  'egg-satellite': 'orbital-zap',
  'egg-cloud': 'shake',
  'egg-moon': 'boing',
};

/** From the cinema onward the music takes on a grander color. */
const WORLD_MUSIC_STAGE = 2;

/** Longest frame the visuals will integrate, so a stall never causes a visual jump. */
const MAX_FRAME_SECONDS = 0.1;
/** A gap this long between frames means the machine slept or the tab was frozen. */
const SLEEP_GAP_SECONDS = 20;

/** Negative: pushes the pot to the right, leaving the left of the title screen for the logo. */
const TITLE_INSET = -0.42;

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
const PERF_WINDOW_FRAMES = 120;
const SLOW_FRAME_SECONDS = 0.0215;
const SLOW_WINDOWS_TO_DROP = 2;
/** Resolution steps tried before giving up a quality tier: a softer picture beats lost detail. */
const DYNAMIC_SCALES = [1, 0.85, 0.72];
/** A window this fast means frames arrive with the display, so there may be room to spare. */
const SMOOTH_FRAME_SECONDS = 0.0175;
const RAISE_AFTER_WINDOWS = 10;

/** A cautious first guess; the frame-time watcher corrects it downward if needed. */
function initialTier(gpuName: string): QualityTier {
  return /RTX|GTX 1[06-9]|Radeon RX|Radeon Pro|Arc A|Apple M\d (Pro|Max|Ultra)/i.test(gpuName) ? 'ultra' : 'high';
}

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly sim = new Simulation(this.bus);
  readonly impact = new ImpactDirector();
  readonly stage: Stage;
  readonly world: World;
  readonly hud: Hud;
  /** Tickets flying in from the shop, and popcorn streaming into the counter. */
  private readonly flyIn: FlyIn;
  private readonly photo: PhotoMode;
  /** In photo mode, whether the scene goes on moving while the economy is held. */
  private photoAnimate = false;
  readonly menus: Menus;
  readonly audio = new AudioEngine();
  readonly capture: boolean;
  settings: Settings;
  saves!: SaveManager;
  /** Seconds of presentation time; never used for economy results. */
  visualTime = 0;
  simSteps = 0;
  /** Main-thread cost of the last frame, excluding time the GPU spends afterwards. */
  lastFrameCpuMs = 0;
  paused = false;
  /** True behind the title screen: the world idles and the economy waits. */
  attract = false;
  private store!: KeyValueStore;
  private readonly uiRoot: HTMLElement;
  private readonly fixedQuality: boolean;
  private readonly stepper = new FixedStepper();
  private readonly frameListeners: Array<(deltaSeconds: number) => void> = [];
  private lastTimestamp = 0;
  private running = false;
  private clickActivity = 0;
  /** Where the mouse is being held down, and how long until the next pop. */
  private hold: { x: number; y: number; wait: number } | null = null;
  private perfSum = 0;
  private perfFrames = 0;
  private slowWindows = 0;
  private smoothWindows = 0;
  /** Smooth windows needed before trying a sharper picture again; doubles after every retreat. */
  private raiseAfter = RAISE_AFTER_WINDOWS;
  private pausedFrames = 0;

  constructor(options: GameOptions) {
    this.capture = options.capture;
    this.uiRoot = options.uiRoot;
    this.fixedQuality = options.quality !== undefined;
    this.settings = defaultSettings(matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.stage = new Stage({ canvas: options.canvas, capture: options.capture, quality: options.quality });
    this.hud = new Hud(options.uiRoot, this.sim, this.bus, {
      onChargeChange: (charge, charging) => {
        this.world.setCannonCharge(charge, charging);
        this.audio.setCharge(charge, charging);
      },
    });
    this.hud.onSkip = () => this.world.skipTransition();
    this.world = new World(this.stage, this.sim, this.bus, this.impact, {
      onBurst: (x, y, combo, gain, manual, golden) => {
        if (manual) {
          this.audio.pop(combo);
          this.hud.floatGain(x, y, gain, golden);
          if (golden) {
            this.audio.effect('chime', 'small', 1.5);
            feedback.bought();
          }
        } else {
          this.audio.crackle();
        }
      },
      onLand: (gain) => {
        if (gain > 0) this.hud.popCounter();
      },
      onMachineCannon: () => {
        this.audio.effect('cannon-fire', 'tap', 1.5);
        this.audio.effect('pigeons');
      },
      onMachineSound: (name) => this.audio.machine(name),
      onCombo: (_count, tier) => {
        this.audio.effect('combo', tier >= 3 ? 'medium' : 'small', COMBO_PITCH[Math.max(0, tier - 1)]);
        this.hud.comboGlow(tier);
      },
      onFlyIn: (unit, quantity, target, land) => this.flyIn.ticket(unit, quantity, target, land),
      onIncome: (x, y, count) => this.flyIn.stream(x, y, count),
      onBreakBeat: (beat, stage) => this.onBreakBeat(beat, stage),
      // Without music yet, a steady beat at the opening tempo stands in.
      beatPhase: () => this.audio.beatPhase() ?? (this.visualTime * (MUSIC_HOME.bpm / 60)) % 1,
      onFinaleBeat: (beat) => this.onFinaleBeat(beat),
      onFinaleDone: () => {
        this.audio.duck(false);
        this.hud.setCinematic(false);
        this.hud.setSkipVisible(false);
        this.hud.showCredits(() => void this.restartRun());
      },
      onEgg: (id, first, x, y) => {
        this.audio.effect(EGG_SOUNDS[id] ?? 'boing', 'small');
        if (first) {
          this.audio.effect('unveil', 'small');
          feedback.milestone();
        } else feedback.bought();
        this.hud.eggFound(id, first, x, y);
      },
      onPoke: () => {
        this.audio.effect('boing', 'tap', 0.9 + Math.random() * 0.3);
        feedback.bought();
      },
      onHover: (target) => this.hud.setHover(target),
    });
    this.world.backgroundBuilds = !options.capture;
    this.flyIn = new FlyIn(options.uiRoot);
    this.flyIn.onCrumb = (last) => this.hud.popCounter(last ? 1 : 0.3);
    this.onFrame((dt) => this.flyIn.update(dt));
    feedback.connect({ sound: (name, rate) => this.audio.ui(name, rate) });
    this.menus = new Menus(options.uiRoot, {
      settings: this.settings,
      settingsChanged: () => {
        this.applySettings();
        saveSettings(this.store, this.settings);
      },
      setPaused: (paused) => this.setPaused(paused),
      showAchievements: () => this.hud.showAchievements(),
      exportSave: () => this.saves.exportText(),
      importSave: (text) => this.saves.importText(text),
      wipeSave: async () => {
        this.saves.disable();
        await this.saves.wipe();
      },
      reload: () => location.reload(),
      unlockAudio: () => this.audio.unlock(),
      enterPhoto: () => this.photo.enter(),
    });
    this.photo = new PhotoMode(options.uiRoot, {
      canvas: options.canvas,
      camera: this.stage.camera,
      post: this.stage.post.params,
      canEnter: () => !this.attract && !this.paused && !this.menus.isOpen && !this.hud.sheetOpen && !this.world.inTransition && !options.uiRoot.classList.contains('is-cinematic'),
      begin: () => {
        this.photoAnimate = false;
        this.hold = null;
        return this.world.holdCamera();
      },
      end: (position, target) => this.world.releaseCamera(position, target),
      setAnimate: (on) => (this.photoAnimate = on),
      distanceAt: (x, y) => this.world.distanceAt(x, y),
      setViewShift: (shift) => (this.stage.viewShiftX = shift),
      viewShift: () => this.stage.viewShiftX,
      snapshot: () => {
        // Drawn and read in the same task, while the canvas still holds the picture.
        this.stage.render(this.visualTime);
        return new Promise((resolve) => options.canvas.toBlob(resolve, 'image/png'));
      },
      fileName: () => photoFileName(this.sim.state.stage, new Date()),
      shutterSound: () => this.audio.ui('ui-shutter'),
    });
    this.wireSounds();

    options.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.paused || this.attract || this.photo.active) return;
      event.preventDefault();
      this.audio.unlock();
      this.world.click(event.clientX, event.clientY);
      this.hold = { x: event.clientX, y: event.clientY, wait: HOLD_POP.firstDelay };
    });
    // Machines and hidden things answer to the pointer resting on them.
    options.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' || this.photo.active) return;
      this.world.hover(event.clientX, event.clientY);
      this.hud.moveHover(event.clientX, event.clientY);
    });
    options.canvas.addEventListener('pointerleave', () => this.world.unhover());
    window.addEventListener('pointermove', (event) => {
      if (!this.hold) return;
      if (event.target !== options.canvas) {
        this.hold = null;
        return;
      }
      this.hold.x = event.clientX;
      this.hold.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'blur'] as const) window.addEventListener(type, () => (this.hold = null));
    options.uiRoot.addEventListener('pointerdown', () => this.audio.unlock());

    for (const type of ['stage_broken', 'flavor_unlocked', 'upgrade_purchased', 'ending_reached', 'run_restarted'] as const) {
      this.bus.on(type, () => void this.saves?.save());
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saves?.saveForExit();
      else this.handleReturn();
    });
    window.addEventListener('pagehide', () => this.saves?.saveForExit());
  }

  private onBreakBeat(beat: BreakBeat, stage: number): void {
    const audio = this.audio;
    if (beat === 'blast') feedback.heavy();
    if (beat === 'strain') {
      audio.effect('break-strain', 'large');
      this.hud.setSkipVisible(true);
    } else if (beat === 'silence') {
      audio.duck(true);
    } else if (beat === 'blast') {
      audio.duck(false);
      audio.effect('break-blast', 'epic');
      audio.effect('break-whoosh', 'large');
    } else {
      audio.effect('break-arrive', 'large');
      audio.setTrack(stage + 1 >= WORLD_MUSIC_STAGE ? 'world' : 'home');
      audio.setSpace(stage + 1);
      this.hud.showSlate(stage + 1);
      this.hud.setSkipVisible(false);
    }
  }

  private onFinaleBeat(beat: FinaleBeat): void {
    const audio = this.audio;
    if (beat === 'moon-heat') audio.effect('moon-heat', 'large');
    else if (beat === 'moon-silence') audio.duck(true);
    else if (beat === 'moon-pop') {
      audio.duck(false);
      audio.effect('moon-pop', 'epic');
    } else if (beat === 'hand') audio.effect('hand-whoosh', 'large');
    else audio.effect('hand-grab', 'large');
  }

  /** A new pot starts from a clean page, so nothing from the old world lingers in memory. */
  private async restartRun(): Promise<void> {
    if (!this.sim.restartRun()) return;
    await this.saves.save();
    location.reload();
  }

  private wireSounds(): void {
    const { bus, audio } = this;
    bus.on('producer_purchased', ({ producer, owned, quantity, milestone }) => {
      if (milestone) feedback.milestone();
      else feedback.bought();
      audio.effect('buy', 'small', milestone ? 1.25 : 1);
      audio.effect('shovel');
      if (milestone) audio.effect('milestone', 'medium');
      else if (owned === quantity && producer > 0) audio.effect('unveil', 'medium');
    });
    bus.on('upgrade_purchased', () => {
      audio.effect('buy', 'small', 1.12);
      audio.effect('shovel');
    });
    bus.on('flavor_unlocked', () => {
      audio.effect('shake', 'medium');
      audio.effect('chime', 'medium');
    });
    bus.on('achievement_unlocked', () => audio.effect('achievement'));
    bus.on('hopper_spawned', () => audio.effect('boing'));
    bus.on('hopper_caught', () => audio.effect('catch', 'medium'));
    bus.on('cannon_fired', ({ result }) => {
      audio.setCharge(0, false);
      if (result === 'perfect') feedback.milestone();
      else feedback.heavy();
      if (result === 'overpressure') {
        audio.effect('cannon-oops', 'medium');
        return;
      }
      audio.effect('cannon-fire', 'large');
      audio.effect('pigeons');
      if (result === 'perfect') audio.effect('cannon-perfect', 'large');
    });
    bus.on('ending_reached', () => {
      this.hud.setCinematic(true);
      this.hud.setSkipVisible(true);
      audio.duck(false);
    });
    bus.on('kernel_popped', () => {
      this.clickActivity = Math.min(1, this.clickActivity + 0.1);
    });
  }

  /** Loads settings and the save, if any, before the first frame. */
  async init(): Promise<LoadOutcome> {
    this.store = this.capture ? memoryStore() : await openStore();
    // Signs on machines and buildings are painted with this font when the scenes are built.
    await document.fonts.load('64px Kuaile', '爆米花').catch(() => undefined);
    performance.mark('boot:fonts');
    Object.assign(this.settings, await loadSettings(this.store, this.settings));
    if (!this.fixedQuality && !this.capture) {
      this.stage.setQuality(this.settings.quality === 'auto' ? initialTier(this.stage.gpuName()) : this.settings.quality);
    }
    this.applySettings();
    this.saves = new SaveManager(this.sim, this.store);
    const outcome = await this.saves.load();
    performance.mark('boot:save');
    this.world.syncToSave();
    performance.mark('boot:scene');
    this.audio.setTrack(this.sim.state.stage >= WORLD_MUSIC_STAGE ? 'world' : 'home');
    this.audio.setSpace(this.sim.state.stage);
    // Warming up front keeps the first click from stalling on shader or buffer work. The driver
    // compiles in parallel while the loading screen keeps moving; drawing first would block on it.
    this.stage.requestCompile(this.stage.scene);
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const poll = (): void => {
        if (this.stage.programsReady() || performance.now() - started > COMPILE_WAIT_MS) resolve();
        else setTimeout(poll, 16);
      };
      poll();
    });
    performance.mark('boot:compile');
    this.stage.preload(this.stage.scene);
    performance.mark('boot:preload');
    if (outcome.upgraded) this.hud.toast(ICONS.unit, '新内容上架', '五种新设备、金色玉米、跳跳粒群和场景装修，进度都还在。');
    if (outcome.migrated) {
      this.hud.showNotice('配方大改版', '这一版的数值全部重做，这一锅要从头开始。成就、口味图鉴和再来一锅的记录都还在。');
    } else if (outcome.offline) this.hud.showOffline(outcome.offline.seconds, outcome.offline.gained);
    else if (outcome.recovered) {
      this.hud.showNotice(
        '存档出了点状况',
        outcome.source === 'backup' ? '最新存档已损坏，已从备份恢复。' : '存档已损坏且没有可用备份，只能重新开始。',
      );
    }
    return outcome;
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.levels.master = s.master;
    this.audio.levels.music = s.music;
    this.audio.levels.effects = s.effects;
    this.audio.levels.ui = s.ui;
    feedback.setHaptics(s.haptics);
    setMotion(document.documentElement, s.reduceMotion);
    this.audio.applyLevels();
    this.impact.prefs.screenShake = s.screenShake;
    this.impact.prefs.reduceMotion = s.reduceMotion;
    this.impact.prefs.flash = s.reduceMotion ? 0.35 : 1;
    this.world.showSpeed = s.showSpeed;
    this.world.reduceMotion = s.reduceMotion;
    if (s.quality !== 'auto' && !this.fixedQuality && this.stage.quality.tier !== s.quality) this.setTier(s.quality);
  }

  private setTier(tier: QualityTier): void {
    this.stage.setDynamicScale(1);
    this.stage.setQuality(tier);
    this.world.qualityChanged();
  }

  /** Shows the title over the idling world and waits for the player. */
  async showTitle(): Promise<void> {
    this.attract = true;
    this.world.attract = true;
    this.world.snapInset(TITLE_INSET);
    await this.menus.showTitle(this.uiRoot, this.sim.state.stats.clicks > 0 || this.sim.state.totalEarned > 0);
    this.attract = false;
    this.world.attract = false;
  }

  startImmediately(): void {
    this.menus.startImmediately();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.audio.setPaused(paused);
    this.lastTimestamp = 0;
    if (paused) void this.saves?.save();
  }

  /** Time spent with the tab hidden or the machine asleep counts as being away. */
  private handleReturn(): void {
    const report = this.saves?.resume();
    if (report) this.hud.showOffline(report.seconds, report.gained);
    this.lastTimestamp = 0;
    this.stepper.reset();
  }

  onFrame(listener: (deltaSeconds: number) => void): void {
    this.frameListeners.push(listener);
  }

  start(): void {
    if (this.capture) {
      this.frame(0);
      return;
    }
    this.running = true;
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  /** Runs one presentation frame. Capture mode calls this directly with a fixed delta. */
  frame(deltaSeconds: number): void {
    const startedAt = performance.now();
    // Photo mode holds the economy; the scene goes on moving only if the player asks for it.
    const photo = this.photo.active;
    const delta = this.paused || photo ? 0 : Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    const viewDelta = photo && this.photoAnimate && !this.paused ? Math.min(deltaSeconds, MAX_FRAME_SECONDS) : delta;
    if (!this.attract) {
      this.stepper.advance(delta, (step) => {
        this.sim.step(step);
        this.simSteps += 1;
      });
      this.saves?.tick(delta);
      this.stepHold(delta);
    }

    const visualDelta = viewDelta * this.impact.timeScale(viewDelta);
    this.impact.update(viewDelta);
    this.visualTime += visualDelta;
    // Sprites read the shared clock while spawning, so it must advance first.
    this.stage.setTime(this.visualTime);
    this.world.uiInset = this.attract ? TITLE_INSET : this.hud.shopInset;
    this.world.update(visualDelta);
    this.hud.setHidden(this.attract);
    this.hud.update(delta, this.world.pendingGain);
    this.clickActivity = Math.max(0, this.clickActivity - delta * 0.12);
    this.audio.update(showIntensity(this.sim.perSecond), this.clickActivity);
    this.photo.update();
    // A paused world does not change, so the last picture stays on screen and the GPU rests.
    // A resize clears the canvas, so that still gets one new frame.
    if (!this.paused || this.pausedFrames < 1 || this.stage.needsResize()) this.stage.render(this.visualTime);
    this.pausedFrames = this.paused ? this.pausedFrames + 1 : 0;
    this.lastFrameCpuMs = performance.now() - startedAt;
    for (const listener of this.frameListeners) listener(delta);
  }

  /** Holding the mouse down keeps popping, so nobody has to hammer the button. */
  private stepHold(delta: number): void {
    const hold = this.hold;
    if (!hold || this.paused) return;
    hold.wait -= delta;
    while (hold.wait <= 0) {
      hold.wait += 1 / this.sim.derived.holdRate;
      this.world.click(hold.x, hold.y, false);
    }
  }

  /** Steps quality down when frames stay slow, and never fights an explicit choice. */
  private watchPerformance(seconds: number): void {
    if (this.settings.quality !== 'auto' || this.fixedQuality || this.paused) return;
    this.perfSum += Math.min(seconds, 0.1);
    this.perfFrames += 1;
    if (this.perfFrames < PERF_WINDOW_FRAMES) return;
    const average = this.perfSum / this.perfFrames;
    this.perfSum = 0;
    this.perfFrames = 0;
    this.slowWindows = average > SLOW_FRAME_SECONDS ? this.slowWindows + 1 : 0;
    this.smoothWindows = average < SMOOTH_FRAME_SECONDS ? this.smoothWindows + 1 : 0;
    const step = DYNAMIC_SCALES.indexOf(this.stage.dynamicScale);
    const index = TIER_ORDER.indexOf(this.stage.quality.tier);
    if (this.slowWindows >= SLOW_WINDOWS_TO_DROP) {
      this.slowWindows = 0;
      this.smoothWindows = 0;
      if (step >= 0 && step < DYNAMIC_SCALES.length - 1) {
        this.stage.setDynamicScale(DYNAMIC_SCALES[step + 1]!);
        // Coming back down after trying higher: wait longer before trying again.
        this.raiseAfter *= 2;
      } else if (index > 0) {
        this.setTier(TIER_ORDER[index - 1]!);
      }
    } else if (this.smoothWindows >= this.raiseAfter && step > 0) {
      this.smoothWindows = 0;
      this.stage.setDynamicScale(DYNAMIC_SCALES[step - 1]!);
    }
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    const delta = this.lastTimestamp === 0 ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    if (delta > SLEEP_GAP_SECONDS) this.handleReturn();
    else if (delta > 0) this.watchPerformance(delta);
    this.frame(delta > SLEEP_GAP_SECONDS ? 0 : delta);
    requestAnimationFrame(this.tick);
  };
}

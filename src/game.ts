import { AudioEngine } from './audio/engine.ts';
import { EventBus } from './events/bus.ts';
import type { GameEvents } from './events/game-events.ts';
import { ImpactDirector } from './motion/impact.ts';
import { SaveManager, type LoadOutcome } from './platform/saves.ts';
import { defaultSettings, loadSettings, saveSettings, type Settings } from './platform/settings.ts';
import { memoryStore, openStore, type KeyValueStore } from './platform/storage.ts';
import type { QualityTier } from './render/core/quality.ts';
import { Stage } from './render/core/stage.ts';
import type { FinaleBeat } from './render/scenes/types.ts';
import { World, type BreakBeat } from './render/world.ts';
import { Simulation } from './sim/simulation.ts';
import { FixedStepper } from './sim/stepper.ts';
import { Hud } from './ui/hud.ts';
import { Menus } from './ui/menu.ts';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  capture: boolean;
  quality?: QualityTier;
}

/** From the cinema onward the music takes on a grander color. */
const WORLD_MUSIC_STAGE = 2;

/** Longest frame the visuals will integrate, so a stall never causes a visual jump. */
const MAX_FRAME_SECONDS = 0.1;
/** A gap this long between frames means the machine slept or the tab was frozen. */
const SLEEP_GAP_SECONDS = 20;

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
const PERF_WINDOW_FRAMES = 120;
const SLOW_FRAME_SECONDS = 0.0215;
const SLOW_WINDOWS_TO_DROP = 2;

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
  private perfSum = 0;
  private perfFrames = 0;
  private slowWindows = 0;

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
      onBurst: (x, y, combo, gain, manual) => {
        if (manual) {
          this.audio.pop(combo);
          this.hud.floatGain(x, y, gain);
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
      onBreakBeat: (beat, stage) => this.onBreakBeat(beat, stage),
      onFinaleBeat: (beat) => this.onFinaleBeat(beat),
      onFinaleDone: () => {
        this.audio.duck(false);
        this.hud.setCinematic(false);
        this.hud.setSkipVisible(false);
        this.hud.showCredits(() => void this.restartRun());
      },
    });
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
    });
    this.wireSounds();

    options.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.paused || this.attract) return;
      event.preventDefault();
      this.audio.unlock();
      this.world.click(event.clientX, event.clientY);
    });
    options.uiRoot.addEventListener('pointerdown', () => this.audio.unlock());

    for (const type of ['stage_broken', 'flavor_unlocked', 'upgrade_purchased', 'ending_reached', 'run_restarted'] as const) {
      this.bus.on(type, () => void this.saves?.save());
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saves?.save();
      else this.handleReturn();
    });
    window.addEventListener('pagehide', () => void this.saves?.save());
  }

  private onBreakBeat(beat: BreakBeat, stage: number): void {
    const audio = this.audio;
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
    bus.on('producer_purchased', ({ milestone }) => {
      audio.effect('buy', 'small', milestone ? 1.25 : 1);
      audio.effect('shovel');
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
    Object.assign(this.settings, await loadSettings(this.store, this.settings));
    if (!this.fixedQuality && !this.capture) {
      this.stage.setQuality(this.settings.quality === 'auto' ? initialTier(this.stage.gpuName()) : this.settings.quality);
    }
    this.applySettings();
    this.saves = new SaveManager(this.sim, this.store);
    const outcome = await this.saves.load();
    this.world.syncToSave();
    this.audio.setTrack(this.sim.state.stage >= WORLD_MUSIC_STAGE ? 'world' : 'home');
    // Compiling up front keeps the first click from stalling on shader work.
    this.stage.renderer.compile(this.stage.scene, this.stage.camera);
    if (outcome.offline) this.hud.showOffline(outcome.offline.seconds, outcome.offline.gained);
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
    this.audio.applyLevels();
    this.impact.prefs.screenShake = s.screenShake;
    this.impact.prefs.reduceMotion = s.reduceMotion;
    this.impact.prefs.flash = s.reduceMotion ? 0.35 : 1;
    this.world.showSpeed = s.showSpeed;
    this.world.reduceMotion = s.reduceMotion;
    if (s.quality !== 'auto' && !this.fixedQuality && this.stage.quality.tier !== s.quality) this.setTier(s.quality);
  }

  private setTier(tier: QualityTier): void {
    this.stage.setQuality(tier);
    this.world.qualityChanged();
  }

  /** Shows the title over the idling world and waits for the player. */
  async showTitle(): Promise<void> {
    this.attract = true;
    this.world.attract = true;
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
    const delta = this.paused ? 0 : Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    if (!this.attract) {
      this.stepper.advance(delta, (step) => {
        this.sim.step(step);
        this.simSteps += 1;
      });
      this.saves?.tick(delta);
    }

    const visualDelta = delta * this.impact.timeScale(delta);
    this.impact.update(delta);
    this.visualTime += visualDelta;
    // Sprites read the shared clock while spawning, so it must advance first.
    this.stage.setTime(this.visualTime);
    this.world.uiInset = this.attract ? 0 : this.hud.shopInset;
    this.world.update(visualDelta);
    this.hud.setHidden(this.attract);
    this.hud.update(delta, this.world.pendingGain);
    this.clickActivity = Math.max(0, this.clickActivity - delta * 0.12);
    this.audio.update(Math.log10(1 + this.sim.perSecond), this.clickActivity);
    this.stage.render(this.visualTime);
    this.lastFrameCpuMs = performance.now() - startedAt;
    for (const listener of this.frameListeners) listener(delta);
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
    const index = TIER_ORDER.indexOf(this.stage.quality.tier);
    if (this.slowWindows >= SLOW_WINDOWS_TO_DROP && index > 0) {
      this.slowWindows = 0;
      this.setTier(TIER_ORDER[index - 1]!);
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

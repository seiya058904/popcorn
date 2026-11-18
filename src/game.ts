import { AudioEngine } from './audio/engine.ts';
import { EventBus } from './events/bus.ts';
import type { GameEvents } from './events/game-events.ts';
import { ImpactDirector } from './motion/impact.ts';
import { SaveManager, type LoadOutcome } from './platform/saves.ts';
import { memoryStore, openStore } from './platform/storage.ts';
import type { QualityTier } from './render/core/quality.ts';
import { Stage } from './render/core/stage.ts';
import { World, type BreakBeat } from './render/world.ts';
import { Simulation } from './sim/simulation.ts';
import { FixedStepper } from './sim/stepper.ts';
import { Hud } from './ui/hud.ts';

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

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly sim = new Simulation(this.bus);
  readonly impact = new ImpactDirector();
  readonly stage: Stage;
  readonly world: World;
  readonly hud: Hud;
  readonly audio = new AudioEngine();
  readonly capture: boolean;
  saves!: SaveManager;
  /** Seconds of presentation time; never used for economy results. */
  visualTime = 0;
  simSteps = 0;
  /** Main-thread cost of the last frame, excluding time the GPU spends afterwards. */
  lastFrameCpuMs = 0;
  private readonly stepper = new FixedStepper();
  private readonly frameListeners: Array<(deltaSeconds: number) => void> = [];
  private lastTimestamp = 0;
  private running = false;
  private clickActivity = 0;

  constructor(options: GameOptions) {
    this.capture = options.capture;
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
    });
    this.wireSounds();
    options.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
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
    bus.on('kernel_popped', () => {
      this.clickActivity = Math.min(1, this.clickActivity + 0.1);
    });
  }

  /** Loads the save, if any, before the first frame. */
  async init(): Promise<LoadOutcome> {
    const store = this.capture ? memoryStore() : await openStore();
    this.saves = new SaveManager(this.sim, store);
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

  /** Time spent with the tab hidden counts as being away. */
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
    const delta = Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    this.stepper.advance(delta, (step) => {
      this.sim.step(step);
      this.simSteps += 1;
    });
    this.saves?.tick(delta);

    const visualDelta = delta * this.impact.timeScale(delta);
    this.impact.update(delta);
    this.visualTime += visualDelta;
    // Sprites read the shared clock while spawning, so it must advance first.
    this.stage.setTime(this.visualTime);
    this.world.uiInset = this.hud.shopInset;
    this.world.update(visualDelta);
    this.hud.update(delta, this.world.pendingGain);
    this.clickActivity = Math.max(0, this.clickActivity - delta * 0.12);
    this.audio.update(Math.log10(1 + this.sim.perSecond), this.clickActivity);
    this.stage.render(this.visualTime);
    this.lastFrameCpuMs = performance.now() - startedAt;
    for (const listener of this.frameListeners) listener(delta);
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    const delta = this.lastTimestamp === 0 ? 0 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    this.frame(delta);
    requestAnimationFrame(this.tick);
  };
}

import { ACHIEVEMENTS, type AchievementView } from '../content/achievements.ts';
import { FLAVORS } from '../content/flavors.ts';
import { PRODUCERS } from '../content/producers.ts';
import { CANNON, HOPPER, OFFLINE, POT_SKINS } from '../content/skills.ts';
import { CANNON_UNLOCK_STAGE, STAGES } from '../content/stages.ts';
import { UPGRADE_BY_ID, UPGRADES, type UpgradeDef } from '../content/upgrades.ts';
import type { EventBus } from '../events/bus.ts';
import type { CannonResult, GameEvents } from '../events/game-events.ts';
import {
  affordableCount,
  bulkPrice,
  cannonZone,
  clickGain,
  currentRate,
  derive,
  flavorPrice,
  hasUpgrade,
  isMilestone,
  producerPrice,
  type Derived,
} from './economy.ts';
import { createLegacy, createState, createStats, type GameState } from './state.ts';

const ACHIEVEMENT_CHECK_STEPS = 10;

export interface OfflineReport {
  seconds: number;
  gained: number;
}

/** Pure game rules. Runs in the browser and under Node for balance simulation. */
export class Simulation {
  state: GameState;
  private readonly bus: EventBus<GameEvents>;
  private cached: Derived | null = null;
  private stepsUntilCheck = 0;

  constructor(bus: EventBus<GameEvents>, state: GameState = createState()) {
    this.bus = bus;
    this.state = state;
  }

  /** Replaces the whole state, as after loading a save. */
  load(state: GameState): void {
    this.state = state;
    this.invalidate();
  }

  invalidate(): void {
    this.cached = null;
  }

  get derived(): Derived {
    this.cached ??= derive(this.state);
    return this.cached;
  }

  get perSecond(): number {
    return currentRate(this.state, this.derived);
  }

  get clickValue(): number {
    return clickGain(this.state, this.derived);
  }

  get cannonUnlocked(): boolean {
    return this.state.stage >= CANNON_UNLOCK_STAGE;
  }

  get cannonReady(): boolean {
    return this.cannonUnlocked && this.state.cannonCooldown <= 0;
  }

  get hopperActive(): boolean {
    return this.state.hopperVisible > 0;
  }

  /** Progress through the current scene, 0..1, on the log scale the heap also uses. */
  get stageProgress(): number {
    const stage = STAGES[Math.min(this.state.stage, STAGES.length - 1)]!;
    const from = this.state.stage > 0 ? STAGES[this.state.stage - 1]!.threshold : 0;
    const span = Math.log1p(stage.threshold) - Math.log1p(from);
    return Math.min(1, Math.max(0, (Math.log1p(this.state.totalEarned) - Math.log1p(from)) / span));
  }

  private random(): number {
    this.state.rng = (this.state.rng + 0x6d2b79f5) >>> 0;
    let t = this.state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private earn(amount: number): void {
    this.state.popcorn += amount;
    this.state.totalEarned += amount;
    this.state.legacy.lifetimeEarned += amount;
  }

  private spend(amount: number): void {
    this.state.popcorn -= amount;
    this.state.stats.spent += amount;
    this.state.stats.purchases += 1;
  }

  click(): { count: number; gainEach: number } {
    const count = this.derived.clickPops;
    const gained = this.clickValue;
    this.earn(gained);
    this.state.stats.clicks += 1;
    this.state.stats.pops += count;
    this.checkStage();
    this.bus.emit('kernel_popped', { count, gained });
    return { count, gainEach: gained / count };
  }

  step(seconds: number): void {
    const s = this.state;
    s.stats.playSeconds += seconds;
    this.earn(this.perSecond * seconds);
    s.cannonCooldown = Math.max(0, s.cannonCooldown - seconds);

    if (s.frenzy > 0) {
      s.frenzy = Math.max(0, s.frenzy - seconds);
      if (s.frenzy === 0) this.bus.emit('frenzy_ended', {});
    }
    this.stepHopper(seconds);
    this.checkStage();

    this.stepsUntilCheck -= 1;
    if (this.stepsUntilCheck <= 0) {
      this.stepsUntilCheck = ACHIEVEMENT_CHECK_STEPS;
      this.checkAchievements();
    }
  }

  private stepHopper(seconds: number): void {
    const s = this.state;
    if (s.hopperVisible > 0) {
      s.hopperVisible -= seconds;
      if (s.hopperVisible <= 0) {
        s.hopperVisible = 0;
        s.stats.hoppersMissed += 1;
        this.scheduleHopper();
        this.bus.emit('hopper_escaped', { id: s.hopperId });
      }
      return;
    }
    s.hopperTimer -= seconds;
    if (s.hopperTimer <= 0) {
      s.hopperId += 1;
      s.hopperVisible = HOPPER.visibleSeconds;
      this.bus.emit('hopper_spawned', { id: s.hopperId });
    }
  }

  private scheduleHopper(): void {
    const span = HOPPER.minInterval + this.random() * (HOPPER.maxInterval - HOPPER.minInterval);
    this.state.hopperTimer = span * this.derived.hopperIntervalScale;
  }

  catchHopper(): boolean {
    const s = this.state;
    if (s.hopperVisible <= 0) return false;
    s.hopperVisible = 0;
    s.frenzy = this.derived.frenzySeconds;
    s.stats.hoppersCaught += 1;
    this.scheduleHopper();
    this.bus.emit('hopper_caught', { id: s.hopperId });
    return true;
  }

  private checkStage(): void {
    const s = this.state;
    while (s.stage < STAGES.length && s.totalEarned >= STAGES[s.stage]!.threshold) {
      const broken = s.stage;
      s.stage += 1;
      this.invalidate();
      this.bus.emit('stage_broken', { stage: broken });
      if (s.stage === STAGES.length && !s.ended) {
        s.ended = true;
        this.bus.emit('ending_reached', {});
      }
    }
  }

  // Shop -------------------------------------------------------------------

  producerUnlocked(producer: number): boolean {
    return this.state.stage >= PRODUCERS[producer]!.unlockStage;
  }

  price(producer: number, quantity = 1): number {
    const owned = this.state.owned[producer]!;
    return quantity === 1 ? producerPrice(producer, owned) : bulkPrice(producer, owned, quantity);
  }

  maxAffordable(producer: number): number {
    return affordableCount(producer, this.state.owned[producer]!, this.state.popcorn);
  }

  buyProducer(producer: number, quantity = 1): boolean {
    if (quantity < 1 || !this.producerUnlocked(producer)) return false;
    const cost = this.price(producer, quantity);
    if (this.state.popcorn < cost) return false;
    const before = this.state.owned[producer]!;
    this.spend(cost);
    this.state.owned[producer] = before + quantity;
    this.invalidate();
    let milestone = false;
    for (let owned = before + 1; owned <= before + quantity; owned += 1) milestone ||= isMilestone(owned);
    this.bus.emit('producer_purchased', { producer, owned: before + quantity, quantity, spent: cost, milestone });
    return true;
  }

  get nextFlavorPrice(): number | null {
    return this.state.flavors >= FLAVORS.length ? null : flavorPrice(this.state.flavors);
  }

  buyFlavor(): boolean {
    const cost = this.nextFlavorPrice;
    if (cost === null || this.state.popcorn < cost) return false;
    const flavor = this.state.flavors;
    this.spend(cost);
    this.state.flavors += 1;
    this.state.legacy.flavorAlbum = Math.max(this.state.legacy.flavorAlbum, this.state.flavors);
    this.invalidate();
    this.bus.emit('flavor_unlocked', { flavor, spent: cost });
    return true;
  }

  upgradeAvailable(upgrade: UpgradeDef): boolean {
    const s = this.state;
    if (hasUpgrade(s, upgrade.id) || s.totalEarned < upgrade.showAt) return false;
    if (upgrade.requires && !hasUpgrade(s, upgrade.requires)) return false;
    return s.stage >= (upgrade.unlockStage ?? 0);
  }

  get availableUpgrades(): UpgradeDef[] {
    return UPGRADES.filter((upgrade) => this.upgradeAvailable(upgrade));
  }

  buyUpgrade(id: string): boolean {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (!upgrade || !this.upgradeAvailable(upgrade) || this.state.popcorn < upgrade.cost) return false;
    this.spend(upgrade.cost);
    this.state.upgrades.push(id);
    this.invalidate();
    this.bus.emit('upgrade_purchased', { upgrade: id, spent: upgrade.cost });
    return true;
  }

  // Cannon -----------------------------------------------------------------

  /** Resolves a released (or overheld) cannon. Returns null for a cancelled press. */
  fireCannon(heldSeconds: number): { result: CannonResult; gained: number } | null {
    if (!this.cannonReady) return null;
    const zone = cannonZone(heldSeconds, this.derived);
    if (zone === 'early' && heldSeconds < CANNON.minHoldSeconds) return null;
    const s = this.state;
    const result: CannonResult = zone === 'green' ? 'perfect' : zone === 'over' ? 'overpressure' : 'normal';
    const seconds =
      result === 'perfect' ? CANNON.perfectSeconds : result === 'overpressure' ? CANNON.overpressureSeconds : CANNON.normalSeconds;
    // A popped lid is its own punishment, so overpressure gets no payout bonus.
    const payout = result === 'overpressure' ? 1 : this.derived.cannonPayout;
    const gained = this.perSecond * seconds * payout;
    this.earn(gained);
    s.cannonCooldown = this.derived.cannonCooldown;
    s.stats.cannonShots += 1;
    if (result === 'perfect') {
      s.stats.cannonPerfect += 1;
      s.stats.perfectStreak += 1;
    } else {
      s.stats.perfectStreak = 0;
      if (result === 'overpressure') s.stats.cannonOverpressure += 1;
    }
    this.checkStage();
    this.bus.emit('cannon_fired', { result, gained });
    return { result, gained };
  }

  // Time away ---------------------------------------------------------------

  /** Credits time away. A negative or tiny absence (clock rollback, quick reload) pays nothing. */
  applyOffline(elapsedSeconds: number): OfflineReport | null {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < OFFLINE.minSeconds) return null;
    const d = this.derived;
    const seconds = Math.min(elapsedSeconds, d.offlineCapSeconds);
    const gained = d.baseRate * d.offlineRate * seconds;
    if (gained <= 0) return null;
    this.earn(gained);
    this.state.stats.offlineCollected += gained;
    this.checkStage();
    this.bus.emit('offline_collected', { seconds, gained });
    return { seconds, gained };
  }

  // New game plus -------------------------------------------------------------

  restartRun(): boolean {
    const old = this.state;
    if (!old.ended) return false;
    const legacy = old.legacy;
    legacy.runs += 1;
    legacy.potSkin = Math.min(legacy.runs, POT_SKINS.length - 1);
    const fresh = createState(old.rng);
    fresh.legacy = legacy;
    fresh.savedAt = old.savedAt;
    this.load(fresh);
    this.bus.emit('run_restarted', { runs: legacy.runs });
    return true;
  }

  // Achievements --------------------------------------------------------------

  private view(): AchievementView {
    const s = this.state;
    return {
      ...s.stats,
      totalEarned: s.totalEarned,
      lifetimeEarned: s.legacy.lifetimeEarned,
      popcorn: s.popcorn,
      perSecond: this.perSecond,
      owned: s.owned,
      flavors: s.flavors,
      upgrades: s.upgrades.length,
      stage: s.stage,
      runs: s.legacy.runs,
      ended: s.ended,
    };
  }

  checkAchievements(): void {
    const earned = this.state.legacy.achievements;
    if (earned.length >= ACHIEVEMENTS.length) return;
    const view = this.view();
    for (const achievement of ACHIEVEMENTS) {
      if (!earned.includes(achievement.id) && achievement.test(view)) {
        earned.push(achievement.id);
        this.bus.emit('achievement_unlocked', { id: achievement.id });
      }
    }
  }
}

export { createLegacy, createState, createStats };
export type { GameState };

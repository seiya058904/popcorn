import { ACHIEVEMENTS, type AchievementView } from '../content/achievements.ts';
import { FLAVORS } from '../content/flavors.ts';
import { PRODUCERS } from '../content/producers.ts';
import { EGG_IDS } from '../content/props.ts';
import { CANNON, HOPPER, OFFLINE, POT_SKINS } from '../content/skills.ts';
import { CANNON_UNLOCK_STAGE, STAGES } from '../content/stages.ts';
import { sceneUnits, TRACK_RUNGS, TRACKS, UPGRADE_BY_ID, type UpgradeDef, type UpgradeTrack } from '../content/upgrades.ts';
import type { EventBus } from '../events/bus.ts';
import type { CannonResult, GameEvents } from '../events/game-events.ts';
import {
  cannonStreakBonus,
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
  private autoPopBudget = 0;
  private cannonIdleSeconds = 0;
  /** True while the player is charging the cannon, so the automatic fuse keeps its hands off. */
  cannonHeld = false;

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

  click(): { count: number; gainEach: number; golden: boolean } {
    const d = this.derived;
    const stats = this.state.stats;
    const count = d.clickPops;
    let gained = this.clickValue;
    // Rolled only once golden kernels exist, so a run without them draws the same numbers as before.
    const golden = d.goldenChance > 0 && this.random() < d.goldenChance;
    if (golden) {
      gained *= d.goldenMultiplier;
      stats.goldenPops += 1;
    }
    this.earn(gained);
    stats.clicks += 1;
    stats.pops += count;
    this.checkStage();
    this.bus.emit('kernel_popped', { count, gained, golden });
    return { count, gainEach: gained / count, golden };
  }

  step(seconds: number): void {
    const s = this.state;
    s.stats.playSeconds += seconds;
    this.earn(this.perSecond * seconds);
    this.stepAutoPops(seconds);
    s.cannonCooldown = Math.max(0, s.cannonCooldown - seconds);
    this.stepAutoCannon(seconds);

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

  private stepAutoPops(seconds: number): void {
    this.autoPopBudget += this.derived.autoPops * seconds;
    while (this.autoPopBudget >= 1) {
      this.autoPopBudget -= 1;
      const gained = this.clickValue;
      this.earn(gained);
      this.bus.emit('auto_popped', { gained });
    }
  }

  private stepAutoCannon(seconds: number): void {
    if (!this.derived.autoCannon || !this.cannonReady || this.cannonHeld) {
      this.cannonIdleSeconds = 0;
      return;
    }
    this.cannonIdleSeconds += seconds;
    if (this.cannonIdleSeconds >= CANNON.autoFireDelay) {
      this.cannonIdleSeconds = 0;
      this.fireCannon(CANNON.minHoldSeconds);
    }
  }

  private stepHopper(seconds: number): void {
    const s = this.state;
    if (s.hopperVisible > 0) {
      s.hopperVisible -= seconds;
      if (this.derived.autoHopper && s.hopperVisible > 0 && s.hopperVisible <= HOPPER.visibleSeconds - HOPPER.autoCatchSeconds) {
        this.catchHopper();
        return;
      }
      if (s.hopperVisible <= 0) {
        s.hopperVisible = 0;
        s.stats.hoppersMissed += 1;
        // One that gets away takes the rest of its swarm with it.
        s.hopperSwarm = 0;
        s.hopperSwarmSize = 0;
        this.scheduleHopper();
        this.bus.emit('hopper_escaped', { id: s.hopperId });
      }
      return;
    }
    s.hopperTimer -= seconds;
    if (s.hopperTimer <= 0) this.spawnHopper();
  }

  /**
   * A kernel pops up. Most come alone; with the swarm upgrade some bring friends, which follow one
   * at a time, each a moment after the last is caught. The scene only ever shows one.
   */
  private spawnHopper(): void {
    const s = this.state;
    const d = this.derived;
    if (s.hopperSwarm > 0) {
      s.hopperSwarm -= 1;
    } else if (d.swarmChance > 0 && this.random() < d.swarmChance) {
      s.hopperSwarmSize = d.swarmSize;
      s.hopperSwarm = d.swarmSize - 1;
    } else {
      s.hopperSwarmSize = 0;
    }
    s.hopperId += 1;
    s.hopperVisible = HOPPER.visibleSeconds;
    this.bus.emit('hopper_spawned', { id: s.hopperId, swarm: s.hopperSwarm });
  }

  private scheduleHopper(): void {
    const span = HOPPER.minInterval + this.random() * (HOPPER.maxInterval - HOPPER.minInterval);
    this.state.hopperTimer = span * this.derived.hopperIntervalScale;
  }

  catchHopper(): boolean {
    const s = this.state;
    if (s.hopperVisible <= 0) return false;
    const d = this.derived;
    s.hopperVisible = 0;
    s.stats.hoppersCaught += 1;
    if (s.hopperSwarmSize > 1) {
      // Every kernel of a swarm adds a frenzy's worth, up to a ceiling.
      s.frenzy = Math.min(s.frenzy + d.frenzySeconds, d.frenzySeconds * HOPPER.swarmFrenzyCap);
      if (s.hopperSwarm > 0) {
        s.hopperTimer = HOPPER.swarmGapSeconds;
      } else {
        s.stats.swarmsCaught += 1;
        s.hopperSwarmSize = 0;
        this.scheduleHopper();
      }
    } else {
      s.frenzy = Math.max(s.frenzy, d.frenzySeconds);
      this.scheduleHopper();
    }
    this.bus.emit('hopper_caught', { id: s.hopperId, swarm: s.hopperSwarm });
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

  /**
   * Running totals of the next machines' prices, per machine, from the number owned when they were
   * made. The shop asks for ×10, ×100 and "as many as I can afford" ten times a second; these only
   * change when a machine is bought, so they are added up once instead of on every refresh.
   */
  private readonly priceRuns: Array<{ owned: number; sums: number[] } | undefined> = [];

  private runningPrices(producer: number, quantity: number): number[] {
    const owned = this.state.owned[producer]!;
    let run = this.priceRuns[producer];
    if (!run || run.owned !== owned) {
      run = { owned, sums: [0] };
      this.priceRuns[producer] = run;
    }
    const sums = run.sums;
    // The same additions in the same order as bulkPrice, so the totals match it exactly.
    while (sums.length <= quantity) sums.push(sums[sums.length - 1]! + producerPrice(producer, owned + sums.length - 1));
    return sums;
  }

  price(producer: number, quantity = 1): number {
    const owned = this.state.owned[producer]!;
    return quantity === 1 ? producerPrice(producer, owned) : this.runningPrices(producer, quantity)[quantity]!;
  }

  /** How many of a machine the popcorn covers, up to a thousand at once. */
  maxAffordable(producer: number, limit = 1000): number {
    const budget = this.state.popcorn;
    let sums = this.runningPrices(producer, 1);
    // Extend the totals only as far as the budget reaches.
    while (sums.length <= limit && sums[sums.length - 1]! <= budget) sums = this.runningPrices(producer, Math.min(limit, sums.length * 2));
    let low = 0;
    let high = Math.min(limit, sums.length - 1);
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (sums[mid]! <= budget) low = mid;
      else high = mid - 1;
    }
    return low;
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

  /** The next rung of a row: the first one in ladder order not yet owned, or null when all are. */
  trackHead(track: UpgradeTrack): UpgradeDef | null {
    for (const upgrade of TRACK_RUNGS.get(track)!) if (!hasUpgrade(this.state, upgrade.id)) return upgrade;
    return null;
  }

  /** How many of each of the scene's machines a rung asks for, against the fewest owned of them. */
  needsProgress(upgrade: UpgradeDef): { have: number; want: number } | null {
    if (!upgrade.needs) return null;
    const have = Math.min(...sceneUnits(upgrade.needs.stage).map((unit) => this.state.owned[unit]!));
    return { have, want: upgrade.needs.count };
  }

  /** Why a rung cannot be bought yet, if it cannot: the scene is still ahead, or too few machines. */
  upgradeLock(upgrade: UpgradeDef): 'stage' | 'needs' | null {
    if (this.state.stage < upgrade.unlockStage) return 'stage';
    const needs = this.needsProgress(upgrade);
    return needs && needs.have < needs.want ? 'needs' : null;
  }

  /** On offer: the next rung of its row, and nothing left in its way but the price. */
  upgradeAvailable(upgrade: UpgradeDef): boolean {
    return this.trackHead(upgrade.track) === upgrade && this.upgradeLock(upgrade) === null;
  }

  get availableUpgrades(): UpgradeDef[] {
    const list: UpgradeDef[] = [];
    for (const track of TRACKS) {
      const head = this.trackHead(track.id);
      if (head && this.upgradeLock(head) === null) list.push(head);
    }
    return list;
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
    const d = this.derived;
    const result: CannonResult = zone === 'green' ? 'perfect' : zone === 'over' ? 'overpressure' : 'normal';
    const seconds =
      result === 'perfect' ? CANNON.perfectSeconds : result === 'overpressure' ? CANNON.overpressureSeconds : CANNON.normalSeconds;
    const streak = result === 'perfect' ? s.stats.perfectStreak + 1 : 0;
    // A popped lid is its own punishment, so overpressure gets no payout bonus.
    const payout = result === 'overpressure' ? 1 : d.cannonPayout * (1 + cannonStreakBonus(d, streak));
    const gained = this.perSecond * seconds * payout;
    this.earn(gained);
    s.cannonCooldown = d.cannonCooldown;
    s.stats.cannonShots += 1;
    s.stats.perfectStreak = streak;
    if (result === 'perfect') s.stats.cannonPerfect += 1;
    else if (result === 'overpressure') s.stats.cannonOverpressure += 1;
    this.checkStage();
    this.bus.emit('cannon_fired', { result, gained, streak });
    return { result, gained };
  }

  // Things in the scene ------------------------------------------------------

  /** A working machine was poked. The scene shows it work; the rules only count it. */
  poke(unit: number): boolean {
    if (!(this.state.owned[unit]! > 0)) return false;
    this.state.stats.pokes += 1;
    this.bus.emit('machine_poked', { unit });
    return true;
  }

  /** An easter egg was found. Returns true the first time it is ever found, when it joins the album. */
  findEgg(id: string): boolean {
    if (!EGG_IDS.has(id)) return false;
    const found = this.state.legacy.found;
    const first = !found.includes(id);
    if (first) found.push(id);
    this.bus.emit('egg_found', { id, first });
    if (first) this.checkAchievements();
    return first;
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
    let decorOwned = 0;
    let goldOwned = 0;
    for (const id of s.upgrades) {
      const upgrade = UPGRADE_BY_ID.get(id);
      if (upgrade?.track === 'decor') decorOwned += 1;
      if (upgrade?.gold) goldOwned += 1;
    }
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
      decorOwned,
      goldOwned,
      eggsFound: s.legacy.found.length,
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

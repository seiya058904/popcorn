import { FLAVOR_BASE_COST, FLAVOR_COST_GROWTH, FLAVOR_LATE_FROM, FLAVOR_LATE_GROWTH, FLAVOR_MULTIPLIER, FLAVORS } from '../content/flavors.ts';
import { MILESTONE_STEP, MILESTONES, PRICE_GROWTH, PRODUCERS } from '../content/producers.ts';
import { CANNON, CLICK, GOLDEN, HOLD_POP, HOPPER, NEW_POT, OFFLINE, POT } from '../content/skills.ts';
import { STAGES } from '../content/stages.ts';
import { UPGRADE_BY_ID, type UpgradeEffect } from '../content/upgrades.ts';
import type { GameState } from './state.ts';

export function producerPrice(producer: number, owned: number): number {
  return Math.ceil(PRODUCERS[producer]!.baseCost * PRICE_GROWTH ** owned);
}

/** Exact cost of the next `quantity` units. */
export function bulkPrice(producer: number, owned: number, quantity: number): number {
  let total = 0;
  for (let i = 0; i < quantity; i += 1) total += producerPrice(producer, owned + i);
  return total;
}

/** How many units the budget covers. */
export function affordableCount(producer: number, owned: number, budget: number, limit = 1000): number {
  let count = 0;
  let spent = 0;
  while (count < limit) {
    const price = producerPrice(producer, owned + count);
    if (spent + price > budget) break;
    spent += price;
    count += 1;
  }
  return count;
}

export function flavorPrice(owned: number): number {
  const late = Math.max(0, owned - FLAVOR_LATE_FROM);
  return FLAVOR_BASE_COST * FLAVOR_COST_GROWTH ** (owned - late) * FLAVOR_LATE_GROWTH ** late;
}

/** What owning this many of one machine multiplies each of them by. */
export function milestoneMultiplier(owned: number): number {
  let multiplier = 1;
  for (const milestone of MILESTONES) if (owned >= milestone.at) multiplier *= milestone.mult;
  const last = MILESTONES[MILESTONES.length - 1]!.at;
  if (owned > last) multiplier *= 2 ** Math.floor((owned - last) / MILESTONE_STEP);
  return multiplier;
}

/** The next count at which a machine's output jumps, and by how much. */
export function nextMilestone(owned: number): { at: number; mult: number } {
  for (const milestone of MILESTONES) if (owned < milestone.at) return milestone;
  const last = MILESTONES[MILESTONES.length - 1]!.at;
  return { at: last + (Math.floor((owned - last) / MILESTONE_STEP) + 1) * MILESTONE_STEP, mult: 2 };
}

export function isMilestone(owned: number): boolean {
  return owned > 0 && milestoneMultiplier(owned) > milestoneMultiplier(owned - 1);
}

export function hasUpgrade(state: GameState, id: string): boolean {
  return state.upgrades.includes(id);
}

function* activeEffects(state: GameState): Generator<UpgradeEffect> {
  for (const id of state.upgrades) {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (upgrade) yield* upgrade.effects;
  }
}

/** Everything derived from purchases. Recomputed only when purchases change. */
export interface Derived {
  unitRates: number[];
  /** What one more unit of each kind makes per second at the current multipliers. */
  unitEach: number[];
  /** Production per second without the temporary frenzy. */
  baseRate: number;
  clickPops: number;
  clickShare: number;
  /** Clicks per second made for the player by the stirring machines. */
  autoPops: number;
  /** Pops per second while the mouse is held on the pot. */
  holdRate: number;
  /** Chance that a click turns out golden, and what a golden one is worth. */
  goldenChance: number;
  goldenMultiplier: number;
  autoCannon: boolean;
  autoHopper: boolean;
  cannonGreenWidth: number;
  cannonCooldown: number;
  cannonPayout: number;
  /** Bonus per consecutive green shot, and its ceiling; 0 until the upgrade. */
  cannonStreakStep: number;
  cannonStreakMax: number;
  frenzySeconds: number;
  frenzyMultiplier: number;
  /** Extra multiplier on clicks during a frenzy. */
  frenzyClick: number;
  hopperIntervalScale: number;
  swarmChance: number;
  swarmSize: number;
  /** Product of the scene decorations. */
  decorMultiplier: number;
  offlineRate: number;
  offlineCapSeconds: number;
}

export function stageMultiplier(stage: number): number {
  let multiplier = 1;
  for (let i = 0; i < Math.min(stage, STAGES.length); i += 1) multiplier *= STAGES[i]!.reward;
  return multiplier;
}

export function derive(state: GameState): Derived {
  const unitMults = PRODUCERS.map(() => 1);
  const synergy = PRODUCERS.map(() => 0);
  const d: Derived = {
    unitRates: [],
    unitEach: [],
    baseRate: 0,
    clickPops: CLICK.basePops,
    clickShare: CLICK.rateShare,
    autoPops: 0,
    holdRate: HOLD_POP.perSecond,
    goldenChance: 0,
    goldenMultiplier: GOLDEN.baseMultiplier,
    autoCannon: false,
    autoHopper: false,
    cannonGreenWidth: CANNON.greenWidth,
    cannonCooldown: CANNON.cooldown,
    cannonPayout: 1,
    cannonStreakStep: 0,
    cannonStreakMax: 0,
    frenzySeconds: HOPPER.frenzySeconds,
    frenzyMultiplier: HOPPER.frenzyMultiplier,
    frenzyClick: 1,
    hopperIntervalScale: 1,
    swarmChance: 0,
    swarmSize: 1,
    decorMultiplier: 1,
    offlineRate: OFFLINE.rate,
    offlineCapSeconds: OFFLINE.capHours * 3600,
  };
  for (const effect of activeEffects(state)) {
    switch (effect.kind) {
      case 'clickPops':
        d.clickPops = Math.max(d.clickPops, effect.pops);
        break;
      case 'clickRate':
        d.clickShare += effect.add;
        break;
      case 'autoPops':
        d.autoPops += effect.perSecond;
        break;
      case 'holdRate':
        d.holdRate = Math.max(d.holdRate, effect.perSecond);
        break;
      case 'goldenChance':
        d.goldenChance += effect.add;
        break;
      case 'goldenMult':
        d.goldenMultiplier = Math.max(d.goldenMultiplier, effect.mult);
        break;
      case 'globalMult':
        d.decorMultiplier *= effect.mult;
        break;
      case 'cannonStreak':
        d.cannonStreakStep = effect.perShot;
        d.cannonStreakMax = effect.max;
        break;
      case 'frenzyClick':
        d.frenzyClick = Math.max(d.frenzyClick, effect.mult);
        break;
      case 'hopperSwarm':
        d.swarmChance = effect.chance;
        d.swarmSize = effect.size;
        break;
      case 'autoCannon':
        d.autoCannon = true;
        break;
      case 'autoHopper':
        d.autoHopper = true;
        break;
      case 'unitMult':
        unitMults[effect.unit]! *= effect.mult;
        break;
      case 'synergy':
        synergy[effect.to]! += state.owned[effect.from]! * effect.perOwned;
        break;
      case 'cannonWindow':
        d.cannonGreenWidth += effect.addSeconds;
        break;
      case 'cannonCooldown':
        d.cannonCooldown *= effect.mult;
        break;
      case 'cannonPayout':
        d.cannonPayout *= effect.mult;
        break;
      case 'frenzyDuration':
        d.frenzySeconds += effect.add;
        break;
      case 'frenzyMult':
        d.frenzyMultiplier = Math.max(d.frenzyMultiplier, effect.mult);
        break;
      case 'hopperInterval':
        d.hopperIntervalScale *= effect.mult;
        break;
      case 'offlineRate':
        d.offlineRate += effect.add;
        break;
      case 'offlineCap':
        d.offlineCapSeconds += effect.addHours * 3600;
        break;
    }
  }
  const global =
    FLAVOR_MULTIPLIER ** Math.min(state.flavors, FLAVORS.length) *
    stageMultiplier(state.stage) *
    d.decorMultiplier *
    (1 + state.legacy.runs * NEW_POT.bonusPerRun);
  d.unitEach = PRODUCERS.map(
    (producer) =>
      producer.baseRate * milestoneMultiplier(state.owned[producer.id]!) * unitMults[producer.id]! * (1 + synergy[producer.id]!) * global,
  );
  d.unitRates = PRODUCERS.map((producer) => state.owned[producer.id]! * d.unitEach[producer.id]!);
  d.baseRate = d.unitRates.reduce((sum, rate) => sum + rate, POT.idleRate * global);
  return d;
}

/** Popcorn per second including an active frenzy. */
export function currentRate(state: GameState, d: Derived): number {
  return d.baseRate * (state.frenzy > 0 ? d.frenzyMultiplier : 1);
}

/** Output spans many orders of magnitude; shows and sound follow it on this compressed scale. */
const SHOW_INTENSITY_PER_DECADE = 0.5;

export function showIntensity(rate: number): number {
  return Math.log10(1 + rate) * SHOW_INTENSITY_PER_DECADE;
}

/**
 * A click earns one base value per kernel plus one share of production, however many kernels pop.
 * During a frenzy an upgrade multiplies the whole click once more.
 */
export function clickGain(state: GameState, d: Derived): number {
  const frenzy = state.frenzy > 0 ? d.frenzyClick : 1;
  return (CLICK.baseValue * d.clickPops + currentRate(state, d) * d.clickShare) * frenzy;
}

/** Extra cannon payout for a run of green shots: `streak` counts the current shot. */
export function cannonStreakBonus(d: Derived, streak: number): number {
  return Math.min(d.cannonStreakMax, d.cannonStreakStep * streak);
}

export type CannonZone = 'early' | 'green' | 'over';

/** Green zone in seconds of holding: it sits just before overpressure. */
export function cannonGreenRange(d: Derived): { start: number; end: number } {
  const end = CANNON.chargeSeconds - CANNON.greenEndsBefore;
  return { start: end - d.cannonGreenWidth, end };
}

export function cannonZone(heldSeconds: number, d: Derived): CannonZone {
  if (heldSeconds >= CANNON.chargeSeconds) return 'over';
  const { start, end } = cannonGreenRange(d);
  return heldSeconds >= start && heldSeconds <= end ? 'green' : 'early';
}

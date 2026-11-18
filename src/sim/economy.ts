import { FLAVOR_BASE_COST, FLAVOR_COST_GROWTH, FLAVOR_MULTIPLIER, FLAVORS } from '../content/flavors.ts';
import { MILESTONE_STEP, MILESTONES, PRICE_GROWTH, PRODUCERS } from '../content/producers.ts';
import { CANNON, CLICK, HOPPER, NEW_POT, OFFLINE } from '../content/skills.ts';
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
  return FLAVOR_BASE_COST * FLAVOR_COST_GROWTH ** owned;
}

export function milestoneCount(owned: number): number {
  let count = 0;
  for (const milestone of MILESTONES) if (owned >= milestone) count += 1;
  const last = MILESTONES[MILESTONES.length - 1]!;
  if (owned > last) count += Math.floor((owned - last) / MILESTONE_STEP);
  return count;
}

export function isMilestone(owned: number): boolean {
  return milestoneCount(owned) > milestoneCount(owned - 1);
}

export function hasUpgrade(state: GameState, id: string): boolean {
  return state.upgrades.includes(id);
}

function* activeEffects(state: GameState): Generator<UpgradeEffect> {
  for (const id of state.upgrades) {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (upgrade) yield upgrade.effect;
  }
}

/** Everything derived from purchases. Recomputed only when purchases change. */
export interface Derived {
  unitRates: number[];
  /** Production per second without the temporary frenzy. */
  baseRate: number;
  clickPops: number;
  clickShare: number;
  cannonGreenWidth: number;
  cannonCooldown: number;
  cannonPayout: number;
  frenzySeconds: number;
  hopperIntervalScale: number;
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
    baseRate: 0,
    clickPops: CLICK.basePops,
    clickShare: CLICK.rateShare,
    cannonGreenWidth: CANNON.greenWidth,
    cannonCooldown: CANNON.cooldown,
    cannonPayout: 1,
    frenzySeconds: HOPPER.frenzySeconds,
    hopperIntervalScale: 1,
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
    (1 + state.legacy.runs * NEW_POT.bonusPerRun);
  d.unitRates = PRODUCERS.map((producer) => {
    const owned = state.owned[producer.id]!;
    return (
      owned * producer.baseRate * 2 ** milestoneCount(owned) * unitMults[producer.id]! * (1 + synergy[producer.id]!) * global
    );
  });
  d.baseRate = d.unitRates.reduce((sum, rate) => sum + rate, 0);
  return d;
}

/** Popcorn per second including an active frenzy. */
export function currentRate(state: GameState, d: Derived): number {
  return d.baseRate * (state.frenzy > 0 ? HOPPER.frenzyMultiplier : 1);
}

/** A click earns one base value per kernel plus one share of production, however many kernels pop. */
export function clickGain(state: GameState, d: Derived): number {
  return CLICK.baseValue * d.clickPops + currentRate(state, d) * d.clickShare;
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

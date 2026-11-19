import { FLAVORS } from '../content/flavors.ts';
import { PRODUCERS } from '../content/producers.ts';
import { CANNON } from '../content/skills.ts';
import { STAGES } from '../content/stages.ts';
import type { UpgradeDef } from '../content/upgrades.ts';
import { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';
import { cannonGreenRange, derive } from './economy.ts';
import { Simulation } from './simulation.ts';
import { SIM_STEP } from './stepper.ts';

export interface BotProfile {
  name: string;
  clicksPerSecond: number;
  cannon: 'none' | 'normal' | 'perfect';
  /** Chance of catching each hopping kernel. */
  hopperCatch: number;
  /** Seconds between shop visits. */
  shopInterval: number;
}

export const BOT_PROFILES: readonly BotProfile[] = [
  { name: '点击型', clicksPerSecond: 3, cannon: 'normal', hopperCatch: 0.8, shopInterval: 1 },
  { name: '挂机型', clicksPerSecond: 0, cannon: 'none', hopperCatch: 0, shopInterval: 8 },
  { name: '大炮熟练型', clicksPerSecond: 3, cannon: 'perfect', hopperCatch: 1, shopInterval: 1 },
];

export interface BotReport {
  name: string;
  stageMinutes: number[];
  finished: boolean;
  endMinutes: number;
  longestWaitMinutes: number;
  longestWaitAt: number;
  longestWaitFor: string;
  purchases: number;
  firstPurchaseSeconds: number;
  firstUnitSeconds: number;
  /** When the second kind of unit was first bought. */
  secondKindSeconds: number;
  total: number;
  owned: number[];
  firstBought: number[];
  lastBought: number[];
  flavors: number;
  upgrades: number;
  achievements: number;
  purchaseGapsEarly: number[];
}

type Choice =
  | { kind: 'unit'; id: number; cost: number; gain: number }
  | { kind: 'flavor'; cost: number; gain: number }
  | { kind: 'upgrade'; def: UpgradeDef; cost: number; gain: number };

/** Extra production a purchase would add, measured with the real formulas. */
function productionGain(sim: Simulation, apply: () => void, undo: () => void): number {
  const before = sim.derived.baseRate;
  apply();
  const after = derive(sim.state).baseRate;
  undo();
  return after - before;
}

function choices(sim: Simulation): Choice[] {
  const s = sim.state;
  const list: Choice[] = [];
  for (const producer of PRODUCERS) {
    if (!sim.producerUnlocked(producer.id)) continue;
    const gain = productionGain(
      sim,
      () => (s.owned[producer.id]! += 1),
      () => (s.owned[producer.id]! -= 1),
    );
    list.push({ kind: 'unit', id: producer.id, cost: sim.price(producer.id), gain });
  }
  const flavorCost = sim.nextFlavorPrice;
  if (flavorCost !== null && s.flavors < FLAVORS.length) {
    const gain = productionGain(
      sim,
      () => (s.flavors += 1),
      () => (s.flavors -= 1),
    );
    list.push({ kind: 'flavor', cost: flavorCost, gain });
  }
  for (const def of sim.availableUpgrades) {
    let gain = productionGain(
      sim,
      () => s.upgrades.push(def.id),
      () => s.upgrades.pop(),
    );
    // Non-production upgrades are valued as a modest share of current income.
    if (gain <= 0) gain = Math.max(sim.derived.baseRate * 0.08, 0.15);
    list.push({ kind: 'upgrade', def, cost: def.cost, gain });
  }
  return list;
}

export interface BotListener {
  onPurchase?(label: string, unit: number | null): void;
}

/** A simple greedy player. Drives both the balance tool and full playthroughs of the real game. */
export class BotPlayer {
  private readonly profile: BotProfile;
  private readonly sim: Simulation;
  private readonly click: () => void;
  private readonly listener: BotListener;
  private clickBudget = 0;
  private shopTimer = 0;
  private hopperDelay = 0;
  private seed = 12345;

  constructor(profile: BotProfile, sim: Simulation, bus: EventBus<GameEvents>, click: () => void, listener: BotListener = {}) {
    this.profile = profile;
    this.sim = sim;
    this.click = click;
    this.listener = listener;
    bus.on('hopper_spawned', () => {
      this.hopperDelay = this.roll() < profile.hopperCatch ? 2 + this.roll() * 3 : -1;
    });
  }

  private roll(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Actions taken before the simulation advances by `seconds`. */
  act(seconds: number): void {
    const { profile } = this;
    this.clickBudget += profile.clicksPerSecond * seconds;
    while (this.clickBudget >= 1) {
      this.clickBudget -= 1;
      this.click();
    }
  }

  /** Decisions made after the simulation has advanced. */
  decide(seconds: number): void {
    const { profile, sim } = this;
    if (this.hopperDelay > 0) {
      this.hopperDelay -= seconds;
      if (this.hopperDelay <= 0) sim.catchHopper();
    }
    if (profile.cannon !== 'none' && sim.cannonReady) {
      const green = cannonGreenRange(sim.derived);
      sim.fireCannon(profile.cannon === 'perfect' ? (green.start + green.end) / 2 : CANNON.chargeSeconds * 0.5);
    }
    this.shopTimer -= seconds;
    if (this.shopTimer > 0) return;
    this.shopTimer = profile.shopInterval;
    this.shop();
  }

  private shop(): void {
    const { profile, sim } = this;
    // Spending keeps going while the best item is affordable.
    for (let guard = 0; guard < 25; guard += 1) {
      const income = Math.max(sim.perSecond + profile.clicksPerSecond * sim.clickValue, 0.1);
      const list = choices(sim);
      let best: Choice | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const choice of list) {
        const payback = choice.cost / Math.max(choice.gain, 1e-9);
        const delay = Math.max(0, choice.cost - sim.state.popcorn) / income;
        const score = payback + delay * 1.5;
        if (score < bestScore) {
          bestScore = score;
          best = choice;
        }
      }
      if (!best) return;
      if (sim.state.popcorn < best.cost) {
        // While saving up, a person still picks up things that barely delay the big purchase,
        // and accepts a larger detour when the big purchase is minutes away.
        const target: number = best.cost;
        const secondsAway = (target - sim.state.popcorn) / income;
        const share = secondsAway > 75 ? 0.5 : 0.2;
        const filler = list
          .filter((choice) => choice.cost <= sim.state.popcorn && choice.cost <= target * share)
          .sort((a, b) => a.cost / Math.max(a.gain, 1e-9) - b.cost / Math.max(b.gain, 1e-9))[0];
        if (!filler) return;
        best = filler;
      }
      let bought = false;
      let label = '';
      let unit: number | null = null;
      if (best.kind === 'unit') {
        bought = sim.buyProducer(best.id);
        label = PRODUCERS[best.id]!.name;
        unit = best.id;
      } else if (best.kind === 'flavor') {
        label = `口味 ${sim.state.flavors + 1}`;
        bought = sim.buyFlavor();
      } else {
        label = best.def.name;
        bought = sim.buyUpgrade(best.def.id);
      }
      if (!bought) return;
      this.listener.onPurchase?.(label, unit);
    }
  }
}

/** Plays one full run headlessly and records when things happened. */
export function runBot(profile: BotProfile, maxHours = 14, trace?: (seconds: number, sim: Simulation) => void): BotReport {
  const bus = new EventBus<GameEvents>();
  const sim = new Simulation(bus);
  const stageMinutes: number[] = [];
  let time = 0;
  bus.on('stage_broken', () => stageMinutes.push(time / 60));

  const firstBought = PRODUCERS.map(() => -1);
  const lastBought = PRODUCERS.map(() => -1);
  let lastPurchase = 0;
  let longestWait = 0;
  let longestWaitAt = 0;
  let longestWaitFor = '';
  let firstPurchase = -1;
  let firstUnit = -1;
  let purchases = 0;
  const early: number[] = [];

  const bot = new BotPlayer(profile, sim, bus, () => sim.click(), {
    onPurchase(label, unit) {
      if (unit !== null) {
        if (firstBought[unit] === -1) firstBought[unit] = time;
        lastBought[unit] = time;
        if (firstUnit < 0) firstUnit = time;
      }
      const gap = time - lastPurchase;
      if (purchases > 0 && gap > longestWait) {
        longestWait = gap;
        longestWaitAt = time;
        longestWaitFor = label;
      }
      if (purchases > 0 && time < 20 * 60) early.push(gap);
      lastPurchase = time;
      purchases += 1;
      if (firstPurchase < 0) firstPurchase = time;
    },
  });

  const limit = maxHours * 3600;
  while (time < limit && !sim.state.ended) {
    time += SIM_STEP;
    bot.act(SIM_STEP);
    sim.step(SIM_STEP);
    trace?.(time, sim);
    bot.decide(SIM_STEP);
  }

  while (stageMinutes.length < STAGES.length) stageMinutes.push(Number.NaN);
  return {
    name: profile.name,
    stageMinutes,
    finished: sim.state.ended,
    endMinutes: time / 60,
    longestWaitMinutes: longestWait / 60,
    longestWaitAt: longestWaitAt / 60,
    longestWaitFor,
    purchases,
    firstPurchaseSeconds: firstPurchase,
    firstUnitSeconds: firstUnit,
    secondKindSeconds: firstBought.filter((value) => value >= 0).sort((a, b) => a - b)[1] ?? Number.NaN,
    total: sim.state.totalEarned,
    owned: [...sim.state.owned],
    firstBought: firstBought.map((value) => value / 60),
    lastBought: lastBought.map((value) => value / 60),
    flavors: sim.state.flavors,
    upgrades: sim.state.upgrades.length,
    achievements: sim.state.legacy.achievements.length,
    purchaseGapsEarly: early,
  };
}

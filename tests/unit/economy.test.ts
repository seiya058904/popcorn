import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../../src/content/achievements.ts';
import { FLAVORS } from '../../src/content/flavors.ts';
import { DECOR } from '../../src/content/decor.ts';
import { PRODUCERS, PRODUCERS_IN_ORDER } from '../../src/content/producers.ts';
import { EGGS } from '../../src/content/props.ts';
import { CANNON, CLICK, GOLDEN, HOLD_POP, HOPPER, OFFLINE, POT } from '../../src/content/skills.ts';
import { STAGES } from '../../src/content/stages.ts';
import { UPGRADES } from '../../src/content/upgrades.ts';
import { EventBus } from '../../src/events/bus.ts';
import type { GameEvents } from '../../src/events/game-events.ts';
import { BOT_PROFILES, runBot } from '../../src/sim/bots.ts';
import {
  affordableCount,
  bulkPrice,
  cannonGreenRange,
  derive,
  flavorPrice,
  milestoneCount,
  producerPrice,
} from '../../src/sim/economy.ts';
import { checksum, elapsedSince, migrationResetsRun, parseSave, serializeSave } from '../../src/sim/save.ts';
import { createState } from '../../src/sim/state.ts';
import { Simulation } from '../../src/sim/simulation.ts';

function setup(): { sim: Simulation; bus: EventBus<GameEvents> } {
  const bus = new EventBus<GameEvents>();
  return { sim: new Simulation(bus), bus };
}

const rich = (sim: Simulation, amount = 1e15): void => {
  sim.state.popcorn = amount;
};

describe('content tables', () => {
  it('has the promised amount of content', () => {
    expect(PRODUCERS).toHaveLength(15);
    expect(FLAVORS).toHaveLength(12);
    expect(STAGES).toHaveLength(5);
    expect(ACHIEVEMENTS).toHaveLength(45);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(110);
    expect(UPGRADES.length).toBeLessThanOrEqual(125);
    expect(DECOR).toHaveLength(10);
    expect(EGGS).toHaveLength(15);
  });

  it('uses unique ids and resolvable prerequisites', () => {
    const ids = new Set(UPGRADES.map((upgrade) => upgrade.id));
    expect(ids.size).toBe(UPGRADES.length);
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(EGGS.map((egg) => egg.id)).size).toBe(EGGS.length);
    for (const upgrade of UPGRADES) if (upgrade.requires) expect(ids.has(upgrade.requires)).toBe(true);
  });

  it('keeps machine ids in save order and gives every scene three machines in the shop', () => {
    PRODUCERS.forEach((producer, index) => expect(producer.id).toBe(index));
    expect(new Set(PRODUCERS.map((producer) => producer.order)).size).toBe(PRODUCERS.length);
    for (const stage of STAGES) {
      const scene = PRODUCERS_IN_ORDER.filter((producer) => producer.unlockStage === stage.id);
      expect(scene).toHaveLength(3);
      // Each new machine sits between the two older ones of its scene.
      expect(scene[1]!.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('gives every machine four tiers, the last one gold at 100 owned, and every scene two decorations', () => {
    for (const producer of PRODUCERS) {
      const tiers = UPGRADES.filter((upgrade) => upgrade.effect.kind === 'unitMult' && upgrade.effect.unit === producer.id);
      expect(tiers).toHaveLength(4);
      expect(tiers[3]).toMatchObject({ gold: true, ownedAtLeast: { unit: producer.id, count: 100 } });
    }
    for (const stage of STAGES) expect(DECOR.filter((decor) => decor.stage === stage.id)).toHaveLength(2);
  });
});

describe('prices', () => {
  it('follows base × 1.19^owned', () => {
    expect(producerPrice(0, 0)).toBe(10);
    expect(producerPrice(0, 1)).toBe(12);
    expect(producerPrice(0, 10)).toBe(Math.ceil(10 * 1.19 ** 10));
  });

  it('makes each machine in shop order cost more and produce more than the one before', () => {
    for (let i = 1; i < PRODUCERS_IN_ORDER.length; i += 1) {
      expect(PRODUCERS_IN_ORDER[i]!.baseCost).toBeGreaterThan(PRODUCERS_IN_ORDER[i - 1]!.baseCost * 2.5);
      expect(PRODUCERS_IN_ORDER[i]!.baseRate).toBeGreaterThan(PRODUCERS_IN_ORDER[i - 1]!.baseRate * 2.5);
      expect(PRODUCERS_IN_ORDER[i]!.unlockStage).toBeGreaterThanOrEqual(PRODUCERS_IN_ORDER[i - 1]!.unlockStage);
    }
  });

  it('sums bulk purchases exactly and agrees with the affordability check', () => {
    expect(bulkPrice(0, 0, 3)).toBe(10 + 12 + 15);
    const budget = bulkPrice(1, 4, 10);
    expect(affordableCount(1, 4, budget)).toBe(10);
    expect(affordableCount(1, 4, budget - 1)).toBe(9);
  });

  it('prices flavors at 400 × 28^n', () => {
    expect(flavorPrice(0)).toBe(400);
    expect(flavorPrice(3)).toBe(400 * 28 ** 3);
  });
});

describe('multipliers', () => {
  it('doubles at 25, 50, 100 and then every 50', () => {
    expect([24, 25, 49, 50, 99, 100, 149, 150, 200].map(milestoneCount)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
  });

  it('applies milestones and flavors to production', () => {
    const state = createState();
    state.owned[0] = 25;
    expect(derive(state).baseRate).toBeCloseTo(POT.idleRate + 25 * 0.5 * 2);
    state.flavors = 2;
    expect(derive(state).baseRate).toBeCloseTo((POT.idleRate + 25 * 0.5 * 2) * 1.35 ** 2);
  });

  it('adds click upgrades without multiplying the production share', () => {
    const { sim } = setup();
    sim.state.owned[1] = 10;
    sim.invalidate();
    const rate = sim.perSecond;
    expect(sim.clickValue).toBeCloseTo(1 + rate * CLICK.rateShare);
    sim.state.upgrades.push('pop3');
    sim.invalidate();
    expect(sim.clickValue).toBeCloseTo(3 + rate * CLICK.rateShare);
    const { count, gainEach } = sim.click();
    expect(count).toBe(3);
    expect(gainEach * count).toBeCloseTo(3 + rate * CLICK.rateShare);
  });

  it('earns a little with no machines at all, so nobody is stuck without clicking', () => {
    const { sim } = setup();
    for (let i = 0; i < 100; i += 1) sim.step(0.1);
    expect(sim.state.popcorn).toBeCloseTo(POT.idleRate * 10);
  });
});

describe('purchases', () => {
  it('refuses unaffordable or locked purchases without changing anything', () => {
    const { sim } = setup();
    expect(sim.buyProducer(0)).toBe(false);
    rich(sim);
    expect(sim.buyProducer(2)).toBe(false);
    expect(sim.state.owned[2]).toBe(0);
    expect(sim.state.popcorn).toBe(1e15);
  });

  it('spending never reduces the cumulative total', () => {
    const { sim } = setup();
    sim.state.popcorn = 100;
    sim.state.totalEarned = 100;
    expect(sim.buyProducer(0)).toBe(true);
    expect(sim.state.popcorn).toBe(90);
    expect(sim.state.totalEarned).toBe(100);
  });

  it('reports milestones crossed by a bulk purchase', () => {
    const { sim, bus } = setup();
    const events = vi.fn();
    bus.on('producer_purchased', events);
    rich(sim);
    sim.buyProducer(0, 24);
    sim.buyProducer(0, 2);
    expect(events.mock.calls[0]![0].milestone).toBe(false);
    expect(events.mock.calls[1]![0].milestone).toBe(true);
  });

  it('enforces upgrade prerequisites and buys each only once', () => {
    const { sim } = setup();
    rich(sim);
    sim.state.totalEarned = 1e9;
    sim.state.stage = 4;
    expect(sim.buyUpgrade('pop5')).toBe(false);
    expect(sim.buyUpgrade('pop3')).toBe(true);
    expect(sim.buyUpgrade('pop3')).toBe(false);
    expect(sim.buyUpgrade('pop5')).toBe(true);
    expect(sim.derived.clickPops).toBe(5);
  });

  it('caps flavors at twelve', () => {
    const { sim } = setup();
    rich(sim, 1e21);
    for (let i = 0; i < 20; i += 1) sim.buyFlavor();
    expect(sim.state.flavors).toBe(12);
    expect(sim.nextFlavorPrice).toBeNull();
  });
});

describe('automation', () => {
  it('offers a unit upgrade only once enough of that unit are owned', () => {
    const { sim } = setup();
    rich(sim);
    sim.state.totalEarned = 1e12;
    expect(sim.buyUpgrade('unit-0-1')).toBe(false);
    sim.state.owned[0] = 10;
    expect(sim.buyUpgrade('unit-0-1')).toBe(true);
    expect(sim.buyUpgrade('unit-0-2')).toBe(false);
  });

  it('makes clicks on its own once the stirrer is bought', () => {
    const { sim, bus } = setup();
    const popped = vi.fn();
    bus.on('auto_popped', popped);
    sim.state.upgrades.push('auto1');
    sim.invalidate();
    for (let i = 0; i < 31; i += 1) sim.step(0.1);
    expect(popped).toHaveBeenCalledTimes(3);
    expect(sim.state.stats.clicks).toBe(0);
  });

  it('fires the cannon by itself, but never while the player is charging it', () => {
    const { sim, bus } = setup();
    const fired = vi.fn();
    bus.on('cannon_fired', fired);
    sim.state.stage = 1;
    sim.state.upgrades.push('auto-cannon');
    sim.invalidate();
    sim.cannonHeld = true;
    for (let i = 0; i < (CANNON.autoFireDelay + 1) * 10; i += 1) sim.step(0.1);
    expect(fired).not.toHaveBeenCalled();
    sim.cannonHeld = false;
    for (let i = 0; i < (CANNON.autoFireDelay + 1) * 10; i += 1) sim.step(0.1);
    expect(fired).toHaveBeenCalledOnce();
    expect(fired.mock.calls[0]![0].result).toBe('normal');
  });

  it('catches the hopping kernel by itself after a moment', () => {
    const { sim } = setup();
    sim.state.upgrades.push('auto-hopper');
    sim.invalidate();
    sim.state.hopperTimer = 0.05;
    for (let i = 0; i < (HOPPER.autoCatchSeconds + 1) * 10; i += 1) sim.step(0.1);
    expect(sim.state.stats.hoppersCaught).toBe(1);
    expect(sim.state.frenzy).toBeGreaterThan(0);
  });
});

describe('stages', () => {
  it('breaks each scene at its threshold and ends the run after the last', () => {
    const { sim, bus } = setup();
    const broken: number[] = [];
    const ended = vi.fn();
    bus.on('stage_broken', ({ stage }) => broken.push(stage));
    bus.on('ending_reached', ended);
    for (const stage of STAGES) {
      sim.state.totalEarned = stage.threshold;
      sim.step(0.1);
    }
    expect(broken).toEqual([0, 1, 2, 3, 4]);
    expect(ended).toHaveBeenCalledOnce();
    expect(sim.state.ended).toBe(true);
  });
});

describe('cannon', () => {
  const ready = (): Simulation => {
    const { sim } = setup();
    sim.state.stage = 1;
    sim.state.owned[0] = 100;
    sim.invalidate();
    return sim;
  };

  it('is locked until the first breakthrough', () => {
    const { sim } = setup();
    expect(sim.fireCannon(0.5)).toBeNull();
  });

  it('pays by zone and starts the cooldown', () => {
    const sim = ready();
    const rate = sim.perSecond;
    const green = cannonGreenRange(sim.derived);
    const perfect = sim.fireCannon((green.start + green.end) / 2)!;
    expect(perfect.result).toBe('perfect');
    expect(perfect.gained).toBeCloseTo(rate * CANNON.perfectSeconds);
    expect(sim.cannonReady).toBe(false);
    expect(sim.fireCannon(0.6)).toBeNull();

    sim.state.cannonCooldown = 0;
    expect(sim.fireCannon(0.5)!.gained).toBeCloseTo(rate * CANNON.normalSeconds);
    sim.state.cannonCooldown = 0;
    const over = sim.fireCannon(CANNON.chargeSeconds)!;
    expect(over.result).toBe('overpressure');
    expect(over.gained).toBeCloseTo(rate * CANNON.overpressureSeconds);
  });

  it('treats a very short press as cancelled', () => {
    const sim = ready();
    expect(sim.fireCannon(0.05)).toBeNull();
    expect(sim.cannonReady).toBe(true);
  });

  it('has a green zone of the designed width that an upgrade widens', () => {
    const sim = ready();
    const before = cannonGreenRange(sim.derived);
    expect(before.end - before.start).toBeCloseTo(0.16);
    sim.state.upgrades.push('cannon-window');
    sim.invalidate();
    const after = cannonGreenRange(sim.derived);
    expect(after.end - after.start).toBeCloseTo(0.24);
    expect(after.end).toBeLessThan(CANNON.chargeSeconds);
  });
});

describe('hopping kernel', () => {
  it('appears, multiplies production when caught, then wears off', () => {
    const { sim, bus } = setup();
    sim.state.owned[0] = 10;
    sim.invalidate();
    const base = sim.perSecond;
    const spawned = vi.fn();
    bus.on('hopper_spawned', spawned);
    sim.state.hopperTimer = 0.05;
    sim.step(0.1);
    expect(spawned).toHaveBeenCalledOnce();
    expect(sim.catchHopper()).toBe(true);
    expect(sim.perSecond).toBeCloseTo(base * HOPPER.frenzyMultiplier);
    for (let i = 0; i < (HOPPER.frenzySeconds + 1) * 10; i += 1) sim.step(0.1);
    expect(sim.perSecond).toBeCloseTo(base);
    expect(sim.state.hopperTimer).toBeGreaterThan(0);
  });

  it('escapes when ignored and cannot be caught twice', () => {
    const { sim } = setup();
    expect(sim.catchHopper()).toBe(false);
    sim.state.hopperVisible = 0.05;
    sim.step(0.1);
    expect(sim.state.stats.hoppersMissed).toBe(1);
    expect(sim.catchHopper()).toBe(false);
  });
});

describe('golden kernels, decorations and other phase 3 rules', () => {
  /** In the town and well short of its threshold, so nothing breaks out mid-test. */
  const producing = (): { sim: Simulation; bus: EventBus<GameEvents> } => {
    const made = setup();
    made.sim.state.stage = 3;
    made.sim.state.owned[1] = 10;
    made.sim.invalidate();
    return made;
  };

  it('rolls for golden kernels only once they exist, and pays a golden one many times over', () => {
    const { sim, bus } = producing();
    const seed = sim.state.rng;
    sim.click();
    expect(sim.state.rng).toBe(seed);
    sim.state.upgrades.push('golden1');
    sim.invalidate();
    const plain = sim.clickValue;
    let golden = 0;
    bus.on('kernel_popped', (event) => {
      if (event.golden) golden += 1;
      expect(event.gained).toBeCloseTo(plain * (event.golden ? GOLDEN.baseMultiplier : 1));
    });
    for (let i = 0; i < 2000; i += 1) expect(sim.click().golden).toBeTypeOf('boolean');
    // 3% of 2000 is 60.
    expect(golden).toBeGreaterThan(30);
    expect(golden).toBeLessThan(95);
    expect(sim.state.stats.goldenPops).toBe(golden);
  });

  it('raises the golden chance and payout with the later tiers', () => {
    const { sim } = producing();
    sim.state.upgrades.push('golden1', 'golden2', 'golden3');
    sim.invalidate();
    expect(sim.derived.goldenChance).toBeCloseTo(0.05);
    expect(sim.derived.goldenMultiplier).toBe(20);
  });

  it('pops faster while held once the gloves are bought', () => {
    const { sim } = producing();
    expect(sim.derived.holdRate).toBe(HOLD_POP.perSecond);
    sim.state.upgrades.push('hold8');
    sim.invalidate();
    expect(sim.derived.holdRate).toBe(8);
  });

  it('multiplies all production by each decoration', () => {
    const { sim } = producing();
    const before = sim.derived.baseRate;
    sim.state.upgrades.push('decor-neon', 'decor-plant');
    sim.invalidate();
    expect(sim.derived.baseRate).toBeCloseTo(before * DECOR[0]!.mult * DECOR[1]!.mult);
  });

  it('multiplies clicks again during a frenzy', () => {
    const { sim } = producing();
    sim.state.frenzy = 10;
    const before = sim.clickValue;
    sim.state.upgrades.push('frenzy-click');
    sim.invalidate();
    expect(sim.clickValue).toBeCloseTo(before * 2);
    sim.state.frenzy = 0;
    sim.state.upgrades.pop();
    sim.invalidate();
    const calm = sim.clickValue;
    sim.state.upgrades.push('frenzy-click');
    sim.invalidate();
    expect(sim.clickValue).toBeCloseTo(calm);
  });

  it('adds 10% per green shot in a row up to 50%, and starts over after any other shot', () => {
    const { sim, bus } = producing();
    sim.state.upgrades.push('cannon-streak');
    sim.invalidate();
    const rate = sim.perSecond;
    const green = cannonGreenRange(sim.derived);
    const streaks: number[] = [];
    bus.on('cannon_fired', ({ streak }) => streaks.push(streak));
    const fire = (held: number): number => {
      sim.state.cannonCooldown = 0;
      return sim.fireCannon(held)!.gained;
    };
    for (let shot = 1; shot <= 7; shot += 1) {
      expect(fire((green.start + green.end) / 2)).toBeCloseTo(rate * CANNON.perfectSeconds * (1 + 0.1 * Math.min(shot, 5)));
    }
    expect(fire(0.5)).toBeCloseTo(rate * CANNON.normalSeconds);
    expect(fire((green.start + green.end) / 2)).toBeCloseTo(rate * CANNON.perfectSeconds * 1.1);
    expect(streaks).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  it('sends a swarm one kernel after another, stacking the frenzy, and counts a full catch', () => {
    const { sim, bus } = producing();
    sim.state.upgrades.push('hopper-swarm');
    sim.invalidate();
    const spawned: number[] = [];
    bus.on('hopper_spawned', ({ swarm }) => spawned.push(swarm));
    // Lone kernels are caught until one turns out to lead a swarm.
    for (let guard = 0; guard < 200 && sim.state.hopperSwarmSize === 0; guard += 1) {
      sim.state.hopperTimer = 0.05;
      sim.step(0.1);
      if (sim.state.hopperSwarmSize === 0) sim.catchHopper();
    }
    expect(sim.state.hopperSwarmSize).toBe(3);
    sim.state.frenzy = 0;
    const frenzy = sim.derived.frenzySeconds;
    expect(sim.catchHopper()).toBe(true);
    expect(sim.state.frenzy).toBeCloseTo(frenzy);
    expect(sim.state.hopperTimer).toBeCloseTo(HOPPER.swarmGapSeconds);
    for (let i = 0; i < 13; i += 1) sim.step(0.1);
    expect(sim.hopperActive).toBe(true);
    sim.catchHopper();
    for (let i = 0; i < 13; i += 1) sim.step(0.1);
    sim.catchHopper();
    expect(spawned.slice(-3)).toEqual([2, 1, 0]);
    expect(sim.state.frenzy).toBeGreaterThan(frenzy * 2.5);
    expect(sim.state.frenzy).toBeLessThanOrEqual(frenzy * HOPPER.swarmFrenzyCap);
    expect(sim.state.stats.swarmsCaught).toBe(1);
    expect(sim.state.hopperSwarmSize).toBe(0);
    expect(sim.state.hopperTimer).toBeGreaterThanOrEqual(HOPPER.minInterval * sim.derived.hopperIntervalScale);
  });

  it('ends a swarm when one of it gets away', () => {
    const { sim } = producing();
    Object.assign(sim.state, { hopperSwarm: 2, hopperSwarmSize: 3, hopperVisible: 0.05 });
    sim.step(0.1);
    expect(sim.state).toMatchObject({ hopperSwarm: 0, hopperSwarmSize: 0 });
    expect(sim.state.stats.swarmsCaught).toBe(0);
    expect(sim.state.hopperTimer).toBeGreaterThanOrEqual(HOPPER.minInterval);
  });

  it('counts pokes only on machines that exist, and puts each egg in the album once', () => {
    const { sim, bus } = setup();
    expect(sim.poke(0)).toBe(false);
    sim.state.owned[0] = 1;
    expect(sim.poke(0)).toBe(true);
    expect(sim.state.stats.pokes).toBe(1);
    const found = vi.fn();
    bus.on('egg_found', found);
    expect(sim.findEgg('egg-nowhere')).toBe(false);
    expect(sim.findEgg('egg-clock')).toBe(true);
    expect(sim.findEgg('egg-clock')).toBe(false);
    expect(found.mock.calls.map(([event]) => event.first)).toEqual([true, false]);
    expect(sim.state.legacy.found).toEqual(['egg-clock']);
    expect(sim.state.legacy.achievements).toEqual(expect.arrayContaining(['egg-first', 'poke-first']));
  });

  it('lists what "buy them all" would buy: cheapest first, as far as the popcorn goes', () => {
    const { sim } = setup();
    sim.state.totalEarned = 1e4;
    sim.state.popcorn = 1000;
    expect(sim.affordableUpgrades().map((upgrade) => upgrade.id)).toEqual(['pop3', 'decor-neon', 'decor-plant']);
    sim.state.popcorn = 50;
    expect(sim.affordableUpgrades()).toEqual([]);
  });

  it('earns the collection achievements for decorations and gold tiers', () => {
    const { sim } = producing();
    sim.state.upgrades.push('decor-neon', 'unit-0-4');
    sim.step(0.1);
    expect(sim.state.legacy.achievements).toEqual(expect.arrayContaining(['decor-first', 'gold-tier']));
    expect(sim.state.legacy.achievements).not.toContain('decor-all');
  });
});

describe('offline earnings', () => {
  const producing = (): Simulation => {
    const { sim } = setup();
    sim.state.owned[0] = 50;
    sim.invalidate();
    return sim;
  };

  it('pays the configured share of production, ignoring any frenzy', () => {
    const sim = producing();
    sim.state.frenzy = 10;
    // Read first: the payout itself may break a stage, which raises the rate afterwards.
    const rate = sim.derived.baseRate;
    const report = sim.applyOffline(1000)!;
    expect(report.gained).toBeCloseTo(rate * OFFLINE.rate * 1000);
  });

  it('stops at the cap', () => {
    const sim = producing();
    const report = sim.applyOffline(30 * 86400)!;
    expect(report.seconds).toBe(OFFLINE.capHours * 3600);
  });

  it('ignores short absences, rolled-back clocks and invalid values', () => {
    const sim = producing();
    expect(sim.applyOffline(10)).toBeNull();
    expect(sim.applyOffline(-500)).toBeNull();
    expect(sim.applyOffline(Number.NaN)).toBeNull();
    expect(elapsedSince(5000, 1000)).toBe(0);
    expect(elapsedSince(0, 9000)).toBe(0);
    expect(elapsedSince(1000, 61_000)).toBe(60);
  });
});

describe('saves', () => {
  const sample = (): ReturnType<typeof createState> => {
    const state = createState();
    state.popcorn = 1234.5;
    state.totalEarned = 98765;
    state.owned = [12, 3, 1, 0, 0, 0, 0, 0, 0, 0, 7, 2, 0, 0, 0];
    state.flavors = 4;
    state.upgrades = ['pop3', 'unit-0-1', 'golden1', 'decor-neon'];
    state.stage = 2;
    state.hopperSwarm = 1;
    state.hopperSwarmSize = 3;
    state.stats.goldenPops = 9;
    state.stats.pokes = 4;
    state.legacy.achievements = ['first-pop'];
    state.legacy.found = ['egg-clock'];
    return state;
  };

  it('round-trips without loss', () => {
    const state = sample();
    const result = parseSave(serializeSave(state));
    expect(result).toMatchObject({ ok: true, migratedFrom: null });
    if (result.ok) expect(result.state).toEqual(state);
  });

  const wrap = (raw: unknown): string => {
    const body = JSON.stringify(raw);
    return JSON.stringify({ format: 'pop-popcorn-save', version: 1, sum: checksum(body), body });
  };

  it('starts a version 1 prototype save over, keeping its lifetime total', () => {
    const result = parseSave(wrap({ version: 1, popcorn: 500, totalEarned: 800, owned: [3, 0, 0, 0, 0, 0], clicks: 90 }));
    expect(result).toMatchObject({ ok: true, migratedFrom: 1 });
    expect(migrationResetsRun(1)).toBe(true);
    if (result.ok) {
      expect(result.state.version).toBe(4);
      expect(result.state.popcorn).toBe(0);
      expect(result.state.owned).toEqual(PRODUCERS.map(() => 0));
      expect(result.state.legacy.lifetimeEarned).toBe(800);
    }
  });

  it('starts a version 2 run over, keeping what was collected across runs', () => {
    const old = {
      ...createState(),
      version: 2,
      popcorn: 5000,
      totalEarned: 9e9,
      stage: 3,
      owned: [40, 20, 10, 5, 2, 1],
      upgrades: ['pop3'],
      legacy: { runs: 2, lifetimeEarned: 3e10, flavorAlbum: 9, potSkin: 2, achievements: ['first-pop', 'moon'] },
    };
    const result = parseSave(wrap(old));
    expect(result).toMatchObject({ ok: true, migratedFrom: 2 });
    expect(migrationResetsRun(2)).toBe(true);
    if (result.ok) {
      expect(result.state).toMatchObject({ version: 4, popcorn: 0, totalEarned: 0, stage: 0, upgrades: [], ended: false });
      expect(result.state.legacy).toEqual({ ...old.legacy, found: [] });
    }
  });

  it('carries a version 3 run on into version 4, with the new machines at zero', () => {
    // A real version 3 save: ten machines, the old counters, no swarms, no egg album.
    const v3 = {
      version: 3,
      popcorn: 4.2e9,
      totalEarned: 9.5e10,
      owned: [120, 98, 80, 64, 30, 12, 0, 0, 0, 0],
      flavors: 6,
      upgrades: ['pop3', 'pop5', 'unit-0-1', 'unit-0-2', 'syn-pan-microwave', 'auto1', 'cannon-window'],
      stage: 2,
      cannonCooldown: 12,
      hopperTimer: 80,
      hopperVisible: 0,
      hopperId: 7,
      frenzy: 0,
      rng: 123456,
      ended: false,
      stats: { clicks: 5000, pops: 21000, cannonShots: 9, cannonPerfect: 4, cannonOverpressure: 1, perfectStreak: 2, hoppersCaught: 6, hoppersMissed: 1, purchases: 700, spent: 9e10, offlineCollected: 3e8, playSeconds: 1900 },
      legacy: { runs: 1, lifetimeEarned: 2e17, flavorAlbum: 10, potSkin: 1, achievements: ['first-pop', 'moon'] },
      savedAt: 1_700_000_000_000,
    };
    const result = parseSave(wrap(v3));
    expect(result).toMatchObject({ ok: true, migratedFrom: 3 });
    expect(migrationResetsRun(3)).toBe(false);
    if (!result.ok) return;
    const s = result.state;
    expect(s).toMatchObject({ version: 4, popcorn: 4.2e9, totalEarned: 9.5e10, flavors: 6, stage: 2, hopperId: 7, rng: 123456, savedAt: 1_700_000_000_000 });
    expect(s.owned).toEqual([...v3.owned, 0, 0, 0, 0, 0]);
    expect(s.upgrades).toEqual(v3.upgrades);
    expect(s.stats).toEqual({ ...v3.stats, goldenPops: 0, pokes: 0, swarmsCaught: 0 });
    expect(s.legacy).toEqual({ ...v3.legacy, found: [] });
    expect(s).toMatchObject({ hopperSwarm: 0, hopperSwarmSize: 0 });
    // And it plays on: the new kitchen machine is for sale at its first price.
    const { sim } = setup();
    sim.load(s);
    expect(sim.producerUnlocked(11)).toBe(true);
    expect(sim.price(11)).toBe(PRODUCERS[11]!.baseCost);
  });

  it('rejects damaged or foreign data with a specific reason', () => {
    const good = serializeSave(sample());
    expect(parseSave('not json')).toEqual({ ok: false, error: 'not-json' });
    expect(parseSave('{"hello":1}')).toEqual({ ok: false, error: 'wrong-format' });
    const tampered = JSON.parse(good) as { body: string };
    tampered.body = tampered.body.replace('1234.5', '9999999');
    expect(parseSave(JSON.stringify(tampered))).toEqual({ ok: false, error: 'bad-checksum' });
    const body = JSON.stringify({ ...sample(), version: 99 });
    expect(parseSave(JSON.stringify({ format: 'pop-popcorn-save', version: 99, sum: checksum(body), body }))).toEqual({
      ok: false,
      error: 'future-version',
    });
  });

  it('repairs impossible values instead of trusting them', () => {
    const state = sample() as unknown as Record<string, unknown>;
    state.popcorn = -50;
    state.flavors = 999;
    state.stage = 77;
    state.upgrades = ['pop3', 'pop3', 'no-such-upgrade', 5];
    state.owned = [1.9, 'x', null, -4, 0, 0];
    state.hopperSwarm = 1e9;
    (state.legacy as Record<string, unknown>).found = ['egg-clock', 'egg-clock', 'egg-nowhere', 3];
    const body = JSON.stringify(state);
    const result = parseSave(JSON.stringify({ format: 'pop-popcorn-save', version: 4, sum: checksum(body), body }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.popcorn).toBe(0);
      expect(result.state.flavors).toBe(12);
      expect(result.state.stage).toBe(5);
      expect(result.state.upgrades).toEqual(['pop3']);
      expect(result.state.owned).toEqual([1, 0, 0, 0, ...PRODUCERS.slice(4).map(() => 0)]);
      expect(result.state.hopperSwarm).toBeLessThanOrEqual(12);
      expect(result.state.legacy.found).toEqual(['egg-clock']);
    }
  });
});

describe('new game plus', () => {
  it('needs a finished run, then keeps the album, achievements and bonus', () => {
    const { sim } = setup();
    expect(sim.restartRun()).toBe(false);
    sim.state.ended = true;
    sim.state.flavors = 9;
    sim.state.legacy.flavorAlbum = 9;
    sim.state.legacy.achievements = ['first-pop'];
    sim.state.legacy.found = ['egg-moon'];
    sim.state.owned[0] = 40;
    sim.state.totalEarned = 2e10;
    expect(sim.restartRun()).toBe(true);
    expect(sim.state.totalEarned).toBe(0);
    expect(sim.state.owned[0]).toBe(0);
    expect(sim.state.legacy).toMatchObject({ runs: 1, flavorAlbum: 9, achievements: ['first-pop'], potSkin: 1, found: ['egg-moon'] });
    sim.state.owned[0] = 10;
    sim.invalidate();
    expect(sim.perSecond).toBeCloseTo((POT.idleRate + 10 * 0.5) * 1.25);
  });
});

describe('balance gates', () => {
  const reports = BOT_PROFILES.map((profile) => runBot(profile));
  const [active, idle] = reports;

  it('hits every stage within 15% for the active player', () => {
    [1.5, 10, 35, 85, 150].forEach((target, index) => {
      expect(Math.abs(active!.stageMinutes[index]! - target)).toBeLessThanOrEqual(target * 0.15);
    });
  });

  it('keeps waits short', () => {
    expect(active!.longestWaitMinutes).toBeLessThanOrEqual(2);
    expect(idle!.longestWaitMinutes).toBeLessThanOrEqual(5);
  });

  it('lets a player who never clicks finish in about three and a half hours', () => {
    expect(idle!.finished).toBe(true);
    expect(idle!.endMinutes).toBeLessThanOrEqual(210);
  });

  it('reaches numbers in the tens of quadrillions', () => {
    expect(active!.total).toBeGreaterThanOrEqual(3e16);
    expect(active!.total).toBeLessThanOrEqual(3e17);
  });

  it('lets every player type finish, buying all fifteen units until late', () => {
    for (const report of reports) {
      expect(report.finished).toBe(true);
      report.owned.forEach((count) => expect(count).toBeGreaterThan(0));
      // No unit may be abandoned early: each is still being bought in the last 40% of the run.
      report.lastBought.forEach((minute) => expect(minute).toBeGreaterThan(report.endMinutes * 0.6));
    }
  });

  it('gets the player buying within seconds, and into a second machine within 45', () => {
    expect(active!.firstPurchaseSeconds).toBeLessThanOrEqual(5);
    expect(active!.secondKindSeconds).toBeLessThanOrEqual(45);
    const gaps = [...active!.purchaseGapsEarly].sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length / 2)]!).toBeLessThanOrEqual(10);
  });
});

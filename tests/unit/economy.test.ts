import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../../src/content/achievements.ts';
import { FLAVORS } from '../../src/content/flavors.ts';
import { PRODUCERS } from '../../src/content/producers.ts';
import { CANNON, HOPPER, OFFLINE } from '../../src/content/skills.ts';
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
import { checksum, elapsedSince, parseSave, serializeSave } from '../../src/sim/save.ts';
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
    expect(PRODUCERS).toHaveLength(6);
    expect(FLAVORS).toHaveLength(12);
    expect(STAGES).toHaveLength(5);
    expect(ACHIEVEMENTS).toHaveLength(24);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(18);
    expect(UPGRADES.length).toBeLessThanOrEqual(24);
  });

  it('uses unique ids and resolvable prerequisites', () => {
    const ids = new Set(UPGRADES.map((upgrade) => upgrade.id));
    expect(ids.size).toBe(UPGRADES.length);
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENTS.length);
    for (const upgrade of UPGRADES) if (upgrade.requires) expect(ids.has(upgrade.requires)).toBe(true);
  });
});

describe('prices', () => {
  it('follows base × 1.15^owned', () => {
    expect(producerPrice(0, 0)).toBe(15);
    expect(producerPrice(0, 1)).toBe(18);
    expect(producerPrice(0, 10)).toBe(Math.ceil(15 * 1.15 ** 10));
  });

  it('sums bulk purchases exactly and agrees with the affordability check', () => {
    expect(bulkPrice(0, 0, 3)).toBe(15 + 18 + 20);
    const budget = bulkPrice(1, 4, 10);
    expect(affordableCount(1, 4, budget)).toBe(10);
    expect(affordableCount(1, 4, budget - 1)).toBe(9);
  });

  it('prices flavors at 300 × 4^n', () => {
    expect(flavorPrice(0)).toBe(300);
    expect(flavorPrice(3)).toBe(300 * 64);
  });
});

describe('multipliers', () => {
  it('doubles at 25, 50, 100 and then every 50', () => {
    expect([24, 25, 49, 50, 99, 100, 149, 150, 200].map(milestoneCount)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
  });

  it('applies milestones and flavors to production', () => {
    const state = createState();
    state.owned[0] = 25;
    expect(derive(state).baseRate).toBeCloseTo(25 * 0.2 * 2);
    state.flavors = 2;
    expect(derive(state).baseRate).toBeCloseTo(25 * 0.2 * 2 * 1.4 ** 2);
  });

  it('adds click upgrades without multiplying the production share', () => {
    const { sim } = setup();
    sim.state.owned[1] = 10;
    sim.invalidate();
    const rate = sim.perSecond;
    expect(sim.clickValue).toBeCloseTo(1 + rate * 0.01);
    sim.state.upgrades.push('pop3');
    sim.invalidate();
    expect(sim.clickValue).toBeCloseTo(3 + rate * 0.01);
    const { count, gainEach } = sim.click();
    expect(count).toBe(3);
    expect(gainEach * count).toBeCloseTo(3 + rate * 0.01);
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
    expect(sim.state.popcorn).toBe(85);
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
    rich(sim, 1e18);
    for (let i = 0; i < 20; i += 1) sim.buyFlavor();
    expect(sim.state.flavors).toBe(12);
    expect(sim.nextFlavorPrice).toBeNull();
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
    state.owned = [12, 3, 1, 0, 0, 0];
    state.flavors = 4;
    state.upgrades = ['pop3', 'pan2'];
    state.stage = 2;
    state.legacy.achievements = ['first-pop'];
    return state;
  };

  it('round-trips without loss', () => {
    const state = sample();
    const result = parseSave(serializeSave(state));
    expect(result).toMatchObject({ ok: true, migratedFrom: null });
    if (result.ok) expect(result.state).toEqual(state);
  });

  it('migrates a version 1 prototype save', () => {
    const body = JSON.stringify({ version: 1, popcorn: 500, totalEarned: 800, owned: [3, 0, 0, 0, 0, 0], clicks: 90 });
    const text = JSON.stringify({ format: 'pop-popcorn-save', version: 1, sum: checksum(body), body });
    const result = parseSave(text);
    expect(result).toMatchObject({ ok: true, migratedFrom: 1 });
    if (result.ok) {
      expect(result.state.version).toBe(2);
      expect(result.state.popcorn).toBe(500);
      expect(result.state.owned[0]).toBe(3);
      expect(result.state.stats.clicks).toBe(90);
      expect(result.state.legacy.lifetimeEarned).toBe(800);
    }
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
    const body = JSON.stringify(state);
    const result = parseSave(JSON.stringify({ format: 'pop-popcorn-save', version: 2, sum: checksum(body), body }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.popcorn).toBe(0);
      expect(result.state.flavors).toBe(12);
      expect(result.state.stage).toBe(5);
      expect(result.state.upgrades).toEqual(['pop3']);
      expect(result.state.owned.slice(0, 4)).toEqual([1, 0, 0, 0]);
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
    sim.state.owned[0] = 40;
    sim.state.totalEarned = 2e10;
    expect(sim.restartRun()).toBe(true);
    expect(sim.state.totalEarned).toBe(0);
    expect(sim.state.owned[0]).toBe(0);
    expect(sim.state.legacy).toMatchObject({ runs: 1, flavorAlbum: 9, achievements: ['first-pop'], potSkin: 1 });
    sim.state.owned[0] = 10;
    sim.invalidate();
    expect(sim.perSecond).toBeCloseTo(10 * 0.2 * 1.25);
  });
});

describe('balance gates', () => {
  const reports = BOT_PROFILES.map((profile) => runBot(profile));
  const [active, idle] = reports;

  it('hits every stage within 20% for the active player', () => {
    [3, 12, 35, 80, 150].forEach((target, index) => {
      expect(Math.abs(active!.stageMinutes[index]! - target)).toBeLessThanOrEqual(target * 0.2);
    });
  });

  it('keeps waits short', () => {
    expect(active!.longestWaitMinutes).toBeLessThanOrEqual(3);
    expect(idle!.longestWaitMinutes).toBeLessThanOrEqual(5);
  });

  it('lets every player type finish, buying all six units until late', () => {
    for (const report of reports) {
      expect(report.finished).toBe(true);
      report.owned.forEach((count) => expect(count).toBeGreaterThan(0));
      // No unit may be abandoned early: each is still being bought in the last 40% of the run.
      report.lastBought.forEach((minute) => expect(minute).toBeGreaterThan(report.endMinutes * 0.6));
    }
  });

  it('gives a first purchase and a first automatic unit within a minute', () => {
    expect(active!.firstPurchaseSeconds).toBeLessThanOrEqual(60);
    expect(active!.firstUnitSeconds).toBeLessThanOrEqual(60);
  });
});

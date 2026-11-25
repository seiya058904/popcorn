import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/events/bus.ts';
import type { GameEvents } from '../../src/events/game-events.ts';
import { SaveManager } from '../../src/platform/saves.ts';
import { memoryStore, type KeyValueStore } from '../../src/platform/storage.ts';
import { checksum } from '../../src/sim/save.ts';
import { createState } from '../../src/sim/state.ts';
import { Simulation } from '../../src/sim/simulation.ts';

const T0 = 1_800_000_000_000;

function session(store: KeyValueStore): { sim: Simulation; saves: SaveManager } {
  const sim = new Simulation(new EventBus<GameEvents>());
  return { sim, saves: new SaveManager(sim, store) };
}

/** A store whose regular writes never land, like a page killed mid-save. */
function dyingStore(store: KeyValueStore): KeyValueStore {
  return {
    read: (slot) => store.read(slot),
    write: () => new Promise(() => undefined),
    remove: (slot) => store.remove(slot),
    writeRescue: (text) => store.writeRescue(text),
    readRescue: () => store.readRescue(),
    clearRescue: () => store.clearRescue(),
  };
}

describe('saving as the page goes away', () => {
  it('keeps progress even if the regular write never finishes', async () => {
    const store = memoryStore();
    const first = session(store);
    first.sim.state.popcorn = 10;
    await first.saves.save(T0);
    const leaving = session(dyingStore(store));
    leaving.sim.state.popcorn = 99;
    leaving.saves.saveForExit(T0 + 1000);
    const next = session(store);
    await next.saves.load(T0 + 1000);
    expect(next.sim.state.popcorn).toBe(99);
  });

  it('drops the copy once the regular save has landed', async () => {
    const store = memoryStore();
    const { sim, saves } = session(store);
    sim.state.popcorn = 5;
    saves.saveForExit(T0);
    expect(store.readRescue()).not.toBeNull();
    await saves.save(T0);
    expect(store.readRescue()).toBeNull();
  });

  it('ignores a copy older than the main save', async () => {
    const store = memoryStore();
    const old = session(store);
    old.sim.state.popcorn = 1;
    old.saves.saveForExit(T0);
    const stale = store.readRescue()!;
    const current = session(store);
    current.sim.state.popcorn = 50;
    await current.saves.save(T0 + 5000);
    store.writeRescue(stale);
    const next = session(store);
    await next.saves.load(T0 + 5000);
    expect(next.sim.state.popcorn).toBe(50);
  });

  it('says whether an older save kept its run or had to start over', async () => {
    const wrap = (raw: object): string => {
      const body = JSON.stringify(raw);
      return JSON.stringify({ format: 'pop-popcorn-save', version: (raw as { version: number }).version, sum: checksum(body), body });
    };
    const v3 = { ...createState(), version: 3, owned: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0], totalEarned: 500, savedAt: T0 };
    const kept = memoryStore();
    await kept.write('main', wrap(v3));
    const carried = session(kept);
    expect(await carried.saves.load(T0)).toMatchObject({ source: 'main', migrated: false, upgraded: true, converted: { rungs: 0, refunded: 0 } });
    expect(carried.sim.state.owned[0]).toBe(5);

    const reset = memoryStore();
    await reset.write('main', wrap({ ...v3, version: 2 }));
    expect(await session(reset).saves.load(T0)).toMatchObject({ migrated: true, upgraded: false, converted: null });

    const current = memoryStore();
    await session(current).saves.save(T0);
    expect(await session(current).saves.load(T0)).toMatchObject({ migrated: false, upgraded: false, converted: null });
  });

  it('after a stall, pays only for the time the game was not running, not again for what it already played', async () => {
    const { sim, saves } = session(memoryStore());
    sim.state.owned[0] = 40;
    sim.invalidate();
    await saves.save(T0);
    // The game played on for 25 seconds after that save, then the machine slept for ten minutes.
    const report = saves.resume(T0 + 25_000 + 600_000, T0 + 25_000)!;
    expect(report.seconds).toBeCloseTo(600);
    // Without a later frame to go by, the last save is all there is.
    await saves.save(T0);
    expect(saves.resume(T0 + 600_000)!.seconds).toBeCloseTo(600);
  });

  it('a wipe removes the copy too', async () => {
    const store = memoryStore();
    const { saves } = session(store);
    saves.saveForExit(T0);
    saves.disable();
    await saves.wipe();
    expect(store.readRescue()).toBeNull();
    saves.saveForExit(T0 + 1);
    expect(store.readRescue()).toBeNull();
  });
});

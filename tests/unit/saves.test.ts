import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/events/bus.ts';
import type { GameEvents } from '../../src/events/game-events.ts';
import { SaveManager } from '../../src/platform/saves.ts';
import { memoryStore, type KeyValueStore } from '../../src/platform/storage.ts';
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

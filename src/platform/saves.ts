import { elapsedSince, parseSave, serializeSave, type LoadError } from '../sim/save.ts';
import type { OfflineReport, Simulation } from '../sim/simulation.ts';
import type { KeyValueStore } from './storage.ts';

const AUTOSAVE_SECONDS = 30;
/** The backup slot is refreshed every few saves, so one bad write cannot take both copies. */
const BACKUP_EVERY = 4;

export interface LoadOutcome {
  source: 'new' | 'main' | 'backup';
  /** The main save existed but could not be used. */
  recovered: boolean;
  offline: OfflineReport | null;
}

export class SaveManager {
  private readonly sim: Simulation;
  private readonly store: KeyValueStore;
  private timer = AUTOSAVE_SECONDS;
  private saves = 0;
  private writing: Promise<void> = Promise.resolve();

  constructor(sim: Simulation, store: KeyValueStore) {
    this.sim = sim;
    this.store = store;
  }

  async load(now = Date.now()): Promise<LoadOutcome> {
    const main = await this.store.read('main');
    if (main !== null) {
      const parsed = parseSave(main);
      if (parsed.ok) {
        this.sim.load(parsed.state);
        return { source: 'main', recovered: false, offline: this.collectOffline(now) };
      }
    }
    const backup = await this.store.read('backup');
    if (backup !== null) {
      const parsed = parseSave(backup);
      if (parsed.ok) {
        this.sim.load(parsed.state);
        return { source: 'backup', recovered: main !== null, offline: this.collectOffline(now) };
      }
    }
    return { source: 'new', recovered: main !== null, offline: null };
  }

  private collectOffline(now: number): OfflineReport | null {
    return this.sim.applyOffline(elapsedSince(this.sim.state.savedAt, now));
  }

  /** Credits time spent suspended or in a background tab, and restarts the absence clock. */
  resume(now = Date.now()): OfflineReport | null {
    const report = this.collectOffline(now);
    this.sim.state.savedAt = now;
    return report;
  }

  tick(deltaSeconds: number): void {
    this.timer -= deltaSeconds;
    if (this.timer <= 0) void this.save();
  }

  /** Saves are chained, so a slow write can never finish after a newer one. */
  save(now = Date.now()): Promise<void> {
    this.timer = AUTOSAVE_SECONDS;
    this.sim.state.savedAt = now;
    const text = serializeSave(this.sim.state);
    this.saves += 1;
    const refreshBackup = this.saves % BACKUP_EVERY === 1;
    this.writing = this.writing
      .then(async () => {
        await this.store.write('main', text);
        if (refreshBackup) await this.store.write('backup', text);
      })
      .catch((error: unknown) => console.warn('Save failed', error));
    return this.writing;
  }

  exportText(): string {
    this.sim.state.savedAt = Date.now();
    return serializeSave(this.sim.state);
  }

  async importText(text: string): Promise<LoadError | null> {
    const parsed = parseSave(text.trim());
    if (!parsed.ok) return parsed.error;
    this.sim.load(parsed.state);
    await this.save();
    return null;
  }

  async wipe(): Promise<void> {
    await this.writing;
    await this.store.remove('main');
    await this.store.remove('backup');
  }
}

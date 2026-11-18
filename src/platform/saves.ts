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
  private enabled = true;

  constructor(sim: Simulation, store: KeyValueStore) {
    this.sim = sim;
    this.store = store;
  }

  async load(now = Date.now()): Promise<LoadOutcome> {
    const main = await this.store.read('main');
    const parsedMain = main === null ? null : parseSave(main);
    // A rescue copy only exists when the last regular save may not have finished.
    const rescueText = this.store.readRescue();
    const rescue = rescueText === null ? null : parseSave(rescueText);
    if (rescue?.ok && (!parsedMain?.ok || rescue.state.savedAt >= parsedMain.state.savedAt)) {
      this.sim.load(rescue.state);
      return { source: 'main', recovered: false, offline: this.collectOffline(now) };
    }
    if (parsedMain?.ok) {
      this.sim.load(parsedMain.state);
      return { source: 'main', recovered: false, offline: this.collectOffline(now) };
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
    const report = this.sim.applyOffline(elapsedSince(this.sim.state.savedAt, now));
    // Restart the absence clock, so the same time away can never be paid twice.
    if (now > this.sim.state.savedAt) this.sim.state.savedAt = now;
    return report;
  }

  /** Credits time spent suspended or in a background tab, and restarts the absence clock. */
  resume(now = Date.now()): OfflineReport | null {
    const report = this.collectOffline(now);
    // A clock that jumped backward also restarts here, so play is not lost to it later.
    this.sim.state.savedAt = now;
    return report;
  }

  tick(deltaSeconds: number): void {
    this.timer -= deltaSeconds;
    if (this.timer <= 0) void this.save();
  }

  /** Saves are chained, so a slow write can never finish after a newer one. */
  save(now = Date.now()): Promise<void> {
    if (this.enabled) this.enqueue(now);
    return this.writing;
  }

  /** For a page being hidden or closed: the regular save may be cut off, so keep a copy too. */
  saveForExit(now = Date.now()): void {
    if (this.enabled) this.store.writeRescue(this.enqueue(now));
  }

  private enqueue(now: number): string {
    this.timer = AUTOSAVE_SECONDS;
    this.sim.state.savedAt = now;
    const text = serializeSave(this.sim.state);
    this.saves += 1;
    const refreshBackup = this.saves % BACKUP_EVERY === 1;
    this.writing = this.writing
      .then(async () => {
        await this.store.write('main', text);
        if (refreshBackup) await this.store.write('backup', text);
        // The copy has served its purpose, unless a newer one was made in the meantime.
        if (this.store.readRescue() === text) this.store.clearRescue();
      })
      .catch((error: unknown) => console.warn(`Save failed: ${String(error)}`));
    return text;
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

  /** Stops all writing, so a wipe cannot be undone by the save on page unload. */
  disable(): void {
    this.enabled = false;
  }

  async wipe(): Promise<void> {
    await this.writing;
    await this.store.remove('main');
    await this.store.remove('backup');
    this.store.clearRescue();
  }
}

const DB_NAME = 'pop-popcorn';
const STORE = 'saves';
const FALLBACK_PREFIX = 'pop-popcorn:';
const RESCUE_KEY = `${FALLBACK_PREFIX}rescue`;

export type SaveSlot = 'main' | 'backup' | 'settings';

export interface KeyValueStore {
  read(slot: SaveSlot): Promise<string | null>;
  write(slot: SaveSlot, text: string): Promise<void>;
  remove(slot: SaveSlot): Promise<void>;
  /** A synchronous copy for a page going away, when an asynchronous write may never finish. */
  writeRescue(text: string): void;
  readRescue(): string | null;
  clearRescue(): void;
}

/** Storage can be blocked at any moment, and none of these calls may ever throw. */
const browserRescue = {
  writeRescue(text: string): void {
    try {
      localStorage.setItem(RESCUE_KEY, text);
    } catch {
      // Without storage there is nowhere left to put it.
    }
  },
  readRescue(): string | null {
    try {
      return localStorage.getItem(RESCUE_KEY);
    } catch {
      return null;
    }
  },
  clearRescue(): void {
    try {
      localStorage.removeItem(RESCUE_KEY);
    } catch {
      // Nothing could have been stored either.
    }
  },
};

class IndexedDbStore implements KeyValueStore {
  readonly writeRescue = browserRescue.writeRescue;
  readonly readRescue = browserRescue.readRescue;
  readonly clearRescue = browserRescue.clearRescue;
  private db: Promise<IDBDatabase> | null = null;

  private connect(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        // The browser may close the connection at any time; the next save reopens it.
        request.result.onclose = () => (this.db = null);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open'));
    });
    return this.db;
  }

  private async attempt<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    try {
      return await this.attempt(mode, action);
    } catch (error) {
      this.db = null;
      if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
      return this.attempt(mode, action);
    }
  }

  async read(slot: SaveSlot): Promise<string | null> {
    const value = await this.run<unknown>('readonly', (store) => store.get(slot));
    return typeof value === 'string' ? value : null;
  }

  async write(slot: SaveSlot, text: string): Promise<void> {
    await this.run('readwrite', (store) => store.put(text, slot));
  }

  async remove(slot: SaveSlot): Promise<void> {
    await this.run('readwrite', (store) => store.delete(slot));
  }
}

class LocalStorageStore implements KeyValueStore {
  readonly writeRescue = browserRescue.writeRescue;
  readonly readRescue = browserRescue.readRescue;
  readonly clearRescue = browserRescue.clearRescue;

  async read(slot: SaveSlot): Promise<string | null> {
    return localStorage.getItem(FALLBACK_PREFIX + slot);
  }

  async write(slot: SaveSlot, text: string): Promise<void> {
    localStorage.setItem(FALLBACK_PREFIX + slot, text);
  }

  async remove(slot: SaveSlot): Promise<void> {
    localStorage.removeItem(FALLBACK_PREFIX + slot);
  }
}

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<SaveSlot, string>();
  private rescue: string | null = null;

  writeRescue(text: string): void {
    this.rescue = text;
  }

  readRescue(): string | null {
    return this.rescue;
  }

  clearRescue(): void {
    this.rescue = null;
  }

  async read(slot: SaveSlot): Promise<string | null> {
    return this.values.get(slot) ?? null;
  }

  async write(slot: SaveSlot, text: string): Promise<void> {
    this.values.set(slot, text);
  }

  async remove(slot: SaveSlot): Promise<void> {
    this.values.delete(slot);
  }
}

/** IndexedDB, then localStorage, then memory: private windows may block the first two. */
export async function openStore(): Promise<KeyValueStore> {
  try {
    const store = new IndexedDbStore();
    await store.read('settings');
    return store;
  } catch {
    try {
      localStorage.setItem(`${FALLBACK_PREFIX}probe`, '1');
      localStorage.removeItem(`${FALLBACK_PREFIX}probe`);
      return new LocalStorageStore();
    } catch {
      return new MemoryStore();
    }
  }
}

export function memoryStore(): KeyValueStore {
  return new MemoryStore();
}

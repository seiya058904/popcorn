const DB_NAME = 'pop-popcorn';
const STORE = 'saves';
const FALLBACK_PREFIX = 'pop-popcorn:';

export type SaveSlot = 'main' | 'backup' | 'settings';

export interface KeyValueStore {
  read(slot: SaveSlot): Promise<string | null>;
  write(slot: SaveSlot, text: string): Promise<void>;
  remove(slot: SaveSlot): Promise<void>;
}

class IndexedDbStore implements KeyValueStore {
  private readonly db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open'));
    });
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
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

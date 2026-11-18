export type Listener<T> = (payload: T) => void;

/** Synchronous typed event bus. Emitting during an emit is allowed; listeners added mid-emit wait for the next one. */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Listener<never>[]>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const current = this.listeners.get(type) ?? [];
    // Copy on write keeps an in-progress emit stable.
    this.listeners.set(type, [...current, listener as Listener<never>]);
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    const current = this.listeners.get(type);
    if (!current) return;
    this.listeners.set(
      type,
      current.filter((candidate) => candidate !== (listener as Listener<never>)),
    );
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const current = this.listeners.get(type);
    if (!current) return;
    for (const listener of current) (listener as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

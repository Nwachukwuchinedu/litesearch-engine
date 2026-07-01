// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — LRU Query Cache
// ─────────────────────────────────────────────────────────────────────────────

export class LRUCache<K, V> {
  private capacity: number;
  private ttl: number;
  private cache: Map<K, { value: V; expires: number }>;

  constructor(capacity: number = 1000, ttlMs: number = 30000) {
    this.capacity = capacity;
    this.ttl = ttlMs;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // If at capacity, evict oldest (first key from Map iterator)
    if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) {
        this.cache.delete(oldest.value);
      }
    }

    this.cache.set(key, { value, expires: Date.now() + this.ttl });
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

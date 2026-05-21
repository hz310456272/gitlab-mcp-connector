import type { ToolOutput } from "../tools/helpers.js";

interface CacheEntry {
  result: ToolOutput;
  timestamp: number;
}

/**
 * Simple djb2 hash — fast, non-cryptographic.
 * Collision probability is negligible for dedup keys.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Sliding-window dedup cache for write operations.
 *
 * Prevents LLM agents from issuing duplicate POST requests within
 * the TTL window (default 30 s). Entries are keyed by
 * (toolName + path + bodyHash).
 */
export class DedupWindow {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = 30000,
    private readonly maxEntries: number = 100,
  ) {}

  /**
   * Build a dedup key from the operation identity.
   * Same (toolName, path, body) always produces the same key.
   */
  generateKey(
    toolName: string,
    path: string,
    body: Record<string, unknown>,
  ): string {
    return `${toolName}:${path}:${simpleHash(JSON.stringify(body))}`;
  }

  /**
   * Return the cached result for `key`, or `undefined` if
   * not cached or TTL has expired.
   */
  get(key: string): ToolOutput | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.result;
  }

  /**
   * Store a successful result. If the cache is at maxEntries,
   * expired entries are evicted first.
   */
  set(key: string, result: ToolOutput): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictExpired();
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  /** Remove all entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

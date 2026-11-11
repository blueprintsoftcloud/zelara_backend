// src/utils/cache.ts
//
// In-process, in-memory cache for expensive, frequently-read, infrequently-written data —
// the storefront's public banners/homepage config/category list, all fetched on nearly
// every page load and previously hitting MongoDB every single time.
//
// Correctness over cleverness: every cached value carries a short TTL (default 60s) as
// the backstop. Call sites also invalidate explicitly on the writes they know about,
// but the TTL is what guarantees staleness is bounded even if some write path is missed.

const DEFAULT_TTL_SECONDS = 60;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/**
 * Returns the cached value for `key` if present and unexpired, otherwise computes it
 * via `fn`, caches it, and returns it.
 */
export const getCached = async <T>(key: string, fn: () => Promise<T>, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<T> => {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
};

export const invalidateCache = async (key: string): Promise<void> => {
  store.delete(key);
};

// Periodic sweep so keys that are set once and never re-read don't accumulate
// indefinitely. Cheap — this is a handful of keys in practice (single-controller usage).
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 5 * 60_000).unref();

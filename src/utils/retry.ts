// src/utils/retry.ts
// Small in-process retry-with-backoff helper — the replacement for BullMQ's
// defaultJobOptions.attempts/backoff now that background work runs in-process
// instead of through a Redis-backed queue.

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry, in ms. Default 1000. */
  baseDelayMs?: number;
  /** "exponential" doubles the delay each retry; "fixed" repeats the same delay. Default "exponential". */
  backoff?: "exponential" | "fixed";
  /** Included in nothing automatically — callers log it themselves on final failure. */
  label?: string;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, backoff = "exponential" } = opts;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) break;
      const delay = backoff === "exponential" ? baseDelayMs * 2 ** (attempt - 1) : baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastErr;
}

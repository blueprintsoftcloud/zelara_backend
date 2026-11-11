// src/utils/logContext.ts
//
// Request-scoped logging context (correlation id, actor id), propagated via
// AsyncLocalStorage. utils/logger.ts reads this on every log call and merges it into
// the log entry automatically — so every logger.info/warn/error() call across the app
// carries a request id without having to pass it in manually.

import { AsyncLocalStorage } from "async_hooks";

export interface LogContext {
  requestId?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export const runWithLogContext = <T>(ctx: LogContext, fn: () => T): T => {
  const existing = storage.getStore();
  return storage.run({ ...existing, ...ctx }, fn);
};

/** Merges additional fields into the current request's log context (e.g. once auth resolves req.user). */
export const extendLogContext = (fields: LogContext): void => {
  const existing = storage.getStore();
  if (existing) Object.assign(existing, fields);
};

export const getLogContext = (): LogContext | undefined => storage.getStore();

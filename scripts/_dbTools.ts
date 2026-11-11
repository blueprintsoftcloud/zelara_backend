// scripts/_dbTools.ts
// Shared connection-string helpers for backup.ts / restore.ts / restoreDrill.ts / cloneDatabase.ts.

export const dbNameFromUri = (uri: string): string => {
  const match = uri.match(/^([a-z0-9+]+:\/\/[^/]+)(?:\/([^?]*))?(\?.*)?$/i);
  return match && match[2] ? match[2] : "test";
};

/** Swaps the database name segment of a Mongo connection string for a different one. */
export const withDbName = (uri: string, newDbName: string): string => {
  const match = uri.match(/^([a-z0-9+]+:\/\/[^/]+)(?:\/([^?]*))?(\?.*)?$/i);
  if (!match) return uri;
  const prefix = match[1];
  const query = match[3] || "";
  return `${prefix}/${newDbName}${query}`;
};


// src/middleware/sanitize.middleware.ts
//
// NoSQL injection guard. Mongoose's Prisma-compatibility bridge (config/prisma.ts)
// passes `where`/`data` objects fairly directly into Mongo filter/update documents —
// if a client sends `{ "password": { "$ne": null } }` or a key like `"$where"` in a
// JSON body, nothing upstream of this middleware previously stripped it before it
// reached a query. This walks req.body/query/params and removes any object key that
// starts with "$" or contains "." (both are Mongo operator/path-injection vectors),
// recursively, so a malicious operator can never reach a query already scoped by
// legitimate application filters.
//
// Mutates objects in place (never reassigns req.query/req.params) — Express 5 exposes
// req.query as a getter-only property on some configurations, so reassignment would throw.

import { Request, Response, NextFunction } from "express";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sanitizeInPlace = (obj: unknown, depth = 0): void => {
  if (depth > 10 || !isPlainObject(obj)) return;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    const value = obj[key];
    if (isPlainObject(value)) {
      sanitizeInPlace(value, depth + 1);
    } else if (Array.isArray(value)) {
      for (const item of value) sanitizeInPlace(item, depth + 1);
    }
  }
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.query);
  sanitizeInPlace(req.params);
  next();
};

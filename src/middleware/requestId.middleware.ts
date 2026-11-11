// src/middleware/requestId.middleware.ts
//
// Stamps every request with a correlation id — either the caller-supplied
// `X-Request-Id` (useful when the frontend or an upstream proxy already generates
// one) or a freshly generated one. Exposed as `req.requestId`, echoed back as a
// response header, and attached to the AsyncLocalStorage log context (see
// utils/logContext.ts) so every log line written during this request — including
// ones deep inside controllers/services that have no access to `req` — carries it
// without being threaded through every function signature.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { runWithLogContext } from "../utils/logContext";

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers["x-request-id"];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  runWithLogContext({ requestId: id }, () => next());
};

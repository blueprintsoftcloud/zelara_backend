// src/middleware/optionalAuth.middleware.ts
// Tries to verify the JWT but never blocks the request.
// Used on routes like /auth/status where both authenticated and guest users are allowed.
// Sets req.user = undefined (not null) if no token / invalid token.

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface JwtPayload {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";
}

export const optionalAuthMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const token = req.cookies?.jwt as string | undefined;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = decoded;
    } catch {
      req.user = undefined;
    }
  }

  next();
};

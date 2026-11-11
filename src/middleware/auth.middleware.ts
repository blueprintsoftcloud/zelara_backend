// src/middleware/auth.middleware.ts
// Verifies the JWT access token from the HttpOnly cookie.
// Sets req.user = { id, email, role } on success.
// Returns 401 on missing or invalid token, with an 'expired' flag for the frontend interceptor.

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, StaffProfile } from "../models/mongoose";
import { env } from "../config/env";
import logger from "../utils/logger";

interface JwtPayload {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN" | "STAFF";
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.cookies?.jwt as string | undefined;

  if (!token) {
    res.status(401).json({ message: "Access Denied. No token provided." });
    return;
  }

  try {
    // 1. Mathematically verify the JWT (Stateless check)
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // 2. Strict Access Revocation (Stateful check for internal roles)
    if (decoded.role === "STAFF") {
      const staffProfile = await StaffProfile.findOne({ userId: decoded.id }).lean();
      
      // If profile is deleted OR explicitly marked inactive, kill the session
      if (!staffProfile || staffProfile.isActive === false) {
        logger.warn(`Auth blocked: Deactivated staff member attempted access`, { userId: decoded.id });
        res.status(401).json({ 
          message: "Your account has been deactivated. Please contact your administrator.",
          expired: true // Tell FE to wipe cookies and redirect
        });
        return;
      }
    } 
    else if (decoded.role === "ADMIN") {
      // For Admins, we verify the user document still exists (in case of hard delete by Super Admin)
      const userExists = await User.exists({ _id: decoded.id });
      if (!userExists) {
        logger.warn(`Auth blocked: Deleted admin attempted access`, { userId: decoded.id });
        res.status(401).json({ 
          message: "This account no longer exists.",
          expired: true 
        });
        return;
      }
    }

    // 3. Success! Attach user to request and proceed
    req.user = decoded;
    next();
  } catch (err: unknown) {
    const isExpired = err instanceof Error && err.name === "TokenExpiredError";
    res.status(401).json({
      message: isExpired
        ? "Session expired. Please log in again."
        : "Invalid token.",
      expired: isExpired,
    });
  }
};

/**
 * Attaches req.user if a valid token is present in cookies,
 * but does not reject the request if token is missing or expired.
 */
export const optionalAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.cookies?.jwt as string | undefined;
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
  } catch {
    // Ignore invalid/expired token for optional auth
  }
  next();
};

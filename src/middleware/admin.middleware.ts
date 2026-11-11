// src/middleware/admin.middleware.ts
// Must be used AFTER authMiddleware.
// Checks req.user.role === 'ADMIN' or 'SUPER_ADMIN'.
// Returns 403 Forbidden if the user is authenticated but not an admin.

import { Request, Response, NextFunction } from "express";

export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized. Please log in." });
    return;
  }

  if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
    res
      .status(403)
      .json({ message: "Access denied. Admin privileges required." });
    return;
  }

  next();
};

/** Alias — ADMIN or SUPER_ADMIN */
export const adminOrSuperAdmin = adminMiddleware;

/** Allow ADMIN, SUPER_ADMIN or STAFF roles */
export const adminOrStaffMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized. Please log in." });
    return;
  }

  if (
    req.user.role !== "ADMIN" &&
    req.user.role !== "SUPER_ADMIN" &&
    req.user.role !== "STAFF"
  ) {
    res
      .status(403)
      .json({ message: "Access denied. Insufficient privileges." });
    return;
  }

  next();
};


/** Restrict to SUPER_ADMIN only */
export const superAdminOnly = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user || req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Access denied. Super Admin only." });
    return;
  }
  next();
};

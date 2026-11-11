// src/middleware/superAdmin.middleware.ts
// Must be used AFTER authMiddleware.
// Restricts access to SUPER_ADMIN only.
// Admin and Customer both receive 403.

import { Request, Response, NextFunction } from "express";

export const superAdminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized. Please log in." });
    return;
  }

  if (req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Access denied. Super Admin privileges required." });
    return;
  }

  next();
};

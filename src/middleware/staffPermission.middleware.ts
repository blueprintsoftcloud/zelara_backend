// src/middleware/staffPermission.middleware.ts
//
// Factory: adminOrStaff("CATEGORY_EDIT") or adminOrStaff(["ORDER_VIEW", "ORDER_UPDATE"])
//
// Behaviour:
//   - SUPER_ADMIN / ADMIN  → always passes through.
//   - STAFF                → passes if their StaffProfile.permissions contains AT LEAST
//                            ONE of the given key(s) AND their account isActive === true.
//   - Anyone else          → 403.
//
// Use this as a drop-in replacement for adminMiddleware on routes that staff may access.

import { Request, Response, NextFunction } from "express";
import { User } from "../models/mongoose";
import { StaffPermission } from "../config/staffPermissions";

export const adminOrStaff = (permission: StaffPermission | StaffPermission[]) => {
  const required = Array.isArray(permission) ? permission : [permission];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized. Please log in." });
      return;
    }

    const { role, id } = req.user;

    // Admins pass through unconditionally
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      next();
      return;
    }

    if (role === "STAFF") {
      try {
        const profile = await prisma.staffProfile.findUnique({
          where: { userId: id },
          select: { isActive: true, permissions: true },
        });

        if (!profile || !profile.isActive) {
          res.status(403).json({ message: "Staff account is inactive or not found." });
          return;
        }

        if (!required.some((p) => profile.permissions.includes(p))) {
          res.status(403).json({
            message: `You do not have permission to perform this action (${required.join(" or ")}).`,
          });
          return;
        }

        next();
      } catch (err) {
        next(err);
      }
      return;
    }

    // Any other role (CUSTOMER etc.)
    res.status(403).json({ message: "Access denied." });
  };
};

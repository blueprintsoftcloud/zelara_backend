// src/routes/superAdmin.routes.ts
// Routes exclusive to SUPER_ADMIN.

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { superAdminMiddleware } from "../middleware/superAdmin.middleware";
import { getSuperAdminSummary, getAdminUser } from "../controllers/superAdmin.controller";
import { getHealthCheck, getSystemLogs } from "../controllers/systemHealth.controller";

const router = Router();

// ── Super Admin Dashboard
router.get("/summary", authMiddleware, superAdminMiddleware, getSuperAdminSummary);

// ── Admin User Info
router.get("/admin-user", authMiddleware, superAdminMiddleware, getAdminUser);

// ── Monitoring: health, centralized logs (Super Admin only) ────────────────
router.get("/health", authMiddleware, superAdminMiddleware, getHealthCheck);
router.get("/logs", authMiddleware, superAdminMiddleware, getSystemLogs);

export default router;

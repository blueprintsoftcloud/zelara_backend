// src/routes/auditLog.routes.ts

import { Router } from "express";
import { getAuditLogs, clearAuditLogs } from "../controllers/auditLog.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { superAdminMiddleware } from "../middleware/superAdmin.middleware";

const router = Router();

// Both ADMIN and SUPER_ADMIN can read logs
router.get("/", authMiddleware, adminMiddleware, getAuditLogs);

// Only SUPER_ADMIN can wipe them
router.delete("/", authMiddleware, superAdminMiddleware, clearAuditLogs);

export default router;

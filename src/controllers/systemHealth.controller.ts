// src/controllers/systemHealth.controller.ts
// Super-Admin-only monitoring endpoints: deep health check, centralized log viewer,
// and queue stats. All gated by superAdminMiddleware in superAdmin.routes.ts.

import { Request, Response } from "express";
import { SystemLog } from "../models/mongoose";
import { computeSystemHealth } from "../monitoring/health";
import logger from "../utils/logger";

// GET /api/super-admin/health
export const getHealthCheck = async (_req: Request, res: Response) => {
  try {
    const health = await computeSystemHealth();
    const httpStatus = health.status === "unhealthy" ? 503 : 200;
    res.status(httpStatus).json(health);
  } catch (err: any) {
    logger.error("getHealthCheck error", err);
    res.status(500).json({ message: "Error computing system health" });
  }
};

// GET /api/super-admin/logs?level=error&page=1&limit=50
export const getSystemLogs = async (req: Request, res: Response) => {
  try {
    const { level, page = "1", limit = "50" } = req.query as Record<string, string | undefined>;
    const pageSize = Math.min(Math.max(parseInt(limit ?? "50") || 50, 1), 200);
    const skip = (Math.max(parseInt(page ?? "1") || 1, 1) - 1) * pageSize;

    const where = level && level !== "all" ? { level } : {};

    const [logs, total] = await Promise.all([
      SystemLog.find(where).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      SystemLog.countDocuments(where),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: Math.max(parseInt(page ?? "1") || 1, 1),
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    logger.error("getSystemLogs error", err);
    res.status(500).json({ message: "Error fetching system logs" });
  }
};

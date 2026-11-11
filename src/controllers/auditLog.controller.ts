// src/controllers/auditLog.controller.ts

import { Request, Response } from "express";
import { AuditLog } from "../models/mongoose";
import logger from "../utils/logger";

// GET /api/audit-logs?page=1&limit=30&action=&entity=&userId=
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "30",
      action,
      entity,
      userId,
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit ?? "30") || 30, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action.toUpperCase() };
    if (entity) where.entity = { contains: entity, mode: "insensitive" };
    if (userId) where.userId = userId;

    // Admins must not see Super Admin activity
    if (req.user?.role === "ADMIN") {
      where.user = { role: { not: "SUPER_ADMIN" } };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    logger.error("getAuditLogs error", err);
    res.status(500).json({ message: "Error fetching audit logs" });
  }
};

// DELETE /api/audit-logs  (super-admin only — wipe all logs)
export const clearAuditLogs = async (_req: Request, res: Response) => {
  try {
    await prisma.auditLog.deleteMany();
    res.json({ message: "Audit logs cleared" });
  } catch (err: any) {
    logger.error("clearAuditLogs error", err);
    res.status(500).json({ message: "Error clearing audit logs" });
  }
};

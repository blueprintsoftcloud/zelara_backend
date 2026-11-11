// src/utils/auditLog.ts
// Lightweight helper used by controllers to create audit log entries.
// Snapshots the fields it needs off the live Request, then hands the write off to
// services/auditLog.service.ts, which writes in-process/fire-and-forget. Still silently
// swallows errors so audit-log failures never break normal API flow.

import { Request } from "express";
import { recordAuditLog } from "../services/auditLog.service";
import logger from "./logger";

interface AuditLogEntry {
  req: Request;
  action: string;      // e.g. "CREATE_COUPON"
  entity: string;      // e.g. "Coupon"
  entityId?: string;
  details?: Record<string, unknown>;
}

export async function createAuditLog({
  req,
  action,
  entity,
  entityId,
  details,
}: AuditLogEntry): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) return; // anonymous request — nothing to log

    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    await recordAuditLog({
      userId,
      action,
      entity,
      entityId,
      details: details ? (details as any) : undefined,
      ipAddress,
    });
  } catch (err) {
    logger.error("createAuditLog failed", err);
  }
}

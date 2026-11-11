// src/services/auditLog.service.ts
// Writes the audit log entry in-process, fire-and-forget (see email.service.ts for why
// the exported function's `await` must resolve near-instantly). The single caller is
// utils/auditLog.ts's createAuditLog(), which snapshots userId/ipAddress off the live
// Request before calling this — this module never sees a Request.

import { AuditLog } from "../models/mongoose";
import { withRetry } from "../utils/retry";
import logger from "../utils/logger";

export interface AuditLogJobData {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
}

export const recordAuditLog = async (data: AuditLogJobData): Promise<void> => {
  void withRetry(
    () => AuditLog.create(data),
    { attempts: 5, baseDelayMs: 3000, backoff: "exponential" },
  ).catch((err) => logger.error(`[audit-log] failed for user ${data.userId}`, err));
};

// src/services/maintenance.service.ts
// Recurring housekeeping jobs — audit log archival and order archival — scheduled
// in-process via node-cron instead of BullMQ's repeatable jobs. No internal retry: these
// run monthly, so a transient failure is self-healing via next month's run rather than
// worth extra retry complexity.
//
// Both jobs follow the same safe ordering: insert into the archive collection FIRST,
// only delete from the hot collection once that insert is confirmed. The archive
// insert is idempotent (unique index on originalId — a duplicate-key error just means
// this record was already archived by a previous run and is safe to skip), so a job
// that dies partway through and runs again never loses data and never double-archives.

import cron from "node-cron";
import { AuditLog, AuditLogArchive, Order, OrderItem, OrderArchive, PaymentLog } from "../models/mongoose";
import { restoreStock } from "./inventory.service";
import logger from "../utils/logger";

// Not part of config/env.ts's validated schema (optional, sensible-default archival
// windows — see .env.example) — read directly from process.env, matching the original
// maintenance.worker.ts behavior.
const AUDIT_LOG_RETENTION_MONTHS = Number(process.env.AUDIT_LOG_RETENTION_MONTHS) || 6;
const ORDER_RETENTION_YEARS = Number(process.env.ORDER_RETENTION_YEARS) || 2;
const BATCH_SIZE = 500;

export const archiveAuditLogs = async (): Promise<{ archived: number }> => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - AUDIT_LOG_RETENTION_MONTHS);

  let archived = 0;
  for (;;) {
    const batch = await AuditLog.find({ createdAt: { $lt: cutoff } }).limit(BATCH_SIZE).lean();
    if (batch.length === 0) break;

    for (const doc of batch) {
      try {
        await AuditLogArchive.create({
          originalId: doc._id,
          userId: doc.userId,
          action: doc.action,
          entity: doc.entity,
          entityId: doc.entityId,
          details: doc.details,
          ipAddress: doc.ipAddress,
          originalCreatedAt: doc.createdAt,
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // already archived — fine, continue to delete
      }
      await AuditLog.deleteOne({ _id: doc._id });
      archived++;
    }
  }
  return { archived };
};

export const archiveOrders = async (): Promise<{ archived: number }> => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - ORDER_RETENTION_YEARS);

  let archived = 0;
  for (;;) {
    // Only terminal-state orders — an old order still PROCESSING/CONFIRMED/SHIPPED is
    // an anomaly worth keeping visible in the live collection, not archiving away.
    const batch = await Order.find({
      createdAt: { $lt: cutoff },
      orderStatus: { $in: ["DELIVERED", "CANCELLED", "RETURNED"] },
    })
      .limit(BATCH_SIZE)
      .lean();
    if (batch.length === 0) break;

    for (const order of batch) {
      const items = await OrderItem.find({ orderId: order._id }).lean();
      try {
        await OrderArchive.create({
          originalId: order._id,
          userId: order.userId,
          orderData: order,
          items,
          originalCreatedAt: order.createdAt,
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
      await OrderItem.deleteMany({ orderId: order._id });
      await Order.deleteOne({ _id: order._id });
      archived++;
    }
  }
  return { archived };
};

export const cleanupAbandonedOrders = async (): Promise<{ archived: number }> => {
  // Orders older than 30 minutes that were initiated via online payment but never completed
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const abandonedOrders = await Order.find({
    paymentMethod: "ONLINE",
    orderStatus: "PROCESSING",
    paymentStatus: "PENDING",
    createdAt: { $lt: cutoff },
  }).lean();

  let cancelled = 0;
  for (const order of abandonedOrders) {
    try {
      // Compare-and-swap so concurrent runs or cancellations don't double process
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, orderStatus: "PROCESSING" },
        { $set: { orderStatus: "CANCELLED" } }
      );

      if (claimed) {
        const items = await OrderItem.find({ orderId: order._id }).lean();
        await restoreStock({
          orderId: String(order._id),
          items: items.map((i: any) => ({
            productId: String(i.productId),
            variantId: i.variantId ? String(i.variantId) : null,
            quantity: i.quantity,
          })),
        });

        await PaymentLog.create({
          orderId: order._id,
          userId: order.userId,
          event: "ORDER_CANCELLED",
          paymentMethod: "ONLINE",
          paymentStatus: "PENDING",
          amount: order.finalAmount,
          gatewayResponse: { reason: "abandoned_checkout_timeout", cancelledAfterMinutes: 30 },
          signatureValid: null,
          ipAddress: null,
        });

        cancelled++;
      }
    } catch (err) {
      logger.error(`[maintenance] Failed to clean up abandoned order ${order._id}`, err);
    }
  }

  return { archived: cancelled };
};

const runArchivalJob = async (name: string, fn: () => Promise<{ archived: number }>) => {
  try {
    const result = await fn();
    logger.info(`[maintenance] ${name}: archived ${result.archived} record(s)`);
  } catch (err) {
    logger.error(`[maintenance] ${name} failed`, err);
  }
};

export const initMaintenanceSchedule = (): void => {
  // Every 15 minutes: automatically clean up online checkouts abandoned for over 30 minutes and restore inventory
  cron.schedule("*/15 * * * *", () => runArchivalJob("cleanup-abandoned-orders", cleanupAbandonedOrders));
  // 1st of every month, 03:00 — low-traffic window, well clear of the daily backup.
  cron.schedule("0 3 1 * *", () => runArchivalJob("archive-audit-logs", archiveAuditLogs));
  // 2nd of every month, 03:00 — checks for orders that crossed the retention threshold
  // since last run; monthly cadence keeps the hot collection consistently small rather
  // than doing one enormous archival pass a year.
  cron.schedule("0 3 2 * *", () => runArchivalJob("archive-orders", archiveOrders));
  logger.info("✅ Maintenance jobs scheduled (abandoned order cleanup + audit log + order archival)");
};

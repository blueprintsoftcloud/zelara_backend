// src/services/inventory.service.ts
// Two async job types, run in-process and fire-and-forget (see email.service.ts for why
// the exported functions' `await` must resolve near-instantly, not block on retries):
//  - restoreStock:    increments stock back after an order is cancelled. Not correctness-
//                      critical for the API response, so it's safe to move off the request path.
//  - checkLowStock:   runs after a successful (synchronous) stock deduction and raises a
//                      LOW_STOCK notification if any affected product fell at/below threshold.
//
// Stock DEDUCTION at order-placement time deliberately stays synchronous/inline in
// order.controller.ts — it must remain an atomic "reject the order if insufficient stock"
// check in the request path, which async processing (with its inherent delay) would break.

import { Product, ProductVariant, Order } from "../models/mongoose";
import { env } from "../config/env";
import { sendNotification } from "./notification.service";
import { getAdminAndStaffRecipients } from "../utils/notificationRecipients";
import { withRetry } from "../utils/retry";
import { syncProductFromVariants } from "../utils/productVariant";
import logger from "../utils/logger";

export interface RestoreStockJobData {
  /** Used as the idempotency key — see the compare-and-swap in restoreStockNow() below. */
  orderId: string;
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
}

export interface LowStockCheckJobData {
  productIds: string[];
}

const restoreStockNow = async (data: RestoreStockJobData) => {
  // Idempotency guard: a retry (or any future duplicate call) must never double-restore
  // stock. The conditional update is the compare-and-swap — only the call that actually
  // flips stockRestored false→true proceeds to touch inventory.
  const claimed = await Order.findOneAndUpdate(
    { _id: data.orderId, stockRestored: { $ne: true } },
    { $set: { stockRestored: true } },
  );
  if (!claimed) {
    logger.info(`[inventory] restore-stock for order ${data.orderId} already applied — skipping (idempotent)`);
    return;
  }

  for (const item of data.items) {
    // Variant-carrying items were deducted from the variant's own stock at order
    // time (see order.controller.ts's deductStock) — restore has to go back to the
    // same place, not Product.stock, which was never touched for these.
    if (item.variantId) {
      await ProductVariant.updateOne({ _id: item.variantId }, { $inc: { stock: item.quantity } });
      // Resync Product.stock to the new variant total — otherwise a cancelled order
      // restores the variant's stock but the product's own (derived) figure stays
      // stuck at the post-deduction number until an admin happens to edit a variant.
      await syncProductFromVariants(item.productId);
    } else {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
    }
  }
};

const checkLowStockNow = async (data: LowStockCheckJobData) => {
  const threshold = Number(env.LOW_STOCK_THRESHOLD) || 5;
  const lowStockProducts = await Product.find({
    _id: { $in: data.productIds },
    stock: { $lte: threshold },
  })
    .select("name stock")
    .lean();

  if (lowStockProducts.length === 0) return;

  const recipients = await getAdminAndStaffRecipients("PRODUCT_EDIT");
  for (const product of lowStockProducts) {
    const message = `Low stock alert: "${product.name}" has only ${product.stock} unit(s) left.`;
    for (const recipientId of recipients) {
      await sendNotification({ message, type: "LOW_STOCK", recipientId });
    }
  }
};

export const restoreStock = async (data: RestoreStockJobData): Promise<void> => {
  void withRetry(() => restoreStockNow(data), { attempts: 5, baseDelayMs: 3000, backoff: "exponential" }).catch(
    (err) => logger.error(`[inventory] restore-stock failed for order ${data.orderId}`, err),
  );
};

export const checkLowStock = async (data: LowStockCheckJobData): Promise<void> => {
  void withRetry(() => checkLowStockNow(data), { attempts: 5, baseDelayMs: 3000, backoff: "exponential" }).catch(
    (err) => logger.error("[inventory] low-stock-check failed", err),
  );
};

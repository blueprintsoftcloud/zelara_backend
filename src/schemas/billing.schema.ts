// src/schemas/billing.schema.ts
import { z } from "zod";

export const upgradeIntentSchema = z.object({
  targetPlanCode: z.string().min(1, "targetPlanCode is required").trim(),
});

export const addonIntentSchema = z.object({
  feature: z.string().min(1, "feature is required").trim(),
});

export const verifyBillingPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
  razorpay_signature: z.string().min(1, "razorpay_signature is required"),
});

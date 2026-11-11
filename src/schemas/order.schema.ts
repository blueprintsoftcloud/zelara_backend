// src/schemas/order.schema.ts
import { z } from "zod";

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z
    .string({ required_error: "Razorpay order ID is required" })
    .min(1),
  razorpay_payment_id: z
    .string({ required_error: "Razorpay payment ID is required" })
    .min(1),
  razorpay_signature: z
    .string({ required_error: "Razorpay signature is required" })
    .min(1),
  buyNowProductId: z.string().optional(),
  buyNowVariantId: z.string().nullable().optional(),
});

export const updateOrderStatusSchema = z
  .object({
    orderStatus: z.enum(
      ["PROCESSING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"],
      { required_error: "Order status is required" },
    ),
    // Only meaningful when orderStatus === "SHIPPED" — see the superRefine below.
    deliveryPartnerId: z.string().trim().min(1).optional(),
    newDeliveryPartnerName: z.string().trim().min(1).optional(),
    // Manual/self-delivery — explicitly opts out of picking a delivery partner. When
    // true, trackingId is not required either (a self-delivered order may not have one).
    noDeliveryPartner: z.boolean().optional(),
    trackingId: z.string().trim().min(1).optional(),
    trackingLink: z.string().trim().url("Tracking link must be a valid URL").optional().or(z.literal("")),
    // Manual/self-delivery only — a free-text note in place of courier/tracking fields.
    shippingNote: z.string().trim().max(500).optional(),
    // When cancelling a paid order, admin can optionally mark as refunded immediately
    refundPayment: z.boolean().optional(),
    refundNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.orderStatus !== "SHIPPED" || data.noDeliveryPartner) return;
    if (!data.deliveryPartnerId && !data.newDeliveryPartnerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryPartnerId"],
        message: "Select or add a delivery partner before marking the order shipped",
      });
    }
    if (!data.trackingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackingId"],
        message: "Tracking ID is required before marking the order shipped",
      });
    }
  });

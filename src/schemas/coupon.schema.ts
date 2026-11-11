// src/schemas/coupon.schema.ts
import { z } from "zod";

export const couponCreateSchema = z.object({
  code: z.string().min(1, "Code is required").max(30, "Code too long").trim(),
  description: z.string().max(300).trim().optional(),
  discountType: z.enum(["PERCENTAGE", "FLAT"], { required_error: "discountType is required" }),
  discountValue: z.coerce.number().positive("discountValue must be greater than 0"),
  minOrderAmount: z.coerce.number().min(0).optional(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().or(z.string().min(1)).nullable().optional(),
  showToCustomer: z.boolean().optional(),
  colorTheme: z.string().nullable().optional(),
});

export const couponUpdateSchema = z.object({
  description: z.string().max(300).trim().optional(),
  discountType: z.enum(["PERCENTAGE", "FLAT"]).optional(),
  discountValue: z.coerce.number().positive().optional(),
  minOrderAmount: z.coerce.number().min(0).optional(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  showToCustomer: z.boolean().optional(),
  colorTheme: z.string().nullable().optional(),
});

export const couponValidateSchema = z.object({
  code: z.string().min(1, "code is required").trim(),
  orderAmount: z.coerce.number().min(0, "orderAmount must be non-negative"),
});

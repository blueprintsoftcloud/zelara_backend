// src/schemas/homeBanner.schema.ts
import { z } from "zod";

export const bannerHeaderSchema = z.object({
  title: z.string().max(200).trim().optional(),
  subtitle: z.string().max(300).trim().optional(),
});

const VALID_TYPES = ["DISCOUNT_PANEL", "CAROUSEL_ITEM", "PROMO_BANNER"] as const;

export const bannerCreateSchema = z.object({
  type: z.enum(VALID_TYPES, { required_error: "type must be DISCOUNT_PANEL, CAROUSEL_ITEM, or PROMO_BANNER" }),
  title: z.string().max(200).trim().optional(),
  link: z.string().max(500).trim().optional(),
  discount: z.string().max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const bannerUpdateSchema = z.object({
  title: z.string().max(200).trim().optional(),
  link: z.string().max(500).trim().optional(),
  discount: z.string().max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
  // Left as a raw string (form-data sends "true"/"false") â€” the controller does its
  // own truthy parsing; z.coerce.boolean() would incorrectly coerce the string "false"
  // to `true` since any non-empty string is truthy.
  isActive: z.string().optional(),
});

export const featuredProductOrderSchema = z.object({
  order: z.coerce.number(),
});

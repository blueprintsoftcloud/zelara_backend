// src/schemas/cart.schema.ts
import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const cartAddSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  // Which size/color of the product — required by cartAdd's own logic once the
  // product has ProductVariant rows, optional here since most products don't.
  // z.object() strips any key not listed here (see validate.middleware.ts), so this
  // has to be declared even though it's nullable/optional, or it never reaches the
  // controller at all.
  variantId: objectId.nullable().optional(),
});

export const cartUpdateQuantitySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(999),
  variantId: objectId.nullable().optional(),
});

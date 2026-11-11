// src/schemas/review.schema.ts
import { z } from "zod";

export const reviewCreateSchema = z.object({
  rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
  comment: z.string().max(1000).trim().optional(),
  // Was missing entirely — the validate() middleware's Zod schema strips any body key
  // it doesn't declare, so every review request silently lost its variantId before
  // createReview ever saw it, regardless of what the frontend actually sent.
  variantId: z.string().trim().optional().nullable(),
});

export const reviewUpdateSchema = reviewCreateSchema;

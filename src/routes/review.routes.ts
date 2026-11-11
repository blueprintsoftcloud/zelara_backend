// src/routes/review.routes.ts
// Review routes — order matters: specific paths before wildcard /:productId

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { optionalAuthMiddleware } from "../middleware/optionalAuth.middleware";
import { validate } from "../middleware/validate.middleware";
import { reviewCreateSchema, reviewUpdateSchema } from "../schemas/review.schema";
import {
  getProductReviews,
  getMyReview,
  createReview,
  updateReview,
  deleteReview,
  getAllReviewsAdmin,
} from "../controllers/review.controller";

const router = Router();

// ── Admin routes ──────────────────────────────────────────────────────────────
// GET  /api/reviews/admin/all         — paginated list of all reviews
router.get("/admin/all", authMiddleware, adminMiddleware, getAllReviewsAdmin);

// DELETE /api/reviews/admin/:reviewId — admin deletes any review
router.delete("/admin/:reviewId", authMiddleware, adminMiddleware, deleteReview);

// ── Customer routes ───────────────────────────────────────────────────────────
// GET /api/reviews/my/:productId      — get current user's review + eligibility
router.get("/my/:productId", authMiddleware, getMyReview);

// POST /api/reviews/:productId        — submit a review (purchased + delivered)
router.post("/:productId", authMiddleware, validate(reviewCreateSchema), createReview);

// PATCH /api/reviews/:reviewId        — edit own review
router.patch("/:reviewId", authMiddleware, validate(reviewUpdateSchema), updateReview);

// DELETE /api/reviews/:reviewId       — customer deletes own review
router.delete("/:reviewId", authMiddleware, deleteReview);

// ── Public routes ─────────────────────────────────────────────────────────────
// GET  /api/reviews/:productId        — fetch all reviews for a product
router.get("/:productId", optionalAuthMiddleware, getProductReviews);

export default router;

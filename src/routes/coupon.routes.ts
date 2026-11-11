import { Router } from "express";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  toggleShowToCustomer,
  getPublicCoupons,
  validateCoupon,
} from "../controllers/coupon.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";
import { validate } from "../middleware/validate.middleware";
import { couponValidateLimiter } from "../middleware/rateLimit.middleware";
import { couponCreateSchema, couponUpdateSchema, couponValidateSchema } from "../schemas/coupon.schema";

const router = Router();

// ── Admin/Staff coupon management (requires COUPON_MANAGEMENT feature) ─────
router.get(
  "/admin",
  authMiddleware,
  adminOrStaff("COUPON_VIEW"),
  listCoupons,
);
router.post(
  "/admin",
  authMiddleware,
  adminOrStaff("COUPON_ADD"),
  validate(couponCreateSchema),
  createCoupon,
);
router.patch(
  "/admin/:id",
  authMiddleware,
  adminOrStaff("COUPON_EDIT"),
  validate(couponUpdateSchema),
  updateCoupon,
);
router.delete(
  "/admin/:id",
  authMiddleware,
  adminOrStaff("COUPON_DELETE"),
  deleteCoupon,
);
router.patch(
  "/admin/:id/toggle",
  authMiddleware,
  adminOrStaff("COUPON_EDIT"),
  toggleCoupon,
);
router.patch(
  "/admin/:id/toggle-visibility",
  authMiddleware,
  adminOrStaff("COUPON_EDIT"),
  toggleShowToCustomer,
);

// ── Customer coupon endpoints ──────────────────────────────────────────────
router.get("/public", getPublicCoupons);
router.post("/validate", authMiddleware, couponValidateLimiter, validate(couponValidateSchema), validateCoupon);

export default router;

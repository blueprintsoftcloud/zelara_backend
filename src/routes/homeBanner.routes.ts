import { Router } from "express";
import {
  getPublicBanners,
  getAllBannersAdmin,
  updateDiscountHeader,
  updateCarouselHeader,
  updateFeaturedHeader,
  updatePromoHeader,
  getFeaturedProducts,
  toggleFeaturedProduct,
  setFeaturedProductOrder,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBanner,
} from "../controllers/homeBanner.controller";
import { getHomepageConfig } from "../controllers/companySettings.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";
import upload from "../middleware/upload";
import { validate } from "../middleware/validate.middleware";
import {
  bannerHeaderSchema,
  bannerCreateSchema,
  bannerUpdateSchema,
  featuredProductOrderSchema,
} from "../schemas/homeBanner.schema";

const router = Router();

// Public — no auth required (used by the home page)
router.get("/", getPublicBanners);
router.get("/homepage-config", getHomepageConfig);

// Admin — authenticated + feature-gated
router.get("/admin", authMiddleware, adminOrStaff("BANNER_VIEW"), getAllBannersAdmin);
router.put(
  "/discount-header",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  validate(bannerHeaderSchema),
  updateDiscountHeader,
);
router.put(
  "/carousel-header",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  validate(bannerHeaderSchema),
  updateCarouselHeader,
);
router.put(
  "/featured-header",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  validate(bannerHeaderSchema),
  updateFeaturedHeader,
);
router.put(
  "/promo-header",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  validate(bannerHeaderSchema),
  updatePromoHeader,
);

// Featured Products management
router.get(
  "/featured-products",
  authMiddleware,
  adminOrStaff("BANNER_VIEW"),
  getFeaturedProducts,
);
router.patch(
  "/featured-products/:productId/toggle",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  toggleFeaturedProduct,
);
router.patch(
  "/featured-products/:productId/order",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  validate(featuredProductOrderSchema),
  setFeaturedProductOrder,
);

router.post(
  "/",
  authMiddleware,
  adminOrStaff("BANNER_ADD"),
  upload.single("image"),
  validate(bannerCreateSchema),
  createBanner,
);
router.put(
  "/:id",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  upload.single("image"),
  validate(bannerUpdateSchema),
  updateBanner,
);
router.delete(
  "/:id",
  authMiddleware,
  adminOrStaff("BANNER_DELETE"),
  deleteBanner,
);
router.patch(
  "/:id/toggle",
  authMiddleware,
  adminOrStaff("BANNER_EDIT"),
  toggleBanner,
);

export default router;

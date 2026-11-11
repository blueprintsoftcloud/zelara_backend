import { Router } from "express";
import {
  getWarehouseSettings,
  updateWarehouseSettings,
  getShippingConfig,
  updateShippingConfig,
  getTrackingPartnerSettings,
  updateTrackingPartnerSettings,
  deleteTrackingPartner,
} from "../controllers/settings.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  updateWarehouseSettingsSchema,
  updateShippingConfigSchema,
  updateTrackingPartnerSettingsSchema,
} from "../schemas/settings.schema";

const router = Router();

// Warehouse location
router.get("/warehouse", authMiddleware, adminOrStaff("SETTINGS_VIEW"), getWarehouseSettings);
router.put("/warehouse", authMiddleware, adminOrStaff("SETTINGS_EDIT"), validate(updateWarehouseSettingsSchema), updateWarehouseSettings);

// Shipping rate configuration
router.get("/shipping-config", authMiddleware, adminOrStaff("SETTINGS_VIEW"), getShippingConfig);
router.put("/shipping-config", authMiddleware, adminOrStaff("SETTINGS_EDIT"), validate(updateShippingConfigSchema), updateShippingConfig);

// Customer tracking delivery partner settings
router.get("/tracking-partners", getTrackingPartnerSettings); // Public for navbar & tracking modal
router.put("/tracking-partners", authMiddleware, adminOrStaff("SETTINGS_EDIT"), validate(updateTrackingPartnerSettingsSchema), updateTrackingPartnerSettings);
router.delete("/tracking-partners/:partnerName", authMiddleware, adminOrStaff("SETTINGS_EDIT"), deleteTrackingPartner);

export default router;

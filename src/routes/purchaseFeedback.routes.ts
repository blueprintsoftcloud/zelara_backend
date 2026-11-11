import { Router } from "express";
import {
  getSurveyConfig,
  submitFeedback,
  getAdminFeedbackList,
  updateSurveyConfig,
  deleteFeedbackEntry,
} from "../controllers/purchaseFeedback.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";

const router = Router();

// Public / Storefront routes
router.get("/config", getSurveyConfig);
router.post("/", optionalAuthMiddleware, submitFeedback);

// Admin & Staff routes
router.get(
  "/admin",
  authMiddleware,
  adminOrStaff(["ANALYTICS_VIEW", "SETTINGS_VIEW", "ORDER_VIEW"]),
  getAdminFeedbackList
);
router.put(
  "/config",
  authMiddleware,
  adminOrStaff(["SETTINGS_EDIT", "ANALYTICS_VIEW"]),
  updateSurveyConfig
);
router.delete(
  "/:id",
  authMiddleware,
  adminOrStaff(["SETTINGS_EDIT", "ANALYTICS_VIEW"]),
  deleteFeedbackEntry
);

export default router;

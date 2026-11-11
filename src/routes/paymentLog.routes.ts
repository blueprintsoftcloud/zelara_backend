// src/routes/paymentLog.routes.ts
import { Router } from "express";
import { getPaymentLogs, getPaymentLogById } from "../controllers/paymentLog.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";

const router = Router();

// Admin/Staff — requires the dedicated PAYMENT_VIEW permission (separate from Order Management)
router.get(
  "/",
  authMiddleware,
  adminOrStaff("PAYMENT_VIEW"),
  getPaymentLogs,
);

router.get(
  "/:id",
  authMiddleware,
  adminOrStaff("PAYMENT_VIEW"),
  getPaymentLogById,
);

export default router;

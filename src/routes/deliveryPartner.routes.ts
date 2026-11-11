import { Router } from "express";
import { listDeliveryPartners, createDeliveryPartner } from "../controllers/deliveryPartner.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";

const router = Router();

// Same permission/feature-gate keys the order-status-update route already uses —
// this list only exists to support the ship-order flow, not as its own feature.
router.get("/", authMiddleware, adminOrStaff("ORDER_VIEW"), listDeliveryPartners);
router.post("/", authMiddleware, adminOrStaff("ORDER_UPDATE"), createDeliveryPartner);

export default router;

import { Router } from "express";
import {
  getSummary,
  getRevenueByDay,
  getOrderStatusBreakdown,
  getTopProducts,
  getTopCategories,
  getProfitSummary,
  getProfitByDay,
  getTopProductsByProfit,
  getPaymentMethodBreakdown,
  getSummaryWithRange,
  getCustomerInsights,
  getSalesByLocation,
  getCouponPerformance,
} from "../controllers/analytics.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminOrStaff } from "../middleware/staffPermission.middleware";

const router = Router();

const gate = [authMiddleware, adminOrStaff("ANALYTICS_VIEW")];

router.get("/summary", ...gate, getSummary);
router.get("/summary-range", ...gate, getSummaryWithRange);
router.get("/revenue", ...gate, getRevenueByDay);
router.get("/order-status", ...gate, getOrderStatusBreakdown);
router.get("/top-products", ...gate, getTopProducts);
router.get("/top-categories", ...gate, getTopCategories);
router.get("/profit", ...gate, getProfitSummary);
router.get("/profit-by-day", ...gate, getProfitByDay);
router.get("/top-products-profit", ...gate, getTopProductsByProfit);
router.get("/payment-methods", ...gate, getPaymentMethodBreakdown);
router.get("/customer-insights", ...gate, getCustomerInsights);
router.get("/sales-by-location", ...gate, getSalesByLocation);
router.get("/coupon-performance", ...gate, getCouponPerformance);

export default router;

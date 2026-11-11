import { Request, Response } from "express";
import { Coupon } from "../models/mongoose";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

// ── Admin: List all coupons ────────────────────────────────────────────────
// GET /api/coupon/admin
export const listCoupons = async (_req: Request, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(coupons);
  } catch (err: any) {
    logger.error("listCoupons error", err);
    res.status(500).json({ message: "Error fetching coupons" });
  }
};

// ── Admin: Create coupon ───────────────────────────────────────────────────
// POST /api/coupon/admin
export const createCoupon = async (req: Request, res: Response) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxUses,
      expiresAt,
      showToCustomer,
      colorTheme,
    } = req.body as {
      code: string;
      description?: string;
      discountType: string;
      discountValue: number;
      minOrderAmount?: number;
      maxUses?: number;
      expiresAt?: string;
      showToCustomer?: boolean;
      colorTheme?: string | null;
    };

    if (!code || !discountType || discountValue == null) {
      res.status(400).json({ message: "code, discountType, and discountValue are required" });
      return;
    }
    if (!["PERCENTAGE", "FLAT"].includes(discountType)) {
      res.status(400).json({ message: "discountType must be PERCENTAGE or FLAT" });
      return;
    }
    if (discountValue <= 0) {
      res.status(400).json({ message: "discountValue must be greater than 0" });
      return;
    }
    if (discountType === "PERCENTAGE" && discountValue > 100) {
      res.status(400).json({ message: "Percentage discount cannot exceed 100" });
      return;
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        description,
        discountType,
        discountValue,
        minOrderAmount: minOrderAmount ?? 0,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        showToCustomer: Boolean(showToCustomer),
        colorTheme: colorTheme || null,
      },
    });
    await createAuditLog({ req, action: "CREATE_COUPON", entity: "Coupon", entityId: coupon.id, details: { code: coupon.code, discountType, discountValue } });
    res.status(201).json(coupon);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ message: "Coupon code already exists" });
      return;
    }
    logger.error("createCoupon error", err);
    res.status(500).json({ message: "Error creating coupon" });
  }
};

// ── Admin: Update coupon ───────────────────────────────────────────────────
// PATCH /api/coupon/admin/:id
export const updateCoupon = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxUses,
      expiresAt,
      isActive,
      showToCustomer,
      colorTheme,
    } = req.body as {
      description?: string;
      discountType?: string;
      discountValue?: number;
      minOrderAmount?: number;
      maxUses?: number | null;
      expiresAt?: string | null;
      isActive?: boolean;
      showToCustomer?: boolean;
      colorTheme?: string | null;
    };

    if (discountType && !["PERCENTAGE", "FLAT"].includes(discountType)) {
      res.status(400).json({ message: "discountType must be PERCENTAGE or FLAT" });
      return;
    }
    if (discountValue !== undefined && discountValue <= 0) {
      res.status(400).json({ message: "discountValue must be greater than 0" });
      return;
    }
    if (discountType === "PERCENTAGE" && discountValue !== undefined && discountValue > 100) {
      res.status(400).json({ message: "Percentage discount cannot exceed 100" });
      return;
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxUses,
        expiresAt: expiresAt === null ? null : expiresAt ? new Date(expiresAt) : undefined,
        isActive,
        showToCustomer,
        colorTheme: colorTheme !== undefined ? colorTheme : undefined,
      },
    });
    await createAuditLog({ req, action: "UPDATE_COUPON", entity: "Coupon", entityId: id, details: req.body });
    res.json(coupon);
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    logger.error("updateCoupon error", err);
    res.status(500).json({ message: "Error updating coupon" });
  }
};

// ── Admin: Delete coupon ───────────────────────────────────────────────────
// DELETE /api/coupon/admin/:id
export const deleteCoupon = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.coupon.delete({ where: { id } });
    await createAuditLog({ req, action: "DELETE_COUPON", entity: "Coupon", entityId: id });
    res.json({ message: "Coupon deleted" });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    logger.error("deleteCoupon error", err);
    res.status(500).json({ message: "Error deleting coupon" });
  }
};

// ── Admin: Toggle active status ────────────────────────────────────────────
// PATCH /api/coupon/admin/:id/toggle
export const toggleCoupon = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    const coupon = await prisma.coupon.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
    await createAuditLog({ req, action: coupon.isActive ? "ACTIVATE_COUPON" : "DEACTIVATE_COUPON", entity: "Coupon", entityId: id, details: { code: coupon.code } });
    res.json(coupon);
  } catch (err: any) {
    logger.error("toggleCoupon error", err);
    res.status(500).json({ message: "Error toggling coupon" });
  }
};

// ── Admin: Toggle show-to-customer status ──────────────────────────────────
// PATCH /api/coupon/admin/:id/toggle-visibility
export const toggleShowToCustomer = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    const coupon = await prisma.coupon.update({
      where: { id },
      data: { showToCustomer: !existing.showToCustomer },
    });
    await createAuditLog({
      req,
      action: coupon.showToCustomer ? "SHOW_COUPON_TO_CUSTOMER" : "HIDE_COUPON_FROM_CUSTOMER",
      entity: "Coupon",
      entityId: id,
      details: { code: coupon.code, showToCustomer: coupon.showToCustomer },
    });
    res.json(coupon);
  } catch (err: any) {
    logger.error("toggleShowToCustomer error", err);
    res.status(500).json({ message: "Error toggling coupon visibility" });
  }
};

// ── Customer: List public coupons for storefront carousel & checkout ─────
// GET /api/coupon/public
export const getPublicCoupons = async (_req: Request, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        showToCustomer: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    const available = coupons.filter((c: any) => {
      if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return false;
      if (c.maxUses !== null && c.maxUses !== undefined && c.usedCount >= c.maxUses) return false;
      return true;
    });

    const formatted = available.map((c: any) => ({
      id: c.id,
      code: c.code,
      description: c.description || "",
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount || 0,
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
      colorTheme: c.colorTheme || null,
    }));

    res.json(formatted);
  } catch (err: any) {
    logger.error("getPublicCoupons error", err);
    res.status(500).json({ message: "Error fetching public coupons" });
  }
};

// ── Customer: Validate coupon at checkout ─────────────────────────────────
// POST /api/coupon/validate
export const validateCoupon = async (req: Request, res: Response) => {
  try {
    const { code, orderAmount } = req.body as { code: string; orderAmount: number };

    if (!code || orderAmount == null) {
      res.status(400).json({ message: "code and orderAmount are required" });
      return;
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!coupon) {
      res.status(404).json({ message: "Invalid coupon code" });
      return;
    }
    if (!coupon.isActive) {
      res.status(400).json({ message: "This coupon is no longer active" });
      return;
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ message: "This coupon has expired" });
      return;
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ message: "Coupon usage limit has been reached" });
      return;
    }
    if (orderAmount < coupon.minOrderAmount) {
      res.status(400).json({
        message: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`,
      });
      return;
    }

    const discountAmount =
      coupon.discountType === "PERCENTAGE"
        ? Math.round((orderAmount * coupon.discountValue) / 100)
        : Math.min(coupon.discountValue, orderAmount);

    res.json({
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
    });
  } catch (err: any) {
    logger.error("validateCoupon error", err);
    res.status(500).json({ message: "Error validating coupon" });
  }
};

// src/controllers/paymentLog.controller.ts
// Admin / Super-Admin: read payment transaction logs.
// Logs are written automatically by order.controller.ts on every payment event.

import { Request, Response } from "express";
import { PaymentLog } from "../models/mongoose";
import logger from "../utils/logger";

// ── GET /api/payment-logs ─────────────────────────────────────────────────────
// Query params: page, limit, status, method, event, search, from, to
export const getPaymentLogs = async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "30",
      status,
      method,
      event,
      search,
      from,
      to,
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit ?? "30") || 30, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (status) where.paymentStatus = status.toUpperCase();
    if (method) where.paymentMethod = method.toUpperCase();
    if (event) where.event = event.toUpperCase();

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
      };
    }

    if (search) {
      where.OR = [
        { razorpayOrderId: { contains: search, mode: "insensitive" } },
        { razorpayPaymentId: { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { order: { id: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.paymentLog.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, email: true, phone: true } },
          order: { select: { id: true, orderStatus: true, finalAmount: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.paymentLog.count({ where }),
    ]);

    // Summary stats (unfiltered totals for the dashboard cards)
    const [paid, failed, pending, refunded] = await Promise.all([
      prisma.paymentLog.count({ where: { paymentStatus: "PAID" } }),
      prisma.paymentLog.count({ where: { paymentStatus: "FAILED" } }),
      prisma.paymentLog.count({ where: { paymentStatus: "PENDING" } }),
      prisma.paymentLog.count({ where: { paymentStatus: "REFUNDED" } }),
    ]);

    const revenueAgg = await prisma.paymentLog.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { amount: true },
    });

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        paid,
        failed,
        pending,
        refunded,
        totalRevenue: revenueAgg._sum.amount ?? 0,
      },
    });
  } catch (err: any) {
    logger.error("getPaymentLogs error", err);
    res.status(500).json({ message: "Error fetching payment logs" });
  }
};

// ── GET /api/payment-logs/:id ─────────────────────────────────────────────────
export const getPaymentLogById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const log = await prisma.paymentLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true, phone: true, role: true } },
        order: {
          select: {
            id: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            shippingCharge: true,
            discountAmount: true,
            finalAmount: true,
            razorpayOrderId: true,
            razorpayPaymentId: true,
            razorpaySignature: true,
            shippingAddress: true,
            createdAt: true,
          },
        },
      },
    });

    if (!log) return res.status(404).json({ message: "Payment log not found" });

    res.json({ log });
  } catch (err: any) {
    logger.error("getPaymentLogById error", err);
    res.status(500).json({ message: "Error fetching payment log" });
  }
};

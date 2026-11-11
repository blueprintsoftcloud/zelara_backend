import { Request, Response } from "express";
import logger from "../utils/logger";

// `prisma` is a global (see config/prisma.ts's `globalThis.prisma = bridge`, loaded as a
// side effect via server.ts's `import "./config/prisma"`) — every other controller in
// this codebase relies on it the same way, without a local import.

/**
 * Returns a full platform dashboard summary: user counts, order statistics,
 * all-time and 30-day revenue figures, and the 5 most recent orders.
 *
 * @access SUPER_ADMIN
 * @route  GET /api/super-admin/summary
 * @body   none
 * @returns 200 { adminUser, stats: { totalCustomers, newCustomers, totalOrders,
 *   newOrders, totalProducts, totalRevenue, recentRevenue }, latestOrders }
 */
export const getSuperAdminSummary = async (_req: Request, res: Response) => {
  try {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    };

    const last30 = daysAgo(30);

    const [
      totalCustomers,
      newCustomers,
      totalOrders,
      newOrders,
      totalProducts,
      adminUser,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: last30 } } }),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: last30 } } }),
      prisma.product.count(),
      prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true, username: true, email: true, phone: true, createdAt: true, isVerified: true },
      }),
    ]);

    const revenue = await prisma.order.aggregate({
      where: { paymentStatus: "PAID", orderStatus: { notIn: ["CANCELLED", "RETURNED"] } },
      _sum: { finalAmount: true },
    });

    const recentRevenue = await prisma.order.aggregate({
      where: { paymentStatus: "PAID", orderStatus: { notIn: ["CANCELLED", "RETURNED"] }, createdAt: { gte: last30 } },
      _sum: { finalAmount: true },
    });

    const latestOrders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return res.json({
      adminUser,
      stats: {
        totalCustomers,
        newCustomers,
        totalOrders,
        newOrders,
        totalProducts,
        totalRevenue: revenue._sum.finalAmount ?? 0,
        recentRevenue: recentRevenue._sum.finalAmount ?? 0,
      },
      latestOrders,
    });
  } catch (err: unknown) {
    logger.error("getSuperAdminSummary error", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Returns the primary Admin user's profile for the Super Admin dashboard.
 *
 * @access SUPER_ADMIN
 * @route  GET /api/super-admin/admin-user
 * @body   none
 * @returns 200 { id, username, email, phone, isVerified, createdAt, updatedAt, _count: { orders } }
 */
export const getAdminUser = async (_req: Request, res: Response) => {
  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true } },
      },
    });

    if (!adminUser) {
      return res.status(404).json({ message: "No Admin user found in this deployment." });
    }

    return res.json(adminUser);
  } catch (err: unknown) {
    logger.error("getAdminUser error", err);
    return res.status(500).json({ message: "Server error" });
  }
};

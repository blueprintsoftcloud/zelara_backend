import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User, StaffProfile, Product, Order } from "../models/mongoose";
import { STAFF_PERMISSIONS, StaffPermission } from "../config/staffPermissions";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

// ── GET /api/staff/profile  (staff's own profile + permissions) ────────────
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const [user, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, email: true, role: true, avatar: true },
      }),
      prisma.staffProfile.findUnique({
        where: { userId },
        select: { permissions: true, isActive: true },
      }),
    ]);
    if (!user) {
      res.status(404).json({ message: "Staff not found" });
      return;
    }
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      permissions: profile?.permissions ?? [],
      isActive: profile?.isActive ?? false,
    });
  } catch (err: any) {
    logger.error("getMyProfile error", err);
    res.status(500).json({ message: "Error fetching staff profile" });
  }
};

// ── PATCH /api/staff/me  (staff: update own username) ───────────────────────
export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { username } = req.body as { username?: string };

    if (!username || username.trim().length < 3) {
      res.status(400).json({ message: "Username must be at least 3 characters" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username: username.trim() },
      select: { id: true, username: true, email: true, role: true },
    });

    res.json({ message: "Profile updated successfully", user: updated });
  } catch (err: any) {
    logger.error("updateMyProfile error", err);
    res.status(500).json({ message: "Error updating profile" });
  }
};

// ── GET /api/staff/dashboard  (staff: own dashboard summary) ─────────────
export const getStaffDashboard = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const pct = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return Math.round(((curr - prev) / prev) * 100);
    };

    const [
      totalOrders, ordersThisMonth, ordersPrevMonth,
      totalProducts,
      totalCategories,
      processingOrders,
      paidAgg, paidThisMonth, paidPrevMonth,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.order.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      prisma.product.count(),
      prisma.category.count(),
      prisma.order.count({ where: { orderStatus: "PROCESSING" } }),
      prisma.order.aggregate({ where: { paymentStatus: "PAID", orderStatus: { notIn: ["CANCELLED", "RETURNED"] } }, _sum: { finalAmount: true } }),
      prisma.order.aggregate({ where: { paymentStatus: "PAID", orderStatus: { notIn: ["CANCELLED", "RETURNED"] }, createdAt: { gte: thirtyDaysAgo } }, _sum: { finalAmount: true } }),
      prisma.order.aggregate({ where: { paymentStatus: "PAID", orderStatus: { notIn: ["CANCELLED", "RETURNED"] }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { finalAmount: true } }),
    ]);

    // Order status breakdown (pie chart)
    const statuses = ["PROCESSING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"] as const;
    const statusCounts = await Promise.all(
      statuses.map((s) => prisma.order.count({ where: { orderStatus: s } })),
    );
    const orderStatus = statuses.map((s, i) => ({ status: s, count: statusCounts[i] }));

    // Revenue by day — last 7 days (bar chart), grouped in the database
    const revenueByDayAgg = await Order.aggregate([
      { $match: { paymentStatus: "PAID", orderStatus: { $nin: ["CANCELLED", "RETURNED"] }, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 },
        },
      },
    ]);
    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      byDay[key] = { date: key, revenue: 0, orders: 0 };
    }
    for (const day of revenueByDayAgg) {
      if (byDay[day._id]) { byDay[day._id].revenue = day.revenue; byDay[day._id].orders = day.orders; }
    }

    // Top 5 products by sales
    const topProductsRaw = await prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, price: true },
      _count: { id: true },
      orderBy: { _sum: { price: "desc" } },
      take: 5,
    });
    const productIds = topProductsRaw.map((p: any) => p.productId).filter(Boolean) as string[];
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, image: true, price: true },
    });
    const productMap = Object.fromEntries(productDetails.map((p: any) => [p.id, p]));
    const topProducts = topProductsRaw.map((p: any) => ({
      product: p.productId ? productMap[p.productId] ?? null : null,
      totalRevenue: p._sum.price ?? 0,
      totalQuantitySold: p._sum.quantity ?? 0,
      orderCount: p._count.id,
    }));

    // Recent orders (last 5) for orders table widget
    const recentOrders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        finalAmount: true,
        orderStatus: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
        shippingAddress: true,
        user: { select: { username: true, email: true } },
      },
    });

    // Payment method breakdown (COD vs ONLINE)
    const paymentMethodsRaw = await prisma.order.groupBy({
      by: ["paymentMethod"],
      _count: { id: true },
      _sum: { finalAmount: true },
    });
    const paymentMethods = paymentMethodsRaw.map((pm: any) => ({
      method: pm.paymentMethod,
      count: pm._count.id,
      revenue: pm._sum.finalAmount ?? 0,
    }));

    res.json({
      summary: {
        orders: { total: totalOrders, thisMonth: ordersThisMonth, processing: processingOrders, growthPct: pct(ordersThisMonth, ordersPrevMonth) },
        revenue: { total: paidAgg._sum.finalAmount ?? 0, thisMonth: paidThisMonth._sum.finalAmount ?? 0, growthPct: pct(paidThisMonth._sum.finalAmount ?? 0, paidPrevMonth._sum.finalAmount ?? 0) },
        products: { total: totalProducts },
        categories: { total: totalCategories },
      },
      orderStatus,
      revenueChart: Object.values(byDay),
      topProducts,
      recentOrders,
      paymentMethods,
    });
  } catch (err: any) {
    logger.error("getStaffDashboard error", err);
    res.status(500).json({ message: "Error loading staff dashboard" });
  }
};

// ── GET /api/staff  (admin: list every staff account) ──────────────────────
export const listStaff = async (req: Request, res: Response) => {
  try {
    const { search } = req.query as Record<string, string | undefined>;

    const profileWhere: any = {};

    if (search && search.trim() !== "") {
      const term = search.trim();
      const matchingUsers = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            { phone: { contains: term, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const matchUserIds = matchingUsers.map((u: any) => u.id);

      profileWhere.OR = [
        { userId: { in: matchUserIds } },
        { notes: { contains: term, mode: "insensitive" } },
      ];
    }

    // Fetch profiles first
    const profiles = await prisma.staffProfile.findMany({
      where: profileWhere,
      orderBy: { createdAt: "desc" },
    });

    if (profiles.length === 0) {
      res.json([]);
      return;
    }

    // Fetch the linked users in a single query using the collected userIds
    const userIds = profiles.map((p: any) => p.userId).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, email: true, phone: true, createdAt: true, avatar: true },
    });
    const userMap: Record<string, any> = {};
    users.forEach((u: any) => { userMap[u.id] = u; });

    const result = profiles
      .filter((p: any) => userMap[p.userId] != null)   // skip orphaned profiles
      .map((p: any) => ({
        id: p.id,
        isActive: p.isActive,
        permissions: p.permissions ?? [],
        notes: p.notes ?? null,
        createdAt: p.createdAt,
        user: userMap[p.userId],
      }));

    // Clean up any orphaned StaffProfiles whose User no longer exists
    const orphanIds = profiles
      .filter((p: any) => userMap[p.userId] == null)
      .map((p: any) => p.id);
    if (orphanIds.length > 0) {
      await prisma.staffProfile.deleteMany({ where: { id: { in: orphanIds } } });
    }

    res.json(result);
  } catch (err: any) {
    logger.error("listStaff error", err);
    res.status(500).json({ message: "Error fetching staff list" });
  }
};

// ── POST /api/staff  (admin: create staff account) ─────────────────────────
export const createStaff = async (req: Request, res: Response) => {
  try {
    const managedBy = req.user!.id;
    const { username, phone, password, permissions, notes } = req.body as {
      username: string;
      email: string;
      phone: string;
      password: string;
      permissions?: string[];
      notes?: string;
    };
    // Normalize once — emails are matched/stored case-insensitively everywhere.
    const email: string = req.body.email ? String(req.body.email).trim().toLowerCase() : req.body.email;

    if (!username || !email || !phone || !password) {
      res.status(400).json({ message: "username, email, phone and password are required" });
      return;
    }

    // Validate formats
    if (username.trim().length < 3) {
      res.status(400).json({ message: "Username must be at least 3 characters" });
      return;
    }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      res.status(400).json({ message: "Invalid email address format" });
      return;
    }
    if (!/^[6-9][0-9]{9}$/.test(String(phone))) {
      res.status(400).json({ message: "Phone must be a valid 10-digit Indian mobile number" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    // Validate permissions
    const validPerms = (permissions ?? []).filter((p) =>
      STAFF_PERMISSIONS.includes(p as StaffPermission),
    );

    const emailExists = await prisma.user.findFirst({ where: { email } });
    if (emailExists) {
      res.status(409).json({ message: "An account with this email address already exists." });
      return;
    }
    const phoneExists = await prisma.user.findFirst({ where: { phone: String(phone) } });
    if (phoneExists) {
      res.status(409).json({ message: "An account with this phone number already exists." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user + profile in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          phone: String(phone),
          password: hashedPassword,
          role: "STAFF",
          isVerified: true,
        },
      });
      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          managedBy,
          permissions: validPerms,
          notes: notes ?? null,
        },
      });
      return { user, profile };
    });

    await createAuditLog({
      req,
      action: "CREATE_STAFF",
      entity: "StaffProfile",
      entityId: result.profile.id,
      details: { username: result.user.username, email: result.user.email, permissions: validPerms },
    });

    res.status(201).json({
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      phone: result.user.phone,
      permissions: result.profile.permissions,
      isActive: result.profile.isActive,
      notes: result.profile.notes,
      createdAt: result.user.createdAt,
    });
  } catch (err: any) {
    logger.error("createStaff error", err);
    // Mongoose duplicate key (11000) or Prisma equivalent (P2002)
    if (err?.code === 11000 || err?.code === "P2002") {
      const key = err?.keyPattern ?? {};
      const field = key.email || err?.meta?.target?.includes?.("email") ? "email address" : "phone number";
      res.status(409).json({ message: `An account with this ${field} already exists.` });
      return;
    }
    res.status(500).json({ message: "Error creating staff account" });
  }
};

// ── GET /api/staff/:id  (admin: get one staff member) ──────────────────────
export const getStaffById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = await prisma.staffProfile.findFirst({
      where: { id: id as string },
      include: {
        user: {
          select: { id: true, username: true, email: true, phone: true, createdAt: true },
        },
      },
    });

    if (!profile) {
      res.status(404).json({ message: "Staff member not found" });
      return;
    }
    res.json(profile);
  } catch (err: any) {
    logger.error("getStaffById error", err);
    res.status(500).json({ message: "Error fetching staff member" });
  }
};
// ── PATCH /api/staff/:id  (admin: update basic staff details) ────────────────
export const updateStaff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, phone, notes, newPassword } = req.body as {
      username?: string;
      email?: string;
      phone?: string;
      notes?: string;
      newPassword?: string;
    };
    // Normalize once — emails are matched/stored case-insensitively everywhere.
    const email: string | undefined = req.body.email ? String(req.body.email).trim().toLowerCase() : req.body.email;

    const profile = await prisma.staffProfile.findFirst({
      where: { id: id as string },
    });
    if (!profile) {
      res.status(404).json({ message: "Staff member not found" });
      return;
    }

    // Check email uniqueness if changing
    if (email) {
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
        res.status(400).json({ message: "Invalid email address format" });
        return;
      }
      const conflict = await prisma.user.findFirst({
        where: { email, id: { not: profile.userId } },
      });
      if (conflict) {
        res.status(409).json({ message: "Another account with this email already exists" });
        return;
      }
    }

    if (phone && !/^[6-9][0-9]{9}$/.test(String(phone))) {
      res.status(400).json({ message: "Phone must be a valid 10-digit Indian mobile number" });
      return;
    }
    if (phone) {
      const phoneConflict = await prisma.user.findFirst({
        where: { phone: String(phone), id: { not: profile.userId } },
      });
      if (phoneConflict) {
        res.status(409).json({ message: "Another account with this phone number already exists" });
        return;
      }
    }

    if (username && username.trim().length < 3) {
      res.status(400).json({ message: "Username must be at least 3 characters" });
      return;
    }

    if (newPassword !== undefined && newPassword !== "") {
      if (newPassword.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
      }
    }

    const [updatedUser, updatedProfile] = await prisma.$transaction(async (tx: any) => {
      const userUpdateData: Record<string, any> = {
        ...(username && { username }),
        ...(email && { email }),
        ...(phone && { phone: String(phone) }),
      };
      if (newPassword && newPassword.length >= 6) {
        userUpdateData.password = await bcrypt.hash(newPassword, 10);
      }
      return [
        await tx.user.update({
          where: { id: profile.userId },
          data: userUpdateData,
          select: { id: true, username: true, email: true, phone: true, createdAt: true },
        }),
        await tx.staffProfile.update({
          where: { id: id as string },
          data: { notes: notes ?? null },
        }),
      ];
    });

    await createAuditLog({
      req,
      action: "UPDATE_STAFF",
      entity: "StaffProfile",
      entityId: id as string,
      details: {
        username: username ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
        passwordChanged: !!(newPassword && newPassword.length >= 6),
      },
    });

    res.json({
      id: updatedProfile.id,
      notes: updatedProfile.notes,
      user: updatedUser,
    });
  } catch (err: any) {
    logger.error("updateStaff error", err);
    res.status(500).json({ message: "Error updating staff details" });
  }
};
// ── PATCH /api/staff/:id/permissions  (admin: update permissions) ──────────
export const updatePermissions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body as { permissions: string[] };

    if (!Array.isArray(permissions)) {
      res.status(400).json({ message: "permissions must be an array" });
      return;
    }

    const validPerms = permissions.filter((p) =>
      STAFF_PERMISSIONS.includes(p as StaffPermission),
    );

    const profile = await prisma.staffProfile.findFirst({
      where: { id: id as string },
    });
    if (!profile) {
      res.status(404).json({ message: "Staff member not found" });
      return;
    }

    const updated = await prisma.staffProfile.update({
      where: { id: id as string },
      data: { permissions: validPerms },
    });

    await createAuditLog({
      req,
      action: "UPDATE_STAFF_PERMISSIONS",
      entity: "StaffProfile",
      entityId: id as string,
      details: { permissions: validPerms },
    });

    res.json(updated);
  } catch (err: any) {
    logger.error("updatePermissions error", err);
    res.status(500).json({ message: "Error updating permissions" });
  }
};

// ── PATCH /api/staff/:id/toggle  (admin: activate / deactivate) ───────────
export const toggleStaffActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = await prisma.staffProfile.findFirst({
      where: { id: id as string },
    });
    if (!profile) {
      res.status(404).json({ message: "Staff member not found" });
      return;
    }

    const updated = await prisma.staffProfile.update({
      where: { id: id as string },
      data: { isActive: !profile.isActive },
    });

    await createAuditLog({
      req,
      action: "TOGGLE_STAFF_ACTIVE",
      entity: "StaffProfile",
      entityId: id as string,
      details: { isActive: updated.isActive },
    });

    res.json(updated);
  } catch (err: any) {
    logger.error("toggleStaffActive error", err);
    res.status(500).json({ message: "Error toggling staff status" });
  }
};

// ── DELETE /api/staff/:id  (admin: remove staff) ───────────────────────────
export const deleteStaff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = await prisma.staffProfile.findFirst({
      where: { id: id as string },
    });
    if (!profile) {
      res.status(404).json({ message: "Staff member not found" });
      return;
    }

    // Snapshot who's being removed before the delete, so the audit entry still names
    // them afterward (User.findFirst below would return nothing post-delete).
    const removedUser = await prisma.user.findUnique({
      where: { id: profile.userId },
      select: { username: true, email: true },
    });

    // Delete both the StaffProfile and the User.
    // Mongoose has no cascade, so both must be deleted explicitly.
    await prisma.staffProfile.delete({ where: { id: id as string } });
    await prisma.user.delete({ where: { id: profile.userId } });

    await createAuditLog({
      req,
      action: "DELETE_STAFF",
      entity: "StaffProfile",
      entityId: id as string,
      details: { username: removedUser?.username, email: removedUser?.email },
    });

    res.json({ message: "Staff member removed" });
  } catch (err: any) {
    logger.error("deleteStaff error", err);
    res.status(500).json({ message: "Error deleting staff member" });
  }
};

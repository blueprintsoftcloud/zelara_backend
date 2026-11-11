import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User, Product, Order, OrderItem, StaffProfile } from "../models/mongoose";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

const calculatePercentage = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

type DashboardRange = "all" | "30d" | "7d" | "today";

/**
 * Window bounds for the dashboard's range filter. For "all", `windowStart` is undefined
 * (no date filter — a genuine all-time total) and the comparison period is the trailing
 * 30 vs previous 30 days, matching the summary's long-standing default behavior. For the
 * other three ranges, `windowStart` bounds both the headline number and its own
 * previous-equivalent-period comparison (e.g. this 7 days vs the prior 7 days).
 */
const getRangeWindow = (range: DashboardRange) => {
  const now = new Date();
  if (range === "today") {
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    return { windowStart: startOfToday, prevStart: startOfYesterday, prevEnd: startOfToday };
  }
  if (range === "7d") {
    const windowStart = daysAgo(7);
    const prevStart = daysAgo(14);
    return { windowStart, prevStart, prevEnd: windowStart };
  }
  if (range === "30d") {
    const windowStart = daysAgo(30);
    const prevStart = daysAgo(60);
    return { windowStart, prevStart, prevEnd: windowStart };
  }
  // "all" — headline numbers are true all-time totals; comparison still uses 30d vs prev-30d.
  return { windowStart: undefined, prevStart: daysAgo(60), prevEnd: daysAgo(30) };
};

// GET /api/admin/summary  (admin)
export const getAdminSummary = async (req: Request, res: Response) => {
  try {
    const last30 = daysAgo(30);
    const prev30 = daysAgo(60);

    // ── Stats Cards ─────────────────────────────────────────────────────────
    const [
      orderTotal,
      orderCurrent,
      orderPrev,
      userTotal,
      userCurrent,
      userPrev,
      productTotal,
      productCurrent,
      productPrev,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: last30 } }),
      Order.countDocuments({ createdAt: { $gte: prev30, $lt: last30 } }),

      User.countDocuments({ role: "CUSTOMER" }),
      User.countDocuments({
        role: "CUSTOMER", createdAt: { $gte: last30 },
      }),
      User.countDocuments({
        role: "CUSTOMER", createdAt: { $gte: prev30, $lt: last30 },
      }),

      Product.countDocuments(),
      Product.countDocuments({ createdAt: { $gte: last30 } }),
      Product.countDocuments({
        createdAt: { $gte: prev30, $lt: last30 },
      }),
    ]);

    // Revenue (sum of finalAmount on PAID orders)
    const revenueAll = await Order.aggregate([
      { $match: { paymentStatus: "PAID" } },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } }
    ]);
    const revenueCurrent = await Order.aggregate([
      { $match: { paymentStatus: "PAID", createdAt: { $gte: last30 } } },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } }
    ]);
    const revenuePrev = await Order.aggregate([
      { $match: { paymentStatus: "PAID", createdAt: { $gte: prev30, $lt: last30 } } },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } }
    ]);

    // ── Sales Chart (last 7 days) — grouped in the database, not in a JS loop over
    // every matching order ────────────────────────────────────────────────────────
    const sevenDaysAgo = daysAgo(7);
    const salesByDateAgg = await Order.aggregate([
      { $match: { paymentStatus: "PAID", createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const salesChart = salesByDateAgg.map((d: any) => ({ _id: d._id, revenue: d.revenue, orders: d.orders }));

    // ── Latest Orders ────────────────────────────────────────────────────────
    const latestOrders = await Order.find()
      .populate({
        path: 'user',
        select: 'id username email'
      })
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'id name price image'
        }
      })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      summary: {
        revenue: {
          total: revenueAll[0]?.total ?? 0,
          growth: calculatePercentage(
            revenueCurrent[0]?.total ?? 0,
            revenuePrev[0]?.total ?? 0,
          ),
        },
        orders: {
          total: orderTotal,
          growth: calculatePercentage(orderCurrent, orderPrev),
        },
        users: {
          total: userTotal,
          growth: calculatePercentage(userCurrent, userPrev),
        },
        products: {
          total: productTotal,
          growth: calculatePercentage(productCurrent, productPrev),
        },
      },
      salesChart,
      latestOrders,
    });
  } catch (err: any) {
    logger.error("getAdminSummary error", err);
    res.status(500).json({ message: "Error loading dashboard data" });
  }
};

// GET /api/admin/dashboard?range=all|30d|7d|today  (admin) — full live snapshot for dashboard home
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);
    const sixtyDaysAgo = daysAgo(60);

    const requestedRange = req.query.range as string | undefined;
    const validRanges: DashboardRange[] = ["all", "30d", "7d", "today"];
    const range: DashboardRange = validRanges.includes(requestedRange as DashboardRange)
      ? (requestedRange as DashboardRange)
      : "all";
    const { windowStart, prevStart, prevEnd } = getRangeWindow(range);
    // Today's actual calendar-day boundary — independent of the `range` filter above.
    // The "Daily Orders"/"Daily Revenue" cards need this regardless of what range the
    // rest of the dashboard is scoped to; "thisMonth" below never means "today" (it's
    // either a 30-day window or a duplicate of "total", see the comment below it).
    const { windowStart: startOfToday } = getRangeWindow("today");

    // "total" is a true all-time figure only when range === "all"; otherwise it's bounded
    // by the same window as "thisMonth" below (the two cards read as one number in the UI
    // for every range except "all", where they intentionally differ — see getRangeWindow).
    const totalDateFilter = range === "all" ? {} : { createdAt: { $gte: windowStart } };
    const windowDateFilter = range === "all" ? { createdAt: { $gte: thirtyDaysAgo } } : totalDateFilter;
    const prevDateFilter = { createdAt: { $gte: prevStart, $lt: prevEnd } };
    const todayDateFilter = { createdAt: { $gte: startOfToday } };
    // Same window as totalDateFilter, but keyed for a $match stage running after an
    // OrderItem→Order $lookup/$unwind (categoryRevenue/topProductItems below), where the
    // order's own createdAt lives under "order.createdAt" instead of "createdAt".
    const orderDateMatch = range === "all" ? {} : { "order.createdAt": { $gte: windowStart } };

    const [
      // Summary stats
      totalRevenueAgg,
      thisMonthRevenueAgg,
      prevMonthRevenueAgg,
      totalOrders,
      thisMonthOrders,
      prevMonthOrders,
      todayRevenueAgg,
      todayOrders,
      pendingOrders,
      totalCustomers,
      thisMonthCustomers,
      prevMonthCustomers,
      totalProducts,
      // Sales chart last 7 days — grouped in the database
      salesByDateAgg,
      // Order status counts
      processingCount,
      confirmedCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      returnedCount,
      // Low stock products
      lowStockProducts,
      // Recent orders
      recentOrders,
      // Payment methods
      onlineAgg,
      codAgg,
      // Category revenue breakdown
      categoryRevenue,
      // Top products
      topProductItems,
    ] = await Promise.all([
      Order.aggregate([{ $match: { paymentStatus: "PAID", ...totalDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.aggregate([{ $match: { paymentStatus: "PAID", ...windowDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.aggregate([{ $match: { paymentStatus: "PAID", ...prevDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.countDocuments(totalDateFilter),
      Order.countDocuments(windowDateFilter),
      Order.countDocuments(prevDateFilter),
      Order.aggregate([{ $match: { paymentStatus: "PAID", ...todayDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" } } }]),
      Order.countDocuments(todayDateFilter),
      Order.countDocuments({ orderStatus: "PROCESSING" }),
      User.countDocuments({ role: "CUSTOMER", ...totalDateFilter }),
      User.countDocuments({ role: "CUSTOMER", ...windowDateFilter }),
      User.countDocuments({ role: "CUSTOMER", ...prevDateFilter }),
      Product.countDocuments(),
      // Last 7 days revenue chart — grouped by day in the database, not by fetching
      // every matching order into Node and looping.
      Order.aggregate([
        { $match: { paymentStatus: "PAID", createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$finalAmount" },
            orders: { $sum: 1 },
          },
        },
      ]),
      // Order status breakdown
      Order.countDocuments({ orderStatus: "PROCESSING" }),
      Order.countDocuments({ orderStatus: "CONFIRMED" }),
      Order.countDocuments({ orderStatus: "SHIPPED" }),
      Order.countDocuments({ orderStatus: "DELIVERED" }),
      Order.countDocuments({ orderStatus: "CANCELLED" }),
      Order.countDocuments({ orderStatus: "RETURNED" }),
      // Low stock: products with stock <= 10, ordered by stock asc
      Product.find({ stock: { $lte: 10 } })
        .select('id name stock image')
        .populate('categoryId', 'name')
        .sort({ stock: 1 })
        .limit(50),
      // Recent orders
      Order.find()
        .select('id finalAmount orderStatus paymentStatus paymentMethod createdAt shippingAddress')
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .limit(20),
      // Payment methods — now scoped to the selected range, same as the summary cards.
      Order.aggregate([{ $match: { paymentMethod: "ONLINE", ...totalDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { paymentMethod: "POD", ...totalDateFilter } }, { $group: { _id: null, total: { $sum: "$finalAmount" }, count: { $sum: 1 } } }]),
      // Category revenue — a single aggregation pipeline joining OrderItem → Order (to
      // filter PAID + the selected date range) → Product → Category and grouping by
      // category, replacing what used to be up to 5,000 orders and 50,000 order items
      // pulled into Node memory and reduced with a JS loop.
      OrderItem.aggregate([
        { $lookup: { from: "orders", localField: "orderId", foreignField: "_id", as: "order" } },
        { $unwind: "$order" },
        { $match: { "order.paymentStatus": "PAID", ...orderDateMatch } },
        { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
        { $unwind: "$product" },
        {
          $group: {
            _id: "$product.categoryId",
            revenue: { $sum: { $multiply: ["$price", "$quantity"] } },
            unitsSold: { $sum: "$quantity" },
          },
        },
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
        { $unwind: "$category" },
        { $project: { _id: 0, id: "$_id", name: "$category.name", revenue: 1, unitsSold: 1 } },
        { $sort: { revenue: -1 } },
        { $limit: 20 },
      ]),
      // Top products by revenue — also scoped to PAID + the selected range now (previously
      // matched on OrderItem directly with no join at all, so it silently counted items
      // from every order regardless of payment status or date).
      OrderItem.aggregate([
        { $lookup: { from: "orders", localField: "orderId", foreignField: "_id", as: "order" } },
        { $unwind: "$order" },
        { $match: { "order.paymentStatus": "PAID", ...orderDateMatch } },
        { $group: { _id: "$productId", totalPrice: { $sum: { $multiply: ["$price", "$quantity"] } }, totalQuantity: { $sum: "$quantity" } } },
        { $sort: { totalPrice: -1 } },
        { $limit: 20 }
      ]),
    ]);

    // ── Sales chart (last 7 days) — fill the fixed 7-day skeleton (constant-size loop,
    // not proportional to order volume) with the per-day totals the database already
    // grouped above. ──────────────────────────────────────────────────────────────
    const salesByDate: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split("T")[0];
      salesByDate[key] = { date: key, revenue: 0, orders: 0 };
    }
    for (const day of salesByDateAgg) {
      if (salesByDate[day._id]) {
        salesByDate[day._id].revenue = day.revenue;
        salesByDate[day._id].orders = day.orders;
      }
    }

    // Category breakdown is now computed entirely in the database (see the
    // OrderItem.aggregate pipeline above) — already sorted and limited to 6.
    const topCategories = categoryRevenue;

    // ── Resolve top product names ──────────────────────────────────────────
    const productIds = topProductItems.map((i: any) => i._id);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('id name price image');
    const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]));
    const topProducts = topProductItems.map((item: any) => ({
      product: productMap[item._id] ?? null,
      totalRevenue: item.totalPrice ?? 0,
      totalQuantitySold: item.totalQuantity ?? 0,
    }));

    const pct = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({
      summary: {
        revenue: {
          total: totalRevenueAgg[0]?.total ?? 0,
          thisMonth: thisMonthRevenueAgg[0]?.total ?? 0,
          today: todayRevenueAgg[0]?.total ?? 0,
          growthPct: pct(thisMonthRevenueAgg[0]?.total ?? 0, prevMonthRevenueAgg[0]?.total ?? 0),
        },
        orders: {
          total: totalOrders,
          thisMonth: thisMonthOrders,
          today: todayOrders,
          pending: pendingOrders,
          growthPct: pct(thisMonthOrders, prevMonthOrders),
        },
        customers: {
          total: totalCustomers,
          thisMonth: thisMonthCustomers,
          growthPct: pct(thisMonthCustomers, prevMonthCustomers),
        },
        products: { total: totalProducts },
      },
      salesChart: Object.values(salesByDate),
      orderStatus: [
        { status: "PROCESSING", count: processingCount },
        { status: "CONFIRMED", count: confirmedCount },
        { status: "SHIPPED", count: shippedCount },
        { status: "DELIVERED", count: deliveredCount },
        { status: "CANCELLED", count: cancelledCount },
        { status: "RETURNED", count: returnedCount },
      ].filter((s) => s.count > 0),
      topCategories,
      topProducts,
      lowStockProducts,
      recentOrders,
      paymentMethods: [
        { method: "ONLINE", count: onlineAgg[0]?.count ?? 0, revenue: onlineAgg[0]?.total ?? 0 },
        { method: "COD", count: codAgg[0]?.count ?? 0, revenue: codAgg[0]?.total ?? 0 },
      ],
    });
  } catch (err: any) {
    logger.error("getDashboardData error", err);
    res.status(500).json({ message: "Error loading dashboard snapshot" });
  }
};

// GET /api/admin/users?page=1&limit=20  (admin)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", role, search } = req.query as Record<string, string | undefined>;

    const pageSize = Math.min(Math.max(parseInt(limit ?? "20") || 20, 1), 100);
    const skip = (Math.max(parseInt(page ?? "1") || 1, 1) - 1) * pageSize;

    // SUPER_ADMIN is always excluded — Admin is unaware of Super Admin's presence.
    // If a role filter is provided, respect it but never expose SUPER_ADMIN.
    const allowedRoles: ("CUSTOMER" | "ADMIN")[] = ["CUSTOMER", "ADMIN"];
    const requestedRole = role?.toUpperCase() as "CUSTOMER" | "ADMIN" | undefined;
    const where: any =
      requestedRole && allowedRoles.includes(requestedRole)
        ? { role: requestedRole }
        : { role: { $in: allowedRoles } };

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      where.$or = [
        { username: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(where)
        .select('id username email phone role createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      User.countDocuments(where),
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: Math.max(parseInt(page ?? "1") || 1, 1),
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    logger.error("getAllUsers error", err);
    res.status(500).json({ message: "Error fetching users" });
  }
};

// POST /api/admin/users  (admin)
export const createAdminUser = async (req: Request, res: Response) => {
  try {
    const { username, phone, password, role } = req.body as {
      username: string;
      email: string;
      phone: string;
      password: string;
      role: string;
    };
    // Normalize once — emails are matched/stored case-insensitively everywhere.
    const email: string = String(req.body.email).trim().toLowerCase();

    const emailExisted = await User.findOne({ email });
    if (emailExisted)
      return res.status(400).json({ Error: "An account with this email address already exists." });

    const phoneExisted = await User.findOne({ phone });
    if (phoneExisted)
      return res.status(400).json({ Error: "An account with this phone number already exists." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Admin cannot create another SUPER_ADMIN through this endpoint
    if (role.toUpperCase() === "SUPER_ADMIN" && req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Cannot create a Super Admin account via this endpoint." });
    }

    const normalizedRole = role.toUpperCase() as "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

    await User.create({
      username,
      email,
      phone,
      password: hashedPassword,
      role: normalizedRole,
      isVerified: true,
    });

    await createAuditLog({ req, action: "CREATE_USER", entity: "User", details: { username, email, role: normalizedRole } });
    res.json({ message: `User created successfully with role: ${normalizedRole}.` });
  } catch (err: any) {
    logger.error("createAdminUser error", err);
    if (err?.code === "P2002") {
      const field = err?.meta?.target?.includes("email") ? "email address" : "phone number";
      return res.status(400).json({ Error: `An account with this ${field} already exists.` });
    }
    res
      .status(500)
      .json({ message: "Error in creating user", Error: err.message });
  }
};

// PATCH /api/admin/users/:id  (admin)
export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { username, phone } = req.body as {
      username?: string;
      email?: string;
      phone?: string;
    };
    // Normalize once — emails are matched/stored case-insensitively everywhere.
    const email: string | undefined = req.body.email !== undefined
      ? (req.body.email ? String(req.body.email).trim().toLowerCase() : req.body.email)
      : undefined;

    const existing = await User.findById(id).select('id role');
    if (!existing) return res.status(404).json({ message: "User not found." });
    if (existing.role === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Cannot modify a Super Admin account." });
    }

    // Check uniqueness conflicts
    if (email || phone) {
      const orConditions: any[] = [];
      if (email) orConditions.push({ email });
      if (phone) orConditions.push({ phone });
      const conflict = await User.findOne({
        _id: { $ne: id },
        $or: orConditions
      }).select('id');
      if (conflict) {
        return res.status(400).json({ message: "Email or phone already in use by another account." });
      }
    }

    const updated = await User.findByIdAndUpdate(
      id,
      {
        ...(username !== undefined && { username }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
      { new: true }
    ).select('id username email phone role');

    await createAuditLog({
      req,
      action: "UPDATE_USER",
      entity: "User",
      entityId: id,
      details: { username, email, phone },
    });

    return res.json({ message: "User updated successfully.", user: updated });
  } catch (err: any) {
    logger.error("updateUser error", err);
    return res.status(500).json({ message: "Error updating user." });
  }
};

// DELETE /api/admin/users/:id  (admin)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const target = await User.findById(id).select('id role');
    if (!target) return res.status(404).json({ message: "User not found." });
    if (target.role === "SUPER_ADMIN") {
      return res.status(403).json({ message: "Cannot delete a Super Admin account." });
    }
    if (req.user?.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account." });
    }

    if (target.role === "ADMIN") {
      // Find all staff profiles managed by this admin
      const staffProfiles = await StaffProfile.find({ managedBy: id });
      const staffUserIds = staffProfiles.map((sp) => sp.userId);

      // Delete staff profiles
      await StaffProfile.deleteMany({ managedBy: id });

      // Delete staff users
      if (staffUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: staffUserIds } });
      }
    }

    await User.findByIdAndDelete(id);
    await createAuditLog({ req, action: "DELETE_USER", entity: "User", entityId: id, details: { role: target.role } });
    return res.json({ message: "User deleted successfully." });
  } catch (err: any) {
    logger.error("deleteUser error", err);
    return res.status(500).json({ message: "Error deleting user." });
  }
};

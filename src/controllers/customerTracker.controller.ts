// src/controllers/customerTracker.controller.ts
// Admin endpoint: list all customers who have a wishlist or cart,
// with item counts and full details on demand.
// Uses Mongoose (NOT Prisma) — this project is fully on Mongoose.

import { Request, Response } from "express";
import { User, Cart, CartItem, Wishlist } from "../models/mongoose";
import logger from "../utils/logger";

// ── Product fields to project in populate ────────────────────────────────────
const PRODUCT_PROJECT = "id name price image stock discount sizes code categoryId";

// GET /api/admin/tracker/customers
// Returns unique customers that have wishlist items OR cart items, with counts.
export const getTrackedCustomers = async (_req: Request, res: Response) => {
  try {
    // Aggregate wishlist counts (+ most recent addition) per user
    const wishlistAgg = await Wishlist.aggregate([
      { $group: { _id: "$userId", count: { $sum: 1 }, lastActivity: { $max: "$createdAt" } } },
    ]);

    // Aggregate cart item counts (+ most recent addition) per user via Cart → CartItem
    const carts = await Cart.find({}).select("_id userId").lean();
    const cartIdToUserId: Record<string, string> = {};
    carts.forEach((c: any) => {
      cartIdToUserId[c._id.toString()] = c.userId.toString();
    });

    const cartItemAgg = await CartItem.aggregate([
      { $group: { _id: "$cartId", count: { $sum: 1 }, lastActivity: { $max: "$createdAt" } } },
    ]);

    const wishlistCountByUser: Record<string, number> = {};
    // Kept separate per tab (not blended into one "last active") — the admin views
    // Wishlist and Cart as distinct tabs, so a wishlist add from a minute ago shouldn't
    // make it look like something also just happened in a cart that's actually stale.
    const lastWishlistActivityByUser: Record<string, Date> = {};
    wishlistAgg.forEach((r: any) => {
      const uid = r._id.toString();
      wishlistCountByUser[uid] = r.count;
      if (r.lastActivity) lastWishlistActivityByUser[uid] = r.lastActivity;
    });

    const cartCountByUser: Record<string, number> = {};
    const lastCartActivityByUser: Record<string, Date> = {};
    cartItemAgg.forEach((r: any) => {
      const uid = cartIdToUserId[r._id.toString()];
      if (!uid) return;
      cartCountByUser[uid] = r.count;
      if (r.lastActivity) lastCartActivityByUser[uid] = r.lastActivity;
    });

    const allUserIds = Array.from(
      new Set([
        ...Object.keys(wishlistCountByUser),
        ...Object.keys(cartCountByUser),
      ])
    );

    if (allUserIds.length === 0) return res.json({ customers: [] });

    const users = await User.find({
      _id: { $in: allUserIds },
      role: "CUSTOMER",
    })
      .select("_id username email phone avatar createdAt")
      .lean();

    const customers = users.map((u: any) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email ?? null,
      phone: u.phone ?? null,
      avatar: u.avatar ?? null,
      createdAt: u.createdAt,
      lastWishlistActivityAt: lastWishlistActivityByUser[u._id.toString()] ?? null,
      lastCartActivityAt: lastCartActivityByUser[u._id.toString()] ?? null,
      wishlistCount: wishlistCountByUser[u._id.toString()] ?? 0,
      cartCount: cartCountByUser[u._id.toString()] ?? 0,
    }));

    return res.json({ customers });
  } catch (err: any) {
    logger.error("getTrackedCustomers error", err);
    return res.status(500).json({ message: "Server error fetching tracked customers" });
  }
};

// GET /api/admin/tracker/customers/:userId/wishlist
export const getCustomerWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const [wishlistItems, user] = await Promise.all([
      Wishlist.find({ userId })
        .populate({
          path: "productId",
          select: PRODUCT_PROJECT,
          populate: { path: "categoryId", select: "name" },
        })
        .populate({ path: "variantId", select: "options priceOverride stock isActive" })
        .sort({ createdAt: -1 })
        .lean(),
      User.findById(userId).select("_id username email avatar").lean(),
    ]);

    // Each row's own wishlist _id becomes the display id (so two variants of the same
    // product don't collapse into one row in the admin's list — they used to share the
    // product's own id here) — variantOptions carries what distinguishes them (e.g.
    // "Size: L") for display.
    const items = wishlistItems
      .filter((i: any) => i.productId && (!i.variantId || i.variantId.isActive))
      .map((i: any) => {
        const p = i.productId ?? {};
        const v = i.variantId ?? null;
        return {
          id: i._id?.toString(),
          productId: p._id?.toString(),
          variantId: v?._id?.toString() ?? null,
          variantOptions: v?.options ?? null,
          name: p.name ?? "",
          price: v?.priceOverride ?? p.price ?? 0,
          image: p.image ?? null,
          stock: v ? (v.stock ?? 0) : (p.stock ?? 0),
          discount: p.discount ?? 0,
          sizes: p.sizes ?? [],
          code: p.code ?? "",
          category: p.categoryId ? { name: p.categoryId.name } : null,
          addedAt: i.createdAt,
        };
      });

    return res.json({ user, items });
  } catch (err: any) {
    logger.error("getCustomerWishlist error", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/admin/tracker/customers/:userId/cart
export const getCustomerCart = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const [cart, user] = await Promise.all([
      Cart.findOne({ userId }).lean(),
      User.findById(userId).select("_id username email avatar").lean(),
    ]);

    let items: any[] = [];

    if (cart) {
      const cartItems = await CartItem.find({ cartId: (cart as any)._id })
        .populate({
          path: "productId",
          select: PRODUCT_PROJECT,
          populate: { path: "categoryId", select: "name" },
        })
        .populate({ path: "variantId", select: "options priceOverride stock" })
        .lean();

      // Keyed by the cart item's own id (not the product's) — two different variants
      // of the same product are two separate cart lines and used to collapse into one
      // row here, same fix as getCustomerWishlist above. variantOptions/price/stock
      // reflect the specific variant actually in the cart, not the product's base values.
      items = cartItems.map((ci: any) => {
        const p = ci.productId ?? {};
        const v = ci.variantId ?? null;
        return {
          id: ci._id?.toString(),
          productId: p._id?.toString(),
          variantId: v?._id?.toString() ?? null,
          variantOptions: v?.options ?? null,
          name: p.name ?? "",
          price: v?.priceOverride ?? p.price ?? 0,
          image: p.image ?? null,
          stock: v ? (v.stock ?? 0) : (p.stock ?? 0),
          discount: p.discount ?? 0,
          sizes: p.sizes ?? [],
          code: p.code ?? "",
          category: p.categoryId ? { name: p.categoryId.name } : null,
          quantity: ci.quantity ?? 1,
          cartItemId: ci._id?.toString(),
        };
      });
    }

    const total = items.reduce(
      (sum: number, item: any) => sum + (item.price ?? 0) * (item.quantity ?? 1),
      0
    );

    return res.json({ user, items, total: total.toFixed(2) });
  } catch (err: any) {
    logger.error("getCustomerCart error", err);
    return res.status(500).json({ message: "Server error" });
  }
};

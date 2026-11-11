import { Request, Response } from "express";
import { Types } from "mongoose";
import logger from "../utils/logger";

const emitWishlistUpdate = (req: Request, userId: string, wishlistCount: number) => {
  try {
    const io = req.app.get("socketio");
    if (io) {
      // lastWishlistActivityAt lets CustomerActivityTracker.tsx bump its "last active"
      // display live — see getTrackedCustomers, which computes the same value from
      // Wishlist.createdAt on initial load.
      io.to("admin-room").emit("customer-wishlist-update", { userId, wishlistCount, lastWishlistActivityAt: new Date().toISOString() });
    }
  } catch {
    // Socket updates are non-critical for the customer request.
  }
};

// GET /api/user/wishlist (authenticated)
export const getWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const items = await prisma.wishlist.findMany({
      where: {
        userId,
        product: {
          isActive: true,
          category: { isActive: true }
        }
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            rating: true,
            code: true,
            stock: true,
          },
        },
        variant: {
          select: { id: true, options: true, priceOverride: true, stock: true, isActive: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // A variant-scoped entry whose variant has since been deleted or deactivated has
    // nothing left to show/buy — drop it rather than rendering a stale/broken row.
    // Each entry carries its OWN variantId/variantOptions/price/stock (falling back to
    // the product's own when this is a plain, non-variant wishlist entry) so the
    // frontend can tell "Classic Crew Neck Tee (Size: S)" apart from "(Size: L)"
    // instead of collapsing every option into one product-level row.
    const mapped = items
      .filter((i: any) => i.product && (!i.variantId || (i.variant && i.variant.isActive)))
      .map((i: any) => ({
        ...i.product,
        variantId: i.variant?.id ?? null,
        variantOptions: i.variant?.options ?? null,
        price: i.variant?.priceOverride ?? i.product.price,
        stock: i.variant ? i.variant.stock : i.product.stock,
      }));

    res.status(200).json({
      message: "Wishlist fetched successfully",
      items: mapped,
      count: mapped.length,
    });
  } catch (err: any) {
    logger.error("getWishlist error", err);
    res.status(500).json({ message: "Error fetching wishlist" });
  }
};

// POST /api/user/wishlist (authenticated)
export const addToWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { productId, variantId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    if (!Types.ObjectId.isValid(productId)) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (variantId && !Types.ObjectId.isValid(variantId)) {
      return res.status(404).json({ message: "Variant not found" });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { isActive: true } } },
    });

    if (!product || !product.isActive || (product.category && !product.category.isActive)) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || String(variant.productId) !== String(productId) || !variant.isActive) {
        return res.status(404).json({ message: "Variant not found" });
      }
    }

    const existing = await prisma.wishlist.findFirst({
      where: { userId, productId, variantId: variantId ?? null },
      select: { id: true },
    });

    if (!existing) {
      try {
        await prisma.wishlist.create({
          data: { userId, productId, variantId: variantId ?? null },
        });
      } catch (err: any) {
        if (err?.code !== 11000) {
          throw err;
        }
      }
    }

    const count = await prisma.wishlist.count({ where: { userId } });

    res.status(200).json({
      message: "Product added to wishlist successfully",
      wishlistCount: count,
    });
    emitWishlistUpdate(req, userId, count);
  } catch (err: any) {
    logger.error("addToWishlist error", err);
    res.status(500).json({ message: "Error adding to wishlist" });
  }
};

// DELETE /api/user/wishlist/:productId?variantId=  (authenticated)
export const removeFromWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const productId = req.params.productId as string;
    const variantId = (req.query.variantId as string | undefined) || null;

    // variantId: null in the where clause matches both a literal null AND a missing
    // field, so pre-existing rows saved before this column existed still delete fine.
    await prisma.wishlist.deleteMany({ where: { userId, productId, variantId } });

    const count = await prisma.wishlist.count({ where: { userId } });

    res.status(200).json({
      message: "Product removed from wishlist successfully",
      wishlistCount: count,
    });
    emitWishlistUpdate(req, userId, count);
  } catch (err: any) {
    logger.error("removeFromWishlist error", err);
    res.status(500).json({ message: "Error removing from wishlist" });
  }
};

// DELETE /api/user/wishlist (authenticated)
export const clearWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    await prisma.wishlist.deleteMany({ where: { userId } });

    res.status(200).json({ message: "Wishlist cleared successfully", wishlistCount: 0 });
  } catch (err: any) {
    logger.error("clearWishlist error", err);
    res.status(500).json({ message: "Error clearing wishlist" });
  }
};

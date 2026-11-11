// src/utils/categoryTree.ts
// Recursive category-tree resolution (arbitrary-depth subcategories). Uses MongoDB's
// $graphLookup via a raw Mongoose aggregate — the prisma.ts compatibility bridge has no
// aggregation/graphLookup support, so these bypass it and call the Category model directly.

import { Types } from "mongoose";
import { Category } from "../models/mongoose";
import { getCached, invalidateCache } from "./cache";

/** Returns [rootId, ...every descendant id], to any depth. Includes the root itself. */
export const getSubtreeCategoryIds = async (rootId: string): Promise<string[]> => {
  if (!Types.ObjectId.isValid(rootId)) return [rootId];

  const result = await Category.aggregate([
    { $match: { _id: new Types.ObjectId(rootId) } },
    {
      $graphLookup: {
        from: Category.collection.name,
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parentId",
        as: "descendants",
      },
    },
    { $project: { descendantIds: "$descendants._id" } },
  ]).exec();

  const doc = result[0] as { descendantIds?: Types.ObjectId[] } | undefined;
  if (!doc) return [rootId];
  return [rootId, ...(doc.descendantIds ?? []).map((id) => id.toString())];
};

/**
 * Cached read path for the customer storefront (getProductsByCategoryId/searchProducts/
 * getProductFilters in product-user.controller.ts) — a $graphLookup aggregate on every
 * single category-page/search-request was previously redone from scratch each time even
 * though the category tree changes rarely. NOT used by wouldCreateCycle below: that's an
 * admin write-path correctness check (is this move about to create a cycle?) and must
 * always see the tree as of right now, not a value that's up to 60s stale.
 */
export const getCachedSubtreeCategoryIds = (rootId: string): Promise<string[]> =>
  getCached(`category-subtree:${rootId}`, () => getSubtreeCategoryIds(rootId));

/** Call after any category create/update/delete/move — see category.controller.ts. */
export const invalidateSubtreeCache = (categoryId: string): Promise<void> =>
  invalidateCache(`category-subtree:${categoryId}`);

/**
 * True if moving `categoryId` to become a child of `newParentId` would create a cycle
 * (the new parent is the category itself, or one of its own descendants).
 */
export const wouldCreateCycle = async (categoryId: string, newParentId: string): Promise<boolean> => {
  const subtreeIds = await getSubtreeCategoryIds(categoryId);
  return subtreeIds.includes(newParentId);
};

// ── Category/product exclusivity rule ──────────────────────────────────────────
// A category may hold direct products OR subcategories, never both at once. These
// go through the prisma.ts bridge (not raw Mongoose like the graphLookup helpers
// above) since they're plain count/groupBy queries the bridge already handles,
// tenant-scoped the same way every other prisma.*.count/groupBy call is.

export const categoryHasDirectProducts = async (categoryId: string): Promise<boolean> =>
  (await prisma.product.count({ where: { categoryId } })) > 0;

export const categoryHasSubcategories = async (categoryId: string): Promise<boolean> =>
  (await prisma.category.count({ where: { parentId: categoryId } })) > 0;

// A category may also hold attributes OR subcategories, never both — attributes are
// only meaningful on a category that can hold a direct product (see attribute.controller.ts).
export const categoryHasAttributes = async (categoryId: string): Promise<boolean> =>
  (await prisma.categoryAttribute.count({ where: { categoryId } })) > 0;

/** Direct (non-recursive) product count per category id, for the ids given. */
export const getDirectProductCounts = async (categoryIds: string[]): Promise<Record<string, number>> => {
  if (categoryIds.length === 0) return {};
  const rows = await prisma.product.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: categoryIds } },
    _count: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows as any[]) {
    if (row.categoryId) counts[String(row.categoryId)] = row._count.id;
  }
  return counts;
};

/** Direct (non-recursive) subcategory count per category id, for the ids given. */
export const getDirectSubcategoryCounts = async (categoryIds: string[]): Promise<Record<string, number>> => {
  if (categoryIds.length === 0) return {};
  const rows = await prisma.category.groupBy({
    by: ["parentId"],
    where: { parentId: { in: categoryIds } },
    _count: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows as any[]) {
    if (row.parentId) counts[String(row.parentId)] = row._count.id;
  }
  return counts;
};

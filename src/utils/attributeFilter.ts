// src/utils/attributeFilter.ts
// Shared "filter products by attribute value" logic for both the customer storefront
// (product-user.controller.ts's getProductsByCategoryId) and the admin product list
// (product.controller.ts's productList). Both accept the same `attributeValueIds`
// query param shape: a comma-separated list of CategoryAttributeValue ids.
//
// The caller only sends a flat list of ids (it doesn't know or care which attribute
// each one belongs to — the filter UI just emits "everything the user selected"). To
// filter correctly we need to AND across distinct attributes (Color AND Size) while
// ORing within the same attribute (Red OR Blue), so this re-groups the flat list by
// attribute name server-side. Grouping by name (not attributeId) also matters because
// the same conceptual attribute is often defined independently on multiple leaf
// categories (see product-user.controller.ts's getProductFilters, which already merges
// same-named attributes across a category subtree for display) — those get OR'd
// together too, same as multiple values picked within one attribute.

import { ProductVariant } from "../models/mongoose";

export interface AttributeFilterResult {
  conditions: Prisma.ProductWhereInput[];
  /** productId -> the specific variant ids that satisfy EVERY selected attribute group
   * for which we have variant-level match info (intersected across those groups) —
   * used by getProductsByCategoryId to narrow expandProductsWithVariants' one-row-per-
   * active-variant output down to only the variant(s) that actually match, instead of
   * showing every size/color of a product just because ONE of its variants matched.
   * A product absent from this map had every matching group resolved only via an
   * unscoped (whole-product) tag — there's no specific variant to narrow to, so every
   * active variant should still show, same as before this map existed. Unused by the
   * admin product list (productList), which stays one row per product regardless. */
  variantNarrowing: Map<string, Set<string>>;
}

export const buildAttributeValueWhereConditions = async (idsCsv: string): Promise<AttributeFilterResult> => {
  const ids = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { conditions: [], variantNarrowing: new Map() };

  const values = await prisma.categoryAttributeValue.findMany({
    where: { id: { in: ids } },
    include: { attribute: { select: { name: true } } },
  });

  // Keeps the attribute's real-case name and the selected values' own strings too —
  // needed below to ALSO match via ProductVariant.options, which is keyed by whatever
  // case the admin typed while building variants (normally the same as the filter's
  // own attribute name, since both name the same real-world axis, e.g. "Liquid").
  const byName = new Map<string, { valueIds: string[]; attrName: string; values: string[] }>();
  for (const v of values as any[]) {
    const attrName = String(v.attribute?.name ?? "").trim();
    if (!attrName) continue;
    const key = attrName.toLowerCase();
    const group = byName.get(key) ?? { valueIds: [], attrName, values: [] };
    group.valueIds.push(v.id);
    group.values.push(String(v.value));
    byName.set(key, group);
  }

  // NOTE: this deliberately does NOT use Prisma's `{ attributeValues: { some: {...} } }`
  // to-many relation filter shape, even though that's the "real Prisma" way to express
  // this. The hand-rolled bridge in config/prisma.ts has no reverse `attributeValues`
  // relation registered on Product (only the forward relations on
  // ProductAttributeValue), and its relation-filter resolver isn't built for
  // array/reverse relations regardless — a `some` filter here silently translates to a
  // literal (nonexistent) `attributeValues` field path and matches zero documents every
  // time. Resolving the join manually below is the version that actually works.
  // Each selected attribute group (Size, Color, ...) is resolved independently of every
  // other group — none of them read each other's results — so run all groups
  // concurrently instead of one-at-a-time. `.map` over byName.values() (not a for-loop)
  // preserves each group's own AND/OR position in `conditions`/`perGroupVariantMaps`
  // regardless of which group's queries happen to resolve first.
  const groupResults = await Promise.all(
    [...byName.values()].map(async ({ valueIds, attrName, values: valueStrings }) => {
      // Neither query depends on the other's result — both only need valueIds/attrName,
      // known up front — so fire them together instead of sequentially.
      const [tagMatches, variantMatches] = await Promise.all([
        prisma.productAttributeValue.findMany({
          where: { attributeValueId: { in: valueIds } },
          select: { productId: true, variantId: true },
        }),
        // WORKAROUND: a product's Category Filters tag and its ProductVariant rows are
        // still two separate systems (see mongoose.ts's ProductVariant) — this doesn't
        // merge them. It just also recognises variant data when it's there, so a product
        // that was never explicitly tagged "Liquid: 10ml" but genuinely HAS an active
        // 10ml variant still shows up when a customer filters by 10ml, instead of only
        // surfacing products the admin remembered to double-enter into both places. Raw
        // Mongoose (not the prisma bridge) because this is a dot-path query into a Mixed
        // field — same reliability reasoning as cart.controller.ts's cartList.
        ProductVariant.find({
          isActive: true,
          [`options.${attrName}`]: { $in: valueStrings },
        })
          .select("productId")
          .lean(),
      ]);

      // A tag scoped to a specific variant (see mongoose.ts's ProductAttributeValue)
      // should only count as a match while that variant is still active — otherwise a
      // product could keep surfacing under a filter value that nothing purchasable on
      // it actually has anymore. Unscoped tags (variantId null) always count, same as
      // before this field existed.
      const scopedVariantIds = [
        ...new Set(tagMatches.filter((m: any) => m.variantId).map((m: any) => String(m.variantId))),
      ];
      const activeScopedVariantIds = scopedVariantIds.length
        ? new Set(
            (await ProductVariant.find({ _id: { $in: scopedVariantIds }, isActive: true }).select("_id").lean()).map(
              (v: any) => String(v._id),
            ),
          )
        : new Set<string>();

      const productIds = new Set<string>();
      // Products this group matched via an unscoped (whole-product) tag — these can
      // never be narrowed to specific variants for THIS group, even if one of their
      // variants also happens to carry a scoped match below (the unscoped tag already
      // says every variant qualifies, so narrowing would wrongly hide the others).
      const unscopedProductIds = new Set<string>();
      // Products this group matched via a variant-specific signal (scoped tag or raw
      // ProductVariant.options) — productId -> the specific variant id(s) that matched.
      const groupVariantMap = new Map<string, Set<string>>();

      for (const m of tagMatches as any[]) {
        const pid = String(m.productId);
        if (m.variantId) {
          if (activeScopedVariantIds.has(String(m.variantId))) {
            productIds.add(pid);
            const set = groupVariantMap.get(pid) ?? new Set<string>();
            set.add(String(m.variantId));
            groupVariantMap.set(pid, set);
          }
        } else {
          productIds.add(pid);
          unscopedProductIds.add(pid);
        }
      }

      for (const vm of variantMatches as any[]) {
        const pid = String(vm.productId);
        productIds.add(pid);
        const set = groupVariantMap.get(pid) ?? new Set<string>();
        set.add(String(vm._id));
        groupVariantMap.set(pid, set);
      }

      // Drop narrowing for any product this group also matched unscoped — that tag
      // means the whole product qualifies for this group, so every variant passes it.
      for (const pid of unscopedProductIds) groupVariantMap.delete(pid);

      return { productIds, groupVariantMap };
    }),
  );

  const conditions: Prisma.ProductWhereInput[] = [];
  // One map per selected attribute group (Size, Color, ...) — productId -> the variant
  // ids that specifically satisfy THAT group, only for products where every match came
  // with a known variant (see the per-group loop below for what disqualifies a product
  // from having an entry here).
  const perGroupVariantMaps: Array<Map<string, Set<string>>> = [];
  for (const { productIds, groupVariantMap } of groupResults) {
    perGroupVariantMaps.push(groupVariantMap);
    conditions.push({ id: { in: [...productIds] } });
  }

  // Intersect each product's per-group variant sets across every group that actually
  // has narrowing info for it (AND semantics, matching the product-level AND across
  // conditions above) — a group with no entry for a product contributes no constraint,
  // since that group only ever matched that product at the whole-product level.
  const variantNarrowing = new Map<string, Set<string>>();
  const candidateProductIds = new Set<string>();
  for (const groupMap of perGroupVariantMaps) for (const pid of groupMap.keys()) candidateProductIds.add(pid);
  for (const pid of candidateProductIds) {
    let intersection: Set<string> | null = null;
    for (const groupMap of perGroupVariantMaps) {
      const groupSet = groupMap.get(pid);
      if (!groupSet) continue;
      if (intersection === null) {
        intersection = new Set(groupSet);
      } else {
        const narrowed: Set<string> = intersection;
        intersection = new Set([...narrowed].filter((v: string) => groupSet.has(v)));
      }
    }
    if (intersection !== null) variantNarrowing.set(pid, intersection);
  }

  return { conditions, variantNarrowing };
};

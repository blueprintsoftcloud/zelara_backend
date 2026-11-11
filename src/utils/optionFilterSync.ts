// src/utils/optionFilterSync.ts
// Bridges the two previously-separate option/filter systems: when an admin marks a
// product-variant option group (e.g. "Storage: 128GB, 512GB") as filterable while
// adding it in the Options builder, this finds-or-creates the matching
// CategoryAttribute + CategoryAttributeValue rows and tags each newly-created variant
// with the value it actually got — so a single "Options" step is enough for the
// storefront filter panel to pick it up, with no separate trip through Category
// Management and no manual per-variant assignment (see productVariant.controller.ts's
// generateVariants, the only call site).
//
// Auto-created attributes are always SELECT: a variant only ever has one value per
// option axis by construction (that's what makes it a distinct combination), so
// MULTISELECT — several values true on one product at once — doesn't apply to an
// option-derived attribute. MULTISELECT is still available for attributes an admin
// defines by hand in Category Management.

import { CategoryAttribute } from "../models/mongoose";
import logger from "./logger";

interface OptionGroupForSync {
  name: string;
  values: string[];
  isFilterable?: boolean;
}

interface VariantForSync {
  id: string;
  options: Record<string, string>;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Best-effort — never throws. A sync failure for one (or every) group shouldn't roll
 * back variants that were already created successfully; it just means that group
 * stays a plain, non-filterable option until an admin fixes it up by hand.
 */
export const syncOptionGroupsToFilters = async (
  categoryId: string,
  productId: string,
  groups: OptionGroupForSync[],
  variants: VariantForSync[],
): Promise<void> => {
  const filterableGroups = groups.filter((g) => g.isFilterable && g.name && g.values.length > 0);
  if (filterableGroups.length === 0 || variants.length === 0) return;

  for (const group of filterableGroups) {
    try {
      // Case-insensitive name match — the hand-rolled Prisma bridge isn't built for
      // regex operators, so this one lookup goes through the raw Mongoose model (same
      // reasoning as attributeFilter.ts's variant options match).
      const attribute = await CategoryAttribute.findOne({
        categoryId,
        name: new RegExp(`^${escapeRegex(group.name)}$`, "i"),
      });
      let attributeId: string;
      if (!attribute) {
        const created = await prisma.categoryAttribute.create({
          data: { categoryId, name: group.name, type: "SELECT", isFilterable: true, isRequired: false, sortOrder: 0 },
        });
        attributeId = created.id;
      } else {
        attributeId = String(attribute.id ?? attribute._id);
        if (!attribute.isFilterable) {
          await prisma.categoryAttribute.update({ where: { id: attributeId }, data: { isFilterable: true } });
        }
      }

      const existingValues = await prisma.categoryAttributeValue.findMany({ where: { attributeId } });
      const valueIdByLower = new Map<string, string>(
        existingValues.map((v: any) => [String(v.value).toLowerCase(), v.id]),
      );
      for (const raw of group.values) {
        const lower = raw.toLowerCase();
        if (valueIdByLower.has(lower)) continue;
        const created = await prisma.categoryAttributeValue.create({ data: { attributeId, value: raw, sortOrder: 0 } });
        valueIdByLower.set(lower, created.id);
      }

      for (const variant of variants) {
        const rawValue = variant.options?.[group.name];
        if (!rawValue) continue;
        const attributeValueId = valueIdByLower.get(String(rawValue).toLowerCase());
        if (!attributeValueId) continue;
        // Replace rather than skip-if-exists — regenerating with different values for
        // an already-tagged variant (e.g. admin fixes a typo and re-adds) shouldn't
        // leave a stale tag alongside the fresh one.
        await prisma.productAttributeValue.deleteMany({ where: { variantId: variant.id, attributeId } });
        await prisma.productAttributeValue.create({
          data: { productId, attributeId, attributeValueId, variantId: variant.id },
        });
      }
    } catch (err) {
      logger.error(`syncOptionGroupsToFilters: failed for group "${group.name}"`, err);
    }
  }
};

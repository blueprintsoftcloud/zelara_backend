import { Request, Response } from "express";
import { Attribute, AttributeValue, AttributeTypeEnum } from "../models/mongoose";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";
import { categoryHasSubcategories } from "../utils/categoryTree";

// A BOOLEAN attribute is modeled as a fixed Yes/No pair of real CategoryAttributeValue
// rows rather than free text — that's what lets it go through the exact same id-based
// tagging (ProductAttributeValue.attributeValueId) and filtering
// (utils/attributeFilter.ts, product-user.controller.ts's getProductFilters) path as
// SELECT/MULTISELECT, instead of being a dead end that can never be set on a product
// or matched by a filter.
const seedBooleanValues = (attributeId: string) =>
  Promise.all([
    prisma.categoryAttributeValue.create({ data: { attributeId, value: "Yes", sortOrder: 0 } }),
    prisma.categoryAttributeValue.create({ data: { attributeId, value: "No", sortOrder: 1 } }),
  ]);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/category/:categoryId/attributes
// Returns all attributes + their predefined values for a category.
// Used by: product-add form, product-edit form, customer filter panel.
export const getCategoryAttributes = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;

    const attributes = await prisma.categoryAttribute.findMany({
      where: { categoryId },
      include: { values: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });

    res.json({ attributes });
  } catch (err: any) {
    logger.error("getCategoryAttributes error", err);
    res.status(500).json({ message: "Error fetching category attributes" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Attribute CRUD
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/category/:categoryId/attributes
export const addCategoryAttribute = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const { name, type, isFilterable, isRequired, sortOrder } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required" });
    }

    if (!AttributeTypeEnum.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${AttributeTypeEnum.join(", ")}` });
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    if (await categoryHasSubcategories(categoryId)) {
      return res.status(409).json({
        message: "Cannot add an attribute here: this category has subcategories. Attributes can only be defined on categories that hold products directly.",
        code: "CATEGORY_HAS_SUBCATEGORIES",
      });
    }

    const attribute = await prisma.categoryAttribute.create({
      data: {
        categoryId,
        name: name.trim(),
        type,
        isFilterable: isFilterable !== undefined ? Boolean(isFilterable) : true,
        isRequired: isRequired !== undefined ? Boolean(isRequired) : false,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
      include: { values: true },
    });

    // BOOLEAN needs the same real, id-backed CategoryAttributeValue rows SELECT/
    // MULTISELECT get — product tagging and filtering are both entirely id-based
    // (see utils/attributeFilter.ts and product-user.controller.ts's
    // getProductFilters), so a boolean attribute with no values would be
    // unsettable on a product and unfilterable in the storefront panel.
    attribute.values = type === "BOOLEAN" ? await seedBooleanValues(attribute.id) : attribute.values;

    await createAuditLog({
      req,
      action: "ADD_CATEGORY_ATTRIBUTE",
      entity: "CategoryAttribute",
      entityId: attribute.id,
      details: { categoryId, name: attribute.name, type: attribute.type },
    });

    res.status(201).json({ message: "Attribute added", attribute });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "An attribute with this name already exists in this category" });
    }
    logger.error("addCategoryAttribute error", err);
    res.status(500).json({ message: "Error adding attribute" });
  }
};

// PUT /api/category/:categoryId/attributes/:attrId
export const updateCategoryAttribute = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const attrId = req.params.attrId as string;
    const { name, type, isFilterable, isRequired, sortOrder } = req.body;

    const existing = await prisma.categoryAttribute.findFirst({
      where: { id: attrId, categoryId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Attribute not found" });
    }

    if (type && !AttributeTypeEnum.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${AttributeTypeEnum.join(", ")}` });
    }

    const updated = await prisma.categoryAttribute.update({
      where: { id: attrId },
      data: {
        name: name ? name.trim() : existing.name,
        type: type ?? existing.type,
        isFilterable: isFilterable !== undefined ? Boolean(isFilterable) : existing.isFilterable,
        isRequired: isRequired !== undefined ? Boolean(isRequired) : existing.isRequired,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : existing.sortOrder,
      },
      include: { values: { orderBy: { sortOrder: "asc" } } },
    });

    // Retyping an attribute to BOOLEAN needs the same Yes/No seeding addCategoryAttribute
    // does on create — only when it has no values yet, so this doesn't clobber values an
    // admin already added before repurposing a SELECT/MULTISELECT into a BOOLEAN.
    if (updated.type === "BOOLEAN" && (await prisma.categoryAttributeValue.count({ where: { attributeId: attrId } })) === 0) {
      await seedBooleanValues(attrId);
    }

    res.json({ message: "Attribute updated", attribute: updated });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "An attribute with this name already exists in this category" });
    }
    logger.error("updateCategoryAttribute error", err);
    res.status(500).json({ message: "Error updating attribute" });
  }
};

// DELETE /api/category/:categoryId/attributes/:attrId
export const deleteCategoryAttribute = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const attrId = req.params.attrId as string;

    const existing = await prisma.categoryAttribute.findFirst({
      where: { id: attrId, categoryId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Attribute not found" });
    }

    // The prisma.ts bridge's delete/deleteMany are plain Mongoose findOneAndDelete/
    // deleteMany — no ref cleanup — so values and product tags must be cleaned up
    // explicitly or they're left as orphaned rows.
    await prisma.categoryAttributeValue.deleteMany({ where: { attributeId: attrId } });
    await prisma.productAttributeValue.deleteMany({ where: { attributeId: attrId } });
    await prisma.categoryAttribute.delete({ where: { id: attrId } });

    await createAuditLog({
      req,
      action: "DELETE_CATEGORY_ATTRIBUTE",
      entity: "CategoryAttribute",
      entityId: attrId,
      details: { categoryId, name: existing.name },
    });

    res.json({ message: "Attribute deleted" });
  } catch (err: any) {
    logger.error("deleteCategoryAttribute error", err);
    res.status(500).json({ message: "Error deleting attribute" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Attribute Value CRUD
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/category/:categoryId/attributes/:attrId/values
export const addAttributeValue = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const attrId = req.params.attrId as string;
    const { value, sortOrder } = req.body;

    if (!value || !value.trim()) {
      return res.status(400).json({ message: "value is required" });
    }

    const attribute = await prisma.categoryAttribute.findFirst({
      where: { id: attrId, categoryId },
    });
    if (!attribute) {
      return res.status(404).json({ message: "Attribute not found" });
    }

    const attrValue = await prisma.categoryAttributeValue.create({
      data: {
        attributeId: attrId,
        value: value.trim(),
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    });

    res.status(201).json({ message: "Value added", value: attrValue });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "This value already exists for this attribute" });
    }
    logger.error("addAttributeValue error", err);
    res.status(500).json({ message: "Error adding attribute value" });
  }
};

// PUT /api/category/:categoryId/attributes/:attrId/values/:valueId
export const updateAttributeValue = async (req: Request, res: Response) => {
  try {
    const attrId = req.params.attrId as string;
    const valueId = req.params.valueId as string;
    const { value, sortOrder } = req.body;

    const existing = await prisma.categoryAttributeValue.findFirst({
      where: { id: valueId, attributeId: attrId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Attribute value not found" });
    }

    const updated = await prisma.categoryAttributeValue.update({
      where: { id: valueId },
      data: {
        value: value ? value.trim() : existing.value,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : existing.sortOrder,
      },
    });

    res.json({ message: "Value updated", value: updated });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "This value already exists for this attribute" });
    }
    logger.error("updateAttributeValue error", err);
    res.status(500).json({ message: "Error updating attribute value" });
  }
};

// DELETE /api/category/:categoryId/attributes/:attrId/values/:valueId
export const deleteAttributeValue = async (req: Request, res: Response) => {
  try {
    const attrId = req.params.attrId as string;
    const valueId = req.params.valueId as string;

    const existing = await prisma.categoryAttributeValue.findFirst({
      where: { id: valueId, attributeId: attrId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Attribute value not found" });
    }

    await prisma.productAttributeValue.deleteMany({ where: { attributeValueId: valueId } });
    await prisma.categoryAttributeValue.delete({ where: { id: valueId } });

    res.json({ message: "Value deleted" });
  } catch (err: any) {
    logger.error("deleteAttributeValue error", err);
    res.status(500).json({ message: "Error deleting attribute value" });
  }
};

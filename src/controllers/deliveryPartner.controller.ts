import { Request, Response } from "express";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";

// GET /api/delivery-partners?search=
export const listDeliveryPartners = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let whereClause: any = { isActive: true };

    if (search && typeof search === "string" && search.trim() !== "") {
      whereClause = { ...whereClause, name: { contains: search.trim(), mode: "insensitive" } };
    }

    const list = await prisma.deliveryPartner.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
    });
    res.json({ list });
  } catch (err: any) {
    logger.error("listDeliveryPartners error", err);
    res.status(500).json({ message: "Error fetching delivery partners" });
  }
};

// POST /api/delivery-partners  (admin/staff)
export const createDeliveryPartner = async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Delivery partner name is required" });
    }

    try {
      const partner = await prisma.deliveryPartner.create({
        data: { name: name.trim() },
      });
      await createAuditLog({
        req,
        action: "CREATE_DELIVERY_PARTNER",
        entity: "DeliveryPartner",
        entityId: partner.id,
        details: { name: partner.name },
      });
      res.status(201).json({ message: "Delivery partner added", partner });
    } catch (err: any) {
      // Two admins racing to add the same new courier shouldn't be a hard failure —
      // reuse the existing record instead of erroring out the ship-order flow.
      if (err?.code === 11000) {
        const existing = await prisma.deliveryPartner.findFirst({ where: { name: name.trim() } });
        if (existing) return res.status(200).json({ message: "Delivery partner already exists", partner: existing });
      }
      throw err;
    }
  } catch (err: any) {
    logger.error("createDeliveryPartner error", err);
    res.status(500).json({ message: "Error adding delivery partner" });
  }
};

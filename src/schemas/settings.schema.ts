// src/schemas/settings.schema.ts
import { z } from "zod";

export const updateWarehouseSettingsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  name: z.string().max(200).trim().optional(),
});

export const updateShippingConfigSchema = z.object({
  sameStatePerKmRate: z.coerce.number().min(0).optional(),
  sameStateFreeKmThreshold: z.coerce.number().min(0).optional(),
  noLocationFlatRate: z.coerce.number().min(0).optional(),
  stateRates: z.union([z.string(), z.record(z.string(), z.coerce.number())]).optional(),
  districtRates: z.union([z.string(), z.record(z.string(), z.record(z.string(), z.coerce.number()))]).optional(),
  calculateShippingForCOD: z.boolean().optional(),
  calculateShippingForOnline: z.boolean().optional(),
  calculateShippingForQR: z.boolean().optional(),
});
export const updateTrackingPartnerSettingsSchema = z.object({
  enabled: z.boolean(),
  enabledPartners: z.array(z.string().trim()).default([]),
  partnerUrls: z.record(z.string(), z.string()).optional(),
  deletedPartners: z.array(z.string().trim()).optional(),
});

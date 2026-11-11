import { Request, Response } from "express";
import { AppSetting, DeliveryPartner } from "../models/mongoose";
import logger from "../utils/logger";
import { createAuditLog } from "../utils/auditLog";
import { env } from "../config/env";

export const resolvePartnerTrackingUrl = (partnerName: string): string => {
  const norm = partnerName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  // DHL (Express / Global / eCommerce)
  if (norm.includes("dhl")) {
    return "https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}&brand=DHL";
  }

  // Delhivery
  if (norm.includes("delhivery")) {
    return "https://www.delhivery.com/track/package/{trackingNumber}";
  }

  // DTDC / DTDC Express
  if (norm.includes("dtdc")) {
    return "https://tracking.dtdc.com/ctapp/services?cType=awb&awbNo={trackingNumber}";
  }

  // Blue Dart / Bluedart
  if (norm.includes("bluedart") || (norm.includes("blue") && norm.includes("dart"))) {
    return "https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={trackingNumber}";
  }

  // India Post / Speed Post / EMS
  if (norm.includes("indiapost") || norm.includes("speedpost") || norm.includes("post")) {
    return "https://www.indiapost.gov.in/_layouts/15/dpt.cept.tracking/trackconsignment.aspx";
  }

  // Shadowfax
  if (norm.includes("shadowfax")) {
    return "https://tracker.shadowfax.in/#/track/{trackingNumber}";
  }

  // Ekart Logistics
  if (norm.includes("ekart")) {
    return "https://ekartlogistics.com/shipmenttrack/{trackingNumber}";
  }

  // XpressBees
  if (norm.includes("xpress") || norm.includes("xpressbees")) {
    return "https://www.xpressbees.com/track?awb={trackingNumber}";
  }

  // Ecom Express
  if (norm.includes("ecomexpress") || norm.includes("ecom")) {
    return "https://ecomexpress.in/tracking/?awb={trackingNumber}";
  }

  // FedEx
  if (norm.includes("fedex")) {
    return "https://www.fedex.com/fedextrack/?trknbr={trackingNumber}";
  }

  // Amazon Shipping
  if (norm.includes("amazon")) {
    return "https://track.amazon.in/tracking/{trackingNumber}";
  }

  // Aramex
  if (norm.includes("aramex")) {
    return "https://www.aramex.com/track/results?ShipmentNumber={trackingNumber}";
  }

  // UPS
  if (norm.includes("ups")) {
    return "https://www.ups.com/track?tracknum={trackingNumber}";
  }

  // Gati / Gati-KWE / Allcargo Gati
  if (norm.includes("gati")) {
    return "https://www.gati.com/";
  }

  // Professional Couriers / TPC
  if (norm.includes("professional") || norm.includes("tpc")) {
    return "https://www.tpcindia.com/";
  }

  // ST Courier / ST Couriers
  if (norm.includes("stcourier") || (norm.includes("st") && norm.includes("courier"))) {
    return "https://stcourier.com/";
  }

  // Trackon Courier
  if (norm.includes("trackon")) {
    return "https://trackon.in/";
  }

  // VRL Logistics
  if (norm.includes("vrl")) {
    return "https://www.vrlgroup.in/";
  }

  // Maruti Courier / Shree Maruti Courier
  if (norm.includes("maruti")) {
    return "https://shreemaruticourier.com/";
  }

  // Nandan Couriers / Shree Nandan Courier
  if (norm.includes("nandan")) {
    return "https://www.shreenandan.com/";
  }

  // Overnite Express
  if (norm.includes("overnite")) {
    return "https://www.overnite-express.com/";
  }

  // Tirupati Courier / Shree Tirupati Courier
  if (norm.includes("tirupati")) {
    return "https://www.shreetirupaticourier.net/";
  }

  // Anjani Courier / Shree Anjani Courier
  if (norm.includes("anjani")) {
    return "https://shreeanjanicourier.com/";
  }

  // Smartr Logistics
  if (norm.includes("smartr")) {
    return "https://smartr.in/tracking";
  }

  // Safechem
  if (norm.includes("safechem")) {
    return "https://www.safechem.in/";
  }

  // First Flight
  if (norm.includes("firstflight") || (norm.includes("first") && norm.includes("flight"))) {
    return "https://www.firstflight.net/";
  }

  return `https://${encodeURIComponent(partnerName.toLowerCase().replace(/\s+/g, ""))}.com`;
};

export const DEFAULT_TRACKING_URL_TEMPLATES: Record<string, string> = {
  "Delhivery": "https://www.delhivery.com/track/package/{trackingNumber}",
  "DTDC": "https://tracking.dtdc.com/ctapp/services?cType=awb&awbNo={trackingNumber}",
  "Blue Dart": "https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={trackingNumber}",
  "India Post (Speed Post)": "https://www.indiapost.gov.in/_layouts/15/dpt.cept.tracking/trackconsignment.aspx",
  "Shadowfax": "https://tracker.shadowfax.in/#/track/{trackingNumber}",
  "Ekart Logistics": "https://ekartlogistics.com/shipmenttrack/{trackingNumber}",
  "XpressBees": "https://www.xpressbees.com/track?awb={trackingNumber}",
  "Ecom Express": "https://ecomexpress.in/tracking/?awb={trackingNumber}",
  "FedEx": "https://www.fedex.com/fedextrack/?trknbr={trackingNumber}",
  "DHL": "https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}&brand=DHL",
  "DHL Express": "https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}&brand=DHL",
  "Gati-KWE": "https://www.gati.com/",
  "Professional Couriers": "https://www.tpcindia.com/",
  "ST Courier": "https://stcourier.com/",
  "Trackon Courier": "https://trackon.in/",
  "VRL Logistics": "https://www.vrlgroup.in/",
  "Maruti Courier": "https://shreemaruticourier.com/",
  "Nandan Couriers": "https://www.shreenandan.com/",
  "Overnite Express": "https://www.overnite-express.com/",
  "Amazon Shipping": "https://track.amazon.in/tracking/{trackingNumber}",
  "Aramex": "https://www.aramex.com/track/results?ShipmentNumber={trackingNumber}",
  "UPS": "https://www.ups.com/track?tracknum={trackingNumber}",
};

// Default warehouse coords (from .env / hard-coded fallback)
const DEFAULT_WAREHOUSE_LAT = parseFloat(env.WAREHOUSE_LAT) || 9.9312;
const DEFAULT_WAREHOUSE_LNG = parseFloat(env.WAREHOUSE_LNG) || 76.2673;

// ── GET /api/settings/warehouse  (admin / super-admin) ────────────────────────
export const getWarehouseSettings = async (req: Request, res: Response) => {
  try {
    const [latSetting, lngSetting, nameSetting] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: "WAREHOUSE_LAT" } }),
      prisma.appSetting.findUnique({ where: { key: "WAREHOUSE_LNG" } }),
      prisma.appSetting.findUnique({ where: { key: "WAREHOUSE_NAME" } }),
    ]);

    res.status(200).json({
      lat: latSetting ? parseFloat(latSetting.value) : DEFAULT_WAREHOUSE_LAT,
      lng: lngSetting ? parseFloat(lngSetting.value) : DEFAULT_WAREHOUSE_LNG,
      name: nameSetting?.value ?? "Main Warehouse",
    });
  } catch (err: any) {
    logger.error("getWarehouseSettings error", err);
    res.status(500).json({ message: "Failed to fetch warehouse settings" });
  }
};

// ── PUT /api/settings/warehouse  (super-admin only) ───────────────────────────
export const updateWarehouseSettings = async (req: Request, res: Response) => {
  try {
    const { lat, lng, name } = req.body as { lat?: number; lng?: number; name?: string };

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const latNum = parseFloat(String(lat));
    const lngNum = parseFloat(String(lng));

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ message: "lat must be a number between -90 and 90" });
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ message: "lng must be a number between -180 and 180" });
    }

    await Promise.all([
      prisma.appSetting.upsert({
        where: { key: "WAREHOUSE_LAT" },
        update: { value: String(latNum) },
        create: { key: "WAREHOUSE_LAT", value: String(latNum) },
      }),
      prisma.appSetting.upsert({
        where: { key: "WAREHOUSE_LNG" },
        update: { value: String(lngNum) },
        create: { key: "WAREHOUSE_LNG", value: String(lngNum) },
      }),
      name !== undefined
        ? prisma.appSetting.upsert({
          where: { key: "WAREHOUSE_NAME" },
          update: { value: name },
          create: { key: "WAREHOUSE_NAME", value: name },
        })
        : Promise.resolve(),
    ]);

    await createAuditLog({
      req,
      action: "UPDATE_WAREHOUSE_SETTINGS",
      entity: "AppSetting",
      details: { lat: latNum, lng: lngNum, name },
    });

    res.status(200).json({
      message: "Warehouse settings updated",
      lat: latNum,
      lng: lngNum,
      name: name ?? "Main Warehouse",
    });
  } catch (err: any) {
    logger.error("updateWarehouseSettings error", err);
    res.status(500).json({ message: "Failed to update warehouse settings" });
  }
};

// ── Shipping Configuration ────────────────────────────────────────────────────────────

const SHIPPING_DEFAULTS: Record<string, string> = {
  SHIPPING_SAME_STATE_PER_KM: "5",
  SHIPPING_SAME_STATE_FREE_KM: "10",
  SHIPPING_NO_LOCATION_FLAT: "50",
  SHIPPING_STATE_RATES: JSON.stringify({ Kerala: 50 }),
  SHIPPING_DISTRICT_RATES: JSON.stringify({}),
  SHIPPING_CALCULATE_COD: "true",
  SHIPPING_CALCULATE_ONLINE: "true",
  SHIPPING_CALCULATE_QR: "true",
};

// GET /api/settings/shipping-config  (admin / super-admin)
export const getShippingConfig = async (req: Request, res: Response) => {
  try {
    const keys = Object.keys(SHIPPING_DEFAULTS);
    const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, any> = {};
    for (const s of settings) map[s.key] = s.value;

    let stateRates: Record<string, number> = { Kerala: 50 };
    if (map["SHIPPING_STATE_RATES"]) {
      try {
        stateRates = typeof map["SHIPPING_STATE_RATES"] === "string"
          ? JSON.parse(map["SHIPPING_STATE_RATES"])
          : map["SHIPPING_STATE_RATES"];
      } catch (e) {
        logger.error("Failed to parse state rates map", e);
      }
    }

    let districtRates: Record<string, Record<string, number>> = {};
    if (map["SHIPPING_DISTRICT_RATES"]) {
      try {
        districtRates = typeof map["SHIPPING_DISTRICT_RATES"] === "string"
          ? JSON.parse(map["SHIPPING_DISTRICT_RATES"])
          : map["SHIPPING_DISTRICT_RATES"];
      } catch (e) {
        logger.error("Failed to parse district rates map", e);
      }
    }

    res.json({
      sameStatePerKmRate: Number(map["SHIPPING_SAME_STATE_PER_KM"] ?? 5),
      sameStateFreeKmThreshold: Number(map["SHIPPING_SAME_STATE_FREE_KM"] ?? 10),
      noLocationFlatRate: Number(map["SHIPPING_NO_LOCATION_FLAT"] ?? 50),
      stateRates,
      districtRates,
      calculateShippingForCOD: map["SHIPPING_CALCULATE_COD"] !== "false" && map["SHIPPING_CALCULATE_COD"] !== false,
      calculateShippingForOnline: map["SHIPPING_CALCULATE_ONLINE"] !== "false" && map["SHIPPING_CALCULATE_ONLINE"] !== false,
      calculateShippingForQR: map["SHIPPING_CALCULATE_QR"] !== "false" && map["SHIPPING_CALCULATE_QR"] !== false,
    });
  } catch (err: any) {
    logger.error("getShippingConfig error", err);
    res.status(500).json({ message: "Failed to fetch shipping config" });
  }
};

// PUT /api/settings/shipping-config  (admin / super-admin)
export const updateShippingConfig = async (req: Request, res: Response) => {
  try {
    const {
      sameStatePerKmRate,
      sameStateFreeKmThreshold,
      noLocationFlatRate,
      stateRates,
      districtRates,
      calculateShippingForCOD,
      calculateShippingForOnline,
      calculateShippingForQR,
    } = req.body;
    const entries: Record<string, any> = {};
    if (sameStatePerKmRate !== undefined) entries["SHIPPING_SAME_STATE_PER_KM"] = String(Number(sameStatePerKmRate));
    if (sameStateFreeKmThreshold !== undefined) entries["SHIPPING_SAME_STATE_FREE_KM"] = String(Number(sameStateFreeKmThreshold));
    if (noLocationFlatRate !== undefined) entries["SHIPPING_NO_LOCATION_FLAT"] = String(Number(noLocationFlatRate));
    if (stateRates !== undefined) {
      entries["SHIPPING_STATE_RATES"] = typeof stateRates === "string" ? stateRates : JSON.stringify(stateRates);
    }
    if (districtRates !== undefined) {
      entries["SHIPPING_DISTRICT_RATES"] = typeof districtRates === "string" ? districtRates : JSON.stringify(districtRates);
    }
    if (calculateShippingForCOD !== undefined) {
      entries["SHIPPING_CALCULATE_COD"] = String(Boolean(calculateShippingForCOD));
    }
    if (calculateShippingForOnline !== undefined) {
      entries["SHIPPING_CALCULATE_ONLINE"] = String(Boolean(calculateShippingForOnline));
    }
    if (calculateShippingForQR !== undefined) {
      entries["SHIPPING_CALCULATE_QR"] = String(Boolean(calculateShippingForQR));
    }

    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        prisma.appSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );

    // Clean up/delete old settings keys entirely
    const oldKeys = [
      "SHIPPING_SAME_STATE",
      "SHIPPING_OTHER_STATE_FLAT",
      "SHIPPING_SAME_STATE_BASE",
      "SHIPPING_MANUAL_FLAT",
    ];
    await prisma.appSetting.deleteMany({
      where: { key: { in: oldKeys } }
    });

    await createAuditLog({ req, action: "UPDATE_SHIPPING_CONFIG", entity: "AppSetting", details: req.body });
    res.json({ message: "Shipping configuration updated" });
  } catch (err: any) {
    logger.error("updateShippingConfig error", err);
    res.status(500).json({ message: "Failed to update shipping config" });
  }
};

// ── GET /api/settings/tracking-partners  (public) ─────────────────────────────
export const getTrackingPartnerSettings = async (req: Request, res: Response) => {
  try {
    const [enabledSetting, partnersSetting, urlOverridesSetting, deletedPartnersSetting, dbPartners] = await Promise.all([
      AppSetting.findOne({ key: "TRACKING_NAVBAR_ENABLED" }),
      AppSetting.findOne({ key: "CUSTOMER_TRACKING_PARTNERS" }),
      AppSetting.findOne({ key: "CUSTOMER_TRACKING_URL_OVERRIDES" }),
      AppSetting.findOne({ key: "CUSTOMER_DELETED_TRACKING_PARTNERS" }),
      DeliveryPartner.find({ isActive: true }).sort({ name: 1 }),
    ]);

    const enabled = enabledSetting ? enabledSetting.value === "true" : true;
    let enabledPartners: string[] = ["DTDC", "Delhivery"];
    if (partnersSetting && partnersSetting.value) {
      try {
        const parsed = JSON.parse(partnersSetting.value);
        if (Array.isArray(parsed)) enabledPartners = parsed;
      } catch {
        enabledPartners = partnersSetting.value.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
    }

    let urlOverrides: Record<string, string> = {};
    if (urlOverridesSetting && urlOverridesSetting.value) {
      try {
        const parsed = JSON.parse(urlOverridesSetting.value);
        if (parsed && typeof parsed === "object") urlOverrides = parsed;
      } catch {}
    }

    let deletedPartners: string[] = [];
    if (deletedPartnersSetting && deletedPartnersSetting.value) {
      try {
        const parsed = JSON.parse(deletedPartnersSetting.value);
        if (Array.isArray(parsed)) deletedPartners = parsed.map((s: any) => String(s).trim().toLowerCase());
      } catch {}
    }

    const partnerMap = new Map<string, string>();
    // Seed default URL templates
    Object.entries(DEFAULT_TRACKING_URL_TEMPLATES).forEach(([name, template]) => {
      if (!deletedPartners.includes(name.toLowerCase())) {
        partnerMap.set(name, template);
      }
    });
    // Add DB partners
    dbPartners.forEach((p) => {
      if (!deletedPartners.includes(p.name.toLowerCase()) && !partnerMap.has(p.name)) {
        partnerMap.set(p.name, resolvePartnerTrackingUrl(p.name));
      }
    });

    // Apply custom URL overrides
    Object.entries(urlOverrides).forEach(([name, customUrl]) => {
      if (!deletedPartners.includes(name.toLowerCase()) && customUrl && typeof customUrl === "string") {
        partnerMap.set(name, customUrl.trim());
      }
    });

    const availablePartners = Array.from(partnerMap.entries()).map(([name, trackingUrlTemplate]) => ({
      name,
      trackingUrlTemplate,
    }));

    // Filter enabled partners to ensure deleted ones are excluded
    let activeEnabledPartners = enabledPartners.filter(
      (p) => !deletedPartners.includes(p.toLowerCase()) && partnerMap.has(p)
    );

    if (activeEnabledPartners.length === 0 && availablePartners.length > 0) {
      const defaults = ["DTDC", "Delhivery"].filter(
        (d) => !deletedPartners.includes(d.toLowerCase()) && partnerMap.has(d)
      );
      activeEnabledPartners = defaults.length > 0 ? defaults : [availablePartners[0].name];
    }

    res.status(200).json({
      enabled,
      enabledPartners: activeEnabledPartners,
      availablePartners,
      partnerUrls: urlOverrides,
      deletedPartners,
    });
  } catch (err: any) {
    logger.error("getTrackingPartnerSettings error", err);
    res.status(500).json({ message: "Failed to fetch tracking partner settings" });
  }
};

// ── PUT /api/settings/tracking-partners  (admin / staff) ──────────────────────
export const updateTrackingPartnerSettings = async (req: Request, res: Response) => {
  try {
    const { enabled, enabledPartners, partnerUrls, deletedPartners } = req.body as {
      enabled: boolean;
      enabledPartners: string[];
      partnerUrls?: Record<string, string>;
      deletedPartners?: string[];
    };

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }
    if (!Array.isArray(enabledPartners)) {
      return res.status(400).json({ message: "enabledPartners must be an array of partner names" });
    }

    const cleanDeleted = Array.isArray(deletedPartners)
      ? deletedPartners.map((p) => String(p).trim()).filter(Boolean)
      : [];
    const deletedLower = cleanDeleted.map((p) => p.toLowerCase());

    const cleanPartners = enabledPartners
      .map((p) => String(p).trim())
      .filter((p) => Boolean(p) && !deletedLower.includes(p.toLowerCase()));

    const updateOps: Promise<any>[] = [
      AppSetting.findOneAndUpdate(
        { key: "TRACKING_NAVBAR_ENABLED" },
        { key: "TRACKING_NAVBAR_ENABLED", value: String(enabled) },
        { upsert: true, new: true }
      ),
      AppSetting.findOneAndUpdate(
        { key: "CUSTOMER_TRACKING_PARTNERS" },
        { key: "CUSTOMER_TRACKING_PARTNERS", value: JSON.stringify(cleanPartners) },
        { upsert: true, new: true }
      ),
      AppSetting.findOneAndUpdate(
        { key: "CUSTOMER_DELETED_TRACKING_PARTNERS" },
        { key: "CUSTOMER_DELETED_TRACKING_PARTNERS", value: JSON.stringify(cleanDeleted) },
        { upsert: true, new: true }
      ),
    ];

    if (cleanDeleted.length > 0) {
      updateOps.push(
        DeliveryPartner.updateMany(
          { name: { $in: cleanDeleted } },
          { isActive: false }
        )
      );
    }

    if (partnerUrls && typeof partnerUrls === "object") {
      const cleanUrls: Record<string, string> = {};
      Object.entries(partnerUrls).forEach(([k, v]) => {
        if (typeof v === "string" && v.trim() && !deletedLower.includes(k.toLowerCase())) {
          cleanUrls[k.trim()] = v.trim();
        }
      });
      updateOps.push(
        AppSetting.findOneAndUpdate(
          { key: "CUSTOMER_TRACKING_URL_OVERRIDES" },
          { key: "CUSTOMER_TRACKING_URL_OVERRIDES", value: JSON.stringify(cleanUrls) },
          { upsert: true, new: true }
        )
      );
    }

    await Promise.all(updateOps);

    await createAuditLog({
      req,
      action: "UPDATE_TRACKING_PARTNERS",
      entity: "AppSetting",
      details: { enabled, enabledPartners: cleanPartners, partnerUrls, deletedPartners: cleanDeleted },
    });

    res.status(200).json({
      message: "Customer tracking settings updated successfully",
      enabled,
      enabledPartners: cleanPartners,
      partnerUrls: partnerUrls || {},
      deletedPartners: cleanDeleted,
    });
  } catch (err: any) {
    logger.error("updateTrackingPartnerSettings error", err);
    res.status(500).json({ message: "Failed to update tracking partner settings" });
  }
};

// ── DELETE /api/settings/tracking-partners/:partnerName (admin / staff) ────────
export const deleteTrackingPartner = async (req: Request, res: Response) => {
  try {
    const partnerName = String(req.params.partnerName || "").trim();
    if (!partnerName) {
      return res.status(400).json({ message: "partnerName parameter is required" });
    }

    const [deletedPartnersSetting, partnersSetting] = await Promise.all([
      AppSetting.findOne({ key: "CUSTOMER_DELETED_TRACKING_PARTNERS" }),
      AppSetting.findOne({ key: "CUSTOMER_TRACKING_PARTNERS" }),
    ]);

    let deletedPartners: string[] = [];
    if (deletedPartnersSetting?.value) {
      try {
        const parsed = JSON.parse(deletedPartnersSetting.value);
        if (Array.isArray(parsed)) deletedPartners = parsed;
      } catch {}
    }

    if (!deletedPartners.some((p) => p.toLowerCase() === partnerName.toLowerCase())) {
      deletedPartners.push(partnerName);
    }

    let enabledPartners: string[] = [];
    if (partnersSetting?.value) {
      try {
        const parsed = JSON.parse(partnersSetting.value);
        if (Array.isArray(parsed)) {
          enabledPartners = parsed.filter((p) => p.toLowerCase() !== partnerName.toLowerCase());
        }
      } catch {}
    }

    await Promise.all([
      AppSetting.findOneAndUpdate(
        { key: "CUSTOMER_DELETED_TRACKING_PARTNERS" },
        { key: "CUSTOMER_DELETED_TRACKING_PARTNERS", value: JSON.stringify(deletedPartners) },
        { upsert: true, new: true }
      ),
      AppSetting.findOneAndUpdate(
        { key: "CUSTOMER_TRACKING_PARTNERS" },
        { key: "CUSTOMER_TRACKING_PARTNERS", value: JSON.stringify(enabledPartners) },
        { upsert: true, new: true }
      ),
      DeliveryPartner.updateMany({ name: partnerName }, { isActive: false }),
    ]);

    await createAuditLog({
      req,
      action: "DELETE_TRACKING_PARTNER",
      entity: "AppSetting",
      details: { deletedPartner: partnerName },
    });

    res.status(200).json({
      message: `Partner ${partnerName} deleted successfully`,
      deletedPartners,
    });
  } catch (err: any) {
    logger.error("deleteTrackingPartner error", err);
    res.status(500).json({ message: "Failed to delete tracking partner" });
  }
};

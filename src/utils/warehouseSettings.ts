// src/utils/warehouseSettings.ts
// Reads warehouse coordinates from AppSetting table (DB-backed).
// Falls back to .env / hardcoded Kerala defaults if not yet configured.

import { AppSetting } from "../models/mongoose";
import { env } from "../config/env";

const DEFAULT_LAT = parseFloat(env.WAREHOUSE_LAT) || 9.9312;
const DEFAULT_LNG = parseFloat(env.WAREHOUSE_LNG) || 76.2673;

export interface WarehouseCoords {
  lat: number;
  lng: number;
}

export async function getWarehouseCoords(): Promise<WarehouseCoords> {
  const [latSetting, lngSetting] = await Promise.all([
    AppSetting.findOne({ key: "WAREHOUSE_LAT" }),
    AppSetting.findOne({ key: "WAREHOUSE_LNG" }),
  ]);

  return {
    lat: latSetting ? parseFloat(latSetting.value) : DEFAULT_LAT,
    lng: lngSetting ? parseFloat(lngSetting.value) : DEFAULT_LNG,
  };
}

// ── Shipping config ────────────────────────────────────────────────────────────

import type { ShippingConfig } from "../services/shipping.service";

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

export async function getShippingConfigFromDB(): Promise<ShippingConfig> {
  const keys = Object.keys(SHIPPING_DEFAULTS);
  const settings = await AppSetting.find({ key: { $in: keys } });
  const map: Record<string, any> = {};
  for (const s of settings) map[s.key] = s.value;

  let stateRates: Record<string, number> = { Kerala: 50 };
  if (map["SHIPPING_STATE_RATES"]) {
    try {
      stateRates = typeof map["SHIPPING_STATE_RATES"] === "string"
        ? JSON.parse(map["SHIPPING_STATE_RATES"])
        : map["SHIPPING_STATE_RATES"];
    } catch (e) {
      console.warn("Failed to parse SHIPPING_STATE_RATES", e);
    }
  }

  let districtRates: Record<string, Record<string, number>> = {};
  if (map["SHIPPING_DISTRICT_RATES"]) {
    try {
      districtRates = typeof map["SHIPPING_DISTRICT_RATES"] === "string"
        ? JSON.parse(map["SHIPPING_DISTRICT_RATES"])
        : map["SHIPPING_DISTRICT_RATES"];
    } catch (e) {
      console.warn("Failed to parse SHIPPING_DISTRICT_RATES", e);
    }
  }

  return {
    sameStatePerKmRate: Number(map["SHIPPING_SAME_STATE_PER_KM"] ?? 5),
    sameStateFreeKmThreshold: Number(map["SHIPPING_SAME_STATE_FREE_KM"] ?? 10),
    noLocationFlatRate: Number(map["SHIPPING_NO_LOCATION_FLAT"] ?? 50),
    stateRates,
    districtRates,
    calculateShippingForCOD: map["SHIPPING_CALCULATE_COD"] !== "false" && map["SHIPPING_CALCULATE_COD"] !== false,
    calculateShippingForOnline: map["SHIPPING_CALCULATE_ONLINE"] !== "false" && map["SHIPPING_CALCULATE_ONLINE"] !== false,
    calculateShippingForQR: map["SHIPPING_CALCULATE_QR"] !== "false" && map["SHIPPING_CALCULATE_QR"] !== false,
  };
}

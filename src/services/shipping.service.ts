// src/services/shipping.service.ts
// Single source of truth for shipping calculation.
// Replaces duplicate Haversine code in orderController.js and addressController.js.

import { env } from "../config/env";

// Keep env-based warehouse as the sync default (used when callers already have coords)
export const DEFAULT_WAREHOUSE = {
  lat: parseFloat(env.WAREHOUSE_LAT) || 9.9312,
  lng: parseFloat(env.WAREHOUSE_LNG) || 76.2673,
};

const BASE_SHIPPING_LOCAL = 50; // Flat fee up to 10 km (within same city)
const PER_KM_CHARGE = 5; // Extra per KM beyond 10 km
const STATE_FLAT_RATE = 150; // Different Indian state
const GLOBAL_FLAT_RATE = 1500; // International

// Minimum valid coordinate: treat 0,0 (null island) as "unknown"
const isValidCoord = (lat: number, lng: number): boolean =>
  !(lat === 0 && lng === 0) && !isNaN(lat) && !isNaN(lng);

export interface ShippingResult {
  shippingCharge: number;
  distanceKm: number;
}

/**
 * Haversine formula — calculates straight-line distance between two lat/lng points in km.
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Calculate shipping charge based on customer location, country, and state.
 *
 * @param customerLat  - Customer latitude  (null/0 = unknown → use flat rates)
 * @param customerLng  - Customer longitude (null/0 = unknown → use flat rates)
 * @param country      - Customer country string
 * @param state        - Customer state string
 * @param warehouseLat - Warehouse latitude  (defaults to DEFAULT_WAREHOUSE.lat)
 * @param warehouseLng - Warehouse longitude (defaults to DEFAULT_WAREHOUSE.lng)
 */
export const calculateShipping = (
  customerLat: number,
  customerLng: number,
  country: string,
  state: string,
  warehouseLat: number = DEFAULT_WAREHOUSE.lat,
  warehouseLng: number = DEFAULT_WAREHOUSE.lng,
): ShippingResult => {
  // International orders: flat rate regardless of known/unknown coords
  if (country && country.toLowerCase() !== "india") {
    return { shippingCharge: GLOBAL_FLAT_RATE, distanceKm: 0 };
  }

  // Different Indian state: flat rate
  if (state && state.toLowerCase() !== "kerala") {
    return { shippingCharge: STATE_FLAT_RATE, distanceKm: 0 };
  }

  // Within Kerala: use distance if we have real coords, otherwise flat local rate
  if (!isValidCoord(customerLat, customerLng)) {
    // No GPS data (manual address) — charge the base local rate as a safe default
    return { shippingCharge: BASE_SHIPPING_LOCAL, distanceKm: 0 };
  }

  const distanceKm = calculateDistance(
    warehouseLat,
    warehouseLng,
    customerLat,
    customerLng,
  );

  const shippingCharge =
    distanceKm <= 10
      ? BASE_SHIPPING_LOCAL
      : BASE_SHIPPING_LOCAL + Math.round(distanceKm - 10) * PER_KM_CHARGE;

  return { shippingCharge, distanceKm };
};

// ── Configurable shipping ──────────────────────────────────────────────────────

import NodeGeocoder from "node-geocoder";
const geocoder = NodeGeocoder({ provider: "openstreetmap" });

export interface ShippingConfig {
  sameStateFreeKmThreshold: number; // 10 km default
  sameStatePerKmRate: number;      // ₹5/km default
  noLocationFlatRate: number;      // ₹50 default
  stateRates: Record<string, number>;
  /** Optional per-district/city override, nested under the state it belongs to —
   * e.g. { Kerala: { Ernakulam: 40, Kochi: 35 } }. When the customer's city matches
   * an entry here (case-insensitive) it wins over that state's flat stateRates value. */
  districtRates?: Record<string, Record<string, number>>;
  /** Payment method toggles for shipping price calculation */
  calculateShippingForCOD?: boolean;
  calculateShippingForOnline?: boolean;
  calculateShippingForQR?: boolean;
}

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  sameStateFreeKmThreshold: 10,
  sameStatePerKmRate: 5,
  noLocationFlatRate: 50,
  stateRates: { Kerala: 50 },
  districtRates: {},
  calculateShippingForCOD: true,
  calculateShippingForOnline: true,
  calculateShippingForQR: true,
};

export interface ShippingBreakdown {
  shippingCharge: number;
  distanceKm: number;
  type: "other_state" | "same_state_gps" | "manual" | "free";
  label: string;
}

export const resolvePincodeToCentroid = async (zipCode: string): Promise<{ lat: number; lng: number } | null> => {
  const cleanZip = zipCode.trim();
  if (!/^\d{6}$/.test(cleanZip)) return null;
  try {
    const results = await geocoder.geocode(`${cleanZip}, India`);
    if (results && results.length > 0) {
      const lat = results[0].latitude;
      const lng = results[0].longitude;
      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  } catch {
    // Ignored
  }
  return null;
};

/**
 * DB-config-aware shipping calculator — rates come from ShippingConfig (stored in AppSetting).
 * Keeps the same logic as calculateShipping but uses configurable thresholds.
 */
export const calculateShippingWithConfig = async (
  customerLat: number,
  customerLng: number,
  country: string,
  state: string,
  city: string = "",
  zipCode: string = "",
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG,
  warehouseLat: number = DEFAULT_WAREHOUSE.lat,
  warehouseLng: number = DEFAULT_WAREHOUSE.lng,
): Promise<ShippingBreakdown> => {
  // No international shipping
  if (country && country.toLowerCase() !== "india") {
    return { shippingCharge: 0, distanceKm: 0, type: "other_state", label: "Delivery is only available in India" };
  }

  const stateClean = (state || "").trim().toLowerCase();
  const rates = config.stateRates || {};
  const matchedKey = Object.keys(rates).find((k) => k.toLowerCase() === stateClean);
  const baseRate = matchedKey ? rates[matchedKey] : 0;
  const matchedStateName = matchedKey || state || "India";

  // A configured district/city rate (nested under the matched state) wins over that
  // state's flat rate — e.g. Kerala is ₹50 flat, but Ernakulam is ₹40.
  // Search districtRates by state name directly (independent of whether stateRates has this state).
  const districtRatesAll = config.districtRates || {};
  const matchedDistrictStateKey = Object.keys(districtRatesAll).find(
    (k) => k.toLowerCase() === stateClean
  );
  const districtMap = matchedDistrictStateKey ? districtRatesAll[matchedDistrictStateKey] : undefined;

  const cityClean = (city || "").trim().toLowerCase();
  let matchedDistrictKey: string | undefined;

  if (districtMap) {
    // 1. Exact match (case-insensitive)
    matchedDistrictKey = Object.keys(districtMap).find(
      (k) => k.toLowerCase().trim() === cityClean
    );

    // 2. Substring match (e.g. "Kollam City" vs "Kollam", or district in cityClean)
    if (!matchedDistrictKey && cityClean) {
      matchedDistrictKey = Object.keys(districtMap).find((k) => {
        const kLower = k.toLowerCase().trim();
        return cityClean.includes(kLower) || kLower.includes(cityClean);
      });
    }
  }

  if (matchedDistrictKey && districtMap) {
    const districtRate = districtMap[matchedDistrictKey];
    const displayState = matchedDistrictStateKey || matchedStateName;
    return {
      shippingCharge: districtRate,
      distanceKm: 0,
      type: "manual",
      label: `${matchedDistrictKey}, ${displayState} district rate — ₹${districtRate} flat`,
    };
  }

  return {
    shippingCharge: baseRate,
    distanceKm: 0,
    type: "manual",
    label: `${matchedStateName} base rate — ₹${baseRate} flat`,
  };
};


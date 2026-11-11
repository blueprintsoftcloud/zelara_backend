// scripts/seedDeliveryPartners.ts
//
// Seeds a starter list of common Indian courier/delivery partners into the shared
// DeliveryPartner list, so the admin isn't starting from a completely empty
// autocomplete on first use of the ship-order flow.
//
// Idempotent: upserts by name, safe to re-run without duplicating or erroring on
// partners that already exist.
//
// Usage:
//   npm run seed:delivery-partners

import "dotenv/config";
import { connectDB, disconnectDB } from "../src/config/database";
import { DeliveryPartner } from "../src/models/mongoose";

// Pan-India majors, plus a deliberate concentration of couriers with a strong or
// originating presence in South India (Professional Couriers, ST Courier, Maruti
// Courier, Nandan Couriers, Overnite Express, Trackon Courier, VRL Logistics).
const PARTNER_NAMES = [
  "Blue Dart",
  "DTDC",
  "Delhivery",
  "DHL Express",
  "Ecom Express",
  "Ekart Logistics",
  "FedEx",
  "Gati-KWE",
  "India Post (Speed Post)",
  "Maruti Courier",
  "Nandan Couriers",
  "Overnite Express",
  "Professional Couriers",
  "Shadowfax",
  "ST Courier",
  "Trackon Courier",
  "VRL Logistics",
  "XpressBees",
];

async function seedDeliveryPartners() {
  console.log("🚀 === SEEDING DELIVERY PARTNERS ===\n");
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB\n");

    let created = 0;
    let existing = 0;
    for (const name of PARTNER_NAMES) {
      const result = await DeliveryPartner.updateOne(
        { name },
        { $setOnInsert: { name, isActive: true } },
        { upsert: true },
      );
      if (result.upsertedCount > 0) created++;
      else existing++;
    }
    console.log(`✅ ${created} added, ${existing} already present.`);

    console.log("\n✨ === DELIVERY PARTNERS SEEDED ===\n");
  } catch (error) {
    console.error("❌ Critical error during delivery-partner seeding:", error);
    process.exit(1);
  } finally {
    await disconnectDB();
    console.log("🔌 Disconnected from MongoDB");
  }
}

seedDeliveryPartners();

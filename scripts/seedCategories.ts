import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Category } from "../src/models/mongoose";

const SAMPLE_CATEGORIES = [
  { code: "ELECTRONICS", name: "Electronics", description: "Electronic devices and gadgets" },
  { code: "CLOTHING", name: "Clothing", description: "Fashion and apparel" },
  { code: "HOME", name: "Home & Garden", description: "Home improvement and garden supplies" },
  { code: "BOOKS", name: "Books", description: "Books and publications" },
  { code: "SPORTS", name: "Sports & Outdoors", description: "Sports equipment and outdoor gear" },
];

async function seedCategories() {
  try {
    const url = process.env.MONGO_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("MONGO_URL or DATABASE_URL not found in .env");

    await mongoose.connect(url);
    console.log("✅ MongoDB connected");

    console.log("\n🌱 Seeding sample categories...");
    for (const catData of SAMPLE_CATEGORIES) {
      const existingCat = await Category.findOne({ code: catData.code });
      if (!existingCat) {
        const category = await Category.create(catData);
        console.log(`   ✅ Created category: ${category.name} (${category.code})`);
      } else {
        console.log(`   ⚠️  Category already exists: ${existingCat.name} (${existingCat.code})`);
      }
    }
    console.log("✅ Sample categories seeded!");

  } catch (err) {
    console.error("❌ Failed to seed categories:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ MongoDB disconnected");
  }
}

seedCategories();
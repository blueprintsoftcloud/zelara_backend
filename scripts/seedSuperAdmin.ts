import mongoose from "mongoose";
import * as bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { User, Category } from "../src/models/mongoose";

const SUPER_ADMIN = {
  username: "Super Admin",
  email: "pingwgc@gmail.com",
  phone: "9778226340",        // ← change this (phone is required & unique)
  password: "Admin@1234", // ← change this to a strong password
};

const SAMPLE_CATEGORIES = [
  { code: "ELECTRONICS", name: "Electronics", description: "Electronic devices and gadgets" },
  { code: "CLOTHING", name: "Clothing", description: "Fashion and apparel" },
  { code: "HOME", name: "Home & Garden", description: "Home improvement and garden supplies" },
  { code: "BOOKS", name: "Books", description: "Books and publications" },
  { code: "SPORTS", name: "Sports & Outdoors", description: "Sports equipment and outdoor gear" },
];

async function seedSuperAdmin() {
  try {
    const url = process.env.MONGO_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("MONGO_URL or DATABASE_URL not found in .env");

    await mongoose.connect(url);
    console.log("✅ MongoDB connected");

    // Check if super admin already exists
    const existing = await User.findOne({ role: "SUPER_ADMIN" });
    if (existing) {
      console.log("⚠️  Super Admin already exists:", existing.email);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(SUPER_ADMIN.password, 12);

    const superAdmin = await User.create({
      username: SUPER_ADMIN.username,
      email: SUPER_ADMIN.email,
      phone: SUPER_ADMIN.phone,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isVerified: true,
    });

    console.log("✅ Super Admin created successfully!");
    console.log("   Email   :", superAdmin.email);
    console.log("   Phone   :", superAdmin.phone);
    console.log("   Role    :", superAdmin.role);
    console.log("   ID      :", superAdmin._id);

  } catch (err) {
    console.error("❌ Failed to seed super admin:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

seedSuperAdmin();
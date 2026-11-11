import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/database";
import * as Models from "../src/models/mongoose";

async function createAllSchemas() {
  console.log("🚀 === INITIALIZING ALL DATABASE SCHEMAS & INDEXES ===\n");
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB\n");

    const modelsToInit = Object.entries(Models).filter(([key, val]) => {
      // Check if it is a Mongoose model (it has modelName property)
      return val && typeof val === "function" && (val as any).modelName;
    });

    console.log(`Found ${modelsToInit.length} models to initialize.\n`);

    for (const [name, Model] of modelsToInit) {
      console.log(`📋 Initializing and building indexes for model: ${name}...`);
      try {
        if (typeof (Model as any).createCollection === "function") {
          await (Model as any).createCollection();
        }
        await (Model as any).createIndexes();
        console.log(`   ✅ ${name} collection and indexes initialized.`);
      } catch (err: any) {
        console.error(`   ❌ Failed to initialize ${name}:`, err.message);
      }
    }


    console.log("\n🔍 Verifying all collections in the database:");
    const collections = await mongoose.connection.db?.listCollections().toArray();
    const collectionNames = collections?.map((c) => c.name) || [];
    console.log("Existing collections in DB:", collectionNames);

    console.log("\n✨ === ALL SCHEMAS AND INDEXES CREATED/VERIFIED SUCCESSFULLY ===\n");
  } catch (error) {
    console.error("❌ Critical error during schema creation:", error);
    process.exit(1);
  } finally {
    await disconnectDB();
    console.log("🔌 Disconnected from MongoDB");
  }
}

createAllSchemas();

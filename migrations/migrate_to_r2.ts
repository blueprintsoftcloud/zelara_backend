// migrations/migrate_to_r2.ts
//
// Standalone migration script to transfer all stored Cloudinary images
// directly to Cloudflare R2 server-to-server with WebP optimization.
//
// Usage:
//   npm run migrate:r2
//   OR
//   npx ts-node migrations/migrate_to_r2.ts
//
// Safe & Idempotent:
//   Skips images that are already on R2. Can be re-run safely if interrupted.

import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../src/config/env";
import { uploadImage } from "../src/config/storage";

const isCloudinaryUrl = (url: unknown): url is string =>
  typeof url === "string" && (url.includes("res.cloudinary.com") || url.includes("cloudinary.com"));

async function transferUrlToR2(url: string, folder: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from Cloudinary (HTTP ${response.status} ${response.statusText})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return await uploadImage(buffer, folder);
}

export async function runMigration() {
  console.log("\n========================================================");
  console.log("🚀 Starting Cloudinary -> Cloudflare R2 Migration");
  console.log("========================================================\n");

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    console.error("❌ ERROR: Cloudflare R2 credentials are missing in .env!");
    console.error("Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_DOMAIN are set.\n");
    process.exit(1);
  }

  // Ensure storage provider is treated as R2 for the migration upload
  process.env.STORAGE_PROVIDER = "r2";
  (env as Record<string, unknown>).STORAGE_PROVIDER = "r2";

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(env.MONGO_URL);
  const db = mongoose.connection.db!;
  console.log(`✅ Connected to database: ${db.databaseName}\n`);

  let totalImagesTransferred = 0;
  let totalErrors = 0;

  // ── 1. Products ──────────────────────────────────────────────
  console.log("📦 [1/4] Checking Products...");
  const products = await db.collection("products").find({}).toArray();
  let productsUpdated = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const updates: Record<string, unknown> = {};
    const code = p.code || p._id.toString();

    // Primary image
    if (isCloudinaryUrl(p.image)) {
      try {
        console.log(`  - Migrating primary image for product "${p.name || code}"...`);
        const newUrl = await transferUrlToR2(p.image, `products/${code}`);
        updates.image = newUrl;
        totalImagesTransferred++;
      } catch (err) {
        console.error(`    ⚠️ Failed to migrate product image (${p.image}): ${(err as Error).message}`);
        totalErrors++;
      }
    }

    // Gallery images
    if (Array.isArray(p.images) && p.images.some(isCloudinaryUrl)) {
      const newImages: string[] = [];
      for (let g = 0; g < p.images.length; g++) {
        const img = p.images[g];
        if (isCloudinaryUrl(img)) {
          try {
            console.log(`  - Migrating gallery [${g + 1}/${p.images.length}] for "${p.name || code}"...`);
            const newUrl = await transferUrlToR2(img, `products/${code}/gallery_${g}`);
            newImages.push(newUrl);
            totalImagesTransferred++;
          } catch (err) {
            console.error(`    ⚠️ Failed gallery image (${img}): ${(err as Error).message}`);
            newImages.push(img); // keep old on error
            totalErrors++;
          }
        } else {
          newImages.push(img);
        }
      }
      updates.images = newImages;
    }

    if (Object.keys(updates).length > 0) {
      await db.collection("products").updateOne({ _id: p._id }, { $set: updates });
      productsUpdated++;
    }
  }
  console.log(`  ✅ Products completed: ${productsUpdated} updated.\n`);

  // ── 2. Categories ────────────────────────────────────────────
  console.log("📂 [2/4] Checking Categories...");
  const categories = await db.collection("categories").find({}).toArray();
  let categoriesUpdated = 0;

  for (const c of categories) {
    if (isCloudinaryUrl(c.image)) {
      try {
        const slug = c.slug || c._id.toString();
        console.log(`  - Migrating category "${c.name || slug}" image...`);
        const newUrl = await transferUrlToR2(c.image, `categories/${slug}`);
        await db.collection("categories").updateOne({ _id: c._id }, { $set: { image: newUrl } });
        categoriesUpdated++;
        totalImagesTransferred++;
      } catch (err) {
        console.error(`    ⚠️ Failed category image (${c.image}): ${(err as Error).message}`);
        totalErrors++;
      }
    }
  }
  console.log(`  ✅ Categories completed: ${categoriesUpdated} updated.\n`);

  // ── 3. Home Banners ──────────────────────────────────────────
  console.log("🖼️  [3/4] Checking Home Banners...");
  const banners = await db.collection("homebanners").find({}).toArray();
  let bannersUpdated = 0;

  for (const b of banners) {
    if (isCloudinaryUrl(b.image)) {
      try {
        console.log(`  - Migrating banner "${b.title || b._id}" image...`);
        const newUrl = await transferUrlToR2(b.image, "homebanner");
        await db.collection("homebanners").updateOne({ _id: b._id }, { $set: { image: newUrl } });
        bannersUpdated++;
        totalImagesTransferred++;
      } catch (err) {
        console.error(`    ⚠️ Failed banner image (${b.image}): ${(err as Error).message}`);
        totalErrors++;
      }
    }
  }
  console.log(`  ✅ Home Banners completed: ${bannersUpdated} updated.\n`);

  // ── 4. App Settings (Logo, Favicon, OG) ───────────────────────
  console.log("⚙️  [4/4] Checking App Settings (Company Logo / Favicon)...");
  const settings = await db.collection("appsettings").find({}).toArray();
  let settingsUpdated = 0;

  for (const s of settings) {
    if (isCloudinaryUrl(s.value)) {
      try {
        const key = (s.key || "company").toLowerCase().replace(/_/g, "/");
        console.log(`  - Migrating app setting "${s.key}"...`);
        const newUrl = await transferUrlToR2(s.value, key);
        await db.collection("appsettings").updateOne({ _id: s._id }, { $set: { value: newUrl } });
        settingsUpdated++;
        totalImagesTransferred++;
      } catch (err) {
        console.error(`    ⚠️ Failed setting image (${s.key}): ${(err as Error).message}`);
        totalErrors++;
      }
    }
  }
  console.log(`  ✅ App Settings completed: ${settingsUpdated} updated.\n`);

  // ── Summary ──────────────────────────────────────────────────
  console.log("========================================================");
  console.log("🎉 Migration Finished!");
  console.log(`  - Total Images Successfully Moved to R2: ${totalImagesTransferred}`);
  console.log(`  - Total Errors: ${totalErrors}`);
  console.log("========================================================\n");

  await mongoose.disconnect();
  console.log("Database disconnected. You're ready to set STORAGE_PROVIDER=r2 in .env!\n");
}

// Run directly when executed via CLI
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Fatal migration error:", err);
      process.exit(1);
    });
}


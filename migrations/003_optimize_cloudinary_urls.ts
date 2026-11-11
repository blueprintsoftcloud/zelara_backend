// migrations/003_optimize_cloudinary_urls.ts
//
// Retrofits the f_auto,q_auto delivery optimization (see config/cloudinary.ts's
// withAutoOptimization) onto every already-stored Cloudinary URL. New uploads get
// this automatically; this is the one-off pass so images uploaded before that fix
// also get automatic WebP/AVIF + quality optimization at delivery, with no
// re-encoding required — Cloudinary applies the transformation at CDN delivery time
// regardless of when the asset was originally uploaded.
//
// Safe to re-run: withAutoOptimization is idempotent (checks for the marker before
// inserting it), and every update here is scoped to documents that don't already have it.

import mongoose from "mongoose";
import "../src/models/mongoose";
import { withAutoOptimization } from "../src/config/cloudinary";

const isCloudinaryUrl = (url: unknown): url is string =>
  typeof url === "string" && url.includes("res.cloudinary.com") && !url.includes("/upload/f_auto,q_auto/");

export async function up(): Promise<void> {
  const db = mongoose.connection.db!;
  let totalUpdated = 0;

  // Product: single `image` + `images` array
  const products = await db.collection("products").find({}).project({ image: 1, images: 1 }).toArray();
  for (const p of products) {
    const update: Record<string, unknown> = {};
    if (isCloudinaryUrl(p.image)) update.image = withAutoOptimization(p.image);
    if (Array.isArray(p.images) && p.images.some(isCloudinaryUrl)) {
      update.images = p.images.map((u: string) => (isCloudinaryUrl(u) ? withAutoOptimization(u) : u));
    }
    if (Object.keys(update).length > 0) {
      await db.collection("products").updateOne({ _id: p._id }, { $set: update });
      totalUpdated++;
    }
  }

  // Category: single `image`
  const categories = await db.collection("categories").find({ image: { $exists: true } }).project({ image: 1 }).toArray();
  for (const c of categories) {
    if (isCloudinaryUrl(c.image)) {
      await db.collection("categories").updateOne({ _id: c._id }, { $set: { image: withAutoOptimization(c.image) } });
      totalUpdated++;
    }
  }

  // HomeBanner: single `image`
  const banners = await db.collection("homebanners").find({ image: { $exists: true } }).project({ image: 1 }).toArray();
  for (const b of banners) {
    if (isCloudinaryUrl(b.image)) {
      await db.collection("homebanners").updateOne({ _id: b._id }, { $set: { image: withAutoOptimization(b.image) } });
      totalUpdated++;
    }
  }

  // AppSetting: COMPANY_LOGO / COMPANY_FAVICON values
  const settings = await db
    .collection("appsettings")
    .find({ key: { $in: ["COMPANY_LOGO", "COMPANY_FAVICON"] } })
    .project({ key: 1, value: 1 })
    .toArray();
  for (const s of settings) {
    if (isCloudinaryUrl(s.value)) {
      await db.collection("appsettings").updateOne({ _id: s._id }, { $set: { value: withAutoOptimization(s.value) } });
      totalUpdated++;
    }
  }

  console.log(`  Optimized ${totalUpdated} document(s) with existing Cloudinary URLs.`);
}

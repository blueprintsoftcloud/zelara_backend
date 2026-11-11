// migrations/008_sync_product_active_indexes.ts
//
// Added a { categoryId: 1, isActive: 1 } compound index to Product (see
// models/mongoose.ts) — getProductsByCategoryId/searchProducts filter both fields
// together on every category/search page view, and the previous single-field
// categoryId index forced a per-doc isActive check after the index scan. Same
// syncIndexes pattern as migration 004: autoIndex won't build a newly-added index for
// an already-existing collection on its own. Safe to re-run.

import mongoose from "mongoose";
import "../src/models/mongoose"; // side-effect import — registers every model's schema

export async function up(): Promise<void> {
  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const dropped = await model.syncIndexes();
    if (dropped.length > 0) {
      console.log(`  ${name}: dropped stale index(es) — ${dropped.join(", ")}`);
    } else {
      console.log(`  ${name}: up to date`);
    }
  }
}

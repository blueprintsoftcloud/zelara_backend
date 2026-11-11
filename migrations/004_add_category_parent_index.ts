// migrations/004_add_category_parent_index.ts
//
// Category gained a `parentId` self-reference (arbitrary-depth subcategories) and a new
// { tenantId: 1, parentId: 1 } index. Migration 001 already ran and won't re-run just
// because a new index was added to the schema afterward — sync indexes again, explicitly,
// so this actually gets built rather than silently relying on autoIndex. Safe to re-run
// (syncIndexes is a no-op once the database already matches the schema).

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

// migrations/009_drop_reverted_product_text_index.ts
//
// A text index on Product ({ name, description, brand }) was added and then reverted in
// the same change (see product-user.controller.ts's searchProducts: switching to $text
// search broke substring/partial-word matching mid-typing, e.g. "pho" no longer matched
// "iPhone", so it was rolled back to the regex approach). The previous migration already
// ran syncIndexes() while the text index was still in the schema, so it was physically
// built on the DB — this drops that now-orphaned index. Safe to re-run.

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

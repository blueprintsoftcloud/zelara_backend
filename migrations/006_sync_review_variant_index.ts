// migrations/006_sync_review_variant_index.ts
//
// Review's unique index changed from {userId, productId} to
// {userId, productId, variantId} (see models/mongoose.ts's IReview) so a customer can
// leave one review per variant they bought instead of a single review silently covering
// every option of that product. Mongoose's autoIndex only ever ADDS indexes declared in
// the schema — it never drops the old one, so without this the stale {userId, productId}
// unique index would keep rejecting a second variant's review from the same customer as
// a duplicate even after the code and the new index both expect it to be allowed.
// Same fix as 005_sync_wishlist_variant_index.ts, needed again here for Review.

import mongoose from "mongoose";
import "../src/models/mongoose"; // side-effect import — registers every model's schema

export async function up(): Promise<void> {
  const Review = mongoose.model("Review");
  const dropped = await Review.syncIndexes();
  if (dropped.length > 0) {
    console.log(`  Review: dropped stale index(es) — ${dropped.join(", ")}`);
  } else {
    console.log("  Review: up to date");
  }
}

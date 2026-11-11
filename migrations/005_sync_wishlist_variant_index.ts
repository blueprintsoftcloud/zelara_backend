// migrations/005_sync_wishlist_variant_index.ts
//
// Wishlist's unique index changed from {userId, productId} to
// {userId, productId, variantId} (see models/mongoose.ts's IWishlist) so each variant
// of a product can be wishlisted as its own entry instead of one wishlist toggle
// silently covering every option of that product. Mongoose's autoIndex only ever ADDS
// indexes declared in the schema — it never drops the old one, so without this the
// stale {userId, productId} unique index would keep rejecting a second variant of the
// same product as a duplicate even after the code and the new index both expect it to
// be allowed. Re-running 001_sync_indexes wouldn't help either, since that migration
// is already marked applied and migrate.ts never re-runs a completed one — this needs
// its own entry.

import mongoose from "mongoose";
import "../src/models/mongoose"; // side-effect import — registers every model's schema

export async function up(): Promise<void> {
  const Wishlist = mongoose.model("Wishlist");
  const dropped = await Wishlist.syncIndexes();
  if (dropped.length > 0) {
    console.log(`  Wishlist: dropped stale index(es) — ${dropped.join(", ")}`);
  } else {
    console.log("  Wishlist: up to date");
  }
}

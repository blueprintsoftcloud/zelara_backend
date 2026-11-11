// migrations/001_sync_indexes.ts
//
// Builds any index declared in the current Mongoose schemas that doesn't exist yet in
// the live database, and drops any index that exists in the database but is no longer
// declared in a schema. Safe to re-run — a no-op once the database already matches the
// current schema state.
//
// This exists because index creation has so far relied on Mongoose's `autoIndex`
// (on by default, runs at connection time) — fine in dev, but a real risk if autoIndex
// is ever turned off in production (the standard recommendation once collections are
// large, since building an index automatically on every app boot is slow and can
// contend with live traffic). This migration is the controlled, on-demand replacement:
// run it as an explicit deploy step instead of relying on it happening implicitly.

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

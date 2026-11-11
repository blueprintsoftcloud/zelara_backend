// scripts/restoreDrill.ts
//
// The actual "prove the backups work" drill: takes a fresh backup, restores it into a
// throwaway scratch database on the same cluster, compares collection document counts
// against the source, then drops the scratch database. Run this on a schedule (see
// docs/DISASTER_RECOVERY.md) — a backup nobody has ever restored is a hope, not a plan.
//
// Usage:
//   npm run backup:drill

import "dotenv/config";
import crypto from "crypto";
import { MongoClient } from "mongodb";
import { runBackup } from "./backup";
import { runRestore } from "./restore";
import { dbNameFromUri, withDbName } from "./_dbTools";

// MongoDB caps database names at 38 bytes — truncate the source name if needed so
// "<source>_drill_<suffix>" always fits, regardless of how long the real db name is.
const buildScratchDbName = (sourceDbName: string): string => {
  const suffix = `_drill_${crypto.randomBytes(3).toString("hex")}`; // e.g. "_drill_a1b2c3" (13 chars)
  const maxSourceLen = 38 - suffix.length;
  return `${sourceDbName.slice(0, maxSourceLen)}${suffix}`;
};

async function main() {
  const liveUri = process.env.MONGO_URL ?? process.env.DATABASE_URL;
  if (!liveUri) throw new Error("MONGO_URL or DATABASE_URL is not set.");

  const sourceDbName = dbNameFromUri(liveUri);
  const scratchDbName = buildScratchDbName(sourceDbName);
  const scratchUri = withDbName(liveUri, scratchDbName);

  console.log(`=== Restore drill: ${sourceDbName} → ${scratchDbName} ===\n`);

  console.log("Step 1/3: Taking a fresh backup...");
  const archivePath = await runBackup();

  console.log("\nStep 2/3: Restoring into scratch database...");
  await runRestore(archivePath, scratchUri);

  console.log("\nStep 3/3: Verifying collection counts match source...");
  const sourceClient = await MongoClient.connect(liveUri);
  const scratchClient = await MongoClient.connect(scratchUri);

  let allMatch = true;
  try {
    const sourceDb = sourceClient.db(sourceDbName);
    const scratchDb = scratchClient.db(scratchDbName);

    const collections = await sourceDb.listCollections().toArray();
    for (const { name } of collections) {
      const [sourceCount, scratchCount] = await Promise.all([
        sourceDb.collection(name).countDocuments(),
        scratchDb.collection(name).countDocuments(),
      ]);
      const match = sourceCount === scratchCount;
      if (!match) allMatch = false;
      console.log(`  ${match ? "✅" : "❌"} ${name}: source=${sourceCount} restored=${scratchCount}`);
    }
  } finally {
    console.log("\nCleaning up scratch database...");
    await scratchClient.db(scratchDbName).dropDatabase();
    await sourceClient.close();
    await scratchClient.close();
  }

  if (allMatch) {
    console.log("\n✅ DRILL PASSED — backup is restorable and complete.");
  } else {
    console.error("\n❌ DRILL FAILED — restored data does not match source. Investigate before trusting this backup.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Restore drill failed:", err.message ?? err);
  process.exit(1);
});

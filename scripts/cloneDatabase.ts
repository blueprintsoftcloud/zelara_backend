// scripts/cloneDatabase.ts
//
// Clones all collections, documents, and indexes from the active database (source)
// to a new development database (target) on the MongoDB cluster.
//
// 100% NON-DESTRUCTIVE to source:
// - All operations on the source database are strictly READ-ONLY.
// - No data or schema in the source database is modified, dropped, or deleted.
//
// Usage:
//   npx tsx scripts/cloneDatabase.ts
//   npx tsx scripts/cloneDatabase.ts --target=storra_dev
//   npx tsx scripts/cloneDatabase.ts --target=storra_dev --overwrite

import "dotenv/config";
import { MongoClient, Document, CreateIndexesOptions, IndexSpecification } from "mongodb";
import { dbNameFromUri, withDbName } from "./_dbTools";

const BATCH_SIZE = 500;

const getArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
  const flag = `--${name}`;
  if (process.argv.includes(flag)) return "true";
  return undefined;
};

export async function cloneDatabase() {
  const liveUri = process.env.MONGO_URL ?? process.env.DATABASE_URL;
  if (!liveUri) {
    throw new Error("MONGO_URL (or DATABASE_URL) is not set in backend/.env");
  }

  const defaultSourceDb = dbNameFromUri(liveUri);
  const sourceDbName = getArg("source") || defaultSourceDb;
  const targetDbName = getArg("target") || "storra_dev";
  const allowOverwrite = getArg("overwrite") === "true";

  if (sourceDbName === targetDbName) {
    throw new Error(
      `Safety guard: Source database ("${sourceDbName}") and Target database ("${targetDbName}") cannot be the same!`
    );
  }

  console.log("==========================================================");
  console.log("         MongoDB Safe Database Clone Utility              ");
  console.log("==========================================================");
  console.log(`▶ Source Database (Read-Only) : "${sourceDbName}"`);
  console.log(`▶ Target Database (Development): "${targetDbName}"`);
  console.log("  Guaranteed: Source database data will NOT be modified or deleted.");
  console.log("==========================================================\n");

  const client = new MongoClient(liveUri);
  await client.connect();

  try {
    const sourceDb = client.db(sourceDbName);
    const targetDb = client.db(targetDbName);

    // Check if target DB already has collections
    const existingTargetCollections = await targetDb.listCollections().toArray();
    if (existingTargetCollections.length > 0) {
      if (!allowOverwrite) {
        throw new Error(
          `Target database "${targetDbName}" already contains ${existingTargetCollections.length} collection(s).\n` +
          `To overwrite development collections, re-run with: --overwrite\n` +
          `Example: npx tsx scripts/cloneDatabase.ts --target=${targetDbName} --overwrite`
        );
      }
      console.log(`⚠ Target database "${targetDbName}" has existing collections. Overwrite flag set — cleaning target...`);
      for (const col of existingTargetCollections) {
        await targetDb.collection(col.name).drop();
      }
      console.log("  Target collections cleaned.\n");
    }

    // Read all collections from source
    const sourceCollections = await sourceDb.listCollections().toArray();
    console.log(`Found ${sourceCollections.length} collections in "${sourceDbName}" to clone.\n`);

    const summary: Array<{
      collection: string;
      sourceDocs: number;
      targetDocs: number;
      indexes: number;
      status: string;
    }> = [];

    const startTime = Date.now();
    let totalDocumentsCloned = 0;

    for (const colInfo of sourceCollections) {
      const colName = colInfo.name;
      process.stdout.write(`  Cloning collection: ${colName.padEnd(28)} `);

      const sourceColl = sourceDb.collection(colName);

      // Recreate collection with exact options (handles capped collections like systemlogs)
      if (colInfo.options && Object.keys(colInfo.options).length > 0) {
        await targetDb.createCollection(colName, colInfo.options);
      } else {
        await targetDb.createCollection(colName);
      }

      const targetColl = targetDb.collection(colName);

      // 1. Copy documents in batches
      const cursor = sourceColl.find({});
      let batch: Document[] = [];
      let docsInCol = 0;

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (doc) {
          batch.push(doc);
          docsInCol++;
        }
        if (batch.length >= BATCH_SIZE) {
          await targetColl.insertMany(batch);
          batch = [];
        }
      }
      if (batch.length > 0) {
        await targetColl.insertMany(batch);
      }

      totalDocumentsCloned += docsInCol;

      // 2. Copy indexes (skip the default '_id_' index)
      const indexes = await sourceColl.indexes();
      let customIndexesCount = 0;

      for (const idx of indexes) {
        if (idx.name === "_id_") continue;

        const { v, ns, key, ...indexOptions } = idx as any;
        try {
          await targetColl.createIndex(key as IndexSpecification, indexOptions as CreateIndexesOptions);
          customIndexesCount++;
        } catch (idxErr: any) {
          console.warn(`\n    ⚠ Could not copy index "${idx.name}" on ${colName}: ${idxErr.message}`);
        }
      }

      // Verification
      const targetDocCount = await targetColl.countDocuments();
      const isMatch = targetDocCount === docsInCol;

      summary.push({
        collection: colName,
        sourceDocs: docsInCol,
        targetDocs: targetDocCount,
        indexes: indexes.length,
        status: isMatch ? "OK" : "MISMATCH"
      });

      console.log(`✓ (${docsInCol} docs, ${indexes.length} indexes)`);
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n==========================================================`);
    console.log(`✅ Clone complete in ${elapsedSec}s! Total docs copied: ${totalDocumentsCloned}`);
    console.log(`==========================================================\n`);

    // Target connection string
    const devUri = withDbName(liveUri, targetDbName);

    console.log("Database connection strings:");
    console.log(`Production (Live):    ${liveUri}`);
    console.log(`Development (Clone):  ${devUri}\n`);

    console.log("Verification Summary:");
    console.table(summary);

    return {
      sourceDbName,
      targetDbName,
      totalDocumentsCloned,
      targetUri: devUri,
      collectionsCount: sourceCollections.length
    };
  } finally {
    await client.close();
  }
}

if (require.main === module || process.argv[1]?.includes("cloneDatabase")) {
  cloneDatabase()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Database clone failed:", err.message);
      process.exit(1);
    });
}


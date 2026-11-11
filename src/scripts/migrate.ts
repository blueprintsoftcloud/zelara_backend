// src/scripts/migrate.ts
//
// Versioned migration runner for the shared MongoDB database.
//
// Migrations live in backend/migrations/, one file per change, named with a
// zero-padded numeric prefix so filesystem sort order == run order:
//   001_sync_indexes.ts
//   002_backfill_something.ts
//
// Each file exports an async `up()` function. Applied migrations are recorded in the
// `_migrations` collection (by name, with a unique index) so re-running this script is
// always safe — already-applied migrations are skipped, never re-run.
//
// Usage:
//   npm run migrate            — apply all pending migrations
//   npm run migrate:status     — list applied vs. pending, without running anything
//
// Deliberately NOT run automatically on server boot: migrations should be an explicit,
// observable deploy step, run once before new code that depends on them starts serving
// traffic — not a race between however many app instances happen to start up together.

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { connectDB, disconnectDB } from "../config/database";
import logger from "../utils/logger";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");
const COLLECTION = "_migrations";

interface Migration {
  name: string;
  up: () => Promise<void>;
}

const loadMigrations = async (): Promise<Migration[]> => {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.ts$/.test(f))
    .sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const mod = await import(pathToFileURL(fullPath).href);
    if (typeof mod.up !== "function") {
      throw new Error(`Migration "${file}" does not export an "up" function.`);
    }
    migrations.push({ name: path.basename(file, path.extname(file)), up: mod.up });
  }
  return migrations;
};

const ensureMigrationsCollection = async () => {
  const db = mongoose.connection.db!;
  const existing = await db.listCollections({ name: COLLECTION }).toArray();
  if (existing.length === 0) {
    await db.createCollection(COLLECTION);
  }
  await db.collection(COLLECTION).createIndex({ name: 1 }, { unique: true });
};

const getAppliedNames = async (): Promise<Set<string>> => {
  const db = mongoose.connection.db!;
  const docs = await db.collection(COLLECTION).find({ status: "completed" }).project({ name: 1 }).toArray();
  return new Set(docs.map((d) => d.name as string));
};

const printStatus = async () => {
  const migrations = await loadMigrations();
  const applied = await getAppliedNames();
  logger.info(`Migrations directory: ${MIGRATIONS_DIR}`);
  if (migrations.length === 0) {
    logger.info("No migration files found.");
    return;
  }
  for (const m of migrations) {
    logger.info(`  ${applied.has(m.name) ? "✅ applied  " : "⏳ pending  "} ${m.name}`);
  }
};

const runMigrations = async () => {
  const db = mongoose.connection.db!;
  const migrations = await loadMigrations();
  const applied = await getAppliedNames();
  const pending = migrations.filter((m) => !applied.has(m.name));

  if (pending.length === 0) {
    logger.info("✅ No pending migrations — database is up to date.");
    return;
  }

  logger.info(`Found ${pending.length} pending migration(s): ${pending.map((m) => m.name).join(", ")}`);

  for (const migration of pending) {
    const startedAt = new Date();
    logger.info(`▶ Running migration: ${migration.name}`);

    try {
      // Claim it first — the unique index on `name` means a second concurrent runner
      // gets a duplicate-key error here instead of double-applying the same migration.
      await db.collection(COLLECTION).insertOne({ name: migration.name, status: "running", startedAt });
    } catch (err: any) {
      if (err?.code === 11000) {
        logger.warn(`⏭ Skipping "${migration.name}" — already applied or claimed by another process.`);
        continue;
      }
      throw err;
    }

    try {
      await migration.up();
      const durationMs = Date.now() - startedAt.getTime();
      await db
        .collection(COLLECTION)
        .updateOne({ name: migration.name }, { $set: { status: "completed", appliedAt: new Date(), durationMs } });
      logger.info(`✅ Completed: ${migration.name} (${durationMs}ms)`);
    } catch (err) {
      // Release the claim so a fixed version of this migration can be retried later.
      await db.collection(COLLECTION).deleteOne({ name: migration.name, status: "running" });
      logger.error(`❌ Migration failed: ${migration.name}`, err);
      throw err;
    }
  }

  logger.info("✅ All pending migrations applied.");
};

const main = async () => {
  await connectDB();
  await ensureMigrationsCollection();

  if (process.argv.includes("--status")) {
    await printStatus();
  } else {
    await runMigrations();
  }

  await disconnectDB();
};

main().catch(async (err) => {
  logger.error("Migration runner failed", err);
  await disconnectDB();
  process.exit(1);
});

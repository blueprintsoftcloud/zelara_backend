// scripts/restore.ts
//
// Restores a backup produced by backup.ts (gzipped NDJSON of canonical EJSON documents)
// via the MongoDB driver directly — no external binary (no mongorestore). Deliberately
// makes it hard to accidentally overwrite production: the restore target must be passed
// explicitly, and restoring into the live database requires an extra, unambiguous flag.
//
// Usage:
//   npm run restore -- --archive=./backups/backup_2026-08-05T12-00-00.ndjson.gz --uri="mongodb+srv://.../scratch_db"
//
//   To restore over the live production database (rare — only for a real DR event):
//   npm run restore -- --archive=<path> --uri="$DATABASE_URL" --confirm-production
//
// Restoring into a database with a different name than the one the backup was taken
// from just works — this format has no embedded source-db-name to remap (unlike the old
// mongodump-archive format), so there's no --source-db flag needed anymore.
//
// Per-collection reset: ordinary collections are cleared with deleteMany({}) before
// repopulating, which preserves whatever indexes already exist on the target (production's
// real indexes, rebuilt by Mongoose's autoIndex:true on next app connect if missing).
// Capped collections (currently just `systemlogs`) reject deleteMany() outright, so those
// are dropped and recreated with their original capped options instead.
//
// Index definitions are NOT captured by backup.ts and are not restored here — production
// restores are always followed by an app restart, which rebuilds every schema-declared
// index via autoIndex. See docs/DISASTER_RECOVERY.md's Known Gaps for the one place this
// doesn't self-heal (a scratch-db restore that nothing ever connects the app to).

import "dotenv/config";
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import { MongoClient, BSON, MongoServerError, Document } from "mongodb";
import { dbNameFromUri } from "./_dbTools";

const BATCH_SIZE = 500;

const getArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
};

export interface RunRestoreOptions {
  allowProduction?: boolean;
  /** @deprecated No longer meaningful — this format has no embedded source-db-name to
   *  remap. Kept only so an old --source-db= invocation doesn't hard-error. */
  sourceDbName?: string;
}

export async function runRestore(archivePath: string, targetUri: string, opts: RunRestoreOptions = {}): Promise<void> {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }

  const liveUri = process.env.MONGO_URL ?? process.env.DATABASE_URL;
  const targetIsLive = Boolean(liveUri) && targetUri === liveUri;

  if (targetIsLive && !opts.allowProduction) {
    throw new Error(
      `The restore target matches the live production database ("${dbNameFromUri(targetUri)}"). ` +
        "This would overwrite current production data. " +
        "If this is genuinely a disaster-recovery restore, pass --confirm-production.",
    );
  }

  const targetDbName = dbNameFromUri(targetUri);
  console.log(`▶ Restoring into database "${targetDbName}"${targetIsLive ? "  ⚠ THIS IS PRODUCTION" : ""}`);
  console.log(`  Source archive: ${archivePath}`);
  console.log("  Existing documents in each restored collection are replaced; existing indexes on the target are left intact.");

  const client = await MongoClient.connect(targetUri);
  const startedAt = Date.now();
  let totalDocs = 0;
  let collectionsRestored = 0;

  try {
    const db = client.db(targetDbName);
    const rl = readline.createInterface({
      input: fs.createReadStream(archivePath).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });

    let currentCollection: string | null = null;
    let currentCount = 0;
    let batch: Document[] = [];

    const flush = async () => {
      if (!currentCollection || batch.length === 0) return;
      await db.collection(currentCollection).insertMany(batch, { ordered: true });
      totalDocs += batch.length;
      currentCount += batch.length;
      batch = [];
    };

    // Capped collections reject deleteMany() entirely — must drop + recreate with the
    // original capped options to preserve the fixed-size/FIFO behavior. Ordinary
    // collections use deleteMany() so existing indexes on the target survive untouched.
    const resetCollection = async (name: string, options: Record<string, unknown>) => {
      if (options?.capped) {
        try {
          await db.dropCollection(name);
        } catch (err) {
          if (!(err instanceof MongoServerError && err.codeName === "NamespaceNotFound")) throw err;
        }
        await db.createCollection(name, options as any);
      } else {
        await db.collection(name).deleteMany({});
      }
    };

    const startCollection = async (name: string, options: Record<string, unknown>) => {
      await flush();
      if (currentCollection) console.log(`    ${currentCollection}: ${currentCount} documents restored`);
      currentCollection = name;
      currentCount = 0;
      await resetCollection(name, options);
      collectionsRestored++;
      console.log(`  ▶ ${name}`);
    };

    for await (const line of rl) {
      if (!line.trim()) continue;
      const probe = JSON.parse(line);

      if (probe.__meta__) {
        console.log(`  Backup metadata: sourceDb="${probe.sourceDb}", createdAt=${probe.createdAt}, formatVersion=${probe.formatVersion}`);
        continue;
      }
      if (probe.__collection__) {
        await startCollection(probe.__collection__, probe.options ?? {});
        continue;
      }

      batch.push(BSON.EJSON.parse(line, { relaxed: false }) as Document);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
    if (currentCollection) console.log(`    ${currentCollection}: ${currentCount} documents restored`);
  } finally {
    await client.close();
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Restore complete: ${totalDocs} documents across ${collectionsRestored} collections in ${durationSec}s.`);
}

if (require.main === module) {
  const archivePath = getArg("archive");
  const targetUri = getArg("uri");
  const confirmProduction = process.argv.includes("--confirm-production");

  if (getArg("source-db")) {
    console.warn("⚠ --source-db is no longer needed (no namespace remap in this format) — ignored.");
  }

  if (!archivePath) {
    console.error("❌ --archive=<path> is required.");
    process.exit(1);
  }
  if (!targetUri) {
    console.error(
      "❌ --uri=<target connection string> is required.\n" +
        "  This is deliberate — restore never guesses a target. Point it at a scratch database\n" +
        "  unless you are intentionally recovering production (in which case also pass --confirm-production).",
    );
    process.exit(1);
  }

  runRestore(archivePath, targetUri, { allowProduction: confirmProduction }).catch((err) => {
    console.error("❌ Restore failed:", err.message ?? err);
    process.exit(1);
  });
}

// scripts/backup.ts
//
// Full-database backup via the MongoDB driver directly — no external binary (no
// mongodump), so this works identically on shared hosting as anywhere else. Streams
// every collection to a single gzipped NDJSON file, wrapped for consistent naming,
// retention pruning, and CI-friendly exit codes. See docs/DISASTER_RECOVERY.md for the
// full backup/restore/DR procedure this script is one piece of.
//
// Usage:
//   npm run backup
//
// Output format (backup_<timestamp>.ndjson.gz, gzip of NDJSON):
//   {"__meta__":true,"formatVersion":1,"sourceDb":"...","createdAt":"..."}
//   {"__collection__":"users","options":{}}
//   {"_id":{"$oid":"..."},...}          ← one line per document, canonical EJSON
//   ...
//   {"__collection__":"systemlogs","options":{"capped":true,"size":...,"max":...}}
//   ...
//
// Documents are serialized with canonical Extended JSON (BSON.EJSON, relaxed:false) —
// plain JSON would silently corrupt ObjectId/Date/numeric BSON subtypes on round-trip.
// Collection `options` (captured from listCollections()) let restore.ts recreate capped
// collections correctly instead of crashing on a plain deleteMany().

import "dotenv/config";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { MongoClient, BSON } from "mongodb";
import { env } from "../src/config/env";
import { dbNameFromUri } from "./_dbTools";

const FORMAT_VERSION = 1;
const DB_URI = process.env.MONGO_URL ?? process.env.DATABASE_URL;

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const pruneOldBackups = (dir: string, keep: number) => {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ndjson.gz"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, f.name));
    console.log(`  Pruned old backup: ${f.name}`);
  }
};

// Backpressure-aware line write — awaiting the callback serializes writes instead of
// buffering an entire collection in memory before the gzip stream can drain.
const writeLine = (stream: NodeJS.WritableStream, line: string): Promise<void> =>
  new Promise((resolve, reject) => stream.write(line, (err) => (err ? reject(err) : resolve())));

export async function runBackup(): Promise<string> {
  if (!DB_URI) {
    throw new Error("MONGO_URL or DATABASE_URL is not set.");
  }

  const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
  fs.mkdirSync(backupDir, { recursive: true });

  const archivePath = path.join(backupDir, `backup_${timestamp()}.ndjson.gz`);
  const dbName = dbNameFromUri(DB_URI);
  console.log(`▶ Backing up database "${dbName}" → ${archivePath}`);

  const client = await MongoClient.connect(DB_URI);
  const gzip = zlib.createGzip();
  const fileStream = fs.createWriteStream(archivePath);
  const finished = new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    gzip.on("error", reject);
  });
  gzip.pipe(fileStream);

  const startedAt = Date.now();
  let totalDocs = 0;

  try {
    const db = client.db(dbName);
    await writeLine(
      gzip,
      JSON.stringify({ __meta__: true, formatVersion: FORMAT_VERSION, sourceDb: dbName, createdAt: new Date().toISOString() }) + "\n",
    );

    const collections = await db.listCollections().toArray();
    for (const { name, type, options } of collections) {
      if (type === "view") {
        console.log(`  ⚠ skipping view "${name}" (views have no stored documents)`);
        continue;
      }

      await writeLine(gzip, JSON.stringify({ __collection__: name, options: options ?? {} }) + "\n");

      // promoteValues:false keeps exact BSON numeric subtypes (Int32/Double/Long) intact
      // instead of flattening everything to plain JS numbers before EJSON serializes it.
      const cursor = db.collection(name).find({}, { promoteValues: false });
      let count = 0;
      for await (const doc of cursor) {
        await writeLine(gzip, BSON.EJSON.stringify(doc, { relaxed: false }) + "\n");
        count++;
        totalDocs++;
      }
      console.log(`  ${name}: ${count} documents`);
    }
  } finally {
    gzip.end();
    await finished;
    await client.close();
  }

  const stats = fs.statSync(archivePath);
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Backup complete: ${totalDocs} documents, ${(stats.size / 1024 / 1024).toFixed(2)} MB in ${durationSec}s`);

  const retention = Math.max(1, parseInt(env.BACKUP_RETENTION_COUNT) || 14);
  pruneOldBackups(backupDir, retention);
  console.log(`✅ Retention: keeping the ${retention} most recent local backups.`);

  return archivePath;
}

if (require.main === module) {
  runBackup()
    .then((archivePath) => {
      console.log(
        `\n⚠ This backup is on local disk only (${archivePath}). It does not survive this machine being lost.\n` +
          `  Copy it to off-box storage (S3/GCS/etc.) for real disaster-recovery coverage — see docs/DISASTER_RECOVERY.md.`,
      );
    })
    .catch((err) => {
      console.error("❌ Backup failed:", err.message ?? err);
      process.exit(1);
    });
}

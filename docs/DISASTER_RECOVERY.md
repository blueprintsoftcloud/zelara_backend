# Backup, Restore & Disaster Recovery

**Status:** Backup/restore/drill tooling is built and verified against the live database. Off-box backup storage and automated scheduling are **not yet done** — see [Known Gaps](#known-gaps) before treating this as a complete DR posture.

## 1. Architecture — what's actually being protected

This is **one shared MongoDB Atlas database** (`subscriptionremoved`, cluster `cluster0.ha8pdrk.mongodb.net`), not a database-per-tenant setup. Every tenant's data lives in the same collections, scoped by an ownership field (`managedBy` / `primaryAdminId` / `adminId`). Practically, that means:

- **One backup covers every tenant.** There's no per-tenant backup/restore fan-out to manage.
- **A restore is all-or-nothing at the database level.** Restoring the backup restores every tenant's data as of that snapshot — you cannot restore just one tenant without a targeted, collection-level extraction (see [5c](#5c-single-tenant-or-single-record-recovery)).
- **What's in scope:** every collection in `subscriptionremoved` (users, orders, products, categories, staff, audit logs, subscriptions, etc.).
- **What's out of scope:** in-flight background jobs (see [§2](#2-what-a-process-crash-means-for-background-jobs-not-a-data-loss-event)), and Cloudinary-hosted media (external to this database entirely — not covered by any tool in this document).

## 2. What a process crash means for background jobs (not a data-loss event)

Email, notifications, audit-log writes, inventory restock/low-stock alerts, and the monthly archival jobs all run in-process (see `src/services/*.service.ts`), fire-and-forget, with their own retry/backoff — there is no external job queue. If the backend process crashes or restarts:

- **No customer data is lost.** Anything already written to MongoDB (the actual order, the actual audit log entry) is unaffected.
- **In-flight background work is lost** — an email or notification that was mid-send/mid-retry when the process died will not resume after restart. It simply doesn't happen; nothing persisted it.
- **Recovery is just the process restarting.** There's no separate service to bring back up — this is a normal app restart, not a DR event.

## 3. RTO / RPO targets

| | Target | Basis |
|---|---|---|
| **RPO** (max acceptable data loss) | ≤ 24 hours | Daily `npm run backup`. Drops to near-zero once Atlas Cloud Backup with PITR is enabled (M10+ tier — see [§4](#4-backup-strategy)). |
| **RTO** (max acceptable downtime) | ≤ 4 hours | Time to provision a target (if needed), run `npm run restore`, repoint `DATABASE_URL`, redeploy. Not yet drilled end-to-end at the infrastructure level — only the restore step itself has been verified (§6). |

These are **targets to design toward**, not measured guarantees — they haven't been validated under a real infrastructure-loss scenario (only the backup/restore mechanism itself has been drilled).

## 4. Backup strategy

### Atlas tier matters — check which one you're on

- **M0 / M2 / M5 (shared tiers):** Atlas does **not** provide automated Cloud Backup on these tiers. The custom `mongodump`-based tooling in this repo is your *only* backup mechanism. If the cluster is still on a shared tier, this is a real gap, not a redundant safety net.
- **M10+ (dedicated tiers):** Atlas Cloud Backup becomes available — configurable continuous snapshots with point-in-time recovery (PITR) down to seconds of granularity. **Enable this the moment you upgrade off a shared tier** — it strictly beats the daily custom backup on recovery granularity, and should become the primary mechanism, with the custom backup kept as a secondary/portable copy.

### Current mechanism: `npm run backup`

- Pure Node.js via the MongoDB driver directly (`scripts/backup.ts`) — no external binary (no `mongodump`), so this runs identically on shared hosting as anywhere else. Streams every collection to a single gzipped NDJSON file, one canonical Extended JSON (EJSON) document per line, preceded by a `{"__collection__": ...}` marker that also captures the collection's options (so capped collections like `systemlogs` can be recreated correctly on restore).
- Output: `backend/backups/backup_<timestamp>.ndjson.gz` (gitignored — these contain raw customer data, never commit them).
- Retention: keeps the most recent `BACKUP_RETENTION_COUNT` backups (default 14), pruning older ones automatically.
- Config: `BACKUP_DIR` (default `./backups`), `BACKUP_RETENTION_COUNT` (default `14`) in `.env`.

### Schedule

**Not yet automated.** Run `npm run backup` manually, or wire it into a cron job / CI scheduled pipeline / Atlas-hosted trigger. Recommended cadence: daily, minimum.

## 5. Restore procedure

### 5a. Restoring into a scratch/staging database (safe default)

```bash
npm run restore -- --archive=./backups/backup_2026-08-05T12-00-00.ndjson.gz --uri="mongodb+srv://.../scratch_db"
```

That's it — the target database name can differ freely from the one the backup was taken from. This format has no embedded source-db-name (unlike the old `mongodump`-archive format), so there's no namespace remap step and no `--source-db` flag needed anymore.

### 5b. Restoring over production (real DR event only)

```bash
npm run restore -- --archive=<path> --uri="$DATABASE_URL" --confirm-production
```

This **replaces every collection's contents** in the live database — ordinary collections are cleared with `deleteMany({})` (which preserves existing indexes on the target) then repopulated; `systemlogs` specifically is dropped and recreated with its original capped options, since capped collections reject `deleteMany()` outright. The tool refuses to run against the live `DATABASE_URL` without `--confirm-production` — that flag is the entire safety mechanism here, so treat typing it as the actual point of no return, not a formality.

Before running this for real:
1. Stop the application (or at least writes) if at all possible — a restore racing against live writes will lose whatever was written mid-restore.
2. Confirm you're restoring the archive you think you are (check the filename timestamp).
3. Have someone else confirm the command before it runs, if this is a live incident and more than one person is available.

### 5c. Single-tenant or single-record recovery

There is no built-in single-tenant restore (see [§1](#1-architecture--whats-actually-being-protected) — one shared database, one backup). To recover a single tenant's data or a handful of documents without touching everyone else's current data:

1. Restore the full backup into a scratch database (§5a).
2. Manually query/export the specific documents needed — a one-off script against the scratch DB, or, since backup files are just gzipped NDJSON/EJSON, even `zcat backup_....ndjson.gz | grep ...` against the backup file directly for a quick look without restoring anything.
3. Insert/upsert those specific documents back into production directly — **not** via a full restore.
4. Drop the scratch database when done.

## 6. Verified, not just documented

Every claim above about the backup/restore mechanism was proven against the live Atlas cluster while building this tooling, not assumed from reading MongoDB's docs. The specific issues below were found and fixed while the backup/restore pipeline still used `mongodump`/`mongorestore`; the pipeline has since been rewritten to a pure Node.js/driver implementation that has no namespace-remap step at all (see §5a), so the `--nsFrom`/`--nsTo` failure modes described here no longer apply — kept as historical context for why the old tooling needed the care it did, and because the 38-byte scratch-db-name limit is a MongoDB constraint (not a `mongodump` quirk) that still matters today:

- `npm run backup` — ran successfully, produced a real archive from real collections (61 audit logs, 3 users, 5 products, 6 categories, etc.).
- **First restore attempt failed** — scratch database name exceeded MongoDB's 38-byte limit. Fixed in `restoreDrill.ts`'s naming scheme (`buildScratchDbName`'s truncation logic — still in place today).
- **Second restore attempt "succeeded" but restored 0 documents** — silently. `mongorestore` doesn't infer a database rename from the target URI; without `--nsFrom`/`--nsTo`, it matched zero namespaces and exited cleanly, looking identical to a successful empty restore. This is exactly the failure mode a restore drill exists to catch — a naive check of "did the command exit 0" would have reported success. (This entire class of bug is now structurally impossible — the new format has no embedded namespace to mismatch.)
- **Third attempt still restored 0 documents** — `--nsFrom`/`--nsTo` were correctly specified, but the target `--uri` still carried a database path, which implicitly filtered namespaces before the remap logic ran.
- **Final drill with the old tooling: passed.** All 29 collections matched exactly between source and restored copy, scratch database cleaned up automatically, production data confirmed untouched throughout (checked directly after every attempt, not assumed). The same drill (`npm run backup:drill`) continues to be the verification mechanism for the new pure-Node implementation.

## 7. Backup verification / restore drills

A backup nobody has ever restored is a hope, not a plan. `npm run backup:drill` automates the actual test:

1. Takes a fresh backup.
2. Restores it into a throwaway scratch database on the same cluster (auto-named, auto-cleaned-up).
3. Compares document counts per collection between source and restored copy.
4. Reports PASS/FAIL and exits non-zero on failure — wire this into CI/monitoring rather than only running it by hand.

**Recommended cadence: monthly**, minimum quarterly. Run it, don't just schedule it — check the output.

```bash
npm run backup:drill
```

## 8. Disaster recovery playbooks

### Scenario: Accidental data deletion or corruption (a bug wiped/corrupted some records)
1. Identify how far back the corruption goes (check `SystemLog` / `AuditLog` via the Super Admin monitoring page for when it started).
2. Restore the most recent backup from *before* that point into a scratch database (§5a).
3. Extract the affected records and re-insert them into production (§5c) — don't do a full production restore for a partial-data issue, it would also roll back everything else that happened since.

### Scenario: Full database/cluster loss
1. Provision a new Atlas cluster (or confirm the existing one is actually gone, not just unreachable).
2. Restore the latest backup into it (§5b, target is the new cluster).
3. Update `DATABASE_URL`/`MONGO_URL` in `.env` to point at the new cluster.
4. Redeploy the backend so it picks up the new connection string.
5. Run `npm run migrate:status` to confirm the schema/index migration state matches expectations before resuming traffic.

### Scenario: Atlas region outage
Largely outside your control on a shared (M0/M2/M5) tier — no cross-region failover available. On M10+, Atlas replica sets span multiple nodes and can be configured across regions/availability zones for automatic failover; this is an Atlas configuration change, not something this tooling handles. Track Atlas's status page; there is no local action that shortens this beyond what's already configured at the cluster level.

### Scenario: Bad deploy or migration corrupts data
1. Stop further writes if possible (maintenance mode / take the app down).
2. Check `npm run migrate:status` — was a migration involved? Was it idempotent, or does it need a manual undo?
3. If data is genuinely corrupted (not just code needing a rollback), restore from the most recent pre-incident backup (§5b) after rolling back the bad code/migration.
4. This is exactly why every migration should be tested against a restored copy of production data before being run for real — see the migration framework's own docs.

### Scenario: Database credential compromise
1. Rotate the Atlas database user's password immediately (Atlas UI → Database Access).
2. Update `DATABASE_URL`/`MONGO_URL` and redeploy.
3. Review `AuditLog` and `SystemLog` (Super Admin → System Monitoring) for anything suspicious in the window the credential may have been exposed.
4. Consider whether a restore is warranted (only if there's evidence of unauthorized writes, not just unauthorized read access).

## Known Gaps

Being direct about what this document does **not** yet solve:

- **Backups are local-disk only.** They do not survive the machine they were taken on being lost. Copy them to off-box storage (S3, GCS, etc.) — this repo doesn't do that yet, and there's no cloud storage credential wired up to build it against.
- **No automated schedule.** `npm run backup` and `npm run backup:drill` are manual commands until someone wires them into cron/CI/a scheduled pipeline.
- **Index definitions are not captured in backups.** A restore relies on Mongoose's `autoIndex: true` to rebuild every schema-declared index the next time the app connects — true for a real production restore (which is always followed by a redeploy/restart), but *not* true for a scratch-db restore that nothing ever connects the app to, including `npm run backup:drill`'s scratch database. Harmless for the drill itself (it only compares document counts, never index presence), but worth knowing if you ever inspect a scratch restore by hand and wonder why queries feel slow.
- **Pre-cutover `.archive.gz` backups are unreadable by the current tooling.** Backups taken before the `mongodump`→pure-Node rewrite are in the old format; `restore.ts` only reads the new `.ndjson.gz` format. They also won't be auto-pruned by `npm run backup`'s retention logic anymore (its filter only matches `.ndjson.gz`) — clean up any old `.archive.gz` files manually, or keep MongoDB Database Tools around temporarily if you specifically need to restore one of them.
- **RTO/RPO are targets, not measured outcomes.** Only the restore *mechanism* has been drilled — a full infrastructure-loss scenario (new cluster, DNS/connection string cutover, redeploy) has not been rehearsed end-to-end.
- **No defined on-call/escalation owner.** This document has playbooks; it doesn't yet say *who* runs them at 3am. Assign that before treating this as launch-ready.

// migrations/002_backfill_tenant_id.ts
//
// Backfills the new `tenantId` field (see models/plugins/tenantScope.plugin.ts) onto
// every existing document in every tenant-owned collection, and onto every existing
// User. Required before tenant-scoped queries go live — without this, existing data
// has no tenantId, and the plugin's fail-closed behavior would make it invisible to
// everyone (including its own tenant) until backfilled.
//
// Resolution strategy: the codebase today only ever produces ONE tenant through normal
// signup (the first ADMIN account, see auth.controller.ts's signup). Every pre-existing
// row is assigned to that tenant. If somehow more than one primary admin already
// exists (e.g. from the pre-fix createAdminUser bug that merged every new admin into
// "whichever admin happened to be first"), the earliest-created one is used and a
// warning is logged — that scenario needs a human to review which data actually
// belongs to which tenant, which this migration cannot infer from data alone.
//
// Runs with raw driver updateMany calls (bypassing Mongoose entirely), so it is
// unaffected by tenantScopePlugin — there is no AsyncLocalStorage context during a
// migration run, so the plugin would no-op anyway, but raw driver access keeps this
// migration correct even if that ever changes.
//
// Safe to re-run: every update is `{ tenantId: { $exists: false } }` guarded, so an
// already-backfilled database is a fast no-op.

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import "../src/models/mongoose"; // side-effect import — registers every model's schema

const TENANT_OWNED_COLLECTIONS = [
  "categories",
  "products",
  "categoryattributes",
  "coupons",
  "homebanners",
  "appsettings",
  "orders",
  "orderitems",
  "paymentlogs",
  "auditlogs",
  "notifications",
  "customertrackers",
  "staffprofiles",
  "reviews",
];

const ENV_PATH = path.resolve(__dirname, "../.env");

const writeDefaultTenantToEnv = (tenantId: string) => {
  try {
    if (!fs.existsSync(ENV_PATH)) return;
    const contents = fs.readFileSync(ENV_PATH, "utf8");
    if (/^DEFAULT_TENANT_ID=/m.test(contents)) return; // already set — never overwrite
    const withNewline = contents.endsWith("\n") ? contents : `${contents}\n`;
    fs.writeFileSync(
      ENV_PATH,
      `${withNewline}\n# Set automatically by migration 002_backfill_tenant_id — the tenant\n# unauthenticated/public storefront requests resolve to by default.\nDEFAULT_TENANT_ID=${tenantId}\n`,
    );
    console.log(`  Wrote DEFAULT_TENANT_ID=${tenantId} to .env`);
  } catch (err) {
    console.warn(`  Could not write DEFAULT_TENANT_ID to .env automatically — set it manually: DEFAULT_TENANT_ID=${tenantId}`, err);
  }
};

/**
 * Resolves the single default tenant to backfill onto pre-existing data. Tries, in
 * order: a primary admin, any admin, whoever the sole staff profile is managed by
 * (covers real-world data observed where a SUPER_ADMIN created staff/catalog data
 * directly with no ADMIN account ever existing), then the earliest super admin.
 */
async function resolveDefaultTenant(db: mongoose.mongo.Db): Promise<{ id: any; label: string } | null> {
  const primaryAdmins = await db
    .collection("users")
    .find({ role: "ADMIN", isPrimaryAdmin: true })
    .sort({ createdAt: 1 })
    .toArray();
  if (primaryAdmins.length > 0) {
    if (primaryAdmins.length > 1) {
      console.warn(
        `  ⚠ Found ${primaryAdmins.length} primary admins — this database may already hold more than one ` +
          "tenant's data merged together (see createAdminUser's pre-fix tenant-linkage bug). Backfilling " +
          "everything to the earliest-created one; review and manually reassign tenantId for any records " +
          "that actually belong to a different tenant.",
      );
    }
    return { id: primaryAdmins[0]._id, label: primaryAdmins[0].username ?? primaryAdmins[0].email };
  }

  const anyAdmin = await db.collection("users").find({ role: "ADMIN" }).sort({ createdAt: 1 }).limit(1).toArray();
  if (anyAdmin.length > 0) {
    console.warn("  ⚠ No primary admin found, but an ADMIN row exists without isPrimaryAdmin set — using it.");
    return { id: anyAdmin[0]._id, label: anyAdmin[0].username ?? anyAdmin[0].email };
  }

  const staffProfile = await db.collection("staffprofiles").find().sort({ createdAt: 1 }).limit(1).toArray();
  if (staffProfile.length > 0 && staffProfile[0].managedBy) {
    const manager = await db.collection("users").findOne({ _id: staffProfile[0].managedBy });
    if (manager) {
      console.warn(
        `  ⚠ No ADMIN account exists at all — falling back to the ${manager.role} who manages the ` +
          `existing staff profile (${manager.username ?? manager.email}) as the de facto tenant owner.`,
      );
      return { id: manager._id, label: manager.username ?? manager.email };
    }
  }

  const superAdmin = await db.collection("users").find({ role: "SUPER_ADMIN" }).sort({ createdAt: 1 }).limit(1).toArray();
  if (superAdmin.length > 0) {
    console.warn(
      `  ⚠ No ADMIN account or staff-managing user found — falling back to the earliest SUPER_ADMIN ` +
        `(${superAdmin[0].username ?? superAdmin[0].email}) as the de facto tenant owner for any pre-existing catalog data.`,
    );
    return { id: superAdmin[0]._id, label: superAdmin[0].username ?? superAdmin[0].email };
  }

  return null;
}

export async function up(): Promise<void> {
  const db = mongoose.connection.db!;

  const resolved = await resolveDefaultTenant(db);
  if (!resolved) {
    console.log("  No admin, staff-managing user, or super admin found — fresh install, nothing to backfill.");
    return;
  }

  const tenantId = resolved.id;
  console.log(`  Resolved default tenant: ${tenantId} (${resolved.label})`);

  for (const collectionName of TENANT_OWNED_COLLECTIONS) {
    const exists = await db.listCollections({ name: collectionName }).toArray();
    if (exists.length === 0) continue;
    const result = await db
      .collection(collectionName)
      .updateMany({ tenantId: { $exists: false } }, { $set: { tenantId } });
    if (result.modifiedCount > 0) {
      console.log(`  ${collectionName}: backfilled tenantId on ${result.modifiedCount} document(s)`);
    }
  }

  // Users: every non-SUPER_ADMIN row belongs to this tenant (there is currently only
  // ever one). The primary admin itself is self-referential — tenantId === its own _id,
  // which `tenantId` (resolved above, from that same document) already satisfies.
  const userResult = await db
    .collection("users")
    .updateMany({ tenantId: { $exists: false }, role: { $ne: "SUPER_ADMIN" } }, { $set: { tenantId } });
  if (userResult.modifiedCount > 0) {
    console.log(`  users: backfilled tenantId on ${userResult.modifiedCount} document(s)`);
  }

  // Now that every document has a tenantId, it's safe to build the new compound unique
  // indexes (tenantId, code)/(tenantId, key) declared in models/mongoose.ts — building
  // them before the backfill could conflict with the interim all-null tenantId state.
  for (const modelName of ["Category", "Product", "Coupon", "AppSetting", "User"]) {
    const model = mongoose.model(modelName);
    const dropped = await model.syncIndexes();
    console.log(`  ${modelName}: indexes synced${dropped.length ? ` (dropped: ${dropped.join(", ")})` : ""}`);
  }

  writeDefaultTenantToEnv(tenantId.toString());
}

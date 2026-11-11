// migrations/007_remove_tenant_scoping.ts
//
// Removes per-admin multi-tenancy entirely. The app used to treat every primary ADMIN
// as its own isolated "tenant" (see the now-deleted models/plugins/tenantScope.plugin.ts
// and middleware/tenantResolution.middleware.ts) — a SUPER_ADMIN onboarding a new ADMIN
// always spun up a brand-new, independent store rather than adding a partner-admin to an
// existing one. The business this app actually runs for is a single store with multiple
// partner-admins, so that isolation was pure overhead: this migration collapses the data
// down to one shared business and the surrounding code (models/mongoose.ts and every
// controller that read req.tenantId) drops the tenantId/isPrimaryAdmin/primaryAdminId
// fields and the scoping plugin entirely.
//
// Three things happen here, in order:
//   1. Delete every "orphaned tenant"'s data — a tenantId value with no corresponding
//      User document at all (its owning admin account no longer exists). This also
//      cascade-deletes CategoryAttributeValue/ProductAttributeValue rows (which have no
//      tenantId of their own, only a parentId into Category/Product) and the Cart/
//      CartItem/Wishlist/Address/Otp rows of any deleted customer accounts.
//   2. Resolve the one real cross-admin conflict: both surviving admins had their own
//      AppSetting("HERO_CONFIG") row — AppSetting.key is about to become globally
//      unique, so the loser must go. Kichu GK ("Home Decor") is the canonical surviving
//      business (see the pending admin.controller.ts changes) — its copy wins; any
//      other duplicate key across the surviving admins falls back to keep-the-oldest.
//   3. $unset the tenantId/isPrimaryAdmin/primaryAdminId fields everywhere, then run
//      syncIndexes() on every model so MongoDB drops the old {tenantId,...} compound
//      indexes and builds the new plain-field replacements declared in the (already
//      updated, by the time this runs) models/mongoose.ts.
//
// Must run AFTER the models/mongoose.ts schema edits land — syncIndexes() reconciles
// against whatever schema is currently loaded, so running this against the OLD schema
// would rebuild the OLD tenant-prefixed indexes instead of dropping them.

import mongoose from "mongoose";
import "../src/models/mongoose"; // side-effect import — registers every model's schema

// Every collection that used to carry a tenantId field (14 from the original
// tenant-owned list + DeliveryPartner/ProductVariant, added after that list was
// written — see the pre-flight audit run before this migration was authored).
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
  "deliverypartners",
  "productvariants",
];

// Every model whose index set changed (tenantId dropped from every compound index it
// was part of) — syncIndexes() on each reconciles the live DB to match.
const MODELS_TO_RESYNC = [
  "User",
  "Category",
  "DeliveryPartner",
  "Product",
  "CategoryAttribute",
  "ProductVariant",
  "OrderItem",
  "Order",
  "Review",
  "Notification",
  "Coupon",
  "StaffProfile",
  "AuditLog",
  "AppSetting",
  "PaymentLog",
  "HomeBanner",
  "CustomerTracker",
];

export async function up(): Promise<void> {
  const db = mongoose.connection.db!;

  // ── 1. Delete every orphaned tenant's data ────────────────────────────────────────
  const existingUserIds = new Set(
    (await db.collection("users").find({}, { projection: { _id: 1 } }).toArray()).map((u) => u._id.toString()),
  );

  const orphanedTenantIds = new Set<string>();
  for (const collectionName of TENANT_OWNED_COLLECTIONS) {
    const exists = await db.listCollections({ name: collectionName }).toArray();
    if (exists.length === 0) continue;
    const tenantIds = await db.collection(collectionName).distinct("tenantId");
    for (const t of tenantIds) {
      if (t && !existingUserIds.has(t.toString())) orphanedTenantIds.add(t.toString());
    }
  }

  if (orphanedTenantIds.size === 0) {
    console.log("  No orphaned tenants found — nothing to delete.");
  } else {
    console.log(`  Found ${orphanedTenantIds.size} orphaned tenant id(s): ${[...orphanedTenantIds].join(", ")}`);
    const orphanedObjectIds = [...orphanedTenantIds].map((id) => new mongoose.Types.ObjectId(id));

    // Cascade targets that have no tenantId of their own, only a parent reference —
    // resolve their parent ids in each orphaned tenant BEFORE deleting the parents.
    const orphanedCategoryAttrIds = (
      await db.collection("categoryattributes").find({ tenantId: { $in: orphanedObjectIds } }, { projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const orphanedProductIds = (
      await db.collection("products").find({ tenantId: { $in: orphanedObjectIds } }, { projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const orphanedCustomerIds = (
      await db.collection("users").find({ tenantId: { $in: orphanedObjectIds } }, { projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);

    for (const collectionName of TENANT_OWNED_COLLECTIONS) {
      const exists = await db.listCollections({ name: collectionName }).toArray();
      if (exists.length === 0) continue;
      const result = await db.collection(collectionName).deleteMany({ tenantId: { $in: orphanedObjectIds } });
      if (result.deletedCount > 0) {
        console.log(`  ${collectionName}: deleted ${result.deletedCount} orphaned-tenant document(s)`);
      }
    }

    if (orphanedCategoryAttrIds.length > 0) {
      const r = await db.collection("categoryattributevalues").deleteMany({ attributeId: { $in: orphanedCategoryAttrIds } });
      if (r.deletedCount > 0) console.log(`  categoryattributevalues: deleted ${r.deletedCount} cascade document(s)`);
    }
    if (orphanedProductIds.length > 0) {
      const r = await db.collection("productattributevalues").deleteMany({ productId: { $in: orphanedProductIds } });
      if (r.deletedCount > 0) console.log(`  productattributevalues: deleted ${r.deletedCount} cascade document(s)`);
    }
    if (orphanedCustomerIds.length > 0) {
      for (const [collectionName, field] of [
        ["carts", "userId"],
        ["cartitems", "userId"],
        ["wishlists", "userId"],
        ["addresses", "userId"],
        ["otps", "userId"],
      ] as const) {
        const exists = await db.listCollections({ name: collectionName }).toArray();
        if (exists.length === 0) continue;
        const r = await db.collection(collectionName).deleteMany({ [field]: { $in: orphanedCustomerIds } });
        if (r.deletedCount > 0) console.log(`  ${collectionName}: deleted ${r.deletedCount} cascade document(s)`);
      }
    }

    const userResult = await db.collection("users").deleteMany({ tenantId: { $in: orphanedObjectIds } });
    if (userResult.deletedCount > 0) {
      console.log(`  users: deleted ${userResult.deletedCount} orphaned-tenant account(s)`);
    }
  }

  // ── 2. Resolve AppSetting.key conflicts among surviving admins ───────────────────
  // Kichu GK is the canonical surviving business — its copy wins any key collision;
  // any other collision (not involving Kichu GK) falls back to keep-the-oldest.
  const appsettingsExists = await db.listCollections({ name: "appsettings" }).toArray();
  if (appsettingsExists.length > 0) {
    const canonicalAdmin = await db.collection("users").findOne({ email: "kichugk7@gmail.com", role: "ADMIN" });
    const keys = await db.collection("appsettings").distinct("key");
    for (const key of keys) {
      const rows = await db.collection("appsettings").find({ key }).sort({ createdAt: 1 }).toArray();
      if (rows.length <= 1) continue;
      const keeper = (canonicalAdmin && rows.find((r) => r.tenantId?.toString() === canonicalAdmin._id.toString())) ?? rows[0];
      const loserIds = rows.filter((r) => r._id.toString() !== keeper._id.toString()).map((r) => r._id);
      const r = await db.collection("appsettings").deleteMany({ _id: { $in: loserIds } });
      console.log(`  appsettings: resolved "${key}" conflict — kept ${keeper._id}, deleted ${r.deletedCount} duplicate(s)`);
    }
  }

  // ── 3. Strip the fields, then reconcile indexes to the new schema ────────────────
  for (const collectionName of [...TENANT_OWNED_COLLECTIONS, "users"]) {
    const exists = await db.listCollections({ name: collectionName }).toArray();
    if (exists.length === 0) continue;
    const unsetFields: Record<string, ""> = { tenantId: "" };
    if (collectionName === "users") {
      unsetFields.isPrimaryAdmin = "";
      unsetFields.primaryAdminId = "";
    }
    const result = await db.collection(collectionName).updateMany({}, { $unset: unsetFields });
    if (result.modifiedCount > 0) {
      console.log(`  ${collectionName}: stripped tenant field(s) from ${result.modifiedCount} document(s)`);
    }
  }

  for (const modelName of MODELS_TO_RESYNC) {
    const model = mongoose.model(modelName);
    const dropped = await model.syncIndexes();
    console.log(`  ${modelName}: indexes synced${dropped.length ? ` (dropped: ${dropped.join(", ")})` : ""}`);
  }
}

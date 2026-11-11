# API Update Guide: Smart Feature Flags & Maintenance UX

## **Overview & Purpose**
The `GET /api/super-admin/features` API has been updated to fix a major UX flaw. Previously, if a user paid for an Add-on, but the Super Admin temporarily disabled it platform-wide, the frontend would prompt the user to "Upgrade" or "Buy" the feature again. 

To fix this, the API now exposes the "raw" state of the feature alongside the strict access flag. This allows the frontend to differentiate between an unowned feature (requires an upsell) and an offline feature (requires a maintenance screen).

---

## **Endpoint Details**
* **Method:** `GET`
* **URL:** `/api/super-admin/features`
* **Auth Required:** `Yes` (Requires Admin or Super Admin JWT)

---

## **What Changed in the Payload?**
We have added two new boolean properties to every feature object in the array: `isOwned` and `isGloballyEnabled`.

**New Response Example:**
```json
[
  {
    "feature": "STAFF_MANAGEMENT",
    "label": "Staff Management",
    "isEnabled": false,
    "isOwned": true,
    "isGloballyEnabled": false
  }
]

Field DefinitionsPropertyTypeDescriptionisEnabledbooleanThe Master Gate. Used to actually block/allow functionality. Mathematically: isOwned && isGloballyEnabled.isOwnedbooleanThe Wallet Check. true if the tenant's base plan includes this feature, OR if they have explicitly purchased it as an add-on.isGloballyEnabledbooleanThe Platform Check. true if the Super Admin has the feature turned ON globally. false if the Super Admin has paused it platform-wide.Frontend UI Rendering Logic (The Matrix)When rendering locked features in the dashboard, stop checking isEnabled alone. Instead, use this truth table based on isOwned and isGloballyEnabled to render the correct UI component:isOwnedisGloballyEnabledFE Action / UI Component DisplaytruetrueNormal Access. User can fully use the feature.falsetrueUpsell State. Render the "Upgrade to Pro" or "Purchase Add-on for ₹500" UI.truefalseMaintenance State. Render a "Temporarily Under Maintenance" UI. Crucial: Do not ask them to buy it again, as they already own it.falsefalseMaintenance State. Render a "Temporarily Under Maintenance" UI. (We do not want to sell a feature that is currently broken/offline).


These three statuses come directly from the /api/super-admin/features API response that populates your frontend dashboard. They represent the "Smart Feature Gate" logic that separates what a user paid for from what is technically available.

Here is exactly where each one comes from and what it denotes:

1. "isOwned": true (The "Wallet" Check)
Where it comes from: The Subscription and Plan collections in your database.

What it denotes: This answers the question: "Does this specific shop have the right to use this feature?" * In this scenario (true): It means the admin user either gets this feature included in their base plan (e.g., Lifetime Basic), OR they explicitly paid for it as an add-on. They own it.

2. "isGloballyEnabled": false (The "Master Switch" Check)
Where it comes from: The FeatureFlag collection managed by the Super Admin in the Feature Settings page.

What it denotes: This answers the question: "Is the Super Admin currently allowing this feature to run platform-wide?"

In this scenario (false): It means the Super Admin has toggled this feature OFF for everyone on the platform, likely to fix a bug, perform maintenance, or deprecate the feature.

3. "isEnabled": false (The "Final Verdict")
Where it comes from: A strict mathematical calculation in your backend middleware: isOwned && isGloballyEnabled.

What it denotes: This is the ultimate access rule. If this is false, your backend APIs will block the user from performing actions related to this feature.

In this scenario (false): Even though the user owns it, because the Super Admin turned the master switch off, the feature is completely locked.

What this specific combination means for the Frontend UX
When your frontend receives this exact payload (isEnabled: false, isOwned: true, isGloballyEnabled: false), it tells the UI exactly how to handle the locked screen.

Because the user owns it (true) but the system is globally disabled (false), your frontend knows not to show the "Upgrade to Pro to use this feature" screen. Showing an upgrade screen here would anger the customer because they already paid for it.
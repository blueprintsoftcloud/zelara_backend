Here's the complete, consolidated prompt covering everything we discussed:

---

**Prompt:**

> Update my e-commerce warehouse/shipping system with the following changes. I'm using `shipping.service.ts`, `settings.controller.ts`, `address.controller.ts`, `order.controller.ts`, `WarehouseSettings.tsx`, `CheckoutPage.tsx`, and `AddressForm.tsx`.
>
> **1. Remove these existing config fields entirely:**
> - `sameStateName` (`SHIPPING_SAME_STATE`)
> - `otherStateFlatRate` (`SHIPPING_OTHER_STATE_FLAT`)
> - `sameStateBaseRate` (`SHIPPING_SAME_STATE_BASE`)
> - `manualFlatRate` (`SHIPPING_MANUAL_FLAT`)
>
> **2. Replace them with a per-state base rate map:**
> - Admin UI (`WarehouseSettings.tsx`) gets a **State dropdown** (all Indian states/UTs). Selecting a state reveals an input field to set that state's **Base Rate (₹)**. Admin can add multiple states, each with its own rate, stored as something like `stateRates: Record<string, number>` (or a new `ShippingStateRate` table) in place of the old AppSetting keys.
>
> **3. Keep these exactly as-is, applied globally to every state:**
> - `sameStateFreeKmThreshold` (`SHIPPING_SAME_STATE_FREE_KM`, default 10 km)
> - `sameStatePerKmRate` (`SHIPPING_SAME_STATE_PER_KM`, default ₹5/km)
>
> **4. New shipping calculation formula (applies to any Indian state, not just one "home" state):**
> ```
> shippingCharge = stateRates[customerState] + max(0, distanceKm - freeKmThreshold) × perKmRate
> ```
>
> **5. Location precision fallback chain (replaces the old single "manual flat rate"):**
> 1. **GPS pin available** → use exact Haversine distance from warehouse to pin.
> 2. **No GPS, but pincode present** → resolve the pincode to its centroid lat/lng and use that distance in the same formula above.
> 3. **No GPS and no valid pincode** → use a flat fallback fee (new configurable `noLocationFlatRate`, replacing `manualFlatRate`).
>
> **6. Checkout UX (`CheckoutPage.tsx`):**
> - Shipping must **never display as "Free" or ₹0** just because GPS hasn't been captured yet.
> - As soon as the customer selects/types their **state** (and/or pincode resolves), immediately show the fallback/pincode-based shipping estimate.
> - Once the customer drops a GPS pin on the map, update the shown fee to the more precise GPS-based calculation.
>
> **7. Unchanged:** International orders still get `₹0 — "No international shipping available"`.
>
> Please update `shipping.service.ts` (`calculateShippingWithConfig`), the `ShippingConfig` interface/DB schema, `settings.controller.ts`, `WarehouseSettings.tsx` admin UI, and `CheckoutPage.tsx`'s live shipping display accordingly.
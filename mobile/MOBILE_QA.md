# Noriss V6 mobile QA and release gate

## Improvements in this build
- Dashboard, inventory, checkout, receipts, and More reload their server data when their tab regains focus. This addresses stale inventory and receipts after completing transactions in another tab.
- Checkout tab waits for role permissions to load before becoming navigable. Server-side permissions remain authoritative.
- Django backend, databases, and migrations are unchanged.

## Required verification on developer machine
1. `cd mobile && npm ci && npm run verify && npx expo-doctor`
2. From the Django root: `python manage.py check && python manage.py test shop`
3. Launch Django on a reachable network interface and Expo with the correct `EXPO_PUBLIC_API_URL`.
4. On Android, verify each tab, navigation, owner and staff permissions, login/logout, offline/error behavior, inventory edits, sale/receipt synchronization, refunds, purchases, expenses, and reports.
5. Test lost HTTP response after server-side sale/purchase commit; confirm idempotent retry does not double-charge or change stock twice.

Device testing and complete visual parity with the web app cannot be asserted from static source inspection.

# Noriss Beautyquest — Mobile visual refinement

This update works from the latest Mobile Design Update archive and preserves Django models, migrations, database files, and API endpoints.

## UI changes
- Home: stronger store overview copy, live-from-loaded-data low-stock list, recent receipt activity, quick navigation.
- Inventory and checkout: branded product monograms and more consistent item cards.
- Checkout: explicit customer and payment labels.
- Receipts: clearer sale status and reference hierarchy.
- Shared styling: improved spacing, rounded cards, dashboard panels, and Android status-bar presentation.

The dashboard's receipt list is **recent loaded receipts**, not an authoritative complete sales ledger. No new financial metrics were invented.

## Verification
- Python compilation: passed.
- Targeted source assertions: 7 passed.
- TypeScript/Expo: not run in this container (node_modules unavailable).
- Android visual and API transaction testing: must be completed on a device.

## Local test
From `mobile/`: `npm ci`, `npm run verify`, `npx expo start --clear`.
Confirm the API URL in `mobile/.env` matches the current Wi-Fi IP of the Django host. Keep Django running with `python manage.py runserver 0.0.0.0:8000` and appropriate ALLOWED_HOSTS.

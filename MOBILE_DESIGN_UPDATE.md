# Mobile design update

This update builds on the Professional UI archive and preserves the Django backend, data files, API paths and business operations.

## Changes
- Reworked the Android sign-in layout with a branded header, clear field labels and a cohesive card layout.
- Restyled text inputs, primary buttons and connection troubleshooting.
- Refined the mobile dashboard hero and the signed-in account header.
- Improved bottom navigation spacing and selected-tab contrast.

## Verification status
- ZIP integrity and file comparison of backend against input: verified during packaging.
- TypeScript compilation and device visual review: **not completed in this environment**. Run `cd mobile; npm ci; npm run verify; npx expo start --clear` on your Windows machine.
- Existing login and transactional API flows were not modified.

Do not deploy to staff before mobile device regression tests. Set `mobile/.env` with the computer's CURRENT LAN IP when using a local Django server.

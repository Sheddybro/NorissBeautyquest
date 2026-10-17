# Phase 9: Native transaction identity and release checks

## Changes
- Replaced non-cryptographic `Math.random()` request UUIDs with `expo-crypto` UUIDs.
- Scoped pending sale and purchase storage to the authenticated immutable `(store_id, user_id)` instead of username.
- Migrates Phase 7/8 pending requests from legacy username keys after successful authentication.
- Stops checkout/purchase submission if secure persistence fails.
- Leaves Django backend, desktop PWA and existing web workflows unchanged.

## Required verification before real use
1. `cd mobile && npm install && npx tsc --noEmit && npx expo-doctor`
2. `python manage.py check && python manage.py test shop.test_mobile_api` (with project requirements installed).
3. Log in on Android, test checkout and purchase with fictional data; verify exact match on Django web.
4. Force interruption after backend commits, restart, retry original request; verify one ledger record.
5. Log out with a pending operation, sign in as a different staff user, ensure it is not exposed.
6. Sign back in as the original user; verify pending request restores.
7. Configure production HTTPS API URL; build with `eas build --platform android --profile preview`.

This is source code, NOT a generated APK or verified production release.

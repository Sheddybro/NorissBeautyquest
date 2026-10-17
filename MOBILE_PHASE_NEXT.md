# Mobile engineering update — 17 October 2026

- Extracted the existing HTTP request implementation from `mobile/app/index.tsx` into `mobile/services/api.ts`, keeping its 12-second timeout, response parsing, authentication header, and errors unchanged.
- Kept all checkout/purchase/refund request bodies and persisted idempotency handling unchanged.
- Updated the source-contract test to read network implementation from its new module and corrected the existing case-sensitive connection-button assertion to match the actual screen label.
- Added a test ensuring the screen imports the shared client.
- Run `cd mobile && npm ci && npm run verify` on a network-connected development machine; this environment could not install `yocto-queue` from its offline npm cache, so TypeScript was not run.
- Django system checks were unavailable here because Django is not installed. Physical Android testing is also outstanding.
- This is an incremental maintainability update, not a completed premium redesign or production release.

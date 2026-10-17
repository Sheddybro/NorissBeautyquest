# Noriss Beautyquest — Expo Android starter

## Scope
This is an evolving mobile implementation, not a completed POS/APK. It includes login, logout, dashboard, product inventory, checkout, receipts, stock purchases, owner tools, and permission-gated refunds. Existing web endpoints and desktop PWA are retained. Android-browser PWA prompts and service-worker registration are disabled by user-agent detection; this does not uninstall a previously installed Android PWA. The browser's own Add to Home Screen menu cannot be removed by a website.

## Django
Run `python manage.py migrate` (creates only the new MobileToken table). Run `python manage.py check` and `python manage.py test`. Keep your original db.sqlite3, secret key and deployment configuration; don't overwrite production data with the sample database.

## Expo
Install Node.js 20+ and run `cd mobile && npm install`. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the HTTPS address of your Django server, without trailing slash. Run `npx expo start` and open Expo Go on your Android device. Expo Go requires a reachable backend; localhost inside the phone does not refer to the laptop. For local Wi-Fi testing, use your computer's LAN IP and Django `runserver 0.0.0.0:8000` with ALLOWED_HOSTS configured; HTTP should be restricted to trusted local testing.

Refunds are available only to accounts whose API profile grants the `refund` operation. Select a sale line from Receipts, choose quantity, reason, refund payment and whether returned goods should be restocked. The request is persisted in SecureStore before submission and retries reuse its original payload and request ID. Refunds still require a network connection; unresolved requests are account-scoped and restored after sign-in.

## Security and release limitations
Tokens are randomly generated, SHA-256 hashed in DB, expire in 12 hours, and can be revoked by logout. They are saved in Expo SecureStore. Login has no endpoint-specific throttling yet: configure reverse-proxy rate limits before public deployment. No refresh token yet; user logs in again after expiry. Existing web sessions remain unchanged. A mobile sale endpoint is deliberately omitted until idempotency and permissions are verified. No APK was built here; EAS Android build needs project dependencies, signing credentials and a build environment.

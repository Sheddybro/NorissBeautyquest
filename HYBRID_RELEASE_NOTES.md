# Noriss V7 Hybrid Android Edition

- Mobile root route now renders the real Django website using react-native-webview.
- One Django HTML/CSS/JS user interface and one Django backend/SQLite database.
- Android back handling, retry on connection failure, HTTPS same-origin navigation policy, external-link delegation.
- Legacy Expo tab routes redirect to hybrid root; original code kept for reference.
- New environment key: `EXPO_PUBLIC_WEB_URL` (not `EXPO_PUBLIC_API_URL`).
- New standalone APK build profile: `productionApk`.
- Read `mobile/VSCODE_HYBRID_TEST_GUIDE.md` before testing.
- Not certified for offline mode, printing, uploads, notifications or hardware integration.

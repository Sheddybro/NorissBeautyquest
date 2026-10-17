# Mobile reliability update — 17 October 2026

This update changes **only the Expo mobile source and one mobile source-contract test**. Django application code, databases, migrations, checkout endpoints and other business operations are unchanged.

## Changes

- Added a **Test connection** control on the login screen. It sends an unauthenticated request to `/health/` with a five-second timeout and shows the configured API URL. It does not send login credentials.
- Reduced the API request timeout from 20 to 12 seconds and improved network error explanations.
- Removed the misleading “LIVE WORKSPACE” label; the dashboard is a loaded snapshot, not a real-time subscription.
- Added a source-contract test for the connection diagnostics.

## Local setup

Find the current IPv4 address of the computer running Django using `ipconfig`. Put `EXPO_PUBLIC_API_URL=http://YOUR_CURRENT_IP:8000` in `mobile/.env` (not in source control). Start Django with `python manage.py runserver 0.0.0.0:8000` and add the current IP to `DJANGO_ALLOWED_HOSTS`. Restart Expo with `npx expo start --clear`. Keep phone and computer on the same reachable network.

The connection test checks reachability only; it does not prove credentials or permissions are valid. A 404 from `/health/` still confirms an HTTP response, but an HTTP 500 indicates a server problem.

## Validation

Source-contract tests passed in the build environment. Python modules compiled. TypeScript compilation, full Django tests, and physical Android validation were **not** rerun in this environment. Before release run `cd mobile && npm ci && npm run verify`, `python manage.py test shop`, and device regression tests. Do not replace the working production version before validation.

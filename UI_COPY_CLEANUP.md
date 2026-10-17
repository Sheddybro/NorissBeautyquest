# User-facing copy cleanup

Removed the setup command and offline technical note from the web login page. Simplified mobile login, reports, stock purchasing, and staff management wording. Kept the mobile connection test control for troubleshooting without exposing the configured API address on the login screen. No database, API, transaction, or permission logic was intentionally changed.

Validate on your own environment with `python manage.py check`, `cd mobile && npm run typecheck`, and `npm test`, then visually inspect both login screens.

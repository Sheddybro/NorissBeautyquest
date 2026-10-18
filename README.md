# Noriss Beautyquest

A Django retail system with a companion Expo/React Native client. The web app remains the source of truth for business logic and the mobile app connects to the same backend APIs.

## Mobile app quick start

1. Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

2. Start the Django backend:

```powershell
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

3. Set the Expo API base to your current machine or LAN address:

```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

If the app is running on another device on your LAN, replace `localhost` with that computer's current LAN IP. Keep the URL stable for the session and avoid hardcoding a stale IP in source files.

4. Start Expo:

```powershell
cd mobile
npm install
npx expo start --android
```

5. Sign in with a valid owner or staff account and keep the app open while testing connectivity.

### Required checks

```powershell
cd mobile
npm run typecheck
npm test
cd ..
python manage.py check
python manage.py test shop
```

### Production and support notes

- Use a stable HTTPS domain for production.
- Keep `EXPO_PUBLIC_API_URL` outside source control if it differs by environment.
- Keep authentication tokens out of logs and avoid exposing raw API errors to end users.
- The app should show a compact diagnostics summary, not a full stack trace, on normal login screens.

## Web app notes

The project still includes the Django web PWA and backend features. Preserve the existing database and business rules while making the mobile client match the working web experience.

## What is included

- Blue/purple dashboard, dark navigation, mobile layouts and bundled premium beauty photograph.
- Multi-item checkout, receipts, refunds, purchases, editable product catalogue/photos, dashboard/chart and low-stock watch.
- Integer kobo accounting (no floating-point database prices).
- Search, pagination, transaction/inventory CSV export with formula escaping.
- Owner, cashier and viewer accounts; Django admin manages users and shop memberships.
- Installable PWA manifest, icons, root-scoped service worker and an offline app shell.
- Offline product creation, purchases and sales using IndexedDB.
- Sequential reconnect synchronisation, UUID retry deduplication, transaction-safe stock updates and a visible conflict queue.
- Offline backup download/restore, owner conflict amendments and explicit conflict discard.
- CSRF/session protection, shop data isolation and tests.

The existing ChatGPT-hosted React app is separate. This project starts with an empty database and does not include its live sales or users.

## Quick start on Windows (PowerShell)

Install Python 3.12 or 3.13 first. Your Python 3.13 installation works with this project.

1. Extract the ZIP and open the `noriss_django` folder in VS Code.
2. Open **Terminal → New Terminal** in that folder.
3. Create the environment:

```powershell
python -m venv .venv
```

You can use the virtual environment directly without changing PowerShell execution policy:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py setup_shop --username owner
.\.venv\Scripts\python.exe manage.py runserver
```

`setup_shop` asks for an email and a strong password. It creates the shop, an owner membership and a superuser. There are no default login credentials.

Open **http://127.0.0.1:8000/** and sign in with the credentials you chose. Wait for **Offline ready** in the Sync centre.

To populate the current owner shop with a full, repeatable sample dataset, run this from the project root after creating the virtual environment and before working on mobile testing:

```powershell
.\.venv\Scripts\python.exe manage.py seed_demo --owner owner
```

This creates a repeatable 100x sample: 900 products, 1,400 multi-line checkouts, 500 expenses, varied purchase batches and expiry dates, refunds, reconciliations, and representative records for product photos/barcodes/archive, staff roles, branches, payment states, receipts, audit, and reporting. Demo staff users have unusable passwords, and no mobile access tokens are created. Existing operations are not duplicated on rerun. These fictional records are for testing only; do not run this command in a live shop.

Each run also adds three replenishment purchases dated today; rerunning on the same day does not duplicate them.

To remove the generated records while keeping other shop data, run `python manage.py clear_demo --owner owner`. The command summarizes what it found and asks for confirmation; append `--yes` to skip the prompt. The main branch is retained.

Use `--scale 1` for the compact base dataset, or choose a value from 1 to 100:

```powershell
.\.venv\Scripts\python.exe manage.py seed_demo --owner owner --scale 10
```

## macOS / Linux

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py setup_shop --username owner
python manage.py runserver
```

## First real shop workflow

1. Inventory → Add product → enter name, category, selling price and reorder level.
2. Purchases → Record purchase → select the product, enter opening stock quantity and unit purchase cost. Use a supplier name such as “Opening stock” if that is the source.
3. Sales → New sale → choose product, quantity, selling price and payment method.
4. Check stock and dashboard totals. Amounts are in naira; database amounts are in kobo.
5. Export inventory or transactions when needed.

Version 2 adds a **multi-product checkout cart**, final numbered receipts, partial refunds with optional restocking, product edits/photos/barcodes, archiving, profit/expense reports, payment reconciliation, batch/expiry tracking, audit records, offline backup restoration and conflict amendments. Debt balances and credit sales are not implemented. The Django admin cannot bypass immutable stock transactions.

## Staff accounts

1. Sign in to `/admin/` with the owner superuser.
2. Under **Users**, add the staff username and password. They do not need staff/superuser privileges to use the main app.
3. Under **Memberships**, add that user, choose your Noriss shop and select their role.

| Role | Permissions |
| --- | --- |
| Owner | Checkout, products/photos/archiving, purchases, refunds, expenses, profit reports, reconciliation, audit and exports |
| Cashier | Checkout/sales and operational records; cannot manage products, refunds, expenses, reconciliation or audit |
| Viewer | View/export only |

A user has one membership in this version. A Django superuser can administer all stores; only trusted owners should receive superuser status. Role changes are enforced on the server when a device reconnects.

## Install on phones and computers

**Production must use HTTPS.** Localhost / 127.0.0.1 work for local development. An ordinary HTTP LAN address will not enable service workers; use HTTPS when testing on a phone.

- Android, Chrome/Edge: use the app's **Install app** button when shown, or the browser Install / Add to Home Screen menu.
- iPhone/iPad: open in Safari → Share → Add to Home Screen.
- Desktop Chrome/Edge: use the browser's install control.

Installation prompts depend on browser and device support. Install help is available from the phone icon in the header. This is a web PWA, not an APK or App Store build.

## How offline operation works

Sign in online once, open the app, and wait for Offline ready. The service worker caches only a **public shell and local static assets**, including the image. Private HTML, login/admin pages, API responses and CSRF tokens are not placed in Cache Storage. The authenticated workspace and its records are saved separately in IndexedDB, under a user/store namespace.

When offline, the app reads the last downloaded workspace and stores new records locally. The dashboard and stock estimates include pending local records. Reopening the root page works after the offline shell has been installed. A brand-new device cannot perform its first login offline.

On reconnect, **keep the app open**. It refreshes the online session/CSRF token, uploads each operation in order, obtains the authoritative updated snapshot, and only then removes acknowledged local records. A lost response is safe to retry because the same UUID is reused. Foreground sync runs on reconnect, window focus and every five seconds. This project does not promise background sync after the browser/OS closes the app.

If another device has consumed the stock, the server rejects the sale without allowing negative inventory. The record stays in **Sync centre → Needs review**, excluded from stock/totals. Restock/correct the situation and retry, or explicitly discard the local record after reviewing it. Later records wait behind the conflict to preserve dependencies.

**Offline is not live multi-device stock.** Two disconnected devices cannot know each other's sales. Stock is a local estimate until sync. Cashiers must review conflicts rather than assuming every offline transaction has been accepted.

Use a trusted, screen-locked device: its downloaded workspace is accessible while offline without a fresh server login. Signing out online removes the active account's local snapshot; signing out is blocked while there are unsynced records. Browser data clearing, private-mode restrictions, storage eviction, device loss and power/storage failures can remove local data. The app requests persistent storage where supported and provides a JSON backup export, but that cannot guarantee storage survives every device condition. Use **Sync centre → Restore offline backup** to import pending operations for the same shop/user. Imports are validated, merge atomically without replacing existing entries, and skip acknowledged UUIDs. An import cannot grant permissions or replace the authoritative server snapshot.

## Hosting (Django-compatible server)

This Python backend cannot be uploaded to a static-only host or run inside the existing Sites Worker runtime. Deploy it to a server/platform that runs Django's WSGI application.

1. Upload the project or push it to your own Git repository.
2. Create a Python 3.12/3.13 environment and install `requirements.txt`.
3. Use PostgreSQL for production; set `DATABASE_URL` to your database connection.
4. Set operating-system environment variables. `.env.example` is a reference; it is **not automatically loaded**.

```text
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<a strong random secret>
DJANGO_ALLOWED_HOSTS=shop.your-domain.example
DJANGO_CSRF_TRUSTED_ORIGINS=https://shop.your-domain.example
DATABASE_URL=postgresql://user:password@host:5432/noriss
```

Generate a secret locally with:

```sh
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

5. Apply schema and collect assets:

```sh
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py setup_shop --username owner
python manage.py check --deploy
```

6. On a Linux host, run behind an HTTPS reverse proxy:

```sh
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 60
```

`Procfile` is supplied for platforms that honour it. `config/wsgi.py` is the entry point for WSGI hosting. Gunicorn is for Linux production, not Windows development. A Dockerfile is also included. Run migrations as a release step, not simultaneously in every worker.

WhiteNoise serves collected static assets. The reverse proxy must pass `X-Forwarded-Proto` correctly for HTTPS; configure and trust that header only on your own proxy. Configure backups of the production database, monitor failed requests and test restoring backups. Keep secrets out of Git.

SQLite is convenient for local testing. If used on a single production server, it needs a persistent disk and backups. Avoid SQLite on ephemeral platform filesystems. PostgreSQL is recommended for multi-device production operation. Hosted traffic/concurrency and iOS/Android installation still need deployment-specific testing.

### PythonAnywhere deployment

Your PythonAnywhere control-panel link is for managing the web app, not the app itself. The public app URL for that configuration is **https://norissbeautyquest.pythonanywhere.com/**. PythonAnywhere must run this project as a Django WSGI app; uploading the files alone does not start it. Use `norissbeautyquest.pythonanywhere.com` as the Django host and `https://norissbeautyquest.pythonanywhere.com` as the trusted CSRF origin, run migrations, collect static files, and configure PythonAnywhere's static-file mapping. Without the host configuration Django rejects requests; without the static mapping the app's CSS/JavaScript and service-worker precache can fail.

1. In **Web**, open the web app identified by `norissbeautyquest.pythonanywhere.com` and use a Python version supported by the account and this project's dependencies. Upload/clone this project. The examples below assume `manage.py` is at `/home/NorissBeautyquest/Noriss_Beautyquestv2/noriss_django/manage.py`; if you uploaded it elsewhere, change `project_home` and the static mapping to the actual path.
2. Create a virtualenv, then install the project requirements into it:

   ```sh
   mkvirtualenv --python=/usr/bin/python3.13 noriss
   pip install -r /home/NorissBeautyquest/Noriss_Beautyquestv2/noriss_django/requirements.txt
   ```

   Select that virtualenv in the **Web** tab. Use the matching interpreter path if PythonAnywhere offers a different supported version.
3. Edit the WSGI configuration file linked from the **Web** tab. Set the project path and deployment settings **before** calling `get_wsgi_application()`:

   ```python
   import os
   import sys

   project_home = "/home/NorissBeautyquest/Noriss_Beautyquestv2/noriss_django"
   if project_home not in sys.path:
       sys.path.insert(0, project_home)

   os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
   os.environ["DJANGO_DEBUG"] = "false"
   os.environ["DJANGO_SECRET_KEY"] = "<generate-a-unique-secret>"
   os.environ["DJANGO_ALLOWED_HOSTS"] = "norissbeautyquest.pythonanywhere.com"
   os.environ["DJANGO_CSRF_TRUSTED_ORIGINS"] = "https://norissbeautyquest.pythonanywhere.com"
   os.environ["DJANGO_SSL_REDIRECT"] = "true"

   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```

   Generate a new secret for this deployment. If using a custom domain, add that exact domain to both host settings as well. Keep the WSGI file private; do not commit the secret. The default SQLite database lives in the project home directory, which is persistent on PythonAnywhere; back it up regularly.
4. In a PythonAnywhere Bash console, activate the same virtualenv and run:

   ```sh
   cd /home/NorissBeautyquest/Noriss_Beautyquestv2/noriss_django
   python manage.py migrate
   python manage.py collectstatic --noinput
   python manage.py setup_shop --username owner
   ```

   Run `setup_shop` only for a new, empty installation; it creates a new owner account and must not be rerun for an existing shop.
5. In the **Web** tab's **Static files** section, map URL `/static/` to `/home/NorissBeautyquest/Noriss_Beautyquestv2/noriss_django/staticfiles`. Reload the web app.
6. Verify these all return successfully over HTTPS: `/health/`, `/accounts/login/`, `/manifest.webmanifest`, `/sw.js`, `/static/shop/app.js`, `/static/shop/app.css`, and `/static/shop/icons/icon-192.png`. Sign in on the phone and keep the app open until it says **Offline ready**. Then test by turning on airplane mode and reopening the app.

On a phone, the first online sign-in and shell download are required. Clearing the browser's site data/cache removes the service worker and may remove the saved offline workspace; after clearing it, go online and sign in again before expecting offline launch. Offline mode cannot complete a first login or reinstall a cleared service worker.

When updating app templates/assets, increment the `CACHE` version in `static/shop/sw.js` (currently `noriss-shell-v10`) so returning devices install the new shell. Do not force an update while a cashier is in a checkout form.

## Tests

```sh
python manage.py test shop
python manage.py check
```

Optional Node tests (only for verification; Node is not required to run the app):

```sh
node tests/core.test.mjs
node tests/service-worker.test.mjs
npm install --prefix tests
python tests/run_dom_tests.py
```

The DOM integration suite creates an isolated temporary database and QA user. It uses the real Django HTTP endpoints, jsdom and fake-indexeddb to test UI logic and IndexedDB workflows. It does not run a real browser and cannot certify installation or visual appearance on a physical phone.

## Files to edit

| File | Purpose |
| --- | --- |
| `config/settings.py` | Django settings and production environment |
| `shop/models.py` | Products, membership, stock movements and operation receipts |
| `shop/services.py` | Python validation, permissions and atomic stock changes |
| `shop/views.py` | Django template/API/PWA views |
| `templates/shop/app.html` | Main Django template |
| `templates/registration/login.html` | Sign-in template |
| `static/shop/app.css` | Blue/purple responsive styling |
| `static/shop/app.js` | Dashboard/forms and reconnect syncing |
| `static/shop/storage.js` | IndexedDB transactions |
| `static/shop/core.js` | Offline projection, totals, validation and exports |
| `static/shop/sw.js` | App shell/static caching |
| `shop/tests.py` | Django business-rule and security tests |

## Image asset

`static/shop/images/beauty-hero.webp` is bundled locally and works offline after setup. It is an AI-generated illustrative beauty scene, not a photograph of your actual stock. It was created with the built-in image generator using this brief: “Premium beauty product photograph: frosted lavender skincare bottles, cobalt serum droppers, cream jar, brush and purple orchids on pale lavender stone; soft studio light, blue/purple palette, no labels or text, negative space for website headings.” Actual product catalogue photographs can be added in a later iteration; current thumbnails reuse this decorative asset.


## Version 2 upgrade from your existing Django app

1. Before changing files, create and verify a database backup. Keep your existing database, environment variables and SECRET_KEY.
2. Replace application source/static/templates with this version. Do not replace your database with a new empty file.
3. Install updated requirements, then run `python manage.py migrate` and `python manage.py collectstatic --noinput`.
4. Restart your Django service. The current service-worker cache version is `noriss-shell-v10`; close/reopen the app to finish the update after preserving/syncing local records.
5. Do **not** rerun `setup_shop` if the owner and memberships already exist. Older single-item queue records still sync with this backend.

The initial migration is unchanged; migration 0002 adds tables/columns without deleting old records. Existing stock with unknown acquisition cost remains explicitly unknown until depleted/replaced. Historical sales are retained; v1 sales without receipt objects remain in transaction history and are not silently assigned fictitious receipt numbers.

## Using the new features

- **Checkout cart:** choose active products, add several lines, adjust quantity/unit price and complete one sale. Duplicate products combine into one line. The server accepts the entire cart or none of it.
- **Receipts:** open a receipt to print or Save as PDF through the browser print dialog, or download a self-contained HTML receipt. Offline receipts display a provisional UUID reference. Final numbers are assigned atomically by the server. Confirmed receipts also have a protected `/receipts/<uuid>/` page.
- **Refunds:** the owner opens a confirmed receipt, selects a sale line and refunds part/all of the remaining quantity. Choose restock for resaleable goods; choose no restock for damaged returns. Refunds record reason/payment/date and never erase the original sale.
- **Inventory → Edit:** change name, category, price, reorder level, barcode, photo and active/archived status. Photos are compressed locally and validated server-side. Archived stock remains in history but is unavailable for new purchases/sales. Product versions prevent silently overwriting edits from another device.
- **Barcode:** manual entry and keyboard-style scanners match the product barcode/SKU exactly. Phone camera scanning requests camera permission and uses BarcodeDetector where supported. Browser support varies; manual/hardware entry is always available. Actual camera testing is still needed on your target phones.
- **Profit & expenses:** owner-only confirmed reports with date filters and CSV export. Cost of goods uses pooled weighted purchase cost captured when the sale syncs; this is separate from FEFO batch quantity allocation. Unknown legacy costs and pending local sales are excluded from confirmed profit. Estimated operating profit deducts recorded expenses; it is not a complete accounting/tax statement.
- **Batches & expiry:** enter batch/lot and optional expiry on each purchase. Sale allocations use first-expiring-first-out among valid batches. Products remain valid on their expiry date and become blocked afterward. A returned item goes back to its original batch and expiry. Alerts show expired stock and batches expiring within 30 days. V1 stock without batches is explicitly untracked.
- **Reconciliation:** sync all devices first, then enter day, opening cash and actual cash/transfer/POS amounts. The expected ledger includes sales minus refunds, operating expenses and stock purchases. One immutable close record is saved per day. If later backdated records change expected amounts, the screen flags the changed current expected amount rather than rewriting the original close.
- **Audit trail:** owner-only latest 200 confirmed actions in the UI; full records remain in the database/admin. Rejected sync attempts are retained in SyncConflict. Rejected quantities/product versions can be amended by the owner and retried without changing confirmed sales.

## Automatic database backups and verified recovery

The app supplies backup commands; start/schedule them on your actual host. The downloaded code cannot schedule jobs on a server that has not been configured yet.

```sh
python manage.py backup_shop --output /secure/backups/noriss-2026-10-13.backup
python manage.py verify_backup /secure/backups/noriss-2026-10-13.backup
# Long-running daily scheduler, keeping 14 verified snapshots:
python manage.py backup_watch --directory /secure/backups --interval 86400 --keep 14
# One scheduled invocation, suitable for cron / Task Scheduler:
python manage.py backup_watch --directory /secure/backups --once --keep 14
```

SQLite uses its online backup API, not a raw live-file copy. PostgreSQL uses `pg_dump --format=custom`; install compatible PostgreSQL client tools on the host. Passwords go through PGPASSWORD, not shell arguments. Backups include a SHA-256 checksum; database photos are included automatically. A checksum verifies file integrity, not whether the business data is correct.

Restore SQLite into a **new file**, never over a live database:

```sh
python manage.py restore_sqlite /secure/backups/noriss-2026-10-13.backup --output /staging/restored.sqlite3
```

Set a staging DATABASE_URL to that file, run migrations/checks and inspect the records. Only then stop production traffic and deliberately switch to the restored database. For PostgreSQL, use `pg_restore` into a new staging database and run the same validation. Automated backup retention removes only timestamped `noriss-*.backup` files in the specified backup directory. Use off-host copies and monitor the scheduler; deployment-specific PostgreSQL restore/concurrency testing remains necessary.

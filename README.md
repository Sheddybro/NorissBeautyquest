# Noriss Beautyquest — Django retail web app + offline PWA

A Python/Django 5.2 LTS implementation of the blue and purple Noriss Beautyquest retail manager. The interface uses Django templates, local CSS and vanilla JavaScript. **No React, no Node.js build and no external APIs are needed to run the app.** JavaScript is included because browsers require it for service workers, IndexedDB, installation and offline synchronisation.

## What is included

- Blue/purple dashboard, dark navigation, mobile layouts and bundled premium beauty photograph.
- Sales, purchases, product catalogue, live transaction totals, weekly chart and low-stock watch.
- Integer kobo accounting (no floating-point database prices).
- Search, pagination, transaction/inventory CSV export with formula escaping.
- Owner, cashier and viewer accounts; Django admin manages users and shop memberships.
- Installable PWA manifest, icons, root-scoped service worker and an offline app shell.
- Offline product creation, purchases and sales using IndexedDB.
- Sequential reconnect synchronisation, UUID retry deduplication, transaction-safe stock updates and a visible conflict queue.
- Local backup download; explicit discard of conflicted records.
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

For optional demo products:

```powershell
.\.venv\Scripts\python.exe manage.py seed_demo --owner owner
```

The demo data is explicitly labelled; the command does not invent sales.

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

Each transaction records **one product**. Multi-item checkout, receipts, refunds, price editing, expiry/batch tracking and debt balances are not implemented in this version. Records are immutable to preserve stock integrity; the Django admin cannot bypass the stock ledger.

## Staff accounts

1. Sign in to `/admin/` with the owner superuser.
2. Under **Users**, add the staff username and password. They do not need staff/superuser privileges to use the main app.
3. Under **Memberships**, add that user, choose your Noriss shop and select their role.

| Role | Permissions |
| --- | --- |
| Owner | Add products, record purchases and sales, view/export shop records |
| Cashier | Record sales, view/export the shop's records |
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

Use a trusted, screen-locked device: its downloaded workspace is accessible while offline without a fresh server login. Signing out online removes the active account's local snapshot; signing out is blocked while there are unsynced records. Browser data clearing, private-mode restrictions, storage eviction, device loss and power/storage failures can remove local data. The app requests persistent storage where supported and provides a JSON backup export, but that cannot guarantee storage survives every device condition. The JSON backup is a recovery record, not an automatic import feature.

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

When updating app templates/assets, increment the `CACHE` version in `static/shop/sw.js` (e.g. `noriss-shell-v2`) so returning devices install the new shell. Do not force an update while a cashier is in a checkout form.

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

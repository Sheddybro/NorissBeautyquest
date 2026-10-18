# Noriss V7 — PythonAnywhere + APK deployment (VS Code / Windows)

## Important safeguards

- **Do not upload your local `db.sqlite3` over the live PythonAnywhere database.** Back up the server DB before any release; upload code separately. The web app and APK share the server DB *through Django*, not by copying SQLite onto phones.
- Do not upload `.venv`, `node_modules`, `.env`, credentials or signing keys.
- PythonAnywhere free plans have resource and renewal restrictions. Check current plan limitations before relying on it for daily retail operations.
- Test the production website in Chrome on your phone before building the APK. WebView shows that website, including its mobile layout.

## A. Deploy Django to PythonAnywhere

1. In VS Code terminal, make a code-only ZIP of the project. **Exclude `db.sqlite3`, `.env`, `.venv`, `node_modules`, `mobile`, `staticfiles`, and `__pycache__`.** Upload/extract that ZIP in PythonAnywhere **Files** (or use your own Git repo). Do not overwrite the server's existing `db.sqlite3`.
2. Open a PythonAnywhere **Bash console**, `cd` to the directory containing `manage.py` and `deploy_pythonanywhere.sh`.
3. Create a private `.env` alongside `manage.py` (no spaces around `=`; quote secrets if needed):

   ```bash
   DJANGO_DEBUG=false
   DJANGO_SECRET_KEY='REPLACE_WITH_A_LONG_RANDOM_SECRET_AND_KEEP_IT_STABLE'
   DJANGO_ALLOWED_HOSTS=norissbeautyquest.pythonanywhere.com
   DJANGO_CSRF_TRUSTED_ORIGINS=https://norissbeautyquest.pythonanywhere.com
   DJANGO_SSL_REDIRECT=true
   ```

   Generate a secret in a trusted Python environment with `python -c "import secrets; print(secrets.token_urlsafe(64))"`. **If the site already has a production secret, keep the existing value.** Ensure `.env` is not publicly served or committed.
4. Run `bash deploy_pythonanywhere.sh`. It installs Python dependencies, runs Django deployment checks, shows the migration plan and **asks before changing the database**, then collects static files. If your PythonAnywhere account cannot install a package or runs out of storage, stop and resolve that issue; do not replace the DB.
5. In PythonAnywhere **Web** tab, set the virtualenv path to `/home/YOUR_USERNAME/YOUR_PROJECT/.venv` and edit the WSGI configuration file to load your app and its `.env`. Example:

   ```python
   import os, sys
   project = '/home/YOUR_USERNAME/YOUR_PROJECT'
   if project not in sys.path:
       sys.path.insert(0, project)
   env_file = os.path.join(project, '.env')
   with open(env_file, encoding='utf-8') as f:
       for raw in f:
           raw = raw.strip()
           if not raw or raw.startswith('#'):
               continue
           key, sep, value = raw.partition('=')
           if sep:
               os.environ[key.strip()] = value.strip().strip('"').strip("'")
   os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```

   Replace paths with your real PythonAnywhere username and project folder. If your existing WSGI configuration already loads environment variables correctly, keep it and adjust only paths as needed.
6. In the Web tab, configure static files if needed (`/static/` to `/home/YOUR_USERNAME/YOUR_PROJECT/staticfiles`), then **Reload**. Open `https://norissbeautyquest.pythonanywhere.com/` and test login, inventory, a test sale, receipts and staff permissions. Check **Web → Error log** if it fails.
7. Confirm that `db.sqlite3` on PythonAnywhere contains the expected business data. If you use an external `DATABASE_URL`, verify it points to the intended production database *before* running migrations.

## B. Build a standalone Android APK on Windows

1. Deploy and verify the HTTPS website **first**.
2. In PowerShell at the project root:

   ```powershell
   .\build_android_apk.ps1 -WebsiteUrl 'https://norissbeautyquest.pythonanywhere.com/'
   ```

   The script checks the mobile dependencies, runs `npm run verify`, signs into Expo EAS if necessary, and requests a **production-profile APK** cloud build. EAS login/account setup, Android credentials, and network access are required. The APK is downloaded from the EAS build page shown in the terminal; this script does **not** claim to create a local APK without an EAS build.
3. If your old `mobile/node_modules` is incompatible, back it up and run `npm ci` from `mobile/`, then retry. Do not copy an old `package-lock.json` over the V7 lockfile.
4. **Check EAS build environment:** `EXPO_PUBLIC_WEB_URL` is read when bundling JavaScript. The build profile includes the default PythonAnywhere URL in `mobile/eas.json`. If you deploy to a different hostname, update that profile's `env.EXPO_PUBLIC_WEB_URL` before building; changing only a local `.env` or PowerShell environment variable may not propagate to an EAS cloud build.
5. Download the APK, install on Android, **turn off your development PC**, switch the phone to mobile data, and test login, stock, sale, receipt, owner/staff permissions, back navigation and logout. The Android app must connect to PythonAnywhere, not `192.168.x.x`.

## C. Share the APK from the Django website

1. Upload the signed APK to Google Drive; enable **Anyone with the link → Viewer** for that file.
2. Put the sharing URL in the website's APK-download link. The link can be a regular external HTTPS anchor with `target="_blank" rel="noopener noreferrer"`.
3. Future APK updates must use the **same Android package name and signing key** with a higher `android.versionCode`. Web-only changes generally do not require an APK rebuild.

## D. Minimum release checklist

- [ ] Server database backed up; existing live SQLite file preserved
- [ ] PythonAnywhere `.env` is private and `DJANGO_DEBUG=false`
- [ ] `manage.py check --deploy`, migrations and static collection checked
- [ ] PythonAnywhere website works on Android Chrome
- [ ] Mobile `npm run verify` passes
- [ ] EAS APK build succeeds, package/version/signing confirmed
- [ ] APK works on mobile data with PC off
- [ ] Same sale appears in web and Android views
- [ ] Staff access restrictions, logout, receipts and refunds tested
- [ ] Google Drive link opens the correct release APK

# Noriss V7 — VS Code end-to-end test guide

## What changed

The Android app now opens the **same Django web pages** as the browser. Login uses Django sessions and CSRF rather than the previous separate Expo API-token login. Django and Android share the **same server-side SQLite database**; the APK never copies or directly opens SQLite.

The old React Native tab screens are retained for reference but the tab router redirects to the hybrid homepage. Old source-contract tests were moved to `mobile/legacy-tests/` because they assert the replaced native login/navigation design; `npm test` runs the new hybrid-specific tests. The web app itself is the authoritative UI and workflow.

## 1. Safeguard the existing system

- Extract this ZIP into a **new** folder. Do not overwrite your running site or the previous V6 folder.
- Back up `db.sqlite3`, Django environment secrets and your working `.venv` before running migrations.
- Do **not** copy old `package.json` or `package-lock.json` over this package.
- The supplied database may contain development data. Do not upload it over your live PythonAnywhere database.

## 2. Start Django on Windows

From the project root in VS Code PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

If your copied `.venv` cannot launch, create a new one with `py -m venv .venv`, then install requirements. If you use your LAN IP, add it to `DJANGO_ALLOWED_HOSTS` and access the site on your phone's browser first.

## 3. Install mobile dependencies

```powershell
cd mobile
npm install
npx expo-doctor
npm run typecheck
npm test
```

`npm install` is required for this release because `react-native-webview` is newly added and the lockfile could not be regenerated in the offline build environment. It updates `package-lock.json` on your machine. After that succeeds, future clean installs can use `npm ci`. A separate `test/node_modules` is not needed by this mobile project.

## 4. Configure the site URL

Copy `.env.example` to `.env` in `mobile/`. For production:

```dotenv
EXPO_PUBLIC_WEB_URL=https://norissbeautyquest.pythonanywhere.com/
```

For Android testing against your laptop, use its actual LAN IP (example `http://192.168.1.10:8000/`), not `localhost`. HTTP is permitted only for private/local development hosts. Restart Expo after changing `.env`.

## 5. Run Android during development

```powershell
npx expo start --clear
```

Scan the QR code using a compatible Expo Go app. Open your Django website in Chrome on the same phone and compare page-by-page.

## 6. Functional checklist — browser versus Android

Perform each test in both the mobile browser and the hybrid app, using a test business/account:

- [ ] Sign in as owner; correct home page and navigation appear
- [ ] Close and reopen app; session remains until logout/session expiry
- [ ] Sign out; protected pages require authentication
- [ ] Sign in as staff; owner-only controls remain inaccessible
- [ ] Dashboard metrics and recent sales match web
- [ ] Search, add, edit and validate inventory products
- [ ] Complete sale with 1 item, multiple items and mixed quantities
- [ ] Reject invalid monetary inputs and insufficient stock
- [ ] Verify receipt and stock decrement on web after Android sale
- [ ] Create purchase/restock; stock increases exactly once
- [ ] Create expense and verify reports
- [ ] View receipts and refund within permissions
- [ ] Verify unauthorized staff cannot perform owner operations
- [ ] Test Android Back navigation and external website links
- [ ] Disable network; clear error shown; restore network and retry
- [ ] Test keyboard, small screen, landscape, scrolling and form submission
- [ ] Check downloads, file upload, camera and printing if your workflows use them — native support may need further implementation
- [ ] Verify two devices see each other's changes after refreshing
- [ ] Test concurrent sales and database lock behavior under realistic staff load

## 7. Build a standalone APK

```powershell
npm install --global eas-cli
eas login
eas build --platform android --profile productionApk
```

The build needs an Expo account and network connectivity. Set the **production** `EXPO_PUBLIC_WEB_URL` before building. The `preview` profile also produces an APK. The standard `production` profile produces an Android App Bundle, not an APK.

After downloading the APK, switch off the laptop and test it on mobile data. Confirm login, sales, receipts and logout against the public PythonAnywhere site.

## 8. PythonAnywhere deployment checklist

- [ ] Back up the production SQLite database and media before deployment
- [ ] Configure production `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, allowed hosts, CSRF origins, HTTPS
- [ ] Install declared requirements into PythonAnywhere virtualenv
- [ ] Run `python manage.py check --deploy` and inspect warnings
- [ ] Run `python manage.py migrate` only after backup and reviewing migration plan
- [ ] Run `python manage.py collectstatic --noinput`
- [ ] Configure WSGI and reload PythonAnywhere web app
- [ ] Verify HTTPS login and sales from a phone browser first
- [ ] Upload APK to Drive, share read-only, add its link to the Django website
- [ ] Test APK from another Android phone over mobile data

## Known limitations / non-guarantees

- This release has not been tested on a physical Android device in this environment.
- WebView uses live Django pages, so normal operations require internet; offline behavior is **not** guaranteed.
- Downloads, camera/file uploads, printing and notification integrations need device-level acceptance tests.
- Android OS may terminate the app; Django session persistence depends on cookies and server settings.
- Expo builds may need an appropriate `react-native-webview` version for the installed Expo SDK; run `npx expo install --check` and follow its output.

## Validation note

The automated hybrid source-contract suite is limited to configuration/navigation safeguards. It does **not** substitute for Android runtime tests. The older React Native test suite is archived and not counted as passing hybrid functionality. This package could not run TypeScript compilation, Django tests, or install `react-native-webview` here because dependencies/network were unavailable.

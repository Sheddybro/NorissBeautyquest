# Noriss Beautyquest Progress Handoff

**As of:** 2026-10-17  
**Purpose:** Give the next ChatGPT session an accurate starting point. Treat the test history below as recorded evidence, not as proof that every check has been rerun against the current working tree.

## Project Snapshot

This workspace contains two related clients backed by Django:

- The established Django retail application and offline web PWA are documented in [README.md](README.md).
- The newer Expo Android client is in `mobile/`. It is an evolving source implementation, not a built or production-verified APK.
- The project is not connected to the separately hosted React app mentioned in the README. Do not assume that app's users or sales data are present here.

Do not replace the existing database or production configuration. Before migrations, deployment work, or data changes, make and verify a backup. The README describes the current local and hosting workflows.

## Progress Recorded

### Django and offline PWA

- The Django 5.2 retail backend includes products, stock and purchases, multi-item checkout, numbered receipts, refunds, expenses and profit reports, batch/expiry tracking, reconciliation, audit records, staff roles, CSV exports, backups and restore commands.
- The browser app includes an offline shell and IndexedDB-backed offline operations, ordered reconnect synchronization, retry deduplication, a conflict review queue and offline backup restore.
- Security and isolation work includes server-enforced permissions, shop data isolation, CSRF/session protections, validated product photos, immutable transaction history and server-side stock checks. Details and limitations are in [README.md](README.md).

### Android client

- The Expo client includes sign-in/session restoration, dashboard, inventory search and stock filters, checkout, receipts, purchases, owner tools and permission-gated refunds.
- Earlier UI work introduced shared design tokens/components, inventory status indicators and clearer checkout/receipt summaries. See MOBILE_MODERNIZATION_NOTES.md (archived phase note) and FINAL_MODERNIZATION_STATUS.md (archived phase note).
- Phase 3 added session restoration and recovery of pending operations, improved sign-out state handling, accessible button labels and low-stock filtering. See MOBILE_CONTINUATION_PHASE3.md (archived phase note).
- Phase 8 fixed a syntax error and ensured saved checkout/purchase requests remain retryable after app restart. See PHASE8_RELEASE_GATE.md (archived phase note).
- Phase 9 replaced `Math.random()` request IDs with `expo-crypto` UUIDs, scopes pending sales/purchases to `(store_id, user_id)`, migrates legacy pending entries after authentication and blocks submission if secure persistence fails. See [PHASE9_SECURITY_AND_RELEASE.md](PHASE9_SECURITY_AND_RELEASE.md).
- Refund requests are persisted in SecureStore and retry with the same request identity. The mobile API uses expiring, revocable tokens; see [ANDROID_STARTER_README.md](ANDROID_STARTER_README.md).

## Test Evidence

### Recorded passing results

- **Reran on 2026-10-17 in this workspace:** `cd mobile && npm run verify` passed, including the Expo TypeScript check and **14/14** source-contract tests.
- **Reran on 2026-10-17 in this workspace:** `python manage.py check` passed; `python manage.py makemigrations --check --dry-run` found no model changes; `python manage.py test shop` passed **132/132** tests.
- Python `compileall` for `config` and `shop`, `release_checks/check_source.py`, and standalone permission contracts passed; the permission suite ran **6/6** tests.
- `node --test tests/core.test.mjs tests/service-worker.test.mjs` passed both suites.
- `python tests/run_dom_tests.py` passed the Django-backed DOM/IndexedDB workflows against a disposable database and local HTTP server.
- `python manage.py collectstatic --noinput --dry-run` completed successfully and identified **138 static files** without writing collected output.
- [TEST_RESULTS.md](TEST_RESULTS.md) records **90 Django regression/integration tests passing**, covering business rules, permissions and isolation, checkout atomicity and retries, receipts, inventory costs, refunds, batches/expiry, reconciliation, audit, backups and restore. It also records successful DOM/IndexedDB integration against real Django endpoints, JavaScript helper tests, service-worker simulations, a migration upgrade smoke test, Django deployment checks, migration consistency and static collection.
- [TEST_RESULTS.md](TEST_RESULTS.md) records simulated service-worker checks for public-shell/static caching, offline fallback and exclusion of private/API/admin/auth responses. These are simulations, not physical-device browser tests.
- RELEASE_VERIFICATION_2026_10_16.md (archived phase note) records **13/13 mobile source-contract tests passing** and `python -m compileall -q .` passing on 2026-10-16. Archive integrity was also checked.
- PHASE3_README.md (archived phase note) and MOBILE_CONTINUATION_PHASE3.md (archived phase note) record phase-specific source-contract checks passing (3/3 in the earlier Phase 3 report; 13 tests in the later consolidated report).
- The source-contract tests check expected code structure and contracts. They do not establish that the Android app builds, connects to a live backend, or behaves correctly on a physical device.

### Not yet confirmed for the current Android release

- Expo Doctor initially reported `.expo/` was not Git-ignored; added `.expo/` to the existing root `.gitignore` and verified `git check-ignore -v mobile/.expo/` matches it. The follow-up Expo Doctor run reports only the app-config schema check unresolved because its request to the Expo API timed out; all other Doctor checks pass. Retry that final check on a stable network.
- The 2026-10-16 verification report says Expo TypeScript checking did not run because an offline npm install lacked `yocto-queue`; Django checks/tests were also unavailable in that verification environment. A later Django test report records passing server-side tests, so retain those as separate environment-specific results and rerun locally before release.
- No verified Android emulator/physical-device workflow, complete Expo typecheck, `expo-doctor`, or generated EAS APK is evidenced by the release notes.
- The required Phase 9 checks are still listed as release work: `npm install`, `npx tsc --noEmit`, `npx expo-doctor`, Django mobile API tests, owner/staff transaction checks, interrupted-response retry/deduplication, account-switch isolation and an Android preview build.
- Mobile login throttling/rate limiting and token renewal are not implemented according to the starter/release notes; tokens expire after 12 hours. Configure server/proxy protections before public release.

### Device and deployment checks still needed

- Configure `mobile/.env` with the reachable HTTPS Django API URL and launch with Expo.
- On Android, test owner and staff permissions, inventory, checkout, purchases, receipts, refunds, sign-out/account switching and token expiry.
- Simulate a lost response after the server commits a sale/purchase; restart and retry the saved request, confirming one operation and one stock change only.
- Test pending-operation isolation across staff accounts and restoration for the original account.
- Verify camera scanning, layout on target screen sizes, SecureStore behavior, network loss/reconnect and the actual production HTTPS configuration.
- For the web PWA, verify installation, offline launch/storage, printer/PDF behavior and browser-specific behavior on target devices. PostgreSQL concurrency and dump/restore also remain deployment-specific checks.
- `python manage.py check --deploy` was run locally and returned **six deployment warnings**: HSTS is unset, SSL redirect is off, the configured secret key does not meet Django's deployment-strength check, secure session/CSRF cookies are off, and `DEBUG` is on. These are expected for a local development configuration, but must be resolved in the real HTTPS deployment and rechecked there.
- Follow-up: reran `python manage.py check --deploy` with temporary process-only production-style environment values (DEBUG off, placeholder test key, HTTPS redirect and HSTS enabled); it reported **no issues**. This confirms the settings path can satisfy Django's checks, but does not validate the actual host, secrets, proxy, database or deployment configuration.
- `release_checks/check_http.py` was not run because this session was not given a staging HTTPS host. It is a read-only probe for `/health/` and unauthenticated API protection; run it against staging when available.

## Observations

- The web/PWA validation is much more comprehensive than the Android validation. Do not describe the Android client as production-ready based only on source-contract tests or Python compilation.
- The release reports were produced in different environments and at different stages. Their differing availability of Django/Node dependencies is not evidence that tests failed; it means the next session should establish a fresh baseline in this workspace.
- Expo's `.expo/` ignore warning has been addressed by adding the rule to the existing `.gitignore`; Git confirmed it matches `mobile/.expo/`.
- Mobile navigation and screens are still concentrated in a large screen component according to the modernization notes. Consider refactoring only after a passing typecheck and regression baseline, to avoid mixing structural changes with release fixes.
- The README currently emphasizes the Django web PWA, while the Android client has separate setup and release caveats in [ANDROID_STARTER_README.md](ANDROID_STARTER_README.md). Keep both product scopes clear when updating release documentation.
- Offline browser PWA support and Android native-client persistence are different systems: the PWA uses IndexedDB and a service worker; the Expo client uses SecureStore for its pending operations. Do not assume their offline guarantees are interchangeable.

## Suggested Continuation Order

1. Inspect `git status` and the current files; preserve any user changes and the existing database. `progress.md`, `.gitignore`, and several package manifests/lockfiles may be untracked in this worktree.
2. Re-run Expo Doctor's network-dependent schema check when connectivity permits; the `.expo/` ignore warning is resolved.
3. Run `manage.py check --deploy` against the actual HTTPS hosting configuration using its real environment variables. The process-only local production-style check passed, but actual host settings, secrets, proxy and database are not verified; do not copy production-only settings into local development blindly.
4. Configure a reachable HTTPS API and perform the owner/staff and interrupted-request tests on Android. Do not use real shop records for test transactions.
5. Run the HTTP probe against a staging host, then complete physical PWA checks and PostgreSQL concurrency/backup-restore checks on the intended deployment.
6. Only after code and device gates pass, build an Android preview with EAS and update release docs to report the actual build and device results. Do not call it production-ready until hosting, security and recovery checks are complete.

## Useful References

- [README.md](README.md): Django/PWA setup, deployment, data safety and test commands.
- [TEST_RESULTS.md](TEST_RESULTS.md): detailed Django, DOM, IndexedDB, helper and service-worker test record.
- RELEASE_VERIFICATION_2026_10_16.md (archived phase note): dated environment limitations and verification results.
- [ANDROID_STARTER_README.md](ANDROID_STARTER_README.md): Android setup, API requirements and security limitations.
- [PHASE9_SECURITY_AND_RELEASE.md](PHASE9_SECURITY_AND_RELEASE.md): latest native-client changes and mandatory release checks.

## Instructions For The Next ChatGPT Session

Start by checking the current working tree and running the cheapest relevant test. Treat this file as a handoff, not an instruction to overwrite current code. Ask before destructive data operations, preserve existing user changes, and update this progress report with new verified results as work continues.

## Clean package (2026-10-17)

Removed superseded phase reports, Python bytecode caches, Expo local state and machine-specific `mobile/.env`. Preserved both SQLite database files, Django and mobile source, migrations, tests, lockfiles, assets, and key release documentation. Copy `mobile/.env.example` to `mobile/.env` and set the current reachable API address before launching Expo. No application logic was changed by this cleanup.

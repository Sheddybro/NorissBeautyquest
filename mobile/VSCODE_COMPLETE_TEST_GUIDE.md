# NORISS BEAUTYQUEST — COMPLETE VS CODE AND ANDROID TEST GUIDE

This checklist applies to the **V6 premium all-pages UI source**. It is a manual acceptance plan, not evidence that Android or backend integration testing was performed in the packaging environment.

## 1. Safety and installation

1. **Back up your working V6 folder and database** before replacing anything. Do not overwrite a live database with an archive copy.
2. Extract this ZIP into a NEW folder, not over the tested V6 installation.
3. Open the extracted root in VS Code. Confirm `manage.py` and `mobile/package.json` exist.
4. In the Django terminal, activate your existing compatible virtual environment, then install `requirements.txt` if necessary. Check `python --version` and `python manage.py check`.
5. Run `python manage.py makemigrations --check --dry-run` (must not propose unintended migrations).
6. Run `python manage.py test shop` against a disposable test database.
7. In `mobile`, run `npm ci`, `npm run typecheck`, `npm test`, `npm run verify`, `npx expo-doctor`.
8. Create `mobile/.env` using `.env.example` and set `EXPO_PUBLIC_API_URL=http://YOUR_CURRENT_PC_LAN_IP:8000` for local testing only.
9. In PowerShell, find your current IPv4 address using `ipconfig`. Add that address to `DJANGO_ALLOWED_HOSTS`, and start Django with `python manage.py runserver 0.0.0.0:8000`.
10. Confirm the phone and PC are on the same Wi-Fi/hotspot. Run `Test-NetConnection YOUR_CURRENT_PC_LAN_IP -Port 8000` on Windows. Confirm your phone can reach the Django server.
11. Run `npx expo start --clear` in the `mobile` terminal. Open Expo Go on the Android phone.

## 2. Visual acceptance on Android

Test at least one compact phone and, if possible, one larger Android screen. For each page confirm: no clipped text, no overlapping buttons, scrollable content, safe-area clearance, visible input focus, readable contrast, responsive keyboard, no blank states or horizontal overflow.

- [ ] **Login**: logo, heading, fields, password visibility, keyboard, disabled/loading submit, error message, restored session.
- [ ] **Home**: brand header, sales metric cards, recent receipts, chart/empty state, low-stock alert, quick actions, pull-to-refresh.
- [ ] **Inventory**: search, filter chips, product cards, stock labels, create/edit forms, validation, no overlapping controls.
- [ ] **Sell**: product selection, quantity controls, cart, payment method, order total, confirm action, loading/success/error states.
- [ ] **Receipts**: list, search, expand all line items, refund controls, reason and restock inputs, status and feedback.
- [ ] **More**: owner/staff tools, expense entry, reports, staff editing, permissions, settings and logout.
- [ ] **Navigation**: all tabs, Android Back, role-dependent Sell visibility, no keyboard covering bottom controls.

## 3. Functional workflow matrix

Use test accounts and **test products**, not real sales data. Record PASS/FAIL and screenshots.

| ID | Account | Action | Expected result | Result |
|---|---|---|---|---|
| AUTH-01 | Owner | Login with correct credentials | Home opens | [ ] |
| AUTH-02 | Owner | Wrong password | Clear error, no session | [ ] |
| AUTH-03 | Owner | Toggle password visibility | Field toggles | [ ] |
| AUTH-04 | Owner | Close and reopen app | Session restored or clean login | [ ] |
| AUTH-05 | Owner | Logout | Secure session cleared | [ ] |
| AUTH-06 | Staff | Login | Only permitted actions shown | [ ] |
| HOME-01 | Owner | Open Home | Real totals load, no fake values | [ ] |
| HOME-02 | Owner | Refresh Home | Latest server values appear | [ ] |
| HOME-03 | Owner | Disable network then refresh | Error and recovery without crash | [ ] |
| INV-01 | Owner | Search existing product | Matching results | [ ] |
| INV-02 | Owner | Change stock filters | Correct filtered list | [ ] |
| INV-03 | Owner | Create product | Saved and visible on web | [ ] |
| INV-04 | Owner | Edit product | Correct updated details | [ ] |
| INV-05 | Owner | Invalid quantity/cost | Validation, no record written | [ ] |
| INV-06 | Staff | Attempt restricted stock change | UI and backend deny | [ ] |
| POS-01 | Authorized | Add two different products | Correct cart contents | [ ] |
| POS-02 | Authorized | Increase/decrease quantity | Accurate total | [ ] |
| POS-03 | Authorized | Exceed available stock | Sale blocked | [ ] |
| POS-04 | Authorized | Complete cash sale | One receipt and stock deduction | [ ] |
| POS-05 | Authorized | Double-tap submit | Exactly one sale | [ ] |
| POS-06 | Authorized | Interrupt connection after submit | Safe retry, no duplicate sale | [ ] |
| POS-07 | Authorized | Change tabs and return | Cart preserved as intended | [ ] |
| REC-01 | Authorized | Open receipt | Correct items and totals | [ ] |
| REC-02 | Authorized | Receipt with 4+ lines | All lines accessible | [ ] |
| REF-01 | Owner | Refund eligible item | Correct refund and audit record | [ ] |
| REF-02 | Owner | Double-tap refund | One refund only | [ ] |
| REF-03 | Staff | Attempt forbidden refund | UI and backend deny | [ ] |
| REF-04 | Owner | Switch accounts with pending refund | No other-account data leakage | [ ] |
| MORE-01 | Owner | Add stock purchase | Correct stock and purchase record | [ ] |
| MORE-02 | Owner | Enter expense | Saved once with exact amount | [ ] |
| MORE-03 | Owner | Open reports | Real server values, valid dates | [ ] |
| MORE-04 | Owner | Edit staff permissions | Permissions persist | [ ] |
| MORE-05 | Staff | Open More | Restricted owner controls hidden | [ ] |
| MONEY-01 | Owner | Enter 19.99 | Correct 1,999 kobo | [ ] |
| MONEY-02 | Owner | Enter 19.999 or 1e3 | Rejected | [ ] |
| NET-01 | All | Wrong API address | Helpful connection error | [ ] |
| NET-02 | All | Reconnect to API | Retry succeeds | [ ] |
| SEC-01 | All | Switch accounts | No cross-user pending operations | [ ] |

## 4. Regression and release gate

- [ ] Django system checks pass.
- [ ] Django tests pass.
- [ ] Expo Doctor reports no unresolved compatibility issue.
- [ ] TypeScript typecheck passes.
- [ ] All Node tests pass.
- [ ] No unexpected migration is generated.
- [ ] No red screen or unhandled promise rejection on Android.
- [ ] All 5 tabs have been manually opened and used.
- [ ] Every visible action has been exercised for owner and staff.
- [ ] Transactions reconcile between Android and Django web dashboard.
- [ ] Original working database and web app remain intact.

## 5. Reporting failures

For each failure capture: test ID, device/Android version, account role, screen, steps to reproduce, expected vs actual result, screenshot, Expo terminal output, Django terminal output, and relevant HTTP status (never passwords or tokens). This allows targeted fixes without another blind redesign.

## 6. Known verification boundaries

In the packaging environment, the **76 Node source tests passed**. Full TypeScript verification, Django integration tests, and physical Android interaction were **not completed here**. A source-level test pass cannot certify every button or production transaction.

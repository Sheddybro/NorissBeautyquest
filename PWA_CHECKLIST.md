# PWA acceptance checklist for your deployed app

Use a test shop/account and test stock, not live sales.

1. Serve on HTTPS. Check `/health/`, login, manifest, icons, `/sw.js`, `/static/shop/app.js` and `/static/shop/app.css` return successfully; on PythonAnywhere, confirm `/static/` maps to `staticfiles`.
2. Sign in online; open Sync centre and wait for Offline ready. If setup does not finish, inspect those asset URLs and the host's WSGI error log.
3. Add product, purchase 10 units, sell 2. Server/local stock should both be 8.
4. Install on desktop Chrome, Android Chrome and iPhone Safari where required.
5. Disable internet; close/reopen the installed app. Confirm the dashboard and image load.
6. Record a sale of 3 while offline. Confirm Pending and projected stock 5.
7. Close/reopen again offline. Confirm the sale is still pending.
8. Reconnect with the app open. Confirm pending becomes synced and server stock is 5.
9. On two devices, deliberately consume the remaining stock online while the other device has an offline sale queued. Confirm Needs review and no negative server stock.
10. Restock and retry the conflict. Confirm it syncs only once.
11. Expire the session with queued records. Confirm reauthentication is requested and records remain on the device.
12. Record a new product, its purchase and its sale offline. Confirm ordered reconnect sync.
13. Verify cashier cannot purchase/create products and viewer cannot write, including direct API calls.
14. Search, paginate, export CSV and inspect naira amounts and dates.
15. Download the local JSON backup. Verify its contents are readable; keep it private.
16. Confirm sign-out refuses outstanding queue entries and clears the snapshot after the queue is empty.
17. Check keyboard dialog controls, phone layout, image loading and install help.
18. Test a database backup restore and hosting restart without losing records.
19. Test PostgreSQL concurrent checkouts on your production setup.
20. Upgrade cache version with unsynced records present; confirm the queue survives the new release.

Offline stock is an estimate and cannot reflect other disconnected devices. Resolve conflicts with the owner before treating every offline sale as a confirmed server record.

Clearing browser site data removes the service worker and can remove the saved workspace. Reconnect and sign in again to prepare that device before testing offline launch.

## Version 2 acceptance checks

- Checkout at least three products online and offline; force insufficient stock on one line and verify none of the lines were committed.
- Print/save/download a receipt. Verify offline provisional references change to final numbered receipts after sync.
- Partially refund a sale twice; verify over-refund is blocked and correct stock/cost/batch balances remain.
- Refund damaged goods without restocking and verify stock does not increase.
- Edit price/barcode/photo and archive/reactivate products. Change the same product on two devices and resolve the version conflict.
- Purchase dated batches, sell by FEFO, and check expired stock is excluded. Refund goods after expiry and verify they remain unsellable.
- Compare a small hand-calculated weighted-cost example to profit reports, including a refund and an expense.
- Verify cashier/viewer roles cannot access owner costing, expenses, reconciliation or audit data.
- Restore a same-account offline JSON backup twice. Verify queue records are neither overwritten nor duplicated. Reject a foreign-account and malformed backup.
- Amend a conflicted sale quantity and retry; confirm the original rejected attempt remains in SyncConflict and the accepted action is audited.
- Reconcile payments after every device has synced. Add a backdated transaction and verify the earlier close is retained with a changed-ledger notice.
- Scan a real barcode using hardware/manual entry and, where supported, the phone camera.
- Run a scheduled backup, verify checksum, restore into a new staging database and compare records before changing a production database.

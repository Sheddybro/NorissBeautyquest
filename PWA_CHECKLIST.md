# PWA acceptance checklist for your deployed app

Use a test shop/account and test stock, not live sales.

1. Serve on HTTPS. Check manifest, icons and `/sw.js` return 200.
2. Sign in online; open Sync centre and wait for Offline ready.
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

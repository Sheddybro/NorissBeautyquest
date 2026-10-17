# Version 2 verification report

Runtime: Django 5.2.18, Python 3.12.14, Node 24 for optional JavaScript verification.

## Passed

- **90 Django regression/integration tests** including the original business/security cases, checkout atomic rollback, receipt sequence and retry behaviour, weighted inventory cost capture, unknown legacy costs, partial/over/damaged refunds, original-batch returns, FEFO and expired stock, product versions/archiving, unique barcodes, valid/invalid product photos, expenses and reconciliation, audit/acknowledgement snapshots, cashier restrictions, cross-shop isolation, confirmed receipt downloads and database backup verification/restoration.
- **DOM + IndexedDB integration** against real Django HTTP endpoints: original offline purchase/sale sequence, reopening/reconnect, conflict retention/retry, product edits/barcodes, offline multi-item carts, pending/final receipts, restore merge/deduplication/account/schema validation, owner refunds, expenses, profit/batch/reconciliation/audit screens.
- **JavaScript helper tests**: money/CSV/date functions, acknowledged-operation projections, cart/pending receipts, backup schema validation, refund guards and returned expired stock not becoming sellable.
- **Service-worker simulations**: public shell/static precache, offline fallback, private/API/admin/auth exclusions and versioned cache cleanup. Enhancements are included in the offline precache.
- **Upgrade smoke test**: applying migration 0002 to a real migration-0001 SQLite database preserved existing product/stock/price and marked unknown legacy cost honestly.
- Django normal and production deployment checks, migration consistency and static collection.

## Remaining deployment/device checks

These tests do not run a real mobile browser. Actual camera scanning, printer/PDF dialogs, PWA installation, physical-device storage/eviction, screen layouts, multi-tab behaviour on browsers without Web Locks, and PostgreSQL concurrency/pg_dump/pg_restore must be verified on the intended HTTPS deployment. SQLite backup/checksum/restored-copy recovery was tested. The backup scheduler is supplied as a command; it must be started or scheduled by the host administrator.

No live shop data, owner passwords, local test database, installed dependencies or server secrets are included in the ZIP.

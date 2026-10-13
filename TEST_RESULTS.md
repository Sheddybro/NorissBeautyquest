# Verification report

- Django 5.2.18 on Python 3.12.14.
- 22 Django tests passed: login, membership, owner/cashier/viewer permissions, shop isolation, template/PWA routes, JSON and integer validation, CSRF, product retry deduplication, purchase/sale updates, oversell rollback, retry after restock, stock depletion, snapshots and offline timestamps.
- JavaScript helper checks passed: offline projections, acknowledgement deduplication, conflict exclusion, product→purchase dependencies, quantity/price checks, Lagos dates, totals, CSV escaping and HTML escaping.
- Service-worker simulations passed: precache list, offline navigation fallback, static response caching, API/auth/admin exclusions, private HTML not cached and app cache version cleanup.
- Django-backed DOM/IndexedDB integration checks passed: product and purchase forms, offline sale persistence, reopening the workspace, reconnect acknowledgement, stock-conflict retention/retry, dependent offline product→purchase→sale sequence, search and clear-search state.

A real browser could not be installed in the execution environment: the Chromium download was incomplete. DOM/service-worker simulations do not substitute for physical-device tests. Browser installation prompts, service-worker lifecycle, visual layout, iOS/Android behaviour, interrupted device storage and production PostgreSQL concurrency are not certified here. Run the manual checklist on the intended HTTPS deployment before using it as the only shop record.

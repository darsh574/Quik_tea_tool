# Backup — before "SKU Master feeds the routing summary" (2026-09-05)

Pre-change copies of every file touched when `computeSummary` started reading
the SKU Master (`sku_master` table) for SKUs the hard-coded tables don't know:
10ct/20ct bucket from `sachet_count`, weight from `case_gross_wt_lb / 100`,
price by sachet count. Affects the Routing summary, BOL sync and saved PO
records for HomeGoods / TJX / Marshalls.

## Revert (from the repo root)

    cp -r backups/2026-09-05-sku-master-lookup/src/. src/
    cp backups/2026-09-05-sku-master-lookup/scripts/check-sku-lookup.mjs scripts/
    npm run typecheck && npm run check

Same thing via git, if the change was committed: `git revert <commit>`.

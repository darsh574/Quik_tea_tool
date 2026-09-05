# Backup — before the sheet-based pallet formula (2026-09-05)

Copies of the files as they were when the HG / TJX / Marshalls pallet count was
still the prototype's formula:

    pallets = ROUNDUP( (cases20 ÷ 8 × 6 + cases10 ÷ 11 × 4) ÷ 72 ),  min 1

It was replaced by the brand's "Routing logic file.xlsx" logic (per stacking
type: ROUNDUP(cases ÷ ti) layers × case height, summed, ÷ 66 usable inches).
Everything else in these files (SKU Master lookup, weights, prices) is the
same in both versions.

## Revert (from the repo root)

    cp backups/2026-09-05-sheet-pallet-logic/src/lib/formulas.ts src/lib/
    cp backups/2026-09-05-sheet-pallet-logic/src/lib/constants.ts src/lib/
    cp backups/2026-09-05-sheet-pallet-logic/scripts/check-sku-lookup.mjs scripts/
    npm run typecheck && npm run check

Same thing via git, if the change was committed: `git revert <commit>`.

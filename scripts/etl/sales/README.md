# Sales ETL Placeholder

Operational data migration scaffolding for the Sales 영업관리 modules.

**Status:** placeholder. Real ETL is scheduled for Phase 7 in a separate plan.

## Layout

```
scripts/etl/sales/                # tracked in git
  README.md                       # this file
  transform/                      # transform scripts (future)
    tbiz110-to-sales-opportunity.ts       # P2 — 영업기회
    tbiz112-to-sales-opportunity-memo.ts  # P2
    tbiz115-to-sales-activity.ts          # P2 — 영업활동
    tbiz116-to-sales-activity-memo.ts     # P2
    tbiz100-to-sales-customer.ts          # P1 (already merged)
    ...

.local/etl/sales/                 # gitignored — extracted/transformed dumps + logs
  extracted/
  transformed/
  logs/
```

## Policy

- **Code (transform/, README, scripts):** committed.
- **Data (.local/etl/sales/):** never committed; symlinked or local only.
- **Operational data assumed empty** at P2 merge time. If non-zero rows exist in
  source TBIZ110/112/115/116, run a backfill migration as a separate task —
  do not retro-fit data through the schema migration.

## Phase 2 in-scope domains

| Source | Target table | Status |
|---|---|---|
| TBIZ110 | `sales_opportunity` | placeholder transform pending (P7) |
| TBIZ112 | `sales_opportunity_memo` | placeholder transform pending (P7) |
| TBIZ115 | `sales_activity` | placeholder transform pending (P7) |
| TBIZ116 | `sales_activity_memo` | placeholder transform pending (P7) |

## P7 follow-up

When real ETL is required, add transform scripts under `transform/` and document
the extract → transform → load workflow here. Reference existing P1 transforms
(if any) for the canonical pattern.

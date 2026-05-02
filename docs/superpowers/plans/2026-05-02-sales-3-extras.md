# Sales 3 Extras Plan

## Goal

Ship `/sales/companies`, `/sales/contract-uploads`, and `/sales/plan-view-permissions` using existing Sales full-stack patterns.

## Steps

1. Add design docs.
   Verification: docs exist and capture company/file/ACL decisions.

2. Add DB schema and validation.
   Verification: schema exports compile, `pnpm db:generate` produces the migration.

3. Add server actions.
   Verification: actions require `SALES_ALL`, filter by `workspaceId`, and parse inputs.

4. Add UI pages and grid containers.
   Verification: routes render with `PageHeader`, `GridSearchForm`, and `DataGrid`.

5. Add menus.
   Verification: menu seed includes codes in sort order 230-239 and links `SALES_ALL`.

6. Run verification gates.
   Verification: db generation, schema drift check, type-check, and focused tests pass or blockers are reported.

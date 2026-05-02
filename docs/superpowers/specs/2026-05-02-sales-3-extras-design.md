# Sales 3 Extras Design

Date: 2026-05-02
Branch: `claude/sales-3-extras`

## Scope

Add three sales screens:

1. `/sales/companies`
2. `/sales/contract-uploads`
3. `/sales/plan-view-permissions`

## Phase 1 Findings

### companyMgr

Legacy source:

- JSP: `.local/영업관리모듈/jsp_biz/biz/contract/companyMgr/bizCompanyMgr.jsp`
- XML: `.local/영업관리모듈/src_com_hr_biz/contract/company/BizCompanyMgr-mapping-query.xml`

The XML does not query a company master table. It reads `TSYS001`/`TSYS005` common-code data, constrained to `BIZ_CD = '22'` and `GRCODE_CD = 'B10025'`. The UI is a two-grid common-code manager: group code on the left and company-code detail rows on the right.

Existing Jarvis has `packages/db/schema/company.ts`, backed by `company`, and `/admin/companies` already manages company-like master data from a different source.

Decision: reuse `company` for `/sales/companies`.

Tradeoff: this loses legacy TSYS005-only fields such as `note1..5`, `visualYn`, and language mapping. The simpler path gives Sales a real company-code management screen without forking a second company model. If TSYS005 notes become required, add a narrow extension table later instead of duplicating the master now.

### contractUploadMgr

Legacy source:

- JSP: `planViewPerfUploadMgr.jsp`, `contractAllSearch.jsp`
- XML: `BizContractUploadMgr-mapping-query.xml`

The upload grid persists TBIZ037 with composite key:

`ENTER_CD + YM + COST_CD + COMPANY_CD + PRODUCT_TYPE + CONT_TYPE + PJT_CODE`

The unified search unions:

- TBIZ031 path: contract detail/month data from TBIZ030/TBIZ035/TBIZ031
- TBIZ037 path: uploaded planning/view/performance data

Jarvis already has:

- `raw_source` and `attachment` in `packages/db/schema/file.ts`
- MinIO upload API at `/api/upload`
- contract month data in `sales_contract_month`

Decision: add `sales_contract_upload` for TBIZ037 and keep file storage on the existing MinIO + `raw_source` path. The screen exposes a file upload entry point and a unified search over `sales_contract_month` plus `sales_contract_upload`.

Tradeoff: parsing imported Excel into TBIZ037 is not implemented in this slice. The upload record is preserved in `raw_source`; grid edits use the TBIZ037-shaped table.

### planViewPerMgr

Legacy source:

- JSP: `planViewPerMgr.jsp`, `planViewPerMgrDetailPop.jsp`, `mmPlanViewPerMgrDetailPop.jsp`
- XML: `PlanViewPerMgr-mapping-query.xml`

The legacy screen title is "계획/전망/실적 관리". It manages TBIZ050 and TBIZ051. The legacy code uses page/button auth classes (`authA`, `authR`) and `editable`, but no row-level ACL table appears in the inspected JSP/XML/Java files.

User goal explicitly calls this screen `/sales/plan-view-permissions` and asks for a row-level ACL decision.

Decision: model the TBIZ050/TBIZ051 data and add a dedicated `sales_plan_acl` table. Do not reuse `menu_permission`, because `menu_permission` grants global permission codes to menu items; it cannot represent access to individual plan rows.

Tradeoff: this adds one narrow ACL table now. The first screen applies ACL rows as read/write filters for non-admin users and keeps `SALES_ALL` as the coarse page permission.

## Permissions

Use `PERMISSIONS.SALES_ALL` for all three screens.

No new PERMISSIONS constant is added in this slice. `sales_plan_acl` is data-level policy underneath `SALES_ALL`, not a menu/RBAC action.

## Menu Sort Orders

Use requested range 230-239:

- `sales.companies`: 230
- `sales.contract-uploads`: 231
- `sales.plan-view-permissions`: 232

This collides numerically with existing admin menu orders but not by code or route. The sidebar currently sorts globally by `sortOrder`, so the Sales extras may appear near Admin entries. That is acceptable for this migration slice because the user explicitly requested the range.

## Verification

- `pnpm db:generate`
- `node scripts/check-schema-drift.mjs`
- `pnpm --filter @jarvis/web type-check`
- focused tests for schema/permission paths

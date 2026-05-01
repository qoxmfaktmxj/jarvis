# Sales Mgmt P1.5 Fix Sprint — Design Spec

**작성일**: 2026-05-01
**worktree**: `.claude/worktrees/eager-ritchie-9f4a82` · branch `claude/eager-ritchie-9f4a82`
**선행**: P1 main 머지 완료 (`45bd8fb`) + main HEAD `a49cb7d`(admin/menus permission badges).
**다음 단계**: `superpowers:writing-plans`로 task-by-task 구현 계획서 작성 → handoff → SDD는 별도 시점.

---

## 1. 한 줄 요약

P1 머지 후 발견된 회귀 5건 fix sprint. **sales/licenses 도메인 자체 mismatch (인프라 라이센스를 영업 라이센스로 잘못 해석) → admin/infra/licenses로 이전**, sales-product-type jsonb 모델 → 3테이블 정규화, sales-mail-person 컬럼 누락 보완, 4 sales grid Hidden 정책 + insdate 일괄.

## 2. Scope

### In-Scope
| # | 작업 | 우선 |
|---|---|---|
| 1 | `sales_license`/`sales_license_code` 테이블 drop + `apps/web/app/(app)/sales/licenses/` 라우트 제거 | 🔴 P0 |
| 2 | `infra_license` 신규 (TBIZ500 22 모듈 boolean) + `apps/web/app/(app)/admin/infra/licenses/` 신설 | 🔴 P0 |
| 3 | `sales_product_type` 모델 정규화 (3 테이블: master + cost_master 재활용 + product_type_cost mapping) | 🔴 HIGH (P3 분배원가 의존) |
| 4 | `sales_mail_person`에 `mail_id` NOT NULL + `memo` 컬럼 추가 | 🔴 HIGH |
| 5 | 4 sales grid Hidden 정책 + insdate 일괄 (customers / customer-contacts / product-types / mail-persons) | 🟡 MEDIUM |
| 6 | menu_item seed 갱신 (sales/licenses 제거, admin/infra/licenses 추가, sales/product-cost-mapping 추가) | MEDIUM |

### Out-of-Scope
- 진짜 영업 제품 라이센스(영업 도메인) — 영업 도메인 재정의 시 P3+에서 별도 brainstorm
- sales/customers 11컬럼 → 5컬럼 노출 정책 LOW (사용자 후속 결정)
- license 발급 버튼(`btnFile1`) 실제 로직 — P1.5엔 placeholder, P2/P3+에서 실제 키 발급
- ibSheet 자동 추출 스크립트 — 수동 정리(소량)

## 3. 핵심 결정 (brainstorm 결과)

| ID | 결정 |
|---|---|
| **P0** | sales/licenses → **admin/infra/licenses** 이전 (옵션 A: admin/infra 빈 라우트 활용, SYSTEM_* 권한 재활용) |
| Q1 | sales-product-type **3 테이블 정규화** (master + cost_master 재활용 + product_type_cost mapping row) |
| Q2 | infra_license **1 테이블 그대로** (TBIZ500 1:1, 22 모듈 boolean 컬럼 직접) |
| Q3 | mail-person `mail_id text NOT NULL` + `memo text` + `unique(ws, mail_id)` |
| Q4 | 4 sales grid Hidden 정책 일괄 — PK Hidden, insdate(등록일자) 노출, 레거시 Hidden:1 컬럼 제거 |
| **추가** | sales/product-types UI = **2 페이지 분리** (master grid + 별도 mapping grid `sales/product-cost-mapping`) — sub-grid 첫 도입 회피, P1 grid baseline 일관 |

### Carry-over (P1 그대로)
- 권한: SALES_ALL + admin/infra/licenses는 SYSTEM_* 5종 재활용 / sensitivity 미적용
- grid baseline: `apps/web/components/grid/`
- code_group/code_item 모델
- audit_log + 트랜잭션 모든 mutation
- spec/plan/handoff disposable
- 데이터 정책: P1 운영 시작 전이라 신규 입력 0건 가정 (확인 필요, 0건이면 단순 drop+recreate; 데이터 있으면 backfill 마이그레이션 추가)

## 4. Data Model 변경

### 4.1 Drop
```
DROP TABLE sales_license_code;
DROP TABLE sales_license;
```

### 4.2 New — `infra_license` (TBIZ500)
```
infra_license
  id UUID PK
  workspace_id UUID FK
  company_id UUID FK → company.id (P1 admin/companies 마스터)
  legacy_company_cd / legacy_company_nm text
  symd date NOT NULL
  eymd date
  dev_gb_code text NOT NULL                    -- 환경구분 (DEV/PRD/STG, code_group)
  domain_addr text                              -- VARCHAR2(2000) → text
  ip_addr text
  user_cnt int                                  -- VARCHAR2(1000) → int (실제 숫자)
  corp_cnt int
  emp_yn boolean DEFAULT false NOT NULL         -- 22 모듈 boolean
  hr_yn / org_yn / edu_yn / pap_yn / car_yn
  cpn_yn / tim_yn / ben_yn / app_yn / eis_yn
  sys_yn / year_yn / board_yn / wl_yn / pds_yn
  idp_yn / abhr_yn / work_yn / sec_yn / doc_yn / dis_yn
  ins_user_id UUID FK → user.id
  chk_user_id UUID FK → user.id
  ins_date timestamptz NOT NULL DEFAULT NOW()
  chk_date timestamptz
  unique (workspace_id, company_id, symd, dev_gb_code)   -- TBIZ500 PK 매핑
  index (workspace_id, company_id)
```

신규 code_group 1: `INFRA_DEV_GB` (개발/운영/스테이징 환경구분)

### 4.3 Refactor — sales_product_type (3 테이블)

**Drop 컬럼**: `sales_product_type.cost_mapping_json`

**변경**:
```
sales_product_type            (master 그대로 + 컬럼 정리)
  id UUID PK
  workspace_id UUID FK
  product_type_cd text NOT NULL                 -- legacy code
  product_type_nm text NOT NULL
  ins_date timestamptz / chk_date / ins_user_id / chk_user_id
  unique (workspace_id, product_type_cd)
```

**재활용**: `sales_cost_master` (P1 그대로)

**신규**:
```
sales_product_type_cost       (TBIZ024 row 매핑, NEW)
  id UUID PK
  workspace_id UUID FK
  product_type_id UUID FK → sales_product_type.id ON DELETE CASCADE
  cost_id UUID FK → sales_cost_master.id ON DELETE CASCADE
  legacy_product_type_cd / legacy_cost_cd text  -- legacy lookup
  sdate date NOT NULL
  edate date
  biz_yn boolean DEFAULT false NOT NULL
  note text
  ins_date timestamptz NOT NULL DEFAULT NOW()
  chk_date timestamptz
  ins_user_id / chk_user_id UUID FK → user.id
  unique (workspace_id, product_type_id, cost_id, sdate)
  index (workspace_id, product_type_id)
```

**마이그레이션**:
- 운영 데이터 0건이면: `ALTER TABLE sales_product_type DROP COLUMN cost_mapping_json` + `CREATE TABLE sales_product_type_cost`
- 데이터 있으면: jsonb `[{costCd, sdate, edate, bizYn, note}]` row unpack 후 drop column

### 4.4 Add — sales_mail_person
```
ALTER TABLE sales_mail_person
  ADD COLUMN mail_id text,
  ADD COLUMN memo text;
-- (운영 데이터 있으면) UPDATE ... SET mail_id = '' WHERE mail_id IS NULL;
ALTER TABLE sales_mail_person ALTER COLUMN mail_id SET NOT NULL;
ALTER TABLE sales_mail_person ADD CONSTRAINT sales_mail_person_mail_id_uniq UNIQUE (workspace_id, mail_id);
```

## 5. UI 변경

### 5.1 Drop
- `apps/web/app/(app)/sales/licenses/` 전체 (page.tsx, actions.ts, _components/)
- `apps/web/messages/ko.json` `Sales.Licenses.*` 네임스페이스 제거
- `apps/web/e2e/sales-licenses*.spec.ts` 제거

### 5.2 New — admin/infra/licenses
```
apps/web/app/(app)/admin/infra/licenses/
├─ page.tsx                         # RSC, requirePermission(SYSTEM_READ)
├─ actions.ts                       # listInfraLicenses / saveInfraLicenses
└─ _components/
   ├─ InfraLicensesGrid.tsx
   ├─ useInfraLicensesGridState.ts
   └─ ModuleCheckboxGroup.tsx       # 22 모듈 boolean을 그룹 헤더로 표시
```

ibSheet ground truth (`licenseMgr.jsp:17~51`) — Hidden:0 컬럼만:
- companyNm (Popup → P1 EditableSelectCell + company lookup)
- symd, eymd (Date)
- devGbCd (Combo, INFRA_DEV_GB code_group)
- domainAddr, ipAddr (Text, 160px)
- 22 모듈 CheckBox (헤더 그룹: "모듈|(01)채용관리" ... "(27)파견/위임관리")
- userCnt, corpCnt (Int, EditableNumericCell — P2 spec에서 신설 결정한 컴포넌트, P1.5에 먼저 도입)
- btnFile1 (Html cell, P1.5엔 disabled placeholder)
- companyCd Hidden (PK)

### 5.3 New — sales/product-cost-mapping
```
apps/web/app/(app)/sales/product-cost-mapping/
├─ page.tsx
├─ actions.ts
└─ _components/
   ├─ ProductCostMappingGrid.tsx
   └─ useProductCostMappingGridState.ts
```
컬럼: productTypeNm (lookup) / costNm (lookup) / sdate / edate / bizYn / note / insdate / 등록자

### 5.4 Refactor — 4 sales grid Hidden 정책 일괄

| 도메인 | ibSheet ground truth | 변경 |
|---|---|---|
| sales/customers | `bizActCustCompanyMgr.jsp:221~233` Hidden:0 5컬럼 (custNm·custKindCd·custDivCd·ceoNm·telNo) | custCd/businessNo/businessKind/homepage/addr1 컬럼 grid에서 제거(Hidden:1 또는 미노출), insdate 추가 |
| sales/customer-contacts | `bizActCustomerMgr.jsp:207~220` | custMcd Hidden, custNm 추가(누락), insdate 추가, statusYn/sabun grid에서 제거 |
| sales/product-types (master) | `productTypeMgr.jsp:37~47` | productCd Hidden, productNm 노출, 코스트 매핑은 별도 라우트로 분리 (5.3) |
| sales/mail-persons | `bizMailPersonMgr.jsp:26~35` Hidden:0 6컬럼 (sabun·name·mailId·salesYn·insaYn·memo) | sabun Hidden, mailId·memo 추가(P1 누락), insdate 추가 |

### 5.5 Menu seed 갱신
- 제거: `sales/licenses` 항목
- 추가: `admin/infra/licenses` ("인프라 라이센스") 항목 — `admin/infra` 그룹에 첫 자식
- 추가: `sales/product-cost-mapping` ("제품-코스트 매핑") — sales 그룹

## 6. Server Actions

| 라우트 | actions |
|---|---|
| admin/infra/licenses | listInfraLicenses({q, devGbCode, page, limit}) / saveInfraLicenses({creates, updates, deletes}) — `requirePermission(SYSTEM_*)` |
| sales/product-types | (기존 listProductTypes / saveProductTypes — cost_mapping_json 처리 부분만 제거) |
| sales/product-cost-mapping | listProductCostMapping / saveProductCostMapping — `requirePermission(SALES_ALL)` |
| sales/mail-persons | (기존 + mail_id/memo 필드 처리) |
| sales/customers, sales/customer-contacts | (기존 + grid 컬럼 정리만) |

모두 workspaceId 필터 + `requirePermission` 첫 줄 + Zod input/output `.parse()`.

## 7. Audit log 신규/변경 액션 키
- `infra.license.create` / `.update` / `.delete`
- `sales.product_type_cost.create` / `.update` / `.delete`
- 기존 `sales.product_type.*` 유지 (cost_mapping_json drop은 schema 변경, audit 무관)

## 8. i18n
- 제거: `Sales.Licenses.*`
- 추가: `Admin.Infra.Licenses.*` (22 모듈 라벨 포함), `Sales.ProductCostMapping.*`
- 변경: `Sales.MailPersons.columns.{mailId, memo}`, 4 grid columns에 `insdate`

## 9. Tests
- unit (Vitest): `infra-license` Zod schema, `sales-product-type-cost` Zod schema, mail-person 추가 컬럼 validation
- e2e (Playwright): admin-infra-licenses CRUD smoke, sales-product-cost-mapping CRUD, sales-mail-persons mailId 입력, sales-licenses 제거 확인

검증 게이트: type-check / lint / test / `check-schema-drift --precommit` / `audit:rsc` / playwright. wiki·budget 무관.

## 10. 영향도 (17 계층)

| 계층 | 변경 |
|---|---|
| DB 스키마 | sales-license drop · infra-license 신설 · sales-product-type refactor · sales-mail-person add column → 4 schema 파일 |
| Drizzle 마이그레이션 | `pnpm db:generate` 1회 (DROP + CREATE + ALTER 다수) |
| Validation | infra-license Zod, sales-product-type-cost Zod, sales-mail-person Zod 갱신 |
| 권한 | 신규 PERMISSION 없음 — `SYSTEM_*` (5종) admin/infra/licenses에 재활용, `SALES_ALL` 그대로 |
| Sensitivity | 미적용 |
| Ask AI / wiki / 검색 / 워커 / LLM / page-first | 무관 |
| 서버 액션 | admin/infra/licenses/actions.ts 신규, sales/product-cost-mapping/actions.ts 신규, sales/* 기존 actions 부분 수정 |
| 서버 lib | apps/web/lib/queries/infra-license.ts 신규, sales-product-type-cost.ts 신규 |
| UI 라우트 | sales/licenses 제거 + admin/infra/licenses 신설 + sales/product-cost-mapping 신설 |
| UI 컴포넌트 | InfraLicensesGrid + ModuleCheckboxGroup + ProductCostMappingGrid + 4 sales grid 컬럼 정리 + EditableNumericCell 신설(P2 spec에서 결정한 것 P1.5에 선반입) |
| i18n | Sales.Licenses 제거 + Admin.Infra.Licenses 추가 + Sales.ProductCostMapping 추가 + 4 grid columns insdate · mailId · memo |
| 테스트 | 4 unit + 4 e2e |
| 워커 잡 | 무관 |
| Audit | infra.license.* / sales.product_type_cost.* 액션 키 |
| 메뉴 | menu_item seed 갱신 (sales/licenses 제거 / admin/infra/licenses 추가 / sales/product-cost-mapping 추가) |

## 11. 위험·주의

1. **데이터 0건 가정** — P1 운영 시작 전 가정. 실제 데이터 확인 후 backfill 마이그레이션 결정 (plan task에 별도 step)
2. **sales_license drop은 비가역** — 단순 drop이라 데이터 백업 필요 시 별도 SELECT INTO 후 drop
3. **22 모듈 boolean 컬럼** — 마이그레이션 한번에 22 ADD COLUMN, default false 모두 명시
4. **EditableNumericCell P1.5 선반입** — P2 spec에서 결정한 신규 컴포넌트를 P1.5에서 먼저 도입(infra_license user_cnt/corp_cnt). P2도 그대로 활용
5. **multi-worktree commit 검증** — `cd worktree && git rev-parse --abbrev-ref HEAD` (메모리 feedback)
6. **P2와 충돌 가능성** — P2(영업기회·활동) worktree(`bold-noether-742a91`)는 sales_customer/sales_customer_contact만 의존, P1.5 변경(sales_product_type 모델)과 직접 충돌 X. 단 sales/product-types 라우트가 product type code lookup이 P2 grid에 있을 경우 P1.5 머지 후 재확인

## 12. 다음 단계

`superpowers:writing-plans`로 task-by-task plan 작성 → P1.5 handoff 작성. 본 세션에선 SDD 진입 X (사용자 결정 — P2 본격 진행 우선).

**plan 단계 task 후보 (분할 예시)**:
1. infra-license schema + 마이그레이션 (sales-license drop 포함)
2. sales-product-type 모델 refactor + 마이그레이션 (cost_mapping_json drop, sales_product_type_cost create)
3. sales-mail-person ALTER ADD COLUMN
4. EditableNumericCell 신설 (P2 spec 선반입)
5. admin/infra/licenses 라우트 + grid + 22 모듈 헤더 그룹
6. sales/product-cost-mapping 라우트 + grid
7. sales/mail-persons grid columns 갱신 (mail_id/memo 노출)
8. 4 sales grid Hidden 정책 + insdate 일괄
9. menu_item seed 갱신
10. i18n 갱신 (Sales.Licenses 제거, Admin.Infra.Licenses + Sales.ProductCostMapping 추가)
11. 검증 게이트 + e2e

---

**END OF SPEC.** 사용자 review 또는 P2 본격 진행 우선 시 plan 작성으로 자동 진행.

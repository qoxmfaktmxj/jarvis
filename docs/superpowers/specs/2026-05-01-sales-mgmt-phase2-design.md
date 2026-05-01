# 영업관리 Phase 2 — Design Spec

**작성일**: 2026-05-01
**worktree**: `.claude/worktrees/bold-noether-742a91` · branch `claude/bold-noether-742a91`
**선행**: P1 main 머지 완료 (`45bd8fb`) — `apps/web/components/grid/` baseline + 5 마스터 화면.
**다음 단계**: `superpowers:writing-plans`로 구현 계획서 작성.

---

## 1. 한 줄 요약

영업기회(`sales/opportunities`) + 영업활동(`sales/activities`) + 영업기회현황 dashboard(`sales/opportunities/dashboard`) **3 페이지**. P1 grid baseline 그대로 재활용 + Recharts 첫 도입(BarChart + LineChart). 레거시 ibSheet `Hidden` 메타를 ground truth로 활용해 grid 컬럼 visibility 자동 결정.

## 2. Scope

### In-Scope
| # | 라우트 | 도메인 | 레거시 매핑 |
|---|---|---|---|
| 1 | `/sales/opportunities` | 영업기회 grid | TBIZ110 + TBIZ112 |
| 2 | `/sales/activities` | 영업활동 grid | TBIZ115 + TBIZ116 |
| 3 | `/sales/opportunities/dashboard` | 영업기회현황 (KPI + 2 charts) | TBIZ110 집계 |

### Out-of-Scope (P3+ 위임)
- 첨부파일 UI / MinIO 업로드 (`fileSeq`는 schema 보존만)
- 영업기회 detail page (P2는 grid 인라인 편집만)
- parent-child sub-grid (영업기회 ↔ 활동 연결은 활동 grid의 `bizOpCd` 컬럼·필터로)
- 영업단계 변경 history 테이블 (audit_log diff로 충분, P6 본격화 시 backfill)
- LAST_DLV_CUST 정규화 (P3 계약 도메인에서)
- ETL 23만 행 이관 (P7)
- 사용자별 컬럼 visibility 토글 (P2엔 정적)

## 3. 핵심 설계 결정 (brainstorm 결과)

| ID | 결정 |
|---|---|
| Q1 | **3 페이지 분리** — sub-grid·detail page 없음 |
| Q2 | dashboard = **KPI 카드 4 + 단계별 BarChart + 월별 신규 LineChart** |
| Q3 | 영업단계 history는 **audit_log diff**만 (P1 carry-over) |
| Q4 | **12개 code_group 모두 신규** (보조 컬럼까지 정규화) |
| Q5 | 첨부파일 P2 제외 — `legacy_file_seq` int nullable 보존만 |
| Q6 | FK = UUID — `customer_id` → `sales_customer.id` (P1) / `contact_id` → `sales_customer_contact.id` (P1). legacy code도 별도 보존 |
| Q7 | `LAST_DLV_CUST_*` = nullable text 보존만 (정규화는 P3) |
| **D** | **ibSheet `Hidden` 메타 채택** — schema는 모든 컬럼, grid는 `Hidden:0`인 컬럼만 default visible |

### P1 Carry-over (그대로 유지)
- 권한 = `SALES_ALL` 단일 / sensitivity 미적용
- grid baseline = `apps/web/components/grid/` 100% 재활용
- code_group/code_item 모델 재활용 + admin/codes 화면에서 운영자 편집 가능
- 모든 mutation = audit_log + 트랜잭션
- spec/plan/handoff disposable (head 머지 후 worktree 폐기로 자동 삭제)
- 신규 입력만, 레거시 ETL은 P7

## 4. Data Model

### 4.1 신규 스키마 (4 테이블)

```
sales_opportunity            (TBIZ110 매핑 — 모든 35 컬럼 nullable text/numeric로 보존)
  id UUID PK
  workspace_id UUID FK
  biz_op_nm text NOT NULL                      -- 영업기회명
  customer_id UUID FK → sales_customer.id      -- P1 정규
  contact_id UUID FK → sales_customer_contact.id
  legacy_enter_cd / legacy_biz_op_cd text      -- legacy unique
  legacy_cust_cd / legacy_cust_mcd text        -- legacy lookup
  customer_name text                           -- TBIZ110에 redundant 저장된 cache (운영자 편의)
  last_dlv_customer_name / last_dlv_customer_cd / last_dlv_seq text  -- nullable 보존만
  sale_type_code / biz_type_code / biz_type_detail_code text
  biz_op_source_code / industry_code / biz_step_code / biz_imp_code text
  cont_per_code / biz_area_code / cust_type_code / product_type_code text
  biz_area_detail text                         -- BIZ_AREA_CD_DETAIL freeform
  cont_expec_amt bigint                        -- 천단위 콤마 표시
  cont_impl_per numeric(5,2)                   -- 진행률 %
  expec_apply_amt bigint
  cont_expec_ymd / cont_expec_symd / cont_expec_eymd text  -- 'YYYYMMDD' Oracle 호환
  biz_step_ymd text                            -- 단계 변경일
  focus_mgr_yn boolean                         -- 'Y'/'N' → boolean
  legacy_file_seq int                          -- 보존만, P3에서 attachment 도메인으로
  memo text                                    -- CLOB
  org_nm text                                  -- 담당부서명
  ins_user_id UUID FK → user.id                -- 등록자 (INSID)
  chk_user_id UUID FK → user.id                -- 수정자 (CHKID)
  ins_date timestamptz NOT NULL DEFAULT NOW()
  chk_date timestamptz
  unique (workspace_id, legacy_biz_op_cd)
  index (workspace_id)
  index (workspace_id, biz_step_code)          -- dashboard BarChart group by
  index (workspace_id, ins_date desc)          -- 월별 LineChart

sales_opportunity_memo       (TBIZ112)
  id UUID PK
  workspace_id UUID FK
  opportunity_id UUID FK → sales_opportunity.id ON DELETE CASCADE
  comt_seq int NOT NULL                        -- legacy ordering
  prior_comt_seq int
  memo text NOT NULL
  ins_user_id UUID FK → user.id
  ins_date timestamptz NOT NULL DEFAULT NOW()
  chk_user_id / chk_date
  unique (opportunity_id, comt_seq)

sales_activity               (TBIZ115)
  id UUID PK
  workspace_id UUID FK
  biz_act_nm text NOT NULL                     -- 활동명
  opportunity_id UUID FK → sales_opportunity.id (nullable) -- BIZ_OP_CD optional
  legacy_biz_op_cd text
  customer_id UUID FK → sales_customer.id
  contact_id UUID FK → sales_customer_contact.id
  legacy_cust_cd / legacy_cust_mcd text
  act_ymd text                                 -- 활동일 'YYYYMMDD'
  act_type_code text                           -- SALES_ACT_TYPE
  access_route_code text                       -- SALES_ACCESS_ROUTE
  biz_step_code text                           -- 활동 시점 단계 (SALES_BIZ_STEP)
  product_type_code text                       -- SALES_PRODUCT_TYPE (P1 재활용)
  act_content text                             -- CLOB
  attendee_user_id UUID FK → user.id           -- ATT_SABUN → user FK 매핑
  legacy_att_sabun text                        -- 보존
  legacy_file_seq int                          -- 보존만
  memo text
  ins_user_id / chk_user_id UUID FK
  ins_date timestamptz NOT NULL DEFAULT NOW()
  chk_date timestamptz
  unique (workspace_id, legacy_biz_act_cd)
  index (workspace_id, opportunity_id)
  index (workspace_id, act_ymd desc)

sales_activity_memo          (TBIZ116) — sales_opportunity_memo와 같은 구조
```

### 4.2 신규 code_group 12개 (시드)

| group code | name | 적용 컬럼 |
|---|---|---|
| `SALES_SALE_TYPE` | 판매유형 | sale_type_code |
| `SALES_BIZ_TYPE` | 사업유형 | biz_type_code |
| `SALES_BIZ_TYPE_DETAIL` | 사업유형 상세 | biz_type_detail_code |
| `SALES_BIZ_OP_SOURCE` | 영업기회 출처 | biz_op_source_code |
| `SALES_INDUSTRY` | 산업구분 | industry_code |
| `SALES_BIZ_STEP` | 영업단계 | biz_step_code (영업기회·활동 공통) |
| `SALES_BIZ_IMP` | 중요도 | biz_imp_code |
| `SALES_CONT_PER` | 계약가능성 | cont_per_code |
| `SALES_BIZ_AREA` | 영업지역 | biz_area_code |
| `SALES_CUST_TYPE` | 고객유형 | cust_type_code |
| `SALES_ACT_TYPE` | 영업활동 유형 | act_type_code |
| `SALES_ACCESS_ROUTE` | 접근경로 | access_route_code |

**재활용**: `SALES_PRODUCT_TYPE` (P1 시드, product_type_code에 사용)

각 그룹 item code는 P1 컨벤션 따라 `01/02/.../99`(99=기타). 시드 데이터는 plan 단계에서 `02_data_isu_st.sql` INSERT문 grep으로 추출(미추출 시 placeholder + "운영 데이터 갱신" 주석).

### 4.3 sensitivity / 권한
- 모든 sales_* 테이블 sensitivity 미적용 (P1 일관)
- server action 첫 줄 `requirePermission(PERMISSIONS.SALES_ALL)`
- workspaceId 필터 필수, sensitivity 절 없음

## 5. UI 설계

### 5.1 ibSheet ground truth 채택 모델

레거시 `bizActSalesOpMgr.jsp` / `bizActMgr.jsp` 의 ibSheet `InitColumns`에서 `Hidden:0`인 컬럼만 grid에 default 노출. **schema에는 모두 포함**(legacy data import 호환). plan 단계에서 ibSheet config grep + 파싱 스크립트로 자동 추출.

영업기회 visible 9 컬럼 (확인됨, `bizActSalesOpMgr.jsp:227-262`):

| # | Header | SaveName → 우리 컬럼 | Type → P1 Cell | Width | Format |
|---|---|---|---|---|---|
| 1 | 영업기회명 | bizOpNm → biz_op_nm | EditableTextCell | 250 | — |
| 2 | 고객사명 | custNm → customer_name | EditableTextCell | 100 | — |
| 3 | 제품군 | productTypeCd → product_type_code | EditableSelectCell (SALES_PRODUCT_TYPE) | 120 | — |
| 4 | 영업기회단계 | bizStepCd → biz_step_code | EditableSelectCell (SALES_BIZ_STEP) | 80 | — |
| 5 | 영업기회단계 변경일 | bizStepYmd → biz_step_ymd | EditableDateCell | 100 | YYYYMMDD |
| 6 | 담당부서 | orgNm → org_nm | EditableTextCell (read-only) | 100 | — |
| 7 | 영업담당 | insName → ins_user.name | (read-only display) | 60 | — |
| 8 | 영업기회출처 | bizOpSourceCd → biz_op_source_code | EditableSelectCell (SALES_BIZ_OP_SOURCE) | 200 | — |
| 9 | 등록일자 | insdate → ins_date | EditableDateCell (read-only) | 100 | YYYYMMDD |

영업활동 visible 컬럼은 `bizActMgr.jsp:?` 파싱하여 plan 단계에서 결정.

### 5.2 신규 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| `EditableNumericCell` | `apps/web/components/grid/cells/` | **P2 신설** — Format `###,###` 천단위 콤마, numeric input |
| `OpportunitiesGrid` | `_components/` | 영업기회 grid orchestrator (P1 `CompaniesGrid` 패턴) |
| `useOpportunitiesGridState` | 동상 | clean/new/dirty/deleted 상태 훅 |
| `ActivitiesGrid` + `useActivitiesGridState` | 동상 | 영업활동 |
| `KPICards` | `dashboard/_components/` | 4 KPI 카드 |
| `StepDistributionChart` | 동상 | Recharts BarChart, biz_step_code group by |
| `MonthlyNewChart` | 동상 | Recharts LineChart, ins_date 월별 |

### 5.3 dashboard KPI

| 카드 | 정의 |
|---|---|
| 전체 영업기회 | count |
| 진행 중 예상금액 | sum(cont_expec_amt) where biz_step_code != '계약완료/실패' (특정 단계 제외) |
| 이번달 신규 | count where ins_date >= date_trunc('month', now()) |
| 집중관리 | count where focus_mgr_yn = true |

## 6. Server Actions

### 6.1 sales/opportunities/actions.ts
```
listOpportunities({ q, bizStepCode, productTypeCode, focusOnly, page=0, limit=50 })
  → { rows: Opportunity[], total: number }

saveOpportunities({ creates, updates, deletes })
  → { ok, errors? }
  -- batch transaction + audit_log 'sales.opportunity.{create|update|delete}'

listOpportunityMemos(opportunityId)
saveOpportunityMemos(opportunityId, { creates, updates, deletes })
```

### 6.2 sales/activities/actions.ts
```
listActivities({ q, bizOpCd, actTypeCode, fromDate, toDate, page, limit })
  → { rows, total }

saveActivities({ creates, updates, deletes })

listActivityMemos / saveActivityMemos (동일 패턴)
```

### 6.3 sales/opportunities/dashboard/actions.ts
```
getOpportunityDashboard()
  → { kpis: { totalCount, inProgressAmt, monthNewCount, focusCount },
      byStep: { stepCode, stepName, count }[],
      monthlyNew: { ym, count }[] }
```

모든 action은 `requirePermission(PERMISSIONS.SALES_ALL)` 첫 줄 + Zod input/output `.parse()` + workspaceId 필터.

## 7. i18n

새 네임스페이스:
```
Sales.Opportunities.{title, description, columns.*, status.*, actions.*}
Sales.Activities.{...}
Sales.Dashboard.{title, kpis.*, charts.*}
```
재활용: `Sales.*` 공통키 (P1), `Common.actions.*`. 보간 변수 ko.json↔호출부 매칭은 `jarvis-i18n` 스킬의 경계면 검증.

## 8. Audit / Telemetry

| action key | 시점 |
|---|---|
| `sales.opportunity.create` / `.update` / `.delete` | grid save batch |
| `sales.opportunity.memo.create` / `.update` / `.delete` | memo save |
| `sales.activity.create` / `.update` / `.delete` | grid save batch |
| `sales.activity.memo.create` / `.update` / `.delete` | memo save |

`audit_log.diff` jsonb에 before/after 저장 — 영업단계 변경도 일반 update의 diff에 포함되므로 별도 history 테이블 불요(Q3 결정).

## 9. Testing

| 종류 | 범위 |
|---|---|
| **Unit (Vitest)** | Zod schema validation (sales-opportunity / sales-activity), `EditableNumericCell` 컴포넌트 |
| **e2e (Playwright)** | `sales-opportunities.spec.ts` (CRUD), `sales-activities.spec.ts` (CRUD + biz_op 필터), `sales-dashboard.spec.ts` (KPI 표시 + 차트 렌더 smoke) |

검증 게이트: type-check / lint / test / `check-schema-drift --precommit` / `audit:rsc` / playwright. `wiki:check`·`eval:budget-test` 무관.

## 10. 영향도 체크리스트 (17 계층)

| 계층 | 변경 |
|---|---|
| DB 스키마 | sales-opportunity.ts (2 테이블), sales-activity.ts (2 테이블) — 신규 4 테이블 |
| Drizzle 마이그레이션 | `pnpm db:generate` 1회 |
| Validation | `packages/shared/validation/sales-opportunity.ts`, `.../sales-activity.ts` |
| 권한 | SALES_ALL 재활용 — 신규 PERMISSION 없음 |
| 세션 vs 권한 | requirePermission 패턴 (Knowledge류) |
| Sensitivity | 미적용 |
| Ask AI / wiki-fs / 검색 / 워커 잡 / LLM / page-first | 해당 없음 |
| 서버 액션 | sales/opportunities/actions.ts, sales/activities/actions.ts, sales/opportunities/dashboard/actions.ts |
| 서버 lib | apps/web/lib/queries/sales-opportunity.ts, sales-activity.ts |
| UI 라우트 | (app)/sales/{opportunities, activities, opportunities/dashboard} |
| UI 컴포넌트 | OpportunitiesGrid, ActivitiesGrid, dashboard 3 컴포넌트, EditableNumericCell |
| i18n | Sales.Opportunities.* / Sales.Activities.* / Sales.Dashboard.* |
| 테스트 | unit + e2e 3 spec |
| Audit | sales.opportunity.* + sales.activity.* + memo |

## 11. 위험·주의

1. **TBIZ110 35 컬럼 + nullable** — 실수로 NOT NULL 만들면 마이그레이션 후 운영 데이터 import 실패. 정확한 nullable 결정 필수
2. **legacy_* 컬럼** — `legacy_biz_op_cd`/`legacy_cust_cd` 등 unique constraint, P7 ETL 시점에 lookup 키
3. **focus_mgr_yn boolean 변환** — Oracle 'Y'/'N' VARCHAR → PG boolean 매핑, default false
4. **bigint vs numeric** — 금액 컬럼: bigint(원 단위 정수)이 default 권장 (numeric은 환율 등 소수 필요 시)
5. **multi-worktree commit 검증** — 모든 commit 전 `cd worktree && git rev-parse --abbrev-ref HEAD` (메모리 feedback)
6. **차트 RSC 경계** — Recharts는 client-only, dashboard page.tsx는 RSC + chart 컴포넌트는 'use client' — `audit:rsc` 필수
7. **EditableNumericCell** — P1 패턴 일관 (TextCell처럼 click-to-edit, Enter/blur=commit, Esc=cancel) + numeric input + 천단위 콤마 표시 / 저장은 raw number

## 12. 다음 단계

`superpowers:writing-plans` 진입 — 본 spec을 input으로 task-by-task plan 작성. 파일 변경 순서 20단계(`jarvis-architecture` 스킬) 준수 + 각 task에 spec-reviewer 컨텍스트 주입.

**plan 단계에서 처리할 deferred items**:
- ibSheet config 자동 추출 스크립트 (또는 수동 정리)
- code_group 12개 시드 데이터 추출 (`02_data_isu_st.sql` grep)
- 영업활동 visible 컬럼 셋 (bizActMgr.jsp 파싱)
- TBIZ110/115 컬럼 nullable/numeric/text 최종 결정 (ibSheet `EditLen`/`Format` 메타 활용)

---

**END OF SPEC.** 사용자 review 후 변경 요청 없으면 `superpowers:writing-plans`로 진입.

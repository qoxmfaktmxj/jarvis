---
title: Phase-6 ↔ Phase-7 매핑
date: 2026-04-14
status: reference
related:
  - docs/superpowers/specs/2026-04-14-phase7-v3-design.md
  - docs/analysis/99-review-summary.md
  - docs/analysis/99-integration-plan.md
---

# Phase-6 ↔ Phase-7 매핑

## 1. 배경

**Phase-6**은 Debt Radar + Drift Detection 트랙으로, Jarvis 모노레포의 누적 기술부채와 schema/문서 drift를 정적 분석·감사 관점에서 탐지·점수화하는 데 집중했다. 산출물은 "어디에 어떤 위험이 있는가"의 레지스터지, 해소 액션은 다른 트랙으로 넘기는 구조다.

**Phase-7 v3**은 LLM 의존 기능을 안전하게 확장 가능하도록 만드는 **인프라 게이트**다(`docs/superpowers/specs/2026-04-14-phase7-v3-design.md`). 관측·비용·PII·테넌트·캐시·eval·schema DDL·문서·CI의 9개 PR로 구성되며, 각 PR이 완료되면 숫자 게이트(G1–G7)로 7B 진입 여부를 판단한다.

**왜 매핑이 필요한가.** Phase-6에서 발견된 각 위험이 Phase-7의 어느 PR에서 해소되는지, 어느 게이트에서 검증되는지 **역추적 가능**해야 한다. 그렇지 않으면 (a) 동일 위험이 재발해도 원인을 식별할 수 없고, (b) 7A가 끝난 뒤 "무엇이 남았는가"를 판단할 근거가 사라진다. 본 문서는 그 매핑을 테이블 하나로 고정한다.

## 2. 매핑표

| Phase-6 탐지 | 심각도 | Phase-7 해소 | 게이트 |
|---|---|---|---|
| schema drift | P0 | PR#4 (hook 강화 + CI blocking) | G5 |
| PII leak 가능성 | P0 | PR#3 (redactor + review_queue + 자동 sensitivity 승급) | G2 / G3 |
| cross-workspace data bleed | P0 | PR#9 (integration 테스트 계층) | G4 |
| LLM cost 폭주 | P1 | PR#2 (daily budget kill-switch + 대시보드) | G1 |
| 관측 불가 (LLM 호출 트레이싱 부재) | P1 | PR#1 (`llm_call_log` + pino + Sentry) | G7 |
| cache poisoning (workspace 혼입) | P1 | PR#5 (cache key에 `workspaceId` + `sensitivityScope` 포함) | — |
| eval 없는 LLM 회귀 | P2 | PR#6 (markdown fixture 30쌍 + harness) | G6 |
| knowledge_claim / document_chunks 분열 | P2 | 7A는 DDL만 (PR#7), dual-read/cutover는 7B 이후 별도 판단 | — |

### 2.1 심각도 정의 (Phase-6 척도 재게시)

- **P0**: 운영 중 데이터 유출·무결성 손상 위험 또는 장애 직결.
- **P1**: 단기 비용·성능·신뢰도 회귀를 일으키지만 격리 가능.
- **P2**: 중장기 유지보수 부담, 당장 장애로는 번지지 않음.

### 2.2 게이트 매핑 요약

- `G1 비용 차단`: PR#2 → `llm_call_log.blocked_by='budget'` 실증.
- `G2 PII unit`: PR#3 → 주민번호/전화/이메일/카드 각 5건 unit 100% pass.
- `G3 review_queue`: PR#3 → SECRET 키워드 문서 1건 → `review_queue` 1행 + sensitivity 승급.
- `G4 tenant leakage`: PR#9 → workspace A/B seed에서 B chunk top-50 0건.
- `G5 schema drift`: PR#4 → `--ci`에서 exit 1 실증.
- `G6 eval fixture`: PR#6 → 30쌍 error 0건 + baseline 3종 기록.
- `G7 로그 완전성`: PR#1 → 실호출 수 = `llm_call_log` row 수(누락 0).

## 3. 7B · Phase-8로 이관된 항목

| 항목 | Phase-6 출처 | 이관 사유 | 이관 대상 |
|---|---|---|---|
| `knowledge_claim` / `document_chunks` dual-read / cutover 절차 | drift 감사 중 표면화 | 7A는 DDL만, 운영 데이터 이동은 7B 이후에 별도 판단이 필요 | 7B (조건부) |
| precedent_case 재임베딩(벡터 공간 통일) | Debt Radar — "두 1536d 벡터가 같은 공간이 아님" 경고 | 교체/hybrid/현상유지 셋 중 결정하려면 eval baseline이 있어야 함 → 7A 인프라 선행 | Phase-8 (M1) |
| editor 교체 | Debt Radar — 에디터 의존성 부채 | 7A/7B와 결합도 낮음, 별도 decision doc 필요 | Phase-8 |
| query-time graph lane | Debt Radar — graphify 결과를 검색에 쓰려는 요구 | LLM 경로와 인터랙션이 복잡, 7B 이후 decision 필요 | Phase-8 |
| TSVD999 `higherCategory × requestCompany` 트리 승격 | Phase-6 후속 별도 트랙 요청 | 7A 본체 스코프 아님. 권한·희소성 선결 필요 | 별도 트랙 (M2) |

## 4. 재검증 리듬

- 각 PR 머지 시 본 표의 `Phase-7 해소` 열 PR 링크를 실 PR URL로 갱신(PR#G 직전에 일괄 정리도 허용).
- PR#G(게이트 판정) 문서 `docs/analysis/07-gate-result-2026-04.md`에서 본 매핑표를 레퍼런스로 인용한다.
- Phase-6 레지스터가 업데이트되면(신규 탐지 추가) 본 표 하단에 "신규 — 해소 미정" 행을 추가한다.

## 5. Revision log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-04-14 | 초안 작성 | Phase-7 v3 spec §5.1에 따라 Lane C PR#8에서 생성 |

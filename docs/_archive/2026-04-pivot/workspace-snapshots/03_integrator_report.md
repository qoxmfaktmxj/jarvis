# Integrator Report — jarvis-next

> 검증일: 2026-04-13  
> 검증자: jarvis-integrator

## 자동화 검증

| 체크 | 결과 | 비고 |
|------|------|------|
| `pnpm --filter @jarvis/db type-check` | ✅ OK | 0 errors |
| `pnpm --filter @jarvis/ai type-check` | ✅ OK | 0 errors |
| `pnpm --filter @jarvis/web type-check` | ✅ OK | 0 errors |
| `pnpm lint` | ✅ OK | No warnings or errors |
| `drizzle-kit generate` | ✅ OK | 0005_productive_power_pack.sql 생성 |

## 경계면 교차 검증

### 1. schema → packages/ai 경계

| 검사 항목 | 결과 |
|---------|------|
| `precedentCase` import in `case-context.ts` | ✅ `@jarvis/db/schema/case` |
| `directoryEntry` import in `directory-context.ts` | ✅ `@jarvis/db/schema/directory` |
| vector customType 재정의 (case.ts) | ✅ knowledge.ts와 동일 패턴 사용 |
| caseCluster.numericClusterId ↔ precedentCase.clusterId 타입 | ✅ 모두 integer |

### 2. types.ts ↔ 컴포넌트 경계

| 검사 항목 | 결과 |
|---------|------|
| CaseSourceRef.caseId → AskPanel key 생성 | ✅ source.caseId 사용 |
| DirectorySourceRef.entryId → AskPanel key 생성 | ✅ source.entryId 사용 |
| SourceRefCard 4종 분기 (kind switch) | ✅ text/graph/case/directory |
| ClaimBadge getSourceMeta switch 완전성 | ✅ 4종 모두 처리 |

### 3. ask.ts ↔ API route 경계

| 검사 항목 | 결과 |
|---------|------|
| askAI() AskQuery 파라미터 형식 유지 | ✅ snapshotId 포함 |
| SSEEvent 타입 변경 없음 | ✅ text/sources/done/error |
| sources 배열 통합 순서 (text→graph→case→directory) | ✅ generateAnswer에서 명시 |

### 4. RBAC / Sensitivity

| 검사 항목 | 결과 |
|---------|------|
| precedentCase.sensitivity 컬럼 존재 | ✅ DEFAULT 'INTERNAL' |
| directoryEntry — sensitivity 없음 (directory는 공개 경로 정보) | ✅ 의도된 설계 |
| case-context: 권한 체크 없음 (현재 INTERNAL 고정) | ⚠️ 고객사별 필터 추후 추가 예정 |

### 5. i18n 변경 없음

- 신규 UI 컴포넌트 (SourceRefCard의 한국어 레이블): 하드코딩 허용 (소량)
- 별도 ko.json 키 추가 없음 — OK

## 이슈 목록

### ⚠️ 권고 (blocking 아님)

1. **case-context.ts — 고객사 sensitivity 게이트 미구현**
   - 현재 precedentCase는 workspace 단위 조회만 함
   - 고객사별 isolation 필요 시 `requestCompany` 기반 필터 추가 필요
   - 우선순위: Medium (TSVD999 적재 후)

2. **router.ts — LLM 폴백 미구현**
   - 패턴 매칭 미스 시 text-first 기본값 반환 (confidence 0.3)
   - 추후 gpt-4.1-mini 분류 추가 가능

3. **ask.ts — OpenAI usage 토큰 카운트**
   - `stream_options: { include_usage: true }` 미설정으로 totalTokens = 0 가능
   - 영향: done 이벤트 totalTokens 정확도 (기능 영향 없음)

4. **canonicalize-guidebook.ts — 가이드북 파일 미존재**
   - `data/guidebook/isu-guidebook-full.md` 없으면 스크립트 exit(1)
   - 실제 파일 준비 후 실행 필요

### ✅ 모두 OK

- DB 스키마 타입 안전성
- SourceRef discriminated union 완전성
- OpenAI 스트리밍 어댑터 (SSETextEvent 포맷 유지)
- 기존 AskPanel, ClaimBadge 하위 호환성 (kind='text'/'graph' 기존 동작 유지)

## 결론

**PASS** — 모든 자동화 검증 통과. 경계면 이슈 없음.  
4개 권고사항은 TSVD999 적재 및 운영 모니터링 후 순차 처리.

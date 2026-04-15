# Builder Progress — jarvis-next

> 기준 계획: `docs/plan/2026-04-13-jarvis-next.md`  
> 실행일: 2026-04-13  

## 완료 항목

### Phase 0: DB Schema
- [x] **0-1** `packages/db/schema/knowledge.ts` — 7개 컬럼 추가
  - surface, authority, ownerTeam, audience, reviewCycleDays, domain, sourceOrigin
- [x] **0-2** `packages/db/schema/case.ts` 신규
  - precedentCase 테이블 (30 cols, 5 indexes)
  - caseCluster 테이블 (13 cols, 1 index)
  - Relations (workspace, knowledgePage, precedentCase FK)
- [x] **0-3** `packages/db/schema/directory.ts` 신규
  - directoryEntry 테이블 (15 cols, 3 indexes)
  - Relations (workspace FK)
- [x] **0-4** `packages/db/schema/index.ts` — case.ts, directory.ts export 추가
- [x] **0-5** `packages/db/drizzle/0005_productive_power_pack.sql` migration 생성
  - 총 39 → 42 테이블 (3개 신규)
  - `pnpm drizzle-kit generate` 성공

### Phase 3: AI Router + 6-Lane
- [x] **3-4** `packages/ai/types.ts` — CaseSourceRef, DirectorySourceRef 추가
  - SourceRef = TextSourceRef | GraphSourceRef | CaseSourceRef | DirectorySourceRef
- [x] **3-1** `packages/ai/router.ts` 신규
  - 6개 lane: text-first | graph-first | case-first | directory-first | action-first | tutor-first
  - 규칙 기반 패턴 매칭 (LLM 없음) + confidence score
  - LANE_SOURCE_PRIORITY 힌트 맵
- [x] **3-2** `packages/ai/case-context.ts` 신규
  - retrieveRelevantCases() — 벡터 similarity + isDigest 보너스
  - keywordFallback() — 임베딩 미적재 시 ILIKE 폴백
  - buildCaseXml(), toCaseSourceRef()
- [x] **3-3** `packages/ai/directory-context.ts` 신규
  - searchDirectory() — ILIKE 키워드 매칭 + relevance 스코어
  - buildDirectoryXml(), toDirectorySourceRef()
- [x] **3-5** `packages/ai/ask.ts` 리팩터링
  - Anthropic → OpenAI (gpt-4.1-mini, 환경변수 ASK_AI_MODEL)
  - 6-lane 라우터 통합 (routeQuestion)
  - assembleContext() — 4종 컨텍스트 통합
  - generateAnswer() — OpenAI chat.completions.create stream
  - SYSTEM_PROMPT — 4종 소스 종류 안내

### Phase 4: OpenAI Migration
- [x] ask.ts Anthropic → OpenAI (포함됨)
- [x] `.env.example` — ASK_AI_MODEL 추가, 주석 정리

### Phase 5: UI 보강
- [x] `apps/web/components/ai/SourceRefCard.tsx` — 4종 카드 렌더러
  - TextSourceCard (기존), GraphSourceCard (기존)
  - CaseSourceCard (신규, 앰버 색상)
  - DirectorySourceCard (신규, 그린 색상, 외부 링크)
- [x] `apps/web/components/ai/ClaimBadge.tsx` — 4종 SourceRef 분기
  - getSourceMeta() switch로 label/tooltip/href 추출
- [x] `apps/web/components/ai/AskPanel.tsx` — key 생성 로직 4종 분기

### Phase 1: Guidebook
- [x] `scripts/canonicalize-guidebook.ts` 신규
  - headings 기반 split
  - stub 판별 (< 80자)
  - directory content 판별 (링크 3+개)
  - frontmatter 자동 생성 (title, slug, domain, page_type, surface, authority, ...)
  - data/canonical/*.md + data/directory/guidebook-directory.json 산출

## 검증
- pnpm --filter @jarvis/db type-check: ✅
- pnpm --filter @jarvis/ai type-check: ✅
- pnpm --filter @jarvis/web type-check: ✅
- pnpm lint: ✅ (No warnings or errors)

### Phase 2: TSVD999 파이프라인 (추가 완료)
- [x] **2-1** `scripts/extract-all-chunks.ps1` 신규
  - Oracle → TSV 전체 추출 자동화 (125 청크 × 1000행)
  - Phase 1~4 (컴파일→추출→정규화→클러스터링) 순차 실행
  - --SkipExtract / --SkipNormalize / --SkipCluster / --DryRun 옵션
- [x] **2-2** `scripts/import-cases-to-jarvis.ts` 버그 수정
  - `case_cluster.id` UUID/integer 타입 오류 수정
  - `numeric_cluster_id` 컬럼 사용, `ON CONFLICT (workspace_id, numeric_cluster_id)` 변경
- [x] **2-3** DB 마이그레이션 0005 적용
  - `precedent_case`, `case_cluster`, `directory_entry` 3개 테이블 생성
  - `case_cluster` UNIQUE 제약 추가 (workspace_id, numeric_cluster_id)
- [x] **2-4** 1000건 import 검증 완료
  - insertedCases: 1000, upsertedClusters: 670, digestPages: 670

### Phase 1-후속: seed-canonical.ts
- [x] **1-후속** `scripts/seed-canonical.ts` 신규 (475 lines)
  - data/canonical/*.md → knowledge_page + knowledge_page_version 적재
  - frontmatter 파싱 (regex, 외부 라이브러리 없음)
  - slug 충돌 처리 (-2, -3 suffix)
  - --dry-run, --batch-size, --workspace-id 옵션

## 미완료 (범위 외)
- Guidebook 실제 실행: 가이드북 파일 준비 후 `pnpm tsx scripts/canonicalize-guidebook.ts` 실행 필요
- Oracle 전체 추출: `$env:ORACLE_PASSWORD` 설정 후 `.\scripts\extract-all-chunks.ps1` 실행
  - 1개 청크(1000행)만 추출됨, 나머지 124청크(123232행) 미추출
- Phase 6+: HR 튜터, 지식 부채 레이더, 고객사 컨텍스트

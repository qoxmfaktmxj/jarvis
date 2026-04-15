# Archive — 2026-04-15 Karpathy-First Pivot

이 폴더는 **2026-04-15 피벗 이전**의 문서들을 역사 자료로 보존한다. 설계 참조 대상 아님.

## 왜 아카이브됐는가

Jarvis는 처음에 "사내 업무 시스템 + 위키 + RAG AI 포털"을 목표로 했다. 2026-04-15에 다음 근거로 **Karpathy LLM Wiki + Graphify 방향**으로 전면 피벗했다.

1. **MindVault의 공식 폐기** (2026-04-14) — 같은 Karpathy 차용 프로젝트가 "tree-sitter + BM25만으로는 Karpathy 가치 복원 불가"를 자백. Jarvis도 한국어·엔터프라이즈·5000명이라는 동일한 실패 조건을 가지고 있었음.
2. **외부 LLM 분석** — Jarvis 기존 설계를 "hybrid-search-first지 Karpathy-first가 아니다"로 진단. 8.5/10 정합성으로 새 방향 합의.
3. **실측 검증** — `reference_only/llm_wiki`(Tauri 구현체)가 임베딩 없이 동작 가능함을 확인. `reference_only/llm-wiki-agent`의 `.claude/commands/` 4개가 즉시 포팅 가능.

피벗 결정의 핵심 문서는 [`../../../WIKI-AGENTS.md`](../../../WIKI-AGENTS.md).

## 폴더 구성

### 기존 분석 (RAG 전제)
- `00-jarvis-current-state.md` — 피벗 전 Jarvis 상태 분석
- `04-mindvault-rag-era.md` — MindVault를 "차용원"으로 본 구 분석 (04-mindvault.md로 재기술)
- `06-phase6-phase7-mapping.md` — Phase 6~7 RAG 부채 매핑
- `07-gate-result-2026-04.md` — Phase-7A RAG 인프라 게이트 결과
- `99-codex-review-raw.txt` — v1 플랜 Codex 리뷰 원본
- `99-comparison-matrix.md` — 5개 레퍼런스 레포 비교표
- `99-fact-check.md` — v1 플랜 사실 검증
- `99-gap-hunt.md` — v1 플랜 적대적 리뷰
- `99-integration-plan.md` — v2 통합 계획 (RAG 하이브리드 전제)
- `99-review-summary.md` — v1→v2 3-way 검증 요약

### Phase-7 RAG 설계
- `2026-04-15-phase7b.md` — 2-step ingest + hybrid search 계획
- `2026-04-14-phase7-v3-design.md` — 9-PR RAG 인프라 설계
- `2026-04-14-phase7a-pr-g-gate.md` — G1~G7 RAG 게이트 (재정의 필요)

### 구 계획 & 가이드
- `2026-04-13-jarvis-next.md` — Phase 0~6 계획 (작성자가 STALE 선언)
- `DATA_REFRESH_GUIDE.md` — RAG 임베딩 리프레시 파이프라인
- `README.rag-era.md` — 피벗 전 루트 README (664줄)

### 워크스페이스 스냅샷
- `workspace-snapshots/` — 어제(2026-04-14) 세션의 planner/builder/integrator 작업 로그

## 유효한 자산 (본체로 유지)

다음 분석 문서는 Karpathy-first 방향에서도 **현재 진행형 참조 자료**다. 아카이브하지 않았다.

- `docs/analysis/01-graphify.md` — Graphify 원본 (구조 보조 엔진으로 유지)
- `docs/analysis/02-llm_wiki.md` — Karpathy 구현체 (프롬프트·파일 포맷 포팅 대상)
- `docs/analysis/03-llm-wiki-agent.md` — Claude Code 스킬 (`.claude/commands/` 포팅 대상)
- `docs/analysis/05-qmd.md` — 500+ 페이지 규모 시 보조 검색 후보
- `docs/analysis/04-mindvault.md` — **실패 경고**로 재기술됨 (원본은 `04-mindvault-rag-era.md`)

## 복구

실수로 아카이브된 문서가 필요하면:

```bash
git log --diff-filter=R -- docs/_archive/2026-04-pivot/
git mv docs/_archive/2026-04-pivot/{file}.md docs/analysis/{file}.md
```

git 히스토리는 `git mv`로 완전히 보존된다.

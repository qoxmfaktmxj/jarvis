# Jarvis LLM Wiki 통합 분석 (Phase-7 준비)

> **생성일**: 2026-04-14
> **작업**: 5개 레퍼런스 프로젝트(`C:\Users\kms\Desktop\dev\reference_only`)의 아이디어를 Jarvis에 통합하기 위한 심층 분석.
> **총 분량**: 약 9,500줄 (6개 분석 + 매트릭스 + 통합 계획).

## 파일 구성

| # | 파일 | 줄수 | 역할 |
|---|------|------|------|
| 0 | `00-jarvis-current-state.md` | 1,029 | Jarvis AS-IS (39테이블 / 46+11 테스트 / §10 갭 5영역) |
| 1 | `01-graphify.md` | 1,103 | Python 그래프 빌더, 3단 신뢰도 엣지, SHA256 캐시 |
| 2 | `02-llm_wiki.md` | 1,227 | Tauri 데스크톱 Wiki, Two-Step CoT, Milkdown 에디터 |
| 3 | `03-llm-wiki-agent.md` | 1,506 | Claude Code 스킬, **4-layer 스키마 = Jarvis 4-surface 검증** |
| 4 | `04-mindvault.md` | 1,007 | PyPI CLI, Canonical ID, CJK BM25 토크나이저 |
| 5 | `05-qmd.md` | 1,042 | 로컬 검색 엔진, **RRF + Position-Aware Blend**, Smart chunking |
| — | `99-comparison-matrix.md` | ~600 | 6개 파일 비교 · 우선순위 점수표 · 갭 × 기여 매핑 |
| — | `99-integration-plan.md` | ~900 | Phase-7 4주 스프린트 · LLM 전략 · 스키마 변경 · 위험 |

## 읽는 순서

1. **`99-integration-plan.md` TL;DR** — 10줄 결론부터
2. **`99-comparison-matrix.md` §0 한눈에 보기** — 전체 매트릭스
3. **`00-jarvis-current-state.md` §10 식별된 갭** — 해결해야 할 문제
4. **관심 레퍼런스 (01~05)** — 특정 프로젝트 깊이 파기
5. **`99-integration-plan.md` §10 Phase-7 스프린트 계획** — 실행

## 핵심 결론 (5줄 요약)

1. **5개 중 어느 것도 통째로 가져오지 않는다.** 전부 싱글유저 로컬 가정이라 멀티테넌트 웹 부적합.
2. **P0 9개 채택**: SHA256 캐시 / RRF + Position-Aware Blend / JSON Schema / 3단 신뢰도 엣지 / LLM 캐시 / Smart chunking / Strong-Signal bypass / 모델 라우팅 / Tiptap 에디터.
3. **Jarvis 4-surface는 llm-wiki-agent 4-layer와 독립적으로 동일 결론** → 강한 검증 시그널.
4. **검색 파이프라인은 qmd 5-stage 채택** (Intent → Expand → Parallel Retrieve → RRF Blend → Chunk Rerank).
5. **임베딩은 유지하되 청크 단위로 재설계** + 증분 재임베딩 + LLM 캐시로 비용 60~80% 절감 기대.

## Phase-7 요약

- **W1**: 공통 기반 (cache, chunker, RRF, LLM cache 테이블)
- **W2**: Ingest 재설계 + 4-surface 확장 (wiki_sources / wiki_concepts / wiki_syntheses)
- **W3**: 검색 5-stage + Tiptap 에디터
- **W4**: Lint / Eval / Observability (pino + Sentry + 비용 대시보드)

## 버린 것 (Anti-Patterns)

Tauri · LanceDB · node-llama-cpp · 파일시스템 DB · GBNF · Fine-tuning harness · Obsidian vault export · CLI 중심 UX · 단일 사용자 가정 · Anthropic SDK 재도입 (graphify subprocess 제외).

---

*이 디렉토리는 Phase-7 모든 의사결정의 근거 자료. 실행은 `jarvis-planner` 에이전트가 주 단위로 쪼개서 수행.*

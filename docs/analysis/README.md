# Jarvis 분석 문서 디렉토리

> **현행 버전**: v4 (Karpathy LLM Wiki 피벗, 2026-04-15~)  
> **폐기**: v1 / v2 / v3 (RAG 시대 계획) — `docs/_archive/2026-04-pivot/`으로 이동됨

---

## 현행 문서 (Phase-W 기준)

### 실행 계획

| 파일 | 상태 | 역할 |
|------|------|------|
| **[`99-integration-plan-v4.md`](99-integration-plan-v4.md)** | ✅ **현행** | Phase-W4 실행 계획 — Raw Sources → Wiki Pages → DB projection, Single-Writer+Git, Feature flag 전환, legacy-rag 경계 |

### 레퍼런스 분석 (참고용 원본)

| 파일 | 역할 |
|------|------|
| [`01-graphify.md`](01-graphify.md) | Python 그래프 빌더 분석 — SHA256 캐시, 3단 신뢰도 엣지 |
| [`02-llm_wiki.md`](02-llm_wiki.md) | Tauri 데스크톱 Wiki 분석 — Two-Step CoT, Milkdown 에디터 |
| [`03-llm-wiki-agent.md`](03-llm-wiki-agent.md) | Claude Code 스킬 분석 — 4-layer 스키마, Karpathy 모델 원형 |
| [`04-mindvault.md`](04-mindvault.md) | PyPI CLI 분석 — Canonical ID, CJK BM25 토크나이저 |
| [`05-qmd.md`](05-qmd.md) | 로컬 검색 엔진 분석 — RRF + Position-Aware Blend, Smart chunking |

> ⚠️ **주의**: 레퍼런스 파일(`01~05`)은 외부 프로젝트 분석 자료로, 현재 Jarvis 코드베이스 상태를 나타내지 않습니다.  
> 전부 싱글유저 로컬 가정 프로젝트 — Jarvis는 아이디어만 선택적으로 채택.

---

## 아카이브 (폐기된 버전)

`docs/_archive/2026-04-pivot/`으로 이동된 파일들:

| 파일 (구 경로) | 폐기 사유 |
|--------------|----------|
| `00-jarvis-current-state.md` (v2 AS-IS 분석) | Karpathy 피벗 이전 상태 스냅샷 |
| `99-integration-plan.md` (v2) | Phase-7A/7B/8 계획 — W 시리즈로 대체됨 |
| `99-comparison-matrix.md` | v2 기준 비교 매트릭스 |
| `99-fact-check.md` | v2 계획 팩트체크 결과 |
| `99-gap-hunt.md` | v2 계획 적대적 리뷰 |
| `99-codex-review-raw.txt` | Codex 외부 리뷰 (v2 대상) |
| `99-review-summary.md` | 3-way 통합 요약 (v2 기준) |

> 아카이브 파일은 **삭제되지 않습니다** — Phase-W 회고·감사 목적으로 영구 보존.

---

## 버전 이력

| 버전 | 날짜 | 상태 | 요약 |
|------|------|------|------|
| v1 | 2026-04-14 | ❌ 폐기 | 초기 분석 초안 |
| v2 | 2026-04-14 | ❌ 폐기 | 3-way review 반영 (Phase-7A/7B/8 분할) |
| v3 | 2026-04-14 | ❌ 폐기 | 중간 수정본 |
| **v4** | **2026-04-15~** | ✅ **현행** | **Karpathy LLM Wiki 피벗 — Phase-W 시리즈** |

---

## 현행 아키텍처 참조

Phase-W 실제 상태는 이 디렉토리가 아닌 루트 문서에서 확인:

- **[`WIKI-AGENTS.md`](../../WIKI-AGENTS.md)** — 3-레이어 모델, 4-operation 계약, Single-Writer+Git, RBAC, Feature flags (SSoT)
- **[`README.md`](../../README.md)** — Karpathy-first 전환 배경, RAG vs LLM Wiki 비교표
- **[`AGENTS.md`](../../AGENTS.md)** — Codex/Claude 에이전트 공통 원칙

# Jarvis LLM Wiki 통합 분석 (Phase-7 준비)

> **생성일**: 2026-04-14 (v1) → 같은 날 3-way review 후 v2 확정
> **작업**: 5개 레퍼런스 프로젝트(`C:\Users\kms\Desktop\dev\reference_only`)의 아이디어를 Jarvis에 통합하기 위한 심층 분석 + 검증.
> **총 분량**: 약 12,500줄 (6개 AS-IS 분석 + 매트릭스 + v2 통합 계획 + 3개 리뷰 아티팩트 + 리뷰 요약).

---

## 1. 파일 구성

### 1.1 AS-IS 분석 (원본 검증 자료)

| # | 파일 | 줄수 | 역할 |
|---|------|------|------|
| 0 | `00-jarvis-current-state.md` | 1,029 | Jarvis AS-IS (39 테이블 / 46 unit + 11 e2e / §10 갭 5영역) |
| 1 | `01-graphify.md` | 1,103 | Python 그래프 빌더, 3단 신뢰도 엣지, SHA256 캐시 |
| 2 | `02-llm_wiki.md` | 1,227 | Tauri 데스크톱 Wiki, Two-Step CoT, Milkdown 에디터 |
| 3 | `03-llm-wiki-agent.md` | 1,506 | Claude Code 스킬, **4-layer 스키마 = Jarvis 4-surface 검증** |
| 4 | `04-mindvault.md` | 1,007 | PyPI CLI, Canonical ID, CJK BM25 토크나이저 |
| 5 | `05-qmd.md` | 1,042 | Tobi Lütke 로컬 검색 엔진, **RRF + Position-Aware Blend**, Smart chunking |

### 1.2 합성 (비교·계획)

| 파일 | 줄수 | 역할 |
|------|------|------|
| `99-comparison-matrix.md` | ~460 | 6개 비교 · 우선순위 점수표 · 갭×기여 매핑 (경로/모델 v2 수정 반영) |
| **`99-integration-plan.md` (v2)** | ~750 | **Phase-7A(2주) + 7B(3주) + Phase-8 분할 실행 계획**. 스키마 전체, Cache/Transaction/Fallback 설계, Merge Resolution Matrix, PII redaction |

### 1.3 검증 (3-way review 결과)

| 파일 | 줄수 | 역할 |
|------|------|------|
| `99-fact-check.md` | 137 | Claude 서브에이전트의 경로·타입·마이그레이션 번호 **실제 코드 대조** (10 P0 + 7 P1 + 18 correct) |
| `99-gap-hunt.md` | 403 | Claude 서브에이전트의 적대적 논리 허점 사냥 (8 critical + 9 medium + 6 contradictions + 8 scope + 22 checklist + 7 OC) |
| `99-codex-review-raw.txt` | 1,993 | Codex CLI (gpt-5.4, high reasoning) 외부 모델의 독립 plan 챌린지 — 10 findings (5 P0 + 4 P1 + 1 P2) |
| **`99-review-summary.md`** | ~290 | 3-way 통합 요약 — 공통 지적, 대립 의견, v1→v2 변경 요약 |

---

## 2. 읽는 순서 (추천)

### 처음 접근하는 사람 (15분)
1. **`99-review-summary.md` §5 v1 → v2 변경 요약** — 결론부터
2. **`99-integration-plan.md` TL;DR (v1→v2 변경 표)** — 무엇이 왜 바뀌었는지
3. **`99-integration-plan.md` §2 Phase 분할 전략** — Phase-7A / 7B / 8 구조
4. **`00-jarvis-current-state.md` §10 식별된 갭** — 해결할 문제

### Phase-7A 실행 담당자 (30분)
1. `99-integration-plan.md` §1 모델 정책 (gpt-5.4-mini) ⭐
2. `99-integration-plan.md` §3 Phase-7A 상세 (2주 일정)
3. `99-integration-plan.md` §5 스키마 (customType vector, varchar sensitivity, withTimezone)
4. `99-integration-plan.md` §6 Cache + Transaction + Fallback
5. `99-integration-plan.md` §11 관측 / 비용 / 롤백
6. `99-integration-plan.md` §15 즉시 실행 체크리스트

### Phase-7B 실행 담당자 (이후)
1. `99-integration-plan.md` §4 Phase-7B 상세 (3주)
2. `99-integration-plan.md` §7 Merge Resolution Matrix
3. `99-integration-plan.md` §8 검색 MVP
4. `99-integration-plan.md` §9 PII Redaction
5. `99-integration-plan.md` §10 Phase-6 ↔ Phase-7 Lint 매핑

### 레퍼런스 깊이 파기 (특정 프로젝트)
→ `01~05` 해당 파일 직접

### 왜 v1이 부족했는지 궁금한 사람
1. `99-review-summary.md` §1 3-Way Consensus (3개 모두 지적)
2. `99-codex-review-raw.txt` 파일 끝부분 (Codex 최종 10 findings)
3. `99-fact-check.md` P0 오류 표
4. `99-gap-hunt.md` §Top-5 Summary

---

## 3. 핵심 결론 (10줄 요약)

1. **5개 레퍼런스 중 어느 것도 통째로 가져오지 않는다.** 전부 싱글유저 로컬 가정.
2. **Phase-7을 7A(2주) + 7B(3주) + Phase-8로 분할.** 3-way review 공통 지적: 단일 4주는 불가능.
3. **모든 OpenAI 호출은 `gpt-5.4-mini` (utility) / `gpt-5.4` (synthesis)**. env var 추상화. ✅ main 코드는 이미 `gpt-5.4-mini` 기본값 — 스왑 불요. Phase-7A에서 `ASK_AI_SYNTHESIS_MODEL=gpt-5.4` 신규 env만 추가.
4. **Cache key에 `promptVersion + workspaceId + sensitivityScope` 강제**. 테넌트·권한 경계 데이터 누출 차단.
5. **모든 새 테이블에 workspace FK + `varchar("sensitivity", { length: 30 })` UPPERCASE**. polymorphic text[] 금지 → junction table.
6. **자동 Heal / Lint 결과는 `wiki_*_draft` 테이블에 격리**. 관리자 승급 후만 검색·답변 후보.
7. **검색 MVP는 `BM25 + chunk vector + RRF`만**. Intent/HyDE/Rerank 등은 eval 실효 증명 후 Phase-8에 단계적 추가.
8. **Tiptap 리치 에디터는 Phase-8로 이동**. Phase-7B에는 기존 textarea에 `[[wikilink]]` 파싱만.
9. **`precedent_case` TF-IDF lane은 분리 유지**. OpenAI 1536d와 벡터 공간 다름 — 합치지 않는다.
10. **Phase-6의 knowledge debt radar + drift detection은 확장·보완**. Phase-7 lint/heal은 이를 대체하지 않고 통합.

---

## 4. 3-Way Review 정량 결과

| 검증 | 발견 | 특히 중요 |
|------|------|----------|
| **Fact-check** (Jarvis 실제 코드 대조) | 10 P0 + 7 P1 + 18 correct + 2 uncertain | 경로 `/src` 제거, `sensitivityEnum` 미존재, `customType<vector>`, 마이그 `0009`, `@anthropic-ai/sdk` 제거 범위 |
| **Gap-hunt** (적대적 논리 리뷰) | 8 critical + 9 medium + 6 contradictions + 8 scope + 22 checklist + 7 OC | AMBIGUOUS merge matrix, cache promptVersion 누락, TF-IDF 공간 불일치, Phase-7A/7B 분할 권고 |
| **Codex review** (gpt-5.4 high reasoning) | 5 P0 + 4 P1 + 1 P2 | 안정화 vs 리팩토링 충돌, RBAC 캐시 누출, 자동 Heal 오염, 참조 무결성, 검색 과설계 |

**v1이 폐기되지는 않았다. v1의 전략 방향은 여전히 유효하되, 구체적 스키마·경로·순서·안전장치가 대폭 보강됐다.**

---

## 5. Phase-7A (2주) 즉시 시작 가능 체크리스트

`99-integration-plan.md §15` 참조. 요약:

- [ ] 이 문서 + 분석 + 리뷰 아티팩트 main merge
- [ ] `docs/plan/2026-04-W1-phase-7a.md` 신규 (§3.1 복사)
- [ ] `AGENTS.md` 변경 이력에 Phase-7A 항목 추가
- [ ] jarvis-planner에 Week 1 D1~D5 작업 dispatch
- [ ] `.env.example` 신규 키 추가 (`ASK_AI_SYNTHESIS_MODEL`, `LLM_CACHE_TTL_*`, `LLM_FALLBACK_ENABLED`, `LLM_DAILY_BUDGET_USD`, `PROMPT_VERSION`, `FEATURE_*`)
- [ ] `@anthropic-ai/sdk` 제거 (graphify subprocess env/secret 유지 검증 후)
- [ ] Phase-6 knowledge debt radar + drift detection 현재 동작 확인
- [ ] `docs/eval/DATA_LICENSE.md` 신설 (TSVD999 eval fixture 사용 승인)

---

## 6. 버린 것 (Anti-Patterns, v1→v2 누적)

Tauri · LanceDB · node-llama-cpp · 파일시스템 DB · GBNF · Fine-tuning harness · Obsidian vault export · CLI 중심 UX · 단일 사용자 가정 · Anthropic SDK 재도입 (graphify subprocess env만 유지) · `gpt-4.1*` 모델명 (→ `gpt-5.4-mini`/`gpt-5.4`) · 영구 캐시 (ttl=null) · polymorphic text[] 참조 · 자동 Heal 즉시 검색 노출 · retrieval 시점 graphify 호출 · Tiptap 대규모 Phase-7 도입 · 검색 5-stage 동시 구현 · 근거 없는 "60~80% 절감" 수치.

---

## 7. 증거 보존 정책

**삭제 금지 파일** (Phase-7 회고·감사용):
- `99-codex-review-raw.txt` — 외부 모델 원본 출력
- `99-fact-check.md` — 실제 코드 대조 결과
- `99-gap-hunt.md` — 적대적 논리 리뷰
- `99-review-summary.md` — 3-way 통합

**지속 업데이트 파일**:
- `99-integration-plan.md` — Phase-7A 진행 중 발견 시 in-place 수정 (v3, v4 ...)
- `99-comparison-matrix.md` — 새 레퍼런스 추가 시만

---

*실행은 jarvis-planner가 Phase-7A W1 D1부터 작업을 쪼개서 jarvis-builder에게 dispatch, jarvis-integrator가 교차 검증 + PII/workspace guard 검사.*

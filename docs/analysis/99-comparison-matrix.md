# 비교 매트릭스 — 5개 레퍼런스 vs Jarvis 현 상태

> **생성일**: 2026-04-14  
> **입력 근거**: `00-jarvis-current-state.md`, `01-graphify.md`, `02-llm_wiki.md`, `03-llm-wiki-agent.md`, `04-mindvault.md`, `05-qmd.md` (총 6,914줄)  
> **용도**: 통합 계획(`99-integration-plan.md`)의 근거 데이터. 어떤 아이디어를 **가져올지·버릴지·변형할지** 판단의 레퍼런스.

---

## 0. 한눈에 보기 (Executive Matrix)

| 차원 | **Jarvis (AS-IS)** | **graphify** | **llm_wiki** | **llm-wiki-agent** | **mindvault** | **qmd** |
|------|---------|----------|-----------|-------------|-----------|------|
| **정체성** | 사내 포털 (웹) | 지식 그래프 빌더 | 데스크톱 위키 앱 | Wiki 자동화 스킬 | 개인 세션 연속성 CLI | 로컬 검색 엔진 |
| **언어** | TS/Next.js 15 | Python | TypeScript + Rust (Tauri) | Python + Claude Code 스킬 | Python | TypeScript |
| **배포** | 멀티테넌트 웹 서버 | CLI + MCP stdio | Tauri 데스크톱 | 로컬 CLI + Claude Code | PyPI CLI + launchd | CLI + MCP stdio |
| **사용자 규모** | 5,000명 | 1인 repo | 1인 vault | 1인 repo | 1인 홈 디렉토리 | 1인 로컬 |
| **저장소** | PostgreSQL 39테이블 + pgvector | `graph.json` + `memory/*.md` | FS + LanceDB + JSON | FS + 마크다운 | FS (`~/.mindvault/`) | SQLite FTS5 + sqlite-vec |
| **LLM** | OpenAI `gpt-5.4-mini` (AS-IS, 단일 제공자) | 없음 (결정론적 파이프라인) | OpenAI / Anthropic / LM Studio / Ollama | Anthropic (Haiku+Sonnet) via litellm | OpenAI (엔트리에서만) | **on-device** node-llama-cpp (GGUF) |
| **임베딩** | ✅ text-embedding-3-small 1536d | ❌ 없음 | ✅ LanceDB 768d | ❌ 없음 | ❌ 없음 (BM25만) | ✅ embeddinggemma 768d |
| **검색 전략** | PG FTS + pg_trgm + pgvector | Graph BFS/DFS/shortest_path | 토큰+벡터+그래프 확장 4-phase | substring + CJK 청크 | BM25 + Graph BFS/DFS | BM25 + vec + expand + RRF + rerank (5-stage) |
| **그래프 레이어** | graphify 서브프로세스 (별도) | ⭐ 중심 (3단 신뢰도 엣지) | sigma.js + graphology | 2-pass (regex+LLM) | networkx DiGraph | ❌ 없음 |
| **에디터** | textarea + preview | ❌ | **Milkdown** (ProseMirror) | ❌ (마크다운 직접) | ❌ | ❌ |
| **RAG** | 6-lane Ask AI + 인용 | 쿼리 Q&A → graph 재흡수 | 하이브리드 파이프라인 + 15분 스트리밍 | JSON schema ingest | Auto-context 강제 주입 | 5-stage hybrid + rerank |
| **Tool Use** | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 (grammar 대체) |
| **구조화 출력** | ❌ 텍스트 | JSON (텍스트) | JSON (텍스트) | JSON (텍스트) | JSON (텍스트) | GBNF grammar |
| **캐시 전략** | 임베딩만 | SHA256 per-file | SHA256 ingest cache + LLM 제한 | SHA256 per-file | SHA256 dirty 파일 | LLM 캐시 + chunk 기반 |
| **RBAC/권한** | ✅ RBAC + sensitivity | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 |
| **i18n** | ko.json 305키 | ❌ 영어 고정 | en/zh | 영어 | 영어 | 영어 |
| **트랜잭션/ACID** | ✅ PG | ❌ | ❌ | ❌ | ❌ | ✅ SQLite |
| **테스트** | 46 unit + 11 e2e | pytest | vitest | pytest | pytest | vitest (bench/ast/chunking) |

---

## 1. 프로젝트 정체성 및 직접 이식 가능성

| 프로젝트 | 전체 이식? | 아이디어만? | 이유 |
|----------|-----------|------------|------|
| **graphify** | ❌ 불가 | ✅ 예 (고가치) | Python CLI, 단일 프로젝트 scope, 이미 "이중 운영" 결정 |
| **llm_wiki** | ❌ 불가 | ✅ 예 (최고가치) | Tauri 데스크톱, 단일 유저 전제, 저장소 근본 상이 |
| **llm-wiki-agent** | ❌ 불가 | ✅ 예 (설계 패턴) | Python, 실제 에이전트 아님 (Claude Code 호스트) |
| **mindvault** | ❌ 불가 | ✅ 예 (원리 가치) | Python PyPI 개인용, 권한 모델 전무 |
| **qmd** | ❌ 불가 | ✅ 예 (알고리즘 황금) | on-device GGUF → 서버 환경 불일치 |

**핵심 인사이트**: **5개 중 어느 것도 그대로 가져다 쓸 수 없다**. 전부 싱글유저 로컬 또는 서브프로세스 시나리오. 하지만 **각각이 서로 보완적인 고가치 아이디어를 제공**한다.

---

## 2. LLM 사용 패턴 상세 비교

| 항목 | Jarvis | graphify | llm_wiki | llm-wiki-agent | mindvault | qmd |
|------|--------|----------|----------|----------------|-----------|-----|
| **벤더** | OpenAI만 | 없음 (결정론적) | multi (OpenAI/Anth/LM Studio/Ollama) | multi (litellm) | OpenAI | on-device GGUF |
| **모델** | `gpt-5.4-mini` 단일 (AS-IS) | — (graphify 바이너리 LLM 미사용) | 사용자 선택 (보통 Sonnet) | Haiku + Sonnet | gpt-4.1-mini | Qwen3-1.7B (SFT fine-tuned) |
| **모델 라우팅** | ❌ 없음 | ✅ task별 (추론 vs 합성) | ✅ 사용자 설정 | ✅ ingest는 Sonnet, 2-pass는 Haiku | ❌ | ❌ (단일 로컬) |
| **프롬프트 관리** | 하드코딩 상수 | skill.md 내장 | lib/prompts | skill.md 내장 | 하드코딩 | 하드코딩 |
| **구조화 출력** | ❌ | JSON 텍스트 | JSON 텍스트 | ✅ JSON (한방에) | JSON 텍스트 | ✅ GBNF grammar |
| **Streaming** | SSE | ❌ | ✅ 15분 timeout | ❌ | ❌ | ❌ |
| **Multi-turn** | 튜터만 | ❌ | ✅ chat context | ❌ | ❌ | ❌ |
| **Tool calling** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Chain-of-Thought** | ❌ | ❌ | ✅ **Two-Step CoT (analyze → generate)** | ❌ | ❌ | ❌ |
| **Query expansion** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ lex/vec/hyde 3-way |
| **Rerank** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ position-aware blend |
| **Cost tracking** | ❌ (SSE done에 총합만) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **LLM cache** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ SHA256 기반 |

### 2.1 핵심 LLM 차별화 패턴

- **Two-Step CoT (llm_wiki)**: "분석만 하는 1차 호출 → 그 결과로 쓰기만 하는 2차 호출". LLM 호출 2배지만 응답 품질이 결정적으로 향상.
- **모델 라우팅 (graphify + llm-wiki-agent)**: Haiku(추출·확장)와 Sonnet(합성·ingest)을 분리. 60~70% 비용 절감 가능.
- **LLM 캐시 (qmd)**: `SHA256(JSON.stringify({op, model, prompt, params}))`로 캐시 키. 리랭커/확장 20~60% 호출 절감.
- **Grammar-constrained (qmd)**: GBNF로 출력 강제. OpenAI에서는 JSON schema / tool use로 대체 가능.

---

## 3. 임베딩 & 검색 아키텍처 비교 ⭐⭐⭐⭐⭐

**질문: 텍스트 임베딩은 꼭 필요한가?**

| 프로젝트 | 임베딩 사용? | 이유 |
|----------|-------------|------|
| Jarvis | ✅ (knowledge_claim + precedent_case) | 의미 검색 + 모호 쿼리 |
| graphify | ❌ | 그래프 자체가 의미 구조 |
| llm_wiki | ✅ (LanceDB) | 하이브리드 (토큰 + 벡터) |
| llm-wiki-agent | ❌ | "사전 컴파일된 위키 = RAG 대체" 철학 |
| mindvault | ❌ | BM25 + CJK + 그래프 이웃으로 충분 |
| qmd | ✅ (embeddinggemma) | RRF 하이브리드의 한 축 |

**결론**: 임베딩은 "필수"가 아니다. **선별적 사용**이 맞다.
- 정확한 키워드 매칭 + 그래프 구조로 해결 가능한 쿼리에 임베딩은 불필요.
- 의미적 모호성(synonym, paraphrase)이 있을 때만 벡터 검색이 진가.
- Jarvis는 이미 pgvector 도입했으므로 **"언제 안 쓸지" 기준이 더 중요**.

### 3.1 검색 파이프라인 5단계 설계 (qmd 기준 가장 완성형)

```
  Query
   │
   ├──▶ 1. Intent Classification (optional, 사내 용어 동음이의어 대응)
   │
   ├──▶ 2. Query Expansion (lex/vec/hyde 3-way, `gpt-5.4-mini`)
   │       ↓
   ├──▶ 3. Parallel Retrieval
   │        ├─ BM25 (PG FTS or OpenSearch)
   │        ├─ Vector (pgvector)
   │        └─ Graph (neighbors, BFS 3-depth)
   │       ↓
   ├──▶ 4. RRF Fusion + Position-Aware Blend (top3: 0.75/0.25, 11+: 0.40/0.60)
   │       ↓
   ├──▶ 5. Strong-Signal Bypass (top ≥ 0.85 + gap ≥ 0.15 시 확장 skip)
   │       ↓
   └──▶ Re-rank (chunk-based, 40 candidates, LLM y/n)
            ↓
         최종 결과 + [1][2] 인용
```

### 3.2 임베딩 전략 비교

| 프로젝트 | 임베딩 모델 | 차원 | 청킹 전략 | 증분 |
|----------|------------|------|-----------|------|
| Jarvis | text-embedding-3-small | 1536 | 페이지 전체 (청크 단위 없음) | ❌ 페이지 재생성 |
| llm_wiki | 사용자 선택 | 보통 1536 | 문서 전체 | SHA256 기반 |
| qmd | embeddinggemma | 768 | **regex + AST + 제곱 거리 감쇠** ⭐ | ❌ |
| mindvault | - | - | BM25 토크나이저 (CJK-aware) | SHA256 기반 |

**gap**: Jarvis는 청크 단위 임베딩이 없다. qmd의 chunking 알고리즘(900 토큰 + 균형 breakpoint)을 도입하면 대용량 문서 검색 품질이 비약.

---

## 4. 지식 구조 모델 비교

| 프로젝트 | 모델 | 레이어 수 | 특징 |
|----------|------|-----------|------|
| **Jarvis** | 4-surface (정본/디렉터리/사례/파생) | 4 | 이미 결정된 설계, `MEMORY.md - Product Strategy` |
| **graphify** | 노드 + 3단 confidence 엣지 + 커뮤니티 | 1 graph | EXTRACTED / INFERRED / AMBIGUOUS |
| **llm_wiki** | Wiki pages + backlinks + communities (Louvain) | 1 wiki + graph overlay | sources: [] frontmatter traceability |
| **llm-wiki-agent** | **sources/entities/concepts/syntheses** | **4** ⭐ | Jarvis 4-surface와 정확히 매칭 |
| **mindvault** | `{path_slug}::{kind}::{local_slug}` | - | Canonical ID 체계 |
| **qmd** | Collections + Context annotations | 1 flat | Flat + 메타 |

**결정적 인사이트**: **llm-wiki-agent의 4-layer (sources/entities/concepts/syntheses) = Jarvis의 4-surface (정본/디렉터리/사례/파생)** — 거의 1:1 매칭.

| llm-wiki-agent | Jarvis 매핑 |
|---------------|-------------|
| `sources/` (원본 문서) | `wiki_sources` (원본 미팅록/PPT/PRD) |
| `entities/` (사람·제품·프로젝트) | `wiki_entities` 또는 `directory` |
| `concepts/` (용어·프레임워크) | `wiki_concepts` |
| `syntheses/` (합성된 답변) | `wiki_syntheses` (AI가 저장한 판례·답변) |

이는 **Jarvis의 방향성을 외부 레퍼런스가 독립적으로 검증**한 강력한 시그널이다.

---

## 5. 에디터/UI 비교

| 프로젝트 | 에디터 | 렌더러 | 특수 기능 |
|----------|--------|--------|-----------|
| **Jarvis** | textarea | react-markdown + remark-gfm | 기본, placeholder 수준 |
| **graphify** | - | vis.js HTML 뷰 | Obsidian vault export |
| **llm_wiki** | **Milkdown (ProseMirror)** ⭐ | Milkdown | WYSIWYG + wikilink (custom plugin 필요) |
| **llm-wiki-agent** | 마크다운 직접 | - | - |
| **mindvault** | - | - | vis.js 그래프 뷰 |
| **qmd** | - | - | `--explain` 트레이스 화면 |

**결정**: **Milkdown (llm_wiki)이 유일한 리치 에디터 레퍼런스**. 
- Next.js에 `use client`로 마운트 가능.
- ProseMirror 기반이므로 custom node 확장 가능 ([[wikilink]] 지원).
- 번들 크기는 주의 필요 (~500KB gzipped).

**대안 고려**:
- **Tiptap** (Milkdown과 같은 ProseMirror 기반, 더 널리 사용)
- **Lexical** (Meta 작, React 1급 시민)
- **BlockNote** (Notion 스타일, 최근 인기)

---

## 6. 데이터 파이프라인 비교

| 단계 | Jarvis | graphify | llm_wiki | llm-wiki-agent | mindvault | qmd |
|------|--------|----------|----------|----------------|-----------|-----|
| **소스 감지** | 수동 업로드 | CLI 인자 | 드래그 drop | 수동 | **파일 시스템 스캔** | 수동 `qmd update` |
| **해시 캐시** | ❌ | ✅ SHA256 | ✅ SHA256 | ✅ SHA256 | ✅ SHA256 | ✅ SHA256 + content-addressable |
| **Frontmatter 처리** | gray-matter | 파싱 + strip | - | gray-matter | **Obsidian 호환 extract** | - |
| **청킹** | ❌ (페이지 전체) | - | 문서 전체 | - | - | **smart chunking (regex+AST)** |
| **임베딩 스케줄** | 동기 | - | 큐 기반 | - | - | - |
| **증분 재임베딩** | ❌ (페이지 재생성) | ✅ dirty만 | ✅ 변경분만 | ✅ per-file | ✅ dirty only | ❌ |
| **배치 vs 실시간** | 동기 | CLI 실행 | 사용자 트리거 | 수동 ingest | 데몬 (launchd) | 수동 |
| **외부 커넥터** | ❌ | URL ingest (arxiv/tweet/youtube) | Web Clipper 확장 | ❌ | Discover (사내 repo 자동) | ❌ |

**큰 gap**: Jarvis는 **증분 재임베딩이 없고**, **외부 데이터 커넥터가 없다**. 5개 모두 SHA256 기반 증분을 구현. 이식 P0.

---

## 7. Jarvis 갭 × 각 프로젝트 기여 매핑 ⭐⭐⭐⭐⭐

> `00-jarvis-current-state.md:§10`의 갭 각각에 **어느 프로젝트가 해결 기여**하는지 매핑.

### 7.1 §10.1 위키 에디터 갭

| 갭 항목 | graphify | llm_wiki | llm-wiki-agent | mindvault | qmd |
|---------|----------|----------|----------------|-----------|-----|
| WYSIWYG 에디터 | - | **⭐⭐⭐⭐⭐** Milkdown | - | - | - |
| 드래그 첨부 | - | ⭐⭐⭐⭐ | - | - | - |
| 백링크 | - | ⭐⭐⭐⭐⭐ (enrich-wikilinks) | ⭐⭐⭐ | ⭐⭐⭐⭐ | - |
| 템플릿 | - | - | ⭐⭐⭐⭐ (4-layer 스키마 템플릿) | - | - |
| 태그 브라우징 | - | ⭐⭐⭐ | - | ⭐⭐⭐ (#tags extract) | - |
| 스페이스/폴더 | - | ⭐⭐⭐ | ⭐⭐⭐⭐ (4-layer 디렉토리) | - | ⭐⭐⭐ (collections) |
| 외부 연동 (Notion/Confluence) | ⭐⭐⭐ (URL ingest) | ⭐⭐⭐⭐ (Web Clipper) | - | ⭐⭐⭐⭐ (Discover) | - |
| 페이지 분석 | ⭐⭐⭐⭐ (god nodes) | ⭐⭐⭐⭐⭐ (insights) | ⭐⭐⭐ (lint) | ⭐⭐⭐ | - |

**해결책**: 
- **에디터는 llm_wiki의 Milkdown** 도입 (또는 Tiptap/BlockNote 대체)
- **외부 연동은 llm_wiki의 Web Clipper + mindvault의 Discover** 조합
- **페이지 분석은 graphify의 god nodes + llm_wiki의 insights**

### 7.2 §10.2 RAG 품질 루프 갭

| 갭 항목 | graphify | llm_wiki | llm-wiki-agent | mindvault | qmd |
|---------|----------|----------|----------------|-----------|-----|
| 평가 루프 (upvote/down) | - | ⭐⭐⭐ (review queue) | - | - | - |
| eval 하네스 | - | - | - | - | **⭐⭐⭐⭐⭐** (`finetune/eval/`) |
| 프롬프트 관리 | ⭐⭐⭐ (skill.md 내장) | ⭐⭐⭐⭐ (lib/prompts) | ⭐⭐⭐⭐ | - | - |
| Multi-turn 대화 | - | ⭐⭐⭐⭐⭐ (chat context) | - | - | - |
| Citation 고도화 | ⭐⭐⭐ (source_file 엣지) | ⭐⭐⭐⭐⭐ ([1][2] 강제) | ⭐⭐⭐⭐ | - | ⭐⭐⭐⭐ (snippet + highlight) |
| 답변 검증 | ⭐⭐⭐⭐ (contradictions) | ⭐⭐⭐⭐ | **⭐⭐⭐⭐⭐** (contradictions + lint) | - | - |
| 토큰 추적 | - | - | - | - | - |
| 생성 캐시 | - | - | - | - | **⭐⭐⭐⭐⭐** (LLM cache SHA256) |
| Tool calling | - | - | - | - | (grammar 대체) |
| Structured output | - | ⭐⭐⭐ | **⭐⭐⭐⭐⭐** (JSON schema 한방) | - | ⭐⭐⭐⭐⭐ (GBNF) |
| 프롬프트 A/B | - | - | - | - | ⭐⭐⭐ (finetune harness) |
| 라우터 정확도 | - | - | - | - | ⭐⭐⭐⭐ (intent) |

**해결책**:
- **Citation + 답변 검증 = llm-wiki-agent의 contradictions + lint/heal**
- **생성 캐시 = qmd의 LLM cache**
- **Structured output = OpenAI `response_format: json_schema`** (llm-wiki-agent 프롬프트 차용)
- **Eval 하네스 = qmd의 `finetune/eval/`** (자체 eval 레시피)
- **Multi-turn = llm_wiki의 chat context**

### 7.3 §10.3 UX/UI 갭

| 갭 항목 | 기여 프로젝트 |
|---------|--------------|
| 디자인 시스템 | 모두 placeholder 수준, Jarvis 자체 설계 필요 |
| 명령 팔레트 (Cmd+K) | llm_wiki에 있을 가능성 (chat panel) |
| 검색 UX (최근/저장) | qmd의 `--explain` 패턴 참고 |
| 알림 센터 | 없음 (자체 설계) |

### 7.4 §10.4 데이터 파이프라인 갭

| 갭 항목 | 최고 기여 프로젝트 | 설명 |
|---------|------------------|------|
| **증분 재임베딩** | **llm_wiki ingest-cache** + mindvault dirty cache | 5개 모두 SHA256 있지만 llm_wiki가 TS 이식 가장 쉬움 |
| 외부 커넥터 | llm_wiki Web Clipper + mindvault Discover | 각 채널별로 P1~P2 |
| 중복 탐지 | **qmd content-addressable** | 해시 기반 중복 자동 병합 |
| graph materialization | **graphify 전체** (이미 이중 운영) | god nodes + surprises + questions |
| 사례 리버스 임베딩 | Jarvis 자체 (OpenAI 전환) | `DATA_REFRESH_GUIDE.md` 언급 |

### 7.5 §10.5 운영/관측 갭

모든 레퍼런스가 관측/비용 추적이 없다. **Jarvis 자체 구축 필요** (레퍼런스 외).
- OpenTelemetry / Datadog / Sentry / pino / request-id middleware → 전부 자체.

---

## 8. 우선순위 점수표 (재사용 × Jarvis 갭 해소 × 난이도)

기준:
- **재사용성**: 1(직접불가) ~ 5(직역이식)
- **Jarvis 갭 해소**: 1(영향미미) ~ 5(결정적)
- **난이도**: 1(매우 낮음) ~ 5(매우 높음, 값 낮을수록 좋음)
- **총점**: 재사용성 + 갭 해소 - 난이도

| 아이디어 | 출처 | 재사용성 | 갭 해소 | 난이도 | 총점 |
|----------|------|----------|---------|--------|------|
| **SHA256 per-file 캐시** | graphify/mindvault/llm_wiki 공통 | 5 | 4 | 1 | **8** |
| **RRF + position-aware blend** | qmd | 5 | 5 | 1 | **9** |
| **Smart chunking (regex+AST)** | qmd | 5 | 4 | 2 | **7** |
| **Strong-signal BM25 bypass** | qmd | 5 | 3 | 1 | **7** |
| **4-layer 스키마 (Jarvis 4-surface 검증)** | llm-wiki-agent | 3 | 5 | 2 | **6** |
| **Two-Step CoT Ingest** | llm_wiki | 4 | 4 | 2 | **6** |
| **JSON Schema 강제 출력** | llm-wiki-agent | 5 | 4 | 1 | **8** |
| **모델 라우팅 (Haiku+Sonnet or mini+4.1)** | graphify/llm-wiki-agent | 5 | 4 | 2 | **7** |
| **3단 신뢰도 엣지 (EXTRACTED/INFERRED/AMBIGUOUS)** | graphify | 5 | 5 | 2 | **8** |
| **Contradictions + Lint/Heal** | llm-wiki-agent | 4 | 5 | 3 | **6** |
| **Milkdown 에디터** | llm_wiki | 4 | 5 | 2 | **7** |
| **god nodes / surprising connections** | graphify | 4 | 4 | 2 | **6** |
| **자기강화 루프 (Q&A → graph)** | graphify | 4 | 4 | 2 | **6** |
| **Canonical ID (`path::kind::local`)** | mindvault | 4 | 3 | 1 | **6** |
| **LLM 캐시 (SHA256)** | qmd | 5 | 4 | 1 | **8** |
| **Intent 스티어링** | qmd | 4 | 4 | 2 | **6** |
| **CJK BM25 토크나이저** | mindvault | 4 | 3 | 1 | **6** |
| **Auto-context 강제 주입** | mindvault | 4 | 4 | 2 | **6** |
| **`--explain` 트레이스 관리자 UI** | qmd | 3 | 4 | 3 | **4** |
| **HyDE 쿼리** | qmd | 4 | 3 | 2 | **5** |
| **User notes 공존 마커** | mindvault | 4 | 3 | 1 | **6** |
| **MCP instructions 동적 주입** | qmd | 3 | 3 | 3 | **3** |
| **Multi-turn chat context** | llm_wiki | 4 | 4 | 2 | **6** |
| **Web Clipper (외부 수집)** | llm_wiki | 3 | 4 | 3 | **4** |
| **Louvain 커뮤니티 탐지** | graphify/llm_wiki | 3 | 4 | 3 | **4** |
| **Deep Research (Tavily+auto-ingest)** | llm_wiki | 3 | 3 | 3 | **3** |
| **Fine-tuning 하네스** | qmd | 2 | 2 | 5 | **-1** |
| **Obsidian vault export** | graphify/mindvault | 5 | 1 | 1 | **5** |
| **URL ingest (arxiv/tweet/youtube)** | graphify | 4 | 2 | 2 | **4** |

### 8.1 P0 (총점 7+): Phase-7 1주차 후보

1. **RRF + position-aware blend** (9)
2. **SHA256 per-file 캐시** (8)
3. **JSON Schema 강제 출력** (8)
4. **3단 신뢰도 엣지** (8)
5. **LLM 캐시 (SHA256)** (8)
6. **Smart chunking** (7)
7. **Strong-signal BM25 bypass** (7)
8. **모델 라우팅** (7)
9. **Milkdown 에디터** (7)

### 8.2 P1 (총점 6): Phase-7 2~3주차 후보

10. **4-layer 스키마 (Jarvis 4-surface 확장)** (6)
11. **Two-Step CoT Ingest** (6)
12. **Contradictions + Lint/Heal** (6)
13. **god nodes / insights** (6)
14. **자기강화 루프** (6)
15. **Canonical ID** (6)
16. **Intent 스티어링** (6)
17. **CJK BM25 토크나이저** (6)
18. **Auto-context 강제 주입** (6)
19. **User notes 공존 마커** (6)
20. **Multi-turn chat** (6)

### 8.3 P2+ (총점 5 이하): 후순위 / 선택적

나머지는 Phase-8 이후 또는 사업 우선순위에 따라 결정.

### 8.4 DROP (총점 ≤ 0): 가져오지 말 것

- **Fine-tuning 하네스** (-1): 현재 Jarvis는 OpenAI API로 충분. 자체 모델 전환은 수년 후 이슈.
- **9개 플랫폼 설치자** (graphify): 관련 없음.
- **Tauri IPC / Rust crate**: Next.js 서버 환경 무관.
- **launchd / systemd 데몬**: Jarvis는 이미 worker 있음.
- **Obsidian vault export** (우선순위만 낮음, 기능 자체는 무해): 현재 Jarvis 사용자가 Obsidian 쓸 이유 없음.

---

## 9. 교차 검증된 공통 패턴 (5개 중 3개 이상에 존재)

이 패턴들은 **독립 저자들이 같은 결론에 도달**한 신호이므로 Jarvis 도입 **매우 강력 추천**:

| 패턴 | 존재 프로젝트 | Jarvis 적용 |
|------|--------------|-------------|
| **SHA256 per-file 캐시** | graphify, llm_wiki, llm-wiki-agent, mindvault, qmd (5/5) | **즉시 도입** |
| **JSON 구조화 출력 (정도 차이)** | graphify, llm_wiki, llm-wiki-agent, mindvault, qmd (5/5) | **OpenAI json_schema로 표준화** |
| **한방 Ingest 프롬프트** | llm_wiki (2-step), llm-wiki-agent (1-shot), mindvault (구조화), qmd - (4/5) | **llm-wiki-agent 방식 우선** |
| **그래프 확장 (BFS/DFS)** | graphify, llm_wiki, llm-wiki-agent, mindvault (4/5) | **Jarvis의 이미 있는 graphify 활용 + RAG에 편입** |
| **4-layer 또는 유사 구조화** | llm_wiki (sources+entities+concepts), llm-wiki-agent (4-layer), Jarvis (4-surface) (3/3 위키 중심) | **Jarvis 4-surface 유지·강화** |
| **하이브리드 검색 (BM25+Vector)** | llm_wiki, qmd, Jarvis (3/3 검색 중심) | **RRF + Position-Aware Blend 채택** |
| **LLM 캐시** | qmd + 필요 (5/5 미도입) | **PG 테이블로 즉시 추가** |
| **외부 데이터 수집** | graphify (URL), llm_wiki (Web Clipper), mindvault (Discover) (3/5) | **P1 단계 연동** |

---

## 10. 버릴 것 vs 재구성할 것 vs 즉시 도입할 것

### 10.1 즉시 도입 (P0)

- SHA256 per-file 캐시
- RRF + position-aware blend
- JSON Schema 강제 출력
- 3단 신뢰도 엣지
- LLM 캐시 테이블
- Smart chunking (qmd)
- Strong-signal BM25 bypass
- 모델 라우팅 (`gpt-5.4-mini` + `gpt-5.4`, env var 추상화)
- Milkdown 또는 Tiptap 에디터

### 10.2 재구성 필요 (P1)

- 4-layer 스키마는 **이미 Jarvis의 4-surface에 존재** → 명명만 정렬하고 필드 확장
- 그래프 모듈은 **graphify 이중 운영 유지** → 쿼리 API만 TS로 래퍼 추가
- Contradictions/Lint는 **Phase-6의 drift detection과 통합**
- Two-Step CoT는 **ingest worker의 `autoIngest` 함수 재설계**

### 10.3 버릴 것 (Anti-patterns)

| 버릴 것 | 이유 |
|---------|------|
| **Tauri, Rust crate** | Jarvis는 웹 서버. 파일 I/O는 Node 표준 API로. |
| **LanceDB** | 이미 pgvector 운영 중. 전환 비용 > 이득. |
| **node-llama-cpp on-device** | 5000명 서버 환경 부적합. OpenAI API 고수. |
| **CLI 중심 프로세스** | Jarvis는 Next.js route + worker 패턴. |
| **파일시스템 DB** (mindvault) | PG 트랜잭션/ACID 포기 불가. |
| **단일 사용자 가정 (모든 레퍼런스)** | RBAC + sensitivity + workspaceId 필수. |
| **graphify를 TS로 전면 포팅** | "이미 이중 운영" 결정. 유지 비용 vs 이식 이득. |
| **Fine-tuning harness** | OpenAI API로 충분, 수년간 불필요. |
| **Obsidian vault 호환성** | Jarvis는 웹 포털. 사용자가 Obsidian 쓸 이유 없음. |
| **9개 플랫폼 설치자 (graphify)** | 무관. |
| **GBNF grammar 강제** | OpenAI 미지원, JSON schema로 대체. |

---

## 11. 결정이 필요한 주제들

### 11.1 에디터 선택

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Milkdown** (llm_wiki 경로) | ProseMirror 기반, 레퍼런스 있음 | 번들 크기 ~500KB |
| **Tiptap** | 가장 널리 사용, 풍부한 extension | Milkdown과 같은 ProseMirror |
| **Lexical** | Meta 작, React 1급 | 마크다운 호환 노력 |
| **BlockNote** | Notion 스타일 UX | 상대적으로 신생 |
| 유지(textarea) | 단순 | 갭 1위 |

**추천**: **Tiptap**. Milkdown과 같은 기반이지만 생태계가 더 커서 장기 유지보수 안정적.

### 11.2 모델 라우팅 전략

| 옵션 | 설명 | v2 결정 |
|------|------|---------|
| **단일 `gpt-5.4-mini`** | 단순, 비용 낮음. 복잡한 합성 시 품질 부족 가능 | — |
| **`gpt-5.4-mini` + `gpt-5.4` 라우팅 (env 추상화)** | 추출/확장은 mini, 합성/ingest는 `gpt-5.4`. env var로 모델 교체 쉽게 | ✅ **채택** |
| **OpenAI + Anthropic dual** | Anthropic SDK는 이미 dead dependency. 재활성화 비용 | ❌ 거절 |
| **litellm 추상화** | 벤더 중립성, 운영 복잡도↑ | ❌ 거절 |

**v2 채택**: `gpt-5.4-mini`(utility) + `gpt-5.4`(synthesis) + env var (`ASK_AI_MODEL`, `ASK_AI_SYNTHESIS_MODEL`). 신규 모델 출시 시 env 한 줄 교체로 전환. ✅ main 코드는 이미 `gpt-5.4-mini` 기본값 — 스왑 불요. Phase-7A에서는 `ASK_AI_SYNTHESIS_MODEL=gpt-5.4` 신규 env 추가만.

### 11.3 임베딩 유지 여부

**추천**: **유지하되 chunking 추가**. 
- 페이지 전체 임베딩 → qmd smart chunking 도입 → 청크 단위 검색
- 증분 SHA256 캐시 도입으로 비용 절감
- 하이브리드 RRF로 가중치 조정 (벡터만 믿지 말 것)

### 11.4 그래프 레이어 완전 내재화 vs 이중 운영 유지

**추천**: **이중 운영 유지** (이미 결정). 
- graphify는 Python CLI로 서브프로세스 호출
- Jarvis는 TS로 **쿼리 API 레이어만** 얇게 구현 (7개 도구를 HTTP route로)
- 향후 Python 서비스를 컨테이너로 Dockerize 후 내부 gRPC/REST

---

## 12. 다음 단계

**→ `99-integration-plan.md`로 진행.**

이 매트릭스는 "무엇이 있는가 / 어떻게 비교되는가"까지 다룬다. 통합 계획은 다음을 다룬다:
1. **Phase-7 스프린트별 작업 순서**
2. **구체 스키마 변경 (Drizzle DDL)**
3. **LLM 전략 상세 (어떤 호출을 어떤 모델로)**
4. **임베딩 파이프라인 재설계**
5. **검색 파이프라인 5단계 구현 계획**
6. **에디터 도입 단계**
7. **Lint/Heal/Eval 루프 구성**
8. **위험 & 완화책**

# qmd — Jarvis 통합 관점 상세 분석

> 분석 대상: `C:\Users\kms\Desktop\dev\reference_only\qmd` (브랜치 기준 v2.1.0 / 2026-04-05 릴리즈 + Unreleased)
> 분석 목적: Jarvis(Next.js 15 + PostgreSQL/pgvector + OpenSearch + OpenAI, 사내 업무 시스템 + 위키 + RAG 포털, 5000명 사용자)로 들여올 수 있는 설계 패턴/알고리즘/코드 식별

---

## 1. 프로젝트 개요

### 1.1 이름의 의미
- README 1행: "QMD - **Query Markup Documents**" (`reference_only/qmd/README.md:1`)
- package.json 3행: "Query Markup Documents - On-device hybrid search for markdown files with BM25, vector search, and LLM reranking" (`reference_only/qmd/package.json:4`)
- 약어: Q(uery) M(ark)D(own) — "마크다운을 대상으로 한 질의 엔진"
- Quarto/Pandoc의 `.qmd` 확장자와는 무관. 자체 브랜드이며 npm 패키지명은 `@tobilu/qmd`.

### 1.2 한 문단 요약
qmd는 **노트·회의록·내부 문서를 로컬 파일시스템에 마크다운으로 두고, BM25 + 벡터 + LLM 리랭커를 조합한 하이브리드 검색을 on-device로 제공하는 CLI/MCP 서버/SDK**다. 인덱스는 단일 SQLite 파일(`~/.cache/qmd/index.sqlite`)에 담기고, LLM은 `node-llama-cpp`로 GGUF 모델을 직접 로드해 임베딩(EmbeddingGemma 300M) · 리랭킹(Qwen3-Reranker 0.6B) · 쿼리 확장(QMD 저자가 Qwen3-1.7B를 파인튜닝한 전용 GGUF)을 실행한다. 모든 것을 agentic 워크플로우에 태우기 쉽도록 `--json`/`--files` 출력, `collection`/`context` 개념, MCP 통합(stdio·HTTP)을 일급으로 노출한다.

### 1.3 해결하려는 문제
1. **LLM agent에게 주는 사내 지식 베이스가 필요**하나 SaaS RAG(Pinecone/Weaviate/서버 기반 임베딩 API)에 의존하지 않고 완전히 로컬에서 돌리고 싶다.
2. **순수 벡터 검색은 정확한 용어·고유명사에 약하고**, 순수 BM25는 자연어 질의/동의어에 약하다. 이를 하이브리드(RRF + LLM 리랭커)로 해결.
3. **작은 오픈소스 LLM은 쿼리 확장(lex/vec/hyde 분기) 포맷을 못 따름** → 저자가 Qwen3-1.7B를 SFT로 파인튜닝한 전용 모델(GGUF)을 배포.
4. **MCP(Model Context Protocol)의 "인덱스 헬스/컨텍스트"를 LLM이 알 수 있게** initialize instructions에 동적 요약을 주입 (`src/mcp/server.ts:109-168`).
5. **코드 파일 청킹의 저품질**: 텍스트 청킹은 함수 중간을 잘라버림 → tree-sitter AST 기반 분할(`src/ast.ts`).

### 1.4 타겟 사용자
- "On-device agentic flow"를 구성하는 **단일 개발자** / CLI 사용자 (README 3행의 기본 구성).
- Claude Desktop / Claude Code 등 MCP 기반 호스트에서 **자체 지식베이스를 LLM에 연결**하려는 이용자.
- Tobi Lütke(Shopify CEO) 개인 프로젝트 성격이 강함. MIT 라이선스. 다중 사용자 지원은 설계 목표가 아님.

---

## 2. 기술 스택 & 아키텍처

### 2.1 언어/런타임/프레임워크
- **TypeScript**(ES2022), Node.js ≥ 22 또는 Bun 1.0+ 듀얼 런타임. `package.json:89-91`.
- CLI 엔트리: `bin/qmd`(shell script) → `dist/cli/qmd.js`.
- `tsc`로 단순 빌드(`tsconfig.build.json`). 번들러 미사용. Node 네이티브 모듈(better-sqlite3, node-llama-cpp) 의존성 때문에 AOT compile은 명시적으로 금지됨 (`CLAUDE.md:150-154`).
- 프레임워크 없음. 모든 것이 raw Node + SQLite 조합. **Next.js/React/Express 등 전무.**
- 테스트: Vitest 3.2 (`vitest.config.ts`).
- `flake.nix` 제공 → Nix 생태계 지원.

### 2.2 핵심 의존성 (package.json:47-68)
| 라이브러리 | 역할 |
|---|---|
| `better-sqlite3 12.8.0` | Node용 동기 SQLite 바인딩 |
| `sqlite-vec 0.1.9` + platform 바이너리 | SQLite 확장으로 벡터 유사도(`vectors_vec` 가상 테이블) |
| `node-llama-cpp 3.18.1` | 임베딩/생성/리랭킹을 GGUF 모델 로컬 추론 |
| `@modelcontextprotocol/sdk 1.29.0` | MCP 서버(stdio + HTTP) |
| `web-tree-sitter 0.26.7` | AST 청킹 (코드 파일용). wasm 방식 |
| `fast-glob 3.3.3`, `picomatch 4.0.4` | 글로브 매칭 |
| `yaml 2.8.3` | `~/.config/qmd/index.yml` 구성 파싱 |
| `zod 4.2.1` | MCP 툴 입력 스키마 검증 (정확히 4.2.1 핀) |
| `tree-sitter-{go,python,rust,typescript} *` | 선택 grammar (optionalDependencies) |

**특기 사항**: LangChain/LlamaIndex/remark/unified 같은 "흔한 NLP 스택" 전무. **모두 손수 구현된다.** 외부 API 호출 0 (HuggingFace 모델 다운로드만 제외). 완전 오프라인 가능.

### 2.3 디렉토리 구조
```
qmd/
├── bin/qmd                      # bash 런처 (node/bun 자동 감지)
├── src/
│   ├── index.ts                 # SDK 공개 API (QMDStore 인터페이스, createStore)
│   ├── store.ts                 # 170KB 메인 엔진: 청킹, 인덱싱, 하이브리드 검색, RRF
│   ├── db.ts                    # SQLite 듀얼 런타임 (bun:sqlite vs better-sqlite3)
│   ├── llm.ts                   # 57KB node-llama-cpp 래퍼 (embed/expand/rerank)
│   ├── ast.ts                   # tree-sitter AST 청킹
│   ├── collections.ts           # YAML 기반 컬렉션 설정
│   ├── maintenance.ts           # DB 유지보수 (vacuum, cleanup)
│   ├── embedded-skills.ts       # Base64로 인코딩된 Claude Code 스킬 파일
│   ├── bench/                   # 벤치마크 (precision@k, MRR, F1)
│   ├── cli/
│   │   ├── qmd.ts               # 125KB — 모든 CLI 서브커맨드
│   │   └── formatter.ts         # JSON/CSV/XML/MD/CLI 포맷
│   └── mcp/
│       └── server.ts            # 32KB MCP 서버 (stdio + Streamable HTTP)
├── finetune/                    # 쿼리 확장 모델 학습 (Python/UV)
│   ├── train.py, reward.py, eval.py
│   ├── configs/sft.yaml
│   └── dataset/, evals/, experiments/grpo/
├── docs/SYNTAX.md               # 쿼리 문법 정의 (EBNF)
├── test/                        # 30+ 테스트 (cli, store, mcp, eval, llm)
├── skills/qmd/                  # Claude Code 플러그인용 SKILL.md
├── scripts/                     # release, install-hooks
└── migrate-schema.ts            # DB 스키마 마이그레이션 스크립트
```
**중요한 관찰**: `src/store.ts` 하나가 **170KB / 4500+ 줄**. Tobi가 의도적으로 "너무 많은 파일 쪼개기보다 한 파일에 모아서 읽기 좋게"를 선호함을 시사한다.

### 2.4 엔트리 포인트
- **CLI**: `bin/qmd` → `dist/cli/qmd.js` → `src/cli/qmd.ts`의 top-level async IIFE. 서브커맨드 라우팅은 수동 `switch`.
- **MCP**: `qmd mcp [--http]` → `src/mcp/server.ts:startMcpServer()` 또는 `startMcpHttpServer(port)`.
- **SDK**: `import { createStore } from '@tobilu/qmd'` → `src/index.ts:createStore(options)`.
- **tests**: `vitest run test/`.

---

## 3. 핵심 기능 (Feature Inventory)

| 기능 | 서브커맨드 / API | 구현 위치 |
|---|---|---|
| 컬렉션 추가/제거/이름변경 | `qmd collection {add,remove,rename,list}` | `src/collections.ts`, `src/store.ts:upsertStoreCollection` |
| 컬렉션별 패턴/ignore | `--mask "**/*.md"` | `src/collections.ts:27-34` |
| 컨텍스트(메타 설명) 부착 | `qmd context {add,list,rm,check}` | `src/store.ts:getContextForFile` |
| 증분 인덱싱 | `qmd update [--pull]` | `src/store.ts:reindexCollection` |
| 벡터 임베딩 생성 | `qmd embed [-f] [--chunk-strategy auto]` | `src/store.ts:generateEmbeddings` |
| BM25만 검색 | `qmd search <q>` | `src/store.ts:searchFTS` |
| 벡터만 검색 | `qmd vsearch <q>` | `src/store.ts:searchVec` |
| 하이브리드 검색 (기본) | `qmd query <q>` | `src/store.ts:hybridQuery` |
| 구조화 쿼리 (lex/vec/hyde) | `qmd query $'lex: X\nvec: Y'` | `src/store.ts:structuredSearch` |
| 단일 문서 조회 (fuzzy 매치 포함) | `qmd get <path \| #docid>` | `src/store.ts:findDocument` |
| 복수 문서 조회 (glob/list) | `qmd multi-get <pattern>` | `src/store.ts:findDocuments` |
| 인덱스 상태 | `qmd status` | `src/store.ts:getStatus` |
| 청소 (orphan 벡터, 캐시) | `qmd cleanup` | `src/maintenance.ts` |
| MCP stdio 서버 | `qmd mcp` | `src/mcp/server.ts:startMcpServer` |
| MCP HTTP 서버 | `qmd mcp --http [--daemon]` | `src/mcp/server.ts:startMcpHttpServer` |
| 검색 결과 포맷 | `--json --csv --md --xml --files` | `src/cli/formatter.ts` |
| 클릭 가능한 터미널 링크 | OSC 8 + `QMD_EDITOR_URI` | `src/cli/formatter.ts` |
| `--explain` 스코어 추적 | RRF 기여도, 리랭크 blend | `src/store.ts:buildRrfTrace` |
| 쿼리 확장 출력 제어 | `--intent "..."` | `src/llm.ts:1151-1154` |
| 리랭커 off | `--no-rerank` | `src/store.ts:skipRerank` |
| 벤치마크 harness | `qmd bench fixture.json` | `src/bench/bench.ts`, `src/bench/score.ts` |
| 스킬 설치 | `qmd skill install` | `src/embedded-skills.ts` |

---

## 4. Markdown/문서 처리 ⭐⭐⭐

### 4.1 파서: 없음 (의도적)
**remark/markdown-it/unified/micromark 전무**. qmd는 마크다운을 "렌더링"하지 않고, **텍스트 + 검색 대상**으로만 다룬다. 사용자에게 마크다운을 보여주는 것은 이 시스템의 책임이 아니다(터미널 스니펫이거나 editor link로 위임).

### 4.2 "파싱"으로 하는 일
1. **제목 추출**: 파일 첫 `# Heading` 또는 파일명으로 자동. (`src/store.ts` → 제목 생성 로직, handelize)
2. **본문 = 전체 raw**: `content` 테이블에 `doc TEXT NOT NULL` 그대로 저장. `documents_fts`에도 그대로. 프론트매터/YAML은 별도 파싱하지 않고 전체 텍스트를 BM25에 넣음.
3. **청킹**: 임베딩 용도로만 수행. 섹션·코드블록·호라이즌룰을 우선하여 자연스러운 분할 (아래 4.3).

즉 **qmd는 "MD 파서"가 아니라 "MD 파일의 검색 엔진"**. 이 구분이 Jarvis에서 중요.

### 4.3 Smart Chunking (가장 가치 있는 부분) ⭐⭐⭐⭐⭐

#### 알고리즘 (`src/store.ts:97-307`)
- **목표 청크 크기**: 900 tokens (≈3600 chars), overlap 15% = 135 tokens (540 chars). 상수화 `CHUNK_SIZE_TOKENS = 900` (`store.ts:52`).
- **탐색 윈도**: 목표 경계 이전 200 tokens (800 chars) 이내에서 "가장 좋은" 자연 분할점을 찾음.

#### 분할점 스코어 테이블 (`src/store.ts:97-110`)
```typescript
const BREAK_PATTERNS: [RegExp, number, string][] = [
  [/\n#{1}(?!#)/g, 100, 'h1'],
  [/\n#{2}(?!#)/g, 90,  'h2'],
  [/\n#{3}(?!#)/g, 80,  'h3'],
  [/\n#{4}(?!#)/g, 70,  'h4'],
  [/\n#{5}(?!#)/g, 60,  'h5'],
  [/\n#{6}(?!#)/g, 50,  'h6'],
  [/\n```/g,       80,  'codeblock'],
  [/\n(?:---|\*\*\*|___)\s*\n/g, 60, 'hr'],
  [/\n\n+/g,       20,  'blank'],
  [/\n[-*]\s/g,     5,  'list'],
  [/\n\d+\.\s/g,    5,  'numlist'],
  [/\n/g,           1,  'newline'],
];
```

#### 거리 감쇠 공식 (`src/store.ts:188-224`)
```typescript
const normalizedDist = distance / windowChars;
const multiplier = 1.0 - (normalizedDist * normalizedDist) * decayFactor;
const finalScore = bp.score * multiplier;  // decayFactor = 0.7
```
**핵심 아이디어**: 제곱 감쇠라 "200 tokens 뒤의 h1(score 100 × 0.3 = 30)"이 "목표 위치의 newline(score 1)"을 여전히 이김. 이것이 의미 단위 보존의 비결.

#### 코드 펜스 보호
`findCodeFences()` + `isInsideCodeFence()`로 ` ``` ` 안에서는 절대 분할하지 않음 (`store.ts:144-173`). 코드블록이 청크보다 크면 통째로 유지.

#### AST 확장 (`src/ast.ts`, 코드 파일 전용)
- 확장자 → 언어 매핑: `.ts/.tsx/.js/.jsx/.py/.go/.rs` (`ast.ts:36-48`).
- tree-sitter S-expression 쿼리로 노드 추출:
  - class/interface/struct/trait/impl/mod → **100점**
  - export/function/method/decorated → **90점**
  - type alias/enum → **80점**
  - import/use → **60점**
- regex 분할점 + AST 분할점을 `mergeBreakPoints()`로 병합 후 같은 `findBestCutoff()` 사용 (동일 decay 공식).
- grammar 파일(`.wasm`)은 optional dependency로 lazy 로드, 실패해도 regex fallback (`ast.ts:215-234`).

**→ Jarvis 시사점**: 이 청킹 알고리즘은 **언어·플랫폼 무관하게 그대로 포팅 가능**. TypeScript 200줄 안팎이면 `packages/chunker`로 추출 가능.

### 4.4 렌더링
- 출력 측 하이라이팅·수식·다이어그램 지원 없음.
- 스니펫은 단순 라인 기반: 쿼리 term이 가장 많이 매칭되는 라인을 중심으로 ±1/±3 라인 발췌 (`store.ts:3848-3914`).
- Diff 스타일 헤더 `@@ -start,count @@ (N before, M after)`가 특이 — LLM에게 "앞뒤 잘린 컨텍스트 규모"를 명시적으로 신호.
- 터미널 출력은 ANSI 컬러 + OSC 8 하이퍼링크 (`QMD_EDITOR_URI` 템플릿으로 VSCode/Cursor/Zed/Sublime로 점프).

### 4.5 프론트매터
- **처리 안 함**. YAML front matter가 있든 없든 `content.doc` 전체가 BM25/벡터 대상.
- title만 "첫 heading 또는 filename"으로 추정됨.

### 4.6 한글/CJK 취급
- 기본 임베딩: `embeddinggemma-300M` — 영어 편향. 한국어 리콜 약함.
- **환경변수 대안**: `QMD_EMBED_MODEL=hf:Qwen/Qwen3-Embedding-0.6B-GGUF/...`로 119개 언어 모델 교체 (`README.md:495-507`).
- 임베딩 모델 변경 시 `qmd embed -f`로 전량 재임베딩 필요(벡터가 cross-compatible하지 않음).
- FTS5 tokenizer는 `porter unicode61` (`store.ts:837`) — 한국어 어간 분석은 부족하지만 unicode는 처리됨.

---

## 5. LLM 사용 패턴 ⭐⭐⭐

### 5.1 모델 세 벌 (`src/llm.ts:196-199`)
| 역할 | 기본 모델 | 크기 | 용도 |
|---|---|---|---|
| Embedding | `ggml-org/embeddinggemma-300M-GGUF` | ~300MB | 문서·쿼리 벡터화 |
| Reranker | `ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF` | ~640MB | 문서-쿼리 관련도 점수 |
| Generate (쿼리 확장) | `tobil/qmd-query-expansion-1.7B-gguf` | ~1.1GB | lex/vec/hyde 변형 생성 (자체 파인튜닝) |

모두 **HuggingFace URI 형태**(`hf:user/repo/file.gguf`)로 명시, `~/.cache/qmd/models/`에 lazy 다운로드 (`src/llm.ts:229-237`).

### 5.2 호출 위치
1. **`searchVec(query)`** → `embed(formatQueryForEmbedding(q))` 1회 (`store.ts:3099-3103`).
2. **`expandQuery(q, intent?)`** → `LlamaChatSession.prompt(...)` 1회 (`llm.ts:1131-1218`). BM25가 강한 시그널을 주면 **스킵**(`hybridQuery`의 Step 1, `store.ts:4024-4043`).
3. **`rerank(q, docs)`** → `createRankingContext().rankAll()` 배치 병렬 (`llm.ts:1226-1319`).
4. **MCP `initialize` 시**: `buildInstructions(store)`로 현재 인덱스 상태를 시스템 메시지처럼 주입 (`mcp/server.ts:109-168`). **호출 없이도 LLM에게 컨텍스트 제공**.

### 5.3 프롬프트 패턴

#### 쿼리 확장 (`llm.ts:1141-1177`)
```
/no_think Expand this search query: {query}
Query intent: {intent}
```
- `/no_think`는 Qwen3의 "chain-of-thought 비활성화" 지시어. 이를 썼기에 `<think>...</think>` 블록이 생성되지 않고 즉시 lex/vec/hyde 출력.
- **llama.cpp grammar**로 출력 포맷을 강제:
```
root ::= line+
line ::= type ": " content "\n"
type ::= "lex" | "vec" | "hyde"
content ::= [^\n]+
```
이게 핵심. GBNF(grammar)로 "출력은 반드시 lex/vec/hyde 프리픽스 줄"을 보장해 파싱 안정성을 얻음.
- 디코딩: `temp=0.7, topP=0.8, topK=20, presencePenalty=0.5, maxTokens=600`. "greedy는 infinite loop" 경고 주석(`llm.ts:1164-1176`).
- 후처리: 생성된 라인 중 원본 쿼리 term이 하나도 없는 줄은 버림(`hasQueryTerm`). 안전장치.

#### 리랭킹 (`llm.ts:1226-1319`)
- 모델의 `createRankingContext()` 사용 → yes/no 판정 + logprob 기반 0~1 점수 (README:936 설명).
- Intent가 있으면 `rerankQuery = intent + "\n\n" + query`로 프롬프트 선두에 붙임 (`store.ts:3298-3299`).
- 토큰 예산: `context_size(4096) - template_overhead(512) - query_tokens` = 문서 잘림 예산. 초과 시 `tokenize() → slice() → detokenize()`로 잘라냄.
- 중복 텍스트는 한 번만 스코어링 후 매핑(`textToDocs` 맵).
- 여러 context(병렬)에 나누어 `Promise.all(...rankAll(chunk))` 병렬 실행 — GPU 활용 극대화.

#### 임베딩 (`llm.ts:38-58`)
- EmbeddingGemma: `task: search result | query: {q}` (쿼리) / `title: {t} | text: {body}` (문서).
- Qwen3-Embedding: `Instruct: Retrieve relevant documents for the given query\nQuery: {q}` — **모델별로 포맷을 분기**.

### 5.4 문서와 LLM의 통합 방식
- **질문·답변(QA)은 직접 구현하지 않음.** qmd는 "리트리버"만 담당. LLM 쪽이 MCP로 검색 결과를 받아 답변.
- 쿼리 확장(pre-retrieval)과 리랭킹(post-retrieval)만이 LLM 호출.
- 요약/설명 생성 없음. 즉 qmd는 전형적인 "RAG의 R"만 담당하는 설계.
- **캐시**: `llm_cache` 테이블에 쿼리 확장 + 리랭커 점수 모두 SHA256 키로 저장 (`store.ts:3258-3339`). 같은 쿼리/청크 조합이면 LLM 재호출 없음.

### 5.5 세션/모델 수명 관리
- `LlamaCpp` 인스턴스: per-store. 모델은 lazy 로드.
- **5분 idle 후 자동 dispose** (`src/index.ts:373-376`). VRAM 해제.
- HTTP 서버 모드에서 매 요청마다 모델이 다시 필요하면 ~1초 재생성, 모델은 여전히 로드 상태.
- 제거 시 `llama.dispose()`를 1초 timeout과 race (`llm.ts:1366-1370`). "dispose가 무한 대기할 수 있다"는 실무적 관찰.

### 5.6 HyDE (Hypothetical Document Embedding)
- 사용자가 직접 `hyde: {50-100 words}`를 써서 **답변의 모습**을 임베딩에 넣음. 질문 벡터보다 문서 벡터에 가까워 recall이 좋아짐.
- 쿼리 확장 모델이 hyde 라인을 자동 생성 가능.
- hyde 라인도 `searchVec`으로 라우팅(lex는 FTS, vec/hyde는 vector) (`store.ts:3284`, `store.ts:4084`).

---

## 6. 임베딩 & 벡터 검색 ⭐⭐⭐

### 6.1 스토리지
- **SQLite-vec 확장** (`vectors_vec` 가상 테이블, vec0). (`store.ts:1080`)
```sql
CREATE VIRTUAL TABLE vectors_vec USING vec0(
  hash_seq TEXT PRIMARY KEY,
  embedding float[${dimensions}] distance_metric=cosine
)
```
- 동반 테이블 `content_vectors (hash, seq, pos, model, embedded_at)`로 메타 저장. `PRIMARY KEY (hash, seq)`.
- 벡터는 **콘텐츠 해시 기반 주소 저장**. 같은 내용의 파일이 여러 경로에 있어도 임베딩은 1회만.

### 6.2 MD 문서 청킹 → 임베딩 파이프라인
1. 문서 본문을 `chunkDocumentAsync(body, filepath, chunkStrategy)`로 자름.
2. 각 청크를 `formatDocForEmbedding(text, title)`로 포맷.
3. `llm.embedBatch(texts)`로 배치 임베딩.
4. 각 `(hash, seq)`에 대해 `insertEmbedding()`:
   - `content_vectors`에 먼저 INSERT (crash 안전).
   - `vectors_vec`에 `DELETE + INSERT` (vec0가 `OR REPLACE`를 지원 안함, `store.ts:3247`).
5. 배치 크기: `DEFAULT_EMBED_MAX_DOCS_PER_BATCH = 64`, `DEFAULT_EMBED_MAX_BATCH_BYTES = 64MB` (`store.ts:47-48`).

### 6.3 sqlite-vec의 함정과 해결책 (`store.ts:3106-3150`)
```
// IMPORTANT: We use a two-step query approach here because sqlite-vec virtual tables
// hang indefinitely when combined with JOINs in the same query.
```
- **버그**: `vectors_vec`에 JOIN을 걸면 무한 hang (qmd PR #23 참조).
- **해결**: 먼저 벡터만 매칭 → `hash_seq` 리스트 얻어서 → 별도 쿼리로 `documents`/`content`에 IN 절로 조회.

### 6.4 검색 배치 최적화 (`store.ts:4079-4118`)
```
// 3b: Collect all texts that need vector search (original query + vec/hyde expansions)
const vecQueries = [{text: query, queryType: "original"}, ...expanded.filter(vec|hyde)];
const embeddings = await llm.embedBatch(textsToEmbed);  // 1 batch call
for (let i = 0; i < vecQueries.length; i++) {
  // sqlite-vec lookups with pre-computed embeddings (sequential)
}
```
**배치 임베딩 → 순차 KNN**: node-llama-cpp의 embed는 배치가 빠름. DB 쪽은 JOIN 금지라 순차.

### 6.5 RAG 구현
- qmd 자체는 **R만 제공**. 검색 결과를 LLM에 주는 것은 호스트(Claude Desktop/Code) 책임.
- 결과에 `bestChunk` + `bestChunkPos`를 포함해, 재사용 시 전체 문서가 아닌 "가장 관련도 높은 청크"를 LLM에 넣을 수 있게 함 (`store.ts:3971-3982`).
- Snippet 추출이 쿼리 term + intent term 동시 매칭 라인을 우선 (`store.ts:3867-3883`).

### 6.6 차원/모델 일관성 검증
- 벡터 저장 시 차원 기록, 불일치 시 명시적 에러 (최신 변경, CHANGELOG #501).
- 모델 변경 감지: 처음 insert 시 `dimensions`로 테이블 생성. 이후 불일치하면 rebuild 요구 에러.

---

## 7. 쿼리/검색 기능 ⭐⭐ (사실상 ⭐⭐⭐⭐⭐ — qmd의 핵심)

### 7.1 쿼리 문법 (`docs/SYNTAX.md:6-19`)
```ebnf
query          = expand_query | query_document ;
expand_query   = text | explicit_expand ;
explicit_expand= "expand:" text ;
query_document = [ intent_line ] { typed_line } ;
intent_line    = "intent:" text newline ;
typed_line     = type ":" text newline ;
type           = "lex" | "vec" | "hyde" ;
```

### 7.2 세 검색 모드
| 모드 | 커맨드 | 내부 경로 |
|---|---|---|
| BM25만 | `qmd search` | `searchFTS` |
| 벡터만 | `qmd vsearch` | `vectorSearchQuery` (expandQuery의 vec/hyde만) |
| 하이브리드 | `qmd query` | `hybridQuery` — 본격 파이프라인 |

### 7.3 FTS5 BM25 구현
- 테이블: `documents_fts USING fts5(filepath, title, body, tokenize='porter unicode61')` (`store.ts:834-839`).
- 필드 가중치: `bm25(documents_fts, 1.5, 4.0, 1.0)` — filepath=1.5, title=4.0, body=1.0 (`store.ts:3042`).
- 쿼리 파서 `buildFTS5Query()` (`store.ts:2919-2998`):
  - `term` → `"term"*` (prefix match)
  - `"phrase"` → `"phrase"` (exact)
  - `-term` → `NOT "term"*` (FTS5의 binary NOT 필요 → positive term 없으면 무효)
  - `multi-agent` → `"multi agent"` (하이픈 분리 phrase)
  - 한국어 등 unicode는 `sanitizeFTS5Term`에서 `[\p{L}\p{N}'_]`만 유지.
- 점수 정규화: `|bm25_score| / (1 + |bm25_score|)`로 `[0, 1)`에 매핑 (`store.ts:3077`).

### 7.4 CTE 트릭 (`store.ts:3040-3067`)
```sql
WITH fts_matches AS (
  SELECT rowid, bm25(documents_fts, 1.5, 4.0, 1.0) as bm25_score
  FROM documents_fts WHERE documents_fts MATCH ?
  ORDER BY bm25_score ASC LIMIT ${ftsLimit}
)
SELECT ... FROM fts_matches fm
JOIN documents d ON d.id = fm.rowid
...
```
**주석**: "CTE 없이 FTS5 MATCH + collection filter를 single WHERE로 합치면 plan이 full scan으로 회귀해 8ms → 17초가 된다." SQLite 쿼리 플래너 함정에 대한 실전 노하우.

### 7.5 Query Expansion (fine-tuned LLM)
- 입력: 원본 쿼리(+ 선택적 intent).
- 출력: `{type: 'lex'|'vec'|'hyde', query: string}[]`.
- 저자가 Qwen3-1.7B를 **SFT 파인튜닝**한 전용 모델을 HuggingFace에 공개(`tobil/qmd-query-expansion-1.7B-gguf`).
- 학습 데이터: ~2290 examples, 8 categories, reward function은 rule-based (format + diversity + entity preservation + hyde quality).
- 120+ 점 만점 스코어링 룰 `finetune/reward.py` (`finetune/SCORING.md`).
- **Strong signal bypass** (`store.ts:4024-4034`):
  - BM25 probe 결과 top score ≥ 0.85 AND gap ≥ 0.15 → 쿼리 확장 **스킵**.
  - Intent가 있으면 bypass 비활성화 (정확 매치가 사용자 의도와 다를 수 있음).

### 7.6 Reciprocal Rank Fusion (RRF) (`store.ts:3346-3389`)
```typescript
const rrfContribution = weight / (k + rank + 1);  // k = 60
// Top-rank bonus:
if (topRank === 0) rrfScore += 0.05;
else if (topRank <= 2) rrfScore += 0.02;
```
- 여러 결과 리스트(original BM25 + lex expansions BM25 + original vec + vec/hyde expansions)를 RRF로 통합.
- **첫 두 리스트(원본 FTS + 원본 vec)에 weight 2x** (`store.ts:4122`).
- 상위 랭크 보너스: "여러 리스트에서 1위면 +0.05" — 강한 합치 시그널 보호.

### 7.7 Position-Aware Blend (`store.ts:4220-4234`)
```typescript
let rrfWeight;
if (rrfRank <= 3) rrfWeight = 0.75;
else if (rrfRank <= 10) rrfWeight = 0.60;
else rrfWeight = 0.40;
const blendedScore = rrfWeight * rrfScore + (1 - rrfWeight) * r.score;
```
- 핵심 아이디어: **RRF 상위 결과일수록 리랭커 의견 가중치를 낮춤**. 이유(README:462): "pure RRF는 리랭커가 상위 정확 매치를 망칠 수 있다. 포지션 가중으로 보호."

### 7.8 Intent 시스템
- Intent는 **검색하지 않고 스티어링만**:
  - 쿼리 확장 프롬프트에 `"Query intent: ..."` 추가.
  - 리랭커 쿼리 선두에 intent 삽입.
  - 스니펫/청크 선택의 키워드 매치에 `INTENT_WEIGHT_CHUNK = 0.5`, `INTENT_WEIGHT_SNIPPET`으로 가중.
- 예: 쿼리 `"performance"`, intent `"web page load times and Core Web Vitals"` → 스포츠 performance 문서가 아닌 웹 perf 문서로 편향.

### 7.9 필터/Facet
- **Collection 필터**: `-c notes` 또는 MCP `collections: ["docs", "notes"]` (OR 매치).
- **Score 필터**: `--min-score 0.3`.
- **글로브 필터**(multi-get): `journals/2025-*.md`.
- 태그/저자/작성일 facet은 없음 — 마크다운을 raw text로만 취급하므로 구조화 메타가 없음.

### 7.10 `--explain` 트레이스 (`store.ts:4167-4195`)
```typescript
{
  ftsScores: [...],
  vectorScores: [...],
  rrf: {
    rank, positionScore, weight, baseScore, topRankBonus, totalScore,
    contributions: [{source, queryType, query, rank, backendScore, weight}]
  },
  rerankScore, blendedScore
}
```
**LLM이 왜 특정 문서가 상위인지 전자현미경처럼 디버그 가능**. Jarvis의 검색 신뢰도 인터페이스 구성에 참고할 만.

---

## 8. 데이터 파이프라인

### 8.1 MD 파일 → 처리 → 저장
```
filesystem (collection/**/*.md)
  ↓ fast-glob + picomatch
  ↓ reindexCollection()
  ├── readFile → SHA256 hash
  │   ├── unchanged → skip
  │   └── changed → next
  ├── INSERT content(hash, doc)  ← 내용 중복 제거
  ├── UPSERT documents(collection, path, title, hash, active=1)
  │   ├── UNIQUE(collection, path) 제약
  │   └── AFTER INSERT/UPDATE/DELETE 트리거로 documents_fts 자동 동기화
  └── (필요 시) qmd embed
      ├── getHashesForEmbedding() ← 아직 벡터 없는 해시
      ├── chunkDocument(body)
      ├── llm.embedBatch(chunks)
      └── INSERT content_vectors + vectors_vec
```

### 8.2 파일시스템 vs DB
- **파일시스템이 SoT**: 편집은 사용자가 IDE에서, qmd는 SHA256으로 변경 감지.
- **DB는 캐시+인덱스**: `~/.cache/qmd/index.sqlite` 하나에 전부. 삭제해도 재인덱싱 가능.
- **content-addressable**: 동일 내용 파일이 여러 경로에 있어도 `content(hash)` 한 줄만. `documents`는 many-to-one.
- **Active flag**: `documents.active = 0`으로 soft delete. `qmd cleanup`이 진짜 제거 (`maintenance.ts`).

### 8.3 트리거 패턴 (`store.ts:842-877`)
```sql
CREATE TRIGGER documents_ai AFTER INSERT ON documents
WHEN new.active = 1
BEGIN
  INSERT INTO documents_fts(rowid, filepath, title, body)
  SELECT new.id, new.collection||'/'||new.path, new.title,
         (SELECT doc FROM content WHERE hash = new.hash)
  WHERE new.active = 1;
END
```
- FTS는 triggerloop로 완전 자동 동기화.
- 관찰: vec0(벡터) 테이블은 트리거로 동기화 **안 함** (embedding cost가 크기 때문). 별도 `qmd embed` 단계.

### 8.4 Collections 설정 저장 위치
- **이중 저장**:
  1. `~/.config/qmd/index.yml` (YAML, 사람이 편집)
  2. `store_collections` SQLite 테이블 (DB 자족성)
- `syncConfigToDb()` + `upsertStoreCollection()`로 양방향 동기화.
- SDK 사용 시 inline config만으로도 가능 (YAML 없이).

### 8.5 Git 통합
- `qmd update --pull`: 컬렉션에 `update: "git pull"` 명령 설정 시 수행 후 재인덱싱 (`collections.ts:33`). 문서가 원격 리포일 때 유용.

---

## 9. UI/UX 패턴

### 9.1 CLI UX
- **색상 & 링크**: TTY일 때 ANSI + OSC 8 하이퍼링크. 파이프 시엔 plain text (NO_COLOR 존중).
- **스코어 색상**: `>70%` 녹색, `>40%` 노랑, 나머지 흐림.
- **스니펫 헤더**: `@@ -start,count @@ (N before, M after)` 디프 스타일.
- **에러 UX**: 파일 not found 시 fuzzy 후보 제안 (`similarFiles`). levenshtein 기반.
- **진행 표시**: `onProgress` 콜백으로 current/total/file 이벤트. CLI는 stderr로 프린트.
- **docid**: 6자 해시 프리픽스(`#abc123`). LLM이 입력하기 쉬운 짧은 식별자.

### 9.2 MCP UX 디자인 (가장 참고 가치 높음)
- `initialize` 응답 `instructions`에 **동적 요약 주입** (`mcp/server.ts:109-168`):
  - 총 문서 수
  - 컬렉션 이름 + 문서 수 + 컨텍스트 설명
  - 벡터 인덱스 유무
  - lex/vec/hyde 사용법 + 인텐트 사용법
  - 재시도 팁 (minScore, context 필드)
- 이걸로 LLM이 첫 도구 호출 없이도 인덱스 상태를 안다. **"시스템 프롬프트에 자동 문서화된다"는 개념 자체가 훌륭.**

### 9.3 출력 포맷 (6가지)
- `cli`: 기본 컬러 출력 (터미널용).
- `json`: LLM이 먹기 좋은 구조화. `--explain`과 조합 가능.
- `csv`: 스프레드시트/스크립트.
- `md`: Heading + 스니펫 (LLM 컨텍스트에 직접 주입용).
- `xml`: 레거시/특정 agent.
- `files`: `docid,score,filepath,context` — 한 줄당 한 파일, parsing 쉬움.

### 9.4 Editor Integration
- `QMD_EDITOR_URI="vscode://file/{path}:{line}:{col}"`처럼 환경변수로 에디터 prefix.
- 결과의 path를 OSC 8 링크로 감싸 "클릭 → 정확한 라인으로 점프".
- 지원: VSCode, Cursor, Zed, Sublime (`README.md:695-709`).

### 9.5 GUI
- 없음. 완전 CLI + MCP. 사용자가 Claude Desktop UI를 쓰는 경우 MCP가 GUI 역할.

---

## 10. 강점

1. **End-to-end 로컬 실행**: 외부 SaaS 의존 0. 5000명 규모의 사내 데이터를 외부로 내보내지 않으려는 요구에 완벽 부합.
2. **Smart chunking (regex + AST)**: 의미 단위를 최대한 보존. 이 로직은 언어·스택 무관하게 이식 가능.
3. **Query expansion fine-tuned 모델**: 작은 OSS LLM이 안정적으로 lex/vec/hyde를 뱉도록 **데이터셋·reward·학습 스크립트 전부 공개**. 직접 재현·개선 가능.
4. **Strong-signal bypass**: "정확한 BM25 매치면 LLM 호출 스킵" — latency/비용 최적화의 모범.
5. **Position-aware RRF × rerank blend**: 순수 RRF의 리랭커 오염 문제를 깔끔하게 보완. 이 blending 공식은 수학적으로 **그대로 이식 가능**.
6. **`--explain` 트레이스**: 관찰 가능성. 왜 이 문서가 상위인지 분해 가능. 디버그 도구로서 훌륭.
7. **SQLite 하나로 끝**: FTS5 + vec0 + 메타 + 캐시 전부. backup/restore가 단일 파일 복사.
8. **Content-addressable storage**: 중복 파일 제거, hash 기반 캐시 hit.
9. **CTE 최적화, vec0 JOIN 회피 등 실전 노하우** — CHANGELOG와 주석에서 배울 것 많음.
10. **MCP `initialize instructions` 패턴**: LLM이 시스템 상태를 알고 시작하게 하는 메커니즘. 비용 0의 컨텍스트 주입.
11. **Intent 분리**: 검색하지 않고 스티어링하는 signal을 도입 — "performance"의 중의성 해결.
12. **Cache 키 설계**: 리랭커 캐시 키에서 파일 경로 제외, **chunk text 기반**. 같은 청크가 여러 파일에 있으면 1회만 스코어링.
13. **Claude Code Plugin + MCP**: `claude plugin install qmd@qmd`로 설치 원클릭. Jarvis도 내부 Claude Code 사용자용으로 이 패턴 차용 가능.

---

## 11. 약점 & 제약

1. **단일 사용자 전제**: 인덱스는 `~/.cache/qmd/index.sqlite` 로컬 파일 1개. **멀티 테넌시/RBAC 전무**. 5000명 공유 사용이 이 코드로는 불가능.
2. **권한·감사 로그 없음**: sensitivity 레벨, 부서별 접근 제어, 누가 뭘 검색했는지 추적 — 전무.
3. **On-device LLM**: 5000명이 각자 GPU를 쓰기엔 인프라 비현실. 서버 중앙 집중식 추론이 필요(Jarvis는 이미 OpenAI API 기반 → qmd의 node-llama-cpp 부분은 **제거/대체**해야 함).
4. **마크다운만**: PDF/docx/HTML 기본 미지원. 회의록·사내 문서가 이미 다른 포맷이면 ingestion 파이프라인 필요.
5. **MD 파서 없음**: 프론트매터, wikilink, 셀(테이블) 등 구조화 메타 무시. 한국 기업 위키(Confluence 등)에서 자주 쓰는 메타데이터를 그대로 손실.
6. **인덱스 업데이트는 수동/폴링**: 실시간 파일 감시 없음. 문서 수정 후 `qmd update` 필요. Next.js 모놀리스에서는 이벤트 기반(webhook, pg LISTEN 등)이 필요.
7. **한국어 tokenization**: `porter unicode61`은 형태소 분석 없음. "개발자의"와 "개발자" 매칭이 어색할 수 있음.
8. **170KB 단일 파일 `store.ts`**: 모노리식. 팀이 커지면 코드 오너십/충돌 이슈.
9. **Qwen3 grammar 결합도**: 쿼리 확장 grammar가 Qwen3 전용. 다른 LLM(OpenAI 함수 콜) 이식 시 grammar 대신 JSON mode로 바꿔야.
10. **노출되는 정보 없음**: 검색 API에 "왜 이 문서를 볼 권한 있나" 같은 ACL 로직이 없음. Jarvis 보안 모델과 상충.
11. **Intent/expand 프롬프트 언어**: 영어 전제. 한국어 질의에 대한 확장 품질은 검증 부족 (영어 SFT 데이터로 학습됨).
12. **벡터 리인덱싱 비용**: 모델 교체 시 `qmd embed -f`로 전량 재임베딩. 수백만 문서면 상당한 비용.
13. **테스트 커버리지**: 엄청나게 많은 test 파일이 있으나 Windows/한국어/대규모 환경 검증은 불명확.
14. **MCP 1서버 = 1 DB**: 멀티 인덱스 분리는 `qmd --index <name>`이지만 MCP 프로세스는 1 DB만 연다. Jarvis의 "공용 지식 + 개인 지식" 분리에 부합하지 않음.

---

## 12. Jarvis 통합 가능성 평가 ⭐⭐⭐⭐⭐

### 12.1 전체 가져오기 가능?
**불가능 / 권장하지 않음.** 이유:
- qmd는 "단일 사용자 로컬 CLI". Jarvis는 "5000명 웹 포털". 근본 운영 모델이 다름.
- qmd의 핵심 LLM 부분(`node-llama-cpp`)이 on-device 전용 → Jarvis의 서버리스/컨테이너 환경에서 동일하게 쓰기 어려움 (VRAM, 모델 배포, 멀티 요청 동시성).
- Jarvis는 이미 pgvector + OpenSearch라는 서버 기반 스택 결정. qmd의 SQLite는 그 포지션을 뺏을 수 없음.

**그러나 아이디어·알고리즘·코드 단편은 극도로 가치가 있다.** 아래 Top 5로 계층화.

### 12.2 핵심 아이디어 Top 5 (Jarvis 도입 우선순위)

#### ⭐⭐⭐⭐⭐ Idea #1 — 하이브리드 검색 파이프라인 구조 (BM25 + Vec + Expand + RRF + Position-Aware Rerank)

**Jarvis에 맞게 매핑**:
| qmd 구성요소 | Jarvis 대응 |
|---|---|
| SQLite FTS5 BM25 | **OpenSearch** (이미 확보). `multi_match` + BM25. |
| sqlite-vec 벡터 검색 | **pgvector** (이미 확보). `cosine_distance <->`. |
| `node-llama-cpp` expandQuery | **OpenAI gpt-4o-mini**로 교체. `response_format: json_schema`로 lex/vec/hyde 추출. |
| `node-llama-cpp` rerank | **OpenAI reranker 대안**: Cohere Rerank API 또는 gpt-4o-mini로 y/n 평가 (프롬프트 재설계 필요). |
| RRF + top-rank bonus | **그대로 이식**. 숫자만 상수. |
| Strong-signal BM25 bypass | **그대로 이식**. Top score ≥ 0.85 + gap ≥ 0.15 시 expansion 스킵 → 비용 절감. |
| Position-aware blend (0.75/0.60/0.40) | **그대로 이식**. 리랭커가 상위 정확 매치를 망치지 않게. |
| Intent 신호 | **그대로 도입**. "회사명 동음이의어"가 많은 한국 기업 환경에 가치. |

**예상 코드 위치**: `packages/search/src/hybrid.ts` (신규 패키지). 의존성: `pg`, `@opensearch-project/opensearch`, `openai`.

---

#### ⭐⭐⭐⭐⭐ Idea #2 — Smart Chunking 알고리즘 (regex + AST + 거리 감쇠)

**가장 바로 이식 가능한 부분**. 언어·런타임 독립.

**Jarvis에 맞게**:
- `packages/chunker`로 신규 패키지.
- 의존성: `web-tree-sitter`(이미 OSS), 필요 grammar(`tree-sitter-python/go/typescript/rust` — Jarvis가 코드 인덱싱을 원한다면).
- Jarvis 위키가 주로 한국어 MD라면 regex chunking만으로 충분. AST는 옵트인.
- 900 tokens → 코드에 따라 tiktoken 등으로 정확한 토큰 카운트 가능 (qmd는 4 chars/token 근사).

**바로 이식 가능한 함수 (합계 ~300 줄)**:
- `BREAK_PATTERNS`, `scanBreakPoints()`, `findCodeFences()`, `isInsideCodeFence()`, `findBestCutoff()`, `mergeBreakPoints()`, `chunkDocumentWithBreakPoints()` — `src/store.ts:97-307`.
- `detectLanguage()`, `getASTBreakPoints()` — `src/ast.ts`.
- 전부 순수 함수. 테스트도 그대로 포팅 가능(`test/ast.test.ts`, `test/ast-chunking.test.ts`).

---

#### ⭐⭐⭐⭐⭐ Idea #3 — Intent 시스템 (검색 아닌 스티어링)

Jarvis에서 **사내 용어 중의성**(예: "성과" = 인사평가 vs. 프로젝트 결과 vs. 시스템 성능) 해결에 크리티컬.

**구현**:
- 검색 API에 `intent?: string` 옵션 추가.
- 쿼리 확장 프롬프트에 `Query intent: {intent}` 추가.
- 리랭커 프롬프트 선두에 intent 삽입.
- 스니펫/청크 선택 시 intent term을 0.5 가중치로 매칭.
- UI: "세부 조건"이나 "어떤 맥락에서 찾나요?" 소프트 입력 필드.

---

#### ⭐⭐⭐⭐ Idea #4 — MCP initialize instructions 패턴 (AI 라우팅)

Jarvis의 **Ask AI 채널**이 MCP 또는 유사 프로토콜을 쓴다면 그대로 적용.

**핵심**: 봇에게 "이 인덱스에 어떤 컬렉션·문서·컨텍스트가 있는가"를 **첫 호출 전에 시스템 프롬프트로 주입**. 봇이 맹목적 검색을 덜 하고 적절한 `collection` 파라미터를 스스로 선택하게 만든다.

**Jarvis 대응**:
- `apps/web/app/api/mcp/[...slug]/route.ts`(또는 별도 서비스).
- `buildInstructions()` 함수가 DB에서 "회사 부서 목록 + 문서 카테고리 + 최근 업데이트" 동적 요약.
- 5000명 환경이므로 user/role별 컨텍스트 필터링 필요 (qmd에는 없음).

---

#### ⭐⭐⭐⭐ Idea #5 — LLM 캐시 설계 (`llm_cache` SHA256 기반)

qmd의 `setCachedResult / getCachedResult` 패턴 그대로 도입 가능. 차이는 저장소.

**Jarvis 대응**:
- PostgreSQL 테이블 `llm_cache(key TEXT PK, result TEXT, created_at, ttl_seconds)`.
- Key는 `SHA256(JSON.stringify({op, model, prompt, params}))`.
- 쿼리 확장, 리랭킹, 요약 등 "동일 입력 → 동일 출력" 호출 전부 캐시.
- 특히 **리랭커 캐시는 chunk text 기준** — 같은 청크가 여러 문서에 복사됐을 때 한 번만 LLM 호출 (qmd의 `store.ts:3310` 설계 참고).
- TTL 만료는 pg-boss `cache-cleanup` cron (6h)으로 처리.

**비용 절감 추정**: 같은 쿼리 재실행, 유사 쿼리 expansion, 인기 문서 리랭킹 — 20~60% 호출 절감 가능.

---

### 12.3 추가 가치 (Tier 2 아이디어)

#### ⭐⭐⭐ Idea #6 — Docid (6-char hash) 패턴
LLM이 파일 경로를 오타 없이 참조하기 어려움 → `#a1b2c3` 6자 해시로 참조. Jarvis의 AI 답변에서 "이 문서 참고" 링크를 이 패턴으로 제공.

#### ⭐⭐⭐ Idea #7 — `--explain` 트레이스
**검색 디버그 화면**을 관리자가 볼 수 있게. "왜 이 문서가 1위?" 답 가능. RRF 기여도 + 리랭커 점수 + 최종 blend 값 시각화.

#### ⭐⭐⭐ Idea #8 — Content-addressable storage
Jarvis 문서가 여러 경로·카피로 올라올 때(첨부 재업로드, 템플릿 복제) **내용 해시 단일화**로 임베딩·벡터 비용 절감.

#### ⭐⭐⭐ Idea #9 — Collection context (메타 설명)
`qmd context add docs/api "REST API 참조"` 같은 메타 텍스트를 검색 결과에 **그대로 덧붙여** LLM이 문서 맥락을 바로 안다. Jarvis의 "부서·문서 유형" 표기를 AI 프롬프트에 자동 병합.

#### ⭐⭐ Idea #10 — Top-N candidateLimit + 청크 기반 리랭킹
**전체 문서가 아닌 best chunk만 리랭커에 전달**. Jarvis 토큰 비용 절감 핵심. `RERANK_CANDIDATE_LIMIT = 40`, 각 문서는 query term 매치가 가장 많은 청크 1개만 전달.

#### ⭐⭐ Idea #11 — FTS5 쿼리 파서 패턴 (prefix match, phrase, negation, 하이픈 처리)
OpenSearch query DSL로 맵핑. `"quote"`, `-term`, `multi-agent` 규칙을 그대로 지원하면 UX 일관성.

#### ⭐⭐ Idea #12 — Fine-tuning harness (Python/UV/LoRA)
**Jarvis가 OpenAI → 자체 모델 마이그 검토 시** 참고. `finetune/`는 SFT 레시피, reward 함수, eval harness 전부 포함. 우리 자체 데이터로 Qwen3-X를 학습하고 싶으면 틀이 있음.

#### ⭐⭐ Idea #13 — HyDE 쿼리 타입
"답이 어떻게 생겼을지"를 사용자가 직접 써서 벡터 검색의 recall 개선. Jarvis UI에 "예시 답변을 써보세요" 옵션.

### 12.4 재사용 가능한 코드/모듈 (구체)

| qmd 코드 | Jarvis 위치 제안 | 노력 | 비고 |
|---|---|---|---|
| `src/store.ts:97-307` (smart chunking) | `packages/chunker/src/regex.ts` | 1일 | 순수 함수, 테스트 포함 이식 |
| `src/ast.ts` 전체 | `packages/chunker/src/ast.ts` | 2일 | tree-sitter 의존성 추가 |
| `src/store.ts:3346-3389` (RRF) | `packages/search/src/rrf.ts` | 2시간 | 40줄, 단순 이식 |
| `src/store.ts:2874-2998` (FTS5 파서) → OpenSearch 변환 | `packages/search/src/query-parser.ts` | 1일 | 문법 유지, 백엔드만 교체 |
| `src/store.ts:3848-3914` (extractSnippet) | `packages/search/src/snippet.ts` | 반나절 | diff 헤더 포함 |
| `src/store.ts:getCacheKey + getCached/setCached` | `packages/llm/src/cache.ts` | 반나절 | PG (`embed_cache` 테이블) 백엔드로 교체 |
| `src/mcp/server.ts:buildInstructions` | `apps/web/app/api/mcp/instructions.ts` | 1일 | DB 쿼리로 동적 생성 |
| `src/llm.ts:1141-1218` (expandQuery 프롬프트) → OpenAI 구조화 출력 | `packages/llm/src/expand-query.ts` | 반나절 | json_schema + lex/vec/hyde 필드 |
| `finetune/reward.py` | `docs/eval/rubric.md`로 문서화 | 반나절 | 쿼리 확장 eval rubric |
| `src/bench/score.ts` (precision@k, MRR, F1) | `packages/search/src/bench.ts` | 1일 | 기본 IR 메트릭 |

### 12.5 충돌 지점

1. **node-llama-cpp 제거 필수**: Jarvis는 OpenAI API 기반. qmd의 GGUF 로딩 전부 치환.
2. **SQLite → PG/OpenSearch**: 인덱스 스토리지 전부 다름. 테이블 스키마 재설계 필요 (`content` / `documents` / `documents_fts` / `content_vectors` → PG `content_hashes`, `documents`, OpenSearch index, `pgvector.embeddings`).
3. **File watching**: qmd는 수동 `qmd update`. Jarvis는 실시간성 필요. Inotify/chokidar 또는 업로드 이벤트 기반.
4. **CLI 대 Web API**: qmd의 사용자 인터페이스는 bash. Jarvis는 Next.js route handlers. `store.ts`의 `hybridQuery()`는 그대로 함수인데, 호출 레이어(HTTP 라우팅/세션/권한)는 새로.
5. **Single-tenant 가정**: qmd 도처에 "current user"가 없다. Jarvis는 매 호출에 userId/sensitivity가 붙어야.
6. **Embedding 모델**: Jarvis의 OpenAI text-embedding-3-large(3072차원) vs. qmd의 embeddinggemma(768차원). pgvector는 임의 차원 OK, 코드만 맞추면 됨.
7. **Collections 개념 ≠ Jarvis 권한 모델**: qmd의 collection은 "폴더 = 범주". Jarvis는 부서/프로젝트/문서타입 크로스. 다대다 매핑 테이블 필요.
8. **Grammar-constrained decoding 비가용**: OpenAI는 GBNF 미지원. 대신 JSON schema / tool use로 lex/vec/hyde 출력 강제.

### 12.6 통합 난이도 (제안)

| 제안 | 난이도 | 효과 | 권장 순서 |
|---|---|---|---|
| Smart chunking 이식 | ★★ | ★★★★ | 1 |
| RRF + position-aware blend | ★ | ★★★★★ | 2 |
| Strong-signal BM25 bypass | ★ | ★★★ (비용 절감) | 3 |
| Query expansion (OpenAI json_schema) | ★★★ | ★★★★ | 4 |
| Intent 스티어링 | ★★ | ★★★★ | 5 |
| Chunk 기반 리랭킹 (not 전체 문서) | ★★ | ★★★★ (비용 절감) | 6 |
| LLM 캐시 테이블 | ★★ | ★★★★ | 7 |
| MCP instructions 패턴 | ★★★ | ★★★★ (Ask AI 품질) | 8 |
| `--explain` 트레이스 + 관리자 UI | ★★★ | ★★★ | 9 |
| Content-addressable storage | ★★★ | ★★ | 10 |
| 자체 expand 모델 파인튜닝 | ★★★★★ | ★★ (아직 불필요) | 후순위 |

---

## 13. 재사용 가능한 핵심 코드 스니펫

### 13.1 RRF Fusion (그대로 이식 가능, `src/store.ts:3346-3389`)
```typescript
export function reciprocalRankFusion(
  resultLists: RankedResult[][],
  weights: number[] = [],
  k: number = 60
): RankedResult[] {
  const scores = new Map<string, { result: RankedResult; rrfScore: number; topRank: number }>();

  for (let listIdx = 0; listIdx < resultLists.length; listIdx++) {
    const list = resultLists[listIdx];
    if (!list) continue;
    const weight = weights[listIdx] ?? 1.0;

    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      if (!result) continue;
      const rrfContribution = weight / (k + rank + 1);
      const existing = scores.get(result.file);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.topRank = Math.min(existing.topRank, rank);
      } else {
        scores.set(result.file, { result, rrfScore: rrfContribution, topRank: rank });
      }
    }
  }

  // Top-rank bonus: 강한 합치 시그널 보호
  for (const entry of scores.values()) {
    if (entry.topRank === 0) entry.rrfScore += 0.05;
    else if (entry.topRank <= 2) entry.rrfScore += 0.02;
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(e => ({ ...e.result, score: e.rrfScore }));
}
```

### 13.2 Position-Aware Score Blend (`src/store.ts:4220-4234`)
```typescript
const blended = reranked.map(r => {
  const rrfRank = rrfRankMap.get(r.file) || candidateLimit;
  let rrfWeight: number;
  if (rrfRank <= 3) rrfWeight = 0.75;        // 최상위: 리랭커 의견 약하게 반영
  else if (rrfRank <= 10) rrfWeight = 0.60;  // 중상위: 중간
  else rrfWeight = 0.40;                      // 하위: 리랭커 강하게 신뢰
  const rrfScore = 1 / rrfRank;
  const blendedScore = rrfWeight * rrfScore + (1 - rrfWeight) * r.score;
  return { ...r, score: blendedScore };
}).sort((a, b) => b.score - a.score);
```

### 13.3 Smart Chunking 핵심 (`src/store.ts:97-224`)
```typescript
export const BREAK_PATTERNS: [RegExp, number, string][] = [
  [/\n#{1}(?!#)/g, 100, 'h1'], [/\n#{2}(?!#)/g, 90, 'h2'], [/\n#{3}(?!#)/g, 80, 'h3'],
  [/\n#{4}(?!#)/g, 70, 'h4'], [/\n#{5}(?!#)/g, 60, 'h5'], [/\n#{6}(?!#)/g, 50, 'h6'],
  [/\n```/g, 80, 'codeblock'], [/\n(?:---|\*\*\*|___)\s*\n/g, 60, 'hr'],
  [/\n\n+/g, 20, 'blank'], [/\n[-*]\s/g, 5, 'list'],
  [/\n\d+\.\s/g, 5, 'numlist'], [/\n/g, 1, 'newline'],
];

export function findBestCutoff(
  breakPoints: BreakPoint[], targetCharPos: number,
  windowChars: number = 800, decayFactor: number = 0.7,
  codeFences: CodeFenceRegion[] = []
): number {
  const windowStart = targetCharPos - windowChars;
  let bestScore = -1, bestPos = targetCharPos;
  for (const bp of breakPoints) {
    if (bp.pos < windowStart) continue;
    if (bp.pos > targetCharPos) break;
    if (isInsideCodeFence(bp.pos, codeFences)) continue;
    const distance = targetCharPos - bp.pos;
    const normalizedDist = distance / windowChars;
    const multiplier = 1.0 - (normalizedDist * normalizedDist) * decayFactor;
    const finalScore = bp.score * multiplier;
    if (finalScore > bestScore) { bestScore = finalScore; bestPos = bp.pos; }
  }
  return bestPos;
}
```

### 13.4 Strong-Signal Bypass (`src/store.ts:4024-4043`)
```typescript
const initialFts = store.searchFTS(query, 20, collection);
const topScore = initialFts[0]?.score ?? 0;
const secondScore = initialFts[1]?.score ?? 0;
const hasStrongSignal = !intent && initialFts.length > 0
  && topScore >= STRONG_SIGNAL_MIN_SCORE       // 0.85
  && (topScore - secondScore) >= STRONG_SIGNAL_MIN_GAP;  // 0.15

const expanded = hasStrongSignal ? [] : await store.expandQuery(query, undefined, intent);
```

### 13.5 MCP Initialize Instructions (`src/mcp/server.ts:109-168`)
```typescript
async function buildInstructions(store: QMDStore): Promise<string> {
  const status = await store.getStatus();
  const contexts = await store.listContexts();
  const globalCtx = await store.getGlobalContext();
  const lines: string[] = [];
  lines.push(`QMD is your local search engine over ${status.totalDocuments} markdown documents.`);
  if (globalCtx) lines.push(`Context: ${globalCtx}`);
  if (status.collections.length > 0) {
    lines.push("", "Collections (scope with `collection` parameter):");
    for (const col of status.collections) {
      const rootCtx = contexts.find(c => c.collection === col.name && (c.path === "" || c.path === "/"));
      const desc = rootCtx ? ` — ${rootCtx.context}` : "";
      lines.push(`  - "${col.name}" (${col.documents} docs)${desc}`);
    }
  }
  // ... lex/vec/hyde 사용법, tips 등
  return lines.join("\n");
}
```

### 13.6 Query Expansion Grammar (GBNF) — OpenAI JSON schema로 변환할 때 참조
```
root ::= line+
line ::= type ": " content "\n"
type ::= "lex" | "vec" | "hyde"
content ::= [^\n]+
```
OpenAI 대응:
```json
{
  "type": "object",
  "properties": {
    "expansions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {"enum": ["lex", "vec", "hyde"]},
          "query": {"type": "string"}
        },
        "required": ["type", "query"]
      }
    }
  }
}
```

### 13.7 SQLite 스키마 핵심 부분 (`src/store.ts:756-839`) — Jarvis PG 포팅 참고
```sql
CREATE TABLE content (
  hash TEXT PRIMARY KEY,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (hash) REFERENCES content(hash) ON DELETE CASCADE,
  UNIQUE(collection, path)
);
CREATE INDEX idx_documents_collection ON documents(collection, active);
CREATE INDEX idx_documents_hash ON documents(hash);

CREATE TABLE llm_cache (
  hash TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE content_vectors (
  hash TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  pos INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  embedded_at TEXT NOT NULL,
  PRIMARY KEY (hash, seq)
);

CREATE VIRTUAL TABLE documents_fts USING fts5(
  filepath, title, body,
  tokenize='porter unicode61'
);
-- + INSERT/UPDATE/DELETE 트리거로 동기화
```

### 13.8 Extract Snippet with Intent Weighting (`src/store.ts:3865-3883`)
```typescript
const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
const intentTerms = intent ? extractIntentTerms(intent) : [];
let bestLine = 0, bestScore = -1;
for (let i = 0; i < lines.length; i++) {
  const lineLower = (lines[i] ?? "").toLowerCase();
  let score = 0;
  for (const term of queryTerms) if (lineLower.includes(term)) score += 1.0;
  for (const term of intentTerms) if (lineLower.includes(term)) score += INTENT_WEIGHT_SNIPPET;
  if (score > bestScore) { bestScore = score; bestLine = i; }
}
```

### 13.9 Reranker Chunk Caching 패턴 (`src/store.ts:3304-3334`)
```typescript
// 캐시 키는 (query, model, chunk text) — 파일 경로 제외
// → 같은 청크가 여러 파일에 있으면 1회만 스코어링
for (const doc of documents) {
  const cacheKey = getCacheKey("rerank", { query: rerankQuery, model, chunk: doc.text });
  const cached = getCachedResult(db, cacheKey);
  if (cached !== null) cachedResults.set(doc.text, parseFloat(cached));
  else uncachedDocsByChunk.set(doc.text, { file: doc.file, text: doc.text });
}
```

---

## 14. 원저자의 설계 철학/교훈

### 14.1 "로컬 퍼스트, 제로 서비스 디펜던시"
- 모든 ML 추론을 on-device로. 외부 API 호출 없음(HuggingFace에서 모델만 받음).
- 데이터도 단일 SQLite. 백업은 파일 복사.
- **교훈**: Jarvis가 비록 서버 기반이지만, "의존성 최소화 + 단일 저장소" 철학은 유지할 가치 있음. 예: OpenSearch를 굳이 안 쓰고 pgvector만으로 하이브리드 시도해볼 수 있음(pg FTS + pgvector).

### 14.2 "CLI/MCP/SDK 세 종류 엔트리"
- 같은 `hybridQuery()` 함수를 CLI·MCP·SDK가 공유. DRY 극단.
- **교훈**: Jarvis의 검색 API도 `packages/search`로 코어 함수를 추출해 Next.js route + Ask AI + 스크립트에서 재사용.

### 14.3 "관찰 가능한 파이프라인"
- `SearchHooks` 인터페이스로 각 단계(expand, embed, rerank) 타이밍·메타를 캡처.
- `--explain`으로 RRF 기여도까지 분해.
- **교훈**: "왜 이 결과가 나왔나?" 대답 가능한 검색. Jarvis도 관리자용 explain 뷰를 만들자.

### 14.4 "실전에서 배운 SQLite 함정 주석화"
- `vec0` JOIN hang, FTS5 collection filter 쿼리 플래너 regression, `bm25` 필드 가중 오류 등이 전부 주석·CHANGELOG로 남음.
- **교훈**: Jarvis도 DB/검색 인프라 변경 시 **주석으로 이유를 남기는 관행**.

### 14.5 "Grammar로 LLM 출력 파싱을 깨지지 않게"
- GBNF grammar로 lex/vec/hyde 포맷 강제. `<think>` 블록 때문에 깨지지 않음.
- **교훈**: OpenAI에서도 `response_format` + JSON schema 활용. Free-form 생성 후 regex 파싱 금지.

### 14.6 "캐시 키는 변하지 않는 것만"
- 리랭커 캐시 키에서 파일 경로 제외 (chunk text가 같으면 점수 같음).
- **교훈**: 캐시 키 설계가 비용 절감의 핵심. 논리적 동일성만 반영.

### 14.7 "테스트 데이터가 파이프라인의 일부"
- `test/eval-deep-research.jsonl`, `test/eval-docs/`, `finetune/evals/queries.txt` — 실제 쿼리와 기대 결과가 리포에.
- 벤치마크 커맨드(`qmd bench`)가 자동화된 regression 가드.
- **교훈**: Jarvis 검색 품질 regression을 막을 eval harness + 골든 데이터셋 필수.

### 14.8 "파인튜닝도 오픈소스 일류 시민"
- `finetune/`에 SFT, LoRA 설정, HuggingFace Jobs 연계, reward 룩브릭, eval 모두 공개.
- 모델 릴리즈(GGUF) + 학습 스크립트를 같이.
- **교훈**: 자체 모델이 필요해진다면, 재현성 있는 학습 파이프라인을 처음부터 코드베이스에 둘 것.

### 14.9 "개발자 UX가 LLM UX"
- docid 6자, OSC 8 editor link, diff-style 스니펫 헤더 — **사람이 쓸 수 있으면 LLM도 쓸 수 있다**는 접근.
- **교훈**: Ask AI 응답에 "파일 링크 · 라인 · docid"를 노출해 사람·봇 모두 재참조 쉽게.

### 14.10 "문제가 될 수 있는 건 금지(CLAUDE.md)"
- `qmd/CLAUDE.md:150-154`: "bun build --compile 절대 금지 — 쉘 래퍼 덮어씀" 같은 실전 경고를 Claude Code에게 명시.
- **교훈**: Jarvis 코드베이스의 agent(jarvis-planner/builder/integrator)에도 같은 패턴. 실수 사례를 CLAUDE.md로 동결.

### 14.11 "크기보다 응집성"
- `store.ts` 170KB지만 그룹핑 주석(`// =====`)으로 섹션 구분. 파일을 굳이 쪼개지 않고도 탐색 가능.
- **교훈**: 작은 모놀리스가 큰 스파게티보다 낫다. 섹션 헤더 주석 유지.

---

## 부록 A — qmd 설정 예시 (`example-index.yml`)
```yaml
global_context: "If you see a relevant [[WikiWord]], you can search for that WikiWord to get more context."
collections:
  Meetings:
    path: ~/Documents/Meetings
    pattern: "**/*.md"
    context:
      "/": "Meeting notes and summaries"
  journals:
    path: ~/Documents/Notes
    pattern: "**/*.md"
    context:
      "/journal/2024": "Daily notes from 2024"
      "/journal/2025": "Daily notes from 2025"
      "/": "Notes vault"
  codex:
    path: ~/Documents/Codex
    pattern: "**/*.md"
    context:
      "/": "Thematic collections of important concepts and discussions"
```

## 부록 B — qmd CLI 커맨드 한 눈에
- 컬렉션: `qmd collection add|remove|rename|list`
- 컨텍스트: `qmd context add|list|rm|check`
- 인덱싱: `qmd update [--pull]`, `qmd embed [-f] [--chunk-strategy auto]`
- 검색: `qmd search|vsearch|query <q> [-c coll] [-n N] [--min-score 0.3] [--json|csv|md|xml|files] [--explain] [--intent "..."] [--no-rerank]`
- 조회: `qmd get <path|#docid>`, `qmd multi-get <glob|list> [-l N] [--max-bytes N]`
- 상태/유지: `qmd status`, `qmd ls [coll]`, `qmd cleanup`
- 서버: `qmd mcp [--http] [--port N] [--daemon]`, `qmd mcp stop`
- 벤치/스킬: `qmd bench <fixture.json>`, `qmd skill install`

## 부록 C — qmd 파이프라인 순서도(하이브리드)

```
query
 ├─ FTS 프로브(20건)
 │   └─ 강한 시그널? → 확장 스킵
 ├─ LLM expandQuery → [lex, vec, hyde] 2-5개
 ├─ 경로별 검색 실행
 │   ├─ lex → searchFTS (즉시)
 │   └─ vec, hyde → batch embed → searchVec (순차 KNN)
 ├─ RRF fusion
 │   ├─ 첫 2 리스트 weight 2x
 │   └─ Top-rank bonus (+0.05 / +0.02)
 ├─ 상위 40 candidates 선택
 ├─ 각 문서별 best chunk 선택 (query term + intent term 매칭)
 ├─ LLM rerank (chunks만, NOT 전체 body)
 ├─ Position-aware blend (0.75 / 0.60 / 0.40)
 ├─ dedup + minScore filter
 └─ Top-N 반환
```

---

## 요약 (3줄)
1. qmd는 "단일 사용자 로컬 하이브리드 검색 엔진"으로 전량 이식은 불가하나, **하이브리드 파이프라인(RRF + position-aware rerank blend)**, **smart chunking(regex + AST + 거리 감쇠)**, **intent 스티어링**, **strong-signal bypass**, **LLM 캐시**, **MCP initialize instructions**는 Jarvis에 직접 이식 가능한 고가치 자산.
2. Jarvis 맵핑: qmd의 SQLite-FTS/vec → Jarvis의 OpenSearch/pgvector, qmd의 node-llama-cpp → Jarvis의 OpenAI API + json_schema. 알고리즘 층은 거의 그대로 유지.
3. 가장 먼저 가져올 것: (1) smart chunking 300줄, (2) RRF + blend 80줄, (3) strong-signal bypass 로직, (4) intent 신호 필드, (5) chunk-기반 리랭커 캐시 패턴.

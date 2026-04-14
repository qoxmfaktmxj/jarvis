# graphify 프로젝트 분석 — Jarvis 통합 관점

분석 대상: `C:\Users\kms\Desktop\dev\reference_only\graphify` (v0.3.29)
분석 일자: 2026-04-14
분석 목적: Jarvis(Next.js 15 기반 사내 업무 시스템 + 위키 + RAG AI 포털)로 재활용할 수 있는 아이디어/코드/아키텍처 추출

---

## 1. 프로젝트 개요

### 한 문단 요약

graphify는 "임의의 폴더(코드/문서/PDF/이미지/영상/오디오/URL)를 단 하나의 조회 가능한 지식 그래프로 바꿔주는 AI 코딩 어시스턴트용 스킬(skill)"이다. Claude Code, Codex, Cursor, Aider, Gemini CLI, GitHub Copilot CLI, OpenClaw, Factory Droid, Trae 등 9종 이상의 에이전틱 CLI에 `.md` 스킬 파일과 플랫폼별 hook/plugin을 설치해, `/graphify <폴더>` 한 줄로 3단 파이프라인(AST 결정적 추출 → Whisper 로컬 전사 → Claude 서브에이전트 병렬 의미 추출)을 돌린 뒤 NetworkX 그래프로 빌드하고 Leiden 커뮤니티 탐지를 수행한다. 결과물은 `graphify-out/` 디렉토리에 `graph.html`(대화형 vis.js 시각화), `graph.json`(재사용/쿼리용 정본), `GRAPH_REPORT.md`(god nodes·놀라운 연결·제안 질문), `cache/{sha256}.json`(변경분만 재추출), 선택적으로 Obsidian vault·Neo4j Cypher·GraphML·SVG·MCP 서버 등으로 배출된다.

### 해결하려는 문제

1. **Andrej Karpathy의 `/raw` 폴더 문제:** 논문·트윗·스크린샷·영상·코드를 한 폴더에 무차별 투척했을 때 다음 세션에서 무엇이 어디에 연결되어 있는지 알 길이 없다.
2. **LLM의 세션 망각:** Claude에게 같은 코드베이스 질문을 할 때마다 전체 파일을 다시 읽히는 낭비(프로젝트 자체 벤치마크: **71.5x** 토큰 절감).
3. **추출의 불투명성:** LLM이 뽑아낸 엣지를 사실로 받아들여야 할지 추측으로 취급해야 할지 알 수 없다 → 모든 엣지에 `EXTRACTED | INFERRED | AMBIGUOUS` 태그 + 0~1.0 `confidence_score` 부여.
4. **파편화된 코드베이스 온보딩:** 신규 개발자가 Grep/Glob으로 하나하나 탐색하는 대신, hub 노드(god nodes)와 커뮤니티 구조부터 읽어 방향성을 먼저 잡게 만드는 것.

### 타겟 사용자

- AI 코딩 어시스턴트를 쓰는 개발자(1차)
- 연구자·지식 큐레이터(논문 + 트윗 + 영상을 하나의 그래프로 묶으려는)
- Obsidian vault에 자동으로 위키를 뿌리고 싶은 PKM 유저
- 공저자가 있는 팀(각 노드에 `author` / `contributor` 필드가 존재)
- **잠재적 기업 내부 위키 담당자** — Jarvis 관점에서 가장 중요

---

## 2. 기술 스택 & 아키텍처

### 언어 / 프레임워크 / 런타임

- **Python 3.10+** (순수 Python, 서버리스 로컬 실행)
- PyPI 패키지명: `graphifyy` (오타가 아니라 `graphify`라는 유사 패키지가 이미 선점당해서 y를 하나 더 붙임)
- CLI 엔트리포인트: `graphify = graphify.__main__:main`
- **LLM 호출을 자체적으로 하지 않는다.** 모든 의미 추출은 "호스트 AI 코딩 어시스턴트의 Agent 도구"에 위임한다 → 사용자 본인의 API 키를 그대로 씀.
- 로컬 전사: `faster-whisper`(CPU `int8`), 오디오 다운로드: `yt-dlp`
- 커뮤니티 탐지: `graspologic.partition.leiden` (없으면 `networkx` Louvain fallback)

### 핵심 의존성 (pyproject.toml:13-51)

**필수:**
```
networkx
tree-sitter>=0.23.0
tree-sitter-python / javascript / typescript / go / rust / java / c / cpp /
  ruby / c-sharp / kotlin / scala / php / swift / lua / zig /
  powershell / elixir / objc / julia        # 총 20개 언어
```

**선택적 extras (`pip install graphifyy[<extra>]`):**
| extra | 패키지 | 용도 |
|-------|--------|------|
| `mcp` | `mcp` | MCP stdio 서버 모드 |
| `neo4j` | `neo4j` | Neo4j 직접 push |
| `pdf` | `pypdf`, `html2text` | PDF/웹페이지 추출 |
| `watch` | `watchdog` | `--watch` 파일 감시 |
| `leiden` | `graspologic` | Leiden 클러스터링 (없으면 Louvain fallback) |
| `office` | `python-docx`, `openpyxl` | `.docx`, `.xlsx` |
| `video` | `faster-whisper`, `yt-dlp` | 영상/오디오 전사 |
| `all` | 모두 | 한 방 설치 |

주목할 점: **OpenAI / Anthropic SDK에 직접 의존하지 않는다.** 이것이 graphify의 아키텍처적 핵심이다.

### 디렉토리 구조 (3-level tree)

```
reference_only/graphify/
├── README.md                      (20KB, 핵심 문서 · 영/중/일/한 4개 언어)
├── ARCHITECTURE.md                (4KB, 파이프라인 다이어그램)
├── CHANGELOG.md                   (20KB)
├── SECURITY.md                    (3KB)
├── pyproject.toml
├── graphify/                      ← 본체 Python 패키지
│   ├── __init__.py                (1KB, lazy import 디스패처)
│   ├── __main__.py                (36KB, CLI + 플랫폼별 설치자 9종)
│   ├── detect.py                  (19KB, 파일 분류 · `.graphifyignore` · 매니페스트)
│   ├── extract.py                 (118KB, ⭐ 20개 언어 tree-sitter 추출 + 콜그래프)
│   ├── build.py                   (4KB, 추출 dict → NetworkX Graph)
│   ├── cluster.py                 (5KB, Leiden/Louvain + 대형 커뮤니티 분할)
│   ├── analyze.py                 (21KB, god nodes/surprises/questions/diff)
│   ├── report.py                  (7KB, GRAPH_REPORT.md 생성)
│   ├── export.py                  (40KB, HTML/JSON/SVG/GraphML/Obsidian/Neo4j/Canvas)
│   ├── wiki.py                    (7KB, Wikipedia-style 커뮤니티/god node 문서)
│   ├── cache.py                   (5KB, SHA256 기반 per-file 캐시)
│   ├── ingest.py                  (10KB, URL/arxiv/tweet/youtube 인제스트)
│   ├── transcribe.py              (6KB, Whisper + yt-dlp)
│   ├── serve.py                   (15KB, ⭐ MCP stdio 서버)
│   ├── hooks.py                   (7KB, git post-commit/post-checkout 훅)
│   ├── watch.py                   (6KB, watchdog 파일 감시 + 자동 재빌드)
│   ├── security.py                (7KB, URL/경로/라벨 검증 + SSRF 방어)
│   ├── validate.py                (3KB, 추출 JSON 스키마 검증)
│   ├── benchmark.py               (5KB, 토큰 절감 벤치마크)
│   ├── manifest.py                (0.2KB, 얇은 re-export)
│   ├── skill.md                   (55KB, ⭐ Claude Code 용 스킬 프롬프트)
│   ├── skill-codex.md             (52KB)
│   ├── skill-copilot.md           (54KB)
│   ├── skill-claw.md              (48KB)
│   ├── skill-droid.md             (51KB)
│   ├── skill-aider.md             (48KB)
│   ├── skill-opencode.md          (51KB)
│   ├── skill-trae.md              (50KB)
│   └── skill-windows.md           (52KB, Windows 경로용 변형)
├── graphify-out/                  ← 실제 출력 샘플 (이 프로젝트 자신을 돌린 결과)
│   ├── graph.html                 (5.4 MB, vis.js 인터랙티브)
│   ├── graph.json                 (72 MB, ⚠ 대형 — 통째로 프롬프트 불가)
│   ├── GRAPH_REPORT.md            (262 KB, 자가 분석 보고서)
│   ├── manifest.json              (497 KB)
│   ├── cost.json                  (0.2 KB, 누적 토큰 비용)
│   └── cache/                     (SHA256 기반 per-file JSON)
├── worked/                        ← 샘플 입력 + 실제 출력 (재현 가능한 예제)
├── tests/
└── .github/                       ← CI (pytest)
```

### 주요 엔트리 포인트

| 엔트리 | 경로 | 역할 |
|--------|------|------|
| CLI | `graphify.__main__:main` | `graphify install/query/path/explain/hook/...` |
| 스킬 진입 | `graphify/skill.md` | Claude Code가 `/graphify` 호출 시 읽는 프롬프트 (Step 1~9) |
| Python 라이브러리 | `graphify/__init__.py` (lazy) | `from graphify import extract, build, cluster, ...` |
| MCP 서버 | `python -m graphify.serve <graph.json>` | stdio 기반 7개 도구 노출 |
| AST 엔진 | `graphify.extract:extract(files)` | 20개 언어 tree-sitter 구조 추출 |

---

## 3. 핵심 기능 (Feature Inventory)

### 3.1 멀티플랫폼 스킬 설치자 (`__main__.py` · 9개 플랫폼)

각 플랫폼마다 **프롬프트(스킬 md), 상시 hook/plugin, 프로젝트 루트 문서(AGENTS.md / CLAUDE.md / GEMINI.md / .cursor/rules)** 를 동시에 설치한다.

- **Claude Code**: `~/.claude/skills/graphify/SKILL.md` + `~/.claude/CLAUDE.md` 등록 + `settings.json`의 `PreToolUse(matcher="Glob|Grep")` hook — `graph.json`이 있으면 Glob/Grep 실행 직전에 "먼저 GRAPH_REPORT.md를 읽으라"는 문구를 주입 (`__main__.py:26-38`).
- **Codex**: `.agents/skills/graphify/SKILL.md` + `AGENTS.md` + `.codex/hooks.json` Bash 훅.
- **OpenCode**: `.opencode/plugins/graphify.js` (JavaScript 플러그인) + `opencode.json` 등록 + `tool.execute.before`가 bash 출력에 상기 문구를 인젝트 (`__main__.py:342-365`).
- **Cursor**: `.cursor/rules/graphify.mdc` with `alwaysApply: true` — 항상 컨텍스트에 포함.
- **Gemini CLI**: `~/.gemini/skills/graphify/SKILL.md` + `GEMINI.md` + `.gemini/settings.json`의 `BeforeTool` hook.
- **GitHub Copilot CLI / Aider / OpenClaw / Factory Droid / Trae**: `AGENTS.md` 또는 자체 스킬 디렉토리 복사.

### 3.2 `/graphify <path>` — 메인 파이프라인

`skill.md`의 Step 1~9가 하나의 거대 프롬프트로 채널링된다. 사람이 따라야 할 "코딩 매뉴얼"이 아니라 "LLM이 순차 실행할 bash 블록"이다.

### 3.3 3-pass 추출기

1. **AST (결정적, 무료, 빠름)** — `graphify/extract.py:800-979`의 `walk()` + `walk_calls()` · tree-sitter AST 순회로 클래스/함수/import/호출 그래프 추출. 20개 언어.
2. **Whisper 로컬 전사** — `graphify/transcribe.py` · `faster-whisper` CPU `int8`, `yt-dlp` 통합. 도메인 힌트를 god nodes에서 추출한 topic 스트링으로 주입 (`initial_prompt`).
3. **Claude 서브에이전트 병렬 추출** — 20~25 파일 단위 청크로 쪼갠 뒤, Claude Code의 Agent 도구를 "한 메시지에 여러 개 호출"해 병렬 실행. 각 서브에이전트는 정확한 JSON 스키마에 맞춘 출력을 강제당함 (`skill.md:250-301`).

### 3.4 지식 그래프 빌드 / 분석

- `build_from_json()` → NetworkX `Graph` 또는 `DiGraph` (옵션) · 스키마 검증 + 댕글링 엣지 경고
- `cluster()` → Leiden 우선, Louvain fallback · 25% 초과 대형 커뮤니티는 2차 패스로 재분할 (`cluster.py:55-123`)
- `god_nodes()` / `surprising_connections()` / `suggest_questions()` — 각각 degree 기반, 크로스-파일 composite score 기반, AMBIGUOUS/bridge/isolated 패턴 기반 (`analyze.py`)
- `graph_diff()` — 이전 그래프 대비 추가/삭제 노드·엣지 요약 (`analyze.py:444-525`)

### 3.5 `/graphify query` / `path` / `explain`

`graphify-out/graph.json`을 읽어 BFS(기본)/DFS(`--dfs`) 탐색 + `--budget N` 토큰 예산 내에서 subgraph 텍스트 덤프. 응답은 `ingest.save_query_result()`가 `graphify-out/memory/query_{ts}_{slug}.md`로 저장 → 다음 `--update` 때 그래프로 다시 끌려 들어감(자기강화 루프, `ingest.py:238-285`).

### 3.6 `/graphify add <url>` — 인제스터

arxiv, Twitter/X, YouTube, PDF, 이미지, 일반 웹페이지 자동 분류 → YAML frontmatter(`source_url`, `captured_at`, `author`, `contributor`)로 래핑해 `./raw/`에 저장 (`ingest.py:184-235`). SSRF 방어(`security.validate_url`)가 기본 적용.

### 3.7 `--watch` 자동 재빌드

`watchdog` 감시 → 코드 변경 시 즉시 AST 재빌드 (LLM 없음), 문서/이미지 변경 시 `needs_update` 플래그만 남기고 사용자에게 `/graphify --update` 실행을 요청 (`watch.py`).

### 3.8 git post-commit / post-checkout 훅

`graphify hook install` 호출 시 두 개의 훅을 설치. 커밋 시 변경된 코드 파일만 AST로 재추출해 그래프 갱신. 브랜치 전환에도 동일 (`hooks.py`).

### 3.9 MCP stdio 서버 (`--mcp` / `graphify.serve`)

7개 도구 노출:
- `query_graph(question, mode, depth, token_budget)` — BFS/DFS subgraph
- `get_node(label)`
- `get_neighbors(label, relation_filter)`
- `get_community(community_id)`
- `god_nodes(top_n)`
- `graph_stats()` — 노드/엣지/커뮤니티/confidence 분포
- `shortest_path(source, target, max_hops)`

이건 Jarvis 통합 관점에서 가장 직접적으로 재사용 가능한 조각이다.

### 3.10 출력 포맷 다중 export

| 포맷 | 플래그 | 용도 |
|------|--------|------|
| `graph.html` | (기본) | vis.js 브라우저 시각화, 사이드바 검색 + 커뮤니티 legend |
| `graph.json` | (기본) | `json_graph.node_link_data`, 재사용용 정본 |
| `GRAPH_REPORT.md` | (기본) | god nodes + surprises + 제안 질문 + 커뮤니티 개관 |
| `graph.svg` | `--svg` | Notion/GitHub README 임베드 |
| `graph.graphml` | `--graphml` | Gephi, yEd |
| `cypher.txt` | `--neo4j` | Neo4j 수동 import |
| 직접 push | `--neo4j-push bolt://...` | 실행 중인 Neo4j에 MERGE로 upsert |
| Obsidian vault | `--obsidian` | 노드 하나당 `.md` + `_COMMUNITY_*.md` + Canvas 레이아웃 + `.obsidian/graph.json` 컬러 그룹 |
| Wiki | `--wiki` | 커뮤니티/god node 당 Wikipedia-style 문서 + `index.md` 엔트리 |

### 3.11 토큰 절감 벤치마크

`benchmark.run_benchmark()` — 5개 샘플 질문에 대해 "전체 코퍼스 읽기 vs 쿼리 subgraph"의 토큰 비율을 자동 산출, `reduction_ratio` 반환 (`benchmark.py`).

---

## 4. LLM 사용 패턴 ⭐⭐⭐

### 4.1 어떤 LLM/모델을 쓰는가?

**graphify는 LLM SDK를 직접 import하지 않는다.** 이것이 이 프로젝트의 가장 큰 아키텍처 결정이다.

대신 "호스트 AI 코딩 어시스턴트의 Agent / Task / Subagent 도구"에 위임한다:

| 플랫폼 | 실제 모델 | 호출 주체 |
|--------|-----------|-----------|
| Claude Code | Claude (사용자 구독/API) | Claude Code의 Agent 도구 |
| Codex | GPT-5 계열 | Codex의 multi_agent |
| Cursor | 유저 선택 모델 | Cursor MDC alwaysApply |
| Factory Droid | Factory 모델 | Task 도구 |
| Gemini CLI | Gemini | `.gemini/settings.json` hook |

Python 코드 안에 `openai.chat.completions.create(...)` 같은 호출이 **단 한 곳도 없다**. 유일한 LLM과의 인터페이스는 `graphify/skill.md`의 프롬프트다.

### 4.2 어느 파일/함수에서 호출하는가?

**호출이 발생하는 개념적 위치:**
- `graphify/skill.md:197-353` (Step 3 Part B) — Claude Code가 Agent 도구를 병렬로 띄우는 지점. 각 에이전트가 20~25개 파일을 읽고 JSON을 반환.
- 반환된 JSON은 stdout → Claude Code가 `graphify-out/.graphify_semantic_new.json`에 저장 → `graphify.cache.save_semantic_cache()`로 `graphify-out/cache/{sha256}.json`에 기록.

**실제 Python 쪽이 LLM 출력을 "소비"만 하는 지점:**
- `graphify/validate.py:10-63` — JSON 스키마 검증
- `graphify/cache.py:93-154` — 캐시 저장/조회
- `graphify/build.py:29-58` — NetworkX 그래프에 병합

### 4.3 프롬프트 패턴

**시스템 프롬프트 (`skill.md:252-301`):**
```
You are a graphify extraction subagent. Read the files listed and extract a knowledge graph fragment.
Output ONLY valid JSON matching the schema below - no explanation, no markdown fences, no preamble.

Files (chunk CHUNK_NUM of TOTAL_CHUNKS):
FILE_LIST

Rules:
- EXTRACTED: relationship explicit in source (import, call, citation, "see §3.2")
- INFERRED: reasonable inference (shared data structure, implied dependency)
- AMBIGUOUS: uncertain - flag for review, do not omit

Code files: focus on semantic edges AST cannot find...
Doc/paper files: extract named concepts, entities, citations. Also extract rationale...
Image files: use vision to understand what the image IS - do not just OCR.
  UI screenshot: layout patterns, design decisions, key elements, purpose.
  Chart: metric, trend/insight, data source.
  Tweet/post: claim as node, author, concepts mentioned.
  ...
```

핵심 기법:
1. **"EXTRACTED | INFERRED | AMBIGUOUS" 3단 신뢰도 강제** — 프롬프트 차원에서 confidence를 절대 생략하지 못하게 함.
2. **파일 타입별 분기 규칙** — code / doc / paper / image / UI screenshot / chart / diagram / handwritten 각각 다른 추출 전략.
3. **DEEP_MODE 스위치** — `--mode deep` 시 INFERRED를 공격적으로 내라는 부스터.
4. **`semantically_similar_to` 특수 엣지 + `hyperedges` 배열** — 페어와이즈 엣지로 표현 불가한 3+ 노드 그룹 관계.
5. **Negative 제약**: "no explanation, no markdown fences, no preamble" — JSON only.
6. **Deterministic fallback**: 서브에이전트 절반 이상 실패 시 중단, 캐시에 영향 없음.

### 4.4 구조화된 출력 사용?

**JSON Schema를 하드코딩된 예시로 주입 (`skill.md:301`):**
```json
{"nodes":[{"id":"filestem_entityname","label":"Human Readable Name","file_type":"code|document|paper|image","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[{"id":"snake_case_id","label":"Human Readable Label","nodes":["node_id1","node_id2","node_id3"],"relation":"participate_in|implement|form","confidence":"EXTRACTED|INFERRED","confidence_score":0.75,"source_file":"relative/path"}],"input_tokens":0,"output_tokens":0}
```

OpenAI/Anthropic의 native structured output(JSON schema / tool use) 기능을 쓰지 **않는다.** 단순 프롬프트에 스키마 예시 삽입 + 사후 `validate_extraction()` 검증. 이유: **플랫폼 중립성.** 어떤 CLI든 JSON을 뱉을 수 있어야 하므로 가장 낮은 공통분모를 택함.

### 4.5 비용 최적화

1. **SHA256 per-file 캐시** (`cache.py:20-33`):
   ```python
   def file_hash(path: Path) -> str:
       p = Path(path)
       raw = p.read_bytes()
       content = _body_content(raw) if p.suffix.lower() == ".md" else raw
       h = hashlib.sha256()
       h.update(content)
       h.update(b"\x00")
       h.update(str(p.resolve()).encode())
       return h.hexdigest()
   ```
   파일 내용 + 절대 경로를 섞어 해시 → 동일 내용 다른 경로 충돌 방지. Markdown은 YAML frontmatter를 제거한 body만 해시 → "reviewed/status/tags만 바뀐 메타 변경"이 캐시 무효화를 일으키지 않음. 프로덕션에서 실측 인상적인 최적화.

2. **AST 우선 배치** — 코드는 LLM이 아니라 tree-sitter로 뽑으므로 0 token. Python/JS/TS/Go/Rust/Java/C/C++/Ruby/C#/Kotlin/Scala/PHP/Swift/Lua/Zig/PowerShell/Elixir/Objective-C/Julia 20개 언어.

3. **조건부 Part B skip** — 문서/이미지/PDF가 0개인 "code-only corpus"는 Part B(LLM 추출) 전체 스킵 (`skill.md:199`).

4. **Parallel subagent dispatch** — "한 메시지에 여러 Agent 호출"을 강제하는 프롬프트 (`skill.md:237-247`). 순차 실행 시 5-10배 느려짐을 명시적으로 경고.

5. **Token benchmark 자동 출력** — `benchmark.run_benchmark()`가 매 실행 후 "corpus_tokens / avg_query_tokens" 비율을 출력해 ROI를 가시화 (`skill.md:648-664`). README에 71.5x 절감 숫자로 광고.

6. **Cumulative cost tracker** (`skill.md:685-704`):
   ```python
   cost = json.loads(cost_path.read_text()) if cost_path.exists() else {...}
   cost['runs'].append({'date': ..., 'input_tokens': ..., 'output_tokens': ..., 'files': ...})
   cost_path.write_text(json.dumps(cost, indent=2))
   ```

7. **Whisper 로컬 실행** — 오디오/영상은 네트워크를 타지 않고 CPU에서 `faster-whisper` int8. 전사 자체가 캐시됨 (`transcribe.py:138-139`).

### 4.6 구체적 코드 스니펫

**SHA256 콘텐츠 해시 기반 캐시 (cache.py:20-33):**
```python
def file_hash(path: Path) -> str:
    """SHA256 of file contents + resolved path. Prevents cache collisions on identical content.
    For Markdown files (.md), only the body below the YAML frontmatter is hashed,
    so metadata-only changes (e.g. reviewed, status, tags) do not invalidate the cache.
    """
    p = Path(path)
    raw = p.read_bytes()
    content = _body_content(raw) if p.suffix.lower() == ".md" else raw
    h = hashlib.sha256()
    h.update(content)
    h.update(b"\x00")
    h.update(str(p.resolve()).encode())
    return h.hexdigest()
```

**Pre-tool-use hook JSON (__main__.py:26-38):**
```python
_SETTINGS_HOOK = {
    "matcher": "Glob|Grep",
    "hooks": [{
        "type": "command",
        "command": (
            "[ -f graphify-out/graph.json ] && "
            r"""echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files."}}' """
            "|| true"
        ),
    }],
}
```

---

## 5. 텍스트 임베딩 & 벡터 검색 ⭐⭐⭐

### 5.1 임베딩 사용 여부

**아니오.** 이게 graphify의 가장 도발적인 결정이다.

`README.md:42-44`:
> **Clustering is graph-topology-based — no embeddings.** Leiden finds communities by edge density. The semantic similarity edges that Claude extracts (`semantically_similar_to`, marked INFERRED) are already in the graph, so they influence community detection directly. The graph structure is the similarity signal — no separate embedding step or vector database needed.

### 5.2 임베딩 모델

**없다.** OpenAI text-embedding-3-small, BGE, e5 같은 모델이 코드에 등장하지 않음.

### 5.3 벡터 DB

**없다.** pgvector, Pinecone, Chroma, Qdrant, Weaviate, Milvus 어느 것도 없다. `pyproject.toml`의 의존성에 전혀 포함되지 않음. Neo4j가 선택적이지만 이것도 "벡터 DB"가 아닌 "그래프 DB"로 쓰임.

### 5.4 인덱싱 파이프라인

"semantic similarity"를 **LLM이 직접 엣지로 뽑아낸다**:

`skill.md:277-281`:
```
Semantic similarity: if two concepts in this chunk solve the same problem or
represent the same idea without any structural link (no import, no call, no citation),
add a `semantically_similar_to` edge marked INFERRED with a confidence_score reflecting
how similar they are (0.6-0.95). Examples:
- Two functions that both validate user input but never call each other
- A class in code and a concept in a paper that describe the same algorithm
- Two error types that handle the same failure mode differently
```

즉 "임베딩 유사도 > threshold 시 엣지 추가"가 아니라, **LLM이 휴리스틱 판단으로 엣지를 만들고 confidence_score를 함께 기록.** 이후 Leiden이 그 엣지의 `weight`를 가중치로 삼아 커뮤니티를 구성.

### 5.5 검색 쿼리 방식

`benchmark.py:16-52` / `serve.py:42-51` — "질문 단어와 노드 label의 토큰 overlap" 기반 단순 스코어링:
```python
def _score_nodes(G: nx.Graph, terms: list[str]) -> list[tuple[float, str]]:
    scored = []
    for nid, data in G.nodes(data=True):
        label = data.get("label", "").lower()
        source = data.get("source_file", "").lower()
        score = sum(1 for t in terms if t in label) + sum(0.5 for t in terms if t in source)
        if score > 0:
            scored.append((score, nid))
    return sorted(scored, reverse=True)
```

Top-3 매칭 노드를 시작점으로 잡고 BFS 또는 DFS 탐색 → subgraph 텍스트 덤프. **벡터 유사도도, fuzzy match도 없다.** 순수 키워드 매칭.

### 5.6 하이브리드 검색?

**없다.** 키워드 매칭 → 그래프 구조 탐색 → 텍스트 출력. 이것이 전부.

### 5.7 임베딩 없이 동작하는가? 대안은?

**오히려 핵심 설계.** 대안은 다음의 조합:
1. LLM이 `semantically_similar_to` 엣지를 생성
2. Leiden community detection이 엣지 밀도 기반으로 클러스터링
3. Cross-community edges가 "놀라운 연결" 역할
4. god nodes(high degree)가 "중요 노드" 역할
5. betweenness centrality가 "bridge 노드" 역할

이 접근의 **장점:**
- 인프라 부담 0 (벡터 DB 없음)
- 일관된 감사 가능성 (어떤 엣지가 왜 존재하는지 `source_file:L42`로 추적 가능)
- 해석 가능한 클러스터 (Leiden 결과는 "이 커뮤니티가 왜 이렇게 묶였는가"를 엣지 목록으로 설명 가능)
- 변경 추적 용이 (엣지 diff가 명확)

**단점:**
- 키워드 매칭이라 동의어/다국어/오탈자에 약함
- 규모가 크면 LLM 호출 비용이 선형 증가
- "이 질문과 가장 유사한 노드" 같은 fuzzy query 지원 X

### 5.8 Jarvis 관점 시사점

Jarvis는 **이미 pgvector를 가지고 있다.** graphify의 "no embeddings" 철학을 그대로 가져올 수는 없다. 그러나 graphify의 교훈:
- "엣지 신뢰도 + 감사 가능성" 모델은 pgvector 기반 RAG와 **병행 가능**
- "LLM이 직접 semantic similarity 엣지를 생성" 패턴은 pgvector + 하이브리드 하기 좋음
- "Leiden 커뮤니티 + god nodes" 분석 레이어는 pgvector에 직접 적용 가능 (임베딩으로 유사 문서 찾고, 그래프 구조로 중요 노드 선별)

---

## 6. 지식 그래프 / 위키 구조

### 6.1 노드 / 엣지 모델링

**Node schema (validate.py:6-7, skill.md:301):**
```json
{
  "id": "unique_string",
  "label": "Human Readable Name",
  "file_type": "code|document|paper|image|rationale",
  "source_file": "relative/path",
  "source_location": "L42",
  "source_url": null,       // URL 출처 (ingest 시)
  "captured_at": null,      // ISO timestamp
  "author": null,
  "contributor": null       // 팀 협업용
}
```

**Edge schema:**
```json
{
  "source": "node_id",
  "target": "node_id",
  "relation": "calls|imports|imports_from|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for|contains|method|...",
  "confidence": "EXTRACTED|INFERRED|AMBIGUOUS",
  "confidence_score": 1.0,   // 0.0-1.0
  "source_file": "relative/path",
  "source_location": "L42",
  "weight": 1.0,
  "_src": "original_source_id",  // 방향 보존용
  "_tgt": "original_target_id"
}
```

**Hyperedge** — 3+ 노드가 참여하는 그룹 관계 (페어와이즈로 표현 불가한 개념):
```json
{
  "id": "snake_case_id",
  "label": "Human Readable Label",
  "nodes": ["node_id1", "node_id2", "node_id3"],
  "relation": "participate_in|implement|form",
  "confidence": "EXTRACTED|INFERRED",
  "confidence_score": 0.75
}
```

이 hyperedge 개념은 Jarvis 관점에서 매우 흥미롭다. 예: "오프보딩 플로우에 참여하는 모든 함수들"을 단일 hyperedge로 묶을 수 있음.

### 6.2 클러스터링 / 커뮤니티 탐지

**Leiden (graspologic) 우선, Louvain (networkx) fallback** (`cluster.py:21-53`):
```python
def _partition(G: nx.Graph) -> dict[str, int]:
    try:
        from graspologic.partition import leiden
        with _suppress_output():
            result = leiden(G)
        return result
    except ImportError:
        pass
    # Fallback
    kwargs: dict = {"seed": 42, "threshold": 1e-4}
    if "max_level" in inspect.signature(nx.community.louvain_communities).parameters:
        kwargs["max_level"] = 10
    communities = nx.community.louvain_communities(G, **kwargs)
    return {node: cid for cid, nodes in enumerate(communities) for node in nodes}
```

**대형 커뮤니티 자동 분할** (`cluster.py:55-105`): 25% 초과 + 최소 10개 노드 커뮤니티는 `_split_community()`로 2차 Leiden 패스를 돌려 하위 커뮤니티로 쪼갬. 이 "계층적 refinement"는 실전에서 가치가 크다(실제 `graphify-out/GRAPH_REPORT.md`에서 3,231 파일 → 2,004 커뮤니티 detected).

**Cohesion score** (`cluster.py:125-134`):
```python
def cohesion_score(G: nx.Graph, community_nodes: list[str]) -> float:
    """Ratio of actual intra-community edges to maximum possible."""
    n = len(community_nodes)
    subgraph = G.subgraph(community_nodes)
    actual = subgraph.number_of_edges()
    possible = n * (n - 1) / 2
    return round(actual / possible, 2) if possible > 0 else 0.0
```

### 6.3 시각화 방법

1. **`graph.html` (export.py:22-249)** — vis.js, forceAtlas2Based 물리엔진, 사이드바에 검색 + 커뮤니티 legend + 노드 info panel + neighbor list. XSS 방어를 위해 `esc()` 헬퍼로 모든 innerHTML 인젝션을 escape.
2. **Obsidian vault** — 노드당 `.md` 하나 + `_COMMUNITY_*.md` overview + `.obsidian/graph.json` 컬러 그룹 자동 설정 + Dataview 쿼리 블록.
3. **Obsidian Canvas** — 커뮤니티 그리드 레이아웃 자동 생성.
4. **GraphML / SVG** — Gephi, yEd, Notion, GitHub README에 임베드.
5. **Neo4j Cypher** — `MERGE` 기반 idempotent import.

### 6.4 데이터 입력 방식

- 로컬 파일 (코드/docs/papers/images/videos)
- URL 인제스트 (arxiv, Tweet, YouTube, PDF, 이미지, 일반 웹)
- `--update`: 변경된 파일만 재추출 (SHA256 비교)
- `--watch`: 파일 시스템 감시
- git hook: 커밋/체크아웃 트리거

---

## 7. 데이터 파이프라인

### 7.1 입력 → 처리 → 출력 흐름

```
detect()      →  extract()       →  build_graph()  →  cluster()   →  analyze()      →  report()   →  export()
파일분류          AST + Whisper +     dict→nx.Graph    Leiden        god+surprises+    GRAPH_      HTML/JSON/
.graphifyignore  LLM 서브에이전트    validate        + 대형분할     questions+diff    REPORT.md   SVG/Obsidian/...
```

각 단계는 **순수 함수 + 파일 시스템 직렬화**로 소통. 공유 상태 없음.

### 7.2 배치 vs 실시간

- **배치**: `/graphify <path>` 한 번 실행
- **증분 배치**: `/graphify <path> --update` (변경분만)
- **준실시간**: `/graphify <path> --watch` (파일 저장 시 코드는 즉시 AST 재빌드, 비코드는 플래그만)
- **자동 트리거**: `graphify hook install`로 git post-commit/post-checkout 시점 재빌드

### 7.3 캐싱 전략 (SHA256 content hash)

- **Per-file cache (`cache.py`)**: SHA256(content + resolved_path) → `graphify-out/cache/{hash}.json`
- **캐시 키 디자인**: 파일 내용 + 절대 경로. 동일 내용이어도 다른 위치에 있으면 다른 캐시. 이 결정은 "리팩토링으로 파일을 옮긴 경우 캐시 무효화"를 감수하되 "타 프로젝트와 캐시 충돌"을 피하는 trade-off.
- **Markdown body-only 해시**: YAML frontmatter(리뷰/상태/태그)만 변경된 경우 캐시 유지. 위키 시스템에 매우 중요한 특성.
- **Whisper 전사 캐시**: `graphify-out/transcripts/{stem}.txt` 파일 존재 시 재사용 (`transcribe.py:137-139`)
- **YouTube 오디오 캐시**: URL의 SHA1 12자리로 파일명 생성해 재다운로드 방지 (`transcribe.py:59-67`)
- **Cumulative cost tracker**: `graphify-out/cost.json`에 매 실행 누적

### 7.4 상태 전달 파일들

`skill.md` 파이프라인 중간 산출물 (모두 `.graphify_*` prefix):
```
.graphify_python          # 이번 세션 Python 인터프리터 경로
.graphify_detect.json     # 파일 분류 결과
.graphify_transcripts.json # Whisper 전사 경로
.graphify_uncached.txt    # 캐시 미스 파일 목록 (→ 서브에이전트 청크)
.graphify_cached.json     # 캐시 히트 노드/엣지
.graphify_ast.json        # AST 추출 결과
.graphify_semantic_new.json # 새로 LLM으로 뽑은 결과
.graphify_semantic.json   # cached + new 병합
.graphify_extract.json    # ast + semantic 최종 병합
.graphify_analysis.json   # god/surprises/questions
.graphify_labels.json     # 커뮤니티 라벨 (Step 5에서 LLM이 명명)
.graphify_old.json        # --update 시 diff용 이전 그래프 백업
.graphify_incremental.json # 변경 파일 목록
```

**철학:** "shell commands + 파일로 상태 전달" → 각 단계를 재실행 가능, 디버깅 용이, Python 프로세스 간 공유 상태 없음. Unix 철학에 충실.

---

## 8. UI / UX 패턴

### 8.1 인터페이스 종류

1. **CLI** (`graphify install/query/path/explain/hook`) — Python `argparse`
2. **AI 코딩 어시스턴트 내 슬래시 커맨드** — `/graphify`, `/graphify query ...`
3. **MCP stdio 서버** — Claude Desktop, Cursor MCP config 등록
4. **정적 HTML 뷰어** — `graph.html`을 브라우저에서 열기 (서버 불필요)
5. **Obsidian vault** — PKM 사용자용
6. **git hook** — 자동 백그라운드 실행

### 8.2 주요 "화면" / 페이지

- `graph.html`: 좌측 네트워크 그래프, 우측 280px 사이드바 (검색 / 선택 노드 info / neighbors 리스트 / community legend / stats)
- `GRAPH_REPORT.md`: Corpus check, Summary, God Nodes, Surprising Connections, Hyperedges, Communities, Ambiguous Edges, Knowledge Gaps, Suggested Questions 순서
- `obsidian/`: `_COMMUNITY_*.md`가 언더스코어로 인해 사이드바 최상단 노출, 각 노드는 개별 `.md`
- `wiki/index.md`: 커뮤니티 목록 + god node 목록 with `[[WikiLink]]` 네비게이션

### 8.3 상호작용 흐름 (대화형 가이드)

`skill.md:730-736`의 사용자 경험 설계가 탁월함:
```
Then immediately offer to explore. Pick the single most interesting suggested question
from the report - the one that crosses the most community boundaries or has the most
surprising bridge node - and ask:

> "The most interesting question this graph can answer: **[question]**. Want me to trace it?"

If the user says yes, run `/graphify query "[question]"` on the graph and walk them
through the answer using the graph structure - which nodes connect, which community
boundaries get crossed, what the path reveals.
```

즉 **정적 보고서 출력이 아니라 "지도 + 가이드" 경험을 지향.** 이 UX 패턴은 Jarvis의 Ask AI 포털에 바로 이식 가능.

---

## 9. 강점 (왜 좋은가)

### 9.1 플랫폼 중립성

단일 SDK에 lock-in되지 않음. Claude, Codex, Gemini, Cursor, Copilot, Aider, OpenClaw, Droid, Trae 9개 플랫폼 지원. 각 플랫폼의 hook/plugin 규격을 정확히 파악하고 맞춤 설치자 구현 (`__main__.py`에 9개 함수).

### 9.2 감사 가능성 (Honesty by design)

모든 엣지에 `EXTRACTED | INFERRED | AMBIGUOUS` 3단 라벨 + `confidence_score` 0~1.0. 보고서에 분포 %를 명시 (`report.py:23-26`). "AMBIGUOUS 20% 초과 시 Review 경고" 자동. LLM의 환각을 구조적으로 분리해 표시.

### 9.3 토큰 경제성

- AST 우선 → 코드는 0 token
- SHA256 per-file 캐시 → 변경된 파일만 재추출
- Leiden 클러스터링 → 벡터 DB 없이 구조 기반 유사성
- Parallel subagent → wall-clock 5-10배 단축
- 자체 벤치마크 71.5x 절감 (Karpathy repos + 5 papers + 4 images)

### 9.4 다종 입력 포용성

코드(20개 언어) + docs + PDF + 이미지(vision) + 영상(Whisper) + 오디오 + YouTube + arxiv + 트윗 + 웹페이지. `.graphifyignore`로 폴더별 제외. Xcode asset catalog 내부 PDF는 자동 제외 등 실전 엣지 케이스 대응.

### 9.5 자기 강화 루프

`/graphify query "Q"` 응답을 `graphify-out/memory/query_*.md`로 저장 → 다음 `--update` 때 그래프로 재흡수. 즉 "질문이 많이 나오는 주제"가 자동으로 그래프의 일부가 됨. 이것은 Jarvis의 HR Tutor 레이어와 완벽하게 맞물린다.

### 9.6 시각화 품질

`graph.html` 한 파일만으로 브라우저에서 즉시 열람. 서버 불필요, 5MB 내외. vis.js forceAtlas2 물리엔진, 검색/neighbors/community legend/XSS 방어 완비. Obsidian vault 생성 시 `.obsidian/graph.json`에 커뮤니티별 컬러 그룹 자동 등록.

### 9.7 보안 설계 수준

`security.py`가 SSRF 방어를 제대로 구현: http/https만 허용, private/reserved IP 차단, 클라우드 메타데이터 엔드포인트 블록, redirect 재검증, size cap (50MB 바이너리 / 10MB 텍스트), path traversal 방어(`validate_graph_path`가 `graphify-out/` 밖 경로 거부), control char 스트립 + 256자 cap(`sanitize_label`). README가 아니라 실제 코드에서 보안이 체크됨.

### 9.8 실전 예제(`worked/`)

3가지 코퍼스에 대한 입력 + 실제 출력 + `review.md`(정직하게 무엇을 맞고 틀렸는지)가 포함. Karpathy repos (52 files, 71.5x), graphify 자기 자신 + Transformer paper (5.4x), httpx (~1x, "6 files는 그래프 가치 없음"을 솔직히 인정).

---

## 10. 약점 & 제약

### 10.1 쿼리 성능

키워드 매칭 기반 `_score_nodes()`는 `for nid in G.nodes(data=True)` 선형 스캔. 72MB `graph.json`을 매번 풀로드(`json.loads`)하므로 Jarvis의 5,000명 사용자 동시접속 상황에서는 비현실적. 인덱스 필요.

### 10.2 Windows 경로 이슈

`graphify-out/GRAPH_REPORT.md`에 실제로 `C:\EHR_PROJECT\harness-test\...`가 노출되는 것을 보면 Windows 경로 정규화가 완전하지 않음. 엣지의 `source_file`이 역슬래시로 남아 있어 cross-platform 공유 시 문제 소지.

### 10.3 스케일 한계

`graphify-out/GRAPH_REPORT.md`를 자체 테스트한 결과를 보면:
- 3,231 파일 → 53,004 nodes, 115,547 edges, **2,004 communities**
- God nodes가 `e()`, `t()`, `n()`, `M()` 같은 minified JS 함수로 오염
- 대부분 커뮤니티 cohesion 0.0 (노이즈 수준)

Jarvis 사내 코드베이스 전체를 한번에 먹이면 결과 품질이 급격히 저하될 가능성이 큼. **코퍼스 경계 관리가 필수.** `.graphifyignore`로 `node_modules`, `.next`, `dist`, `vendor`, minified bundle 등을 공격적으로 제외해야 함.

### 10.4 Python 런타임 종속

Jarvis는 Next.js + Node.js 모노레포. Python 3.10+ 설치 + tree-sitter native binaries 컴파일 필요. 컨테이너화/Fly.io 배포 시 Python 런타임을 포함한 별도 이미지가 필요.

### 10.5 LLM 호출을 "호스트에 위임"하는 전략의 한계

Jarvis는 서버 사이드에서 OpenAI API를 직접 호출하는 구조. graphify의 "호스트 Agent에게 subagent 던지는" 모델은 Jarvis 서버 사이드에서 재현 불가. **Jarvis에서는 OpenAI API로 직접 LLM을 불러야 하므로 `skill.md`의 프롬프트를 Python/TypeScript로 이식 필요.**

### 10.6 테스트/CI 수준

`tests/`는 있지만 스케일 테스트 부재. 수천~수만 노드 그래프에서 성능 보장 없음.

### 10.7 커뮤니티 라벨링은 여전히 수작업

Step 5(`skill.md:443-481`)에서 커뮤니티 라벨은 **LLM이 Claude Code 내에서** 붙임. Python 코드는 "숫자 ID"만 다룸. Jarvis가 이걸 자동화하려면 Python 라이브러리 레벨에서 OpenAI를 호출하는 추가 레이어가 필요.

### 10.8 대형 그래프는 HTML 뷰어 불가

`export.py:19`의 `MAX_NODES_FOR_VIZ = 5_000` 하드코드. 5,000 노드 초과 시 HTML 생성 안 함. Jarvis 전사 규모를 감안하면 대안 필요(예: 커뮤니티 단위로 서브뷰어 분할).

### 10.9 증분 업데이트의 제약

`--update`는 변경 파일만 재추출하지만, 삭제된 파일의 "ghost node" 제거는 명시적으로 `deleted_files`를 추적해야 가능 (`skill.md:818-824`). 실수로 파일을 옮기면 이전 경로 노드가 남음.

---

## 11. Jarvis 통합 가능성 평가 ⭐⭐⭐⭐⭐

### 11.1 이 프로젝트 전체를 가져다 쓸 수 있나?

**부분적으로 예, 전체는 아니오.**

**예:**
- Python 라이브러리로 설치해 `apps/worker`(백그라운드 작업) 내에서 호출 가능.
- `graph.json` + `GRAPH_REPORT.md`를 산출물로 받아 `apps/web`에서 서빙.
- MCP 서버는 Ask AI 포털에서 "구조적 질의 도구"로 노출 가능.

**아니오:**
- Claude Code 중심 스킬 모델은 Jarvis의 서버 사이드 아키텍처와 맞지 않음.
- `skill.md`의 절차는 "CLI에서 LLM 오케스트레이션"을 전제 → Jarvis는 서버 잡으로 OpenAI를 직접 호출해야 함.
- 9개 플랫폼 설치자 코드는 불필요.

### 11.2 가져올 만한 핵심 아이디어 Top 5

#### 1. "EXTRACTED | INFERRED | AMBIGUOUS" 3단 신뢰도 모델 (최우선)

**왜 가치 있는가:** Jarvis는 사내 위키 + RAG AI 포털 통합. LLM 생성 답변 vs 정본 위키 사실을 구조적으로 구분하는 메커니즘이 절실. graphify의 3단 라벨링은 그대로 **위키 엣지 / RAG 답변 인용 / AI 제안 노드**에 도입 가능.

**구현 예상:** Drizzle 스키마에 `edge_confidence` enum (`'extracted' | 'inferred' | 'ambiguous'`) + `confidence_score decimal(3,2)` 추가. AMBIGUOUS 노드는 HR 관리자 리뷰 큐로 자동 라우팅.

#### 2. SHA256 per-file 캐시 패턴 (잠재 비용 절감)

**왜 가치 있는가:** Jarvis는 사내 문서를 수시로 OpenAI로 재임베딩/재요약. graphify의 "content + path" 해싱, Markdown body-only 해싱(YAML frontmatter 제외)은 이미 Jarvis의 `packages/` 어딘가에 도입되면 **재임베딩 비용을 크게 줄임.**

**구현 예상:** `packages/core/src/cache.ts`에 `contentHash(path, content, frontmatterStrip=false)` 유틸 추가. 위키 페이지 reviewed/status/tags 변경 시 embedding은 유지되어야 하는데, 이 패턴이 바로 그걸 해결.

#### 3. MCP stdio 서버의 7개 그래프 쿼리 도구

**왜 가치 있는가:** Jarvis의 Ask AI 포털을 "RAG(벡터 유사도) + Graph(구조 탐색)" 하이브리드로 확장할 때, graphify의 `query_graph`/`get_node`/`get_neighbors`/`shortest_path` API 설계를 그대로 차용하면 됨. Jarvis는 pgvector에 더해 "pg 기반 adjacency table"을 만들면 이 7개 도구를 서버 사이드 API로 제공 가능.

**구현 예상:** `apps/web/src/app/api/graph/query_graph/route.ts`, `apps/web/src/app/api/graph/shortest_path/route.ts` 등. 내부적으로는 재귀 CTE(`WITH RECURSIVE`) 또는 전용 노드/엣지 테이블 + NetworkX 호환 Python 워커 조합.

#### 4. god nodes / surprising connections / suggested questions 분석 레이어

**왜 가치 있는가:** Jarvis의 HR Tutor가 "오늘 읽을 만한 위키 페이지" 또는 "이 질문은 이 질문과 연결되어 있어요" 기능을 구현하는 데 직접 차용 가능. graphify의 `analyze.py:39-58, 131-184, 327-441`를 TypeScript로 옮기는 것만으로도 **지식 그래프 리더보드 / 학습 경로 추천** 피처 완성.

**구현 예상:** 위키 페이지 간의 링크(`[[wikilink]]`)를 엣지로, 페이지를 노드로 NetworkX 그래프 구축 (Python 워커) → god/surprises/questions를 주기적으로 계산 → JSON으로 Next.js에 제공. 혹은 pg의 `pg_graph` 확장 / igraph 등으로 포팅.

#### 5. 자기강화 루프 (query → markdown → 다음 update에서 재흡수)

**왜 가치 있는가:** HR Tutor가 사용자 질문에 답할 때마다 그 Q&A가 "위키의 일부"로 자동 재등록. graphify의 `ingest.save_query_result()` (`ingest.py:238-285`)가 YAML frontmatter로 `type: "query"`, `date`, `question`, `contributor`, `source_nodes`를 박아서 저장 → 다음 재추출 때 자동 노드화. 이것이 Jarvis의 "지식 부채 레이더(Knowledge Debt Radar)"와 환상적으로 맞물림.

**구현 예상:** `apps/worker/src/jobs/ingest-qa.ts` 추가 → 사용자 질문이 답변받을 때마다 `memory/qa_{uuid}.md`로 저장 → 다음날 배치로 pgvector에 임베딩 + 그래프 노드 추가. 이미 PRD(`project_product_strategy.md`)의 "유지보수 DB 활용" 전략과 일치.

### 11.3 가져올 만한 코드 / 모듈

| 우선순위 | 대상 | 경로 (graphify) | 목적지 (Jarvis) | 포팅 난이도 |
|---------|------|-----------------|-----------------|-------------|
| **P0** | SHA256 캐시 해시 로직 | `graphify/cache.py:10-33` | `packages/core/src/cache/content-hash.ts` | 낮음 (30줄) |
| **P0** | Extraction JSON validator | `graphify/validate.py` | `packages/core/src/rag/extraction-schema.ts` (Zod 스키마) | 낮음 |
| **P0** | Security: `validate_url` + SSRF 방어 | `graphify/security.py:26-64` | `packages/core/src/fetcher/safe-fetch.ts` | 중간 (Node fetch API 재작성) |
| **P1** | God nodes / surprises / questions | `graphify/analyze.py` | `packages/analytics/src/graph-analysis.ts` | 중간 (NetworkX → graphology 또는 Python 워커) |
| **P1** | Report generator | `graphify/report.py` | `apps/web/src/app/(portal)/graph-report/page.tsx` | 낮음 (Markdown 포맷팅만) |
| **P1** | Leiden/Louvain community detection | `graphify/cluster.py` | Python 워커 (Next.js에서 호출) | 중간 (graspologic Python 필수) |
| **P2** | MCP 쿼리 도구 7종 | `graphify/serve.py` | `apps/web/src/app/api/graph/*` | 중간 (HTTP API로 재설계) |
| **P2** | Query result 저장 (ingest.py:238-285) | `graphify/ingest.py` | `apps/worker/src/jobs/save-qa.ts` | 낮음 |
| **P2** | Extraction 프롬프트 | `graphify/skill.md:252-301` | `apps/worker/src/prompts/extract-entities.ts` | 중간 (OpenAI Responses API로 재작성) |
| **P3** | vis.js HTML viewer | `graphify/export.py:22-400` | `apps/web/src/components/GraphViewer.tsx` | 중간 (React 래퍼) |
| **P3** | Obsidian vault export | `graphify/export.py:440-680` | 선택적 export feature | 낮음 |
| **P3** | URL ingest (arxiv/tweet/youtube) | `graphify/ingest.py` | `apps/worker/src/jobs/url-ingest.ts` | 중간 |

### 11.4 Jarvis와의 충돌 지점

1. **기술 스택 불일치**: Python(graphify) vs Node/TypeScript(Jarvis). 옵션:
   - (a) Python을 `apps/worker`에 별도 컨테이너로 유지 (Celery 워커처럼)
   - (b) 핵심 모듈을 TypeScript로 포팅 (NetworkX → graphology, tree-sitter는 WASM 버전 `web-tree-sitter`)
   - (c) 절충: 그래프 구축만 Python 워커, 분석/쿼리는 TS
2. **임베딩 패러다임 차이**: graphify는 "no embeddings" / Jarvis는 "pgvector 중심". 병행 가능하지만 설계 필요.
3. **스케일 차이**: graphify는 한 프로젝트 = 한 그래프, Jarvis는 사내 전체 = 다중 그래프(부서별/팀별 sensitivity 분리 필요).
4. **RBAC 부재**: graphify는 권한 개념 없음 → Jarvis의 `sensitivity` 레벨 + RBAC을 그래프 노드/엣지에 적용해야 함 (추가 스키마 필드 필요).
5. **i18n 부재**: graphify 보고서는 영어 고정 → Jarvis의 next-intl ko.json에 맞춰 라벨/템플릿 번역 필요.
6. **Drizzle ORM 없음**: graphify는 graph.json 파일 그대로 사용 → Jarvis는 PostgreSQL 테이블로 노드/엣지/커뮤니티 저장해야 함 (`ltree` / `jsonb` / `pgvector` 조합).

### 11.5 통합 난이도

**중간.** 근거:
- **낮음 요인**: 각 모듈이 독립 함수 단위, 스키마 명확, 테스트 존재, 의존성 명시적.
- **높음 요인**: 언어 포팅(Python→TS), NetworkX→graphology 변환, "호스트 Agent"에서 OpenAI 직접 호출로 전환, 프롬프트 재작성, 서버 사이드 아키텍처 재설계.
- **결론**: P0(캐시/validator/security)만 직접 이식 시 1일, P1(분석 레이어) 포팅 시 2-3일, P2(MCP API) 구현 시 3-5일, P3(viz/ingest/advanced)까지 풀 통합 시 1-2주.

### 11.6 5,000명 사용자에 대한 임팩트 예상

**긍정:**
- "위키 페이지 + 팀 간 링크 + 판례 DB + 에세이"를 하나의 그래프로 통합 → Ask AI가 "이 오프보딩 정책은 2023년 감사 판례에 근거"처럼 구조적 답변 가능.
- god nodes 분석 → "회사에서 가장 자주 참조되는 15개 정책"이 자동 리더보드화.
- surprising connections → "HR 정책과 개발 정책이 실제로 X에서 맞물림"처럼 부서 간 은닉된 관계 발굴.
- Knowledge Debt Radar → cohesion이 낮은 커뮤니티 = 정리 필요한 섹션.
- 증분 업데이트 → 신규 위키 편집 시 관련 섹션만 재그래프화, 컴퓨트 비용 관리 가능.

**리스크:**
- 5,000명 동시 조회 시 `graph.json` 풀로드는 불가 → pg 테이블화 필수.
- sensitivity 레벨 혼재 그래프에서 "엣지 한 개만 봐도 민감 정보 누출"이 가능 → RBAC을 엣지 단위로 필터링해야 함.
- Leiden 재클러스터링은 CPU heavy → 주 1회 배치 + 증분 업데이트 전략.
- 영어 기반 LLM 프롬프트 → 한국어 사내 문서에 대한 품질 검증 필수.

---

## 12. 재사용 가능한 핵심 코드 스니펫

### 12.1 SHA256 per-file 캐시 (cache.py:10-33)

```python
def _body_content(content: bytes) -> bytes:
    """Strip YAML frontmatter from Markdown content, returning only the body."""
    text = content.decode(errors="replace")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4:].encode()
    return content


def file_hash(path: Path) -> str:
    """SHA256 of file contents + resolved path."""
    p = Path(path)
    raw = p.read_bytes()
    content = _body_content(raw) if p.suffix.lower() == ".md" else raw
    h = hashlib.sha256()
    h.update(content)
    h.update(b"\x00")
    h.update(str(p.resolve()).encode())
    return h.hexdigest()
```

**왜 가치 있나:** Jarvis의 위키 페이지는 `reviewed`, `status`, `tags` 같은 frontmatter 메타가 자주 바뀜. 본문 변경이 없는데도 임베딩을 재생성하면 OpenAI 비용 낭비. 이 5분짜리 최적화가 **월 수백만 원의 비용을 절감할 수 있음.**

**재사용 방법 (Jarvis TS 포팅):**
```typescript
// packages/core/src/cache/content-hash.ts
import { createHash } from 'node:crypto';

export function stripMarkdownFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  return end === -1 ? content : content.slice(end + 4);
}

export function contentHash(absolutePath: string, content: string, isMarkdown = false): string {
  const body = isMarkdown ? stripMarkdownFrontmatter(content) : content;
  return createHash('sha256').update(body).update('\x00').update(absolutePath).digest('hex');
}
```

### 12.2 3단 confidence 기반 엣지 모델 (validate.py + skill.md:301)

```python
# validate.py
VALID_CONFIDENCES = {"EXTRACTED", "INFERRED", "AMBIGUOUS"}
REQUIRED_EDGE_FIELDS = {"source", "target", "relation", "confidence", "source_file"}

def validate_extraction(data: dict) -> list[str]:
    errors = []
    node_ids = {n["id"] for n in data.get("nodes", [])}
    for i, edge in enumerate(data.get("edges", [])):
        for field in REQUIRED_EDGE_FIELDS:
            if field not in edge:
                errors.append(f"Edge {i} missing field '{field}'")
        if edge.get("confidence") not in VALID_CONFIDENCES:
            errors.append(f"Edge {i} invalid confidence '{edge['confidence']}'")
        if edge.get("source") not in node_ids:
            errors.append(f"Edge {i} source '{edge['source']}' does not match any node id")
    return errors
```

**왜 가치 있나:** Jarvis의 "LLM 답변 vs 정본 위키 사실 구분"에 꼭 필요. 이미 구현된 `extraction_confidence` 같은 개념이 없다면 반드시 도입해야 함.

**재사용 방법:** Drizzle 스키마 + Zod 스키마 동시 정의
```typescript
// packages/db/src/schema/graph.ts
export const edgeConfidenceEnum = pgEnum('edge_confidence', ['EXTRACTED', 'INFERRED', 'AMBIGUOUS']);

export const wikiEdges = pgTable('wiki_edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceNodeId: uuid('source_node_id').notNull().references(() => wikiNodes.id),
  targetNodeId: uuid('target_node_id').notNull().references(() => wikiNodes.id),
  relation: text('relation').notNull(),
  confidence: edgeConfidenceEnum('confidence').notNull(),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }).notNull(),
  sourceFile: text('source_file'),
  sourceLocation: text('source_location'),
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 12.3 god nodes / surprising connections (analyze.py:39-184)

```python
def god_nodes(G: nx.Graph, top_n: int = 10) -> list[dict]:
    """Return the top_n most-connected real entities - the core abstractions."""
    degree = dict(G.degree())
    sorted_nodes = sorted(degree.items(), key=lambda x: x[1], reverse=True)
    result = []
    for node_id, deg in sorted_nodes:
        if _is_file_node(G, node_id) or _is_concept_node(G, node_id):
            continue
        result.append({
            "id": node_id,
            "label": G.nodes[node_id].get("label", node_id),
            "edges": deg,
        })
        if len(result) >= top_n:
            break
    return result


def _surprise_score(G, u, v, data, node_community, u_source, v_source):
    """Score how surprising a cross-file edge is."""
    score = 0
    reasons = []
    conf_bonus = {"AMBIGUOUS": 3, "INFERRED": 2, "EXTRACTED": 1}.get(
        data.get("confidence", "EXTRACTED"), 1
    )
    score += conf_bonus
    # Cross file-type, cross-repo, cross-community, semantic-similarity, peripheral-to-hub bonuses
    ...
    return score, reasons
```

**왜 가치 있나:** "회사 위키에서 가장 자주 참조되는 개념" + "서로 다른 부서 문서를 이어주는 놀라운 연결"이 곧바로 피처가 됨. HR Tutor의 학습 경로 추천, Knowledge Debt Radar 모두 여기에 의존.

### 12.4 MCP 서버의 BFS/DFS subgraph (serve.py:53-102)

```python
def _bfs(G, start_nodes, depth):
    visited = set(start_nodes)
    frontier = set(start_nodes)
    edges_seen = []
    for _ in range(depth):
        next_frontier = set()
        for n in frontier:
            for neighbor in G.neighbors(n):
                if neighbor not in visited:
                    next_frontier.add(neighbor)
                    edges_seen.append((n, neighbor))
        visited.update(next_frontier)
        frontier = next_frontier
    return visited, edges_seen


def _subgraph_to_text(G, nodes, edges, token_budget=2000):
    """Render subgraph as text, cutting at token_budget (approx 3 chars/token)."""
    char_budget = token_budget * 3
    lines = []
    for nid in sorted(nodes, key=lambda n: G.degree(n), reverse=True):
        d = G.nodes[nid]
        lines.append(f"NODE {sanitize_label(d.get('label', nid))} [src={d.get('source_file', '')} loc={d.get('source_location', '')} community={d.get('community', '')}]")
    for u, v in edges:
        if u in nodes and v in nodes:
            d = G.edges[u, v]
            lines.append(f"EDGE {sanitize_label(G.nodes[u].get('label', u))} --{d.get('relation', '')} [{d.get('confidence', '')}]--> {sanitize_label(G.nodes[v].get('label', v))}")
    output = "\n".join(lines)
    if len(output) > char_budget:
        output = output[:char_budget] + f"\n... (truncated to ~{token_budget} token budget)"
    return output
```

**왜 가치 있나:** Jarvis의 Ask AI 포털 백엔드가 "질문 → 키워드 매칭으로 시작 노드 3개 → BFS 3-depth → 2000토큰 budget 내 텍스트 덤프 → OpenAI 프롬프트에 삽입"을 그대로 재현 가능. 이건 RAG의 "top-k 벡터 매칭"보다 **구조적 맥락**을 더 잘 보존.

### 12.5 쿼리 결과 자기강화 루프 (ingest.py:238-285)

```python
def save_query_result(
    question: str,
    answer: str,
    memory_dir: Path,
    query_type: str = "query",
    source_nodes: list[str] | None = None,
) -> Path:
    """Save a Q&A result as markdown so it gets extracted into the graph on next --update.

    Files are stored in memory_dir with YAML frontmatter that graphify's extractor reads
    as node metadata. This closes the feedback loop: the system grows smarter from both
    what you add AND what you ask.
    """
    memory_dir = Path(memory_dir)
    memory_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    slug = re.sub(r"[^\w]", "_", question.lower())[:50].strip("_")
    filename = f"query_{now.strftime('%Y%m%d_%H%M%S')}_{slug}.md"

    frontmatter_lines = [
        "---",
        f'type: "{query_type}"',
        f'date: "{now.isoformat()}"',
        f'question: "{_yaml_str(question)}"',
        'contributor: "graphify"',
    ]
    if source_nodes:
        nodes_str = ", ".join(f'"{n}"' for n in source_nodes[:10])
        frontmatter_lines.append(f"source_nodes: [{nodes_str}]")
    frontmatter_lines.append("---")

    body_lines = ["", f"# Q: {question}", "", "## Answer", "", answer]
    if source_nodes:
        body_lines += ["", "## Source Nodes", ""]
        body_lines += [f"- {n}" for n in source_nodes]

    content = "\n".join(frontmatter_lines + body_lines)
    out_path = memory_dir / filename
    out_path.write_text(content, encoding="utf-8")
    return out_path
```

**왜 가치 있나:** 가장 재사용성이 높은 패턴. Jarvis의 HR Tutor가 매 질문마다 이걸 호출하면, 다음 주 배치 때 자동으로 "자주 묻는 HR 질문" 커뮤니티가 형성됨 → 지식 부채 자동 시각화.

---

## 13. 원저자의 설계 철학 / 교훈

### 13.1 README / CLAUDE.md에서 추출한 핵심 insight

1. **"Graphify is the graph layer. Penpax is the personal digital twin."** (`README.md:302`) — 그래프를 **기반 기술**로 위치 설정. Jarvis의 "위키+RAG+AI 포털" 역시 graphify를 "사내 knowledge graph 레이어"로 두고 그 위에 포털 UX를 얹는 구조가 가능.
2. **"Every relationship is tagged EXTRACTED, INFERRED, or AMBIGUOUS. You always know what was found vs guessed."** (`README.md:46`) — AI 시대 신뢰 설계의 핵심. **정직함은 기능이다.**
3. **"71.5x fewer tokens per query vs reading the raw files. The first run extracts and builds the graph (this costs tokens). Every subsequent query reads the compact graph instead of raw files — that's where the savings compound."** (`README.md:274`) — 그래프를 "인덱스 빌드 + 반복 조회" 패턴으로 프레이밍. Jarvis의 OpenAI 비용 예산 계산에 이 모델을 적용 가능.
4. **"Think of it this way: the always-on hook gives your assistant a map. The `/graphify` commands let it navigate the map precisely."** (`README.md:125`) — **지도와 네비게이션의 분리.** Jarvis Ask AI가 "사내 전체 주변을 보여줌(map)"과 "특정 질문에 정밀 추적(navigation)"을 구분할 때 이 멘털 모델 그대로 차용 가능.
5. **"Worked examples are the most trust-building contribution."** (`README.md:311`) — 입력 + 실제 출력 + 정직한 review.md. Jarvis 배포 시 "샘플 팀의 실제 Ask AI 로그 + 추출 그래프 + 사람 리뷰"를 공개하는 것이 신뢰 구축의 핵심.
6. **"Semantic similarity edges... Only add these when the similarity is genuinely non-obvious and cross-cutting. Do not add them for trivially similar things."** (`skill.md:280`) — **"놀라운 것만 엣지화"** 원칙. Jarvis의 페이지 간 related-links를 "trivially similar"한 것까지 무차별로 다 만들면 노이즈. 임계값을 높이 잡아야 함.
7. **"The graph is the map. Your job after the pipeline is to be the guide."** (`skill.md:736`) — 정적 보고서보다 대화형 가이드. Ask AI가 "Here is the report. Here is one interesting question. Shall we trace it?"처럼 능동적으로 탐색을 제안.

### 13.2 피해야 할 안티패턴 (graphify 자체에서 관찰된)

1. **Minified 코드를 AST로 긁지 마라.** `graphify-out/GRAPH_REPORT.md`의 god nodes `e()`, `t()`, `n()`, `M()`는 minified bundle을 추출해 노이즈만 쌓인 예. **Jarvis는 `node_modules`, `.next`, `dist`, `build`를 반드시 `.graphifyignore`(또는 동등한) 경로로 제외.**
2. **"모든 파일을 다 먹여라"식 배치 금지.** 3,231 파일 → 2,004 커뮤니티가 되면 대부분 cohesion 0. **코퍼스 경계 설계 먼저, 추출은 나중.**
3. **LLM 응답을 그대로 그래프에 병합하지 마라.** graphify는 `validate.py`로 사후 검증 + 실패 청크 폐기 전략. **Jarvis도 Zod + 런타임 검증 + 실패 내성 필수.**
4. **Python 런타임을 Node 프로젝트에 직접 의존시키지 마라.** 별도 워커 프로세스 / 컨테이너로 격리.
5. **그래프 전체를 단일 JSON으로 풀로드하지 마라.** `graphify-out/graph.json`이 72MB임을 보라. 프로덕션은 반드시 DB 테이블로.
6. **출력 포맷이 너무 많으면 유지보수 부담.** 9개 플랫폼 × 여러 export 포맷 = 많은 조합 = 많은 버그. Jarvis는 초기 버전에 2~3개만 (GRAPH_REPORT.md, graph.json, Next.js 뷰어).

### 13.3 Jarvis 적용 시 교훈 요약

1. **3단 confidence 라벨은 비용 없이 도입할 수 있는 최고 가치 아이템.**
2. **SHA256 content hash 캐시는 월 수백만원짜리 티켓 사이즈.**
3. **"정직한 엣지 vs 추측한 엣지" 구분은 위키 정본성 유지에 필수.**
4. **god nodes / surprising connections 분석은 HR Tutor 추천 엔진의 시드.**
5. **자기강화 루프(query → memory → 재추출)는 Knowledge Debt Radar의 핵심 메커니즘.**
6. **Leiden 커뮤니티 탐지는 "유지보수 DB"의 자연스러운 파티셔닝 전략.**
7. **"map + guide" UX는 Ask AI 포털 디자인의 북극성.**
8. **`.graphifyignore` 같은 명시적 exclusion은 초기 기능 목록에 반드시 포함.**
9. **모든 엣지에 `source_file:source_location`을 달아 출처 추적 보장.**
10. **Python 생태계의 진짜 강점(NetworkX, tree-sitter, Leiden, Whisper)을 버리지 말고 별도 워커로 살려라.**

---

## 부록 A — 파일별 LOC / 중요도 매트릭스

| 파일 | 크기 | 복잡도 | Jarvis 가치 |
|------|------|--------|-------------|
| `extract.py` | 118KB | 매우 높음 | 중간 (20개 언어 AST는 사내 대부분 언어만 선별) |
| `skill.md` | 55KB | 높음 | 높음 (프롬프트 재사용) |
| `export.py` | 40KB | 높음 | 중간 (HTML/Obsidian만 발췌) |
| `__main__.py` | 36KB | 중간 | 낮음 (9 플랫폼 설치자 불필요) |
| `analyze.py` | 21KB | 중간 | **매우 높음** |
| `detect.py` | 19KB | 중간 | 중간 |
| `serve.py` | 15KB | 중간 | **매우 높음** |
| `ingest.py` | 10KB | 중간 | 높음 |
| `report.py` | 7KB | 낮음 | 높음 |
| `security.py` | 7KB | 중간 | 높음 (SSRF 방어) |
| `hooks.py` | 7KB | 중간 | 낮음 (git 훅은 부차적) |
| `wiki.py` | 7KB | 낮음 | 중간 |
| `watch.py` | 6KB | 낮음 | 낮음 |
| `transcribe.py` | 6KB | 낮음 | 낮음 (Whisper 필요시) |
| `cluster.py` | 5KB | 중간 | **매우 높음** |
| `benchmark.py` | 5KB | 낮음 | 중간 |
| `cache.py` | 5KB | 낮음 | **매우 높음** |
| `build.py` | 4KB | 낮음 | 높음 |
| `validate.py` | 3KB | 낮음 | **매우 높음** |
| `manifest.py` | 0.2KB | 매우 낮음 | 낮음 |

## 부록 B — Jarvis 통합 우선순위 로드맵 (제안)

**Sprint 1 (1주):**
- P0 코드 이식: cache hash, extraction validator, safe-fetch (Node로 포팅)
- Drizzle 스키마에 edge_confidence enum + confidence_score 컬럼 추가
- 기존 위키 페이지 간 링크를 노드/엣지로 마이그레이션 (1차 백필)

**Sprint 2 (1주):**
- Python 워커 컨테이너 (apps/worker-py) 설립 — NetworkX, graspologic, tree-sitter 설치
- Leiden 클러스터링 + god nodes 분석을 주 1회 배치로 실행
- Next.js에서 결과를 읽어 "팀 대시보드"에 god nodes top-10, cohesion score 표시

**Sprint 3 (1주):**
- Ask AI 포털에 graph query API 추가 (`/api/graph/query_graph`, `/api/graph/shortest_path`)
- Answer pipeline을 "pgvector top-k + graph BFS depth-3" 하이브리드로 전환
- 자기강화 루프 구현 (Q&A → memory markdown → 재임베딩)

**Sprint 4 (1주):**
- surprising connections + suggested questions를 HR Tutor 추천 엔진에 통합
- Knowledge Debt Radar 대시보드 (cohesion 낮은 커뮤니티 리스트 + AMBIGUOUS 엣지 리뷰 큐)
- RBAC + sensitivity 엣지 필터링 구현

---

*이 분석은 graphify v0.3.29 기준이며, 2026-04-14에 수행되었다. graphify는 여전히 활발히 개발 중이므로 주요 업데이트는 CHANGELOG.md를 참고.*

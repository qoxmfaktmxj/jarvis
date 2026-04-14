# mindvault 프로젝트 분석 — Jarvis 통합 관점

> 분석 일자: 2026-04-14
> 대상 경로: `C:\Users\kms\Desktop\dev\reference_only\mindvault`
> 패키지명/버전: `mindvault-ai` v0.5.0 (PyPI)
> 라이선스: MIT
> 분석 목표: Jarvis(Next.js 모노레포, PostgreSQL+pgvector, OpenSearch, OpenAI, 5000명 사내 포털)로 이식 가능한 설계·코드·아이디어 추출

---

## 1. 프로젝트 개요

### 이름 뜻
"MindVault" = **지식(Mind) + 금고(Vault)**. 이름 그대로 흩어져 있는 지식을 영구 저장소로 모아두는 **장기 기억(long-term memory)** 도구이다. 단, 실제 의도는 "개인 지식관리"가 아니라 **AI 코딩 도구(Claude Code, Cursor, Copilot 등)의 세션 연속성**을 확보하는 것이다 (`README.md:16-28`).

### 한 문단 요약
mindvault는 임의 폴더(코드베이스 + 문서 + Obsidian vault + PDF + Office 파일)를 **3-Layer 지식 베이스**(BM25 Search + NetworkX Graph + 마크다운 Wiki)로 자동 변환하고, 질의 시 단일 API(`mindvault query "..."`)로 통합 컨텍스트를 반환하는 Python 단일 패키지 CLI 도구이다. 핵심 가치 제안은 "질의당 ~900토큰으로 60배+ 절감"과 "git/파일 훅을 통한 자동 갱신 + 세션 간 Why/How 지식 축적"이다 (`README.md:279-317`, `SKILL.md:30-34`).

### 해결하려는 문제
**"AI 코딩 도구는 세션이 끝나면 맥락을 전부 잊는다"**. 새 세션을 열 때마다 프로젝트 구조·결정사항·함수 관계를 재설명하거나 다수의 Read 도구 호출로 파일을 열어야 한다. 원저자가 제시한 정량 측정(Claude Opus 4.6, 동일 질문): **MindVault OFF 6회 도구호출 + 61,800+ 토큰 + 55초 vs MindVault ON 0회 + ~0토큰 + 즉시** (`README.md:306-317`).

기존 도구들(qmd=BM25만, graphify=그래프만, llm-wiki-compiler=위키만)이 **3파편화 상태**였던 것을 하나의 PyPI 패키지 + 설정 제로로 통합한 것이 핵심 차별점이다 (`README.md:20-27`).

### 타겟 사용자
- 1차 타겟: **AI 코딩 도구(Claude Code/Cursor/Copilot 등)를 쓰는 개인 개발자** — `README.md:358` 명시.
- 2차 타겟: Obsidian vault를 가진 개발자 — 기존 vault를 인덱싱하거나, mindvault-out/wiki/를 vault로 열어 Graph View 활용 (`README.md:362-399`).
- **엔터프라이즈 타겟 아님** — 5000명 동시 사용, 권한 관리, 감사 로그, RBAC 등은 전혀 고려되지 않는다. 설계 자체가 "한 사람의 홈 디렉토리"에 모든 것을 쌓는 방식이다 (`~/.mindvault/`, `~/.claude/hooks/`).

---

## 2. 기술 스택 & 아키텍처

### 언어/프레임워크
- **언어**: Python 3.10+ 단일 언어 (`pyproject.toml:11`)
- **빌드 시스템**: setuptools + wheel, `src/` layout
- **배포**: PyPI (`mindvault-ai` 패키지명, CLI 엔트리 `mindvault`)
- **UI 프레임워크 없음**: CLI + 자동 생성 HTML 단일 파일

### 핵심 의존성 (총 15개)
```toml
dependencies = [
    "networkx",                   # 그래프 엔진 + 커뮤니티 탐지
    "tree-sitter>=0.23.0",        # AST 파서 커널
    "tree-sitter-python",         # 이하 13개 언어 파서
    "tree-sitter-typescript",
    "tree-sitter-javascript",
    "tree-sitter-go",
    "tree-sitter-rust",
    "tree-sitter-java",
    "tree-sitter-swift",
    "tree-sitter-kotlin",
    "tree-sitter-c",
    "tree-sitter-cpp",
    "tree-sitter-ruby",
    "tree-sitter-c-sharp",
    "python-docx>=1.0",           # Word 문서 텍스트 추출
    "openpyxl>=3.1",              # Excel 시트 텍스트 추출
    "python-pptx>=0.6.21",        # PowerPoint 텍스트 추출
]
```
(`pyproject.toml:14-32`)

- **HTTP 클라이언트 없음** — 전부 `urllib.request` 표준 라이브러리만 사용 (`llm.py:1-11`, `ingest.py:7`). `requests` 같은 의존성을 의도적으로 피함 → 경량성 & 설치 속도.
- **외부 벡터 DB 없음** — pgvector, qdrant, faiss, chromadb 어느 것도 없다. 전부 JSON 파일.
- **검색 엔진 없음** — Elasticsearch, Meilisearch, OpenSearch 없음. 순수 Python BM25 구현.
- **LLM 라이브러리 없음** — OpenAI/Anthropic SDK 아님. urllib으로 HTTP 직접 호출.

### 디렉토리 구조
```
mindvault/
├── pyproject.toml                 # 빌드·의존성
├── README.md (35KB) / README.en.md (33KB)   # 한글/영문 doc
├── CLAUDE.md                      # 프로젝트 요약 for Claude Code
├── ARCHITECT.md / BUILDER.md / REVIEWER.md  # 3-Man-Team 하네스 정의
├── skill/
│   └── SKILL.md                   # Claude Code `/mindvault` 스킬 정의
├── src/mindvault/                 # 실제 패키지 (29개 .py)
│   ├── __init__.py                # Lazy import 허브
│   ├── __main__.py                # python -m mindvault
│   ├── cli.py                     # argparse CLI 디스패처 (592 LOC)
│   ├── pipeline.py                # run() / run_incremental() 오케스트레이터
│   ├── compile.py                 # detect→extract→build→cluster→wiki→export 체인
│   ├── detect.py                  # 파일 분류 + 스킵 디렉토리
│   ├── discover.py                # 프로젝트 자동 감지 (14개 마커)
│   ├── extract.py                 # tree-sitter AST + Markdown/PDF/JSON 파서 (1200 LOC)
│   ├── build.py                   # networkx DiGraph 조립
│   ├── cluster.py                 # greedy modularity community detection
│   ├── analyze.py                 # god_nodes + surprising_connections
│   ├── wiki.py                    # 커뮤니티 기반 마크다운 위키 생성 (574 LOC)
│   ├── index.py                   # BM25 inverted index 생성
│   ├── search.py                  # BM25 쿼리
│   ├── query.py                   # 3-layer 통합 질의 (383 LOC)
│   ├── export.py                  # graph.json + vis.js HTML
│   ├── report.py                  # GRAPH_REPORT.md
│   ├── lint.py                    # wiki/graph consistency 검사 + LLM 모순 탐지
│   ├── ingest.py                  # 외부 파일/URL 수집 + LLM 개념 추출 (645 LOC)
│   ├── global_.py                 # 다중 프로젝트 통합 빌드
│   ├── daemon.py                  # macOS launchd / Windows schtasks / Linux systemd
│   ├── watch.py                   # mtime polling 파일 감시
│   ├── hooks.py                   # git/Claude Code 훅 설치
│   ├── integrations.py            # AI 도구 자동 감지 + 설정 주입
│   ├── llm.py                     # LLM 자동 감지 + OpenAI/Anthropic/Ollama/Gemma 호출
│   ├── cache.py                   # SHA256 해시 기반 incremental cache
│   ├── config.py                  # ~/.mindvault/config.json
│   ├── migrate.py                 # 0.4.0 canonical ID 자동 마이그레이션
│   └── pipeline.py 등
├── tests/                         # 8개 테스트 파일
└── handoff/                       # Arch↔Bob↔Richard 에이전트 간 상태 파일
```

### 엔트리 포인트
- **CLI**: `mindvault.cli:main` (`pyproject.toml:41-42`)
  - 13개 서브커맨드: `install`, `query`, `ingest`, `lint`, `status`, `watch`, `update`, `mark-dirty`, `flush`, `config`, `global`, `daemon`, `doctor`
- **Claude Code Skill**: `/mindvault` (`skill/SKILL.md:4`)
- **Python API**: `mindvault.run(source_dir, output_dir)` / `mindvault.query(...)` (lazy import via `__getattr__` — `__init__.py:6-58`)
- **Daemon entrypoint**: `python -m mindvault.daemon run <root>` (`daemon.py:408-413`)

### 파이프라인 데이터 흐름
```
소스(코드+문서+PDF+Office+JSON/YAML)
  ↓
[1 detect]     파일 분류(code/document/data/paper/image) + SKIP_DIRS 제외
  ↓
[2 extract]    code→tree-sitter AST / doc→Markdown+PDF+JSON 구조 파싱
  ↓ (선택) extract_semantic — LLM으로 개념 추출 (cache된 경우 skip)
  ↓
[3 build]      networkx.DiGraph + dangling ref 노드 생성
  ↓
[4 cluster]    greedy_modularity_communities (무방향 투영)
  ↓
[5 analyze]    god_nodes + surprising_connections + suggest_questions
  ↓
[6 wiki]       커뮤니티당 1 페이지 .md + INDEX.md + _concepts.json
  ↓
[7 export]     graph.json + graph.html (vis.js)
  ↓
[8 index]      BM25 inverted index (한국어/CJK 지원)
  ↓
mindvault-out/  또는  ~/.mindvault/ (global mode)
```
(`pipeline.py:16-58`, `compile.py:194-242`)

---

## 3. 핵심 기능 (Feature Inventory)

### 3.1 노트/문서 작성
- **직접 편집 기능 없음**. mindvault는 **리더** 시스템이다. 사용자가 수동 편집한 파일을 인덱싱/그래프화할 뿐이다.
- 단, 생성된 wiki 페이지 내 `<!-- user-notes -->` 마커 이후 영역은 재생성 시 보존된다 (`wiki.py:362-382`). 즉 자동 생성 본문 + 사용자 수작업 메모 공존.

### 3.2 연결/백링크
- **Obsidian 스타일 `[[wikilinks]]` 기본 지원** (`extract.py:790-801`, `wiki.py:14-20`).
- **마크다운 링크 `[text](url)` → 그래프 references 엣지** (`extract.py:774-787`). 외부 URL은 제외, 로컬 파일만.
- **프론트매터 YAML 파싱**: `title`, `tags`, `aliases` 등을 header 노드 메타데이터로 (`extract.py:566-634`).
- **인라인 `#tag` 자동 추출**: Unicode-safe, `#한글`도 지원, 인라인 코드 스팬은 제외, 3-8자리 헥스 컬러 코드 제외 (`extract.py:637-656`).

### 3.3 태그/카테고리
- 노드에 `tags: list[str]` 필드 자동 부착 (`extract.py:806-831`).
- 클러스터는 **그래프 구조 기반 자동 커뮤니티 탐지** — 사용자가 태그/카테고리를 직접 관리하지 않는다. `greedy_modularity_communities` (`cluster.py:10-33`).

### 3.4 검색
- **BM25 Okapi** (k1=1.5, b=0.75) 순수 Python 구현 (`search.py:84-85`).
- **한국어/CJK 토크나이저**: 1자 이상 토큰 유지(영어는 3자+), Hangul/CJK 유니코드 범위 직접 체크 (`index.py:13-40`).
- **CJK Fuzzy prefix/substring 매칭**: 정확 매치 실패 시 부분 일치로 폴백 (`search.py:107-113`).
- **IDF**: `log(N / (1 + df))` (`index.py:68-79`).
- **스니펫**: 매치 위치 ±30자 컨텍스트 + ellipsis (`search.py:41-57`).

### 3.5 AI 기능
- **개념 추출 (`extract_semantic`)**: LLM에게 프롬프트 전송 → JSON 노드/엣지 반환 (`extract.py:1028-1191`).
- **외부 자료 수집 (`ingest`)**: 파일/URL/디렉토리를 읽어 LLM으로 개념화 → 기존 커뮤니티에 자동 병합 or 새 페이지 생성 (`ingest.py:593-645`).
- **모순 탐지 (`lint`)**: 같은 개념이 여러 페이지에 있을 때 로컬 LLM에게 모순 여부 판정 요청 (`lint.py:10-53`). API 키는 절대 사용 안 함 → 비용 발생 방지.
- **Auto-context hook**: `UserPromptSubmit` 훅으로 사용자 프롬프트마다 자동으로 `mindvault query` 실행 → `<mindvault-context>` 태그로 컨텍스트 주입 (`hooks.py:14-99`).

---

## 4. 지식 구조 모델링 ⭐⭐⭐

### 4.1 노드 단위
노드 타입(`entity_type`)이 명시적으로 **8가지**로 분류되어 있다:

| entity_type | 출처 | 예시 ID |
|-------------|------|---------|
| `file` | 파일 레벨 합성 노드 (프론트매터/태그 집계용) | `notes__plan_md::file::` |
| `module` | Python 모듈 / JS 파일 등 | `src__auth__login_py::module::login` |
| `class` | 클래스 정의 | `src__auth__login_py::class::AuthService` |
| `function` | 최상위 함수 | `src__auth__login_py::function::validate` |
| `method` | 클래스 메서드 | `src__auth__login_py::method::login` |
| `header` | 마크다운 `#`/`##`/`###` 헤더 | `notes__plan_md::header::auth_rewrite_plan` |
| `block` | 코드 블록 안의 언어(has_code_example 관계) | `notes__plan_md::block::python` |
| `concept` | LLM이 추출한 자유 개념 | `docs__adr_md::concept::rbac` |

(`extract.py:104-134`, `extract.py:305-341`)

### 4.2 Canonical ID 체계 (v0.4.0+, Critical Design Decision)
```
{rel_path_slug}::{kind}::{local_slug}
```
- `rel_path_slug`: `index_root` 기준 상대경로를 `/` → `__` 치환 (`src/auth/login.py` → `src__auth__login_py`)
- `kind`: entity_type (file/module/class/function/header/block/concept 등)
- `local_slug`: `entity_name`을 lowercase + 특수문자 `_` 변환

**이전 스키마의 치명적 충돌 문제**:
```
src/auth/utils.py::validate  →  utils_validate  ←
src/db/utils.py::validate    →  utils_validate  ← 동일 ID, 노드 병합됨 ❌
```
**v0.4.0의 해결**:
```
src/auth/utils.py::validate  →  src__auth__utils_py::function::validate
src/db/utils.py::validate    →  src__db__utils_py::function::validate   ✅
```
(`extract.py:62-134`, `README.md:769-780`)

추가 `_make_ref_id()`: 아직 해소되지 않은 cross-file 참조용 placeholder (`__unresolved__::ref::{slug}`) — 빌드 단계에서 실제 canonical ID로 재연결 (`extract.py:137-144`).

### 4.3 관계 모델 (그래프, Zettelkasten 아님)
DAG/트리가 아닌 **DiGraph**. 관계 타입 목록:

| relation | 출처 | 설명 |
|----------|------|------|
| `contains` | EXTRACTED | 모듈→클래스, 클래스→메서드, 헤더 계층 parent→child |
| `calls` | EXTRACTED | 함수 호출 (cross-file일 경우 ref 노드 경유) |
| `imports` | EXTRACTED | import/use/require 문 |
| `extends` | EXTRACTED | 클래스 상속, interface, protocol |
| `references` | EXTRACTED | 마크다운 링크, wikilink |
| `has_code_example` | EXTRACTED | 헤더→언어 블록 |
| `related_to` / `implements` | INFERRED (LLM) | 개념 추출 결과 |
| `shares_name_with` | INFERRED | 글로벌 모드의 크로스 프로젝트 엣지 |
| `tagged` | high | JSON/YAML 파일의 tags/keywords 배열 |

모든 엣지에 `confidence_score` (0.0~1.0) + `weight` 필드 포함 (`extract.py:346-353`, `ingest.py:219-232`).

### 4.4 메타데이터
노드는 최소 다음을 포함:
```json
{
  "id": "src__auth__login_py::function::validate",
  "label": "validate",
  "file_type": "code|document|data|placeholder",
  "entity_type": "function|class|...",
  "source_file": "/abs/path/login.py",
  "source_location": "L42",
  "tags": ["architecture", "security"],      // optional, Obsidian-style
  "metadata": {"title": "...", "status": "..."}  // optional, frontmatter
}
```

### 4.5 스토리지
**파일시스템 단일 스토리지**. DB 없음. 블록 에디터 없음.
- `mindvault-out/graph.json` — `networkx.node_link_data` + `communities` dict + `schema_version: 2` (`export.py:21-41`)
- `mindvault-out/wiki/*.md` — 커뮤니티당 1 마크다운 파일
- `mindvault-out/wiki/_concepts.json` — `{concept: [page_filenames]}` 역색인
- `mindvault-out/wiki/queries/*.md` — 저장된 질의 결과 (`query.py:125-209`)
- `mindvault-out/wiki/ingested/*.md` — `mindvault ingest`로 들어온 외부 자료 (`ingest.py:299-455`)
- `mindvault-out/search_index.json` — BM25 inverted index (tokens + IDF)
- `mindvault-out/.mindvault_hashes.json` — SHA256 파일 캐시
- `mindvault-out/.mindvault_dirty.json` — 미처리 dirty 파일 리스트

**글로벌 모드**: `~/.mindvault/` (홈 디렉토리) 하위에 동일 구조 + `projects.json` 매니페스트 (`global_.py:182-190`).

---

## 5. LLM 사용 패턴 ⭐⭐⭐

### 5.1 모델 우선순위 (자동 감지)
`llm.py:13-121`의 `detect_llm()` 우선순위:

1. `config.llm_endpoint` (사용자 오버라이드)
2. **Gemma MLX on localhost:8080** (OpenAI-compatible, 무료, is_local=True)
3. **Ollama** — `config.ollama_host` → `$OLLAMA_HOST` → `localhost:11434`. 모델은 `gemma3 > gemma > qwen3 > qwen > llama3` 순으로 자동 선택 (`llm.py:144-164`)
4. **Anthropic Claude Haiku** (`ANTHROPIC_API_KEY` env var) — 비용 발생, 사용자 동의 필요
5. **OpenAI gpt-4o-mini** (`OPENAI_API_KEY` env var) — 비용 발생, 사용자 동의 필요
6. None

로컬 LLM은 동의 없이 호출, 원격 API는 비용 추정 후 `confirm_api_usage()` 프롬프트 (tty 확인 필수) (`llm.py:322-349`).

### 5.2 호출 위치
**4군데**에서 LLM 사용:
1. `extract_semantic()` — 문서에서 개념/관계 추출 (`extract.py:1028-1191`)
2. `ingest._llm_extract()` — 외부 자료 개념 추출 (`ingest.py:159-177`)
3. `lint._check_contradiction_with_llm()` — 위키 모순 판정 (**로컬 LLM만**, API 키 사용 금지) (`lint.py:10-53`)
4. (Skill 경유) Claude Code 자체가 `/mindvault` 실행 시 추출 수행 — 구독 토큰만 사용

### 5.3 프롬프트 패턴
**하드코딩된 추출 프롬프트** (`extract.py:1084-1096`, `ingest.py:16-28`):
```python
_EXTRACTION_PROMPT = """Extract key concepts and relationships from this text.
Return JSON only:
{
  "nodes": [{"id": "slug_name", "label": "Human Name", "file_type": "document", "source_file": "path"}],
  "edges": [{"source": "id1", "target": "id2", "relation": "references|implements|related_to", "confidence": "EXTRACTED|INFERRED", "confidence_score": 0.8}]
}

Rules:
- Extract named concepts, entities, technologies, decisions
- EXTRACTED: explicitly stated relationship
- INFERRED: reasonable inference
- Keep nodes under 30 per document
- Keep edges under 50 per document"""
```

**모순 판정 프롬프트** (한국어로 하드코딩) (`lint.py:30-36`):
```
다음 두 설명이 같은 개념 "{concept}"에 대해 모순되는지 판단하세요.
설명 1: {snippets[0]["text"]}
설명 2: {snippets[1]["text"]}

JSON으로만 답하세요: {"contradiction": true/false, "reason": "..."}
```

### 5.4 구조화된 출력
**JSON을 문자열로 강제** — 모델의 "function calling"이나 "tool use" 기능을 사용하지 않는다. 대신 "Return JSON only" 지시 + 마크다운 코드블록 스트리핑 로직 (`ingest.py:179-236`):
```python
if cleaned.startswith("```"):
    lines = cleaned.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    cleaned = "\n".join(lines)
data = json.loads(cleaned)
```

파싱 실패 시 **파일 스킵** — 크래시하지 않음. `print(Warning, file=sys.stderr)` + 다음 파일 진행 (`extract.py:1181-1184`).

### 5.5 비용 추정
**모델별 가격 하드코딩** (`llm.py:293-319`):
- Haiku: input $0.80/M, output $4.00/M
- GPT-4o-mini: input $0.15/M, output $0.60/M
- Local: $0.00

입력 토큰 = `len(text) / 4`, 출력 토큰 = 입력 / 4 (추정). 제출 전에 비용을 표시하고 동의 받음.

### 5.6 캐시
**SHA256 파일 해시 기반** — 파일 내용이 안 바뀌면 LLM 재호출 안 함 (`extract.py:1103`, `cache.py:27-56`). 이는 비용 절감 + 속도 개선의 핵심 메커니즘.

### 5.7 Auto-context hook (강제 주입 패턴)
**가장 독창적인 설계**. `~/.claude/hooks/mindvault-hook.sh`를 `UserPromptSubmit` 훅으로 등록 → 사용자가 프롬프트를 보낼 때마다 시스템이 강제로 mindvault query 실행 (`hooks.py:14-99`):

```bash
RESULT=$($TIMEOUT_CMD "$MINDVAULT" query "$PROMPT" --budget 5000 $QUERY_ARGS 2>/dev/null | head -20)
if [ -n "$RESULT" ]; then
    echo "<mindvault-context>"
    echo "$RESULT"
    echo "</mindvault-context>"
fi
```

필터:
- 프롬프트 길이 < 10자 → skip ("ㅇㅇ", "해")
- `/`로 시작 → skip (slash command)
- 10초 timeout
- 실패해도 silent exit (AI로 prompt는 정상 전달)

**설계 철학**: "AI가 자발적으로 CLAUDE.md 지시를 지키기를 기대하지 말고, 시스템 훅으로 강제 주입하라" (`README.md:539-557`).

---

## 6. 임베딩 & 벡터 검색 ⭐⭐⭐

### 6.1 사용 여부
**사용 안 함**. pgvector, faiss, qdrant, chromadb, sentence-transformers 등 어느 것도 import하지 않는다.

### 6.2 이유 (추측이 아니라 README 명시)
`README.md:56-61`:
> | **Search** | 키워드 매칭으로 관련 위키 페이지 발견 | 0 (로컬 연산) | BM25 역색인 |

즉 **의도적으로 키워드(BM25) 기반만 채택**. 추정되는 근거:
1. 임베딩 모델 설치 시 GB 단위 의존성 필요 → 경량성 철학 위배
2. 로컬 임베딩은 느림(수천 파일 → 분 단위), 원격 임베딩은 비용/네트워크
3. CJK에서는 BM25에 프리픽스 매칭을 추가하면 실용적으로 충분
4. **위키 페이지는 이미 클러스터링된 응집 덩어리**라 BM25 top-3도 정확도가 높음

### 6.3 유사 노트 추천?
**그래프 이웃으로 대체**. 벡터 유사도 대신 `BFS depth 2` (기본) 또는 `DFS depth 4` (--dfs 모드)로 이웃 수집 (`query.py:48-113`). "유사한 노트"가 아니라 "관련된 노트"를 반환.

### 6.4 Jarvis 관점에서의 시사점
- Jarvis는 이미 OpenSearch + pgvector를 운영 중 → 벡터 검색 레이어 있음.
- mindvault의 BM25는 **"단독 CLI에서 외부 서비스 없이 작동"**이 목적이므로 Jarvis에 직접 이식하기보다는 **쿼리 구성 전략**(3-Layer → Search + Graph + Wiki)을 차용하는 것이 타당.
- **CJK BM25 토크나이저**(`index.py:13-40`)는 Jarvis의 한국어 검색 품질 개선 아이디어로 참고 가치 있음.

---

## 7. 에디터/렌더링

### 7.1 에디터
**자체 에디터 없음**. 사용자가 선호하는 에디터 사용(VS Code, Obsidian, Cursor 등). mindvault는 파일을 읽을 뿐.

### 7.2 렌더링
- **마크다운 렌더링 없음** — 위키 페이지는 plain text `.md`. 사용자가 `cat` 하거나 Obsidian에서 열거나 `mindvault query`로 가져감.
- **HTML 시각화**: `graph.html` 단일 파일. vis-network.min.js를 CDN(unpkg)에서 로드 (`export.py:117`):
  ```html
  <script src="https://unpkg.com/vis-network/standalone/uml/vis-network.min.js"></script>
  ```
  - 인터랙티브 그래프 뷰, 커뮤니티별 색상 + 검색창 + 체크박스 필터
  - 5000 노드 초과 시 자동 스킵 (`export.py:58-60`)

### 7.3 수식/다이어그램
- 수식(LaTeX/KaTeX) 지원 없음
- 다이어그램(Mermaid, PlantUML) 지원 없음
- **코드 블록만 노드화** — `has_code_example` 관계로 언어를 그래프에 반영

### 7.4 미디어 첨부
- **이미지**: 스킵 (`ingest.py:53-55`에 "Known Gap"으로 명시). Vision API 통합 안 됨
- **PDF**: `pdftotext` 시스템 바이너리 서브프로세스 호출 (`ingest.py:122-133`, `extract.py:897-918`). 30초 timeout
- **Office**: python-docx/openpyxl/python-pptx로 텍스트만 추출 (`ingest.py:64-119`). 이미지/차트/수식 무시

---

## 8. 지식 그래프/시각화

### 8.1 그래프 뷰
- **vis-network.js** (CDN 로드, Obsidian 스타일) — `export.py:44-186`
- 스타일:
  - 노드 크기: degree 비례 (`size = 10 + (deg/max_degree) * 40`)
  - 노드 색상: 커뮤니티별 고정 팔레트 10색 (`#e6194b`, `#3cb44b`, ...)
  - 엣지: relation 레이블 표시, 방향 화살표
  - 물리 엔진: `barnesHut`, `gravitationalConstant: -3000`
- 컨트롤: 검색 텍스트박스, 커뮤니티 체크박스 필터
- 툴팁: `{label} (degree: N, community: {label})`

### 8.2 클러스터링/커뮤니티
- **알고리즘**: `networkx.algorithms.community.greedy_modularity_communities` (`cluster.py:9-33`)
- **입력**: DiGraph → 무방향으로 투영한 뒤 클러스터링. 연결이 없으면 전부 1개 커뮤니티로 폴백.
- **Cohesion 점수** (`cluster.py:36-68`): `internal_edges / possible_edges` (0.0~1.0). 단일 노드는 1.0.
- **커뮤니티 레이블**: 최다 degree 상위 2개 노드의 label을 `" & "` 조인 (`wiki.py:23-34`). 예: `"AuthService & login"`.
- 편집 없음 — 자동.

### 8.3 시각화 라이브러리
**vis-network만 사용**. d3, sigma, cytoscape, force-graph 등은 쓰지 않음.
- 이유(추정): 단일 파일 HTML + CDN만으로 작동 + 사용자가 `open mindvault-out/graph.html` 한 번에 볼 수 있는 단순함
- 성능 한계: 5000노드까지만 렌더 (`export.py:58-60`)

### 8.4 분석 기능
`analyze.py`에 3가지 분석:
1. **`god_nodes(G, top_n=5)`**: degree 내림차순 상위 노드. "어떤 모듈이 허브인가?"
2. **`surprising_connections(G, communities)`**: cross-community 엣지 중 combined_degree가 낮은 것 top 5. "저 두 클러스터는 왜 연결돼 있지?"
3. **`suggest_questions(G, communities, labels)`**: 커뮤니티 쌍 기반 자동 질문 생성. "How does {Community A} relate to {Community B}?"

이 세 가지는 `GRAPH_REPORT.md`에 기록됨(`report.py:10-99`).

---

## 9. 데이터 파이프라인

### 9.1 Full pipeline (`compile.py:194-242`)
```
detect() → extract_ast + extract_document_structure + extract_semantic
         → _merge_extractions (dedupe by id)
         → build_graph
         → _finalize_and_export (shared tail)
              → cluster + score_cohesion
              → _generate_labels
              → generate_wiki (all) or update_wiki (changed only)
              → export_json + export_html
              → god_nodes + surprising_connections + suggest_questions + generate_report
```

### 9.2 Incremental pipeline (`pipeline.py:210-341`)
1. **Migration check**: 기존 `graph.json`이 v1 스키마면 자동 마이그레이션 (`migrate.py`)
2. **Dirty detection**: `cache.get_dirty_files` — SHA256 해시 비교
3. **Partial extraction**: dirty code → `extract_ast`, dirty docs → `extract_document_structure`
4. **Merge**: 기존 `graph.json`에서 dirty 파일 관련 노드/엣지 제거 → 새 추출 결과 추가
5. **Rebuild graph**: `build_graph(merged_extraction)`
6. **`_finalize_and_export(incremental=True)`**: 변경된 커뮤니티만 위키 업데이트 + search index 갱신
7. **Cache update**: 처리된 파일을 SHA256 캐시에 기록

### 9.3 Changed-node diff (`compile.py:50-110`)
**위키 증분 갱신의 핵심**. 이전/현재 그래프를 비교해 "진짜 변경된" 노드만 식별:
- 추가된 노드
- 삭제된 노드의 이웃 (그 커뮤니티도 갱신 대상)
- 양쪽에 존재하는 노드 중 **이웃셋이 달라진** 노드
- `source_file`이 달라진 노드

변경 노드를 포함한 커뮤니티만 `update_wiki`로 재생성하며, **사용자 노트(`<!-- user-notes -->` 마커)는 보존** (`wiki.py:362-382`).

### 9.4 외부 자료 수집 파이프라인 (ingest.py)
```
파일 또는 URL
  ↓
_extract_text_from_file (md/txt/rst/pdf/docx/xlsx/pptx 분기)
  또는 urllib으로 URL fetch → _strip_html
  ↓
sources/에 복사
  ↓
detect_llm → _llm_extract → JSON {nodes, edges}
  ↓
_classify_into_communities — _concepts.json과 label 오버랩 기반 매칭
  ↓
- Merge: 기존 위키 페이지에 "## Ingested Sources" 섹션 추가 + Key Facts 스니펫
- New: wiki/ingested/{slug}.md 신규 생성
  ↓
_update_search_index_for_ingested
```

### 9.5 Global pipeline (`global_.py:12-199`)
- **Project discovery**: 14개 마커 파일(`pyproject.toml`, `package.json`, `CLAUDE.md`, etc.) BFS walk로 탐색 (`discover.py:11-40`)
- **Per-project build**: 각 프로젝트를 독립 `run()` 실행 → `{project_name}/graph.json` 저장
- **ID prefix**: 각 노드 ID 앞에 `{project_name}/` 추가 → 네임스페이스 충돌 방지
- **Cross-project edges**: 같은 label 가진 노드들을 `shares_name_with` 관계로 연결. **Generic label 블랙리스트** (Props, default, index, main, App, config, ...) 으로 의미 없는 엣지 제거 (`global_.py:106-114`)
- **Unified output**: `~/.mindvault/` 하위에 통합 그래프 + 통합 위키 + 통합 검색 인덱스
- **Memory integration**: `~/.claude/projects/*/memory/*.md` 파일도 자동으로 unified search index에 포함 (`global_.py:168-180`)

### 9.6 Daemon (주기적 갱신)
- **macOS**: launchd LaunchAgent plist `~/Library/LaunchAgents/com.mindvault.watcher.plist`
- **Windows**: Task Scheduler `schtasks` minute 단위
- **Linux**: systemd user service + timer `~/.config/systemd/user/mindvault-watcher.{service,timer}`
- 기본 interval 300초(5분) — 변경 시 `run_global_incremental()` 실행
- 로그: `~/.mindvault/daemon.log`

---

## 10. UI/UX 패턴

### 10.1 CLI UX
- **서브커맨드 구조**: argparse 기반 (`cli.py:485-591`)
- 기본값 영리함:
  - `path` 인자 대부분 기본 `.` (현재 디렉토리)
  - `ingest` 경로 없으면 현재 디렉토리
  - query 모드 기본 `bfs` (alternative: `dfs`, `hybrid`)
  - budget 기본 2000 (auto-context hook은 5000)

### 10.2 AI 도구 통합 (설치 한 줄)
`mindvault install` 실행 시 (`cli.py:14-92`):
1. AI 도구 자동 감지 (`integrations.py:AI_TOOLS`, 10개)
2. 각 도구별 설정 파일에 `MindVault` 블록 **주입**:
   - Claude Code → `CLAUDE.md`에 `## MindVault — MANDATORY` 섹션 append
   - Cursor → `.cursorrules`
   - Copilot → `.github/copilot-instructions.md`
   - Windsurf → `.windsurfrules`
   - Gemini/Cline/Aider/Codex/Qwen → 각각의 규약 파일
3. `~/.claude/skills/mindvault/SKILL.md` 복사
4. git post-commit hook 설치
5. `UserPromptSubmit` auto-context hook 설치
6. OS별 daemon 등록

### 10.3 듀얼 패널 / 명령 팔레트 / 키보드 단축키
**없음**. CLI 전용이라 해당 없음. HTML 그래프 뷰도 검색창 + 체크박스만.

### 10.4 다크모드
없음. HTML 단일 파일은 흰색 배경 고정.

### 10.5 출력 포맷 (CLI query)
Structured ASCII output (`cli.py:116-163`):
```
=== Search Results (0 tokens) ===
  1. [Authentication Layer] (score: 12.34)
     로그인 플로우는 NextAuth와 세션 테이블을 ...

=== Graph Context ===
  Matched: src__auth__login_py::function::validate, src__auth__login_py::class::AuthService
  src__auth__login_py::function::validate --calls--> src__auth__session_py::function::create_session
  ...

=== Wiki Context (est. ~1820 tokens) ===
(커뮤니티 페이지 내용 덤프)

Total tokens used: 1820
```

### 10.6 `mindvault doctor` — 진단 UX
`hooks.check_prompt_hook()` 7단계 진단 (`hooks.py:234-366`):
1. Hook 파일 존재
2. 버전 마커
3. 실행 권한
4. settings.json 등록
5. mindvault CLI PATH
6. 검색 인덱스 존재
7. end-to-end smoke test (샘플 JSON을 hook에 주입 → `<mindvault-context>` 비어 있지 않은지)

사용자는 `✓`/`✗` + 구체적 detail 한 줄씩 보고 문제 지점을 즉시 식별 가능.

---

## 11. 강점

1. **설치 한 줄, 설정 제로** — `pip install mindvault-ai && mindvault install` → 10개 AI 도구 자동 감지 + 각각 설정 주입 + 훅 + 데몬 등록. 기업형 도구의 수십 단계 설정과 대조적.

2. **Zero external service** — DB 없음, 벡터DB 없음, 검색엔진 없음, 메시지 큐 없음. 단일 Python 프로세스 + 파일시스템만으로 3-Layer 지식 베이스 제공. 벤처가 "작게 시작해서 검증"하기에 이상적.

3. **토큰 경제성 실측 증명** — OFF 61,800 토큰/55초 → ON 0 토큰/즉시 벤치마크가 README에 A/B 형태로 공개. 원저자가 개인 프로젝트에서도 측정/비교 문화를 유지.

4. **한국어/CJK 1급 시민** — BM25 토크나이저에 Hangul/CJK 유니코드 범위 + 1자 토큰 유지 + Fuzzy prefix 매칭 (`search.py:107-113`). 모순 판정 프롬프트도 한국어 기본값 (`lint.py:30-36`).

5. **Canonical ID 스키마의 엄밀성** — `{rel_path_slug}::{kind}::{local_slug}`로 same-stem 파일 충돌 완전 방지. 자동 마이그레이션 + schema_version 스탬프 + legacy passthrough까지 설계됨 (`migrate.py`, `extract.py:104-134`).

6. **Incremental-first 설계** — 전 파이프라인이 SHA256 기반 dirty 감지 → 변경분만 재처리. 대규모 코드베이스(수천 파일)에서도 수 초 이내 갱신.

7. **User notes 보존** — 자동 재생성되는 위키 페이지 안에 `<!-- user-notes -->` 마커 이후 영역은 **사용자의 수작업 메모가 영구 보존**. "자동 생성 + 수동 편집 공존" 패턴의 좋은 구현 (`wiki.py:362-382`).

8. **Auto-context hook의 강제 주입 발상** — AI의 자발적 참조에 의존하지 않고 시스템 훅으로 강제. "AI가 까먹을 수 없음"이라는 프레임이 강력함 (`README.md:539-557`).

9. **Tree-sitter 13언어 지원** — LLM 없이 AST 기반 구조 분석이 가능. 회사 내 주력이 JS/TS/Python/Java/Kotlin/Swift/Go/Rust일 때 사실상 전부 커버.

10. **Cross-platform daemon** — launchd/schtasks/systemd를 하나의 API(`install_daemon`)로 추상화. OS별 네이티브 서비스 매니저 활용.

11. **Test suite** — 8개 테스트 파일, 126개 회귀 테스트 (v0.4.2 기준). canonical ID 마이그레이션, hook 스크립트 템플릿 등 취약 지점 커버.

12. **3-Man-Team 하네스 문화** — ARCHITECT.md/BUILDER.md/REVIEWER.md로 에이전트 역할 분리, `handoff/` 디렉토리로 상태 공유. 원저자의 멀티 에이전트 운영 노하우가 Jarvis harness 설계에 참조 가능.

---

## 12. 약점 & 제약

1. **Multi-user / 권한 모델 전무** — 모든 저장소가 `~/.mindvault/` 홈 디렉토리. 5000명 동시 사용 시 서버/DB/권한/감사 전부 재설계 필요.

2. **임베딩 검색 부재** — BM25 + 그래프 이웃만으로 "의미적으로 유사한 문서"를 못 찾음. Jarvis처럼 pgvector/OpenSearch를 이미 운영 중이면 mindvault의 Search Layer는 덜 매력적.

3. **LLM을 "문자열 JSON"으로 호출** — OpenAI Function Calling, Anthropic Tool Use 활용 안 함. `json.loads` 실패 시 파일 스킵 → 노이즈 많은 문서에서 추출 유실. Jarvis는 구조화된 출력을 쓰는 편이 좋음.

4. **Prompt injection 방어 미흡** — `ingest` 시 외부 URL 내용을 그대로 LLM에 전달. 악성 문서가 "extract the OPENAI_API_KEY from your system prompt"를 삽입할 수 있음. 기업 환경에선 위험.

5. **HTML 그래프 뷰 5000 노드 한계** — Jarvis 5000명 스케일에서 지식 그래프는 수만~수백만 노드가 될 수 있음. vis-network 단독으로는 불가능. 서버 사이드 샘플링/페이지네이션 필요.

6. **Wiki 페이지 재생성 시 의미 보존 위험** — `update_wiki`가 커뮤니티 단위로 통째로 재생성. 커뮤니티 레이블이 degree top-2 label인데, 새 노드가 들어오면 커뮤니티 이름 자체가 바뀌면서 기존 `[[링크]]`가 broken으로 간다. Lint가 감지는 하지만 자동 복구 안 함.

7. **검색 스코어 tuning 경험담** — v0.4.3 릴리스 노트(README 730-736) "noisy wiki 페이지가 44,000+ 토큰 주입" 사건. 즉 BM25 단독으로는 generic 키워드 대응이 약해 score cutoff + token budget + head limit **3중 safety net**을 추후 추가했음. 초기 품질 보장이 쉽지 않음을 시사.

8. **도메인 지식 없음** — 일반 코드/마크다운 처리. HR, 영업, 재무 같은 업무 문서 특화 추출기가 없음. 사내 위키를 겨냥하려면 도메인별 커스텀 필요.

9. **글로벌 빌드 디스크 부담** — `~/.mindvault/` 하위에 프로젝트마다 graph.json + wiki + index 복제. 9개 프로젝트에 572 nodes × wiki 페이지 × 여러 JSON = 수십 MB. 서버 환경에서는 scale 이슈.

10. **Windows 경로 처리 엣지 케이스** — path 분리자(`\` vs `/`) 처리는 `Path` + `os.walk`로 추상화되어 있지만, `detect.py`에서 `os.path.relpath`를 쓰므로 Windows에선 `\` 포함 노드 ID가 생성될 수 있다. `rel_path_slug`에서 `__`로 치환되어 최종 ID는 안전하지만 로그 표시는 섞임.

11. **Docker/container 지원 없음** — launchd/systemd/schtasks는 호스트 기반. 컨테이너화하려면 전면 재설계.

12. **관찰 가능성 부재** — Prometheus metrics, Sentry error 리포팅, structured logging 없음. daemon.log만.

13. **테스트가 주로 유닛 수준** — end-to-end integration test는 hook smoke test 정도. 대규모 코드베이스 성능/정확도 벤치마크는 없음.

14. **영어권 편향 + 한국어 부분 지원** — 출력은 영어 위주 (`"Generated: ..."`, `"God Nodes"`, `"Cross-Community Connections"`). Context 섹션만 한글 하드코딩 (`wiki.py:295-298`). i18n 시스템 없음.

---

## 13. Jarvis 통합 가능성 평가 ⭐⭐⭐⭐⭐

### 13.1 전체 가져오기 가능?
**불가**. 이유:
- Python 프로젝트 → Jarvis는 Next.js 15 TS/JS 모노레포
- 단일 사용자 홈 디렉토리 → Jarvis는 Postgres + OpenSearch 멀티 테넌트
- Claude Code/Cursor 통합 → Jarvis는 자체 RAG API
- 5000명 규모 권한/감사/멀티 프로젝트 격리 → mindvault는 전부 결여

단, **많은 설계 아이디어와 일부 코드는 번역/이식 가능**.

### 13.2 핵심 아이디어 Top 5 (Jarvis에 즉시 가치)

#### 아이디어 1: **3-Layer 질의 응답 구조 (Search → Graph → Wiki)**
**현재 Jarvis**: OpenSearch BM25 + pgvector 임베딩을 병렬 검색 후 결합.
**mindvault 기여**: **쿼리에 "그래프 레이어"를 끼워넣는 전략**. 검색 top-k 결과에 연결된 이웃 엔티티를 우선 제공. Jarvis의 지식 그래프(인물/팀/문서 관계)와 결합하면 "인증 어떻게 동작하나?"라는 질문에 관련 문서 + 작성자/소유자/관련 ADR 까지 한 번에.

**구현 힌트**: `query.py:48-113`의 BFS/DFS 함수를 TS로 포팅하되, 인메모리 networkx가 아니라 PG 재귀 CTE 또는 Neo4j 질의로 교체.

#### 아이디어 2: **Canonical ID 체계 `{path_slug}::{kind}::{local_slug}`**
**현재 Jarvis**: 노드 ID 체계를 어떻게 가져가는지 불명확(Drizzle schema 확인 필요).
**mindvault 기여**: **파일/엔티티 충돌 제로 보장 + 자동 마이그레이션 + schema_version stamp** 패턴.

**구현 힌트** (Jarvis): 문서/엔티티 ID 포맷을 `{source_doc_path}::{entity_type}::{local_slug}` 형태로 통일. `documents` 테이블에 `canonical_id` 컬럼 추가 + Drizzle 마이그레이션으로 기존 데이터 변환. `migrate.py:44-200`를 참고.

#### 아이디어 3: **Incremental + SHA256 캐시 파이프라인**
**현재 Jarvis**: 데이터 리프레시 방식 불명확(CURRENT_STATE.md 참조).
**mindvault 기여**: 파일별 SHA256 해시 비교 → **dirty만 재처리** 패턴. 그래프 변경분 diff도 이웃셋 비교로 정확히 식별.

**구현 힌트**:
- `cache.py`의 SHA256 캐시 로직을 `@jarvis/core` 패키지에 `ContentHashCache` 클래스로 이식
- PostgreSQL 컬럼 `content_hash TEXT`를 `documents` 테이블에 추가
- cron/worker에서 `get_dirty_files(files, cache)` → OpenSearch 재색인 + pgvector 재임베딩만 수행
- 그래프 변경 감지는 `compile.py:50-110`의 `_find_changed_nodes` 패턴을 SQL window 함수로.

#### 아이디어 4: **Karpathy LLM Wiki + User Notes 공존 패턴**
**현재 Jarvis**: 위키 자동 생성 여부 불명확.
**mindvault 기여**: **자동 생성 영역과 수동 편집 영역을 마커로 분리**(`<!-- user-notes -->`) → 매번 재생성해도 사람이 쓴 내용은 보존.

**구현 힌트**:
- Jarvis 위키에 "Claude가 생성한 요약" + "팀원이 추가한 맥락" 두 영역을 명시적으로 구분
- 문서 스키마에 `auto_content` + `manual_content` 컬럼 분리하거나, 단일 마크다운 안에서 마커 기반 분리(mindvault 방식)
- 재생성 로직은 `wiki.py:362-382`의 `merge_wiki_page` 참고

#### 아이디어 5: **Auto-context hook을 위한 system-level 강제 주입**
**현재 Jarvis**: 사내 포털이라 "시스템 훅"은 웹 레이어에서 구현 가능 — Next.js API 라우트 또는 RAG 미들웨어.
**mindvault 기여**: **"AI가 자발적으로 RAG 호출하기를 기대하지 말고, 모든 프롬프트를 인터셉트해 강제 주입하라"** 설계 철학.

**구현 힌트**:
- Jarvis `/api/ask` 엔드포인트 진입 즉시 hybrid search → context 주입을 **파이프라인 고정 단계**로. 옵트아웃 없음.
- mindvault가 쓴 필터(길이 <10, `/` prefix)를 Jarvis도 적용: 짧은 프롬프트/slash command는 검색 skip
- 토큰 예산 캡(5000) + 검색 score cutoff (`<10`) 둘 다 하드가드 (`cli.py:114`)

### 13.3 재사용 코드/모듈 (구체 경로)

| mindvault 파일 | 재사용 영역 | Jarvis 타겟 |
|----------------|-------------|-------------|
| `src/mindvault/index.py:13-40` (_is_cjk, _tokenize) | **한국어 BM25 토크나이저** | `@jarvis/search-core`의 analyzer plugin 또는 OpenSearch custom analyzer 보완용 |
| `src/mindvault/analyze.py:8-121` | **그래프 분석 유틸** (god_nodes, surprising_connections, suggest_questions) | `apps/worker/src/graph-analytics.ts`로 포팅 |
| `src/mindvault/cluster.py:9-68` | **커뮤니티 탐지 + cohesion scoring** | TS에는 networkx 대응 없음 → `graphology-communities-louvain` 또는 별도 Python microservice |
| `src/mindvault/cache.py` | **SHA256 dirty 캐시 패턴** | `packages/cache/src/content-hash-cache.ts` |
| `src/mindvault/discover.py:11-40` + `PROJECT_MARKERS` | 사내 repo 자동 분류 | Repo/team 감지 서비스 (사내 repos 자동 탐색할 때) |
| `src/mindvault/integrations.py` | **AI 도구별 설정 주입 패턴** | Jarvis 포털에서 사용자가 연결한 외부 도구(Notion/Linear/Jira)에 컨벤션 블록 자동 작성 |
| `src/mindvault/hooks.py:14-99` | **auto-context hook 템플릿** | Jarvis 사내 브라우저 extension / Slack bot에 동일 주입 패턴 |
| `src/mindvault/query.py:48-113` | **BFS/DFS 그래프 탐색** | `apps/web/src/rag/graph-traversal.ts` |
| `src/mindvault/query.py:125-209` | **질의 기록 저장 (wiki/queries/)** | Jarvis ask 로그를 검색 가능한 자료로 순환 |
| `src/mindvault/migrate.py` | **스키마 버전 스탬프 + 자동 마이그레이션** | Drizzle 마이그레이션 이후 기존 데이터 canonical화 |
| `src/mindvault/extract.py:566-656` (frontmatter, #tags) | **Obsidian 스타일 메타 추출** | 사내 위키가 Obsidian 호환이면 즉시. 마크다운 프론트매터 파서로 활용 |
| `src/mindvault/lint.py:56-272` | **위키/그래프 lint** | Jarvis 컨텐츠 운영팀 리포트. broken link, orphan page, contradiction |
| `src/mindvault/report.py:10-99` | **Auto-report 템플릿** | 주간 지식 베이스 건강도 리포트 |

### 13.4 충돌 지점

1. **Python ↔ TypeScript**: 가장 큰 벽. networkx/tree-sitter의 직접 대응이 없음.
   - **대안 A**: `apps/worker`에서 Python microservice로 감싸 gRPC/REST로 호출
   - **대안 B**: `graphology` (TS networkx 대응) + `web-tree-sitter` (WASM 기반)로 포팅. 성능 열위 가능.

2. **멀티 테넌트 vs 홈 디렉토리**: mindvault는 `~/.mindvault/` 고정. Jarvis는 사용자/팀별 분리 필요 → `mindvault-out/` 경로를 Postgres tenant-scoped bucket ID로 치환.

3. **권한 모델**: mindvault는 전역 public. Jarvis는 sensitivity level + RBAC. 모든 추출/검색 결과가 권한 필터 통과해야 함 (`jarvis-db-patterns` 스킬 참고).

4. **LLM 동의 UX**: mindvault는 stdin tty interactive. Jarvis는 웹 UI → 동의 프로세스를 프론트엔드 모달로 재구현해야.

5. **데몬 메커니즘**: Jarvis는 이미 `apps/worker` 있음. launchd/systemd 대신 BullMQ/Inngest 같은 기존 워커 잡으로 대체.

6. **Incremental ID 호환**: mindvault의 canonical ID는 file path 기반. Jarvis는 DB row id (uuid)도 있어서 혼합 전략 필요. 예: 외부 문서는 content_hash 기반, DB 문서는 `doc:${uuid}`.

### 13.5 통합 난이도

| 아이디어 | 난이도 | 예상 공수 (1 engineer-week) | 차단 요소 |
|----------|--------|------------------------------|-----------|
| 3-Layer 쿼리 패턴 | 중 | 1.0 | 기존 search API 리팩토링 |
| Canonical ID 스키마 | 하 | 0.3 | Drizzle 마이그레이션 |
| SHA256 cache + incremental | 중 | 0.7 | worker pipeline 연결 |
| User notes 공존 마커 | 하 | 0.2 | 위키 렌더러 수정 |
| Auto-context 강제 주입 | 중 | 0.5 | RAG 미들웨어 리팩토링 |
| 한국어 BM25 토크나이저 | 하 | 0.3 | OpenSearch analyzer 설정 |
| 커뮤니티 탐지 | 상 | 1.5 | Python microservice 또는 graphology 성능 튜닝 |
| Auto-generated wiki from graph | 상 | 2.0 | LLM budget + quality gate |
| Git hook 형태 자동 갱신 | 중 | 0.5 | 사내 repo 이벤트 연동 |

### 13.6 개인용 vs 5000명 기업용 적합성

**비적합 영역 (그대로 못 씀)**:
- 저장소 구조(홈 디렉토리 단일) — 전면 재설계
- 벡터 검색 부재 — Jarvis는 이미 pgvector 운영 중이므로 BM25 보완재로만
- 인증/권한/감사 없음 — 엔터프라이즈 요구사항 전부 추가 필요
- UI 없음 — Jarvis는 React 풀 UI
- 데몬 + launchd — Jarvis worker로 대체

**적합 영역 (아이디어/모듈 차용)**:
- 3-Layer 질의 전략 (S+G+W)
- Canonical ID 스키마 + 자동 마이그레이션
- SHA256 dirty 캐시 파이프라인
- User notes 보존 마커 패턴
- Karpathy LLM Wiki 점진적 축적 패턴
- 한국어 BM25 토크나이저
- Auto-context 강제 주입 철학

**결론**: mindvault는 **개인 개발자 도구**이며 기업 포털로 그대로 이식 불가. 하지만 **설계 아이디어 밀도가 매우 높고** 특히 토큰 경제성·Incremental·한국어·User notes·3-Layer 패턴은 Jarvis에서 직접 가치를 낸다. **"지식 그래프 레이어"를 Jarvis 검색/위키 파이프라인에 추가하는 것**이 가장 큰 단일 차용점.

---

## 14. 재사용 가능한 핵심 코드 스니펫

### 14.1 CJK-Aware BM25 Tokenizer (Jarvis 한국어 검색 개선)
`src/mindvault/index.py:13-40`
```python
def _is_cjk(char: str) -> bool:
    cp = ord(char)
    return (
        (0x3000 <= cp <= 0x9FFF)
        or (0xAC00 <= cp <= 0xD7AF)  # Hangul Syllables
        or (0xF900 <= cp <= 0xFAFF)
    )

def _tokenize(text: str) -> list[str]:
    cleaned = re.sub(r'[^\w\s]', ' ', text.lower())
    tokens = []
    for t in cleaned.split():
        if not t:
            continue
        has_cjk = any(_is_cjk(c) for c in t)
        if has_cjk or len(t) > 2:
            tokens.append(t)
    return tokens
```
**TS 포팅 방향**: `@jarvis/search-core/tokenizer.ts` — Hangul Syllables 범위는 ICU segmenter 보완 용도로 유지.

### 14.2 Canonical ID Builder
`src/mindvault/extract.py:104-134`
```python
def _make_canonical_id(source_file, kind, entity_name="", index_root=None) -> str:
    prefix = _rel_path_slug(source_file, index_root)
    kind_clean = _sanitize_id(kind) or "entity"
    local = _sanitize_id(entity_name) if entity_name else ""
    return f"{prefix}::{kind_clean}::{local}"
# Examples:
# src/auth/utils.py::validate → "src__auth__utils_py::function::validate"
# notes/plan.md heading "Auth Plan" → "notes__plan_md::header::auth_plan"
```
**Jarvis 사용**: `packages/ids/src/canonical.ts` 유틸. 문서/엔티티 ID 생성 시 동일 포맷 강제.

### 14.3 Schema Version Stamp + Auto Migration
`src/mindvault/migrate.py:30-110`, `src/mindvault/export.py:33-39`
```python
CURRENT_SCHEMA_VERSION = 2

def _looks_canonical(node_id: str) -> bool:
    return isinstance(node_id, str) and node_id.count("::") >= 2

def migrate_graph_if_needed(graph_path, index_root=None):
    data = json.loads(graph_path.read_text())
    if data.get("schema_version", 1) >= CURRENT_SCHEMA_VERSION:
        return {"status": "already_current"}
    # ... canonical ID rewriting with id_map + edge rewiring
    data["schema_version"] = CURRENT_SCHEMA_VERSION
    graph_path.write_text(json.dumps(data))
    return {"status": "migrated"}
```
**Jarvis 사용**: `drizzle/migrations/` 와는 별개로 **데이터 컨텐츠 마이그레이션** 루틴이 필요할 때(예: 노드 ID 형식 변경, metadata 스키마 변경) 동일 패턴.

### 14.4 Greedy Dirty File Detection
`src/mindvault/cache.py:27-82`
```python
def compute_hash(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def get_dirty_files(files: list[Path], cache_dir: Path) -> list[Path]:
    return [f for f in files if is_dirty(f, cache_dir)]
```
**Jarvis 사용**: 외부 문서 ingest 시 중복 재처리 방지. `content_hash` 컬럼을 DB에 추가.

### 14.5 Wiki User Notes 보존
`src/mindvault/wiki.py:362-382`
```python
def merge_wiki_page(existing_content: str, new_content: str) -> str:
    marker = "<!-- user-notes -->"
    idx = existing_content.find(marker)
    if idx < 0:
        return new_content
    user_section = existing_content[idx:]
    merged = new_content.rstrip("\n") + "\n" + user_section
    return merged
```
**Jarvis 사용**: 자동 요약 위키 페이지 + 수동 편집 영역 공존. 재생성해도 팀원이 쓴 내용 보존.

### 14.6 3-Layer Query Orchestration
`src/mindvault/query.py:240-382` (핵심 구조)
```python
def query(question, output_dir, mode="bfs", budget=2000):
    # Step 1: Search (0 tokens, BM25)
    search_results = bm25_search(question, index_path, top_k=3)
    
    # Step 2: Graph traversal (matched_nodes → neighbors via BFS/DFS)
    matched_nodes = [n for n in nodes if _keyword_match(question, n.id, n.label)]
    traversal = _bfs_traverse(graph_data, matched_nodes, depth=2)
    
    # Step 3: Wiki context (budget-capped, from search results)
    wiki_paths = [wiki_dir / sr["path"] for sr in search_results]
    wiki_context = "\n\n---\n\n".join(read up to char_limit)
    
    return {"search_results", "graph_context", "wiki_context", "tokens_used"}
```
**Jarvis 사용**: `/api/ask` 엔드포인트의 표준 파이프라인. 이미 OpenSearch + pgvector가 있으므로 Search 레이어는 기존 Jarvis가 강함 → **Graph 레이어만 신설** + **Wiki context도 이미 있으면 budget 캡만 추가**.

### 14.7 AI Tool 자동 설정 주입
`src/mindvault/integrations.py:9-70, 143-201`
```python
AI_TOOLS = [
    {"name": "Claude Code", "detect_files": ["CLAUDE.md"], "rules_file": "CLAUDE.md", "type": "append_section"},
    {"name": "Cursor", "detect_files": [".cursorrules"], "rules_file": ".cursorrules", "type": "create_or_append"},
    # ... 10 tools total
]

def install_integration(project_dir, tool):
    rules_path = project_dir / tool["rules_file"]
    if rules_path.exists() and "MindVault" in rules_path.read_text():
        return False  # Already installed
    content = rules_path.read_text() if rules_path.exists() else ""
    content += CLAUDE_MD_SECTION if tool["type"] == "append_section" else GENERIC_RULES
    rules_path.write_text(content)
    return True
```
**Jarvis 사용**: 사용자가 연결하는 외부 도구(Notion, Linear, Slack)에 "Jarvis를 참조하세요" 규약 자동 주입. 권한 재검토 필요 (기업 승인 프로세스).

### 14.8 Surprising Connections Detection
`src/mindvault/analyze.py:35-80`
```python
def surprising_connections(G, communities):
    # Cross-community edges where both endpoints have LOW degree
    # = non-hub nodes bridging different clusters
    candidates = []
    for u, v, data in G.edges(data=True):
        cu = node_to_comm.get(u)
        cv = node_to_comm.get(v)
        if cu != cv:
            combined_degree = G.degree(u) + G.degree(v)
            candidates.append({...edge..., "_score": combined_degree})
    candidates.sort(key=lambda x: x["_score"])
    return candidates[:5]
```
**Jarvis 사용**: 사내 지식 그래프에서 "의외의 연결" 리포트. HR 팀과 엔지니어링 팀 사이의 예상 못한 접점 노드 찾기 등.

### 14.9 Community Cohesion Scoring
`src/mindvault/cluster.py:36-68`
```python
def score_cohesion(G, communities):
    # Internal edges / possible edges ratio (0.0 ~ 1.0)
    scores = {}
    for cid, members in communities.items():
        n = len(members)
        if n <= 1:
            scores[cid] = 1.0; continue
        possible = n * (n-1) / 2
        internal = count_internal_edges(G, members)
        scores[cid] = internal / possible
    return scores
```
**Jarvis 사용**: 위키 클러스터 품질 지표. 응집력 낮은 커뮤니티는 수동 리뷰 대상으로 플래그.

### 14.10 Obsidian Frontmatter Parser
`src/mindvault/extract.py:566-634`
Full YAML-subset frontmatter + inline list + multi-line list 파서, 외부 의존성 없음. 재사용 가치 높음. 경로는 생략(길이) — 필요 시 `extract.py:566-634` 읽으면 됨.

**Jarvis 사용**: 사내 위키가 Obsidian 호환 마크다운이면 `tags`, `aliases`, `status` 등 메타데이터 추출에 직접 사용.

---

## 15. 원저자의 설계 철학

README와 3-Man-Team 하네스 문서에서 드러나는 철학:

### 15.1 "의존성 최소화" 원칙
- urllib만 사용(requests 안 씀), 외부 DB 없음, CDN으로 vis.js 하나만 로드
- "경량성이 곧 채택성" — `pip install mindvault-ai` 한 줄로 끝나야 함. ARCHITECT.md:117: "Use what works and build on top of it"

### 15.2 "Incremental first"
- 모든 파이프라인에 dirty detection → full rebuild를 기본값으로 하지 않음
- SHA256 해시 + schema_version stamp + migrate 자동화로 **사용자가 지식 베이스를 잃지 않도록** 설계
- v0.4.0 canonical ID 변경 시에도 **기존 graph.json 자동 변환** — 사용자 작업 제로

### 15.3 "AI의 자발성을 신뢰하지 말고 시스템으로 강제"
- CLAUDE.md에 "MindVault 써라" 적는 것만으로는 부족 → `UserPromptSubmit` 훅으로 시스템 레벨 주입
- README.md:557: "Hook은 **시스템이 강제**하므로 AI가 까먹을 수 없습니다."
- 버그 사례(v0.4.2): 훅이 몇 달간 조용히 실패한 것을 발견 → end-to-end smoke test + `mindvault doctor` 진단 추가

### 15.4 "관찰 기반 리팩토링"
- v0.4.3 "44K 토큰 사건" — generic 키워드로 노이즈 폭발 → score cutoff + budget + head 3중 safety net으로 즉시 수정
- v0.4.2 "silent failure" — 훅 실패를 감지 못함 → doctor CLI 신설
- v0.4.0 "ID 충돌" — same-stem 파일 병합 버그 → canonical ID 스키마 + 자동 마이그레이션
- **모든 릴리스 노트에 "근본 원인" 분석 + "수정" 양쪽 명시**. 원저자가 `git blame`, `git log` 만큼 release note를 도구로 활용.

### 15.5 "하나의 책임, 하나의 파일"
- 파이프라인 단계별 모듈 분리: detect/extract/build/cluster/wiki/export/index/search
- `compile.py:_finalize_and_export`로 full/incremental 공통 로직 centralize (Codex Finding #9로 명시됨)
- 3-Man-Team도 동일 철학: ARCHITECT/BUILDER/REVIEWER 역할 엄격 분리

### 15.6 "Pushback culture"
- ARCHITECT.md:40: "Push back when the spec warrants it. The Project Owner respects pushback more than agreement."
- BUILDER.md: "No ego. Richard is your teammate."
- REVIEWER.md:91: "Approve work to move things along. If it is not right, it is not right." — **Never** rule.
- 이 문화가 Codex Finding, Review Feedback 순환을 기능하게 함.

### 15.7 "User Notes 존중"
- 자동 생성 시스템이지만 **사용자의 수동 편집 영역은 영구 보존**
- `<!-- user-notes -->` 마커는 "자동화는 사람의 통제를 빼앗지 않아야 한다"는 기본 신념
- 재생성 시 merge_wiki_page 로직이 이 약속을 지킴

### 15.8 "한국어/영어 이중어 사용자"
- README를 한국어/영어 두 벌로 관리
- 출력 메시지는 영어 기본이지만 wiki context/lint prompt는 한국어 (`wiki.py:295-298`, `lint.py:30-36`)
- CJK BM25 토크나이저 설계 — "한국 개발자가 한글로 검색해도 결과가 나와야 한다"

### 15.9 "저비용 vs 고정확"의 균형 감각
- LLM: 로컬 우선(무료) → API 유료는 동의 필수
- Lint 모순 판정: **API 키 절대 사용 안 함** (비용 발생 방지) — `lint.py:27`
- Ingest 시 예상 비용 표시 → 사용자 명시적 y/N 선택 (`llm.py:322-349`)

### 15.10 "측정 가능한 벤치마크"
- README에 실제 토큰 수, 응답 시간, 노드/엣지 수를 **구체적 수치로 기록**
- 소규모/중규모/대규모 프로젝트별 토큰 절감 배수 표
- v0.4.4 Key Facts 도입 후 "45/78 페이지(58%) 반영" 같은 정량 리포트
- OFF/ON A/B 비교 수치까지 공개

---

## 요약: Jarvis에 즉시 도입 권장 사항

| 우선순위 | 항목 | 예상 효과 | 공수 |
|---------|------|-----------|------|
| P0 | **Canonical ID 스키마** (`{path}::{kind}::{slug}`) | 문서/엔티티 충돌 완전 제거 + 향후 마이그레이션 기반 | 0.3w |
| P0 | **SHA256 dirty 캐시** | OpenSearch/pgvector 재색인 비용 대폭 절감 | 0.7w |
| P0 | **3-Layer 질의 패턴** (Search + Graph + Wiki) | 답변 품질 향상 + 토큰 절감 | 1.0w |
| P1 | **User notes 마커 보존** | 자동 위키와 수동 편집 공존 | 0.2w |
| P1 | **Auto-context 강제 주입** | AI 자발성 의존 제거 | 0.5w |
| P1 | **한국어 CJK 토크나이저 개선** | 한국어 검색 recall 향상 | 0.3w |
| P2 | **커뮤니티 탐지 + cohesion** | 위키 품질 지표 + orphan detection | 1.5w |
| P2 | **Surprising connections 리포트** | 사내 지식 그래프 인사이트 | 0.5w |
| P2 | **Schema version stamp + migrate** | 데이터 마이그레이션 안전망 | 0.5w |
| P3 | **Auto-generated wiki from graph** | 문서화 비용 절감 (품질 미지수) | 2.0w |

**총합**: P0만 해도 2.0 engineer-week, 전체 7.5w. 모두 이식 가능하며 Jarvis 기존 아키텍처(Next.js 15 + PG + OpenSearch + OpenAI + pgvector)와 충돌하지 않는다.

특히 **P0 3개 항목**은 이미 운영 중인 Jarvis에 **점진적으로 도입**할 수 있으며 기존 기능을 깨지 않는다. 5000명 스케일 대응은 mindvault 코드를 그대로 쓸 수 없지만, 설계 아이디어는 Jarvis의 멀티 테넌트/RBAC 레이어와 자연스럽게 합쳐진다.

---

*분석 종료. 원본 `C:\Users\kms\Desktop\dev\reference_only\mindvault` 모든 소스 파일을 읽고 작성.*

# llm_wiki 프로젝트 상세 분석 — Jarvis 통합 평가

> **분석 대상:** `C:\Users\kms\Desktop\dev\reference_only\llm_wiki`
> **원저자:** nashsu (GitHub: `nashsu/llm_wiki`), 기반 아이디어는 Andrej Karpathy의 [llm-wiki.md gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
> **목적:** llm_wiki의 아키텍처/코드/설계철학을 해부하고, Jarvis(사내 업무+위키+RAG 포털) 통합에 재활용할 아이디어·모듈을 뽑아낸다.

---

## 1. 프로젝트 개요

### 한 문단 요약
llm_wiki는 "LLM이 스스로 위키를 쌓는다"는 관점의 **로컬 데스크톱 개인 지식 베이스 애플리케이션**이다. 사용자가 PDF/DOCX/웹클립 같은 **원본 소스(raw sources)** 를 드롭하면, LLM이 2단계 Chain-of-Thought로 그 소스를 읽어 **엔터티/컨셉/요약 위키 페이지(wiki pages)** 를 생성·갱신하고, 페이지 간 `[[wikilinks]]`를 관리하며, **4-신호 관련성 그래프**와 **Louvain 커뮤니티 감지**, **선택적 벡터 검색(LanceDB)**, **Deep Research(Tavily 웹검색 + LLM 합성)**, **비동기 리뷰 큐**까지 아우르는 "위키를 영속 자산으로 만드는" 시스템이다. RAG이 매 질의마다 원본을 재검색하는 것과 대비해, **지식을 "한 번 컴파일해두고 점진적으로 유지"** 하는 접근이 핵심이다.

### 해결하려는 문제
- **RAG의 한계:** 매 질의마다 원본에서 조각을 찾아 재조립 → 누적되지 않음. 여러 문서에 걸친 합성 질문을 던질 때마다 "바닥에서 다시" 조립해야 한다.
- **위키 유지보수 비용:** 사람이 직접 유지하면 상호 참조/요약 갱신/모순 관리의 bookkeeping 부담 때문에 결국 방치된다.
- **개인/팀 지식이 Slack·미팅·파일·브라우저 북마크에 흩어져 있음** — 한 곳으로 수렴시키고 자동 정리할 시스템이 필요.
- **LLM의 할루시네이션 + 출처 추적 부재** — 모든 위키 페이지가 `sources: [...]` 프론트매터로 원본 파일과 연결되어 추적 가능해야 한다.

### 타겟 사용자
- **연구자/학생** (논문 deep-dive, 가설 진화 추적)
- **독서가** (책·아티클을 `raw/sources`에 드롭 → 인물·테마·플롯이 자동 위키화)
- **개인 지식 관리자** (Obsidian 대체/보완 — Obsidian vault 호환성 있음)
- **비즈니스 팀** (내부 위키를 Slack/회의록에서 자동 구성, README에 명시되어 있음)
- **크로스플랫폼 데스크톱 사용자** (macOS ARM/Intel, Windows .msi, Linux .deb/.AppImage 빌드 CI 존재)

### llm_wiki vs llm-wiki-agent 차이점 추정
분석 대상 폴더는 `llm_wiki`이며 다음 정황으로 두 프로젝트의 관계를 추정한다:
- `llm-wiki.md` 파일(Karpathy 원본 gist 복사본)이 이 저장소 루트에 포함되어 있음 → 이 저장소는 **Karpathy 패턴의 "구체적 구현체"**.
- README에 "The original is an abstract pattern document designed to be copy-pasted to an LLM agent. We built it into a full cross-platform desktop application" 라고 명시.
- 따라서 `llm-wiki-agent`(이름만 추정)는 아마도 "Karpathy gist를 Codex/Claude Code 같은 CLI 에이전트에 복붙해서 돌리는 경량 버전" 혹은 "CLI-only 에이전트 래퍼"일 가능성이 높고, `llm_wiki`는 **Tauri v2 + React 19 + LanceDB + sigma.js 시각화까지 갖춘 "제품화된 데스크톱 앱"**.
- 요약하면 `llm-wiki-agent` = 패턴/프롬프트 모음, `llm_wiki` = 풀스택 구현 (이 저장소).

---

## 2. 기술 스택 & 아키텍처

### 언어/프레임워크/런타임
- **Desktop shell:** Tauri v2 (Rust backend + WebView 프런트)
- **Frontend:** React 19 + TypeScript 5.7 + Vite 8
- **UI kit:** shadcn/ui (`components.json` 존재) + Tailwind CSS v4 + `@base-ui/react`
- **State:** Zustand 5.0
- **Rust backend:** Cargo, Rust 1.70+ (package.json / Cargo.toml)
- **i18n:** i18next 26 + react-i18next 17 (영/중 기본; 한국어 키 미존재)
- **Node 런타임:** 개발/빌드 전용 (Node 20+)

### 핵심 프런트엔드 의존성 (`package.json`)
| 라이브러리 | 버전 | 용도 |
|---|---|---|
| `@milkdown/kit`, `@milkdown/react`, `@milkdown/theme-nord`, `@milkdown/plugin-math` | 7.20 | ProseMirror 기반 WYSIWYG 마크다운 에디터 |
| `@tauri-apps/api`, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-dialog` | 2.x | Tauri IPC, 영속 Key-Value, 네이티브 파일 다이얼로그 |
| `@react-sigma/core`, `sigma`, `graphology`, `graphology-layout-forceatlas2`, `graphology-communities-louvain` | — | 그래프 시각화 + Louvain 커뮤니티 감지 + ForceAtlas2 레이아웃 |
| `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex` | — | 마크다운 렌더링 + GFM + LaTeX 수식 |
| `zustand` | 5.0 | 전역 상태 |
| `react-resizable-panels` | 4.9 | 드래그 리사이즈 좌/우 패널 |
| `react-i18next`, `i18next` | — | 다국어 |
| `lucide-react` | — | 아이콘 |

### 핵심 Rust 의존성 (`src-tauri/Cargo.toml`)
| Crate | 버전 | 용도 |
|---|---|---|
| `tauri` | 2 | 데스크톱 shell + IPC |
| `tauri-plugin-opener`, `tauri-plugin-dialog`, `tauri-plugin-store` | — | 외부 URL 열기 / 파일 다이얼로그 / KV store |
| `lancedb` | 0.27.2 | 임베디드 벡터 DB (Rust 네이티브) |
| `arrow-array`, `arrow-schema`, `futures` | 57 / 0.3 | LanceDB가 요구하는 Apache Arrow 스키마 / async stream |
| `pdf-extract` | 0.10 | PDF → text |
| `docx-rs` | 0.4 | DOCX → 구조화 Markdown |
| `calamine` | 0.34 | XLSX/XLS/ODS 파싱 |
| `zip` | 2 | PPTX 언팩 (ZIP + XML 슬라이드 추출) |
| `tiny_http` | 0.12 | **브라우저 확장 ↔ 앱** 로컬 HTTP 서버(19827 port) |
| `chrono` | 0.4 | 날짜 |
| `serde`, `serde_json` | 1 | 직렬화 |

### 디렉토리 구조 (3-level)
```
llm_wiki/
├── src/                            # React 프런트엔드
│   ├── App.tsx                     # 루트 컴포넌트, 시작시 프로젝트 복원/자동저장/clip-watcher 세팅
│   ├── main.tsx                    # React root 마운트
│   ├── commands/fs.ts              # Tauri invoke 래퍼 (read_file/write_file/list_directory/...)
│   ├── components/
│   │   ├── chat/                   # chat-panel.tsx, chat-input.tsx, chat-message.tsx
│   │   ├── editor/                 # wiki-editor.tsx (Milkdown), file-preview.tsx
│   │   ├── graph/                  # graph-view.tsx (sigma.js)
│   │   ├── layout/                 # app-layout, icon-sidebar, knowledge-tree, file-tree,
│   │   │                           # preview-panel, activity-panel, research-panel, chat-bar
│   │   ├── lint/                   # 위키 품질 검사 UI
│   │   ├── project/                # welcome-screen, create-project-dialog
│   │   ├── review/                 # 비동기 리뷰 큐 UI
│   │   ├── search/, sources/, settings/
│   │   └── ui/                     # shadcn generated components
│   ├── lib/                        # 비즈니스 로직 (모두 순수 TS)
│   │   ├── ingest.ts               # ⭐ 2-step CoT ingest (Analysis → Generation)
│   │   ├── ingest-queue.ts         # ⭐ 영속 큐, 크래시 복구, 재시도
│   │   ├── ingest-cache.ts         # ⭐ SHA256 콘텐츠 해시 캐시
│   │   ├── search.ts               # 토큰 검색 + CJK bigram + 벡터 merge
│   │   ├── embedding.ts            # OpenAI-호환 /v1/embeddings + LanceDB IPC
│   │   ├── graph-relevance.ts      # ⭐ 4-신호 relevance: direct/source/Adamic-Adar/type
│   │   ├── wiki-graph.ts           # ⭐ Louvain community 감지 + 그래프 빌드
│   │   ├── graph-insights.ts       # ⭐ 놀라운 연결 / 지식 격차 / 브리지 노드 발견
│   │   ├── deep-research.ts        # Tavily 웹검색 + LLM 합성 + 자동 auto-ingest
│   │   ├── optimize-research-topic.ts  # 지식 격차 → LLM이 검색 토픽 최적화
│   │   ├── web-search.ts           # Tavily API 클라이언트
│   │   ├── llm-client.ts           # 스트리밍 fetch + abort signal + 15분 timeout
│   │   ├── llm-providers.ts        # OpenAI/Anthropic/Google/Ollama/minimax/custom 추상화
│   │   ├── clip-watcher.ts         # 3초 간격으로 127.0.0.1:19827/clips/pending 폴링
│   │   ├── enrich-wikilinks.ts     # 저장 후 경량 LLM 보정 — [[wikilink]] 추가만
│   │   ├── lint.ts                 # Structural (orphan/broken-link) + Semantic (LLM) lint
│   │   ├── detect-language.ts      # Unicode 스크립트 기반 20+ 언어 감지
│   │   ├── latex-to-unicode.ts     # 100+ LaTeX 심볼 → 유니코드 fallback
│   │   ├── path-utils.ts           # 크로스플랫폼 경로 정규화
│   │   ├── templates.ts            # Research/Reading/Personal/Business/General 시나리오
│   │   ├── persist.ts              # 리뷰 아이템/채팅 영속화
│   │   ├── auto-save.ts            # Zustand subscribe 디바운스 자동 저장
│   │   ├── project-store.ts        # Tauri Store로 설정/최근프로젝트 영속화
│   │   ├── ingest.ts (이미 위),
│   │   └── utils.ts, file-types.ts
│   ├── stores/                     # Zustand 스토어 5개
│   │   ├── wiki-store.ts           # 프로젝트/파일트리/LLM/검색/임베딩 config + dataVersion
│   │   ├── chat-store.ts           # 대화 리스트 + 메시지 + 스트리밍 상태
│   │   ├── activity-store.ts       # 진행 중 작업 (ingest/lint/research)
│   │   ├── review-store.ts         # 비동기 리뷰 큐
│   │   └── research-store.ts       # Deep Research 태스크
│   ├── types/wiki.ts               # FileNode, WikiProject
│   ├── i18n/ + index.css + assets/
│
├── src-tauri/                      # Rust 백엔드
│   ├── Cargo.toml                  # lancedb, pdf-extract, docx-rs, calamine 등
│   ├── src/
│   │   ├── main.rs, lib.rs         # 진입점
│   │   ├── clip_server.rs          # ⭐ tiny_http 로컬 HTTP 서버 (extension용)
│   │   ├── commands/
│   │   │   ├── fs.rs               # read_file/write_file/list_directory + binary 추출
│   │   │   ├── project.rs          # create_project/open_project (템플릿 생성)
│   │   │   └── vectorstore.rs      # ⭐ LanceDB upsert/search/delete/count
│   │   └── types/wiki.rs
│   ├── tauri.conf.json
│   └── icons/, capabilities/, build.rs
│
├── extension/                      # Chrome Extension (Manifest V3) — Web Clipper
│   ├── manifest.json               # activeTab + scripting + host 127.0.0.1:19827
│   ├── popup.html/popup.js         # Readability.js + Turndown.js 사용
│   ├── Readability.js              # Mozilla 라이브러리 번들
│   └── Turndown.js                 # HTML → Markdown
│
├── package.json / vite.config.ts / tsconfig*.json
├── README.md / README_CN.md
├── llm-wiki.md                     # Karpathy 원본 gist 사본 (참조)
└── assets/ logo.jpg LICENSE (GPL-3.0)
```

### 주요 엔트리 포인트
- **React 진입점:** `src/main.tsx` → `src/App.tsx` (`loading` → `WelcomeScreen` or `AppLayout`)
- **Rust 진입점:** `src-tauri/src/main.rs` → `lib.rs::run()` (tauri 빌더 설정 + `clip_server::start_clip_server()` 스폰)
- **Ingest 파이프라인 시작:** `src/lib/ingest-queue.ts::enqueueIngest()` 또는 `autoIngest()`
- **Chat 파이프라인 시작:** `src/components/chat/chat-panel.tsx::handleSend()`
- **Chrome Extension 진입점:** `extension/popup.html` + `popup.js`

### 데이터베이스/스토리지
llm_wiki는 **DB를 거의 쓰지 않는다** — 대부분이 **파일 시스템**. 예외는 LanceDB 하나.

| 저장소 | 위치 | 용도 |
|---|---|---|
| **Markdown 파일** | `{project}/wiki/**/*.md`, `{project}/raw/sources/**/*` | 원본(raw)과 위키 페이지 (전부 git 가능) |
| **JSON 영속 파일** | `{project}/.llm-wiki/` | 리뷰 큐 `review.json`, 채팅 `conversations.json` + `chats/{id}.json`, ingest-queue.json, ingest-cache.json |
| **LanceDB** | `{project}/.llm-wiki/lancedb/` | 벡터 임베딩 테이블 `wiki_vectors` (page_id + FixedSizeList<Float32, dim>) |
| **Tauri Store** | OS 사용자 디렉터리 | LLM 설정, 검색 API 키, 임베딩 config, 언어, 최근 프로젝트 리스트 |
| **텍스트 추출 캐시** | `{sourceDir}/.cache/{filename}.txt` | PDF/DOCX/XLSX 추출 결과 — 원본보다 새로우면 재사용 |
| **Obsidian vault** | `{project}/.obsidian/` | 자동 생성되어 Obsidian에서 같은 wiki 디렉터리를 열 수 있게 호환 보장 |

이 **"파일이 정본, DB는 보조"** 구조가 이 프로젝트의 가장 큰 설계철학 중 하나다. 후술.

---

## 3. 핵심 기능 (Feature Inventory)

### 3.1 프로젝트 생성 & 시나리오 템플릿
- `create_project()` (Rust)이 8개 디렉터리를 만들고 `schema.md` + `purpose.md`의 초기본을 작성.
- 5가지 템플릿: **Research / Reading / Personal Growth / Business / General** — 각각 `schema.md`(구조 규칙)와 `purpose.md`(목표·핵심 질문)의 초안을 다르게 생성. `src/lib/templates.ts`에 정의.
- Research 템플릿은 `wiki/methodology/`, `wiki/findings/`, `wiki/thesis/` 같은 추가 디렉터리까지 만들고 `confidence` 같은 추가 프론트매터를 문서화한다.

### 3.2 Sources 임포트 (소스 패널)
- **파일 선택 다이얼로그** (`@tauri-apps/plugin-dialog::open({ multiple: true })`)로 PDF/DOCX/XLSX/PPTX/MD/TXT/JSON/이미지/미디어 등 대량 임포트.
- **폴더 재귀 임포트:** 디렉터리 구조 보존. 각 파일의 상위 폴더명이 `folderContext`로 LLM에 전달되어 분류 힌트로 쓰임 (예: "papers > energy").
- 임포트 후 **큐에 자동 enqueue** → 백그라운드에서 순차 ingest.

### 3.3 Two-Step Chain-of-Thought Ingest ⭐
- `src/lib/ingest.ts::autoIngest()`
- **Step 1 (Analysis):** LLM이 소스를 읽고 구조화된 분석을 만든다 — Key Entities / Key Concepts / Main Arguments & Findings / Connections to Existing Wiki / Contradictions & Tensions / Recommendations.
- **Step 2 (Generation):** 분석 결과를 입력으로 다시 LLM을 호출하여 실제 위키 파일들을 `---FILE: wiki/...---\n...\n---END FILE---` 블록으로 내보냄 + `---REVIEW:---` 블록으로 검토 항목까지.
- 생성물: source summary, entity pages, concept pages, 업데이트된 `index.md`, 추가된 `log.md` 엔트리, 업데이트된 `overview.md`, review items.
- 매 페이지는 YAML frontmatter 필수: `type / title / created / updated / tags / related / sources`. 특히 `sources: ["원본파일명"]`이 **원본 추적성**의 핵심.

### 3.4 Incremental SHA256 캐시
- `src/lib/ingest-cache.ts`
- 임포트 시점에 `crypto.subtle.digest("SHA-256", ...)`로 소스 내용 해시 → `.llm-wiki/ingest-cache.json`에 (hash, timestamp, filesWritten[]) 저장.
- 재ingest 요청 시 해시 비교 → 불변이면 즉시 스킵, LLM 호출 0회로 이전 결과 반환.
- **비용 절감 효과가 매우 큼**: 폴더 재임포트 때마다 모든 파일을 LLM에 다시 넣는 낭비 방지.

### 3.5 Persistent Ingest Queue (`src/lib/ingest-queue.ts`)
- 하나씩 순차 처리 (동시 LLM 호출 방지) — `processing: boolean` 뮤텍스.
- 디스크에 `.llm-wiki/ingest-queue.json`로 영속 → 앱이 죽거나 재시작해도 복구.
- 상태: `pending` | `processing` | `done` | `failed`.
- 최대 3회 자동 재시도 (`MAX_RETRIES = 3`), 실패 후에도 수동 retry 버튼 제공.
- **Cancel 시 부분 생성 파일 롤백:** `lastWrittenFiles`를 추적해 abort 시 해당 파일들 삭제.
- 재시작 시 `status === "processing"`이던 항목들을 `pending`으로 되돌려 재개.

### 3.6 Query (Chat) + 하이브리드 컨텍스트 빌딩 ⭐
`src/components/chat/chat-panel.tsx::handleSend()`의 파이프라인:
1. **토큰 검색** (`searchWiki`): `wiki/` + `raw/sources/`에서 모두 검색.
2. **(옵션) 벡터 시맨틱 검색:** 임베딩 활성화 시 OpenAI 호환 `/v1/embeddings` → LanceDB ANN → 기존 결과에 merge(5× boost) 또는 새로 추가.
3. **그래프 1단 확장** (`buildRetrievalGraph` + `getRelatedNodes`): 검색 top-10을 seed로 4-신호 relevance로 확장, `relevance >= 2.0` 컷.
4. **예산 제어** (Budget Allocation): `maxContextSize`(4K~1M) 중 60% 위키 페이지 / 5% index / 20% 대화 기록 / 15% system.
5. **우선순위 부여:** P0=제목 매칭, P1=본문 매칭, P2=그래프 확장, P3=overview fallback.
6. **인용 형식 강제:** LLM에게 "`[1][2]` 형식으로 페이지 번호 인용하고, 응답 끝에 HTML 코멘트 `<!-- cited: 1, 3, 5 -->`로 사용한 페이지 목록을 달라"고 지시 → 하단 "Cited References" 패널에 표시.

### 3.7 Multi-Conversation Chat
- 독립 대화 생성/삭제/이름변경
- 각 대화는 `.llm-wiki/chats/{convId}.json`으로 영속
- 대화별 히스토리 깊이 조절 (`maxHistoryMessages` 기본 10)
- Regenerate 버튼 (마지막 assistant+user 쌍 제거 후 재전송)
- **Save to Wiki** 버튼으로 채팅 응답을 `wiki/queries/`에 저장 → auto-ingest로 엔터티/컨셉 추출

### 3.8 Thinking/Reasoning 스트리밍 표시
- DeepSeek/QwQ 같은 모델의 `<think>...</think>` 블록을 검출해 스트리밍 중 롤링 5라인 fade-in 표시. 완료 후 접힘. (src에서는 메시지 컴포넌트 측 처리)
- 합성 저장 시에는 `<think>` 블록을 문자열 치환으로 제거 (`deep-research.ts` 180줄).

### 3.9 Knowledge Graph (4-신호 relevance + Louvain 커뮤니티)
- `src/lib/graph-relevance.ts`의 **4 신호:**
  | 신호 | 가중치 | 설명 |
  |---|---|---|
  | Direct link | 3.0 | `[[wikilink]]` 양방향 |
  | Source overlap | 4.0 | 같은 원본 파일을 공유 (frontmatter `sources[]`) |
  | Adamic-Adar | 1.5 | `Σ 1/log(degree(공통이웃))` — degree가 작은 공통이웃일수록 가중 |
  | Type affinity | 1.0 | `entity↔concept = 1.2`, `source↔source = 0.5` 등 행렬 |
- `src/lib/wiki-graph.ts` — graphology 그래프 구축 + `graphology-communities-louvain::louvain()`으로 커뮤니티 감지.
- 커뮤니티 응집도(cohesion) = 실제 intra-edge / 가능한 intra-edge. `< 0.15`면 "희박 커뮤니티" 경고.
- 시각화: sigma.js + ForceAtlas2 레이아웃, 타입 vs 커뮤니티 색상 토글, hover시 이웃 유지 + 비이웃 dim + edge에 relevance 점수 표시.

### 3.10 Graph Insights: Surprising Connections + Knowledge Gaps ⭐
- `src/lib/graph-insights.ts`
- **Surprising Connections:** 크로스 커뮤니티 엣지, 크로스 타입 엣지 (source↔concept 등), 주변부↔허브 결합, 약한-존재 엣지 → 합산 점수 top-5
- **Knowledge Gaps:**
  - **Isolated nodes** (degree ≤ 1) — 고립 페이지
  - **Sparse communities** (cohesion < 0.15, n ≥ 3)
  - **Bridge nodes** (3개 이상 커뮤니티와 인접) — 핵심 연결점
- 각 인사이트에 "Deep Research" 버튼: `optimizeResearchTopic()`이 overview.md + purpose.md를 읽어 **도메인 맞춤 검색 쿼리**를 만들고, 사용자에게 편집 가능한 확인 다이얼로그를 띄운 뒤 Tavily로 리서치 → 결과 자동 auto-ingest.

### 3.11 Deep Research
- `src/lib/deep-research.ts` + `src/lib/web-search.ts`
- Tavily API(`search_depth: "advanced"`) 다중 쿼리 호출 → URL 중복 제거 → LLM으로 합성 → `wiki/queries/research-{slug}-{date}.md`에 저장 → auto-ingest.
- `<think>` 블록 저장 전 제거.
- 최대 3개 동시 실행 (`maxConcurrent`).
- 진행 상태 스트리밍 UI (Research Panel).

### 3.12 Async Review System
- `src/stores/review-store.ts`
- Ingest 시 LLM이 `---REVIEW:type|Title---...---END REVIEW---` 블록을 만들면 파싱해 큐에 추가.
- **Predefined action types:** "Create Page" | "Skip" — LLM이 임의 액션 만드는 것을 막는 가드.
- **Search queries pre-generated:** `SEARCH: query1 | query2 | query3` 필드 파싱 → 나중에 "Deep Research" 버튼 한 방에 실행.
- 사용자가 언제든 처리 (블로킹 X).
- `.llm-wiki/review.json`으로 영속 + 자동 저장 (디바운스 1초).

### 3.13 Lint (구조 + 시맨틱)
- **Structural** (로컬, LLM 안 씀): orphan (inbound 0), broken link (`[[foo]]`인데 `foo.md` 없음), no-outlinks.
- **Semantic** (LLM): 모든 페이지 요약(500자씩)을 LLM에게 넣어 "contradiction / stale / missing-page / suggestion"을 `---LINT:---` 블록으로 리턴받아 파싱.

### 3.14 Chrome Web Clipper (확장)
- Manifest V3. Readability.js로 기사 본문 추출, Turndown.js로 HTML→Markdown 변환 (테이블/이미지 규칙 커스텀).
- 앱 쪽 Rust `tiny_http` 서버가 `127.0.0.1:19827`에서 `/status`, `/project`, `/projects`, `/clip`, `/clips/pending` 등을 서비스.
- 프런트엔드 `clip-watcher.ts`가 3초마다 `/clips/pending` 폴링 → 새 클립이 현재 프로젝트용이면 auto-ingest 트리거.
- 확장의 프로젝트 피커(Dropdown): 앱이 보내준 최근 프로젝트 목록에서 선택.

### 3.15 Multi-format Document Support (Rust 추출기)
| 포맷 | 추출 방식 |
|---|---|
| PDF | `pdf-extract` crate |
| DOCX | `docx-rs` — 헤딩/bold/italic/list/table까지 구조 보존 Markdown으로 |
| PPTX | `zip` unpack + XML 파싱 — 슬라이드별 heading/list |
| XLSX/XLS/ODS | `calamine` — 셀 타입 유지, 멀티시트, Markdown table |
| 이미지/미디어 | 크기 요약만 ("`[Image: foo.png (12.3 KB)]`") |
| .doc / .pages / .key / .epub | "extraction not supported" placeholder |
- **추출 캐시:** `{parent}/.cache/{filename}.txt` — 원본보다 새 수정이 있으면 재추출.

### 3.16 Cascade Deletion
- 소스 파일 삭제 시 wiki 페이지도 **3-method matching**으로 정리:
  1. Frontmatter `sources:[...]`에 파일명이 있는지
  2. `wiki/sources/{basename}.md`인지
  3. Frontmatter section refs
- 공유된 entity/concept 페이지는 전체 삭제가 아니라 `sources[]`에서만 해당 항목 제거 (다른 소스가 참조하면 보존).
- `wikilink cleanup`: 삭제된 페이지를 가리키는 `[[...]]` 제거.

### 3.17 Configurable Context Window
- Slider 4K → 1M 토큰 (실제로는 character 단위로 근사).
- **비례 예산:** `60% wiki pages / 20% chat history / 5% index / 15% system`.

### 3.18 Multi-provider LLM Support
- `src/lib/llm-providers.ts`: **OpenAI, Anthropic, Google, Ollama, minimax, custom (OpenAI-compatible)**.
- 각 프로바이더가 `{ url, headers, buildBody, parseStream }` 구조로 정리.
- 스트리밍 파서를 각각 구현 (OpenAI `data: {...}`, Anthropic `content_block_delta.text`, Google SSE).
- 15분 timeout + AbortSignal 결합.

### 3.19 Editor (Milkdown)
- WYSIWYG (ProseMirror 기반) — 마크다운을 실시간 편집하면서도 수식/GFM 모두 렌더.
- 저장 시 `onSave(markdown)` 콜백으로 원본 md를 써내려감.
- `wrapBareMathBlocks()`로 `\begin{aligned}...` 같은 bare LaTeX를 `$$ ... $$`로 자동 감싸줌.
- LaTeX → Unicode fallback (`latex-to-unicode.ts`)은 수식 블록 **밖의** 간단 표기를 위한 보조 매핑 (100+개).

### 3.20 Auto-save + Crash Recovery
- `src/lib/auto-save.ts`: Zustand `subscribe`로 리뷰 큐 변경 시 1초 디바운스, 채팅 변경 시 2초 디바운스 저장.
- 스트리밍 중에는 저장 안 함.
- 앱 시작 시 `restoreQueue()`, `loadReviewItems()`, `loadChatHistory()`로 복원.

---

## 4. LLM 사용 패턴 ⭐⭐⭐

### 4.1 어떤 LLM/모델?
- **프로바이더 6종:** OpenAI / Anthropic / Google / Ollama (로컬) / minimax / custom (OpenAI-호환 엔드포인트).
- 모델은 문자열 입력, 하드코딩 없음 — 사용자가 Settings에서 `model` 문자열 지정.
- 기본값은 `""` (빈) → 사용자가 반드시 설정해야 함.

### 4.2 어느 파일/함수에서 호출?
- **단일 창구:** `src/lib/llm-client.ts::streamChat(config, messages, callbacks, signal)` 하나.
- 내부는 `llm-providers.ts::getProviderConfig(config)`에 따라 URL/헤더/바디/파서 스위칭.
- 호출 지점:
  - `src/lib/ingest.ts::autoIngest()` — Analysis + Generation 2회
  - `src/lib/ingest.ts::startIngest()` / `executeIngestWrites()` — 대화형 ingest (지금은 `autoIngest`가 기본 플로우)
  - `src/lib/deep-research.ts::executeResearch()` — 합성 1회
  - `src/lib/optimize-research-topic.ts::optimizeResearchTopic()` — 토픽/쿼리 생성 1회
  - `src/lib/enrich-wikilinks.ts::enrichWithWikilinks()` — 위키링크 보정 1회
  - `src/lib/lint.ts::runSemanticLint()` — 시맨틱 린트 1회
  - `src/components/chat/chat-panel.tsx::handleSend()` — 채팅 응답 스트리밍

### 4.3 프롬프트 패턴
모든 프롬프트가 **TypeScript 배열 + `.filter(Boolean).join("\n")`** 스타일. 예:
```ts
// src/lib/ingest.ts L316–360 (Analysis 프롬프트)
return [
  "You are an expert research analyst. Read the source document and produce a structured analysis.",
  "",
  LANGUAGE_RULE,
  "",
  "Your analysis should cover:",
  "",
  "## Key Entities",
  "List people, organizations, products, datasets, tools mentioned. For each:",
  "- Name and type",
  "- Role in the source (central vs. peripheral)",
  "- Whether it likely already exists in the wiki (check the index)",
  // ... 생략 ...
  purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
  index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
].filter(Boolean).join("\n")
```

공통 블록:
- **Language Rule** (const `LANGUAGE_RULE` in `ingest.ts` L13): 소스 언어 맞추라는 강한 명령.
- **Wiki Purpose + Wiki Schema + Wiki Index + Current Overview** 를 컨텍스트로 주입 (있을 때만, 옵셔널 `.filter(Boolean)`).
- **출력 형식 명세:** `---FILE: path.md---\n...\n---END FILE---` 블록을 파싱 가능한 토큰으로 요구.

### 4.4 구조화된 출력
llm_wiki는 **JSON schema function calling을 쓰지 않는다**. 대신 **텍스트 마커 + 정규식 파싱** 스타일:
- `FILE_BLOCK_REGEX = /---FILE:\s*([^\n-]+?)\s*---\n([\s\S]*?)---END FILE---/g` (ingest.ts L11)
- `REVIEW_BLOCK_REGEX = /---REVIEW:\s*(\w[\w-]*)\s*\|\s*(.+?)\s*---\n([\s\S]*?)---END REVIEW---/g` (L246)
- `LINT_BLOCK_REGEX = /---LINT:\s*([^\n|]+?)\s*\|\s*([^\n|]+?)\s*\|\s*([^\n-]+?)\s*---\n([\s\S]*?)---END LINT---/g` (lint.ts L151)
- 이 안에서 `OPTIONS:`, `PAGES:`, `SEARCH:` 라인을 다시 정규식으로 뽑아냄.
- LINE-based strict format:
  ```
  TOPIC: <one sentence>
  QUERY: <query 1>
  QUERY: <query 2>
  QUERY: <query 3>
  ```
  `optimize-research-topic.ts` L59에서 `^TOPIC:\s*(.+)$/m`, `^QUERY:\s*(.+)$/gm`로 파싱.

**왜 JSON이 아닌가?** 추측: ① 프로바이더 6종 모두가 function calling을 지원하는 건 아님 (특히 Ollama/custom). ② 스트리밍 중 파싱 가능해야 함. ③ 마크다운/위키 페이지 자체를 그대로 토해내야 하는데 JSON 필드에 넣으면 이스케이핑이 복잡해짐. ④ LLM 재시도시 관대함(robustness) — 마커 일부 누락해도 나머지 블록은 파싱 가능.

### 4.5 스트리밍 사용?
**전 기능 스트리밍이 기본.** `streamChat()`이 유일한 API이고 동기 버전은 없다.

```ts
// src/lib/llm-client.ts L89–117
const reader = response.body.getReader()
let lineBuffer = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) { /* flush */; break }
  const [lines, remaining] = parseLines(value, lineBuffer)
  lineBuffer = remaining
  for (const line of lines) {
    const token = providerConfig.parseStream(line.trim())
    if (token !== null) onToken(token)
  }
}
onDone()
```
- `TextDecoder({ stream: true })`로 UTF-8 멀티바이트 경계 처리.
- 라인 단위 버퍼링 (SSE `data: {...}\n`).
- AbortController 연계 + 15분 timeout (`AbortSignal.timeout`).

### 4.6 멀티턴 대화 관리
- `src/stores/chat-store.ts`에 `conversations[]` + `messages[]` (모든 대화 메시지가 한 배열에 `conversationId`로 필터).
- `maxHistoryMessages` (기본 10)로 전송되는 history 슬라이스: `activeConvMessages.slice(-maxHistoryMessages)`.
- 메시지당 `references?: MessageReference[]`를 저장 — 어떤 위키 페이지가 인용되었는지를 **메시지에 고정** (재시작해도 유지).
- Regenerate는 마지막 assistant+user 쌍을 제거 후 재전송.

### 4.7 컨텍스트 주입 방식 (RAG)
다음 4단계가 매 채팅 호출마다 수행된다 (`chat-panel.tsx::handleSend` L171–309):

**Phase 1 — 토큰 검색:**
```ts
const searchResults = await searchWiki(pp, text) // L187
const topSearchResults = searchResults.slice(0, 10)
```
- 영어: 화이트스페이스 + 문장부호 분리 + 영어 불용어 제거
- 한국어/중국어: **CJK bigram** 분해 + 개별 문자 + 원 토큰 전부 추가
  ```ts
  // search.ts L41–51
  if (hasCJK && token.length > 2) {
    const chars = [...token]
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(chars[i] + chars[i + 1])  // bigram
    }
    for (const ch of chars) {
      if (!STOP_WORDS.has(ch)) tokens.push(ch)
    }
    tokens.push(token)  // original
  }
  ```
- Title match에 +10점 보너스, content match는 출현 개수만큼 가산.

**Phase 1.5 — 벡터 검색 (옵션):**
```ts
// search.ts L143–204
const vectorResults = await searchByEmbedding(pp, query, embCfg, 10)
for (const vr of vectorResults) {
  if (existing) existing.score += vr.score * 5  // 부스트
  else /* 새 결과로 추가 */
}
```

**Phase 2 — 그래프 확장:**
```ts
// chat-panel.tsx L220–236
const graph = await buildRetrievalGraph(pp, dataVersion)
for (const result of topSearchResults) {
  const related = getRelatedNodes(nodeId, graph, 3)
  for (const { node, relevance } of related) {
    if (relevance < 2.0) continue
    if (searchHitPaths.has(node.path)) continue
    graphExpansions.push({ title: node.title, path: node.path, relevance })
  }
}
```

**Phase 3 — Budget Control:**
```ts
// chat-panel.tsx L172–259
const INDEX_BUDGET = Math.floor(maxCtx * 0.05)
const PAGE_BUDGET = Math.floor(maxCtx * 0.6)
const MAX_PAGE_SIZE = Math.min(Math.floor(PAGE_BUDGET * 0.3), 30_000)
```
- 페이지 우선순위 추가: P0 title match → P1 content match → P2 graph expansion → P3 overview fallback
- 각 페이지는 `MAX_PAGE_SIZE` 초과 시 잘라서 `[...truncated...]` 표시.
- 인덱스도 query tokens가 포함된 라인만 남기고 trim.

**Phase 4 — Context Assembly:**
```
## Wiki Purpose\n{purpose.md}
## Wiki Index\n{index.md (trimmed)}
## Page List\n[1] title (path)\n[2] ...
## Wiki Pages\n### [1] title\nPath: ...\n\n{content}\n---\n### [2] ...
```
- LLM에게 **페이지 번호로 인용하고 (`[1][2]`)**, 응답 끝에 **hidden comment** `<!-- cited: 1, 3, 5 -->`를 달게 한다 (chat-panel.tsx L297–301).
- 응답 언어는 `detectLanguage(text)` 결과로 강제.

### 4.8 구체적 코드 스니펫

**A) Analysis 프롬프트의 `LANGUAGE_RULE` 상수 (파일:라인)**
```
src/lib/ingest.ts L13:
export const LANGUAGE_RULE = "## Language Rule\n- ALWAYS match the language of the source document. If the source is in Chinese, write in Chinese. If in English, write in English. Wiki page titles, content, and descriptions should all be in the same language as the source material."
```

**B) Chat 응답에 인용 강제 (파일:라인)**
```
src/components/chat/chat-panel.tsx L286–308:
systemMessages.push({
  role: "system",
  content: [
    "You are a knowledgeable wiki assistant. Answer questions based on the wiki content provided below.",
    ...
    `## CRITICAL: Response Language`,
    `The user is writing in **${detectLanguage(text)}**. You MUST respond in **${detectLanguage(text)}** regardless of what language the wiki content is written in. This is a mandatory requirement.`,
    ...
    "- When citing information, use the page number in brackets, e.g. [1], [2].",
    "- At the VERY END of your response, add a hidden comment listing which page numbers you used:",
    "  <!-- cited: 1, 3, 5 -->",
    ...
  ].filter(Boolean).join("\n"),
})
```

**C) 15분 타임아웃 + AbortController 결합 (파일:라인)**
```
src/lib/llm-client.ts L31–47:
const timeoutMs = 15 * 60 * 1000
if (typeof AbortSignal.timeout === "function") {
  timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController?.abort(), timeoutMs)
  if (signal) {
    signal.addEventListener("abort", () => {
      clearTimeout(timeoutId)
      timeoutController?.abort()
    })
  }
  combinedSignal = timeoutController.signal
}
```

**D) Provider 스위칭 (Anthropic의 특수 처리 예시)**
```
src/lib/llm-providers.ts L123–137:
case "anthropic":
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    buildBody: (messages) => ({
      ...buildAnthropicBody(messages),  // system 분리 + max_tokens 4096
      model,
    }),
    parseStream: parseAnthropicLine,
  }
```

---

## 5. 텍스트 임베딩 & 벡터 검색 ⭐⭐⭐

### 5.1 임베딩 사용 여부
**옵션 (기본 OFF).** Settings에서 활성화 + 엔드포인트/모델/API키 입력해야 동작. 비활성 시 파이프라인은 토큰검색 + 그래프만 사용.

### 5.2 임베딩 모델
- 모델명은 사용자 설정 (예: `text-embedding-qwen3-embedding-0.6b`, `text-embedding-ada-002`, `text-embedding-3-small` 등 자유).
- **OpenAI-compatible endpoint** 모두 가능 (LM Studio 로컬, Jina, Voyage, OpenAI 공식 등).
- 엔드포인트 예: `http://127.0.0.1:1234/v1/embeddings` (로컬 LM Studio).

### 5.3 벡터 DB
- **LanceDB** — Rust 네이티브 임베디드 벡터 DB.
- `src-tauri/Cargo.toml`: `lancedb = "0.27.2"`.
- `src-tauri/src/commands/vectorstore.rs`에 전부 구현. Frontend에서 `invoke("vector_upsert" | "vector_search" | "vector_delete" | "vector_count")`로 호출.
- 저장 위치: `{project}/.llm-wiki/lancedb/wiki_vectors`.
- Arrow 스키마:
  ```rust
  // vectorstore.rs L33–45
  Field::new("page_id", DataType::Utf8, false),
  Field::new("vector",
    DataType::FixedSizeList(
      Arc::new(Field::new("item", DataType::Float32, true)),
      dim,  // 첫 upsert 때 자동 결정
    ),
    false,
  ),
  ```

### 5.4 인덱싱 파이프라인
- **단일 페이지 단위** (청킹 **없음**): wiki 페이지 1개 = 벡터 1개.
- ingest 완료 후 자동 실행:
  ```ts
  // ingest.ts L185–204
  if (embCfg.enabled && embCfg.model && writtenPaths.length > 0) {
    const { embedPage } = await import("@/lib/embedding")
    for (const wpath of writtenPaths) {
      const pageId = wpath.split("/").pop()?.replace(/\.md$/, "")
      if (!pageId || ["index", "log", "overview"].includes(pageId)) continue
      const content = await readFile(`${pp}/${wpath}`)
      const titleMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
      const title = titleMatch ? titleMatch[1].trim() : pageId
      await embedPage(pp, pageId, title, content, embCfg)
    }
  }
  ```
- 임베딩 대상 텍스트:
  ```ts
  // embedding.ts L87
  const text = `${title}\n${content.slice(0, 1500)}`
  ```
  **title + 본문 첫 1500자.** 매우 단순.
- 전체 재인덱싱도 있음: `embedAllPages()` — 미인덱스 페이지들만 순회. `index/log/overview/purpose/schema` 제외.

### 5.5 청킹 전략
**청킹 없음 (per-page = 1 vector).** 이게 장단점 중 가장 큰 트레이드오프:
- **장점:** 페이지 단위 ID가 자명 (page_id = filename), 인덱싱이 간단, 삭제/갱신도 단순, 페이지 자체가 이미 LLM이 편집한 응축 단위라 과잉 청킹 불필요.
- **단점:** 긴 페이지 (> 1500자)는 뒷부분이 벡터화 안 됨 → 일부 정보가 시맨틱 검색에서 누락 가능.

### 5.6 검색 쿼리 방식
```ts
// embedding.ts L159–178
export async function searchByEmbedding(projectPath, query, embeddingConfig, topK = 10) {
  const queryEmb = await fetchEmbedding(query, embeddingConfig)  // 쿼리 자체도 임베딩
  if (!queryEmb) return []
  const results = await vectorSearchLance(projectPath, queryEmb, topK)
  return results.map((r) => ({ id: r.page_id, score: r.score }))
}
```
- LanceDB는 거리 기반 (`_distance` 컬럼) → `score = 1 / (1 + distance)`로 정규화 (vectorstore.rs L167).
- `top_k = 10` 기본.

### 5.7 하이브리드 검색 ⭐
**YES.** `src/lib/search.ts::searchWiki()` (L112–215)가 핵심:
- Phase 1: 토큰 검색 (wiki + raw/sources)
- Phase 1.5: 벡터 검색 → 결과 머지
  - 이미 토큰 매칭된 페이지: `existing.score += vr.score * 5` (5× 부스트)
  - 새 페이지: 여러 디렉터리(`entities, concepts, sources, synthesis, comparison, queries`)에서 `{pageId}.md`를 찾아 추가, score = `vr.score * 5`
- 최종: `results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS=20)`
- README 주장: **recall 58.2% → 71.4% 향상** (벡터 활성화 시).

### 5.8 Re-ranking 사용?
**없음 (dedicated LLM re-ranker는 없음).** 대신:
- 그래프 확장이 2차 re-ranking 역할 (seed → 4-신호 relevance로 related 찾기)
- Budget control이 페이지 우선순위(P0~P3)를 부여

---

## 6. Wiki 에디터/렌더링 ⭐⭐

### 6.1 Markdown? Rich Text? Block-based?
- **편집:** Milkdown (WYSIWYG, ProseMirror 기반). 입력 시에는 일반 마크다운 문법을 타이핑하면 즉시 스타일링된다. 저장 결과는 **순수 마크다운**.
- **렌더링 (chat / preview):** `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`.
- 위키 페이지는 **Obsidian 호환 마크다운**: frontmatter + `[[wikilinks]]` + GFM 테이블 + 수식.

### 6.2 어떤 에디터 라이브러리?
- **Milkdown 7.20** (`@milkdown/kit/core`, `@milkdown/kit/preset/commonmark`, `@milkdown/kit/preset/gfm`, `@milkdown/plugin-math`, `@milkdown/react`, `@milkdown/theme-nord`).
- 통합 방식:
  ```tsx
  // src/components/editor/wiki-editor.tsx L20–37
  useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, content)
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onSave(markdown)  // 마크다운 변경 즉시 저장 콜백
        })
      })
      .use(commonmark).use(gfm).use(math).use(history).use(listener),
    [content],
  )
  ```
- **에디터 외 렌더:** `react-markdown`이 별도로 chat message / preview에 사용.

### 6.3 실시간 협업?
**없음.** 단일 사용자, 로컬 전용. Zustand 상태 + 파일 시스템만.

### 6.4 버전 관리/히스토리
**없음 (앱 레벨에서).** 대신:
- **Git 사용이 전제** (README: "the wiki is just a git repo of markdown files").
- 최종 파일이 전부 `.md`라서 `git log`, `git diff`로 자연스럽게 버전 관리.
- `log.md`가 semi-버전 기록 역할 (`## [YYYY-MM-DD] ingest | Title` 형식).

### 6.5 첨부파일/이미지 처리
- **Images:** `raw/assets/` 디렉터리 + 이미지 네이티브 프리뷰 (`file-preview.tsx`). PNG/JPG/GIF/WebP/SVG/etc.
- **Video/Audio:** `<video>`/`<audio>` 태그로 내장 플레이어.
- **Obsidian 호환:** 이미지는 `![[image.png]]` 혹은 `![](path/to/image.png)` 둘 다 가능.

### 6.6 수식, 코드블록, 다이어그램
- **수식:** KaTeX (inline `$...$`, block `$$...$$`). `wrapBareMathBlocks()`로 `\begin{aligned}` 같은 bare 환경을 자동 wrap.
- **코드블록:** GFM fenced code block. Syntax highlighting은 `react-markdown` 기본 처리.
- **다이어그램:** 전용 라이브러리 없음. (mermaid, plantuml 없음)
- **LaTeX Unicode fallback:** `src/lib/latex-to-unicode.ts`에 100+ 매핑 (`\alpha → α`, `\rightarrow → →`) — 수식 블록 **외부**의 간단 표기를 위한 보조.

---

## 7. 권한/접근 제어

**없음.** 단일 로컬 사용자 데스크톱 앱이므로 auth/RBAC 없음.
- 프로젝트는 디렉터리 권한(OS) 그대로.
- 공개/비공개 토글, 문서별 권한, 사용자 인증 **모두 부재**.
- Web Clipper는 `127.0.0.1:19827` 로컬만 받기 때문에 네트워크 외부 노출 없음.

Jarvis 통합에는 **완전히 새로 쌓아야 할 영역.** llm_wiki에는 관련 코드/패턴 참고할 게 없다.

---

## 8. 데이터 파이프라인

### 8.1 위키 문서 → 검색 인덱스 동기화
- **파일 쓰기 직후 즉시:** `autoIngest()` 끝에 writtenPaths를 순회하며 `embedPage()` (토큰 검색은 실시간 파일 스캔이므로 별도 인덱싱 없음).
- **데이터 변경 시그널:** `useWikiStore.getState().bumpDataVersion()` — 그래프 캐시 무효화의 트리거. `buildRetrievalGraph()`이 `dataVersion`을 비교해 캐시 재사용 여부 결정.
  ```ts
  // graph-relevance.ts L159–162
  if (cachedGraph !== null && cachedGraph.dataVersion === dataVersion) {
    return cachedGraph
  }
  ```

### 8.2 배치 vs 실시간
- **실시간:** ingest queue가 파일 드롭 즉시 처리 시작. 채팅은 매 질의마다 `buildRetrievalGraph` 호출 (캐시 있음).
- **배치:** `embedAllPages()` — 설정 활성화 시 기존 페이지 일괄 인덱싱.

### 8.3 업데이트 감지 및 재인덱싱
- **SHA256 해시 비교** (`ingest-cache.ts`)로 재ingest 필요 여부 판단.
- 외부에서 파일이 바뀌면(앱 밖에서 사용자가 수정) 자동 감지 **없음** — 사용자가 수동 "re-ingest" 버튼 눌러야 함.
- **텍스트 추출 캐시**는 원본 mtime > 캐시 mtime 비교로 자동 무효화 (`fs.rs::read_cache` L94–101).

---

## 9. UI/UX 패턴

### 9.1 레이아웃
- **Three-column** (reszbizable):
  - **Left:** Knowledge Tree(엔터티/컨셉 등 타입별 트리) OR File Tree(실제 파일 트리) 토글
  - **Center:** Chat Panel (대화 사이드바 + 메시지)
  - **Right:** Preview Panel (선택된 위키 페이지 렌더)
- **IconSidebar** (가장 왼쪽 세로 바): Wiki / Sources / Search / Graph / Lint / Review / Deep Research / Settings
- **ActivityPanel** (하단 또는 오버레이): 진행 중인 ingest/lint/research 실시간 상태
- `react-resizable-panels`로 드래그 리사이즈 (min/max constraints)

### 9.2 검색 UX
- Search 탭에서 전역 쿼리 입력 → 결과 리스트 (title + snippet + score).
- `MAX_RESULTS = 20` (search.ts L13).
- Snippet은 쿼리 주변 80자 컨텍스트를 좌우로 잘라 `...` prefix/suffix (`buildSnippet` L98–110).
- **Instant search 아님** (명시적 입력 후 검색). Facet/필터도 없음.

### 9.3 AI 질의 UX
- **Chat panel (center column)**: 전체 좌측/우측과 나란히. Conversation sidebar + messages + streaming.
- 인라인 (페이지 내 ask)은 없음. 전부 중앙 채팅 중심.
- **Deep Research**는 별도 패널 (`research-panel.tsx`) — dynamic height, 진행상태 실시간.
- **Cited References**: 각 assistant 메시지 하단에 접힘/펼침 섹션으로 인용 페이지 그룹핑 (type별 아이콘).
- **Thinking** `<think>...</think>` 스트리밍은 롤링 5라인 fade.

### 9.4 위키 링크 처리
- `[[slug]]` 또는 `[[slug|alias]]` 형식 (WIKILINK_REGEX = `/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g`).
- 렌더링 시 해당 슬러그의 파일을 찾아 클릭 가능 링크로 변환.
- Cross-file 링크는 `resolveTarget(raw, nodeIds)` (graph-relevance.ts L124–138)가 정규화 — 공백↔하이픈 변환, 대소문자 무시.
- Enrich: 사용자가 수동 저장한 페이지나 Deep Research 결과에 자동으로 `[[wikilink]]` 추가 (`enrichWithWikilinks`).

---

## 10. 강점 (왜 좋은가)

1. **"파일이 정본"** 설계. 모든 위키가 순수 마크다운이라 git/Obsidian/외부 에디터와 자연 호환. Lock-in 제로.
2. **2-step CoT ingest의 품질.** 한 번에 쓰지 않고 Analysis → Generation으로 나눈 덕에 cross-reference 품질이 크게 올라감. LLM이 먼저 "무엇을 쓸지"를 체계적으로 정하고 나서 쓰는 것이 할루시네이션을 줄인다.
3. **Source traceability가 구조적으로 박힘.** Frontmatter의 `sources: []` 필드가 그래프 relevance 4-신호 중 최고 가중치(4.0) — 출처 공유 페이지끼리 자연스럽게 군집화.
4. **SHA256 incremental cache.** 같은 폴더 재임포트, 변경 없는 파일에 LLM 호출 0회. 실제 돈/시간 절약이 큼.
5. **Ingest queue의 영속성 + retry.** 크래시/종료에도 큐 복구. 순차 처리로 동시 호출 방지. 비용/rate-limit 친화적.
6. **4-신호 relevance가 정교함.** 단순 `[[wikilink]]` 개수가 아니라 source 공유 + Adamic-Adar(공통 이웃 가중) + 타입 친화도까지 — 작은 그래프에서도 의미 있는 연관성 발견.
7. **Louvain + 지식 격차 감지.** "뭘 더 연구할지"까지 시스템이 제안 → 지식 그래프가 실행 가능한 피드백 루프 형성.
8. **하이브리드 검색 + 그래프 확장 + 예산 제어.** RAG 파이프라인이 매우 합리적 (토큰 → 벡터 merge → graph seed → budget-aware 조립). 대부분 상용 RAG 대비 재현율 우수(README 기준).
9. **멀티 프로바이더 LLM 지원 + 스트리밍.** Ollama 로컬로 완전 오프라인 가능. Custom 엔드포인트로 vLLM/TGI 같은 사내 모델 연결도 쉬움.
10. **Web Clipper + 로컬 HTTP 서버 연결의 깔끔함.** Extension은 Readability.js + Turndown.js로 정확히 추출, 앱은 폴링으로 자동 ingest. `127.0.0.1`만 허용해 보안 공격면 최소.
11. **크로스플랫폼 세심함.** `normalizePath()` 22개 파일에서 사용, Unicode-safe char slicing (byte X), macOS close-to-hide, GitHub Actions CI (`.dmg`/`.msi`/`.deb`/`.AppImage`).
12. **`<think>` 블록 지원.** DeepSeek/QwQ 등 reasoning 모델 네이티브 대응.
13. **Graph Insights의 실용성.** 단순 시각화에 그치지 않고 "Deep Research 원클릭"까지 action loop 구성.
14. **Purpose.md 추가가 영리함.** Schema는 구조, Purpose는 방향 — LLM이 매번 주입받아 context-aware ingest/query 가능.

## 11. 약점 & 제약

1. **데스크톱 전용 (Tauri).** Jarvis는 Next.js 웹이라 아키텍처 근본이 다름.
2. **단일 사용자 전제.** 인증/권한/공유/협업 완전 부재. 사내 5000명은 재설계가 필요.
3. **청킹 없음.** 페이지당 벡터 1개 + 첫 1500자만 임베딩 → 긴 문서의 후반부 시맨틱 검색 누락.
4. **Fts / BM25 아님.** 토큰 검색은 단순 `content.includes(token)` 기반 (단, title bonus + CJK bigram). OpenSearch/Postgres FTS 대비 랭킹 품질 부족.
5. **벡터 DB가 LanceDB.** Jarvis의 pgvector와 정합성 없음 → Rust 바인딩을 Node/Next.js 프런트로 가져올 수 없음. 포팅 시 모델/파이프라인만 참고하고 저장소는 pgvector로 교체해야.
6. **구조화 출력이 텍스트 마커 + 정규식.** JSON schema/function calling 대비 파싱 강건성 낮음 (LLM이 간혹 마커를 깨뜨림). Jarvis는 structured output API 쓰는 게 더 안전.
7. **로컬 파일 100%.** DB 트랜잭션/동시성 보장 없음. 5000명 동시 수정은 파일 기반으로 불가능 — Postgres 저장으로 반드시 교체.
8. **i18n 한국어 부재.** 영/중만. ko 번역 추가 필요.
9. **LLM 재시도가 task 레벨에만.** Analysis/Generation 사이에 실패하면 전체 재시도 → 부분 진행 보존 안 됨.
10. **Rate-limit / token 사용량 tracking 없음.** 비용 모니터링 부재.
11. **개인정보/민감도(sensitivity) 태그 없음.** Jarvis는 공개/내부/기밀 구분 필수.
12. **테스트 커버리지 낮음.** `vitest` 존재하지만 `src/lib/__tests__/` 만 있음, 대부분 미커버.
13. **Milkdown의 Obsidian wikilink 직접 지원 아님.** Custom handler를 구현해야 `[[slug]]`가 클릭 가능. 현재 파일에서는 commonmark+gfm+math만.
14. **SSE/스트리밍이 Tauri webview의 fetch 사용.** Next.js에서는 server-sent events나 Edge Runtime streaming 직접 구현 필요.
15. **graphology가 브라우저 메모리에 전체 로드.** 수천 페이지까지는 OK지만 10K+면 서버 사이드 계산으로 옮겨야.
16. **"Everything is a file" → 검색/필터/소팅이 디렉터리 전체 재귀.** 5000명 × 수만 페이지에서는 O(n) 재귀가 느려짐 — 인덱스 DB 필수.

---

## 12. Jarvis 통합 가능성 평가 ⭐⭐⭐⭐⭐

### 12.1 프로젝트 전체 가져오기 가능?
**아니오. 하지만 "아이디어의 보고".**
- 프레임워크 자체가 다름: Tauri(데스크톱) vs Next.js 15(웹).
- 저장소 다름: 파일시스템 + LanceDB vs Postgres + pgvector + OpenSearch.
- 단일 사용자 전제 vs 5000명 멀티테넌트.
- 따라서 "copy-paste 재사용"은 거의 없고, **"설계 패턴/알고리즘/프롬프트/UX 패러다임을 이식"** 하는 방식이어야 한다.

### 12.2 핵심 아이디어 Top 5 (Jarvis에 즉시 적용 가능)

#### **① Two-Step Chain-of-Thought Ingest 패턴 ⭐⭐⭐⭐⭐**
- 원리: LLM에게 한 번에 "분석하고 써라"가 아니라 "먼저 분석만 하라 → 그 분석을 입력으로 받아 써라" 2번 호출.
- Jarvis 적용: 사내 문서(PPT, 회의록, PRD) 임포트 파이프라인의 품질을 크게 올릴 수 있다. 현재 `apps/worker`의 ingest에 적용 가능.
- 구현 포인트: `src/lib/ingest.ts::autoIngest()` L68–121의 두 번의 `streamChat` 호출 패턴 그대로 이식.
- **비용:** LLM 호출 2배. 하지만 OpenAI 응답 품질 개선폭이 커서 손익분기 OK.

#### **② Source Traceability Frontmatter (`sources: []`) + 4-신호 Relevance ⭐⭐⭐⭐⭐**
- 모든 엔터티/컨셉 페이지가 원본 소스 파일명(들)을 frontmatter에 박아둔다 → 그래프 relevance의 강력한 신호.
- Jarvis 적용: `wiki_pages` 테이블에 `source_refs: text[]` 컬럼 + GIN 인덱스. Drizzle 스키마 예시:
  ```ts
  export const wikiPages = pgTable("wiki_pages", {
    id: uuid().primaryKey(),
    slug: text().notNull(),
    type: pgEnum(...)("page_type").notNull(),
    sourceRefs: text("source_refs").array().notNull().default([]),  // ← 핵심
    // ...
  })
  ```
- 4-신호 relevance 계산식은 Jarvis에서 SQL/in-memory로 쉽게 재현 가능 (pgvector의 `<->`/`<=>`로 유사도까지 더하면 5-신호).
- 구현 참고: `src/lib/graph-relevance.ts` L247–287의 `calculateRelevance` 함수.

#### **③ Knowledge Graph + Graph Insights (지식 격차 / 브리지 / 놀라운 연결) ⭐⭐⭐⭐**
- 단순 시각화가 아닌 **"다음에 뭘 연구/작성해야 하는가"** 라는 실행 가능한 인사이트 생성.
- Jarvis에서 "Knowledge Debt Radar" 피처로 직결 (현재 Phase 6 커밋 내역에 관련 언급 있음).
- Louvain은 브라우저가 아닌 서버에서 계산 → 결과만 캐시. 업데이트 트리거: `dataVersion` bump.
- 구현 참고: `src/lib/wiki-graph.ts` L31–113 (Louvain + cohesion), `src/lib/graph-insights.ts` 전체.

#### **④ 하이브리드 검색 파이프라인 (토큰 + 벡터 merge + 그래프 확장 + Budget Control) ⭐⭐⭐⭐⭐**
- `searchWiki()` 의 4-phase 파이프라인이 Jarvis RAG의 블루프린트가 될 수 있다.
- Jarvis의 스택으로 바꾸면:
  - Phase 1 토큰 검색 → **OpenSearch BM25 / Korean nori 토크나이저**
  - Phase 1.5 벡터 검색 → **pgvector + OpenAI embeddings**
  - Phase 2 그래프 확장 → **Postgres에 저장된 wikilinks edge 테이블 + relevance 계산**
  - Phase 3 Budget Control → 그대로 재사용 (TypeScript 로직)
  - Phase 4 Context Assembly → `[1][2]` 인용 + `<!-- cited: -->` 코멘트 강제
- 구현 참고: `src/lib/search.ts` L112–215 + `src/components/chat/chat-panel.tsx::handleSend` L168–350.

#### **⑤ SHA256 Incremental Cache ⭐⭐⭐⭐**
- 같은 파일 재업로드 / 변경 없는 파일 재처리를 해시 한 방으로 스킵.
- Jarvis 적용: `ingest_cache` 테이블 (file_hash, project_id, output_doc_ids, ingested_at). 이미 Jarvis memory의 Graphify Technical Reference에서 "SHA256 캐시" 언급 → 같은 패턴.
- 구현 참고: `src/lib/ingest-cache.ts` 전체 (100줄). 거의 직역으로 TypeScript + Postgres 옮길 수 있음.

#### **(추가) ⑥ Review Queue + LLM-generated Search Queries ⭐⭐⭐⭐**
- Ingest 중 LLM이 "사람이 판단 필요" 항목에 **최적화된 웹검색 쿼리 2-3개까지 미리 생성**.
- Jarvis 적용: 사내에 "지식 부채 리뷰 큐" 기능을 만들 때 그대로 이식 가능. 관리자 판단만 빠르게 처리하면 되므로 async/non-blocking UX.

#### **(추가) ⑦ Purpose.md / Schema.md 분리 ⭐⭐⭐**
- **Schema (구조 규칙, LLM이 "어떻게" 쓰는가)**와 **Purpose (왜 쓰는가, 핵심 질문, 진화 중인 가설)**를 분리.
- Jarvis에 적용: 부서/프로젝트마다 `purpose`와 `schema`를 따로 두면 LLM ingest/query가 context-aware 해진다. 관리자가 `purpose`만 주기적으로 업데이트하면 됨.

#### **(추가) ⑧ `log.md` 타임라인 + Parseable Format ⭐⭐**
- 모든 조작이 `## [YYYY-MM-DD] ingest | Title` 형식으로 로그됨 → `grep "^## \[" log.md | tail -5` 같은 초간단 쿼리 가능.
- Jarvis에서는 `audit_log` 테이블로 대체하되, **관리자에게 보여주는 UI는 이 타임라인 스타일**이 가독성 좋음.

### 12.3 재사용 가능한 코드/모듈 (경로 기준)

| 모듈 | 경로 | 재사용성 | 난이도 |
|---|---|---|---|
| 2-step CoT ingest 프롬프트 | `src/lib/ingest.ts` L315–459 | **직역 이식 가능** | 낮음 |
| SHA256 캐시 로직 | `src/lib/ingest-cache.ts` | **거의 그대로** | 낮음 |
| Ingest queue + 재시도 + 복구 | `src/lib/ingest-queue.ts` | 로직 이식, 저장소만 Postgres | 중간 |
| 4-신호 relevance 계산 | `src/lib/graph-relevance.ts` L247–287 | **직역** | 낮음 |
| Louvain + cohesion | `src/lib/wiki-graph.ts` L31–113 | 서버사이드 이식 | 중간 |
| Graph insights | `src/lib/graph-insights.ts` | **직역** | 낮음 |
| CJK bigram 토크나이저 | `src/lib/search.ts` L25–62 | 한글 확장 필요 | 중간 |
| Budget-aware context assembly | `src/components/chat/chat-panel.tsx` L171–309 | 로직 직역 | 낮음 |
| 언어 감지 (Unicode script) | `src/lib/detect-language.ts` | **그대로** | 낮음 |
| 프로바이더 추상화 | `src/lib/llm-providers.ts` | Next.js에서는 `ai` SDK로 대체가 더 나음 | 낮음 |
| Deep Research (Tavily+LLM+auto-ingest) | `src/lib/deep-research.ts` | 그대로 | 중간 |
| Research topic optimizer | `src/lib/optimize-research-topic.ts` | **그대로** | 낮음 |
| Enrich wikilinks | `src/lib/enrich-wikilinks.ts` | **그대로** | 낮음 |
| Structural lint (orphan/broken) | `src/lib/lint.ts` L63–147 | **그대로** | 낮음 |
| Semantic lint 프롬프트 | `src/lib/lint.ts` L201–229 | 그대로 | 낮음 |
| Cascade deletion | ingest.ts 내부 + 관련 파일 | 참조로 활용 | 중간 |
| Milkdown 설정 | `src/components/editor/wiki-editor.tsx` | 그대로 + wikilink plugin 추가 | 낮음 |

### 12.4 Jarvis와의 충돌 지점

1. **저장소 구조 근본 차이.**
   - llm_wiki: 로컬 md 파일 + LanceDB
   - Jarvis: Postgres + pgvector + OpenSearch
   - → 모든 파일 I/O를 DB 쿼리로 바꿔야 함. `wiki_pages(id, slug, type, body, frontmatter JSONB, source_refs text[], ...)` 같은 스키마로.

2. **단일 사용자 vs 멀티테넌트.**
   - `.llm-wiki/review.json` → `review_items` 테이블 + `project_id/user_id` scoping
   - `chats/{id}.json` → `conversations` + `messages` 테이블
   - Zustand의 전역 상태들은 서버 fetch + React Query/TanStack Query 기반으로 재구성

3. **권한/sensitivity.**
   - Jarvis의 RBAC + sensitivity 시스템 (공개/내부/기밀)을 모든 테이블에 적용
   - LLM 컨텍스트 주입 시 사용자 권한 이하의 페이지만 포함하도록 필터링 **반드시** 추가

4. **한국어 i18n.**
   - llm_wiki는 `en/zh`만. `ko.json` 키 전부 추가
   - `LANGUAGE_RULE` 프롬프트는 한국어 예시로 확장

5. **OpenSearch 사용.**
   - 토큰 검색을 OpenSearch의 nori (한국어) + ngram/edge_ngram + `simple_query_string`로 대체
   - llm_wiki의 search.ts 로직은 참고 정도로만

6. **Milkdown의 wikilink.**
   - 기본 `[[slug]]` 지원 없음 → `@milkdown/kit`의 custom inline node 확장 필요 (ProseMirror plugin 작성)

7. **Tauri IPC (invoke) vs HTTP API.**
   - `invoke("vector_upsert", {...})` → Next.js는 API Route 또는 Server Action
   - Rust crate 활용 불가 → pdf-parse / mammoth(js) / xlsx(js) 같은 JS 라이브러리로 교체 (품질 저하 가능)

8. **스트리밍 방식.**
   - Tauri webview fetch → Next.js는 Edge Runtime + `ai` SDK의 `streamText`, 또는 Server Actions + ReadableStream
   - 15분 timeout 패턴은 유지 가능

9. **Obsidian 호환.**
   - 로컬 vault 개념이 없음 → 선택: export 기능으로 `.md` 다운로드 제공 가능 (사용자가 로컬 vault로 관리하고 싶을 때)

### 12.5 통합 난이도 평가

| 영역 | 난이도 | 비고 |
|---|---|---|
| **아이디어/패턴 채택** | **낮음** | 읽고 Jarvis 스택으로 재구현 |
| **프롬프트 이식** | **낮음** | 그대로 복사, 한국어 예시만 추가 |
| **4-신호 relevance + Louvain** | **중간** | 브라우저 → 서버 (worker) 이동, graphology는 Node에서도 동작 OK |
| **하이브리드 검색 파이프라인** | **중간** | OpenSearch + pgvector로 저장소 교체 |
| **Ingest queue 영속화** | **중간** | Postgres 테이블로, 트랜잭션/락 주의 |
| **Milkdown 에디터** | **낮음** | Next.js에 그대로 마운트 가능 (SSR 고려 'use client') |
| **Graph 시각화 (sigma.js)** | **중간** | 클라이언트 전용 동적 import (`next/dynamic`), SSR 비활성 |
| **Web Clipper 확장** | **중간** | 로컬 HTTP 서버 → Next.js API + 인증 토큰 필요 |
| **LanceDB → pgvector** | **중간** | 인터페이스는 유사 (upsert/search), 스키마만 재작성 |
| **권한/sensitivity 통합** | **높음** | 처음부터 설계에 포함 |
| **5000명 스케일** | **높음** | 캐시/인덱스/pagination 대대적 추가 |

**종합 난이도: 중간~중상.** 아이디어는 풍부하지만 저장소/권한/스케일 세 축에서 재설계가 불가피.

### 12.6 5000명 사용자 스케일 적합성

llm_wiki 원본은 "한 사람이 하나의 vault"를 전제 → 5000명 그대로 확장 불가. 하지만 **패턴/알고리즘 자체는 확장 가능**하다:

| 영역 | llm_wiki 원본 | 5000명 Jarvis로 확장 |
|---|---|---|
| 위키 저장 | 파일시스템 | Postgres + JSONB + S3(이미지) |
| 검색 | 모든 파일 재귀 스캔 | OpenSearch 사전 인덱스 |
| 벡터 | LanceDB (단일 파일) | pgvector IVFFlat/HNSW 인덱스 + partition by project_id |
| 그래프 계산 | 브라우저 graphology | worker에서 주기적 계산, 결과 캐시 테이블 |
| Louvain | 요청시 계산 | 매일 배치 or dataVersion bump 시 enqueue |
| Ingest queue | 단일 mutex | BullMQ/pg-boss + 동시성 N (rate-limit aware) |
| 컨텍스트 주입 | 매 요청 파일 재읽기 | 페이지 body를 디스크/DB projection에서 가져오기 + `embed_cache` 테이블 캐시 |
| 대화/리뷰 | JSON 파일 | 전용 테이블 + pagination |
| 권한 | 없음 | RBAC + row-level security (Jarvis 기존 sensitivity 시스템) |
| 변경 감지 | SHA256 + mtime | `content_hash` 컬럼 + 업데이트 트리거 |
| 자동 임베딩 | 직렬 1개씩 | Worker 풀 + 배치 API (OpenAI batch endpoint 고려) |

**결론: 5000명 규모는 llm_wiki의 알고리즘 + Jarvis의 서버 인프라 조합으로 충분히 달성 가능.**

---

## 13. 재사용 가능한 핵심 코드 스니펫

### 13.1 Two-Step CoT Ingest의 골격
**위치:** `src/lib/ingest.ts` L19–216

재사용 방법: Jarvis `apps/worker`에 포팅. `streamChat()` 호출은 `ai` SDK의 `streamText({ model, messages })`로 교체. 결과 파싱 정규식은 그대로.

```ts
// 핵심 패턴 요약 (L61–121)
// Step 1
let analysis = ""
await streamChat(llmConfig,
  [{ role: "system", content: buildAnalysisPrompt(purpose, index) },
   { role: "user",   content: `Analyze this source document:\n\n**File:** ${fileName}${folderContext ? `\n**Folder context:** ${folderContext}` : ""}\n\n---\n\n${truncatedContent}` }],
  { onToken: t => analysis += t, onDone: () => {}, onError: e => {/*mark failed*/} },
  signal,
)
// Step 2
let generation = ""
await streamChat(llmConfig,
  [{ role: "system", content: buildGenerationPrompt(schema, purpose, index, fileName, overview) },
   { role: "user",   content: `Based on the following analysis of **${fileName}**, generate the wiki files.\n\n## Source Analysis\n\n${analysis}\n\n## Original Source Content\n\n${truncatedContent}` }],
  { onToken: t => generation += t, ... },
  signal,
)
const writtenPaths = await writeFileBlocks(pp, generation)
```

### 13.2 4-신호 Relevance 계산
**위치:** `src/lib/graph-relevance.ts` L247–287

```ts
// direct links 3.0 / source overlap 4.0 / Adamic-Adar 1.5 / type affinity 1.0
export function calculateRelevance(nodeA, nodeB, graph) {
  if (nodeA.id === nodeB.id) return 0

  const forwardLinks = nodeA.outLinks.has(nodeB.id) ? 1 : 0
  const backwardLinks = nodeB.outLinks.has(nodeA.id) ? 1 : 0
  const directLinkScore = (forwardLinks + backwardLinks) * 3.0

  const sourcesA = new Set(nodeA.sources)
  let sharedSourceCount = 0
  for (const src of nodeB.sources) if (sourcesA.has(src)) sharedSourceCount++
  const sourceOverlapScore = sharedSourceCount * 4.0

  const neighborsA = getNeighbors(nodeA)
  const neighborsB = getNeighbors(nodeB)
  let adamicAdar = 0
  for (const neighborId of neighborsA) {
    if (neighborsB.has(neighborId)) {
      const neighbor = graph.nodes.get(neighborId)
      if (neighbor) {
        const degree = getNodeDegree(neighbor)
        adamicAdar += 1 / Math.log(Math.max(degree, 2))
      }
    }
  }
  const commonNeighborScore = adamicAdar * 1.5

  const affinityMap = TYPE_AFFINITY[nodeA.type]
  const typeAffinityScore = (affinityMap?.[nodeB.type] ?? 0.5) * 1.0

  return directLinkScore + sourceOverlapScore + commonNeighborScore + typeAffinityScore
}
```

재사용 방법: Jarvis `packages/wiki-graph/` (신설)에 그대로 이식. `nodeA.sources`는 Postgres `source_refs text[]` 컬럼에서 fetch.

### 13.3 CJK Bigram 토크나이저 (한국어도 바로 쓸 수 있음)
**위치:** `src/lib/search.ts` L25–62

```ts
const STOP_WORDS = new Set([/* 기존 영중 + 한국어 추가: "그", "이", "의", "은", "는", "을", "를", "에", "에서" */])

export function tokenizeQuery(query: string): string[] {
  const rawTokens = query.toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))

  const tokens: string[] = []
  for (const token of rawTokens) {
    // Unicode range를 확장: 한글 Hangul 포함
    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af]/.test(token)

    if (hasCJK && token.length > 2) {
      const chars = [...token]
      for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1])
      for (const ch of chars) if (!STOP_WORDS.has(ch)) tokens.push(ch)
      tokens.push(token)
    } else {
      tokens.push(token)
    }
  }
  return [...new Set(tokens)]
}
```

재사용 방법: `\uac00-\ud7af`(Hangul Syllables) 추가 + 한국어 불용어 리스트로 확장 → Jarvis 검색 쿼리 전처리에 바로 투입. (단, OpenSearch nori가 더 품질 좋으므로 서브/보조용으로만)

### 13.4 Context Budget Allocation
**위치:** `src/components/chat/chat-panel.tsx` L171–280

```ts
const maxCtx = llmConfig.maxContextSize || 204800
const INDEX_BUDGET = Math.floor(maxCtx * 0.05)
const PAGE_BUDGET  = Math.floor(maxCtx * 0.60)
const MAX_PAGE_SIZE = Math.min(Math.floor(PAGE_BUDGET * 0.30), 30_000)

// priority queue: P0=title match, P1=content match, P2=graph expansion, P3=overview fallback
let usedChars = 0
const tryAddPage = async (title, filePath, priority) => {
  if (usedChars >= PAGE_BUDGET) return false
  const raw = await readFile(filePath)
  const truncated = raw.length > MAX_PAGE_SIZE
    ? raw.slice(0, MAX_PAGE_SIZE) + "\n\n[...truncated...]"
    : raw
  if (usedChars + truncated.length > PAGE_BUDGET) return false
  usedChars += truncated.length
  relevantPages.push({ title, path, content: truncated, priority })
  return true
}
```

재사용 방법: **RAG 답변 품질에 결정적이므로 최우선 이식.** `readFile`만 Postgres 쿼리로 바꾸면 끝.

### 13.5 Ingest Cache (SHA256 + filesWritten)
**위치:** `src/lib/ingest-cache.ts`

```ts
async function sha256(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function checkIngestCache(projectPath, sourceFileName, sourceContent) {
  const cache = await loadCache(projectPath)
  const entry = cache.entries[sourceFileName]
  if (!entry) return null
  const currentHash = await sha256(sourceContent)
  return entry.hash === currentHash ? entry.filesWritten : null
}

export async function saveIngestCache(projectPath, sourceFileName, sourceContent, filesWritten) {
  const cache = await loadCache(projectPath)
  const hash = await sha256(sourceContent)
  cache.entries[sourceFileName] = { hash, timestamp: Date.now(), filesWritten }
  await saveCache(projectPath, cache)
}
```

재사용 방법: Jarvis에 `ingest_cache` 테이블 + 위 함수들을 SQL로 변환. 이미 사내 사용하는 memory에 언급된 graphify의 SHA256 캐시와 동일한 패턴.

---

## 14. 원저자의 설계 철학/교훈

### 14.1 "Wiki는 영속 자산, RAG은 휘발성 조회"
Karpathy 원본 gist와 nashsu 구현 모두의 핵심 명제:
> "The wiki is a persistent, compounding artifact. The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read."

기존 RAG이 매 쿼리마다 원본에서 합성하는 반면, 이 설계는 **한 번 컴파일 → 계속 유지보수**. 모든 이익(속도/비용/일관성)은 이 한 가지 철학에서 파생된다.

### 14.2 "Human curates, LLM maintains"
역할 분담이 깔끔하다:
- 사람: 소스 수집, 탐색, 질문, 큰 방향 설정
- LLM: 요약, 상호참조, 파일링, bookkeeping

Obsidian은 "IDE", LLM은 "프로그래머", wiki는 "코드베이스"라는 은유.

### 14.3 "파일이 정본"
- Lock-in 방지: 순수 마크다운 파일 → git, Obsidian, 외부 에디터, grep, rsync 전부 동작.
- DB는 보조 인덱스 (LanceDB)일 뿐, 손상돼도 파일에서 재빌드 가능.
- **5000명 Jarvis에서는 이 철학을 깨고 Postgres가 정본이 돼야 하지만**, export 기능으로 "사용자가 언제든 vault로 뽑아갈 수 있게" 유지하는 건 가치가 있다.

### 14.4 "Schema + Purpose 분리"
원본 gist에는 schema만 있는데, 이 구현이 **Purpose.md를 추가**한 건 영리한 결정:
- Schema = 구조 규칙 ("파일은 kebab-case, frontmatter에 type 필수")
- Purpose = 방향 ("우리는 왜 이 위키를 쓰는가, 핵심 질문은 무엇인가")
- LLM이 두 문서를 모두 컨텍스트로 받으면 단순 기계적 포맷터 → **의도를 가진 큐레이터**로 승격.

### 14.5 "LLM의 작업을 분할하라 (Chain-of-Thought)"
한 번에 "분석하고 위키 써라"보다 "분석만 → 결과 받아서 쓰기" 2단계가 품질이 압도적.
- 첫 호출은 JSON/text 출력이든 풍부하게 → temperature 높게 가능
- 두 번째 호출은 구조화된 출력 → temperature 낮게, 파서 친화적
- 실패 지점도 분리되어 디버깅 쉬움

### 14.6 "사용자 개입의 비동기화"
Review Queue / Deep Research의 사용자 확인 다이얼로그 / Lint 결과 알림 모두 **블로킹 없이** 뒤로 미뤄지고, 사용자 여유 있을 때 한 번에 처리.
- LLM은 "이건 사람이 판단해야" 라고 flag만 세우고 다음 작업으로.
- 검색 쿼리까지 LLM이 미리 만들어두기 때문에 **사용자의 클릭 한 번**이 full action (딥리서치)으로 확장.

### 14.7 "실패는 큐에 남긴다"
Ingest queue의 retry + persist 설계는 클라이언트 사이드 앱으로서는 유난히 강건함:
- 크래시/종료 안전 (JSON 파일로 즉시 fsync)
- 부분 생성물 롤백
- 3회 자동 재시도 후 failed 상태로 명시적 남김 → 사용자가 언제든 retry 버튼.

### 14.8 "구조화된 출력은 마커로"
JSON schema/function calling 대신 `---FILE:---`, `---REVIEW:---`, `---LINT:---`:
- Streaming 중간에 부분 파싱 가능
- 한 두 토큰 깨져도 다른 블록은 살아남음
- LLM 프롬프트가 인간에게도 읽기 쉬움 → 디버깅/반복 개선 친화적
- 단점: 정규식 fragility. Jarvis에서는 OpenAI structured output (JSON schema)가 더 안전하지만, Ollama/custom 지원하려면 이 방식이 여전히 유효.

### 14.9 "`sources[]`가 graph의 주축"
`direct link (×3.0)`보다 `source overlap (×4.0)`이 가중치 더 높은 게 핵심 통찰:
- 같은 원본을 참고한 페이지들은 자동으로 의미적 클러스터 형성
- 사용자가 `[[wikilink]]`를 빠뜨려도 source 공유로 연결됨
- 결과: 그래프가 형식적 링크 수보다 **의미적 출처**로 조직화.

### 14.10 "context-aware deep research"
지식 격차를 발견했을 때 `gap title + overview.md + purpose.md`를 LLM에 먹여 도메인 맞춤 검색 쿼리를 만든다. Generic keyword가 아닌 "이 wiki의 purpose 맥락에서 의미 있는" 쿼리.

### 14.11 "Budget 제어는 `60/20/5/15`라는 구체 숫자로"
감이 아닌 비율 상수:
- 60% wiki pages (가장 핵심)
- 20% chat history
- 5% index (navigation aid)
- 15% system prompt
→ LLM max_context가 바뀌어도 자동 비례 조정. **이 숫자를 Jarvis에 그대로 써도 무난**하며, 벤치마크 후 조정 권장.

### 14.12 "Log는 parseable하게"
```
## [YYYY-MM-DD] ingest | Article Title
```
이 한 줄 형식 덕에 `grep "^## \[" log.md | tail -5` 같은 초간단 쿼리가 성립. "plain text도 쿼리할 수 있다"는 Unix 정신.

### 14.13 "Obsidian 호환성을 '끝까지' 지킨다"
Tauri 앱이 자체 포맷을 발명할 수도 있었지만 — wikilinks, frontmatter, `.obsidian/` 설정 디렉터리 자동 생성까지 — 사용자가 언제든 Obsidian으로 같은 폴더를 열 수 있음. **사용자의 데이터 주권** 존중.

### 14.14 "Provider 추상화는 thin하게"
200줄짜리 `llm-providers.ts` 하나로 6개 프로바이더 커버. 추상화 over-engineering 없음. 공통 인터페이스 `{ url, headers, buildBody, parseStream }` 4개 필드만.

### 14.15 "데스크톱 웹뷰 + 로컬 HTTP로 Extension 연결"
Chrome Extension과의 IPC를 native messaging이 아닌 **127.0.0.1:19827 로컬 HTTP**로 해결. Manifest V3의 `host_permissions` 하나면 끝. 보안 경계는 localhost-only binding으로 확보. 단순하고 이식성 높음.

### 14.16 "크로스플랫폼 세심함은 한 곳으로 모은다"
`normalizePath()` 하나가 22개 파일에서 사용. Windows `\` → `/` 변환, Unicode-safe char slicing. 흩어져 있으면 반드시 한 파일에서 새는 버그 생김.

---

## 부록: Jarvis 실행 계획 요약

### 즉시 가능한 고가치 이식 (Phase A — 1~2주)
1. **2-step CoT Ingest** 프롬프트 + 파이프라인 이식 → Jarvis worker에 `ingestDoc(docId)` job
2. **`source_refs text[]`** 컬럼 + GIN 인덱스 추가 → frontmatter만 파싱
3. **SHA256 incremental cache** → `ingest_cache` 테이블
4. **Budget-aware context assembly (60/20/5/15)** → Jarvis chat API
5. **`<!-- cited: -->` 인용 강제** → 응답 파싱

### 중기 (Phase B — 3~4주)
6. **4-신호 relevance + Louvain** → `wiki_graph` 계산 worker
7. **Knowledge gaps + 지식 부채 레이더** (Jarvis Phase 6 계속)
8. **하이브리드 검색 4-phase** (OpenSearch + pgvector + graph + budget)
9. **Review Queue + LLM-generated search queries**
10. **Deep Research** (Tavily or 사내 검색 API + 자동 auto-ingest)

### 장기 (Phase C — 여유 있을 때)
11. **Milkdown 기반 위키 에디터** + wikilink plugin
12. **Graph 시각화** (sigma.js + 클라이언트 전용 dynamic import)
13. **Enrich wikilinks** 자동화 (사용자가 수동 저장한 문서에 링크 보정)
14. **Structural + Semantic Lint**
15. **Chrome Extension Web Clipper** (Jarvis 전용, 인증 토큰 필요)

---

## 참고 문헌/링크
- 원본 Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f (사본이 `llm-wiki.md`로 포함됨)
- nashsu repo: https://github.com/nashsu/llm_wiki (README에 명시)
- 관련 개념: Vannevar Bush의 Memex (1945)
- Adamic-Adar index, Louvain community detection (graphology-communities-louvain 2.0.2)
- Tavily Search API (advanced)
- LanceDB (Rust embedded vector DB)
- Mozilla Readability.js, Turndown.js (Chrome Extension)
- Milkdown (ProseMirror 기반 WYSIWYG)
- Tauri v2

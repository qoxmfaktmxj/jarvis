# 04. MindVault — 실패 경고 케이스 연구

> 분석 일자: 2026-04-15
> 대상 경로: `reference_only/mindvault/` (PyPI `mindvault-ai` v0.5.0, 공식 폐기)
> 문서 성격: **Jarvis 회귀 방지 기준점**
> 이전 버전: `docs/_archive/2026-04-pivot/04-mindvault-rag-era.md` (차용원 관점, 피벗 전 작성)

---

## 1. 요약 (상태 배너)

### 🛑 프로젝트 상태

- **공식 폐기**: 2026-04-14 (제작자 `etinpres` 본인 선언)
- **유지보수**: 중단 — "새로 설치하지 않는 것을 권장"
- **현재 배포**: PyPI에 잔류(제거 가이드 포함), GitHub README 최상단에 폐기 공지

### 🎯 이 문서의 역할

- **Jarvis의 회귀 방지 기준점** — "차용원"이 아니라 **실패 조건의 교사**
- MindVault가 넘어진 3개 구조적 함정을 Jarvis 체크리스트로 내재화
- 제작자의 교훈 3개를 Jarvis 개발 원칙으로 승격

### 이전 버전과의 차이

| 항목 | 구 문서 (2026-04-14 이전) | 본 문서 (2026-04-15) |
|------|--------------------------|----------------------|
| 포지셔닝 | "성공 사례·차용원" | "공식 폐기 사례·경고" |
| 톤 | BM25 토크나이저·canonical ID 등 **기술 디테일 전면 차용 권장** | **"왜 이것이 실패했는지" 해부** |
| 결론 | "즉시 도입 권장 10개 항목" | "가져갈 것 vs 버릴 것" 분리, 핵심은 **버리는 쪽** |
| Jarvis 연결 | 기능 추가 근거 | 피벗 후 Karpathy-first 노선의 방어 근거 |

구 버전은 **`docs/_archive/2026-04-pivot/04-mindvault-rag-era.md` 1,007줄로 아카이브**. 분석 자체는 충실하지만 프레임이 "도입"이었기 때문에 2026-04-15 Karpathy LLM Wiki 피벗 이후 재작성이 불가피했다.

---

## 2. MindVault란 무엇이었나

### 2.1 원래 목표

AI 코딩 도구(Claude Code, Cursor, Copilot 등)는 세션이 끝나면 맥락을 전부 잊어버린다. 새 세션마다 프로젝트 구조·결정사항·함수 관계를 반복 설명해야 하는 **토큰·시간 낭비**를 줄이겠다는 것이 출발점이었다.

제작자는 [Andrej Karpathy의 LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)에서 영감을 받았다고 명시한다. Karpathy의 핵심 주장은 다음과 같다:

- 사용자가 `raw/` 폴더에 아무 자료(문서, 논문, 메모)를 넣으면
- **LLM이 읽고 이해해서** 기존 `wiki/`와 통합/병합하고
- 위키가 점점 풍부해지면서 **AI가 더 영리해지는** 구조

### 2.2 구현 결과

MindVault는 이 개념을 Python 단일 패키지 CLI로 구현했다. 기술 스택은 다음과 같다:

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 파싱 | **tree-sitter AST** (13개 언어 파서) | 코드 구조 추출 |
| 그래프 | **NetworkX DiGraph** + greedy modularity | 관계·커뮤니티 탐지 |
| 검색 | **순수 Python BM25** (Okapi k1=1.5, b=0.75) + CJK 토크나이저 | 키워드 매칭 |
| 저장 | JSON + `.md` 파일 (DB 없음) | 질의당 ~900 토큰 주장 |
| 배포 | PyPI `pip install mindvault-ai` + `mindvault install` 단일 명령 | git post-commit hook, launchd/systemd 데몬, AI 도구 자동 감지 |

Canonical ID 체계(`{rel_path_slug}::{kind}::{local_slug}`, v0.4.0에서 충돌 버그 수정), SHA256 해시 기반 incremental cache, `UserPromptSubmit` 훅을 통한 `<mindvault-context>` 자동 주입 등 **개별 엔지니어링 완성도는 높았다**.

### 2.3 실제 사용 시나리오

- Claude Code 세션에서 `/mindvault` 슬래시 커맨드로 현재 프로젝트 컨텍스트 주입
- Cursor/Copilot/Windsurf 등 10개 AI 도구에 `CLAUDE.md`·`.cursorrules` 등 자동 생성
- Obsidian vault를 `mindvault-out/wiki/`로 열어 그래프 뷰 + 백링크 활용
- `mindvault query "..."` 한 줄로 3-layer(Search → Graph → Wiki) 통합 컨텍스트 반환

기술 시연으로는 깔끔했다. 문제는 **약속한 가치**가 이 구현에서 나오지 않았다는 점이다.

---

## 3. 왜 폐기됐는가 (제작자의 자백)

### 3.1 공식 폐기 선언 (2026-04-14)

MindVault README 최상단 원문 인용:

> "이 프로젝트는 폐기되었습니다 (2026-04-14)"
> "MindVault는 더 이상 유지보수되지 않으며, 새로 설치하지 않는 것을 권장합니다"

### 3.2 근본 사유: Karpathy 개념 오해

제작자 본인 자백:

> "MindVault는 Karpathy LLM Wiki 패턴에서 영감을 받아 만들었습니다. 하지만 개발 과정에서 원래 개념을 잘못 이해한 채 진행했고, 결과적으로 약속한 핵심 가치를 제공하지 못했습니다."

Karpathy 원본과 MindVault 구현의 결정적 차이:

| 단계 | Karpathy 원본 | MindVault 실제 |
|------|---------------|----------------|
| 입력 | raw 자료 (문서·노트·논문) | 코드베이스 + 문서 |
| 처리 | **LLM이 읽고 이해해서 통합/병합** | **tree-sitter AST로 구조만 추출** |
| 결과 | LLM 추론 기반 합성된 설명 | 함수명·import·클래스명의 **구조적 나열** |
| 성장 | 위키가 풍부해지며 AI가 영리해짐 | 노드·엣지 수만 증가, 의미 합성 없음 |

제작자 자신의 표현:

> "LLM 대신 tree-sitter AST로 코드 구조만 추출 (LLM 불필요를 장점으로 내세움)"
> "Karpathy 패턴의 핵심인 'LLM이 이해하고 합성'이 빠져 있었음"

### 3.3 "LLM 불필요" 함정

MindVault는 `LLM 불필요`를 **셀링 포인트**로 내세웠다. "토큰 0으로 위키 생성"이라는 README 문구가 대표적이다. 제작자의 회고:

> "'LLM 불필요'를 셀링 포인트로 만들었지만, LLM이 빠지면서 핵심 가치가 사라졌습니다."

tree-sitter는 구조(structure)를 뽑고, LLM은 의미(semantics)를 뽑는다. **Karpathy의 약속은 의미 합성이지 구조 추출이 아니었다.** "LLM 불필요"를 마케팅하는 순간 구현이 그쪽으로 휘었고, 남은 것은 **LLM 없이 작동하는 정교한 그래프 생성기**였다. 그래프는 만들어졌지만, 그래프가 곧 지식은 아니었다.

---

## 4. 약속 vs 현실 — 3가지

README 원문의 표:

| 약속 | 현실 |
|------|------|
| **토큰 절약** (질의당 ~900 토큰) | 관련 없는 컨텍스트를 매 프롬프트마다 주입 → 절감이 아니라 낭비 |
| **세션 연속성** | 직전 세션의 논의를 이어받지 못함 (BM25 검색 품질 한계) |
| **정확한 컨텍스트 자동 주입** | "마인드볼트 개선"을 질문하면 유튜브 파이프라인 문서가 1등으로 올라옴 |

각각 분석한다.

### 4.1 토큰 절약 역설

README의 벤치마크 표는 "대규모 500파일 시 333배 절감(300,000 → 900)"을 주장했다. 계산 자체는 옳다. 문제는 **무엇을 절약했는가**이다.

- 원본 직접 읽기: 6회 tool call × 평균 10k 토큰 = 필요 파일만 읽음
- MindVault ON: 모든 사용자 프롬프트에 `<mindvault-context>` 5,000 토큰을 **강제 주입** (`UserPromptSubmit` 훅)

결과: **질문과 무관한 맥락을 매번 주입**. 진짜 필요한 지점에 토큰이 할당되지 않고, "그럴듯해 보이는" 컨텍스트가 비용만 늘렸다. 절감이 아니라 **무작위 과잉 공급**.

### 4.2 세션 연속성의 부재

BM25는 **키워드 매칭**이다. 전 세션에서 논의된 개념이 현재 질문과 **동일 단어**를 공유하지 않으면 검색되지 않는다. LLM 합성이 없으므로 "X는 Y의 맥락에서 다뤘던 것"이라는 **관계적 기억**이 위키 페이지에 축적되지 않는다.

→ 세션은 끊긴다. MindVault는 "단어장"이었지 "메모리"가 아니었다.

### 4.3 한국어 동의어 매칭 실패

가장 치명적 증상. "마인드볼트 개선"이라고 묻자 영문 `MindVault` 문서가 아니라 무관한 유튜브 파이프라인 문서가 top-1로 올라왔다. 이유:

- BM25 토크나이저는 `"마인드볼트"` ≠ `"MindVault"`를 다른 토큰으로 취급
- 임베딩이 없으므로 의미 기반 매칭 없음
- alias/synonym 레이어 없음

제작자의 표현:

> "BM25 키워드 매칭으로는 사용자의 의도를 이해할 수 없음 (한글 '마인드볼트' ≠ 영문 'MindVault')"
> "토큰 절약 + 세션 연속성은 Anthropic도 완전히 해결하지 못한 문제 — 1인 개발자의 Python 패키지로 풀 수 있는 규모가 아니었음"

---

## 5. MindVault와 Jarvis의 공통 위험 조건

MindVault가 넘어진 조건 중 **Jarvis에도 그대로 존재하는 것들**이 있다. 이 공통분모 때문에 본 문서가 "먼 나라 실패담"이 아니라 회귀 방지 기준점이다.

### 5.1 한국어 환경 (동의어 매칭 난이도)

Jarvis는 한국어 사내 위키다. MindVault가 "마인드볼트 ≠ MindVault"로 넘어졌다면 Jarvis는:

- "인사규정" ≠ "HR 정책" ≠ "인사 가이드라인"
- "연차" ≠ "유급휴가" ≠ "Annual Leave"
- "결재선" ≠ "승인 워크플로" ≠ "Approval flow"

이것들이 **같은 개념**임을 검색 엔진이 알아야 한다. pg_trgm만으로는 불충분하다.

### 5.2 엔터프라이즈 규모 (5000명)

MindVault는 1인 홈디렉토리 설계였다(`~/.mindvault/`, `~/.claude/hooks/`). Jarvis는 5000명 멀티테넌트다. 규모가 커질수록 **검색 품질의 작은 결함이 광범위한 정책 준수 실패**로 번진다. "top-5에 관련없는 페이지가 섞이는" 문제가 1인에게는 불편함이지만, 5000명에게는 **오답 합법화**가 된다.

### 5.3 팀 운영 vs 1인 개발자

MindVault 실패의 한 축은 "1인 개발자가 Anthropic급 문제(장기 메모리)를 PyPI 패키지로 풀려 함"이었다. Jarvis는 조직 자본(CLAUDE.md 하네스, planner/builder/integrator 3인 에이전트, 사내 콘텐츠·감사 인프라)을 활용할 수 있다.

**주의:** 이 조직 자본이 "MindVault와 달리 우리는 괜찮다"의 **자동 근거**는 아니다. 같은 함정(LLM 합성 없음, 동의어 실패, 컨텍스트 과잉주입)에 빠질 수 있다. 자본은 실수를 늦게 발견할 뿐, 안 하게 해주지는 않는다.

---

## 6. Jarvis 피벗 전 진단 (과거 위험)

2026-04-15 Karpathy-first 피벗 **전**의 Jarvis 코드에는 MindVault형 위험이 실제로 존재했다. 피벗의 필요성을 보여주는 근거이자, 앞으로 경계할 패턴이다.

### 6.1 `packages/ai/ask.ts` 6-레인 라우터

- 한국어 키워드 매칭만으로 질문을 6개 레인(FAQ/판례/위키/코드/공지/일반) 중 하나로 분류
- **의도 이해 없음** — "마인드볼트 = MindVault"와 같은 매칭 실패 재연 위험
- 라우팅 오답 → 잘못된 레인 → 잘못된 컨텍스트 → MindVault가 겪은 "유튜브 파이프라인이 1등으로 올라옴" 현상과 동형

### 6.2 `apps/worker/src/jobs/embed.ts` 청크 임베딩

- 문서를 청크로 자르고 임베딩만 적재
- **LLM 합성 없음** — tree-sitter가 AST 노드를 뽑는 것과 구조적으로 동일한 함정
- 청크 하나하나는 정확해도 "페이지 단위 의미 합성"이 없음 → MindVault의 "구조 나열" 재연

### 6.3 `ingest.ts` Step 2의 draft 1장 생성

- 하나의 원본 소스를 받으면 draft 페이지 **1장만** 생성
- Karpathy 원본은 "1 소스 → 관련 페이지 10~15개 교차 업데이트"
- 이 차이가 MindVault와 Karpathy의 결정적 분기점이었음

### 6.4 피벗 이후 방향

위 3개는 **Phase-W1~W3**에서 각각 다음으로 대체되는 것이 정본(WIKI-AGENTS.md §3, §10):

- `ask.ts` → `FEATURE_PAGE_FIRST_QUERY` 분기로 page-first navigation
- `embed.ts` → 삭제 또는 `FEATURE_RAW_CHUNK_QUERY=false`로 비활성화
- `ingest.ts` → Two-Step CoT (Analysis LLM → Generation LLM), multi-page 동시 업데이트

---

## 7. 회귀 방지 체크리스트 (Jarvis용)

`WIKI-AGENTS.md` §11의 8개 항목을 MindVault 실패와 명시적으로 연결해 확장한다. **각 PR·각 페이즈·각 ingest 배포에서 체크 가능한 형태**로 쓴다.

### 7.1 LLM 합성 단계 존재

- **MindVault 실패:** tree-sitter AST 추출 + NetworkX 커뮤니티 탐지로 끝. LLM 합성 단계 없음. 그래프는 정교했지만 의미가 없었음.
- **Jarvis 검증 기준:**
  - `apps/worker/src/jobs/ingest.ts`에서 Two-Step CoT(Analysis → Generation) 실행 여부
  - `packages/wiki-agent/prompts/` 존재 확인
  - Analysis LLM 없이 페이지를 생성·갱신하는 경로가 있으면 차단

### 7.2 한 번의 ingest가 다수 페이지 업데이트

- **MindVault 실패:** `mindvault ingest` 1회당 커뮤니티당 1개 페이지 생성. 기존 페이지 교차 갱신은 없음. 지식이 "층층이 쌓이는" 게 아니라 **독립된 섬들**이 늘어남.
- **Jarvis 검증 기준:**
  - Analysis LLM의 JSON 반환에 `updatePages: []`가 실제 비어있지 않은 비율 측정
  - "1개 소스 → 10~15개 관련 페이지 동시 수정" 로그 확인
  - commit message에 `N pages updated`에서 N=1이 지속되면 알람

### 7.3 한국어 동의어 매칭

- **MindVault 실패:** BM25 토크나이저가 "마인드볼트" ≠ "MindVault"를 다른 토큰으로. alias·synonym 레이어 부재.
- **Jarvis 검증 기준:**
  - frontmatter `aliases: []` 실제 채워지는지 ingest 로그로 확인
  - pg_trgm similarity 쿼리가 shortlist에 들어가는지 `ask.ts` 경로 검토
  - 페이지 500+ 도달 시 qmd-MCP 도입 체크포인트
  - 한국어 검색 QA 세트: "인사규정/HR 정책/인사 가이드라인"이 같은 페이지로 수렴하는지 주간 eval

### 7.4 교차 참조 자동 유지

- **MindVault 실패:** wiki 페이지 간 `[[wikilink]]`는 존재했지만, 재생성 시 기존 링크가 깨지거나 일관성이 흔들림. lint가 구조만 보고 의미 상 관련 페이지 제안 없음.
- **Jarvis 검증 기준:**
  - Step B (Generation LLM)에서 `[[wikilink]]` 자동 삽입·검증
  - `wiki-lint` 크론에서 broken link·orphan·missing cross-ref 탐지
  - PR 단계에서 링크 그래프 delta 보고

### 7.5 모순 플래그

- **MindVault 실패:** `lint.py`에 로컬 LLM 모순 판정이 있었지만 **옵트인**. 대부분 사용자는 돌리지 않음. 결과적으로 같은 개념의 상충 설명이 여러 페이지에 방치.
- **Jarvis 검증 기준:**
  - `wiki-lint` 주간 크론 **디폴트 ON**
  - contradictions 탐지 시 `review_queue(type='lint')`로 자동 적재
  - 승인 전까지 `published=false` 강제

### 7.6 페이지 1급 시민 (청크 아님)

- **MindVault 실패:** 답변 합성은 wiki 페이지 기반이었지만 내부적으로 BM25가 **토큰 단위 매칭**이라 "페이지가 1등 시민"이 아니라 "키워드가 1등 시민"이었음.
- **Jarvis 검증 기준:**
  - `ask.ts` page-first navigation 경로: shortlist는 **페이지** 단위
  - `document_chunks` 읽기 경로가 `FEATURE_RAW_CHUNK_QUERY=false`로 비활성화
  - LLM 답변 인용이 `[[page-slug]]` 형식인지 검증

### 7.7 auto/manual 분리

- **MindVault 실패:** 위키 재생성이 사용자 수동 편집을 종종 덮어씀. `<!-- user-notes -->` 마커로 부분적 보존만 제공. LLM과 사람이 같은 파일을 섞어 편집.
- **Jarvis 검증 기준:**
  - `wiki/{workspaceId}/auto/**` vs `wiki/{workspaceId}/manual/**` 디렉토리 분리
  - LLM ingest 경로가 `manual/`에 **쓰기 불가** (권한 수준)
  - manual 변경 시 관련 auto 페이지 `stale=true` 마킹

### 7.8 컨텍스트 품질 측정

- **MindVault 실패:** "질의당 ~900 토큰" 같은 **소비량**만 측정. top-5 결과의 관련성 측정 없음. 결과적으로 "마인드볼트"→유튜브 문서 같은 오답이 장기간 방치.
- **Jarvis 검증 기준:**
  - 주간 eval fixture: 질의당 top-5 정답률 목표(예: ≥ 0.8)
  - "답변에 관련없는 페이지가 top-5에 오면 알람" 경보 훅
  - KPI를 **페이지 수 증가율**이 아니라 **검색 정답률 + 인용 정확도**로 설정

---

## 8. 무엇을 가져가고 무엇을 버릴 것인가

### 8.1 버릴 것 (MindVault 서사의 핵심)

- **"Canonical ID + BM25 + Graph = 완전 통합" 서사** — 이 조합만으론 지식 합성이 안 된다. Jarvis도 같은 3요소가 있지만, **그것만으로 위키가 작동한다고 믿으면 MindVault화**.
- **Python 단일 DX** — 1인 홈디렉토리 철학. 5000명 멀티테넌트에 부적합. Jarvis는 Next.js + pg-boss + Drizzle 노선.
- **"설정 제로" / "LLM 불필요" 마케팅 언어** — 이 문구가 구현 방향을 왜곡시킨다. Jarvis는 반대로 **"LLM 합성이 중심"**을 명시적 선언.
- **auto-context 훅의 강제 주입** — 모든 프롬프트에 5,000 토큰을 무조건 주입하는 방식. Jarvis에서는 query 단계에서 사용자 권한·sensitivity를 체크하고, 페이지 단위로 선택 주입.

### 8.2 선택적 참고 (함정 피해 제한 차용)

- **BM25 한국어/CJK 토크나이저 설계**(`reference_only/mindvault/src/mindvault/index.py:13-40`) — 1자 이상 토큰 유지, Hangul·CJK 유니코드 범위 직접 체크. qmd-MCP 도입 시 토크나이저 설계 레퍼런스로 제한 사용.
- **git post-commit hook 자동 설치 UX**(`hooks.py`) — 사내 개발자 온보딩 가이드 "도우미 스크립트"로만. 위키 코어 메커니즘에 쓰지 말 것.
- **SHA256 해시 기반 incremental cache** — `cache.py` 접근법. Jarvis의 LLM 호출 캐시(30일 TTL, 일일 예산)에 이미 포함되어 있으므로 별도 차용 없이 확인만.

### 8.3 완전히 대체

- **지식 합성 부재 → llm_wiki의 Two-Step CoT로 대체**
  - Analysis LLM: 관련 페이지 후보 선정 + JSON 반환(newPages/updatePages/contradictions)
  - Generation LLM: mdxContent 완성 + `[[wikilink]]` 삽입 + frontmatter
  - MindVault의 `extract_semantic()`·`ingest._llm_extract()` 호출과 근본적으로 다른 **다중 페이지 교차 갱신**

---

## 9. 교훈 3개 (Jarvis 원칙 승격)

제작자가 README에 남긴 교훈 3개를 Jarvis 개발 원칙으로 내재화한다.

### 9.1 "남의 개념을 차용할 때는 원본을 정확히 이해해야 한다"

- **MindVault 사례:** Karpathy gist를 2차 해석(블로그·트위터 요약)에 의존 → "LLM이 핵심"이라는 뼈대를 놓침
- **Jarvis 원칙:**
  - `WIKI-AGENTS.md` §0에 Karpathy gist 원문 링크 직접 삽입
  - 2차 해석 금지. 피벗 의사결정 전 원문 재확인을 필수 단계로
  - `docs/analysis/99-integration-plan-v4.md`와 `WIKI-AGENTS.md`의 일관성을 월 1회 크로스체크

### 9.2 "기술적으로 작동하는 것과 약속한 가치를 제공하는 것은 다르다"

- **MindVault 사례:** tree-sitter AST 추출은 정확히 작동했음. 그러나 약속(세션 연속성·정확한 컨텍스트)은 제공 안 됨
- **Jarvis 원칙:**
  - KPI를 **페이지 수 증가율**이 아니라 **페이지 품질·인용 정확도**로 설정
  - "동작 확인"과 "가치 전달" 지표 분리. 각 릴리스에서 두 종류 모두 리포트
  - eval fixture는 "빌드 성공" 외에 "사용자 질의에 정답이 top-3 안에 드는가"를 포함

### 9.3 "'LLM 불필요' 함정"

- **MindVault 사례:** "LLM 없이도 작동"을 마케팅 포인트로 만든 순간 구현이 그 방향으로 휨. 최종적으로 LLM 합성이 빠진 껍데기
- **Jarvis 원칙:**
  - ingest·lint·query **모든 핵심 경로에 LLM 합성 배치**
  - "LLM 호출 최소화"는 **비용 최적화 방법**이지 **아키텍처 원칙이 아님**
  - Feature flag로 LLM 합성 경로를 끄는 옵션을 만들지 말 것 (비용 초과 시 큐 지연으로 대응, 끄지 않음)
  - `LLM_DAILY_BUDGET_USD`·`LLM_CACHE_TTL_SECONDS`는 존재하지만 경로 자체는 항상 ON

---

## 10. 참고 자료

| 경로 | 역할 |
|------|------|
| `reference_only/mindvault/README.md` *(로컬 전용: `C:\Users\kms\Desktop\dev\reference_only\mindvault\`. git 추적 안 됨)* | 공식 폐기 선언 + 사유 + 교훈 (본 문서의 1차 인용원) |
| `reference_only/mindvault/src/mindvault/` *(로컬 전용)* | 실제 구현 코드 (함정 디테일 확인용) |
| `docs/_archive/2026-04-pivot/04-mindvault-rag-era.md` | 구 차용원 분석 (1,007줄, 아카이브, 2026-04-14 이전 프레임) |
| `WIKI-AGENTS.md` §11 | Jarvis 회귀 방지 체크리스트 정본 |
| `WIKI-AGENTS.md` §3.1 | Ingest Two-Step CoT 설계 (MindVault 실패에 대한 직접적 대응) |
| `docs/analysis/02-llm_wiki.md` | Karpathy-first 구현체 분석 (Tauri) |
| `docs/analysis/03-llm-wiki-agent.md` | Claude Code 스킬 포팅 소스 |
| `docs/analysis/99-integration-plan-v4.md` | Karpathy-first 실행 계획 (이 문서의 체크리스트를 페이즈별 작업으로 변환) |
| [Andrej Karpathy LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | 북극성 문서. 2차 해석 금지 |

---

## 11. 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-14 이전 | (구 버전) 차용원 분석 1,007줄 | RAG 시대 프레임, MindVault를 통합 모델로 도입 권장 |
| 2026-04-14 | MindVault 제작자 공식 폐기 선언 | 외부 사건 |
| 2026-04-15 | **본 문서로 전면 재작성**. 구 버전은 `docs/_archive/2026-04-pivot/04-mindvault-rag-era.md`로 이동 | Karpathy-first 피벗 이후 "차용원"에서 "실패 경고 케이스"로 프레임 전환. Jarvis 회귀 방지 기준점으로 재정의 |

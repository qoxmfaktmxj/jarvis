# Eval Fixtures

Jarvis 사내 업무 시스템 + 사내 위키의 품질 측정용 평가 픽스처를 모아둔 디렉터리. Phase-W2(page-first retrieval) 및 Phase-W3(multi-page ingest) KPI 측정에 사용된다.

## 디렉터리 구조

```
apps/worker/eval/fixtures/
└── YYYY-MM/
    ├── eval-NNN.md            # 기존 단일 QA 픽스처 (gray-matter frontmatter)
    ├── page-first-qa.jsonl    # Phase-W2 KPI: page-first 검색 정확도
    └── multi-page-ingest.jsonl # Phase-W3 KPI: 멀티페이지 ingest 분류 정확도
```

신규 측정 주기마다 `YYYY-MM/` 폴더를 새로 만들고, 동일한 파일명 규칙을 따른다. 기존 폴더의 픽스처는 수정하지 않으며 회귀 비교용으로 보존한다.

## 스키마

### `page-first-qa.jsonl`

한 줄당 JSON 객체 하나(JSONL).

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | `qa-NNN` 형식, 파일 내 유일 |
| `query` | string | 사용자 질의 (한국어) |
| `expectedPages` | string[] | 답변에 등장해야 할 위키 페이지 경로 (정답 후보) |
| `answerPatterns` | string[] | 답변 본문에 포함되어야 할 핵심 키워드 1~3개 |
| `sensitivityRequired` | `"public"` \| `"internal"` \| `"confidential"` | 해당 질의 결과에 요구되는 최소 민감도 레벨 |

### `multi-page-ingest.jsonl`

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | `ingest-NNN` 형식 |
| `rawSource` | string | 원본 문서(공지/메모/이메일 등) 본문, 한국어 100~300자 |
| `expectedPageUpdatesMin` | number | 기대 페이지 업데이트 최소 건수 |
| `expectedNewPagesMax` | number | 기대 신규 페이지 최대 건수 (상한) |
| `topic` | string | 문서의 핵심 주제 (human-readable) |

## 작성 원칙

### 1. curator ≠ reviewer

- 픽스처를 **작성하는 사람**과 결과를 **채점/검증하는 사람**은 반드시 분리한다.
- 동일인이 작성+채점 시 confirmation bias가 발생하여 KPI가 과대평가된다.
- 최소 2인 이상 리뷰를 권장하며, PR 머지 전 리뷰어는 "자기가 쓴 픽스처"를 제외하고 승인한다.

### 2. 한국어 사내 도메인 기반

- 모든 질의/문서는 실제 한국 회사의 사내 업무 맥락을 반영한다.
- 인사(HR), IT/보안, 업무 프로세스, 조직, 법무/계약 등 실제 사용 빈도가 높은 카테고리를 균형 있게 포함.
- 영문 고유명사(예: VPN, NDA, OTP)는 그대로 사용하되, 설명은 한국어로 작성.

### 3. 민감도(sensitivity) 매핑

`page-first-qa.jsonl`의 `sensitivityRequired`는 위키 페이지의 sensitivity 필드와 정렬되어야 한다.

- `public`: 공개 가능한 일반 HR/복리후생/프로세스 정보
- `internal`: IT/보안 관련 내부 정보 (VPN, 보안 정책, 네트워크 구성)
- `confidential`: 법무/계약/IP/영업비밀 관련 정보

RBAC + sensitivity 두 축을 모두 검증하는 것이 목적이므로 분포가 치우치지 않도록 한다. 현재 분포: public 20, internal 5, confidential 5 (총 30).

### 4. 파일 네이밍 규칙

- 측정 주기 폴더: `YYYY-MM/` (UTC 기준, 월 단위)
- 단일 QA: `eval-NNN.md` (3자리 zero-pad, 1-indexed)
- page-first KPI: `page-first-qa.jsonl` (고정명)
- multi-page ingest KPI: `multi-page-ingest.jsonl` (고정명)
- 파일명 변경 시 `apps/worker/eval/run.ts`의 경로 상수를 동시 업데이트.

## 추가 방법

새 측정 주기를 시작할 때:

1. `apps/worker/eval/fixtures/YYYY-MM/` 폴더 생성
2. 직전 월 픽스처를 복사 후, curator가 20~30% 이상 새 케이스로 교체 (단순 복붙 금지)
3. `pnpm --filter @jarvis/worker test:eval` 로 로더 검증
4. PR 생성 시 curator/reviewer를 명시하고 리뷰어는 작성자와 달라야 함
5. KPI 측정 결과는 `docs/kpi/YYYY-MM-eval-report.md`에 기록

개별 픽스처 추가 시:

1. 동일 JSONL 파일에 append (한 줄 = 한 JSON 객체)
2. `id`는 기존 최대값 +1 (중복 방지)
3. `expectedPages`는 실제 위키 경로 규약(`카테고리/서브/페이지.md`)을 따른다
4. `answerPatterns`는 3개 이하로 간결하게 — 너무 많으면 noise 증가

## 관련 파일

- `apps/worker/eval/loader.ts` — `.md` 픽스처 로더 (gray-matter 기반)
- `apps/worker/eval/run.ts` — 측정 실행기
- `apps/worker/eval/loader.test.ts`, `run.test.ts` — 로더/실행기 단위 테스트
- `docs/guidebook/` — KPI 리포트 템플릿 (있는 경우)

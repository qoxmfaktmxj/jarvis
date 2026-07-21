# Jarvis

Jarvis는 법령, 행정해석, 세무 자료를 바탕으로 HR 질문에 근거와 함께 답하는 지식 플랫폼입니다. 참고한 문서와 조항을 답변에 연결하고, 원문 변경이 Wiki와 검색 색인에 반영되는 과정까지 관리합니다.

기본 실행 환경은 합성 HR 자료와 결정론적 mock provider를 사용합니다. 회사 문서나 실제 개인정보는 포함하지 않습니다.

> Jarvis의 답변은 자료 검토를 돕기 위한 참고 정보이며 법률·세무 자문을 대신하지 않습니다. 실제 업무 판단 전에는 최신 원문과 전문가 의견을 확인해야 합니다.

## 주요 기능

- 답변 문장과 Wiki 페이지를 연결하는 출처 인용
- Git 이력으로 관리되는 Markdown Wiki와 변경 검토 대기열
- 원문 수집, 정규화, Wiki 반영을 분리한 worker pipeline
- Wiki 제목·요약과 원문 메타데이터를 찾는 PostgreSQL 전문 검색
- `ADMIN`, `EDITOR`, `READER` 역할 기반 접근 제어
- 사용자, 메뉴, 공통 코드, 원문, Wiki 검토, 감사 기록 관리 화면
- 외부 API 없이 반복 실행할 수 있는 로컬 mock 모드

## 동작 구조

```text
합성 원문 → MinIO 보관 → Worker 분석·검토 → Git Wiki → PostgreSQL projection → 검색·Ask AI
```

| 구성 요소 | 역할 |
| --- | --- |
| `apps/web` | Next.js 기반 웹, 검색, Ask AI, 운영 화면 |
| `apps/worker` | 원문 ingest, Wiki 생성, projection, 검토 작업 |
| `packages/wiki-fs` | Wiki 파일 읽기·쓰기와 runtime Git 제어 |
| `packages/wiki-agent` | LLM prompt와 응답 parser. 파일이나 DB 상태는 직접 다루지 않음 |
| PostgreSQL | 인증, 권한, 메타데이터, 검색용 projection |
| MinIO | 수집한 원문의 불변 사본 |
| runtime Git | Wiki Markdown 본문의 단일 기준 저장소 |

Wiki 본문은 DB에 중복 저장하지 않습니다. PostgreSQL에는 검색과 연결에 필요한 index, link, source reference만 projection합니다.

## 로컬 실행

### 준비 사항

- Node.js 22 이상
- pnpm 10.33.0
- Docker Desktop

### 시작

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

`pnpm setup:local`은 PostgreSQL 16과 MinIO를 시작하고 migration, seed, 합성 자료 ingest, Wiki projection을 순서대로 실행합니다. 처음 실행할 때만 임의로 생성한 로컬 비밀값을 `.env.local`에 기록합니다.

웹은 `http://localhost:3010`에서 열립니다. 로그인 화면의 **데모로 시작** 버튼을 누르면 `READER` 권한으로 둘러볼 수 있습니다.

실제 관리자 계정이 필요하면 `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`를 현재 셸의 환경변수로 지정한 뒤 아래 명령을 한 번 실행합니다.

```bash
pnpm admin:bootstrap
```

관리자 bootstrap 값은 `.env.local`에 저장하지 않습니다.

## 자주 쓰는 명령

```bash
pnpm data:sync          # 합성 원문을 다시 반영하고 Wiki projection 갱신
pnpm worker:eval        # page-first 답변과 인용 평가
pnpm type-check
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm security:scan
```

로컬 Wiki를 처음부터 다시 만들 때는 [운영 가이드](docs/operations.md)의 reset 절차를 따릅니다. 기존 runtime Wiki를 자동으로 덮어쓰지 않도록 초기화 명령은 빈 대상만 허용합니다.

## 데이터와 공개 범위

- `samples/**`의 자료는 모두 이 저장소를 위해 작성한 합성 예시입니다.
- 예시 이메일과 URL은 예약 도메인 `example.invalid`만 사용합니다.
- `.env.local`, `.runtime/**`, build 결과와 보안 검사 산출물은 Git에서 제외됩니다.
- 외부 원문 provider는 코드에 등록된 HTTPS host와 path만 호출할 수 있습니다.
- 공개 저장소의 검사 기준과 결과는 [보안 감사 문서](docs/security-audit.md)에 기록합니다.

설계 배경은 [아키텍처](docs/architecture.md), 데이터 정책은 [데이터 소스](docs/data-sources.md), 기여 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)에서 확인할 수 있습니다.

## License

[MIT](LICENSE)

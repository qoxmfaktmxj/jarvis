# Architecture

- 웹 앱과 worker는 동일한 PostgreSQL 16 / MinIO 로컬 stack을 사용합니다.
- Wiki 본문은 `.runtime/wiki-repo`에 safe bootstrap 후 worker projection으로만 Git 상태를 만듭니다. Auto fixture의 revision placeholder는 바로 앞 synthetic ingest가 반환한 로컬 UUID로 bootstrap 시 치환됩니다.
- `infra/compose.yaml`은 loopback 포트만 사용합니다.
- `pnpm setup:local` 순서는 `compose up --wait -> db:migrate -> db:seed -> samples:ingest -> wiki:bootstrap -> wiki:project` 입니다.

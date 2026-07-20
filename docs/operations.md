# Operations

## 로컬 초기화

```bash
pnpm setup:local
```

- `.env.local`이 없을 때만 생성합니다.
- `pnpm admin:bootstrap`은 별도 수동 명령이며 process env로만 admin 계정을 만듭니다.

## 데이터 새로고침

```bash
pnpm data:sync
```

- Docker volume이나 `.env.local`을 다시 만들지 않습니다.
- synthetic source ingest와 wiki projection만 다시 실행합니다.

## Wiki runtime reset

- `.runtime/wiki-repo`를 비운 뒤 `pnpm wiki:bootstrap`과 `pnpm wiki:project`를 순서대로 실행합니다.
- `wiki:bootstrap`은 Git을 만들지 않습니다.

# Jarvis Public Staging

공개 후보용 clean-room 스테이징 저장소입니다. 로컬 기본 경로는 합성 HR 샘플과 mock LLM만 사용합니다.

## 로컬 시작

```bash
pnpm setup:local
pnpm samples:ingest
pnpm data:sync
pnpm wiki:bootstrap
pnpm wiki:project
```

- `pnpm setup:local`은 `.env.local`이 없을 때만 한 번 생성합니다.
- `.env.local`에는 랜덤 로컬 전용 secret만 기록하며 `LLM_MODE=mock`을 강제합니다.
- `pnpm admin:bootstrap`은 수동 1회성 절차입니다. `BOOTSTRAP_ADMIN_*` 값은 `.env.local`에 저장하지 않습니다.
- 샘플 데이터는 전부 합성 자료이며 `example.invalid`만 사용합니다.
- 실제 운영 데이터는 나중에 공식 provider 동기화 경로로만 연결합니다.

## 공개 경계

- `samples/**`, `docs/**`, `config/**`는 공개 후보용 synthetic 자료만 허용합니다.
- `.runtime/**`와 `artifacts/**`는 로컬 생성물이며 Git에서 제외됩니다.
- `pnpm export:candidate --target <dir>`만 공개 후보 export 입력으로 사용합니다.

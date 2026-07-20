# Contributing

이 저장소는 public carve-out 후보만 다룹니다. 다음 규칙을 지키세요.

## 합성 샘플 추가

1. `samples/sources/`에 합성 원문 파일을 추가합니다.
2. `samples/sources/manifest.json`에는 안전한 상대경로만 추가합니다.
3. `samples/wiki/`에 대응하는 synthetic wiki 페이지를 같이 추가합니다.
4. `apps/worker/eval/fixtures/public-demo/`가 새 샘플을 반영하도록 갱신합니다.
5. `config/public-export-allowlist.json` 또는 `config/public-scan-allowlist.json` 변경은 서면 사유를 남깁니다.

## 금지

- 실제 회사 문서, historical corpora, 내부 메일/호스트/식별자 복사 금지
- symlink 기반 샘플 등록 금지
- `.runtime`, `artifacts`, `.env.local` 추적 금지

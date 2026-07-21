# Security Policy

이 저장소는 공개 소스만 포함합니다.

- 비밀값은 `.env.local` 로컬 생성물로만 관리합니다.
- synthetic 데이터만 허용합니다.
- 보안 예외는 `forbidden-term`에만 허용하며 `config/public-scan-allowlist.json`에 exact rule id, path, matched value, reason을 명시해야 합니다. 자격증명·개인정보·private network·binary 탐지는 예외 처리할 수 없습니다.
- 취약점은 공개 issue 대신 [GitHub Security Advisories](https://github.com/qoxmfaktmxj/jarvis/security/advisories/new)로 비공개 제보해 주세요.

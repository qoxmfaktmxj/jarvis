# Governance

- synthetic provenance만 허용합니다.
- `example.invalid`가 아닌 이메일/호스트는 금지입니다.
- `config/public-export-allowlist.json`은 export 단일 SoT입니다.
- `config/public-scan-allowlist.json`은 `forbidden-term`만 예외로 허용하며 exact rule id, exact path, exact matched value, written reason이 필요합니다. 자격증명·개인정보·private network·binary 탐지는 예외 처리할 수 없습니다.
- CI action SHA pin은 변경 시 검토자를 거쳐 교체합니다.
- eval fixture는 synthetic provenance와 deterministic mock compatibility를 유지해야 합니다.

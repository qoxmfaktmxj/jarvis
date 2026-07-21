# CLI Proxy 구독 게이트웨이

Jarvis의 실제 LLM 호출은 모두 이 OpenAI-compatible 로컬 endpoint를 사용한다. upstream 인증은 Codex 구독 OAuth만 사용하며 direct API key, mock fallback, 다른 provider 우회, 재시도는 없다. 프록시 장애나 구독 한도 소진 시 해당 작업은 그대로 실패한다.

최초 인증과 운영 배포 절차는 [`docs/deployment-openclaw.md`](../../docs/deployment-openclaw.md)를 따른다. `auths/`, `logs/`, `certs/`, `config.local.yaml`은 Git에 포함되지 않는다.

# 2026-04-19 — CLIProxyAPI 통합 follow-up TODO

`feat(ai): add CLIProxyAPI subscription gateway` (commit `3ab5f03`) 이후 남은 작업.
연동 가이드 본체는 [`2026-04-19-Jarvis_openai연동가이드.md`](2026-04-19-Jarvis_openai연동가이드.md) — 후속 검토 후 삭제 예정.

---

## P0 — 게이트웨이 실제 활성화 절차 (수동 1회)

- [ ] CLIProxyAPI 컨테이너 직접 띄워서 Codex OAuth 1개(Pro) + Plus 1개 + (선택) Claude OAuth 로그인
  ```bash
  docker run --rm -it -p 1455:1455 \
    -v $PWD/infra/cliproxy/config.yaml:/CLIProxyAPI/config.yaml \
    -v $PWD/infra/cliproxy/auths:/root/.cli-proxy-api \
    eceasy/cli-proxy-api:v6.9.29 \
    /CLIProxyAPI/CLIProxyAPI --codex-login
  ```
  → `infra/cliproxy/auths/codex-<uuid>.json` 생성 확인
- [ ] `--profile gateway`로 상시 기동 후 curl 3종 스모크
  - 비스트리밍 / 스트리밍 / strict `json_schema` 각각 200
  - Claude 모델은 `/v1/chat/completions` 경로만 사용 (#736)
- [ ] `.env`에 `FEATURE_SUBSCRIPTION_QUERY=true`만 먼저 켜고 `localhost:3010` Ask AI 1건 스트리밍 확인
- [ ] `FEATURE_SUBSCRIPTION_LINT=true` 추가 (worker 재시작 후 contradiction lint 1건)
- [ ] `FEATURE_SUBSCRIPTION_INGEST`는 **계속 false** — ToS automated/programmatic 회색지대

## P1 — 운영 배포 자료 (월요일 서버 도착 전)

- [ ] `scripts/deploy-cliproxy.sh` — `git pull && sops decrypt && docker compose up -d`
- [ ] `scripts/rollback-cliproxy.sh` — `.env`에서 FEATURE_SUBSCRIPTION_* false → web/worker 재기동 (1분)
- [ ] `infra/cliproxy/auths/`를 sops + age로 암호화한 `auths.tgz.enc` 커밋 + `.age.pub` 커밋
- [ ] `infra/cliproxy/.age.key`는 1Password vault에 보관, `SOPS_AGE_KEY_FILE` 운영 머신 배치

## P1 — 테스트 보강

- [ ] `packages/ai/__tests__/provider.test.ts`
  - 기본값(flag off) → via='direct'
  - `FEATURE_SUBSCRIPTION_QUERY=true` → via='gateway'
  - `op='graph'` → 항상 direct
  - `forceDirect=true` → 항상 direct
- [ ] `packages/ai/__tests__/breaker.test.ts`
  - gateway 3회 연속 실패 → 30초 동안 direct 라우팅
  - cooldown 후 첫 성공 → 회로 복구
  - direct 호출이 throw → 그대로 throw (gateway만 fallback)

## P2 — 관측성

- [ ] `breaker.ts`에 hook 추가 → `jarvis_llm_circuit_events_total{op,event}` 메트릭
- [ ] `logLlmCall` payload에 `via: 'gateway' | 'direct'` 컬럼 추가 (`llm_call_log` 스키마 확장)
- [ ] Grafana alert: `circuit_events{event="open"} > 0 for 5m` → PagerDuty
- [ ] Slack webhook: `router-for-me/CLIProxyAPI` releases RSS 구독 (rolling release 모니터링)

## P2 — 문서 업데이트

- [ ] `README.md` §환경변수에 4항 추가 (`LLM_GATEWAY_URL`, `LLM_GATEWAY_KEY`, `FEATURE_SUBSCRIPTION_{INGEST,QUERY,LINT}`)
- [ ] `WIKI-AGENTS.md` feature flag 표에 op별 권장 정책 (Query/Lint OK, Ingest 금지)
- [ ] `CLAUDE.md` 변경 이력에 `Phase-W1.5 Subscription Gateway (2026-04-19, v6.9.29 pinned)` 1행

## P2 — prompt cache key

- [ ] ingest analyze/generate 호출에 `prompt_cache_key: 'jarvis:ingest:${workspaceId}:${rulesetVersion}'` 최상위 필드로 주입 (OAuth 채널 패스스루 검증 후)
- [ ] config.yaml `payload.override` 방어층까지 깔지 결정

## P3 — 무관하게 발견한 기존 이슈

- [ ] `packages/ai/tutor.ts:125` — `readTopPages({...})` 가 `ReadPagesResult` (`{ ok: true; pages: LoadedPage[] }`)를 리턴하는데 `LoadedPage[]`로 받고 있음. type-check 에러 1개. 이번 변경 전부터 main에 존재 — `.pages` 추출만 추가하면 됨.

## P3 — 연동 가이드 삭제

- [ ] [`2026-04-19-Jarvis_openai연동가이드.md`](2026-04-19-Jarvis_openai연동가이드.md) 한번 더 검토 후 삭제 (memory: "Plans and specs are disposable")
- [ ] 이 TODO 파일도 작업 종료 후 함께 삭제

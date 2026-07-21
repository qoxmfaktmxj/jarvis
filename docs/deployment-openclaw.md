# OpenClaw 서버 배포 가이드

이 문서는 OpenClaw AI가 새 Linux 서버에서 `main`을 내려받아 Jarvis를 처음 설치하고, 이후 안전하게 갱신하는 절차다. LLM은 **Codex 구독 OAuth → 로컬 CLI Proxy** 한 경로만 사용한다. OpenAI API key, mock fallback, 다른 provider, 장애 우회는 없다. CLI Proxy 장애나 구독 한도 소진은 웹/worker 로그에 오류로 그대로 나타난다.

## 1. 최종 구성

```text
브라우저 ──HTTPS── Nginx ──127.0.0.1:3010── Next.js web
                                            │
                                            ├── PostgreSQL 16 :55432
                                            ├── MinIO :59000
                                            └── CLI Proxy :8317 ── Codex 구독 OAuth

systemd ── jarvis-web.service
        └─ jarvis-worker.service ── pg-boss / Wiki ingest
Docker  ── postgres, minio, cli-proxy
runtime ── .runtime/wiki-repo (Wiki 본문 Git 저장소)
```

외부에 공개할 포트는 Nginx의 `80/443`뿐이다. PostgreSQL, MinIO, CLI Proxy, Next.js는 모두 loopback에만 바인딩한다. OAuth callback용 `1455`도 loopback이며 최초 로그인 때 SSH tunnel로만 접근한다.

## 2. 서버 요구사항

- Ubuntu 22.04/24.04 또는 동등한 Linux
- Git, curl, openssl, Nginx
- Node.js 22 이상
- pnpm 10.33.0 (`corepack` 사용 권장)
- Docker Engine + Compose plugin
- Codex 구독 계정
- 권장: 4 vCPU, RAM 8 GB+, 디스크 40 GB+

확인:

```bash
node --version
corepack enable
pnpm --version
docker --version
docker compose version
git --version
```

## 3. 저장소 받기

아래 경로는 예시다. 서비스 계정이 `/opt/jarvis`를 소유하도록 한다.

```bash
sudo mkdir -p /opt/jarvis
sudo chown "$USER":"$USER" /opt/jarvis
git clone <JARVIS_GIT_URL> /opt/jarvis
cd /opt/jarvis
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
```

`git pull --ff-only`를 유지한다. 서버에서 직접 코드를 수정하거나 merge commit을 만들지 않는다.

## 4. 운영 환경 파일

비밀값을 생성한다.

```bash
openssl rand -base64 36
openssl rand -base64 36
openssl rand -base64 36
openssl rand -hex 32
```

저장소 루트에 `.env.local`을 만든다. 이 파일은 Git에서 제외된다.

```dotenv
NODE_ENV=production
POSTGRES_DB=jarvis_public
POSTGRES_USER=jarvis_public
POSTGRES_PORT=55432
POSTGRES_PASSWORD=<강한-DB-비밀번호>
DATABASE_URL=postgresql://jarvis_public:<URL-인코딩한-DB-비밀번호>@127.0.0.1:55432/jarvis_public

SESSION_SECRET=<강한-세션-비밀값>
WIKI_REPO_ROOT=/opt/jarvis/.runtime/wiki-repo

MINIO_ENDPOINT=http://127.0.0.1:59000
MINIO_ACCESS_KEY=<MinIO-access-key>
MINIO_SECRET_KEY=<강한-MinIO-secret>
MINIO_BUCKET=jarvis-public-sources

LLM_GATEWAY_URL=http://127.0.0.1:8317/v1
LLM_GATEWAY_KEY=<로컬-프록시-bearer-secret>
ASK_AI_MODEL=gpt-5.6-terra
INGEST_AI_MODEL=gpt-5.6-sol
ASK_DAILY_BUDGET_USD=100
```

권한을 제한한다.

```bash
chmod 600 .env.local
mkdir -p .runtime/wiki-repo infra/cliproxy/auths infra/cliproxy/logs
```

`LLM_GATEWAY_KEY`는 OpenAI 과금 API key가 아니라 Jarvis와 같은 서버의 로컬 CLI Proxy 사이를 보호하는 bearer secret이다.

## 5. CLI Proxy 운영 설정

추적된 예제에는 개발용 bearer가 있으므로 운영에서는 반드시 로컬 설정을 만든다.

```bash
cp infra/cliproxy/config.yaml infra/cliproxy/config.local.yaml
```

`infra/cliproxy/config.local.yaml`의 `api-keys` 값을 `.env.local`의 `LLM_GATEWAY_KEY`와 동일하게 바꾼다. 다음 항목은 유지한다.

```yaml
request-retry: 0
max-retry-credentials: 0
quota-exceeded:
  switch-project: false
  switch-preview-model: false
```

현재 셸과 systemd가 사용할 경로를 지정한다.

```bash
export CLIPROXY_CONFIG_PATH=./config.local.yaml
```

### 사내 TLS 검사 환경만

사내 Root CA를 PEM 형식으로 `infra/cliproxy/certs/corporate-root.crt`에 저장하고 다음처럼 두 compose 파일을 함께 사용한다.

```bash
docker compose \
  -f infra/cliproxy/compose.yaml \
  -f infra/cliproxy/compose.corporate-ca.yaml \
  run --rm --service-ports cli-proxy \
  /CLIProxyAPI/CLIProxyAPI --codex-login
```

일반 인터넷 환경은 corporate CA compose 파일을 사용하지 않는다.

## 6. Codex 구독 OAuth 최초 로그인

OpenClaw 서버가 headless라면 작업 PC에서 먼저 SSH tunnel을 연다.

```bash
ssh -L 1455:127.0.0.1:1455 <SERVER_USER>@<SERVER_HOST>
```

SSH 세션을 유지한 채 서버에서 실행한다.

```bash
cd /opt/jarvis
export CLIPROXY_CONFIG_PATH=./config.local.yaml
docker compose -f infra/cliproxy/compose.yaml run --rm --service-ports cli-proxy \
  /CLIProxyAPI/CLIProxyAPI --codex-login
```

출력된 로그인 URL을 작업 PC 브라우저에서 열고 Codex 구독 계정으로 승인한다. callback이 완료되면 인증 파일이 `infra/cliproxy/auths/`에 생성된다. 이 파일의 내용을 채팅·로그·Git에 복사하지 않는다.

프록시를 시작한다.

```bash
docker compose -f infra/cliproxy/compose.yaml up -d cli-proxy
docker compose -f infra/cliproxy/compose.yaml ps
```

모델과 실제 completion을 확인한다.

```bash
set -a; source .env.local; set +a
curl -fsS -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  "$LLM_GATEWAY_URL/models"

curl -fsS -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.6-terra","messages":[{"role":"user","content":"한 단어로 OK라고 답해줘"}]}' \
  "$LLM_GATEWAY_URL/chat/completions"
```

`gpt-5.6-terra`, `gpt-5.6-sol`이 모델 목록에 있고 completion이 HTTP 200이어야 다음 단계로 진행한다.

## 7. PostgreSQL·MinIO와 최초 데이터 초기화

```bash
cd /opt/jarvis
docker compose --env-file .env.local -f infra/compose.yaml up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm samples:ingest
pnpm wiki:bootstrap
pnpm wiki:project
```

`wiki:bootstrap`은 빈 runtime Wiki에서 최초 한 번만 실행한다. 기존 `.runtime/wiki-repo`를 자동으로 덮어쓰지 않는다.

관리자 계정은 비밀번호를 `.env.local`에 남기지 말고 현재 프로세스에만 전달한다.

```bash
BOOTSTRAP_ADMIN_EMAIL='admin@example.invalid' \
BOOTSTRAP_ADMIN_NAME='Jarvis Admin' \
BOOTSTRAP_ADMIN_PASSWORD='<강한-관리자-비밀번호>' \
pnpm admin:bootstrap
```

## 8. 빠른 production build

`main`에 들어오기 전 GitHub의 required `verify`가 boundary, lint, unit test, production build, content security scan을 수행한다. 서버에서 같은 검사를 반복하지 않는다. 최초 설치와 일반 배포 서버에서는 build 한 번만 실행한다.

```bash
pnpm build
```

DB integration, Playwright E2E, eval, dependency audit 같은 무거운 검사는 GitHub Actions의 **Deep Verify**를 필요할 때 수동 실행한다. 일반 배포를 막지 않는다.

구독 gateway live smoke:

```bash
set -a; source .env.local; set +a
pnpm --filter @jarvis/ai test:live
```

build 또는 live smoke가 실패하면 배포를 중단한다. 특히 CLI Proxy 실패를 mock이나 API key로 우회하지 않는다.

## 9. systemd 서비스

실제 `pnpm`, `node` 경로는 `command -v pnpm`, `command -v node`로 확인한다. 아래 `<SERVER_USER>`를 서비스 계정으로 바꾼다.

`/etc/systemd/system/jarvis-web.service`:

```ini
[Unit]
Description=Jarvis Next.js web
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=<SERVER_USER>
WorkingDirectory=/opt/jarvis
Environment=NODE_ENV=production
ExecStart=/usr/bin/env pnpm --filter @jarvis/web start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/jarvis-worker.service`:

```ini
[Unit]
Description=Jarvis pg-boss worker
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=<SERVER_USER>
WorkingDirectory=/opt/jarvis
Environment=NODE_ENV=production
ExecStart=/usr/bin/env node --env-file=.env.local apps/worker/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

CLI Proxy compose에는 `restart: unless-stopped`가 설정되어 있다. config 경로가 운영 파일을 가리키도록 `/etc/systemd/system/jarvis-cliproxy.service`도 둔다.

```ini
[Unit]
Description=Jarvis CLI Proxy
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=<SERVER_USER>
WorkingDirectory=/opt/jarvis
Environment=CLIPROXY_CONFIG_PATH=./config.local.yaml
ExecStart=/usr/bin/docker compose -f infra/cliproxy/compose.yaml up -d cli-proxy
ExecStop=/usr/bin/docker compose -f infra/cliproxy/compose.yaml stop cli-proxy

[Install]
WantedBy=multi-user.target
```

활성화:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-cliproxy jarvis-worker jarvis-web
sudo systemctl status jarvis-cliproxy jarvis-worker jarvis-web --no-pager
```

## 10. Nginx reverse proxy

`/etc/nginx/sites-available/jarvis` 예시:

```nginx
server {
    listen 80;
    server_name jarvis.example.com;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 180s;
    }
}
```

활성화 후 TLS 인증서를 적용한다.

```bash
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d jarvis.example.com
```

SSE Ask AI 응답 때문에 `proxy_buffering off`와 충분한 `proxy_read_timeout`을 유지한다.

## 11. 배포 확인

```bash
curl -fsS http://127.0.0.1:3010/login >/dev/null
docker compose --env-file .env.local -f infra/compose.yaml ps
docker compose -f infra/cliproxy/compose.yaml ps
sudo journalctl -u jarvis-web -u jarvis-worker -n 200 --no-pager
docker logs --tail 200 jarvis-cli-proxy
```

브라우저 확인:

1. 로그인 화면과 관리자 로그인이 정상이다.
2. 새로고침할 때 Blinking Squares와 Kinetic Grid가 번갈아 나온다.
3. `prefers-reduced-motion`에서는 배경이 정지한다.
4. Ask AI가 citation과 함께 응답한다.
5. source ingest가 실패하면 review/log에 실패가 남고 다른 LLM으로 우회하지 않는다.

## 12. 이후 main 갱신

일반 갱신은 아래 한 명령으로 끝낸다.

```bash
cd /opt/jarvis
pnpm deploy:openclaw
```

이 스크립트는 다음만 수행한다.

1. tracked 파일이 깨끗한지 확인하고 `origin/main`을 fast-forward한다.
2. package/lockfile 변경 때만 `pnpm install`을 실행한다.
3. migration 변경 때만 `pnpm db:migrate`를 실행한다.
4. production build 후 web/worker를 재시작한다.
5. CLI Proxy 파일이 바뀐 경우에만 이미지를 갱신하고 프록시를 재시작한다.
6. `/login` HTTP smoke가 성공해야 완료한다.

즉, 서버에서 lint/type-check/unit/integration/E2E/security를 다시 실행하지 않는다. 상세 검증은 CI 결과를 신뢰한다.

## 13. 백업과 롤백

필수 백업:

- PostgreSQL dump
- MinIO volume 또는 bucket
- `.runtime/wiki-repo` 전체와 Git 이력
- `infra/cliproxy/auths/` (암호화 저장)
- `.env.local`, `config.local.yaml` (암호화 저장)

코드 롤백은 정상 동작했던 commit으로 별도 배포 checkout을 만들고 build/test 후 systemd의 `WorkingDirectory`를 전환하는 방식을 권장한다. DB migration이 포함된 경우 코드만 되돌리지 말고 해당 migration의 호환성을 먼저 확인한다. `git reset --hard`로 운영 데이터나 로컬 설정을 정리하지 않는다.

## 14. 장애 판단

- `CLI_PROXY_HTTP_401`: `.env.local`의 `LLM_GATEWAY_KEY`와 `config.local.yaml`의 `api-keys` 불일치
- `CLI_PROXY_HTTP_429`: 구독 한도 소진 가능성. 우회하지 말고 계정 상태 확인
- `CLI_PROXY_HTTP_5xx`/timeout: `docker logs jarvis-cli-proxy`와 OAuth 만료 확인
- 모델 없음: OAuth 계정 권한과 `gpt-5.6-terra`/`gpt-5.6-sol` 모델 목록 확인
- worker 반복 실패: `journalctl -u jarvis-worker`와 review queue 확인
- DB 연결 실패: `docker compose ... ps`, `DATABASE_URL`, PostgreSQL health 확인
- Wiki 초기화 거부: 대상 디렉터리가 비어 있지 않은 정상 보호 동작. 기존 runtime을 확인

장애 시 OpenAI API key, mock, 다른 provider, credential rotation fallback을 추가하지 않는다. 원인을 고친 뒤 같은 요청/job을 재실행한다.

## OpenClaw AI에 그대로 전달할 지시문

```text
/opt/jarvis에 Jarvis를 배포하라.
1) origin/main만 git pull --ff-only로 사용하고 서버에서 merge/force/reset하지 마라.
2) docs/deployment-openclaw.md를 처음부터 끝까지 읽고 실제 명령과 파일을 교차 확인하라.
3) .env.local과 infra/cliproxy/config.local.yaml을 만들되 비밀값을 출력하거나 Git에 넣지 마라.
4) PostgreSQL/MinIO를 infra/compose.yaml로 시작하고 migration/seed/최초 Wiki 초기화를 수행하라.
5) CLI Proxy에서 --codex-login으로 구독 OAuth만 인증하라. OPENAI_API_KEY, mock, fallback provider를 만들지 마라.
6) gpt-5.6-terra와 gpt-5.6-sol의 /models 및 실제 completion HTTP 200을 확인하라.
7) 최초 설치는 pnpm build만 실행하고 systemd web/worker/cliproxy를 활성화하라. 이후 배포는 pnpm deploy:openclaw 한 명령만 사용하라. lint/unit/security는 GitHub required verify 결과를 신뢰하고 서버에서 반복하지 마라.
8) Nginx는 127.0.0.1:3010으로 proxy하고 SSE buffering을 끄며 DB/MinIO/CLI Proxy 포트는 외부에 열지 마라.
9) 최종 보고에 배포 commit SHA, 서비스 상태, health check, LLM smoke 결과를 포함하되 token/비밀번호는 절대 포함하지 마라.
10) 오류가 나면 로그와 원인을 보고하고 수정하라. 다른 LLM 경로나 API key로 우회하지 마라.
```

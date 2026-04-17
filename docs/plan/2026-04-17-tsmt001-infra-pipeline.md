---
title: "TSMT001 → wiki-fs infra 도메인 통합 파이프라인 설계"
date: 2026-04-17
author: planner
status: reviewed-accepted (simplified 2026-04-17)
reviewed-by: plan-eng-review (claude-opus-4-7)
decisions:
  sanitizer: "없음 — 모든 사용자가 담당자 권한, credential 평문 노출 허용"
  vault: "없음 — 원본 Oracle EXPORT_TABLE 존재 + wiki 는 gitignore"
  scope: "full — synth + viewer + dashboard + import (sanitize review 화면만 자동 obsolete)"
  sensitivity: "INTERNAL (모든 인원 접근 가능)"
  llm_synth_model: "claude-sonnet-4-6 via Claude Code subagent (별도 API 키 불필요)"
  final_review_model: "claude-opus-4-7 (전 단계 완료 후 최종 리뷰)"
related:
  - docs/plan/2026-04-17-tsvd999-wiki-pipeline.md
  - WIKI-AGENTS.md
  - packages/ai/page-first/shortlist.ts
---

# TSMT001 → wiki-fs infra 도메인 통합 파이프라인 설계

## 0. 한 문장 요약

이수시스템 내부 `EXPORT_TABLE` (392개 고객사·내부 시스템의 접속·배포·담당자·이력 정보)을 **`wiki/jarvis/auto/infra/<company_slug>/<system_slug>.md`** 로 변환해 기존 page-first recall·Ask AI·wiki viewer 레일에 태운다. 모든 인원이 담당자 권한이고 인트라넷 내부 도구이므로 **credential sanitize·vault·reveal UI 없이** 평문 그대로 페이지에 포함한다. wiki/ 는 gitignore 로 원격 유출 차단.

근거: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md` 와 동일 원칙 — compiled wiki = SSoT, DB는 projection only. 기존 wiki-fs·wiki-ingest·page-first 파이프라인을 재사용하고 **infra 도메인만 신규 추가**한다. 별도 RAG/vector DB 만들지 않는다 (pgvector·tsvector·page-first 이미 존재). Credential vault·sanitizer·ACL 세분화 없음 — 모든 사용자가 동일 trust level, 원본 Oracle EXPORT_TABLE 의 접근 권한과 동일.

---

## A. 재료 분석 — 실제로 어떤 데이터가 들어있나

### 파서 결과 (`data/infra/records.jsonl`, 392행 검증 완료)

| 지표 | 값 |
|---|---:|
| INSERT 행 (= 시스템 수) | 392 |
| 고유 `company_cd` | 194 (일부 회사가 dev + 운영 combos로 다중 entry) |
| `env_type` 분포 | 운영 239 / 개발 153 |
| `connect_cd` 분포 | VPN 152 / IP 101 / VDI 75 / RE 64 |
| 필드 populated (비null) 비율 | `domain_addr` 95%, `login_info` 85%, `db_connect_info` 93%, `db_user_info` 88%, `memo` 84% |

### Schema 불규칙성 (중요 — 설계에 영향)

파서 검증 중 **SRC_INFO / CLASS_INFO / MEMO 컬럼이 free-form 으로 혼용**되는 현상을 확인했다. 담당자들이 컬럼명과 무관하게 자유롭게 기록한 결과:

- `SRC_INFO` (이름상 "소스 경로") 의 첫 행(WHE) 예시:
  ```
  1. vpn접속 : https://219.249.202.6  isusystem/13579abcd..
  => isu!Q@W 변경(2019-12-16)
  ...
  3. D:\OPTI_HRMS\WHE_HR 경로에 패치
  4. RD admin/admin
  ```
  → VPN 절차, 비번 변경 이력, 배포 경로, RD 계정이 **한 컬럼에 뒤섞임**.

- `CLASS_INFO` 에는 장애 이력 + 재기동 절차가 섞임.
- `MEMO` 에는 FTP 비번, 채용서버 RDP 크리덴셜이 추가로 존재.

**결론:** 컬럼 → frontmatter 1:1 매핑은 불가능. LLM 한번 태워서 **재분류(접속/배포/장애이력/담당자/credential)** 필수.

### 민감 패턴 스캔 결과

| 패턴 | 출현 수 |
|---|---:|
| `user/pass` 형식 | 3,082 |
| Oracle TNS (`host:port:SID`) | 562 |
| IP 주소 (public + private) | 1,894 |
| URL (admin/VPN/WAS) | 1,162 |
| 이메일 | 271 |
| 전화번호 | 338 |
| `비밀번호:` / `PASS:` 문구 | 721 |

→ **wiki 페이지에 올려도 되는 것** 과 **credential vault로만 보내야 하는 것** 을 반드시 명시적으로 구분해야 한다.

---

## B. wiki 도메인 설계

### B-1. 디렉토리

```
wiki/jarvis/
├── auto/
│   ├── cases/          (TSVD999 — 기존)
│   ├── companies/      (127개 회사 허브 — 기존)
│   └── infra/          ← 신규
│       └── <company_slug>/
│           ├── _index.md              # 회사 단위 landing (dev + 운영 + VPN 파일 링크)
│           └── <system_slug>.md       # 개별 시스템 runbook
└── manual/
    └── infra/          ← 신규 (담당자 직접 편집)
        └── <company_slug>/<system_slug>.md
```

- `<company_slug>` = `company_cd.lower()` (`WHE` → `whe`)
- `<system_slug>` = `<env_type>-<connect_cd>` (`운영-ip`), 중복 시 `-<row_number>` 서픽스

### B-2. Frontmatter schema

```yaml
---
title: "<company> <env_type> 시스템 Runbook"
type: infra-runbook
authority: auto
sensitivity: INTERNAL             # 모든 Jarvis 사용자 접근 가능 (2026-04-17 단순화)
domain: infra
tags: ["domain/infra", "company/<slug>", "env/<운영|개발>"]
infra:
  enterCd: SSMS
  companyCd: WHE
  envType: 운영
  connectCd: IP
  vpnFileSeq: null
  domain:
    url: "http://hr.wartsila-hyundai.com/"
  svn:
    repo: "WHE_HR"
  db:
    dsn: "192.168.10.53:1521:HR"
    prevDsn: "219.249.202.192:1521:HR"
    credentialRef: "vault://infra/whe/db"      # 값 아님, 참조키
  app:
    credentialRef: "vault://infra/whe/app"
  src:
    path: "D:\\OPTI_HRMS\\WHE_HR"
  changelog:
    - { date: "2019-05-21", event: "도메인 암호 만료로 인한 변경" }
    - { date: "2018-02-13", who: "피지훈", event: "main.jsp 오류 후 수정 반영" }
  contacts:
    - { name: "김정태", role: "대리", ref: "jarvis://people/whe-primary" }
sources:
  - "TSMT001#row-1"   # source_line 도 함께 기록 → 추적 가능
  - "TSMT001#line-3"
---

## 접속 방법
<LLM이 SRC_INFO/MEMO에서 재분류한 "접속 절차" 섹션>

## 배포 경로
<LLM이 재분류한 "패치/배포" 섹션>

## 장애 이력
<LLM이 재분류한 "장애 타임라인" 섹션. 날짜+이벤트 형식>

## 담당자
<contacts 구조화된 것 + 본문에 있던 "부재시 대응" 가이드>

## 연관 시스템
- [WHE 개발 시스템](../whe/개발-ip.md)
- [회사 허브](../../companies/whe.md)
```

### B-3. 페이지 분할 정책

- **한 시스템 = 한 페이지** (env × connect 조합이 별도 entry면 별도 페이지)
- **회사 landing(`_index.md`)** 은 해당 회사의 모든 시스템 리스트 + VPN 파일 링크 + 공통 담당자만
- 3KB 미만이면 landing 생략, detail만.

---

## C. Sanitization — **없음 (중단)**

2026-04-17 의사결정으로 제거. 이유: 모든 Jarvis 사용자가 담당자 권한이고 인트라넷 내부 전용이며 `wiki/` 는 `.gitignore` 로 원격 유출 차단됨. 원본 Oracle EXPORT_TABLE 을 `CRYPTIT.DECRYPT` 로 조회하던 기존 담당자 워크플로와 동일 trust level.

삭제된 산출물: `scripts/sanitize-infra.py`, `scripts/tests/test_sanitize_*.py`, `scripts/check-infra-leaks.sh`, `scripts/install-git-hooks.sh`, `.git/hooks/pre-commit`.

→ `records.jsonl` 을 바로 synth 단계로 투입.

## C-archive. (구) Sanitization 파이프라인 (3-layer automatic defense)

**입력:** `data/infra/records.jsonl` (파서 산출물, 평문 비번 포함)
**출력:** `data/infra/clean.jsonl` (wiki 재료, credential 전부 `[REDACTED]`) + `data/infra/sanitize-audit.log` (무엇을 몇 건 지웠는지 감사용)

**credential 별도 저장소 없음** — 값 자체는 원본 Oracle `EXPORT_TABLE` 에 이미 암호화 보존. wiki 에는 `credentialSource: "TSMT001:row-N:FIELD"` 좌표만 기록 (Section D 참조).

### C-1. 컬럼별 규칙

| 컬럼 | 처리 |
|---|---|
| `enter_cd`, `company_cd`, `env_type`, `connect_cd`, `vpn_file_seq` | 그대로 통과 |
| `domain_addr` | URL 만 추출 |
| `login_info` | user 부분만 추출. password 는 regex/LLM 로 `[REDACTED]` 마스킹. frontmatter 에 `credentialSource: "TSMT001:row-N:LOGIN_INFO"` 로 좌표만 |
| `svn_addr` | repo 이름만 추출 |
| `db_connect_info` | `host:port:SID` 추출. 서브라인 "이전 정보" 는 `prevDsn` 으로 |
| `db_user_info` | login_info 와 동일 처리, `credentialSource: "...:DB_USER_INFO"` |
| `src_info`, `class_info`, `memo` | **LLM 2-step:** (1) 섹션 분류 → 접속/배포/장애/담당자/기타 로 split (2) credential 잔류 스캔 + 마스킹 |

### C-2. Regex 1차 필터 (Layer 1a)

```python
CREDENTIAL_PATTERNS = {
    'password_label':  re.compile(r'(?i)(비밀번호|패스워드|PASS|PW|P/W)\s*[:=]\s*(\S+)'),
    'user_slash_pass': re.compile(r'\b([A-Za-z][A-Za-z0-9_]{2,})\s*/\s*([A-Za-z0-9!@#$%^&*()_+\-=.{}]{4,})\b'),
    'change_arrow':    re.compile(r'=>\s*(\S+)\s*(?:으로\s*)?변경'),
    'api_key':         re.compile(r'(?i)(api[_-]?key|token|secret)\s*[:=]\s*(\S+)'),
}
# URL 경로는 false-positive 방지를 위해 negative-context 처리
URL_NEGATIVE = re.compile(r'https?://[^\s]+')
```

### C-3. LLM 2차 검증 (Layer 1b, Sonnet 4.6)

regex 통과분에 대해 "남아있는 credential 있나?" 질의. hit 시 추가 redact. audit 기록.

### C-4. 3-Layer Automatic Defense

```
           Layer 1: scripts/sanitize-infra.py (입력 단)
           regex + LLM → clean.jsonl + sanitize-audit.log
                        │
                        ▼  (뚫린 경우)
           Layer 2: scripts/tests/test_sanitize_infra.py (CI)
           clean.jsonl + wiki/infra/** 전체 grep = 0
                        │
                        ▼  (CI 도 놓친 경우)
           Layer 3: scripts/check-infra-leaks.sh (.husky/pre-commit)
           staged wiki/infra 파일 직접 grep → commit 차단
```

- **Layer 1** 은 파이프라인이 자체 수행. 게이트 아님, 입력 정화.
- **Layer 2** 는 `pnpm test` 와 GitHub Actions 에서 실행. PR 머지 차단.
- **Layer 3** 는 개발자 로컬에서 `git commit` 자체를 거부. git history 오염 원천 차단.

한 레이어가 뚫려도 다음이 잡는 defense-in-depth. 자동이라 사람 실수 무관.

### C-5. 수동 게이트 (보완)

- **G-infra-1 (manual, Phase-1a):** 10개 시스템 sanitize → 담당자가 audit.log 훑어서 "정상 문맥이 redact 됐는지" 체크. miss 발견 시 regex 예외/강화.
- Layer 1/2/3 가 "false negative = credential 누출" 을 잡고, 수동 게이트는 "false positive = 과잉 삭제" 를 잡는다.

---

## D. Credential Reveal — **없음 (중단)**

2026-04-17 의사결정으로 제거. wiki 페이지에 credential 평문 그대로 포함. 🔒 reveal UI 불필요. `revealCredential` server action 불필요. `infra-ops` role 불필요.

## D-archive. (구) Credential Reveal 설계 (Oracle 직접 조회)

**핵심 결정:** 별도 vault 인프라 **구축하지 않는다**. Oracle `EXPORT_TABLE` 이 이미 `CRYPTIT` 로 암호화된 credential 원본이므로, 이것을 그대로 credential source 로 사용한다. wiki 에는 **값이 아니라 좌표** 만 기록하고, UI 에서 권한 확인 후 실시간 조회.

### D-1. 데이터 흐름

```
┌────────────────────────────────────────────────────────────┐
│  사내 Oracle DB  (이미 존재, 변경 없음)                       │
│  EXPORT_TABLE — CRYPTIT 암호화된 credential 원본             │
└─────────────────────────▲──────────────────────────────────┘
                          │ (3) CRYPTIT.DECRYPT() 로 쿼리
                          │     + audit_log insert
                    ┌─────┴─────────────────────┐
                    │  Jarvis server action        │
                    │  revealCredential(source)    │
                    │  → RBAC 체크 + Oracle 조회   │
                    └─────▲─────────────────────┘
                          │ (2) 🔒 버튼 클릭
         ┌────────────────┴─────────────────┐
         │  wiki viewer — InfraRunbook.tsx   │
         │   DB DSN: 192.168.10.53:1521:HR   │
         │   계정: [🔒 운영자 권한 필요]      │
         └───────────────────────────────────┘
                          ▲
                          │ (1) frontmatter 읽어 렌더
                    ┌─────┴───────────────┐
                    │ wiki/.../infra/.md   │
                    │ credentialSource:    │
                    │  "TSMT001:row-1:     │
                    │   DB_USER_INFO"      │  ← 값 없음, 좌표만
                    └──────────────────────┘
```

### D-2. wiki frontmatter (B-2 스키마 revisit)

기존 플랜 B-2 의 `credentialRef: "vault://..."` 를 **`credentialSource: "TSMT001:row-N:FIELD"`** 로 교체.

```yaml
infra:
  db:
    dsn: "192.168.10.53:1521:HR"
    credentialSource: "TSMT001:row-1:DB_USER_INFO"   # 값 아님, 좌표
  app:
    url: "http://hr.wartsila-hyundai.com/"
    credentialSource: "TSMT001:row-1:LOGIN_INFO"
```

### D-3. server action — `revealCredential`

```typescript
// apps/web/app/(app)/wiki/[...path]/actions.ts
'use server'

const SOURCE_PATTERN = /^TSMT001:row-(\d+):([A-Z_]+)$/;
const ALLOWED_FIELDS = new Set(['LOGIN_INFO', 'DB_USER_INFO']);

export async function revealCredential(source: string): Promise<{ value: string; expiresAt: number }> {
  const session = await getSession();
  if (!session.user.hasRole('infra-ops')) {
    throw new ActionError('FORBIDDEN');
  }

  const m = SOURCE_PATTERN.exec(source);
  if (!m) throw new ActionError('INVALID_SOURCE');
  const [, rowStr, field] = m;
  if (!ALLOWED_FIELDS.has(field)) throw new ActionError('INVALID_FIELD');
  const rowNumber = parseInt(rowStr, 10);

  // Oracle 쿼리 (사내 네트워크 전용 connection)
  const rows = await oracleQuery<{ val: string }>(`
    SELECT CRYPTIT.DECRYPT(${field}, 'SSMS') AS val
    FROM EXPORT_TABLE
    WHERE ROW_NUMBER = :1
  `, [rowNumber]);
  if (rows.length === 0) throw new ActionError('NOT_FOUND');

  // audit log (기존 packages/db/schema/audit.ts 재사용)
  await db.insert(auditLog).values({
    userId: session.user.id,
    action: 'credential_reveal',
    target: source,
    at: new Date(),
  });

  return { value: rows[0].val, expiresAt: Date.now() + 30_000 };
}
```

### D-4. UI — InfraRunbook.tsx 의 🔒 버튼

```tsx
function CredentialReveal({ source }: { source: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);

  // 30 초 타이머 만료 시 자동 숨김
  useEffect(() => {
    if (!value) return;
    const remain = expiresAt - Date.now();
    const t = setTimeout(() => setValue(null), Math.max(0, remain));
    return () => clearTimeout(t);
  }, [value, expiresAt]);

  const onReveal = async () => {
    try {
      const { value, expiresAt } = await revealCredential(source);
      setValue(value);
      setExpiresAt(expiresAt);
    } catch (e) {
      toast.error(e.message === 'FORBIDDEN' ? '운영자 권한이 필요합니다' : '조회 실패');
    }
  };

  if (!value) return <button onClick={onReveal}>🔒 운영자 권한 필요</button>;
  return (
    <span className="font-mono bg-yellow-100 px-1">
      {value} <button onClick={() => setValue(null)}>가림</button>
      <small className="text-gray-500 ml-2">{Math.ceil((expiresAt - Date.now()) / 1000)}초 후 자동 가림</small>
    </span>
  );
}
```

### D-5. 장점 (vault 안 쓰는 이유)

| 항목 | 별도 vault | 원본 Oracle 직접 (이 안) |
|------|-----------|----------------------|
| 신규 인프라 | vault 서버 + 테이블 + API + rotation | 없음 |
| SSoT | 2 곳 (wiki + vault) | 1 곳 (Oracle EXPORT_TABLE) |
| rotation | vault 별도 job | Oracle 에서 바꾸면 자동 반영 |
| 감사 로그 | vault 전용 | 기존 `audit.ts` 재사용 |
| 보안 boundary | AES-GCM + key rotation 운영 | Oracle CRYPTIT 이미 작동 중 |
| 구현 비용 | schema + migration + UI + key ops | server action 1개 |

---

## E. LLM Synthesis 단계

### E-1. Batch 구성

- 392 시스템 / 배치 20 = 20 batch → 외부 세션 실행 prompt 팩으로 감쌀 수 있음 (TSVD999 pack과 동일 포맷).
- 배치당 LLM context ~60K tokens (clean 재료 + 기존 페이지 샘플 + prompt).

### E-2. Prompt 구조 (요지)

```
You are synthesizing infra-runbook pages from a service-desk export.

Input: JSON array of N sanitized system records.
For each record, write ONE Korean markdown page to `output_path` with:
- frontmatter per B-2 schema
- sections: 접속 방법 / 배포 경로 / 장애 이력 / 담당자 / 연관 시스템
- cite source via `sources:` (TSMT001#row-N)
- NEVER embed credentials in body (use {{vault-ref}} tokens; the renderer will resolve)
- Each page ≤ 400 lines
```

### E-3. 검증 게이트 (G-infra-2)

- 생성된 페이지 10개 sample → 담당자 스팟체크 "내용이 현장과 맞는가 / 누락이 있는가".
- 통과 기준: 8/10. 실패 원인이 sanitization 과잉 삭제면 C-1 규칙 재튜닝.

---

## F. wiki-ingest / page-first 통합 (신규 코드 거의 0)

### F-1. 재사용되는 기존 레일

| 레일 | 역할 | 이번 작업에서 |
|---|---|---|
| `packages/wiki-fs` | 파일시스템 reader, git, wikilink | 재사용. `domain: infra` 필터만 쓴다 |
| `apps/worker/src/jobs/ingest/*` | Two-Step CoT 분석 → DB projection | 재사용. infra 페이지도 동일 pipeline |
| `packages/db/schema/knowledge.ts` (`embedding`, `searchVector`) | pgvector + tsvector | 재사용 |
| `packages/ai/page-first/shortlist.ts` | hybrid recall | 재사용. domain filter에 `infra` 추가 |
| `packages/wiki-agent` | prompt builders + parsers | 재사용 |

### F-2. 신규·수정이 필요한 곳

1. **`packages/wiki-fs/src/frontmatter.ts`**: `type: infra-runbook` 과 `infra:` 블록 스키마 등록 (zod)
2. **`packages/ai/page-first/shortlist.ts`**: domain 파라미터에 `infra` 추가
3. **`packages/ai/ask.ts`**: Ask AI 라우팅 — 질문에 회사명·시스템명 포함 시 `domain: infra` 우선 순위 부여
4. **`apps/web/app/wiki/viewer/.../InfraRunbook.tsx`** (신규): frontmatter `infra:` 구조를 섹션 카드로 렌더. `credentialRef` 토큰은 🔒 버튼으로 (D-2 API)

---

## G. 화면 설계 (4개 screen)

### G-1. Import (1차 적재용)

- 경로: `apps/web/app/(app)/admin/infra/import/page.tsx`
- 기능: SQL 파일 업로드 → 파서 호출 → 미리보기 → sanitize 미리보기 (redact diff) → 승인 시 publish
- 재사용: 기존 review-queue 패턴 + upload UI

### G-2. Sanitize Review

- 경로: `apps/web/app/(app)/admin/infra/review/[batchId]/page.tsx`
- 기능: 자동 redact 된 항목 per-field diff. "이 토큰은 사실 credential 아님" / "이 토큰은 credential 맞음" 승인 토글.
- 재사용: 기존 review-queue

### G-3. System Detail (= InfraRunbook page)

- 경로: wiki viewer URL (`/wiki/view?path=infra/whe/운영-ip`)
- 렌더: 기본 markdown + `InfraRunbook.tsx` 커스텀 섹션 카드 (도메인/DB/SVN/담당자 표 + changelog 타임라인 + credential 잠금 버튼)

### G-4. Company Infra Dashboard

- 경로: `apps/web/app/(app)/companies/[slug]/infra/page.tsx`
- 렌더: 해당 회사의 dev+운영 시스템 리스트 + 헬스 상태 (옵션) + VPN 파일 다운로드 + 담당자 연락처.
- 데이터 소스: `frontmatter.infra.*` 를 projection 한 DB 쿼리 (vector 아님).

---

## H. 권한·ACL — 단일 레벨

infra 페이지 `sensitivity: INTERNAL`. 모든 Jarvis 사용자가 조회 가능. 별도 role 분리·reveal 분기·audit log 없음.

- `packages/auth` 에 추가 role 없음 (기존 INTERNAL 만 사용).
- 변경 권한: 기본 admin 만. 담당자의 직접 편집 필요시 `manual/infra/**` 경로에 별도 편집 UI (기존 wiki-editor 재사용).

---

## I. 검증 게이트 (단순화)

sanitizer·ACL 게이트 제거됨. 남은 게이트:

| 게이트 | 실행 시점 | 조건 | 실패 시 |
|---|---|---|---|
| G-infra-2 (synth 품질, 수동) | Phase-1a (dry-run) | 10건 중 8 이상 "담당자 보기에 현장과 맞음" | prompt 튜닝 후 재합성 |
| G-infra-3 (wiki/ gitignore) | 매 PR CI | `git check-ignore wiki/` = 0 exit (여전히 gitignore) | `.gitignore` 원복 |

---

## J. 롤백·점진 배포 (단순화)

### 단계

1. **Phase-1a (dry-run, 10개):** 10개 시스템 synth → `data/infra/preview/*.md` 배출 (wiki/ 에 바로 쓰지 않음). 담당자 spot-check.
2. **Phase-1b (10개 공개):** G-infra-2 통과 후 실제 `wiki/jarvis/auto/infra/**` 에 저장 (gitignore 상태 유지). worker ingest → DB projection → Ask AI 가시성 확인.
3. **Phase-2 (전체 392개):** 문제 없으면 전체 batch.
4. **Phase-3 (화면 3개):** InfraRunbook viewer → Company Infra Dashboard → Import page. (sanitize review 화면은 불필요로 제외)
5. **Phase-Final (Opus 4.7 최종 리뷰):** plan vs. 구현 diff + 실제 wiki 페이지 10건 표본 + frontmatter 스키마 일관성 점검.

### 롤백

- wiki 페이지: gitignore 되어 있으므로 "삭제 = 로컬 rm" 으로 즉시 제거.
- DB projection: 재ingest 로 정합성 복구 (기존 worker 레일).

---

## K. 확정된 설계 결정 (2026-04-17 simplification 이후)

1. **Credential 저장 방식**: 별도 vault·reveal UI 없음. 평문 그대로 wiki 페이지에 포함. 인트라넷 내부 도구이고 모든 사용자가 담당자 권한.
2. **Sensitivity 기본값**: `INTERNAL`. 모든 Jarvis 사용자 접근 가능. (초안에는 RESTRICTED + `infra-ops` 분리 제안했으나 2026-04-17 단순화로 폐기.)
3. **화면 우선순위**: G-3 (System Detail viewer) → G-4 (Company Dashboard) → G-1 (Import status). G-2 (Sanitize Review) 화면은 sanitizer 중단으로 자동 obsolete.
4. **LLM synth 모델**: Claude Code subagent (Sonnet 4.6). 사용자 Claude Code 구독 크레딧으로 처리, 별도 Anthropic API 키 불필요.
5. **회사 페이지 중복**: 기존 `wiki/jarvis/auto/companies/<co>.md` 와 infra 페이지는 각자 독립 생성. 필요 시 후속 PR 에서 companies 허브에 infra 섹션 링크 추가.
6. **최종 리뷰 모델**: `claude-opus-4-7` critic subagent — Phase-Final 에서 plan↔구현 diff + 3 샘플 페이지 + 테스트·SQL·ACL 일관성 점검 (완료: 2026-04-17).

## K-보류. 후속 PR 로 미룰 항목

- Wiki page `aliases` 생성 (Opus 리뷰 P2 #3) — synth prompt 에 "aliases: [company_cd, Korean name, env connect]" 지시 추가 후 재생성.
- Dashboard SQL 에 `requiredPermission` 필터 추가 (Opus 리뷰 P2 #5, 현재는 미사용이라 무해).
- `coerceInfraMeta` 와 InfraRunbookHeader 의 unit 테스트 보강.
- `_index.md` 회사 landing page 생성 (Plan B-1 계획, 현재 미구현).
- companies 허브 ↔ infra 페이지 상호 wikilink (Plan K-5, deferred).

---

## 관련 파일

- Parser: `scripts/parse-tsmt001.py`
- 테스트: `scripts/tests/test_parse_tsmt001.py` (9/9 통과)
- Fixture: `scripts/tests/fixtures/tsmt001_sample.sql`
- 파싱 결과: `data/infra/records.jsonl` (392행, gitignore 대상)
- 원본: `TSMT001.sql` (git push 절대 금지, gitignore 대상)

# EHR Entity Enrichment Prompt

> Graphify Path B 후처리용. 사용자가 Graphify raw output + `graphify-postprocess.ts`
> 결과를 **한국어 의미 + 추론 설명**으로 풍부화하기 위해 LLM에 1-pass 투입.
> 모델: gpt-5.4-mini (CLIProxy 구독 또는 직결). 1000 entity 기준 ~$1 (또는 구독 경유면 $0).

## Role

You enrich Graphify-extracted EHR code entities for the Jarvis wiki.

## Input (per entity)

- **name** — identifier (e.g., `P_HRI_AFTER_PROC_EXEC`)
- **kind** — procedure / function / table / view
- **module** — HRM / CPN / TIM / SYS / ORG / ...
- **source snippet** — 20-50 lines around the definition, comments preserved verbatim
- **Graphify edges** — callers[], callees[], references[]

## Output (Markdown with YAML frontmatter)

```yaml
---
title: "{name}"
type: derived
authority: auto
sensitivity: INTERNAL
domain: code/{module}
source: "{source path}"
tags: ["derived/code", "module/{module}", "kind/{kind}"]
aliases:
  - "{name}"
  - "{한국어 비즈니스 개념, 주석에서 추출}"
  - "{영문 phrase, 2-3단어}"
module: {module}
kind: {kind}
linkedPages:
  - "code/{module}/{kind}s/{callee}"
---

# {name}

## Purpose
<1-2 sentence Korean summary extracted from comment block. 주석이 없으면 signature에서 추론.>

## Signature
```sql
<exact signature from source>
```

## Calls
- [[code/{module}/{kind}s/{callee}]] — <1-line why, Korean>
- ...

## Called by
- [[code/{module}/{kind}s/{caller}]]
- ...

## Related tables
- [[code/{module}/tables/{table}]] — read | write | both

## Key logic (excerpt)
<10-30 lines of core logic, 주석 preserve. 줄 수가 많으면 핵심 조건문·루프만.>
```

## Rules

1. **Korean comments verbatim** — do NOT translate to English
2. **Aliases ≥ 3 required**:
   - (a) the identifier as-is (e.g., `P_HRI_AFTER_PROC_EXEC`)
   - (b) Korean business concept if mentioned in comments (비과세, 통상임금, 신청서 후처리 etc.)
   - (c) English phrase describing purpose (e.g., "HRI after-form processing")
3. **Never fabricate caller/callee relationships** — use ONLY Graphify-extracted edges
4. **If purpose is unclear** — add tag `needs-review` and leave Purpose="AMBIGUOUS — manual review"
5. **Key logic excerpt ≤ 30 lines** — preserve comments, strip blank lines
6. **Preserve parameter comments** in Signature section
7. **Business-term matching**: HRI (HR Interface), SAL (Salary), ATT (Attendance) etc. → map to Korean in aliases

## Batch Usage (사용자용)

```bash
# 1. Graphify raw output 준비
ls graphify-out-HRM/pages/

# 2. postprocess로 frontmatter 뼈대 추가 (Jarvis script)
pnpm exec tsx scripts/graphify-postprocess.ts \
  --input=./graphify-out-HRM \
  --output=wiki/jarvis/auto/derived/code/HRM \
  --module=HRM

# 3. 본 prompt로 enrichment (사용자 or Jarvis batch)
#    각 파일 read → 이 prompt로 rewrite → 덮어쓰기
#    옵션 (a) Claude Code에서 수동 batch
#    옵션 (b) OpenAI batch API (cheap)
#    옵션 (c) 로컬 LLM

# 4. wiki-reproject 재실행
pnpm exec tsx scripts/wiki-reproject.ts --workspace=jarvis
```

## 예상 비용 (1000 entity)

| 방식 | 비용 | 시간 |
|---|---|---|
| CLIProxy 구독 (gpt-5.4-mini) | $0 (Pro 할당) | 20-40분 |
| 직결 gpt-5.4-mini | ~$1 | 20-40분 |
| Claude Code 수동 | $0 | 반나절 |

#!/usr/bin/env python3
"""Build self-contained synth prompts for the infra pipeline.

Mirrors the TSVD999 pattern (`scripts/build-retry-prompts.py`): group the
parsed TSMT001 records into batches, emit one JSON file per batch plus one
self-contained Markdown prompt that a Claude Code executor subagent can
run. No external API access required; the subagent uses the caller's
Claude Code subscription.

Input  : data/infra/records.jsonl  (392 rows, plaintext OK per 2026-04-17 decision)
Outputs:
  data/infra/synth_batches/batch_NN.json       (N=15 rows each, max 27 batches)
  data/infra/synth_prompts/infra_NN.md         (one per batch, copy-paste runnable)
  data/infra/synth_prompts/README.md           (dispatch instructions)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

BATCH_SIZE = 15  # infra pages are large (full MEMO + ids + changelog) → smaller batches


def slugify(value: str) -> str:
    """Return a filesystem-safe slug (lowercase, Hangul allowed, separators to '-')."""
    if value is None:
        return "unknown"
    slug = value.strip().lower()
    slug = re.sub(r"[\s/\\:*?\"<>|]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-") or "unknown"


def output_path_for(record: dict) -> str:
    company = slugify(record.get("company_cd") or "unknown")
    env = slugify(record.get("env_type") or "none")
    connect = slugify(record.get("connect_cd") or "none")
    row_num = record.get("row_number")
    return f"wiki/jarvis/auto/infra/{company}/{env}-{connect}-row{row_num}.md"


def enrich(records: list[dict]) -> list[dict]:
    """Attach `output_path` to each record so the executor writes to the right file."""
    out = []
    for r in records:
        rec = dict(r)
        rec["output_path"] = output_path_for(rec)
        out.append(rec)
    return out


SYNTH_PROMPT_TEMPLATE = """# Jarvis TSMT001 infra-runbook synthesis — batch {NN}

Repo: `jarvis`. Plan: `docs/plan/2026-04-17-tsmt001-infra-pipeline.md`.

## Task

Read this batch file (relative to repo root):

    data/infra/synth_batches/batch_{NN}.json

It is a JSON array of {COUNT} system records parsed from `EXPORT_TABLE`. For EACH object, synthesize ONE Korean markdown page at the path given by the object's `output_path` field. Use `mkdir -p` if parent directories do not exist.

## Page structure (exact)

```
---
title: "<company_cd> <env_type> (<connect_cd>) 시스템 Runbook"
type: infra-runbook
authority: auto
sensitivity: INTERNAL
domain: infra
tags: ["domain/infra", "company/<company_slug>", "env/<env_type>"]
infra:
  enterCd: <enter_cd>
  companyCd: <company_cd>
  envType: "<env_type>"
  connectCd: "<connect_cd>"
  vpnFileSeq: <vpn_file_seq or null>
  domainAddr: "<domain_addr or null>"
  loginInfo: "<login_info or null>"
  svnAddr: "<svn_addr or null>"
  dbConnectInfo: "<db_connect_info or null>"
  dbUserInfo: "<db_user_info or null>"
  srcInfo: "<src_info or null>"
  classInfo: "<class_info or null>"
sources:
  - "TSMT001#row-<row_number>"
  - "TSMT001#line-<source_line>"
---

# <company_cd> <env_type> (<connect_cd>) 시스템 Runbook

## 한 줄 요약
<1 Korean sentence: 어떤 시스템인지, 어떻게 접속하는지>

## 접속 방법
<VPN / RDP / 웹 관리자 등 구체 절차. src_info · memo 에 나오는 절차 정리>
- 주소: <domain_addr>
- 접속 계정: <login_info 평문 그대로>

## 시스템 구성
- DB 접속: <db_connect_info>
- DB 계정: <db_user_info>
- 소스 경로: <src_info 에서 경로 부분만 추출>
- 클래스/WAR 경로: <class_info>
- SVN: <svn_addr>

## 배포 절차
<src_info · class_info · memo 에서 "패치"·"재기동"·"반영" 관련 문장 정리>

## 장애·변경 이력
<날짜(YYYY-MM-DD) + 담당자 + 이벤트 형태로 나열. 본문에 날짜가 섞여있으면 timeline 으로 구조화>

## 담당자
<본문에서 추출되는 담당자 이름·직급·연락처>

## 원문 메모 (정리 전)
<memo 필드를 그대로 blockquote 로 보존. LLM 이 정리 못 한 자유 기록 원본 보관용>
```

## Rules

- Korean content. 기술 용어·IP·URL·경로·계정 평문 모두 OK (인트라넷 전용, 모든 사용자 담당자 권한).
- Batch 에 들어있지 않은 정보는 만들지 말 것 (hallucination 금지).
- 각 섹션에서 데이터가 없으면 해당 섹션 헤더 바로 아래에 `(정보 없음)` 으로 표기 후 다음 섹션으로.
- 페이지 ≤ 600 줄. 원문이 길면 "원문 메모" 섹션에 블록인용으로 그대로 남김.
- 파일은 오직 `wiki/jarvis/auto/infra/` 아래로만 작성.

## Finish

모든 {COUNT} 시스템 처리 완료 후 한 줄로 회신:
`infra_batch_{NN}: N pages written`.

Tools needed: Read (batch file), Write (md files), Bash (`mkdir -p`).
"""


README_TEMPLATE = """# Infra synth prompt pack

Self-contained prompts for generating `wiki/jarvis/auto/infra/**/*.md` pages.
Each `.md` in this folder is a runnable instruction for a Claude Code executor subagent.

## Live counts

- Total records     : {TOTAL}
- Batch size        : {BATCH_SIZE}
- Prompts generated : {NUM_BATCHES}

## Dispatch from Claude Code (recommended)

In your Claude Code session, invoke the Agent tool with `subagent_type=executor` and paste
one prompt file's full contents as the task. Each subagent reads its own batch JSON from
`data/infra/synth_batches/batch_NN.json` and writes pages to `wiki/jarvis/auto/infra/...`.

Run multiple subagents in parallel to speed up (4-6 concurrent is safe).

## Manual use (one-off)

Copy any `infra_NN.md` into another tool with file access, or paste into a fresh Claude
Code session. The prompts are fully self-contained.

## Regenerate after updating records

```
py scripts/build-infra-prompts.py
```

Overwrites `synth_batches/` and `synth_prompts/`. Use this after re-parsing TSMT001.sql
or manually editing records.jsonl.

## Related

- Plan: `docs/plan/2026-04-17-tsmt001-infra-pipeline.md`
- Parser: `scripts/parse-tsmt001.py` (input → `data/infra/records.jsonl`)
- No sanitizer: per 2026-04-17 decision, plaintext credentials pass through verbatim.
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Build synth prompt pack for infra pipeline.")
    ap.add_argument("--input", type=Path, default=Path("data/infra/records.jsonl"))
    ap.add_argument("--batches", type=Path, default=Path("data/infra/synth_batches"))
    ap.add_argument("--prompts", type=Path, default=Path("data/infra/synth_prompts"))
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = ap.parse_args()

    if not args.input.exists():
        sys.stderr.write(f"[ERROR] input not found: {args.input}\n")
        return 1

    records = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    records = enrich(records)

    args.batches.mkdir(parents=True, exist_ok=True)
    args.prompts.mkdir(parents=True, exist_ok=True)
    for existing in list(args.batches.glob("batch_*.json")) + list(args.prompts.glob("infra_*.md")):
        existing.unlink()

    num_batches = (len(records) + args.batch_size - 1) // args.batch_size
    for i in range(num_batches):
        chunk = records[i * args.batch_size : (i + 1) * args.batch_size]
        nn = f"{i:02d}"
        (args.batches / f"batch_{nn}.json").write_text(
            json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (args.prompts / f"infra_{nn}.md").write_text(
            SYNTH_PROMPT_TEMPLATE.format(NN=nn, COUNT=len(chunk)), encoding="utf-8"
        )

    (args.prompts / "README.md").write_text(
        README_TEMPLATE.format(
            TOTAL=len(records),
            BATCH_SIZE=args.batch_size,
            NUM_BATCHES=num_batches,
        ),
        encoding="utf-8",
    )

    sys.stderr.write(
        f"[OK] {len(records)} records → {num_batches} batches "
        f"({args.batches}, {args.prompts})\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

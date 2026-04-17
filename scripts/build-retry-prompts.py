#!/usr/bin/env python3
"""Generate self-contained Markdown prompts for external execution.

Pairs each JSON batch under data/cases/{digest_batches_retry,company_batches,
monthly_batches,onboarding_batches} with a ready-to-paste prompt describing the
exact page schema and output paths.
"""

from __future__ import annotations

import json
from pathlib import Path


SYNTH_TEMPLATE = """# Jarvis TSVD999 synthesis — retry batch {NN}

Repo: `jarvis`. Plan: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md` sections B and D.

## Task

Read this batch file (relative to repo root):

    data/cases/digest_batches_retry/retry_{NN}.json

It is a JSON array of {COUNT} cluster digest inputs. For EACH object in the array, synthesize ONE Korean markdown page at the path given by the object's `output_path` field. Create parent directories with `mkdir -p` if they don't exist.

## Page structure (exact)

```
---
title: "<구체적 한국어 제목, 20~50자. label을 그대로 쓰지 말고 samples를 읽고 더 짧고 검색 가능한 자연어로.>"
type: synthesis
authority: auto
sensitivity: INTERNAL
domain: cases
module: "<module_higher> / <module_lower>"
tags: ["domain/cases", "cluster", "module/<module_lower_slug>"]
cases:
  clusterId: <cluster_id>
  parentClusterId: <parent_cluster_id or null>
  intermediateClusterId: <intermediate_cluster_id or null>
  caseCount: <case_count>
  moduleHigher: "<module_higher>"
  moduleLower: "<module_lower>"
  topCompanies: [<top_companies as YAML list>]
  meanWorkHours: <mean_work_hours or null>
  resolvedRate: <resolved_rate or null>
  timeRange: "<time_range>"
sources:
  - "<first sample source_key>"
  - "<second>"
  - "<third>"
---

# <same title as frontmatter>

## 한 줄 요약
<1 Korean sentence: 증상 → 표준 조치>

## 증상 패턴
- <3~5 concrete symptom bullets; ignore 인사말 like 안녕하세요, 감사합니다, 이수시스템입니다>

## 원인
- <1~3 root-cause bullets>

## 표준 조치
1. <first step>
2. <second>
3. <third>
(3~6 numbered steps total)

## 회사별 포인트
<1~2 companies from top_companies if samples show company-specific pattern. OMIT this entire section otherwise.>

## 대표 사례
- `<source_key>` — <20~40 char Korean summary>
(3~5 items from samples)

## 관련 메뉴 / 키워드
- <top_menus joined>
- <2~3 keywords extracted from samples>
```

## Rules

- Korean content only. English allowed for technical terms (menu names, DB table names, 프로그램명).
- Use ONLY data inside the batch file. Do NOT invent company names, dates, numbers, or menu paths.
- Skip the "회사별 포인트" section entirely if samples don't warrant it.
- Each page ≤ 300 lines.
- Write files ONLY under `wiki/jarvis/auto/syntheses/cases/`. Do not modify anything else.

## Finish

After processing ALL clusters in the batch, reply with ONE line: `batch_retry_{NN}: N pages written`.

Tools needed: Read (batch file), Write (md files), Bash (`mkdir -p`) only.
"""


COMPANY_TEMPLATE = """# Jarvis TSVD999 — company page batch {NN}

Plan: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md` section E.

## Task

Read: `data/cases/company_batches/batch_{NN}.json` — a JSON array of {COUNT} company aggregates.

For EACH company in the array, write ONE Korean markdown page to its `output_path` field. `mkdir -p` parent dirs as needed.

## Page structure

```
---
title: "<회사명> — 서비스데스크 패턴 요약"
type: synthesis
authority: auto
sensitivity: INTERNAL
domain: cases
tags: ["domain/cases", "company", "company/<company_slug>"]
cases:
  company: "<company>"
  caseCount: <case_count>
  topModules: [<top_modules labels>]
  meanWorkHours: <mean_work_hours or null>
  resolvedRate: <resolved_rate or null>
  timeRange: "<time_range>"
---

# <회사명>

## 헤더 통계
- 총 문의: <case_count>
- 기간: <time_range>
- 평균 work_hours: <mean_work_hours>
- 해결률: <resolved_rate>
- severity 분포: <severity_dist key: count ...>

## 주요 모듈
| 모듈 (higher / lower) | 건수 |
|---|---:|
<one row per item in top_modules>

## 주요 클러스터 TOP 10
- cluster-<id>: <label> — <count_in_company>건 (전체 <total_case_count>건)
(repeat for top_clusters)

## 자주 쓰는 메뉴
- <top_menus comma-joined, 1 line>

## 대표 사례
- `<source_key>` — <Korean title summary 20~40자>
(3~5 items drawn from samples)

## 특이 패턴 (LLM 노트)
<2~3 Korean sentences summarizing what makes this company distinctive based on samples. If no distinctive pattern, write "이 회사는 일반 모듈 분포를 따릅니다.">
```

## Rules
- Korean. Use ONLY batch data. No invented numbers.
- Write ONLY under `wiki/jarvis/auto/companies/`.
- After finishing all companies in the batch, reply: `company_batch_{NN}: N pages written`.
"""


MONTHLY_TEMPLATE = """# Jarvis TSVD999 — monthly report batch {NN}

Plan: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md` section F.

## Task

Read: `data/cases/monthly_batches/batch_{NN}.json` — JSON array of {COUNT} monthly aggregates.

For EACH month, write ONE Korean markdown page to its `output_path` field.

## Page structure

```
---
title: "<YYYY-MM> 사례 월간 리포트"
type: synthesis
authority: auto
sensitivity: INTERNAL
domain: cases
tags: ["domain/cases", "report", "monthly"]
cases:
  report: "monthly"
  month: "<month>"
  totalCases: <total_cases>
---

# <YYYY-MM> 사례 월간 리포트

## TL;DR
<3 Korean lines summarizing volume + biggest pattern + notable spike or new cluster>

## 모듈별 TOP 10
| 모듈 (lower) | 건수 |
|---|---:|
<rows from top_modules>

## 클러스터 TOP 10
- cluster-<id>: <label> — <count>건
(repeat for top_clusters)

## 회사별 TOP 10
- <company>: <count>건
(repeat for top_companies)

## 새로 등장한 cluster (≥5건)
- cluster-<id>: <label> — <count>건
(Skip this section if new_clusters is empty)

## 급증 패턴 (전월 대비 ≥2배, ≥20건)
- cluster-<id>: <label> — <count>건 (전월 <prev>건)
(Skip this section if spikes is empty)

## 지표
- 총 문의: <total_cases>
- 평균 work_hours: <mean_work_hours>
- severity 분포: <severity_dist>
- top 메뉴: <top_menus comma-joined>
```

## Rules
- Korean. Use ONLY batch data.
- Write ONLY under `wiki/jarvis/auto/reports/monthly/`.
- Skip sections with empty arrays.
- After finishing all months, reply: `monthly_batch_{NN}: N pages written`.
"""


ONBOARDING_TEMPLATE = """# Jarvis TSVD999 — SE onboarding (single batch)

Plan: `docs/plan/2026-04-17-tsvd999-wiki-pipeline.md` section G.

## Task

Read: `data/cases/onboarding_batches/batch_{NN}.json` — JSON array of {COUNT} module onboarding inputs.

For EACH module, write ONE Korean markdown page to its `output_path` field.

## Page structure

```
---
title: "신규 SE 온보딩 — <module_lower>"
type: synthesis
authority: auto
sensitivity: INTERNAL
domain: cases
tags: ["domain/cases", "onboarding", "module/<module_slug>"]
cases:
  onboarding: "se"
  moduleLower: "<module_lower>"
  moduleHigher: "<module_higher>"
  totalCases: <total_cases>
  learningPath:
    tier1: [<tier1 cluster_ids>]
    tier2: [<tier2 cluster_ids>]
    tier3: [<tier3 cluster_ids>]
---

# 신규 SE 온보딩 — <module_lower>

## 학습 순서
신규 담당자가 이 모듈의 문의를 처리하려면 아래 3단계 순서로 대표 사례를 읽으십시오.

### Tier 1 — 매일 나오는 핵심 (binge first)
1. cluster-<id>: <label> — <count>건
(repeat for tier1_binge_first)

### Tier 2 — 대표 다양성
1. cluster-<id>: <label> — <count>건
(repeat for tier2_representative)

### Tier 3 — 어려운 edge case
1. cluster-<id>: <label> — <count>건, 평균 work_hours <mean_work_hours>
(repeat for tier3_edge_cases)

## 자주 쓰는 메뉴
- <top_menus joined, up to 10 items>

## 참고
- 총 문의 건수: <total_cases>
- 학습 tier는 빈도·다양성·work_hours 기준으로 자동 선정됨.
- 각 cluster는 `wiki/jarvis/auto/syntheses/cases/.../cluster-<id>.md`에서 "표준 조치"를 확인하세요.
```

## Rules
- Korean. Use ONLY batch data.
- Write ONLY under `wiki/jarvis/auto/onboarding/se/`.
- After finishing all {COUNT} modules, reply: `onboarding_batch_{NN}: N pages written`.
"""


def main() -> None:
    prompt_dir = Path("data/cases/retry_prompts")
    prompt_dir.mkdir(parents=True, exist_ok=True)

    def write_for(pattern_dir: str, prefix: str, tpl: str) -> int:
        count = 0
        for path in sorted(Path(pattern_dir).glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            stem = path.stem
            for prefix_key in ("retry_", "batch_"):
                if stem.startswith(prefix_key):
                    nn = stem[len(prefix_key):]
                    break
            else:
                nn = stem
            out = prompt_dir / f"{prefix}_{nn}.md"
            out.write_text(
                tpl.format(NN=nn, COUNT=len(data)), encoding="utf-8"
            )
            count += 1
        return count

    synth_count = write_for("data/cases/digest_batches_retry", "synth", SYNTH_TEMPLATE)
    company_count = write_for("data/cases/company_batches", "company", COMPANY_TEMPLATE)
    monthly_count = write_for("data/cases/monthly_batches", "monthly", MONTHLY_TEMPLATE)
    onboarding_count = write_for("data/cases/onboarding_batches", "onboarding", ONBOARDING_TEMPLATE)

    print(
        json.dumps(
            {
                "synth_prompts": synth_count,
                "company_prompts": company_count,
                "monthly_prompts": monthly_count,
                "onboarding_prompts": onboarding_count,
                "total": synth_count + company_count + monthly_count + onboarding_count,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

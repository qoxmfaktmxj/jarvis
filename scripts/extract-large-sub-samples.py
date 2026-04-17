#!/usr/bin/env python3
"""Extract representative samples from large sub-clusters for LLM sub-labeling.

Phase K-2 of docs/plan/2026-04-17-tsvd999-wiki-pipeline.md.
Picks sub-clusters whose case_count > --min-size (default 500) and writes one
JSON file per cluster containing a deterministic stride sample.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def record_sort_key(record: dict[str, Any]) -> tuple[str, int]:
    source_key = str(record.get("source_key") or "")
    original_seq = record.get("original_seq")
    try:
        seq = int(original_seq)
    except (TypeError, ValueError):
        seq = 0
    return (source_key, seq)


def stride_sample(records: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    sorted_records = sorted(records, key=record_sort_key)
    n = len(sorted_records)
    if n <= count:
        return sorted_records
    step = n / count
    picked: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for i in range(count):
        idx = min(int(i * step), n - 1)
        record = sorted_records[idx]
        key = str(record.get("source_key"))
        offset = 0
        while key in seen_keys and idx + offset + 1 < n:
            offset += 1
            record = sorted_records[idx + offset]
            key = str(record.get("source_key"))
        seen_keys.add(key)
        picked.append(record)
    return picked


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="data/cases/normalized_cases.reclustered.jsonl")
    parser.add_argument("--clusters", default="data/cases/clusters_v2.json")
    parser.add_argument("--out-dir", default="data/cases/llm_sublabel_input")
    parser.add_argument("--min-size", type=int, default=500)
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--max-text-chars", type=int, default=1200)
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    clusters = json.loads(Path(args.clusters).read_text(encoding="utf-8-sig"))
    targets = sorted(
        (
            c
            for c in clusters
            if c.get("parent_cluster_id") is not None
            and int(c.get("case_count") or 0) > args.min_size
        ),
        key=lambda c: -int(c["case_count"]),
    )
    target_ids = {int(c["cluster_id"]): c for c in targets}

    rows_by_cluster: dict[int, list[dict[str, Any]]] = {cid: [] for cid in target_ids}
    with Path(args.cases).open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            cid = record.get("cluster_id")
            if cid is None:
                continue
            cid = int(cid)
            if cid in rows_by_cluster:
                rows_by_cluster[cid].append(record)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []

    for cid, meta in target_ids.items():
        rows = rows_by_cluster.get(cid, [])
        samples = stride_sample(rows, args.samples)
        simplified = []
        for sample in samples:
            simplified.append(
                {
                    "source_key": sample.get("source_key"),
                    "title": (sample.get("title") or "")[: args.max_text_chars],
                    "symptom": (sample.get("symptom") or "")[: args.max_text_chars],
                    "cause": (sample.get("cause") or "")[: args.max_text_chars],
                    "action": (sample.get("action") or "")[: args.max_text_chars],
                    "app_menu": sample.get("app_menu"),
                    "lower_category": sample.get("lower_category"),
                    "process_type": sample.get("process_type"),
                    "request_company": sample.get("request_company"),
                }
            )
        payload = {
            "cluster_id": cid,
            "parent_cluster_id": meta.get("parent_cluster_id"),
            "current_label": meta.get("label"),
            "case_count": meta.get("case_count"),
            "samples": simplified,
        }
        out_path = out_dir / f"cluster_{cid}.json"
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        manifest.append(
            {
                "cluster_id": cid,
                "parent_cluster_id": meta.get("parent_cluster_id"),
                "case_count": meta.get("case_count"),
                "samples_written": len(simplified),
                "path": str(out_path).replace("\\", "/"),
            }
        )

    manifest_path = out_dir / "_manifest.json"
    manifest_path.write_text(
        json.dumps({"targets": manifest, "total": len(manifest)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"targets": len(manifest), "rows_sampled": sum(m["samples_written"] for m in manifest)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Apply LLM-proposed sub-patterns back to the full dataset.

Phase K-2 of docs/plan/2026-04-17-tsvd999-wiki-pipeline.md: for each of the 15
oversized sub-clusters, subagents proposed 4~6 sub-patterns with anchor cases.
This script re-assigns every row within each target cluster to its nearest
sub-pattern by TF-IDF cosine similarity to the pattern's anchor centroid, then
writes clusters_v3.json and normalized_cases.v3.jsonl (additive schema).

No LLM calls, no DB writes.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
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


def case_text(record: dict[str, Any]) -> str:
    parts = [
        record.get("title"),
        record.get("lower_category"),
        record.get("app_menu"),
        record.get("symptom"),
        record.get("cause"),
        record.get("action"),
    ]
    return " | ".join(str(part).strip() for part in parts if part)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if not line.strip():
                continue
            records.append(json.loads(line))
    return records


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def assign_rows_to_patterns(
    rows: list[dict[str, Any]],
    patterns: list[dict[str, Any]],
    random_state: int,
) -> list[int]:
    """Return list of pattern-indices (one per row) using TF-IDF cosine to anchor centroids."""
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer

    all_texts = [case_text(r) for r in rows]
    key_to_idx = {str(r.get("source_key")): i for i, r in enumerate(rows)}

    tfidf = TfidfVectorizer(
        max_features=8000, min_df=1, max_df=0.95, sublinear_tf=True
    )
    matrix = tfidf.fit_transform(all_texts)
    matrix_normed = matrix / (
        np.sqrt(matrix.multiply(matrix).sum(axis=1)) + 1e-9
    )
    matrix_normed = matrix_normed.tocsr()

    centroids = []
    for pattern in patterns:
        anchor_indices = []
        for anchor_key in pattern.get("anchor_source_keys", []):
            idx = key_to_idx.get(anchor_key)
            if idx is not None:
                anchor_indices.append(idx)
        if not anchor_indices:
            centroids.append(None)
            continue
        centroid = matrix[anchor_indices].mean(axis=0)
        centroid = np.asarray(centroid).ravel()
        norm = float(np.linalg.norm(centroid))
        if norm > 0:
            centroid = centroid / norm
        centroids.append(centroid)

    valid_pattern_indices = [i for i, c in enumerate(centroids) if c is not None]
    if not valid_pattern_indices:
        return [0] * len(rows)

    centroid_stack = np.stack(
        [centroids[i] for i in valid_pattern_indices], axis=0
    )

    assignments: list[int] = []
    dense_matrix = matrix_normed.toarray()
    sims = dense_matrix @ centroid_stack.T  # (n_rows, n_valid_patterns)
    best_valid = sims.argmax(axis=1)
    for best in best_valid:
        assignments.append(valid_pattern_indices[int(best)])
    return assignments


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="data/cases/normalized_cases.reclustered.jsonl")
    parser.add_argument("--clusters", default="data/cases/clusters_v2.json")
    parser.add_argument("--input-dir", default="data/cases/llm_sublabel_input")
    parser.add_argument("--output-dir", default="data/cases/llm_sublabel_output")
    parser.add_argument("--cases-output", default="data/cases/normalized_cases.v3.jsonl")
    parser.add_argument("--clusters-output", default="data/cases/clusters_v3.json")
    parser.add_argument("--audit-output", default="data/cases/llm_relabel_audit.md")
    parser.add_argument("--new-id-start", type=int, default=10000)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    records = read_jsonl(Path(args.cases))
    clusters = json.loads(Path(args.clusters).read_text(encoding="utf-8-sig"))

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    target_payloads: dict[int, dict[str, Any]] = {}
    for out_path in sorted(output_dir.glob("cluster_*.json")):
        proposal = json.loads(out_path.read_text(encoding="utf-8-sig"))
        cid = int(proposal["cluster_id"])
        target_payloads[cid] = proposal

    target_ids = set(target_payloads.keys())
    cluster_index = {int(c["cluster_id"]): c for c in clusters}

    rows_by_cluster: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        cid = record.get("cluster_id")
        if cid is None:
            continue
        rows_by_cluster[int(cid)].append(record)

    new_records: list[dict[str, Any]] = []
    new_clusters: list[dict[str, Any]] = []
    next_new_id = args.new_id_start
    audit_lines: list[str] = []
    audit_lines.append("# LLM Relabel Audit (K-2)")
    audit_lines.append("")
    audit_lines.append(
        f"Targets: {len(target_ids)} intermediate sub-clusters | "
        f"new_id_start: {next_new_id}"
    )
    audit_lines.append("")

    for target_id in sorted(target_ids):
        proposal = target_payloads[target_id]
        patterns = proposal.get("sub_patterns", [])
        parent_id = int(proposal.get("parent_cluster_id") or cluster_index.get(target_id, {}).get("parent_cluster_id") or 0)
        target_rows = rows_by_cluster.get(target_id, [])
        old_label = cluster_index.get(target_id, {}).get("label", "")

        if not patterns or not target_rows:
            continue

        assignments = assign_rows_to_patterns(
            target_rows, patterns, args.random_state
        )

        rows_by_pattern: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row, pat_idx in zip(target_rows, assignments):
            rows_by_pattern[pat_idx].append(row)

        first_new_id = next_new_id
        pattern_new_ids: dict[int, int] = {}
        for pat_idx, _pattern in enumerate(patterns):
            pattern_new_ids[pat_idx] = next_new_id
            next_new_id += 1

        audit_lines.append(f"## Intermediate cluster {target_id} (parent {parent_id}) — {len(target_rows)} rows")
        audit_lines.append("")
        audit_lines.append(f"Old label: `{old_label}`")
        audit_lines.append("")
        audit_lines.append(f"New ids: {first_new_id}..{next_new_id - 1}")
        audit_lines.append("")
        audit_lines.append("| new_id | case_count | pattern name |")
        audit_lines.append("|--------|------------|--------------|")

        for pat_idx, pattern in enumerate(patterns):
            pat_rows = rows_by_pattern.get(pat_idx, [])
            new_id = pattern_new_ids[pat_idx]
            if not pat_rows:
                audit_lines.append(f"| {new_id} | 0 | {pattern.get('name', '')} (EMPTY) |")
                continue
            sorted_pat_rows = sorted(pat_rows, key=record_sort_key)
            digest_row = sorted_pat_rows[0]
            top_symptoms = [
                value
                for value, _count in Counter(
                    r.get("symptom") for r in pat_rows if r.get("symptom")
                ).most_common(5)
            ]
            top_actions = [
                value
                for value, _count in Counter(
                    r.get("action") for r in pat_rows if r.get("action")
                ).most_common(5)
            ]
            label = pattern.get("name") or f"sub-{new_id}"
            description = pattern.get("description") or label
            new_clusters.append(
                {
                    "cluster_id": new_id,
                    "label": label,
                    "description": description,
                    "case_count": len(pat_rows),
                    "digest_source_key": digest_row.get("source_key"),
                    "digest_original_seq": digest_row.get("original_seq"),
                    "top_symptoms": top_symptoms,
                    "top_actions": top_actions,
                    "parent_cluster_id": parent_id,
                    "intermediate_cluster_id": target_id,
                    "anchor_source_keys": pattern.get("anchor_source_keys", []),
                }
            )
            for row in pat_rows:
                updated = dict(row)
                updated["cluster_id"] = new_id
                updated["cluster_label"] = label
                updated["parent_cluster_id"] = parent_id
                updated["intermediate_cluster_id"] = target_id
                updated["is_digest"] = row.get("source_key") == digest_row.get("source_key")
                new_records.append(updated)
            audit_lines.append(
                f"| {new_id} | {len(pat_rows)} | {label} |"
            )
        audit_lines.append("")

    for cid, existing in cluster_index.items():
        if cid in target_ids:
            continue
        new_clusters.append(dict(existing))
        new_records.extend(rows_by_cluster.get(cid, []))

    new_records.sort(key=record_sort_key)
    new_clusters.sort(key=lambda c: int(c["cluster_id"]))

    total_new_sub_clusters = next_new_id - args.new_id_start
    max_size = max((int(c["case_count"]) for c in new_clusters), default=0)
    summary = {
        "input_rows": len(records),
        "output_rows": len(new_records),
        "v2_clusters": len(clusters),
        "v3_clusters": len(new_clusters),
        "relabeled_targets": len(target_ids),
        "new_llm_clusters": total_new_sub_clusters,
        "max_cluster_size": max_size,
    }
    audit_lines.insert(
        3, f"**Summary:** {json.dumps(summary, ensure_ascii=False)}"
    )
    audit_lines.insert(4, "")

    write_jsonl(Path(args.cases_output), new_records)
    Path(args.clusters_output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.clusters_output).write_text(
        json.dumps(new_clusters, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    Path(args.audit_output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.audit_output).write_text("\n".join(audit_lines) + "\n", encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

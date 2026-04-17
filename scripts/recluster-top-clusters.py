#!/usr/bin/env python3
"""Re-split the largest parent clusters without touching DB or wiki-fs.

Phase A of docs/plan/2026-04-17-tsvd999-wiki-pipeline.md.
No LLM calls, no DB writes, no wiki page creation.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


WARN_MAX_CLUSTER_SIZE = 500


class ReclusterResult:
    __slots__ = ("records", "clusters")

    def __init__(
        self,
        records: list[dict[str, Any]] | None = None,
        clusters: list[dict[str, Any]] | None = None,
    ) -> None:
        self.records = records if records is not None else []
        self.clusters = clusters if clusters is not None else []


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line_no, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{line_no}") from exc
    return records


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


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


def _select_digest_index(records: list[dict[str, Any]]) -> int:
    return min(range(len(records)), key=lambda i: record_sort_key(records[i]))


def _build_label(parent_label: str, top_terms: list[str]) -> str:
    terms_part = "+".join(top_terms[:3]) if top_terms else "subcluster"
    return f"{parent_label} | {terms_part}"


def select_parent_cluster_ids(
    clusters: list[dict[str, Any]],
    top_n: int,
    min_parent_size: int,
) -> set[int]:
    """Pick top_n parent cluster ids whose case_count >= min_parent_size."""
    candidates = [
        (int(c["cluster_id"]), int(c.get("case_count") or 0))
        for c in clusters
        if int(c.get("case_count") or 0) >= min_parent_size
    ]
    candidates.sort(key=lambda pair: (-pair[1], pair[0]))
    return {cid for cid, _sz in candidates[:top_n]}


def _split_one_parent(
    parent_records: list[dict[str, Any]],
    parent_id: int,
    parent_label: str,
    target_cluster_size: int,
    min_cluster_size: int,
    new_id_start: int,
    random_state: int,
    min_df: float | int,
    max_df: float,
    stop_words: list[str] | None,
) -> tuple[list[tuple[dict[str, Any], int]], list[dict[str, Any]]]:
    """Split one parent cluster into deterministic sub-clusters via TF-IDF + MiniBatchKMeans.

    Returns:
        assignments: list of (record, new_cluster_id), same length as parent_records (sorted).
        sub_cluster_dicts: list of cluster metadata dicts in ascending new cluster_id order.
    """
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.feature_extraction.text import TfidfVectorizer

    sorted_records = sorted(parent_records, key=record_sort_key)
    n_records = len(sorted_records)
    texts = [case_text(record) for record in sorted_records]

    n_clusters = max(2, n_records // max(target_cluster_size, 1))
    n_clusters = min(n_clusters, max(2, n_records // max(min_cluster_size, 1)))
    n_clusters = min(n_clusters, n_records)

    sub_labels: list[int]
    top_terms_per_sub: dict[int, list[str]]

    try:
        safe_min_df = min_df if isinstance(min_df, int) or min_df >= 1 else float(min_df)
        if isinstance(safe_min_df, int) and safe_min_df > n_records:
            safe_min_df = 1
        tfidf = TfidfVectorizer(
            max_features=8000,
            min_df=safe_min_df,
            max_df=max_df,
            sublinear_tf=True,
            stop_words=list(stop_words) if stop_words else None,
        )
        matrix = tfidf.fit_transform(texts)
        kmeans = MiniBatchKMeans(
            n_clusters=n_clusters,
            random_state=random_state,
            batch_size=min(1024, n_records),
            n_init=3,
        )
        raw_sub_labels = [int(label) for label in kmeans.fit_predict(matrix)]
        feature_names = tfidf.get_feature_names_out()
        centers = kmeans.cluster_centers_
        top_terms_per_sub = {}
        for sub_id in range(n_clusters):
            order = centers[sub_id].argsort()[::-1][:5]
            top_terms_per_sub[sub_id] = [str(feature_names[idx]) for idx in order if idx < len(feature_names)]
        sub_labels = raw_sub_labels
    except ValueError:
        sub_labels = [0] * n_records
        top_terms_per_sub = {0: []}

    sub_counts = Counter(sub_labels)
    if len(sub_counts) > 1:
        small_subs = {sl for sl, cnt in sub_counts.items() if cnt < min_cluster_size}
        if small_subs and len(sub_counts) > len(small_subs):
            survivors = sorted(sl for sl in sub_counts if sl not in small_subs)
            absorber = survivors[0]
            sub_labels = [absorber if sl in small_subs else sl for sl in sub_labels]

    sub_to_records: dict[int, list[int]] = defaultdict(list)
    for idx, sl in enumerate(sub_labels):
        sub_to_records[sl].append(idx)

    sub_order = sorted(
        sub_to_records.keys(),
        key=lambda sl: record_sort_key(sorted_records[sub_to_records[sl][0]]),
    )

    assignments: list[tuple[dict[str, Any], int]] = []
    sub_cluster_dicts: list[dict[str, Any]] = []
    for offset, sub_label in enumerate(sub_order):
        new_id = new_id_start + offset
        member_indices = sub_to_records[sub_label]
        members = [sorted_records[idx] for idx in member_indices]
        digest_local = _select_digest_index(members)
        digest = members[digest_local]
        top_terms = top_terms_per_sub.get(sub_label, [])
        label = _build_label(parent_label, top_terms)
        top_symptoms = [
            value
            for value, _count in Counter(
                m.get("symptom") for m in members if m.get("symptom")
            ).most_common(5)
        ]
        top_actions = [
            value
            for value, _count in Counter(
                m.get("action") for m in members if m.get("action")
            ).most_common(5)
        ]
        sub_cluster_dicts.append(
            {
                "cluster_id": new_id,
                "label": label,
                "description": label,
                "case_count": len(members),
                "digest_source_key": digest.get("source_key"),
                "digest_original_seq": digest.get("original_seq"),
                "top_symptoms": top_symptoms,
                "top_actions": top_actions,
                "parent_cluster_id": parent_id,
            }
        )
        for member in members:
            assignments.append((member, new_id))

    return assignments, sub_cluster_dicts


def _refresh_untouched(
    cluster_id: int,
    members_in_cluster: list[dict[str, Any]],
    original_meta: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sorted_members = sorted(members_in_cluster, key=record_sort_key)
    digest_idx = _select_digest_index(sorted_members) if sorted_members else 0
    digest = sorted_members[digest_idx] if sorted_members else {}
    refreshed_rows: list[dict[str, Any]] = []
    for idx, member in enumerate(sorted_members):
        updated = dict(member)
        updated.pop("parent_cluster_id", None)
        updated["is_digest"] = idx == digest_idx
        refreshed_rows.append(updated)
    base_meta = dict(original_meta or {"cluster_id": cluster_id})
    base_meta["cluster_id"] = cluster_id
    base_meta["case_count"] = len(sorted_members)
    base_meta["digest_source_key"] = digest.get("source_key")
    base_meta["digest_original_seq"] = digest.get("original_seq")
    base_meta.pop("parent_cluster_id", None)
    base_meta.setdefault("label", f"cluster-{cluster_id}")
    base_meta.setdefault("description", base_meta["label"])
    base_meta.setdefault("top_symptoms", [])
    base_meta.setdefault("top_actions", [])
    return refreshed_rows, base_meta


def recluster_top_clusters(
    records: list[dict[str, Any]],
    clusters: list[dict[str, Any]],
    *,
    parent_cluster_ids: set[int] | Iterable[int],
    target_cluster_size: int,
    min_cluster_size: int,
    new_id_start: int,
    random_state: int,
    min_df: float | int = 1,
    max_df: float = 0.95,
    stop_words: list[str] | None = None,
) -> ReclusterResult:
    """Re-split parents listed in parent_cluster_ids, keep others untouched."""
    parent_set = {int(pid) for pid in parent_cluster_ids}
    cluster_index = {int(c["cluster_id"]): c for c in clusters}

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        cid = record.get("cluster_id")
        if cid is None:
            continue
        grouped[int(cid)].append(record)

    new_records: list[dict[str, Any]] = []
    new_clusters: list[dict[str, Any]] = []
    next_id = new_id_start

    for parent_id in sorted(parent_set):
        parent_records = grouped.get(parent_id, [])
        if not parent_records:
            continue
        parent_meta = cluster_index.get(parent_id, {})
        parent_label = str(parent_meta.get("label") or f"cluster-{parent_id}")
        assignments, sub_cluster_dicts = _split_one_parent(
            parent_records,
            parent_id,
            parent_label,
            target_cluster_size,
            min_cluster_size,
            next_id,
            random_state,
            min_df,
            max_df,
            stop_words,
        )
        next_id += len(sub_cluster_dicts)
        new_clusters.extend(sub_cluster_dicts)

        digest_keys_per_new = {
            cluster["cluster_id"]: cluster["digest_source_key"]
            for cluster in sub_cluster_dicts
        }
        label_per_new = {
            cluster["cluster_id"]: cluster["label"] for cluster in sub_cluster_dicts
        }
        for original_record, new_id in assignments:
            updated = dict(original_record)
            updated["cluster_id"] = int(new_id)
            updated["parent_cluster_id"] = int(parent_id)
            updated["cluster_label"] = label_per_new[new_id]
            updated["is_digest"] = (
                updated.get("source_key") == digest_keys_per_new.get(new_id)
            )
            new_records.append(updated)

    untouched_ids = sorted(cid for cid in grouped.keys() if cid not in parent_set)
    for cid in untouched_ids:
        refreshed_rows, refreshed_meta = _refresh_untouched(
            cid, grouped[cid], cluster_index.get(cid)
        )
        new_clusters.append(refreshed_meta)
        new_records.extend(refreshed_rows)

    new_records.sort(key=record_sort_key)
    new_clusters.sort(key=lambda c: int(c["cluster_id"]))
    return ReclusterResult(records=new_records, clusters=new_clusters)


def build_spot_check_samples(
    records: list[dict[str, Any]],
    parent_cluster_ids: set[int] | Iterable[int],
    per_parent: int,
    random_state: int,
) -> list[dict[str, Any]]:
    """Return up to `per_parent` samples per parent, round-robin across sub-clusters."""
    parent_set = {int(pid) for pid in parent_cluster_ids}
    samples: list[dict[str, Any]] = []
    for parent_id in sorted(parent_set):
        by_sub: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for record in records:
            if int(record.get("parent_cluster_id") or -1) == parent_id:
                by_sub[int(record["cluster_id"])].append(record)
        sub_keys = sorted(by_sub.keys())
        for sub_id in sub_keys:
            by_sub[sub_id].sort(key=record_sort_key)

        picked: list[dict[str, Any]] = []
        while len(picked) < per_parent and any(by_sub[k] for k in sub_keys):
            for sub_id in sub_keys:
                if len(picked) >= per_parent:
                    break
                if by_sub[sub_id]:
                    picked.append(by_sub[sub_id].pop(0))

        for record in picked:
            samples.append(
                {
                    "source_key": record.get("source_key"),
                    "parent_cluster_id": parent_id,
                    "cluster_id": int(record["cluster_id"]),
                    "symptom": record.get("symptom"),
                    "action": record.get("action"),
                    "title": record.get("title"),
                }
            )
    return samples


def generate_spot_check_md(
    samples: list[dict[str, Any]],
    clusters: list[dict[str, Any]],
    parent_cluster_ids: set[int] | Iterable[int],
    per_parent: int,
) -> str:
    parent_set = sorted(int(pid) for pid in parent_cluster_ids)
    cluster_index = {int(c["cluster_id"]): c for c in clusters}
    samples_by_parent: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for sample in samples:
        samples_by_parent[int(sample["parent_cluster_id"])].append(sample)

    lines: list[str] = []
    lines.append("# Recluster Spot Check")
    lines.append("")
    lines.append(
        f"Parents re-split: {parent_set} | total samples: {len(samples)} | "
        f"per parent: {per_parent}"
    )
    lines.append("")
    lines.append(
        "Read each sample and mark `[x] OK` if the sub-cluster's grouping is coherent, "
        "`[x] NG` otherwise. Gate to next phase: ≥40 of 50 samples OK."
    )
    lines.append("")

    for parent_id in parent_set:
        lines.append("---")
        lines.append("")
        lines.append(f"## parent_cluster_id: {parent_id}")
        lines.append("")
        parent_samples = samples_by_parent.get(parent_id, [])
        for idx, sample in enumerate(parent_samples, start=1):
            cluster_meta = cluster_index.get(int(sample["cluster_id"]), {})
            label = str(cluster_meta.get("label") or "")
            title = (sample.get("title") or "").replace("\n", " ").strip()[:120]
            symptom = (sample.get("symptom") or "").replace("\n", " ").strip()[:200]
            action = (sample.get("action") or "").replace("\n", " ").strip()[:200]
            lines.append(
                f"{idx}. cluster_id: {sample['cluster_id']} | source_key: `{sample['source_key']}`"
            )
            if label:
                lines.append(f"   - label: {label}")
            if title:
                lines.append(f"   - 제목: {title}")
            lines.append(f"   - 증상: {symptom}")
            lines.append(f"   - 조치: {action}")
        lines.append("")
        lines.append("Verdict:")
        lines.append("- [ ] OK")
        lines.append("- [ ] NG")
        lines.append("- 사유:")
        lines.append("")

    return "\n".join(lines) + "\n"


def parse_stopwords(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    words = [word.strip() for word in raw.split(",") if word.strip()]
    return words or None


def parse_min_df(raw: str) -> float | int:
    try:
        as_int = int(raw)
        if str(as_int) == raw:
            return as_int
    except ValueError:
        pass
    return float(raw)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Re-split top N giant parent clusters in-place via TF-IDF + MiniBatchKMeans. "
            "Reads clustered jsonl + clusters.json, writes _v2 outputs and a spot-check markdown."
        )
    )
    parser.add_argument("--cases", default="data/cases/normalized_cases.clustered.jsonl")
    parser.add_argument("--clusters", default="data/cases/clusters.json")
    parser.add_argument(
        "--cases-output", default="data/cases/normalized_cases.reclustered.jsonl"
    )
    parser.add_argument("--clusters-output", default="data/cases/clusters_v2.json")
    parser.add_argument(
        "--spot-check-output", default="data/cases/recluster_spot_check.md"
    )
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--min-parent-size", type=int, default=1000)
    parser.add_argument("--target-cluster-size", type=int, default=80)
    parser.add_argument("--min-cluster-size", type=int, default=10)
    parser.add_argument("--new-id-start", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--samples-per-parent", type=int, default=5)
    parser.add_argument(
        "--min-df",
        type=parse_min_df,
        default=1,
        help="TF-IDF min_df. Integer -> absolute doc count, float -> proportion.",
    )
    parser.add_argument(
        "--max-df",
        type=float,
        default=0.95,
        help="TF-IDF max_df proportion (drops terms appearing in >= this fraction of docs).",
    )
    parser.add_argument(
        "--stopwords",
        default="",
        help="Comma-separated token list removed by TF-IDF before clustering.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip writing outputs; only print stats and warnings.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    cases_path = Path(args.cases)
    clusters_path = Path(args.clusters)
    if not cases_path.exists():
        print(f"ERROR: cases file not found: {cases_path}", file=sys.stderr)
        return 2
    if not clusters_path.exists():
        print(f"ERROR: clusters file not found: {clusters_path}", file=sys.stderr)
        return 2

    records = read_jsonl(cases_path)
    clusters = json.loads(clusters_path.read_text(encoding="utf-8-sig"))

    parent_cluster_ids = select_parent_cluster_ids(
        clusters, args.top_n, args.min_parent_size
    )
    stop_words = parse_stopwords(args.stopwords)

    result = recluster_top_clusters(
        records,
        clusters,
        parent_cluster_ids=parent_cluster_ids,
        target_cluster_size=args.target_cluster_size,
        min_cluster_size=args.min_cluster_size,
        new_id_start=args.new_id_start,
        random_state=args.random_state,
        min_df=args.min_df,
        max_df=args.max_df,
        stop_words=stop_words,
    )
    samples = build_spot_check_samples(
        result.records,
        parent_cluster_ids=parent_cluster_ids,
        per_parent=args.samples_per_parent,
        random_state=args.random_state,
    )

    max_size = max((int(c["case_count"]) for c in result.clusters), default=0)
    split_count = sum(1 for c in result.clusters if c.get("parent_cluster_id") is not None)
    summary = {
        "input_rows": len(records),
        "output_rows": len(result.records),
        "input_clusters": len(clusters),
        "output_clusters": len(result.clusters),
        "split_parents": sorted(parent_cluster_ids),
        "split_sub_clusters": split_count,
        "untouched_clusters": len(result.clusters) - split_count,
        "max_cluster_size": max_size,
        "stopwords": len(stop_words or []),
        "min_df": args.min_df,
        "max_df": args.max_df,
        "dry_run": bool(args.dry_run),
    }
    print(json.dumps(summary, ensure_ascii=False))
    if max_size > WARN_MAX_CLUSTER_SIZE:
        print(
            f"WARNING: max cluster size={max_size} still > {WARN_MAX_CLUSTER_SIZE}. "
            "Consider LLM-aided sub-clustering (plan doc K-2).",
            file=sys.stderr,
        )

    if args.dry_run:
        return 0

    write_jsonl(Path(args.cases_output), result.records)
    Path(args.clusters_output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.clusters_output).write_text(
        dumps_json(result.clusters) + "\n", encoding="utf-8"
    )
    Path(args.spot_check_output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.spot_check_output).write_text(
        generate_spot_check_md(
            samples, result.clusters, parent_cluster_ids, args.samples_per_parent
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

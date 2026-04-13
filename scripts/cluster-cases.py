#!/usr/bin/env python3
"""Embed and cluster normalized TSVD999 case JSONL records."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np


DEFAULT_EMBED_MODEL = "text-embedding-3-small"
DEFAULT_LABEL_MODEL = "gpt-4.1-mini"
DEFAULT_DIMENSIONS = 1536


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


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 1.0
    return 1.0 - float(np.dot(a, b) / denom)


def select_digest_case(records: list[dict[str, Any]]) -> dict[str, Any]:
    if not records:
        raise ValueError("Cannot select digest from empty cluster")
    if not all(isinstance(record.get("embedding"), list) for record in records):
        return sorted(records, key=record_sort_key)[0]
    vectors = np.array([record["embedding"] for record in records], dtype=float)
    centroid = vectors.mean(axis=0)
    distances = [float(np.linalg.norm(vector - centroid)) for vector in vectors]
    return records[int(np.argmin(distances))]


def fallback_labels(records: list[dict[str, Any]]) -> list[int]:
    keys = [
        "|".join(
            str(record.get(field) or "").strip()
            for field in ("lower_category", "process_type", "app_menu")
        )
        for record in records
    ]
    buckets = {key: index for index, key in enumerate(sorted(set(keys)))}
    return [buckets[key] for key in keys]


def tfidf_labels(
    records: list[dict[str, Any]],
    target_cluster_size: int = 30,
    min_cluster_size: int = 3,
) -> list[int]:
    """TF-IDF + KMeans 기반 2-level 클러스터링.

    Level 1: lower_category 로 1차 그룹핑 (51개 내외)
    Level 2: 그룹 크기 > target_cluster_size 면 TF-IDF + MiniBatchKMeans
    """
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.feature_extraction.text import TfidfVectorizer

    # Level 1: lower_category 그룹핑
    groups: dict[str, list[int]] = defaultdict(list)
    for idx, record in enumerate(records):
        cat = str(record.get("lower_category") or "미분류").strip()
        groups[cat].append(idx)

    labels = [0] * len(records)
    next_cluster = 0

    for cat, indices in sorted(groups.items(), key=lambda x: x[0]):
        if len(indices) <= target_cluster_size:
            # 소그룹 → 하나의 클러스터
            for idx in indices:
                labels[idx] = next_cluster
            next_cluster += 1
            continue

        # Level 2: TF-IDF + KMeans
        texts = [case_text(records[idx]) for idx in indices]
        n_clusters = max(2, len(indices) // target_cluster_size)

        try:
            tfidf = TfidfVectorizer(
                max_features=8000,
                min_df=2,
                max_df=0.95,
                sublinear_tf=True,
            )
            X = tfidf.fit_transform(texts)
            kmeans = MiniBatchKMeans(
                n_clusters=n_clusters,
                random_state=42,
                batch_size=min(1024, len(indices)),
                n_init=3,
            )
            sub_labels = kmeans.fit_predict(X)
        except ValueError:
            # TF-IDF 실패 (vocabulary too small 등) → 단일 클러스터
            sub_labels = [0] * len(indices)
            n_clusters = 1

        # 소형 서브클러스터(< min_cluster_size) → 가장 가까운 클러스터에 병합
        sub_counts = Counter(sub_labels)
        small_subs = {k for k, v in sub_counts.items() if v < min_cluster_size}
        if small_subs and len(sub_counts) > len(small_subs):
            # 큰 클러스터 중 가장 가까운 것에 합침
            large_labels = sorted(k for k in sub_counts if k not in small_subs)
            for i, sl in enumerate(sub_labels):
                if sl in small_subs:
                    sub_labels[i] = large_labels[0]  # 첫 번째 대형에 합류

        # 글로벌 라벨에 매핑
        remap = {}
        for sl in sorted(set(sub_labels)):
            remap[sl] = next_cluster
            next_cluster += 1
        for i, idx in enumerate(indices):
            labels[idx] = remap[sub_labels[i]]

    return labels


def hdbscan_labels(embeddings: list[list[float]], min_cluster_size: int, min_samples: int) -> list[int]:
    try:
        from sklearn.cluster import HDBSCAN
    except ImportError as exc:
        raise RuntimeError("scikit-learn with HDBSCAN is not installed") from exc
    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="cosine",
        cluster_selection_method="eom",
    )
    return [int(label) for label in clusterer.fit_predict(np.array(embeddings, dtype=float))]


def deterministic_cluster_label(records: list[dict[str, Any]]) -> str:
    lower = Counter(record.get("lower_category") for record in records if record.get("lower_category"))
    process = Counter(record.get("process_type") for record in records if record.get("process_type"))
    tags = Counter(tag for record in records for tag in record.get("tags", []) if tag)
    pieces = [
        lower.most_common(1)[0][0] if lower else None,
        process.most_common(1)[0][0] if process else None,
        tags.most_common(1)[0][0] if tags else None,
    ]
    return " / ".join(str(piece) for piece in pieces if piece) or "미분류 사례"


async def label_with_openai(client: Any, records: list[dict[str, Any]], model: str) -> str:
    examples = "\n".join(
        f"- {record.get('title', '')}: {record.get('symptom') or ''} -> {record.get('action') or ''}"
        for record in records[:5]
    )
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "유지보수 사례 묶음을 20자 안팎의 한국어 클러스터 라벨 하나로 요약하세요.",
            },
            {"role": "user", "content": examples},
        ],
        temperature=0.1,
        max_tokens=60,
    )
    label = response.choices[0].message.content or ""
    return label.strip().strip('"')[:200] or deterministic_cluster_label(records)


async def embed_missing(records: list[dict[str, Any]], args: argparse.Namespace) -> None:
    missing = [record for record in records if not record.get("embedding")]
    if not missing:
        return
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:
        raise SystemExit(
            "Missing Python package 'openai'. Install it or provide records with precomputed embedding arrays."
        ) from exc

    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    semaphore = asyncio.Semaphore(args.concurrency)

    async def embed_one(record: dict[str, Any]) -> None:
        async with semaphore:
            response = await client.embeddings.create(
                model=args.embed_model,
                input=case_text(record)[:8000],
                dimensions=args.dimensions,
            )
            record["embedding"] = response.data[0].embedding

    await asyncio.gather(*(embed_one(record) for record in missing))


async def build_clusters(records: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    records.sort(key=record_sort_key)
    if args.method == "hdbscan":
        await embed_missing(records, args)
        embedded = [record for record in records if isinstance(record.get("embedding"), list)]
        if not embedded:
            raise ValueError("No embeddings available for HDBSCAN clustering")
        try:
            raw_labels = hdbscan_labels(
                [record["embedding"] for record in embedded],
                args.min_cluster_size,
                args.min_samples,
            )
        except RuntimeError:
            if not args.allow_fallback:
                raise
            embedded = records
            raw_labels = fallback_labels(embedded)
    elif args.method == "tfidf":
        embedded = records
        raw_labels = tfidf_labels(
            embedded,
            target_cluster_size=args.target_cluster_size,
            min_cluster_size=args.min_cluster_size,
        )
    else:
        embedded = records
        raw_labels = fallback_labels(embedded)

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record, label in zip(embedded, raw_labels, strict=True):
        if label < 0:
            continue
        grouped[int(label)].append(record)

    openai_client = None
    if args.label_with_llm:
        try:
            from openai import AsyncOpenAI

            openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        except ImportError as exc:
            raise SystemExit("Missing Python package 'openai' for --label-with-llm.") from exc

    clusters: list[dict[str, Any]] = []
    for cluster_id, members in sorted(grouped.items(), key=lambda item: item[0]):
        digest = select_digest_case(members)
        label = (
            await label_with_openai(openai_client, members, args.label_model)
            if openai_client
            else deterministic_cluster_label(members)
        )
        top_symptoms = [
            value
            for value, _count in Counter(
                record.get("symptom") for record in members if record.get("symptom")
            ).most_common(5)
        ]
        top_actions = [
            value
            for value, _count in Counter(
                record.get("action") for record in members if record.get("action")
            ).most_common(5)
        ]
        for member in members:
            member["cluster_id"] = cluster_id
            member["cluster_label"] = label
            member["is_digest"] = member is digest
        clusters.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "description": label,
                "case_count": len(members),
                "digest_source_key": digest.get("source_key"),
                "digest_original_seq": digest.get("original_seq"),
                "top_symptoms": top_symptoms,
                "top_actions": top_actions,
            }
        )
    return clusters


async def run(args: argparse.Namespace) -> int:
    started = time.time()
    input_path = Path(args.input)
    records = read_jsonl(input_path)
    if args.limit:
        records = records[: args.limit]
    clusters = await build_clusters(records, args)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(dumps_json(clusters) + "\n", encoding="utf-8")
    write_jsonl(Path(args.cases_output), records)
    print(
        json.dumps(
            {
                "cases": len(records),
                "clusters": len(clusters),
                "seconds": math.floor((time.time() - started) * 100) / 100,
            },
            ensure_ascii=False,
        )
    )
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cluster normalized TSVD999 case JSONL records.")
    parser.add_argument("--input", default="data/cases/normalized_cases.jsonl")
    parser.add_argument("--output", default="data/cases/clusters.json")
    parser.add_argument("--cases-output", default="data/cases/normalized_cases.clustered.jsonl")
    parser.add_argument("--method", choices=["hdbscan", "fallback", "tfidf"], default="hdbscan")
    parser.add_argument("--allow-fallback", action="store_true", help="Use category/menu buckets if HDBSCAN is unavailable.")
    parser.add_argument("--label-with-llm", action="store_true")
    parser.add_argument("--embed-model", default=DEFAULT_EMBED_MODEL)
    parser.add_argument("--label-model", default=DEFAULT_LABEL_MODEL)
    parser.add_argument("--dimensions", type=int, default=DEFAULT_DIMENSIONS)
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--min-cluster-size", type=int, default=5)
    parser.add_argument("--min-samples", type=int, default=3)
    parser.add_argument("--target-cluster-size", type=int, default=30, help="Target cases per cluster for tfidf method.")
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args(sys.argv[1:]))))

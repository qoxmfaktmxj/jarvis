"""
Generate dense TF-IDF embeddings (1536 dimensions) for all precedent cases
and update the PostgreSQL precedent_case.embedding column.

Strategy:
  1. Read 74,342 cases from normalized_cases.clustered.jsonl
  2. Build text: title | lower_category | app_menu | symptom | cause | action
     (same as cluster-cases.py case_text())
  3. TF-IDF vectorize (max_features=8000, sublinear_tf=True)
  4. TruncatedSVD to reduce to 1536 dimensions (matches DB vector(1536))
  5. L2-normalize each vector (for cosine similarity)
  6. Batch-update PostgreSQL precedent_case.embedding via source_key
"""

import json
import time
import sys
import numpy as np
import psycopg2
from psycopg2.extras import execute_batch
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

# ── Config ──────────────────────────────────────────────────────────────────
JSONL_PATH = r"C:\Users\kms\Desktop\dev\jarvis\data\cases\normalized_cases.clustered.jsonl"
DATABASE_URL = "postgresql://jarvis:jarvispass@localhost:5436/jarvis"
WORKSPACE_ID = "b4c3f631-2b7d-43eb-b032-9e9f410ba5ec"
N_COMPONENTS = 1536
MAX_FEATURES = 8000
BATCH_SIZE = 500
PROGRESS_EVERY = 5000


def case_text(record: dict) -> str:
    """Build text representation matching cluster-cases.py case_text()."""
    parts = [
        record.get("title"),
        record.get("lower_category"),
        record.get("app_menu"),
        record.get("symptom"),
        record.get("cause"),
        record.get("action"),
    ]
    return " | ".join(str(part).strip() for part in parts if part)


def load_cases(path: str) -> tuple[list[str], list[str]]:
    """Load JSONL and return (source_keys, texts)."""
    source_keys = []
    texts = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            source_keys.append(record["source_key"])
            texts.append(case_text(record))
    return source_keys, texts


def build_embeddings(texts: list[str]) -> np.ndarray:
    """TF-IDF -> TruncatedSVD -> L2-normalize to produce dense 1536-dim vectors."""
    print(f"  TF-IDF vectorizing {len(texts):,} documents (max_features={MAX_FEATURES})...")
    t0 = time.time()
    tfidf = TfidfVectorizer(
        max_features=MAX_FEATURES,
        sublinear_tf=True,
        dtype=np.float32,
    )
    tfidf_matrix = tfidf.fit_transform(texts)
    print(f"  TF-IDF done in {time.time() - t0:.1f}s  shape={tfidf_matrix.shape}")

    print(f"  TruncatedSVD reducing to {N_COMPONENTS} dimensions...")
    t0 = time.time()
    svd = TruncatedSVD(n_components=N_COMPONENTS, random_state=42)
    dense = svd.fit_transform(tfidf_matrix)
    explained = svd.explained_variance_ratio_.sum()
    print(f"  SVD done in {time.time() - t0:.1f}s  explained_variance={explained:.4f}")

    print("  L2-normalizing...")
    dense = normalize(dense, norm="l2")
    return dense


def vector_to_pg(vec: np.ndarray) -> str:
    """Convert numpy vector to pgvector literal: '[0.1,0.2,...]'"""
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


def update_database(source_keys: list[str], embeddings: np.ndarray):
    """Batch-update precedent_case.embedding in PostgreSQL."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    total = len(source_keys)
    updated = 0
    t0 = time.time()

    print(f"  Updating {total:,} rows in batches of {BATCH_SIZE}...")

    for batch_start in range(0, total, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, total)
        batch_data = []
        for i in range(batch_start, batch_end):
            pg_vec = vector_to_pg(embeddings[i])
            batch_data.append((pg_vec, source_keys[i]))

        execute_batch(
            cur,
            "UPDATE precedent_case SET embedding = %s::vector WHERE source_key = %s AND workspace_id = %s",
            [(v, k, WORKSPACE_ID) for v, k in batch_data],
            page_size=BATCH_SIZE,
        )
        conn.commit()
        updated += (batch_end - batch_start)

        if updated % PROGRESS_EVERY < BATCH_SIZE:
            elapsed = time.time() - t0
            rate = updated / elapsed if elapsed > 0 else 0
            print(f"    {updated:,}/{total:,} updated ({rate:.0f} rows/sec)")

    cur.close()
    conn.close()
    return updated, time.time() - t0


def main():
    total_start = time.time()

    print("=" * 60)
    print("TF-IDF Embedding Generator for Jarvis Precedent Cases")
    print("=" * 60)

    # Step 1: Load cases
    print("\n[1/3] Loading cases from JSONL...")
    t0 = time.time()
    source_keys, texts = load_cases(JSONL_PATH)
    print(f"  Loaded {len(source_keys):,} cases in {time.time() - t0:.1f}s")

    # Step 2: Build embeddings
    print(f"\n[2/3] Building {N_COMPONENTS}-dim dense embeddings...")
    embeddings = build_embeddings(texts)
    print(f"  Final embedding shape: {embeddings.shape}")

    # Step 3: Update database
    print("\n[3/3] Updating PostgreSQL database...")
    updated, db_time = update_database(source_keys, embeddings)

    # Summary
    total_time = time.time() - total_start
    print("\n" + "=" * 60)
    print("DONE")
    print(f"  Cases processed:  {len(source_keys):,}")
    print(f"  Embedding dims:   {N_COMPONENTS}")
    print(f"  DB rows updated:  {updated:,}")
    print(f"  DB update time:   {db_time:.1f}s")
    print(f"  Total time:       {total_time:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()

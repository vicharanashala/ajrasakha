#!/usr/bin/env python3
"""
Clustering pipeline: Group similar FAQ entries together using
keyword-based clustering (can be replaced with ML later).
"""
import sys
import json
from pathlib import Path


def jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def cluster_rows(rows: list[dict], threshold: float = 0.3) -> list[list[dict]]:
    clusters: list[list[dict]] = []
    assigned = [False] * len(rows)

    for i, row in enumerate(rows):
        if assigned[i]:
            continue
        cluster = [row]
        assigned[i] = True
        tokens_i = set(row.get("question", "").lower().split())

        for j in range(i + 1, len(rows)):
            if assigned[j]:
                continue
            tokens_j = set(rows[j].get("question", "").lower().split())
            if jaccard_similarity(tokens_i, tokens_j) >= threshold:
                cluster.append(rows[j])
                assigned[j] = True

        clusters.append(cluster)

    clusters.sort(key=lambda c: len(c), reverse=True)
    return clusters


def main(state: str, district: str, crop: str, upload_dir: str, output_dir: str):
    src = Path(output_dir) / "preprocessed.json"
    if not src.exists():
        print("[CLUSTER] No preprocessed data found — skipping")
        return

    rows = json.loads(src.read_text())
    clusters = cluster_rows(rows)

    result = []
    for i, cluster in enumerate(clusters):
        result.append({
            "cluster_id": i + 1,
            "size": len(cluster),
            "questions": [r.get("question", "") for r in cluster],
            "representative": cluster[0].get("question", ""),
        })

    out_path = Path(output_dir) / "clusters.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"[CLUSTER] Created {len(clusters)} clusters from {len(rows)} rows")
    print(f"[CLUSTER] Output -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:6])

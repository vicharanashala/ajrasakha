#!/usr/bin/env python3
"""
Post-pipeline: Format clustered output into a CSV report and update the
state table with finished timestamp.
"""
import sys
import csv
import json
from pathlib import Path
from datetime import datetime, timezone


def main(state: str, district: str, crop: str, upload_dir: str, output_dir: str):
    clusters_path = Path(output_dir) / "clusters.json"
    if not clusters_path.exists():
        print("[POST] No clusters found — skipping")
        return

    clusters = json.loads(clusters_path.read_text())

    csv_path = Path(output_dir) / "output.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["cluster_id", "size", "representative_question", "questions"])
        for c in clusters:
            writer.writerow([
                c["cluster_id"],
                c["size"],
                c["representative"],
                " | ".join(c["questions"]),
            ])

    finished_at = datetime.now(timezone.utc).isoformat()
    print(f"[POST] Wrote {len(clusters)} clusters to {csv_path}")
    print(f"[POST] finished_at={finished_at}")

    # Emit a JSON line so the API caller can parse it
    print(json.dumps({"finished_at": finished_at, "output_file": str(csv_path)}))


if __name__ == "__main__":
    main(*sys.argv[1:6])

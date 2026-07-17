#!/usr/bin/env python3
"""
Full pipeline: Run pre -> clustering -> post in sequence.
"""
import sys
import subprocess
from pathlib import Path


def main(state: str, district: str, crop: str, upload_dir: str, output_dir: str):
    script_dir = Path(__file__).parent
    steps = ["pre_pipeline.py", "clustering.py", "post_pipeline.py"]
    args = [state, district, crop, upload_dir, output_dir]

    for step in steps:
        script = script_dir / step
        print(f"[FULL] Running {step} ...")
        result = subprocess.run(
            [sys.executable, str(script), *args],
            capture_output=True, text=True,
        )
        print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        if result.returncode != 0:
            print(f"[FULL] {step} failed with exit code {result.returncode}")
            sys.exit(result.returncode)
    print("[FULL] Pipeline completed successfully")


if __name__ == "__main__":
    main(*sys.argv[1:6])

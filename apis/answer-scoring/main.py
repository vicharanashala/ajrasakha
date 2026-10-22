"""Entrypoint for the answer-scoring API."""

import sys
from pathlib import Path

# the files in checker/ import each other directly (from run_checker import ...)
sys.path.insert(0, str(Path(__file__).resolve().parent / "checker"))

import uvicorn  # noqa: E402
from api import app  # noqa: E402,F401

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8010)

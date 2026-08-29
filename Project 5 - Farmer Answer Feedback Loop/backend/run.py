"""
run.py — Start the full Farmer Feedback backend with a single command.

Usage:
    cd backend
    python run.py
"""
import sys
import subprocess
import os
from pathlib import Path

# ── Ensure we're in the backend directory ─────────────────────────────────────
os.chdir(Path(__file__).parent)

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*56)
    print("  ACE Farmer Feedback System — Backend Server")
    print("="*56)
    print("  Docs:   http://localhost:8000/docs")
    print("  Health: http://localhost:8000/health")
    print("="*56 + "\n")

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
    )

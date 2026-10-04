"""Central configuration for the Ajrasakha reviewer load-test suite.

Everything is overridable via environment variables so the same suite can
run against a local stack, staging, or any other deployment.
"""
import os
from pathlib import Path

_HERE = Path(__file__).resolve().parent.parent  # load-tests/

# Backend under test
BASE_URL = os.environ.get("LT_BASE_URL", "http://127.0.0.1:3000")
API_PREFIX = os.environ.get("LT_API_PREFIX", "/api")

# Firebase Auth emulator (mints real ID tokens the backend verifies)
EMULATOR_HOST = os.environ.get("LT_EMULATOR_HOST", "http://127.0.0.1:9099")
FIREBASE_API_KEY = os.environ.get("LT_FIREBASE_API_KEY", "fake-api-key")

# MongoDB used by the backend (for seeding + invariant verification)
MONGO_URI = os.environ.get(
    "LT_MONGO_URI",
    "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true",
)
MONGO_TLS_CA = os.environ.get("LT_MONGO_TLS_CA", str(_HERE / "stack" / "certs" / "ca.pem"))
DB_NAME = os.environ.get("LT_DB_NAME", "agriai_loadtest")

# Seeded account credentials
SEED_PASSWORD = os.environ.get("LT_SEED_PASSWORD", "password123")
SEED_DIR = Path(os.environ.get("LT_SEED_DIR", str(_HERE / ".seed")))
USERS_MANIFEST = SEED_DIR / "users.json"

RESULTS_DIR = Path(os.environ.get("LT_RESULTS_DIR", str(_HERE / "results")))


def api(path: str) -> str:
    """Full URL for an API path ('/answers/review' -> http://.../api/answers/review)."""
    return f"{BASE_URL}{API_PREFIX}{path}"

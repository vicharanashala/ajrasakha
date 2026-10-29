import os

from dotenv import load_dotenv

load_dotenv()

# "local" (dev: read REFERENCE_DATA_DIR) or "gcs" (prod: read REFERENCE_GCS_BUCKET
# at REFERENCE_RELEASE_ID, pinned per Cloud Run revision). No default - an unset
# or unrecognized value must fail closed, never guess which source was meant.
REFERENCE_DATA_SOURCE = os.getenv("REFERENCE_DATA_SOURCE")

# local source
REFERENCE_DATA_DIR = os.getenv("REFERENCE_DATA_DIR")

# gcs source - the running service only ever reads its own pinned release id;
# it never polls a live "current" pointer (see Writing Assistant Build Plan,
# "Production release consistency"). Not wired up yet - no cloud resources
# have been created.
REFERENCE_GCS_BUCKET = os.getenv("REFERENCE_GCS_BUCKET")
REFERENCE_GCS_PREFIX = os.getenv("REFERENCE_GCS_PREFIX", "reference-data")
REFERENCE_RELEASE_ID = os.getenv("REFERENCE_RELEASE_ID")

# Same env var names already used elsewhere in this repo
# (ai/ajrasakha/agents/config.py, backend/src/config/ai.ts) - reused on
# purpose rather than inventing new ones.
MINIMAX_BASE_URL = os.getenv("MINIMAX_BASE_URL")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMaxAI/MiniMax-M2.7")
# 60s, not 30s: generate_polish() asks for a full rewrite (hundreds of words)
# from a reasoning model, which is slower than the short JSON-only calls
# (classify_and_select, classify_step_coverage) that comfortably finish
# inside 30s. Verified against a real production timeout at 30s on a
# realistic draft (Writing Assistant Build Plan, Revision 11).
MINIMAX_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_TIMEOUT_SECONDS", "60"))
# The self-hosted production model (per ai/ajrasakha/agents/config.py's
# get_minimax_chat_model) speaks the standard OpenAI-compatible path. The
# official public MiniMax API (used as a fallback for testing when the
# tailnet isn't reachable) uses its own path instead - confirmed by a live
# probe: /text/chatcompletion_v2, same request/response shape otherwise.
MINIMAX_CHAT_PATH = os.getenv("MINIMAX_CHAT_PATH", "/chat/completions")
# temperature=0.0 alone didn't fully stop the step-coverage classification
# from flipping between runs on identical input (Writing Assistant Build
# Plan, Revision 14, ISS-04, confirmed in a real test report) - a known
# property of some reasoning-model serving stacks even at zero temperature.
# Live-verified the API accepts this field without erroring; not promising
# this makes every call bit-for-bit reproducible, only that it removes one
# more independent source of sampling variance.
MINIMAX_SEED = int(os.getenv("MINIMAX_SEED", "0"))

# The chemical-name-drift guardrail layer connects directly to the same
# read-only staging cluster apis/chemical_detector uses, in-process - not
# over HTTP to that sibling service. Same env var names/defaults as
# apis/chemical_detector's own config, so the same connection string works
# for both. This makes this service's guardrail immune to that sibling
# service being removed, renamed, or rate-limited/cold-starting on its own
# free-tier Render plan (Writing Assistant Build Plan, Revision 14, ISS-03 -
# a real test report showed both failure modes live in production).
CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")

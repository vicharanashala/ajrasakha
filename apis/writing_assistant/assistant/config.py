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
MINIMAX_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_TIMEOUT_SECONDS", "30"))
# The self-hosted production model (per ai/ajrasakha/agents/config.py's
# get_minimax_chat_model) speaks the standard OpenAI-compatible path. The
# official public MiniMax API (used as a fallback for testing when the
# tailnet isn't reachable) uses its own path instead - confirmed by a live
# probe: /text/chatcompletion_v2, same request/response shape otherwise.
MINIMAX_CHAT_PATH = os.getenv("MINIMAX_CHAT_PATH", "/chat/completions")

# The already-deployed apis/chemical_detector service - reused for the
# chemical-name-drift guardrail layer, never reimplemented.
CHEMICAL_DETECTOR_URL = os.getenv("CHEMICAL_DETECTOR_URL")

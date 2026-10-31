import os

from dotenv import load_dotenv

load_dotenv()

# Public MiniMax API only - no self-hosted/Tailscale hop, no automatic
# fallback (explicit product decision: a small, standalone service, not
# worth the dual-mode client writing_assistant needs).
MINIMAX_BASE_URL = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
# MiniMax-M2.7 is a strict product requirement (confirmed live against the
# public API - it is in fact a valid public model, contrary to an earlier,
# wrong assumption here based only on writing_assistant's own config using
# "MiniMax-M3" instead).
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMax-M2.7")
MINIMAX_CHAT_PATH = os.getenv("MINIMAX_CHAT_PATH", "/text/chatcompletion_v2")
MINIMAX_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_TIMEOUT_SECONDS", "90"))
MINIMAX_SEED = int(os.getenv("MINIMAX_SEED", "0"))

import os

from dotenv import load_dotenv

load_dotenv()

# Reversed an earlier decision to go public-API-only: this now supports the
# same self-hosted MiniMax-M2.7 host (http://100.100.108.41:8001/v1, model
# id MiniMaxAI/MiniMax-M2.7) that ai/ajrasakha/agents/config.py and
# apis/writing_assistant point at, routed through the Tailscale SOCKS proxy
# by llm_client._is_tailnet_host - set these three to that endpoint's values
# to use it. The public API remains the default/fallback for environments
# without tailnet access.
MINIMAX_BASE_URL = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
# MiniMax-M2.7 is a strict product requirement (confirmed live against both
# the public API and the self-hosted host - the self-hosted model id is
# "MiniMaxAI/MiniMax-M2.7", not this bare default; set MINIMAX_MODEL
# explicitly when pointing at that host).
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMax-M2.7")
MINIMAX_CHAT_PATH = os.getenv("MINIMAX_CHAT_PATH", "/text/chatcompletion_v2")
MINIMAX_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_TIMEOUT_SECONDS", "90"))
MINIMAX_SEED = int(os.getenv("MINIMAX_SEED", "0"))

import os
from typing import Any, Optional

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# Fast model for simple tasks (routing, classification, translation)
CLAUDE_FAST = os.getenv("CLAUDE_FAST", "claude-haiku-4-5-20251001")

# Task-specific model assignments
SYNTHESIZE_MODEL = CLAUDE_FAST        # Fast for rephrasing/simple synthesis
PLANNER_MODEL = CLAUDE_MODEL          # Routing/classification - Haiku sufficient
SANITIZER_MODEL = CLAUDE_FAST        # Relevance scoring - Haiku sufficient
TRANSLATE_MODEL = CLAUDE_MODEL       # Keep Sonnet - translation quality important
CROP_CLASSIFY_MODEL = CLAUDE_FAST    # Binary classification - Haiku sufficient

REMOTE_IP = os.getenv("REMOTE_IP", "100.100.108.43")

# Reviewer upload channel when LangGraph configurable.question_source is unset
QUESTION_SOURCE = os.getenv("QUESTION_SOURCE", "AJRASAKHA").strip()


def resolve_question_source(config: Optional[dict[str, Any]] = None) -> Optional[str]:
    """
    Prefer configurable.question_source from the run; else QUESTION_SOURCE from .env.

    Reads os.getenv at call time so values work after load_dotenv() in ajrasakha.py.
    """
    configurable = (config or {}).get("configurable") or {}
    explicit = configurable.get("question_source")
    if explicit is not None and str(explicit).strip():
        return str(explicit).strip()
    env_source = os.getenv("QUESTION_SOURCE", QUESTION_SOURCE).strip()
    if env_source:
        return env_source
    return None

MCP_URLS = {
    "gdb":        f"http://{REMOTE_IP}:9005/mcp",
    "weather":    f"http://100.100.108.41:9017/mcp",
    "soil":       f"http://{REMOTE_IP}:9008/mcp",
    "enam":       f"http://{REMOTE_IP}:9002/mcp",
    "agmarknet":  f"http://{REMOTE_IP}:9006/mcp",
    "reviewer":   f"http://{REMOTE_IP}:9007/mcp",
    "location":   f"http://{REMOTE_IP}:9000/mcp",
    "schemes":    f"http://{REMOTE_IP}:9009/mcp",
    "faq_video":  f"http://{REMOTE_IP}:9007/mcp",
    "chemical_checker": f"http://{REMOTE_IP}:9101/mcp",
}

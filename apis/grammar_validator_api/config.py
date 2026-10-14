"""
Configuration settings for Grammar Validator API.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


# API Server Configuration
GRAMMAR_VALIDATOR_HOST = os.getenv("GRAMMAR_VALIDATOR_HOST", "0.0.0.0")
GRAMMAR_VALIDATOR_PORT = int(os.getenv("GRAMMAR_VALIDATOR_PORT", "8002"))

# LLM Configuration
LLM_API_URL = os.getenv(
    "LLM_API_URL",
    ""  # Required: Set your MiniMax API URL
)
LLM_MODEL = os.getenv(
    "LLM_MODEL",
    "MiniMaxAI/MiniMax-M2.7"
)
LLM_API_KEY = os.getenv(
    "LLM_API_KEY",
    ""  # Required: Set your MiniMax API key
)
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
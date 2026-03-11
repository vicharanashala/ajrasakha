"""
Configuration for the MCP Cache Proxy.
"""
import logging
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("mcp-cache-proxy")

# LLM endpoint (vLLM or existing proxy API)
TARGET_URL = os.getenv("TARGET_URL")

# Embedding API
EMBEDDING_API_URL = os.getenv("EMBEDDING_API_URL", "http://100.100.108.43:6001/embed")

# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Cache settings
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.92"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "86400"))

# Language detection
LANG_DETECTION_MODEL_URL = os.getenv("LANG_DETECTION_MODEL_URL", "http://100.100.108.43:8013/v1/chat/completions")
LANG_DETECTION_MODEL_NAME = os.getenv("LANG_DETECTION_MODEL_NAME", "google/gemma-3-12b-it")

# Server
TIMEOUT = float(os.getenv("TIMEOUT", "120.0"))
PORT = int(os.getenv("PORT", "9030"))

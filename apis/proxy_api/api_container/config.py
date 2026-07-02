"""
Configuration and logging setup for the proxy API.
"""
import logging
import os
from dotenv import load_dotenv

load_dotenv()

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
logger = logging.getLogger("vllm-proxy")

# Environment variables
TARGET_URL = os.getenv("TARGET_URL")
VISION_API_URL = os.getenv("VISION_API_URL")
TIMEOUT = float(os.getenv("TIMEOUT", "60.0"))
PORT = int(os.getenv("PORT", "9012"))

"""
Constants and Configuration for FAQ MCP Server
"""

import os
from urllib.parse import quote_plus

# MongoDB Configuration
MONGODB_URI = os.getenv('MONGODB_URI')
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set")
DB_NAME = "faq_bootcamp"
COLLECTION_NAME = "questions"

# Embedding Configuration
EMBEDDING_PROVIDER = os.getenv('EMBEDDING_PROVIDER', 'openai')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'text-embedding-3-small')
EMBEDDING_DIMENSION = int(os.getenv('EMBEDDING_DIMENSION', '1536'))

# Local embedding model (for sentence-transformers)
LOCAL_EMBEDDING_MODEL = 'all-MiniLM-L6-v2'

# Search Configuration
TFIDF_WEIGHT = float(os.getenv('TFIDF_WEIGHT', '0.3'))
EMBEDDING_WEIGHT = float(os.getenv('EMBEDDING_WEIGHT', '0.7'))
DEFAULT_TOP_K = 3
MAX_TOP_K = 5

# Server Configuration
SERVER_HOST = os.getenv('SERVER_HOST', 'localhost')
SERVER_PORT = int(os.getenv('SERVER_PORT', '9010'))
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

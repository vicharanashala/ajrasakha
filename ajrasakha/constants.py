from urllib.parse import quote_plus

# Vector Database
USERNAME = quote_plus("agriai")
PASSWORD = quote_plus("agriai1224")
MONGODB_URI = f"mongodb+srv://{USERNAME}:{PASSWORD}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"
DB_NAME = "golden_db"
INDEX_NAME = "vector_index"

# Database Collections
COLLECTION_QA = "agri_qa"
COLLECTION_POP = "pop"

# LLM
OLLAMA_HOST = "http://100.100.108.13:11434"
OLLAMA_API_URL = OLLAMA_HOST + "/api/chat"

# MODELS
LLM_MODEL_MAIN = "deepseek-r1:70b"
LLM_MODEL_FALL_BACK = "qwen3:1.7b"
EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"
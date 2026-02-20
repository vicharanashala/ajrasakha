

from typing import List
from pymongo import MongoClient
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from models import ContextQuestionAnswerPair, QuestionAnswerPairMetaData
from constants import (
    DB_NAME,
    COLLECTION_QA,
    MONGODB_URI,
    EMBEDDING_MODEL,
)

client = MongoClient(MONGODB_URI)
# Select the database and collection
db = client[DB_NAME]
collection = db[COLLECTION_QA]

# --- CONFIGURATION ---

# STATE_CODES = {
#     "AR": "ARUNACHAL PRADESH",
#     "HR": "Haryana",
#     "MP": "MADHYA PRADESH",
#     "MH": "MAHARASHTRA",
#     "PB": "PUNJAB",
#     "RJ": "Rajasthan",
#     "TN": "TAMILNADU",
#     "UP": "Uttar Pradesh",
#     "--": ""
# }
STATE_CODES = {
    "AP": "ANDHRA PRADESH",
    "AR": "ARUNACHAL PRADESH",
    "AS": "ASSAM",
    "BR": "BIHAR",
    "CG": "CHHATTISGARH",
    "HP": "HIMACHAL PRADESH",
    "HR": "HARYANA",
    "JH": "JHARKHAND",
    "KL": "KERALA",
    "MP": "MADHYA PRADESH",
    "MH": "MAHARASHTRA",
    "OD": "ODISHA",
    "PY": "PUDUCHERRY",
    "PB": "PUNJAB",
    "RJ": "RAJASTHAN",
    "TN": "TAMILNADU",
    "TG": "TELANGANA",
    "UP": "UTTAR PRADESH",
    "UK": "UTTARAKHAND",
    "WB": "WEST BENGAL"
}



VECTOR_INDEX_NAME = "vector_index"  # 🔁 Replace with your actual MongoDB Atlas vector index name

# --- INITIALIZATION ---

print("🔗 Connecting to MongoDB...")
client = MongoClient(MONGODB_URI)
db = client[DB_NAME]
collection = db[COLLECTION_QA]

print("🧠 Loading embedding model...")
embedder = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL,
    cache_folder="./hf_cache",
    trust_remote_code=True
)


# def parse_mongo_docs_to_context_pairs(results: List[dict]) -> List[ContextQuestionAnswerPair]:
#     """Convert MongoDB docs to structured ContextQuestionAnswerPair list."""
#     context_pairs = []

#     for doc in results:
#         text = doc.get("text", "")
#         metadata = doc.get("metadata", {})
#         score = doc.get("score", 0.0)

#         # Split text into Question and Answer
#         q, a = text, ""
#         if "\n\nAnswer:" in text:
#             parts = text.split("\n\nAnswer:", 1)
#             q = parts[0].replace("Question:", "", 1).strip()
#             a = parts[1].strip()

#         meta = QuestionAnswerPairMetaData(
#             agri_specialist=metadata.get("Agri Specialist", "Not Available"),
#             crop=metadata.get("Crop", "Not Available"),
#             sources=metadata.get("Source [Name and Link]", "Source Not Available"),
#             state=metadata.get("State", "Not Available"),
#             similarity_score=score,
#         )

#         context_pairs.append(ContextQuestionAnswerPair(question=q, answer=a, meta_data=meta))

#     return context_pairs



def parse_mongo_docs_to_context_pairs(results: List[dict]) -> List[ContextQuestionAnswerPair]:
    context_pairs = []

    for doc in results:
        text = doc.get("text", "")
        metadata = doc.get("metadata", {})
        score = doc.get("score", 0.0)

        q, a = "", ""

        # OLD FORMAT: "Question: ... \n\nAnswer: ..."
        if "Question:" in text and "\n\nAnswer:" in text:
            parts = text.split("\n\nAnswer:", 1)
            q = parts[0].replace("Question:", "", 1).strip()
            a = parts[1].strip()

        # NEW FORMAT: "Question\n\nAnswer"
        elif "\n\n" in text:
            parts = text.split("\n\n", 1)
            q = parts[0].strip()
            a = parts[1].strip()

        else:
            q = text.strip()
            a = ""

        meta = QuestionAnswerPairMetaData(
            agri_specialist=metadata.get("Agri Specialist", "Not Available"),
            crop=metadata.get("Crop", "Not Available"),
            sources=metadata.get("Source [Name and Link]", "Source Not Available"),
            state=metadata.get("State", "Not Available"),
            similarity_score=score,
        )

        context_pairs.append(
            ContextQuestionAnswerPair(
                question=q,
                answer=a,
                meta_data=meta
            )
        )

    return context_pairs


# --- MAIN FUNCTION ---

def search(query: str, state_code: str, crop: str, threshold: float = 0.7, limit: int = 5) -> List[ContextQuestionAnswerPair]:
    """Perform a vector search and return structured QA pairs."""
    state_full = STATE_CODES.get(state_code.upper())
    if not state_full:
        raise ValueError(f"❌ Invalid or unsupported state code: {state_code}")

    query_vector = embedder.get_text_embedding(query)

    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 100,
                "limit": limit,
                "filter": {"metadata.State": state_full, "metadata.Crop": crop}
            }
        },
        {
            "$project": {
                "text": 1,
                "metadata": 1,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ]

    results = list(collection.aggregate(pipeline))
    filtered = [r for r in results if r.get("score", 0) >= threshold]

    context_pairs = parse_mongo_docs_to_context_pairs(filtered)
    return context_pairs



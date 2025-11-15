# from pymongo import MongoClient
# from constants import MONGODB_URI  # Make sure this contains your Mongo URI

# # Connect to MongoDB
# client = MongoClient(MONGODB_URI)

# # Select the database and collection
# db = client["golden_db"]
# collection = db["agri_qa"]

# # Fetch distinct states from metadata.State
# unique_states = collection.distinct("metadata.State")

# # Print results
# print(f"Total unique states: {len(unique_states)}")
# print("List of states:")
# for state in sorted(unique_states):
#     print("-", state)


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

# --- CONFIGURATION ---

STATE_CODES = {
    "AR": "ARUNACHAL PRADESH",
    "HR": "Haryana",
    "MP": "MADHYA PRADESH",
    "MH": "MAHARASHTRA",
    "PB": "PUNJAB",
    "RJ": "Rajasthan",
    "TN": "TAMILNADU",
    "UP": "Uttar Pradesh",
    "--": ""
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


def parse_mongo_docs_to_context_pairs(results: List[dict]) -> List[ContextQuestionAnswerPair]:
    """Convert MongoDB docs to structured ContextQuestionAnswerPair list."""
    context_pairs = []

    for doc in results:
        text = doc.get("text", "")
        metadata = doc.get("metadata", {})
        score = doc.get("score", 0.0)

        # Split text into Question and Answer
        q, a = text, ""
        if "\n\nAnswer:" in text:
            parts = text.split("\n\nAnswer:", 1)
            q = parts[0].replace("Question:", "", 1).strip()
            a = parts[1].strip()

        meta = QuestionAnswerPairMetaData(
            agri_specialist=metadata.get("Agri Specialist", "Not Available"),
            crop=metadata.get("Crop", "Not Available"),
            sources=metadata.get("Source [Name and Link]", "Source Not Available"),
            state=metadata.get("State", "Not Available"),
            similarity_score=score,
        )

        context_pairs.append(ContextQuestionAnswerPair(question=q, answer=a, meta_data=meta))

    return context_pairs

# --- MAIN FUNCTION ---

def search(query: str, state_code: str, threshold: float = 0.7, limit: int = 5) -> List[ContextQuestionAnswerPair]:
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
                "filter": {"metadata.State": state_full}
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

def get_crops_by_state(state_code: str) -> List[str]:
    """
    Fetch the list of available crops for a given state code.

    Args:
        state_code (str): The two-letter state code (e.g., "TN", "MH", "PB")

    Returns:
        List[str]: A sorted list of unique crop names available for that state.
    """
    # Convert state code to full name
    state_full = STATE_CODES.get(state_code.upper())
    if not state_full:
        raise ValueError(f"❌ Invalid or unsupported state code: {state_code}")

    # Fetch distinct crop names
    crops = collection.distinct("metadata.Crop", {"metadata.State": state_full})

    return sorted(crop for crop in crops if crop and crop.strip())

# --- RUN EXAMPLE QUERY ---

if __name__ == "__main__":
    query = "how to improve soil fertility in paddy fields"
    state_code = "TN"  # Tamil Nadu

    pairs = search(query, state_code, threshold=0.8, limit=5)

    for i, p in enumerate(pairs, start=1):
        print(f"🔹 Result {i}")
        print(f"Question: {p.question}")
        print(f"Answer: {p.answer}")
        print(f"State: {p.meta_data.state}")
        print(f"Crop: {p.meta_data.crop}")
        print(f"Agri Specialist: {p.meta_data.agri_specialist}")
        print(f"Similarity: {p.meta_data.similarity_score:.4f}")
        print("-" * 80)

    crops = get_crops_by_state("TN")
    print(f"Available crops in TN: {crops}")

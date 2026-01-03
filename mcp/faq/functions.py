"""
Business Logic and Search Functions for FAQ MCP Server
"""

from typing import List, Optional
import numpy as np
from pymongo import MongoClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from constants import (
    MONGODB_URI,
    DB_NAME,
    COLLECTION_NAME,
    EMBEDDING_PROVIDER,
    OPENAI_API_KEY,
    ANTHROPIC_API_KEY,
    LOCAL_EMBEDDING_MODEL,
    TFIDF_WEIGHT,
    EMBEDDING_WEIGHT,
)
from models import FAQResult, FAQMetadata

# Global caches
_faq_cache = []
_vectorizer = None
_tfidf_matrix = None
_embedding_function = None


def get_embedding_function():
    """Get the appropriate embedding function based on configuration."""
    global _embedding_function
    
    if _embedding_function is not None:
        return _embedding_function
    
    if EMBEDDING_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        def embed_text(text: str) -> List[float]:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        
        _embedding_function = embed_text
    
    elif EMBEDDING_PROVIDER == "anthropic":
        import voyageai
        vo = voyageai.Client(api_key=ANTHROPIC_API_KEY)
        
        def embed_text(text: str) -> List[float]:
            result = vo.embed([text], model="voyage-2")
            return result.embeddings[0]
        
        _embedding_function = embed_text
    
    elif EMBEDDING_PROVIDER == "local":
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(LOCAL_EMBEDDING_MODEL)
        
        def embed_text(text: str) -> List[float]:
            embedding = model.encode(text)
            return embedding.tolist()
        
        _embedding_function = embed_text
    
    return _embedding_function


async def load_faqs_from_mongodb() -> List[dict]:
    """Load all FAQs from MongoDB and cache them."""
    global _faq_cache
    
    if _faq_cache:
        return _faq_cache
    
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    _faq_cache = list(collection.find({}, {'_id': 0}))
    client.close()
    
    return _faq_cache


async def build_tfidf_index():
    """Build TF-IDF index for all questions."""
    global _vectorizer, _tfidf_matrix, _faq_cache
    
    if _vectorizer is not None and _tfidf_matrix is not None:
        return
    
    if not _faq_cache:
        await load_faqs_from_mongodb()
    
    questions = [faq['question'] for faq in _faq_cache]
    
    _vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words='english',
        ngram_range=(1, 2),
        max_features=1000
    )
    
    _tfidf_matrix = _vectorizer.fit_transform(questions)


async def search_tfidf(query: str) -> np.ndarray:
    """Search using TF-IDF only."""
    global _vectorizer, _tfidf_matrix
    
    if _vectorizer is None or _tfidf_matrix is None:
        await build_tfidf_index()
    
    query_vector = _vectorizer.transform([query])
    similarities = cosine_similarity(query_vector, _tfidf_matrix)[0]
    
    return similarities


async def search_embedding(query: str) -> Optional[np.ndarray]:
    """Search using embeddings."""
    global _faq_cache
    
    if not _faq_cache:
        await load_faqs_from_mongodb()
    
    # Check if embeddings exist
    if not any('embedding' in faq for faq in _faq_cache):
        return None
    
    try:
        embed_fn = get_embedding_function()
        query_embedding = np.array(embed_fn(query))
        
        faq_embeddings = []
        for faq in _faq_cache:
            if 'embedding' in faq:
                faq_embeddings.append(faq['embedding'])
            else:
                faq_embeddings.append([0.0] * len(query_embedding))
        
        faq_embeddings = np.array(faq_embeddings)
        similarities = cosine_similarity([query_embedding], faq_embeddings)[0]
        
        return similarities
    
    except Exception as e:
        print(f"Error in embedding search: {e}")
        return None


async def search_faqs(query: str, top_k: int = 3) -> List[FAQResult]:
    """
    Hybrid search combining TF-IDF and embeddings.
    
    Args:
        query: User's question
        top_k: Number of top results to return
        
    Returns:
        List of FAQResult objects
    """
    global _faq_cache
    
    if not _faq_cache:
        await load_faqs_from_mongodb()
    
    # Get TF-IDF scores
    tfidf_scores = await search_tfidf(query)
    
    # Get embedding scores
    embedding_scores = await search_embedding(query)
    
    # Combine scores
    if embedding_scores is not None:
        combined_scores = (
            TFIDF_WEIGHT * tfidf_scores +
            EMBEDDING_WEIGHT * embedding_scores
        )
        search_method = "hybrid"
    else:
        combined_scores = tfidf_scores
        search_method = "tfidf"
    
    # Get top K indices
    top_indices = np.argsort(combined_scores)[::-1][:top_k]
    
    # Build results
    results = []
    for idx in top_indices:
        score = combined_scores[idx]
        if score > 0:
            faq = _faq_cache[idx]
            
            metadata = FAQMetadata(
                question_id=faq['question_id'],
                category=faq['category'],
                similarity_score=float(score),
                tfidf_score=float(tfidf_scores[idx]),
                embedding_score=float(embedding_scores[idx]) if embedding_scores is not None else 0.0,
                search_method=search_method
            )
            
            result = FAQResult(
                question=faq['question'],
                answer=faq['answer'],
                metadata=metadata
            )
            
            results.append(result)
    
    return results


async def initialize():
    """Initialize the search system."""
    print("Initializing FAQ search system...")
    await load_faqs_from_mongodb()
    await build_tfidf_index()
    
    has_embeddings = any('embedding' in faq for faq in _faq_cache)
    if has_embeddings:
        print(f"✓ Loaded {len(_faq_cache)} FAQs with embeddings")
    else:
        print(f"✓ Loaded {len(_faq_cache)} FAQs (TF-IDF only)")
        print("  Run 'python scripts/generate_embeddings.py' to add embeddings")
    
    print("✓ Initialization complete")

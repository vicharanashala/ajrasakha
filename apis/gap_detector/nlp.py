from sentence_transformers import SentenceTransformer

# Load a pre-trained sentence transformer model
# all-MiniLM-L6-v2 is fast and provides good sentence embeddings for semantic similarity
model = SentenceTransformer('all-MiniLM-L6-v2')

def get_embeddings(texts: list[str]):
    """
    Generate embeddings for a list of query texts.
    These embeddings will be used for clustering the unanswered questions.
    """
    if not texts:
        return []
    
    # Generate embeddings (returns a numpy array)
    embeddings = model.encode(texts)
    return embeddings

if __name__ == "__main__":
    # Test the embedding generation
    sample_queries = [
        "How to treat leaf curl in chilli?",
        "Chilli leaf curl virus treatment",
        "What is the MSP for wheat in Punjab?"
    ]
    
    vecs = get_embeddings(sample_queries)
    print(f"Generated embeddings of shape: {vecs.shape}")

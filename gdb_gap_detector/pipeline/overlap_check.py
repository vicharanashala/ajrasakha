import os
import numpy as np
import faiss
import requests
from sentence_transformers import SentenceTransformer, CrossEncoder
from pymongo import MongoClient

class OverlapChecker:
    def __init__(self, db_client=None):
        # Load environment configurations
        self.db_url = os.getenv("DB_URL", "mongodb://localhost:27017")
        self.embedding_model_name = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
        self.rerank_model_name = os.getenv("RERANK_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        
        self.enable_nli = os.getenv("ENABLE_NLI_VERIFICATION", "false").lower() in ("true", "1", "yes")
        self.ollama_api_url = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api/chat")
        self.ollama_model = os.getenv("OLLAMA_MODEL_NAME", "gemma")
        self.overlap_threshold = float(os.getenv("OVERLAP_THRESHOLD", "0.80"))

        # Initialize clients & models
        if db_client:
            self.client = db_client
        else:
            self.client = MongoClient(self.db_url)
            
        self.db = self.client["farmer_feedback"]
        self.gdb_col = self.db["gdb_entries"]

        print(f"Loading embedding model: {self.embedding_model_name}...")
        self.embed_model = SentenceTransformer(self.embedding_model_name)
        
        print(f"Loading reranking model: {self.rerank_model_name}...")
        self.rerank_model = CrossEncoder(self.rerank_model_name)

        # FAISS index properties
        self.index = None
        self.gdb_docs = [] # Stores GDB entries mapping to FAISS index IDs
        self.build_faiss_index()

    def build_faiss_index(self):
        """Fetches all GDB entries, computes embeddings if missing, and builds FAISS index."""
        print("Fetching GDB entries to build FAISS index...")
        entries = list(self.gdb_col.find({}))
        if not entries:
            print("Warning: No GDB entries found in 'farmer_feedback.gdb_entries'!")
            return

        embeddings_list = []
        self.gdb_docs = []

        for entry in entries:
            question = entry.get("question")
            if not question:
                continue

            # Use precalculated embedding if available, else compute it
            embedding = entry.get("embedding")
            if not embedding or not isinstance(embedding, list):
                embedding = self.embed_model.encode(question).tolist()
            
            embeddings_list.append(embedding)
            self.gdb_docs.append({
                "id": str(entry.get("_id")),
                "question": question,
                "answer": entry.get("answer", "")
            })

        if not embeddings_list:
            return

        # Convert to numpy array and normalize for Cosine Similarity (Inner Product)
        embeddings_np = np.array(embeddings_list).astype("float32")
        faiss.normalize_L2(embeddings_np)

        # Build Flat Index
        dimension = embeddings_np.shape[1]
        self.index = faiss.IndexFlatIP(dimension)
        self.index.add(embeddings_np)
        print(f"Successfully indexed {self.index.ntotal} GDB questions in FAISS.")

    def check_overlap(self, query_text):
        """
        Executes the 3-stage validation pipeline:
        Stage 1: FAISS vector similarity search
        Stage 2: Cross-Encoder reranking
        Stage 3: Local Gemma NLI check (if within gray area 0.70 - 0.85)
        """
        if not self.index or self.index.ntotal == 0:
            return False, None, 0.0, "No GDB entries to search against."

        # Stage 1: Vector Search
        query_vector = self.embed_model.encode(query_text).reshape(1, -1).astype("float32")
        faiss.normalize_L2(query_vector)

        # Retrieve top 5 closest candidates
        top_k = min(5, self.index.ntotal)
        scores, indices = self.index.search(query_vector, top_k)

        candidates = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            candidates.append(self.gdb_docs[idx])

        if not candidates:
            return False, None, 0.0, "No candidates found."

        # Stage 2: Cross-Encoder Reranking
        pairs = [[query_text, candidate["question"]] for candidate in candidates]
        rerank_scores = self.rerank_model.predict(pairs)

        # Zip and sort candidates by rerank scores descending
        ranked_candidates = sorted(
            zip(candidates, rerank_scores),
            key=lambda x: x[1],
            reverse=True
        )

        best_candidate, best_score = ranked_candidates[0]
        # Normalize score to 0-1 range (CrossEncoder output can vary)
        best_score = float(best_score)
        if best_score < 0.0:
            best_score = 0.0
        elif best_score > 1.0:
            # Handle standard logistic scale mapping if necessary, or just clamp
            best_score = min(best_score, 1.0)

        # Decision Logic based on Thresholds
        if best_score >= self.overlap_threshold:
            # High similarity -> Duplicate
            return True, best_candidate["id"], best_score, "High semantic similarity match."

        if best_score < 0.70:
            # Low similarity -> Gap
            return False, None, best_score, "Low semantic similarity match."

        # Stage 3: Gray Area NLI Check (0.70 <= score < 0.80)
        if self.enable_nli:
            is_covered = self._run_nli_check(query_text, best_candidate["question"], best_candidate["answer"])
            if is_covered:
                return True, best_candidate["id"], best_score, "NLI verification confirms the GDB answer covers the query."
            else:
                return False, None, best_score, "NLI verification indicates the query is NOT covered by the GDB answer."

        # Default fall back (NLI disabled): since it is below overlap threshold, it's a gap
        return False, None, best_score, "Below overlap threshold (NLI verification disabled)."

    def _run_nli_check(self, query, gdb_question, gdb_answer):
        """Queries local Gemma Ollama instance to check if GDB answer covers the user query."""
        prompt = f"""
Given the following verified Question and Answer in our database:
Verified Question: {gdb_question}
Verified Answer: {gdb_answer}

Determine if this Answer completely resolves this new user query:
User Query: {query}

Respond with only "YES" if the Answer covers the Query, or "NO" if it does not cover the Query. Do not add any explanation.
"""
        payload = {
            "model": self.ollama_model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "options": {
                "temperature": 0.0
            }
        }

        try:
            response = requests.post(self.ollama_api_url, json=payload, timeout=5)
            if response.status_code == 200:
                result_text = response.json().get("message", {}).get("content", "").strip().upper()
                return "YES" in result_text
        except Exception as e:
            print(f"Ollama NLI Request failed: {e}")
            
        return False

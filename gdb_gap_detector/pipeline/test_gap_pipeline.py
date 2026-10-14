import unittest
from unittest.mock import MagicMock, patch
import numpy as np
import os
import sys

# Ensure the pipeline folder is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from overlap_check import OverlapChecker

class TestOverlapChecker(unittest.TestCase):
    @patch('overlap_check.MongoClient')
    @patch('overlap_check.SentenceTransformer')
    @patch('overlap_check.CrossEncoder')
    def setUp(self, mock_cross_encoder, mock_transformer, mock_mongo_client):
        # Mock Mongo Database Setup
        self.mock_client = MagicMock()
        mock_mongo_client.return_value = self.mock_client
        self.mock_db = self.mock_client["farmer_feedback"]
        self.mock_col = self.mock_db["gdb_entries"]
        
        # Setup mock GDB entries
        self.mock_gdb_data = [
            {"_id": "g1", "question": "How to control aphids in mustard crop?", "answer": "Use Imidacloprid."},
            {"_id": "g2", "question": "Tomato leaf curl virus management", "answer": "Control whiteflies using yellow sticky traps."},
        ]
        self.mock_col.find.return_value = self.mock_gdb_data

        # Mock SentenceTransformer
        self.mock_embed_model = MagicMock()
        mock_transformer.return_value = self.mock_embed_model
        
        # Return mock 384-dim normalized vectors for GDB entries (all-MiniLM-L6-v2 is 384 dim)
        self.mock_embeddings = np.random.rand(2, 384).astype("float32")
        # Normalize
        self.mock_embeddings /= np.linalg.norm(self.mock_embeddings, axis=1, keepdims=True)
        self.mock_embed_model.encode.side_effect = lambda x: self.mock_embeddings[0] if "aphids" in x else self.mock_embeddings[1]

        # Mock CrossEncoder
        self.mock_rerank_model = MagicMock()
        mock_cross_encoder.return_value = self.mock_rerank_model
        # Mock predict to return 0.90 for similar queries, 0.40 for distinct queries
        self.mock_rerank_model.predict.side_effect = lambda pairs: np.array([0.92]) if "aphids" in pairs[0][0] else np.array([0.45])

        # Initialize OverlapChecker
        self.checker = OverlapChecker(db_client=self.mock_client)

    def test_faiss_index_builds(self):
        """Verify that the FAISS index is built with GDB entries."""
        self.assertIsNotNone(self.checker.index)
        self.assertEqual(self.checker.index.ntotal, 2)
        self.assertEqual(len(self.checker.gdb_docs), 2)
        self.assertEqual(self.checker.gdb_docs[0]["id"], "g1")

    def test_duplicate_check_matching(self):
        """Verify that similar questions are identified as duplicates."""
        # Query that is very similar to mustard aphids
        is_dup, match_id, score, explanation = self.checker.check_overlap("How do I kill aphids on my mustard plant?")
        self.assertTrue(is_dup)
        self.assertEqual(match_id, "g1")
        self.assertGreaterEqual(score, self.checker.overlap_threshold)

    def test_duplicate_check_gap(self):
        """Verify that distinct questions are identified as gaps."""
        # Query that is completely different
        is_dup, match_id, score, explanation = self.checker.check_overlap("What is the soil requirement for growing pomegranate?")
        self.assertFalse(is_dup)
        self.assertIsNone(match_id)
        self.assertLess(score, 0.70)

if __name__ == "__main__":
    unittest.main()

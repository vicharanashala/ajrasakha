"""Unit tests for GDB Gap Detector clustering worker logic."""

import os
import sys
import unittest

# Ensure 'ai' directory is in sys.path
ai_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from ajrasakha.gap_detector.clustering_worker import (
    extract_crop_from_text,
    diagnose_gap,
    compute_coverage_debt_score,
    _anonymize_user_id,
)


class TestClusteringWorker(unittest.TestCase):

    def test_anonymize_user_id(self):
        self.assertEqual(_anonymize_user_id(""), "anon_unknown")
        hashed = _anonymize_user_id("9876543210")
        self.assertTrue(hashed.startswith("farmer_"))
        self.assertEqual(len(hashed), 19)

    def test_extract_crop_from_text(self):
        self.assertEqual(extract_crop_from_text("kapas me keeda laga hai"), "Cotton")
        self.assertEqual(extract_crop_from_text("dhaan ki kheti kaise kare"), "Paddy")
        self.assertEqual(extract_crop_from_text("gehun me kitna urea dale"), "Wheat")
        self.assertEqual(extract_crop_from_text("random query without crop"), "General")

    def test_diagnose_gap_safety_escalation(self):
        diag, label, _ = diagnose_gap("chemical dosage mix for spray", "Cotton", 0.80)
        self.assertEqual(diag, "safety_escalation")
        self.assertEqual(label, "Safety Escalation")

    def test_diagnose_gap_missing_context(self):
        diag, label, _ = diagnose_gap("fix it", "General", 0.10)
        self.assertEqual(diag, "missing_context")
        self.assertEqual(label, "Missing Context")

    def test_diagnose_gap_score_thresholds(self):
        # Low score (< 0.35) -> missing_knowledge
        diag1, _, _ = diagnose_gap("unseen pest in paddy", "Paddy", 0.20)
        self.assertEqual(diag1, "missing_knowledge")

        # Medium score (0.35 <= score < 0.55) -> language_alias_gap
        diag2, _, _ = diagnose_gap("paddy disease treatment", "Paddy", 0.45)
        self.assertEqual(diag2, "language_alias_gap")

        # High score (>= 0.55) -> retrieval_failure
        diag3, _, _ = diagnose_gap("paddy stem borer remedy", "Paddy", 0.65)
        self.assertEqual(diag3, "retrieval_failure")

    def test_compute_coverage_debt_score(self):
        score = compute_coverage_debt_score(
            unique_farmers=10,
            week_growth_pct=20.0,
            is_missing_knowledge=True
        )
        # farmer_score (25) + growth_score (10) + urgency (15) + geo (10) + knowledge (10) = 70.0
        self.assertEqual(score, 70.0)


if __name__ == "__main__":
    unittest.main()

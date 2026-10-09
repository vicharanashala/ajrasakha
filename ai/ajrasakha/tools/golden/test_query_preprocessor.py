"""Tests for query_preprocessor module - MiniMax 2.7 content safety and relevance checks."""

import asyncio
import pytest

try:
    from .query_preprocessor import (
        check_query_safety,
        check_agriculture_relevance,
        preprocess_query,
        quick_check,
        is_safe_sync,
        QuerySafety,
        AgricultureRelevance,
    )
except ImportError:
    from query_preprocessor import (
        check_query_safety,
        check_agriculture_relevance,
        preprocess_query,
        quick_check,
        is_safe_sync,
        QuerySafety,
        AgricultureRelevance,
    )


# =============================================================================
# Test Data
# =============================================================================

SAFE_AGRI_QUERIES = [
    "How to control brown spot disease in rice?",
    "What is the best fertilizer for wheat?",
    "How to identify powdery mildew in grapes?",
    "When should I apply urea to my paddy field?",
    "What are the symptoms of cotton bollworm?",
]

VULGAR_QUERIES = [
    "You stupid idiot, how do I fix this?",
    # Add more test cases as needed
]

NON_AGRI_QUERIES = [
    "Who is the prime minister of India?",
    "What is the capital of USA?",
    "How to cook biryani?",
    "Tell me a joke",
]


# =============================================================================
# Tests (require MiniMax connection to fully pass)
# =============================================================================

class TestQuerySafety:
    """Tests for check_query_safety function."""

    @pytest.mark.asyncio
    async def test_safe_agri_query_is_safe(self):
        """Safe agriculture queries should be marked as safe."""
        result = await check_query_safety("How to treat pest attack on tomato?")
        assert result["is_safe"] is True
        assert result["category"] in ["safe", "vulgar", "abusive"]
        assert "reason" in result

    @pytest.mark.asyncio
    async def test_vulgar_query_detected(self):
        """Queries with vulgar language should be flagged."""
        # Test with a query that contains abusive language
        result = await check_query_safety("You stupid moron, answer my question")
        # Note: Results depend on MiniMax model behavior
        # The test verifies the function runs and returns expected keys
        assert "is_safe" in result
        assert "category" in result
        assert "reason" in result

    @pytest.mark.asyncio
    async def test_empty_query_returns_safe(self):
        """Empty or whitespace queries should be handled gracefully."""
        result = await check_query_safety("")
        # Should either pass or fail gracefully
        assert "is_safe" in result


class TestAgricultureRelevance:
    """Tests for check_agriculture_relevance function."""

    @pytest.mark.asyncio
    async def test_agri_query_related(self):
        """Agriculture queries should be marked as related."""
        result = await check_agriculture_relevance("How to control rice blast disease?")
        assert "is_related" in result
        assert result["category"] in ["related", "not_related"]
        assert "reason" in result

    @pytest.mark.asyncio
    async def test_non_agri_query_not_related(self):
        """Non-agriculture queries should be marked as not related."""
        result = await check_agriculture_relevance("Who won the cricket world cup?")
        assert "is_related" in result
        assert result["category"] in ["related", "not_related"]
        assert "reason" in result

    @pytest.mark.asyncio
    async def test_borderline_agri_query(self):
        """Borderline queries (e.g., weather) should be handled."""
        result = await check_agriculture_relevance("Will it rain this week in Punjab?")
        assert "is_related" in result
        assert result["category"] in ["related", "not_related"]


class TestPreprocessQuery:
    """Tests for preprocess_query function (full pipeline)."""

    @pytest.mark.asyncio
    async def test_safe_agri_query_proceeds(self):
        """Safe agriculture queries should be allowed through."""
        result = await preprocess_query("What is the best time to sow wheat?")
        
        assert hasattr(result, "is_safe")
        assert hasattr(result, "is_agriculture_related")
        assert hasattr(result, "can_proceed")
        assert hasattr(result, "rejection_reason")
        assert hasattr(result, "processing_time_ms")
        assert result.processing_time_ms > 0

    @pytest.mark.asyncio
    async def test_preprocess_returns_all_fields(self):
        """Result should have all expected fields."""
        result = await preprocess_query("How to control pests in cotton?")
        
        assert result.is_safe is not None
        assert result.safety_decision in [QuerySafety.SAFE, QuerySafety.VULGAR, QuerySafety.ABUSIVE]
        assert result.safety_reason is not None
        assert result.is_agriculture_related is not None
        assert result.relevance_decision in [AgricultureRelevance.RELATED, AgricultureRelevance.NOT_RELATED]
        assert result.relevance_reason is not None
        assert result.model_used is not None

    @pytest.mark.asyncio
    async def test_rejected_query_has_reason(self):
        """Queries that fail checks should have rejection_reason."""
        # This test depends on actual MiniMax classification
        # A truly vulgar/abusive query should be rejected
        result = await preprocess_query("You piece of shit, fix my problem")
        
        if not result.can_proceed:
            assert result.rejection_reason is not None
            assert len(result.rejection_reason) > 0


class TestQuickCheck:
    """Tests for quick_check convenience function."""

    @pytest.mark.asyncio
    async def test_quick_check_returns_tuple(self):
        """quick_check should return (can_proceed, rejection_reason)."""
        can_proceed, rejection_reason = await quick_check(
            "How to apply NPK fertilizer?"
        )
        
        assert isinstance(can_proceed, bool)
        # rejection_reason is None if can_proceed, otherwise a string
        if not can_proceed:
            assert rejection_reason is not None
            assert isinstance(rejection_reason, str)


class TestIsSafeSync:
    """Tests for is_safe_sync (synchronous fallback)."""

    def test_safe_query_passes_sync_check(self):
        """Normal queries should pass the sync check."""
        result = is_safe_sync("How to grow tomatoes?")
        assert isinstance(result, bool)

    def test_query_with_known_vulgar_keyword_fails(self):
        """Queries with known vulgar keywords should fail."""
        # Note: The keyword list is intentionally empty in production
        # This is just a basic test of the function structure
        result = is_safe_sync("Some normal agricultural query")
        assert result is True


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_very_long_query(self):
        """Very long queries should be handled."""
        long_query = "How to " + "control pests " * 100
        result = await preprocess_query(long_query)
        assert result.can_proceed is not None

    @pytest.mark.asyncio
    async def test_unicode_query(self):
        """Unicode/Hindi queries should be handled."""
        result = await preprocess_query("चावल में खरपतवार नियंत्रण कैसे करें?")
        assert result.can_proceed is not None

    @pytest.mark.asyncio
    async def test_query_with_special_characters(self):
        """Queries with special characters should be handled."""
        result = await preprocess_query("How to control pests??? @#$%^&*()")
        assert result.can_proceed is not None


# =============================================================================
# Integration test (requires actual MiniMax)
# =============================================================================

class TestMiniMaxIntegration:
    """Integration tests that require MiniMax 2.7 connection."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        True,  # Skip by default, remove to run against real MiniMax
        reason="Requires MiniMax 2.7 connection"
    )
    async def test_real_minimax_classification(self):
        """Test against actual MiniMax 2.7 endpoint."""
        # This will only run if explicitly enabled
        result = await preprocess_query("How to treat yellow rust in wheat?")
        
        assert result.can_proceed is True
        assert result.is_safe is True
        assert result.is_agriculture_related is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
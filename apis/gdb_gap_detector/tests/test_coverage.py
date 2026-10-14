import pytest

from coverage import compute_gap_analysis


@pytest.mark.asyncio
async def test_gap_analysis():

    metadata = {
        "state": "Odisha",
        "crop": "Rice",
    }

    result = await compute_gap_analysis(
        "Unknown farmer question",
        metadata,
    )

    assert "coverage_score" in result
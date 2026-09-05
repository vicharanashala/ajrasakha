import re
import pytest
from gdb_gap_detector.pipeline.extractor import extract_disclaimer_queries
from gdb_gap_detector.pipeline.reporter import assemble_gap_report, generate_markdown_report


@pytest.mark.asyncio
async def test_privacy_projection_strips_farmer_id(mock_mongo_db):
    """Ensure projection {"farmer_id": 0} strips farmer_id from retrieved documents."""
    logs, unique_map = await extract_disclaimer_queries(mock_mongo_db)

    assert len(logs) > 0
    for log in logs:
        assert not hasattr(log, "farmer_id")
        assert "farmer_id" not in log.model_dump()


@pytest.mark.asyncio
async def test_privacy_report_contains_no_phone_numbers(mock_mongo_db):
    """Ensure generated reports contain no phone numbers or PII strings."""
    logs, unique_map = await extract_disclaimer_queries(mock_mongo_db)

    report = assemble_gap_report(
        period_days=30,
        total_disclaimers=len(logs),
        unique_queries=len(unique_map),
        scored_clusters=[],
        heatmap_cells=[],
        recommendations=[],
        overlap_counts={"real_gap": len(logs)},
    )

    markdown_text = generate_markdown_report(report)
    json_text = report.model_dump_json()

    phone_pattern = re.compile(r"\+91[0-9]{10}")
    assert not phone_pattern.search(markdown_text)
    assert not phone_pattern.search(json_text)


def test_privacy_disclaimer_log_schema():
    """Verify DisclaimerLog class attributes exclude farmer_id."""
    from gdb_gap_detector.models import DisclaimerLog

    fields = DisclaimerLog.model_fields.keys()
    assert "farmer_id" not in fields
    assert "phone" not in fields
    assert "mobile" not in fields


@pytest.mark.asyncio
async def test_privacy_unique_map_has_no_pii(mock_mongo_db):
    """Verify unique query map aggregation contains no farmer_id."""
    _, unique_map = await extract_disclaimer_queries(mock_mongo_db)
    for q_hash, entry in unique_map.items():
        assert "farmer_id" not in entry
        for log in entry["logs"]:
            assert not hasattr(log, "farmer_id")

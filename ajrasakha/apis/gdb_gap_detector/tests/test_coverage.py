from datetime import datetime, timezone
from gdb_gap_detector.models import DisclaimerLog, GdbEntry
from gdb_gap_detector.pipeline.coverage import calculate_coverage_heatmap


def test_calculate_coverage_heatmap():
    """Test coverage heatmap cell calculation and outreach recommendations."""
    gdb_entries = [
        GdbEntry(
            _id="g1",
            question="How to control aphids in mustard crop?",
            answer="Spray Imidacloprid",
            domain="Pest Control",
            state="Punjab",
        )
    ]

    disclaimer_logs = [
        DisclaimerLog(
            _id="d1",
            query="Aphids control in mustard",
            domain="Pest Control",
            state="Punjab",
            status="unanswered",
        )
    ]

    heatmap, recs = calculate_coverage_heatmap(gdb_entries, disclaimer_logs)

    assert len(heatmap) > 0
    # Match cell for (Pest Control, Punjab)
    cell = next(c for c in heatmap if c.domain == "Pest Control" and c.state == "Punjab")
    assert cell.gdb_count == 1
    assert cell.disclaimer_count == 1
    assert cell.status == "partial"


def test_coverage_100_percent_when_no_disclaimers():
    """Test cell coverage is 100% when GDB entries exist and disclaimers count is 0."""
    gdb_entries = [
        GdbEntry(
            _id="g1",
            question="Organic farming tips",
            answer="Use compost",
            domain="Organic Farming",
            state="Kerala",
        )
    ]
    heatmap, recs = calculate_coverage_heatmap(gdb_entries, [])
    cell = next(c for c in heatmap if c.domain == "Organic Farming" and c.state == "Kerala")
    assert cell.coverage_score == 100.0
    assert cell.status == "good"
    assert len(recs) == 0


def test_coverage_outreach_recommendations_generation():
    """Test that outreach recommendations are triggered for state/domain combinations with disclaimers."""
    disclaimer_logs = [
        DisclaimerLog(
            _id=f"d_{i}",
            query="Disease question",
            domain="Crop Disease",
            state="Rajasthan",
            status="unanswered",
        )
        for i in range(5)
    ]
    _, recs = calculate_coverage_heatmap([], disclaimer_logs)
    assert len(recs) > 0
    rec = next(r for r in recs if r.target_state == "Rajasthan" and r.focus_domain == "Crop Disease")
    assert rec.gap_questions == 5
    assert rec.priority in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]


def test_coverage_empty_inputs():
    """Test coverage heatmap with zero GDB entries and zero disclaimers."""
    heatmap, recs = calculate_coverage_heatmap([], [])
    assert heatmap == []
    assert recs == []

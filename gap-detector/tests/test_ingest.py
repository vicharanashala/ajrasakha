from backend.app.ingest import load_disclaimer_queries, load_gdb_entries
from backend.app.ingest.disclaimer_sources import from_disclaimer_log, from_raw_query
from backend.app.ingest.gdb_source import from_gdb_entry


def test_disclaimer_sources(disclaimer_docs, raw_query_docs):
    logs = [q for q in (from_disclaimer_log(d) for d in disclaimer_docs) if q]
    assert len(logs) == 6
    assert logs[0].crop == "Wheat" and logs[0].domain == "Crop Disease" and logs[0].channel == "web"
    assert logs[2].crop == "Cotton"
    assert logs[4].state is None and logs[4].domain == "Off-topic" and logs[4].crop is None
    assert logs[5].language_code == "hi"  # Hindi query kept intact

    raws = [q for q in (from_raw_query(d) for d in raw_query_docs) if q]
    assert len(raws) == 3  # disclaimer_triggered=False is excluded
    assert raws[0].crop == "Rice" and raws[0].domain == "Crop Disease"
    assert raws[0].source_ref.startswith("gdb_gap_detector.raw_queries:")


def test_gdb_entries(gdb_docs):
    entries = [e for e in (from_gdb_entry(d) for d in gdb_docs) if e]
    assert len(entries) == 4
    assert entries[0].crop == "Cotton" and entries[0].domain == "Pest Control"
    assert entries[2].domain == "Off-topic" and entries[2].crop is None  # a greeting entry


def test_loaders_against_mongomock(mongo):
    queries = load_disclaimer_queries(mongo["farmer_feedback"], mongo["gdb_gap_detector"])
    entries = load_gdb_entries(mongo["farmer_feedback"])
    assert len(queries) == 9
    assert len(entries) == 4
    assert len({q.source_ref for q in queries}) == 9  # refs are unique across sources

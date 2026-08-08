"""
FIX 5: trends_store.py must use the real Postgres database at DATABASE_URL
for score history when it's set, falling back to SQLite otherwise - see
trends_store.py's module docstring. These tests mock psycopg2.connect (no
network, no real DB touched) to prove the dispatch and SQL actually run
correctly; test_trends.py's existing tests cover the SQLite fallback path
and force it via the force_sqlite_backend autouse fixture so a real
DATABASE_URL in the environment never diverts them here.
"""

from unittest.mock import patch

import pytest

from ajrasakha.evaluation import trends_store


class _FakeCursor:
    """Records every execute/executemany call; replays canned fetchall()
    results in call order (one list per SELECT, matching psycopg2's shape)."""

    def __init__(self, fetchall_results=None):
        self.executed = []
        self._fetchall_results = list(fetchall_results or [])

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def executemany(self, query, rows):
        self.executed.append((query, rows))

    def fetchall(self):
        return self._fetchall_results.pop(0) if self._fetchall_results else []

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor):
        self._cursor = cursor
        self.committed = False
        self.closed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


@pytest.fixture
def fake_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake-host/fake-db")


class TestActiveBackend:
    def test_postgres_when_database_url_set(self, fake_database_url):
        assert trends_store.active_backend() == "postgres"

    def test_sqlite_when_database_url_unset(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        assert trends_store.active_backend() == "sqlite"


class TestLogRunUsesPostgresWhenConfigured:
    def test_writes_rows_via_psycopg2_with_percent_s_placeholders(self, fake_database_url):
        cursor = _FakeCursor()
        conn = _FakeConnection(cursor)

        with patch("psycopg2.connect", return_value=conn) as mock_connect:
            timestamp = trends_store.log_run(
                {"Weather": {"FaithfulnessMetric": 0.9}},
                mode="live",
                run_timestamp="2026-07-28T00:00:00+00:00",
            )

        mock_connect.assert_called_once_with("postgresql://fake-host/fake-db")
        assert timestamp == "2026-07-28T00:00:00+00:00"
        assert conn.committed is True
        assert conn.closed is True

        schema_calls = [q for q, _ in cursor.executed if "CREATE TABLE IF NOT EXISTS quality_runs" in q]
        assert schema_calls

        insert_calls = [(q, p) for q, p in cursor.executed if "INSERT INTO quality_runs" in q]
        assert len(insert_calls) == 1
        query, rows = insert_calls[0]
        assert "%s" in query
        assert rows == [
            ("2026-07-28T00:00:00+00:00", "live", "Weather", "FaithfulnessMetric", 0.9)
        ]

    def test_empty_breakdown_ensures_schema_but_skips_insert(self, fake_database_url):
        cursor = _FakeCursor()
        conn = _FakeConnection(cursor)

        with patch("psycopg2.connect", return_value=conn):
            trends_store.log_run({}, mode="mock", run_timestamp="t1")

        assert not [q for q, _ in cursor.executed if "INSERT INTO quality_runs" in q]
        assert conn.closed is True

    def test_sqlite_ignores_database_url_when_unset(self, monkeypatch, tmp_path):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        db_path = tmp_path / "history.db"

        with patch("psycopg2.connect") as mock_connect:
            trends_store.log_run(
                {"Weather": {"FaithfulnessMetric": 0.9}},
                db_path=db_path,
                run_timestamp="t1",
            )

        mock_connect.assert_not_called()
        assert db_path.exists()


class TestFetchHistoryUsesPostgresWhenConfigured:
    def test_reads_rows_via_psycopg2_and_groups_into_runs(self, fake_database_url):
        cursor = _FakeCursor(
            fetchall_results=[
                [("2026-07-28T00:00:00+00:00",)],  # DISTINCT run_timestamp
                [("live", "Weather", "FaithfulnessMetric", 0.9)],  # rows for that run
            ]
        )
        conn = _FakeConnection(cursor)

        with patch("psycopg2.connect", return_value=conn) as mock_connect:
            runs = trends_store.fetch_history(last_n_runs=10)

        mock_connect.assert_called_once_with("postgresql://fake-host/fake-db")
        assert runs == [
            {
                "run_timestamp": "2026-07-28T00:00:00+00:00",
                "mode": "live",
                "domains": {"Weather": {"FaithfulnessMetric": 0.9}},
            }
        ]
        assert conn.closed is True

    def test_empty_history_returns_empty_list(self, fake_database_url):
        cursor = _FakeCursor(fetchall_results=[[]])
        conn = _FakeConnection(cursor)

        with patch("psycopg2.connect", return_value=conn):
            runs = trends_store.fetch_history()

        assert runs == []


class TestForceSqliteBypassesPostgresEvenWhenConfigured:
    """demo_project3.py's hand-seeded mode="mock-demo" proof must stay isolated
    in its own SQLite file even when a real DATABASE_URL is set - it must never
    land in the real Postgres baseline history. force_sqlite=True is that
    guarantee."""

    def test_log_run_force_sqlite_ignores_database_url(self, fake_database_url, tmp_path):
        db_path = tmp_path / "demo_history.db"

        with patch("psycopg2.connect") as mock_connect:
            trends_store.log_run(
                {"Weather": {"FaithfulnessMetric": 0.9}},
                db_path=db_path,
                run_timestamp="t1",
                force_sqlite=True,
            )

        mock_connect.assert_not_called()
        assert db_path.exists()

    def test_fetch_history_force_sqlite_ignores_database_url(self, fake_database_url, tmp_path):
        db_path = tmp_path / "demo_history.db"
        trends_store.log_run(
            {"Weather": {"FaithfulnessMetric": 0.9}},
            db_path=db_path,
            run_timestamp="t1",
            force_sqlite=True,
        )

        with patch("psycopg2.connect") as mock_connect:
            runs = trends_store.fetch_history(db_path=db_path, force_sqlite=True)

        mock_connect.assert_not_called()
        assert runs[0]["domains"]["Weather"]["FaithfulnessMetric"] == 0.9

    def test_active_backend_force_sqlite_reports_sqlite(self, fake_database_url):
        assert trends_store.active_backend(force_sqlite=True) == "sqlite"

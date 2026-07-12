-- eval_results table — Postgres schema for DeepEval answer quality results.
--
-- Consumed by ai/ajrasakha/evaluation/storage.py
--   save_eval_results() creates the table on first connection if absent
--   (executes the body of CREATE TABLE IF NOT EXISTS via the same module).
--   get_recent_results() reads back rows ordered by created_at DESC.
--
-- This file is the source of truth for the table shape.
-- storage.py mirrors the same shape in its sqlite-backed test harness
-- (with REAL/TIMESTAMP/SERIAL → REAL/TIMESTAMP/INTEGER PRIMARY KEY AUTOINCREMENT)
-- so the logic can be validated without a live Postgres connection.
--
-- Apply against the real ai-postgres instance (ai/docker-compose.yml):
--   PGPASSWORD=ai_secret psql -h localhost -U ai -d ai -f schema.sql
--
-- Or let storage.py do it on first save_eval_results() call.
--
-- Column rationale:
--   id                — primary key, auto-incrementing
--   question_id       — case identifier (string); nullable because AnswerRelevancy
--                       results from non-fixture runs may not carry a question_id
--   answer_relevancy_score  — float 0.0–1.0 (empty string "" stored as NULL when
--                             metric was disabled or skipped; see storage.py for
--                             the empty-string → NULL conversion)
--   answer_relevancy_passed — "PASS" | "FAIL" | "SKIPPED" | "DISABLED" | ""
--   faithfulness_status      — "PASS" | "FAIL" | "SKIPPED" | "DISABLED" | ""
--   contextual_relevancy_status — same status set as the two above
--   created_at        — row insert timestamp (server-side default)

CREATE TABLE IF NOT EXISTS eval_results (
    id                              SERIAL PRIMARY KEY,
    question_id                     TEXT,
    answer_relevancy_score          REAL,
    answer_relevancy_passed         TEXT,
    faithfulness_status             TEXT,
    contextual_relevancy_status     TEXT,
    created_at                      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for get_recent_results()'s ORDER BY created_at DESC + LIMIT N.
-- Without this index the query still works but does a full scan + sort on
-- every dashboard refresh. With it, recent-N queries are O(log n).
CREATE INDEX IF NOT EXISTS idx_eval_results_created_at
    ON eval_results (created_at DESC);

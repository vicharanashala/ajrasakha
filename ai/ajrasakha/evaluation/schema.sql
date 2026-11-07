-- Postgres schema for the Answer Evaluation Pipeline (Project 3).
--
-- Applied automatically by ajrasakha.evaluation.storage.ensure_schema(),
-- but kept here as a standalone file too, for teams that prefer to run
-- migrations explicitly (e.g. `psql $EVAL_POSTGRES_URL -f schema.sql`)
-- rather than relying on app-side auto-migration.

CREATE TABLE IF NOT EXISTS evaluation_runs (
    run_id UUID PRIMARY KEY,
    mode TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    total_cases INT,
    passed_cases INT
);

CREATE TABLE IF NOT EXISTS evaluation_case_results (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES evaluation_runs(run_id) ON DELETE CASCADE,
    case_name TEXT NOT NULL,
    domain TEXT,
    query TEXT,
    technical_pass BOOLEAN,
    routing_pass BOOLEAN,
    quality_overall_score DOUBLE PRECISION,
    quality_pass BOOLEAN,
    triage_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_metric_scores (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES evaluation_runs(run_id) ON DELETE CASCADE,
    case_name TEXT NOT NULL,
    domain TEXT,
    metric_name TEXT NOT NULL,
    score DOUBLE PRECISION,
    passed BOOLEAN,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_scores_domain_metric
    ON evaluation_metric_scores (domain, metric_name, created_at);

CREATE INDEX IF NOT EXISTS idx_case_results_domain
    ON evaluation_case_results (domain, created_at);

-- Example: per-domain quality trend over the last 30 days, for the
-- dashboard's "per-domain answer quality trends" view.
--
-- SELECT domain, metric_name, date_trunc('day', created_at) AS day,
--        avg(score) AS avg_score, count(*) AS n
-- FROM evaluation_metric_scores
-- WHERE created_at > now() - interval '30 days'
-- GROUP BY domain, metric_name, day
-- ORDER BY domain, metric_name, day;

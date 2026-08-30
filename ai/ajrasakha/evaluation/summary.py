import os
import uuid
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

DOMAINS = [
    "weather",
    "market",
    "soil",
    "schemes",
    "gdb_queries",
    "greetings",
]


def build_summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds a summary of the evaluation run including:
    - Technical and routing pass rates
    - Quality evaluation pass rates (DeepEval)
    - 6-domain breakdown for weather, market, soil, schemes, gdb, greetings
    """
    total = len(results)
    if total == 0:
        return {"total_cases": 0}

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed = sum(1 for r in results if r.get("tool_pass") is True)
    quality_passed = sum(1 for r in results if r.get("quality_overall_passed") is True)

    # Aggregate domain stats
    domain_stats: Dict[str, Dict[str, Any]] = {
        d: {
            "total": 0,
            "passed": 0,
            "relevance_scores": [],
            "faithfulness_scores": [],
            "gdb_match_scores": [],
            "agri_scores": [],
        }
        for d in DOMAINS
    }

    for r in results:
        domain = r.get("domain") or "gdb_queries"
        if domain not in domain_stats:
            domain_stats[domain] = {
                "total": 0,
                "passed": 0,
                "relevance_scores": [],
                "faithfulness_scores": [],
                "gdb_match_scores": [],
                "agri_scores": [],
            }

        domain_stats[domain]["total"] += 1
        if r.get("quality_overall_passed") is True or r.get("technical_pass") is True:
            domain_stats[domain]["passed"] += 1

        rel = r.get("relevance_score")
        if isinstance(rel, (int, float)):
            domain_stats[domain]["relevance_scores"].append(rel)

        faith = r.get("faithfulness_score")
        if isinstance(faith, (int, float)):
            domain_stats[domain]["faithfulness_scores"].append(faith)

        gdb = r.get("gdb_match_score")
        if isinstance(gdb, (int, float)):
            domain_stats[domain]["gdb_match_scores"].append(gdb)

        agri = r.get("agri_correctness_score")
        if isinstance(agri, (int, float)):
            domain_stats[domain]["agri_scores"].append(agri)

    domain_summary: Dict[str, Dict[str, Any]] = {}
    for d, stats in domain_stats.items():
        if stats["total"] > 0:
            avg_rel = round(sum(stats["relevance_scores"]) / len(stats["relevance_scores"]), 2) if stats["relevance_scores"] else 0.0
            avg_faith = round(sum(stats["faithfulness_scores"]) / len(stats["faithfulness_scores"]), 2) if stats["faithfulness_scores"] else 0.0
            avg_gdb = round(sum(stats["gdb_match_scores"]) / len(stats["gdb_match_scores"]), 2) if stats["gdb_match_scores"] else 0.0
            avg_agri = round(sum(stats["agri_scores"]) / len(stats["agri_scores"]), 2) if stats["agri_scores"] else 0.0
            overall = round((avg_rel + avg_faith + avg_gdb + avg_agri) / 4.0, 2)

            domain_summary[d] = {
                "total_cases": stats["total"],
                "passed_cases": stats["passed"],
                "pass_rate": f"{(stats['passed'] / stats['total']) * 100:.1f}%",
                "avg_relevance": avg_rel,
                "avg_faithfulness": avg_faith,
                "avg_gdb_match": avg_gdb,
                "avg_agri_correctness": avg_agri,
                "overall_domain_score": overall,
            }

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed": routing_passed,
        "tool_passed": tool_passed,
        "quality_passed": quality_passed,
        "domain_breakdown": domain_summary,
    }


def init_eval_db(conn) -> None:
    """Creates the PostgreSQL tables for evaluation storage if they do not exist."""
    create_tables_sql = """
    CREATE TABLE IF NOT EXISTS eval_runs (
        run_id VARCHAR(64) PRIMARY KEY,
        branch VARCHAR(100),
        commit_hash VARCHAR(40),
        model_version VARCHAR(100),
        judge_model VARCHAR(100),
        total_test_cases INT,
        passed_test_cases INT,
        overall_quality_score NUMERIC(5, 3),
        duration_seconds NUMERIC(8, 2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eval_test_cases (
        test_case_id VARCHAR(64) PRIMARY KEY,
        run_id VARCHAR(64) REFERENCES eval_runs(run_id) ON DELETE CASCADE,
        case_name VARCHAR(150),
        domain VARCHAR(50),
        query TEXT,
        expected_output TEXT,
        actual_output TEXT,
        overall_passed BOOLEAN,
        relevance_score NUMERIC(5, 3),
        faithfulness_score NUMERIC(5, 3),
        gdb_match_score NUMERIC(5, 3),
        agri_correctness_score NUMERIC(5, 3),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eval_metric_scores (
        score_id VARCHAR(64) PRIMARY KEY,
        test_case_id VARCHAR(64) REFERENCES eval_test_cases(test_case_id) ON DELETE CASCADE,
        metric_name VARCHAR(100),
        score NUMERIC(5, 3),
        passed BOOLEAN,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eval_domain_summaries (
        summary_id VARCHAR(64) PRIMARY KEY,
        run_id VARCHAR(64) REFERENCES eval_runs(run_id) ON DELETE CASCADE,
        domain VARCHAR(50),
        total_cases INT,
        passed_cases INT,
        avg_relevance NUMERIC(5, 3),
        avg_faithfulness NUMERIC(5, 3),
        avg_gdb_match NUMERIC(5, 3),
        avg_agri_correctness NUMERIC(5, 3),
        overall_domain_score NUMERIC(5, 3),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    """
    with conn.cursor() as cur:
        cur.execute(create_tables_sql)
    conn.commit()


def log_evaluation_to_postgres(
    run_id: str,
    results: List[Dict[str, Any]],
    summary: Dict[str, Any],
    duration: float = 0.0,
    model_version: str = "claude-3-5-sonnet",
    branch: str = "main",
    commit_hash: str = "local",
) -> bool:
    """Logs evaluation run and test cases to PostgreSQL."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("[Eval DB] DATABASE_URL not set; skipping database logging.")
        return False

    try:
        import psycopg2
        conn = psycopg2.connect(db_url)
        init_eval_db(conn)

        domain_breakdown = summary.get("domain_breakdown", {})
        total_cases = summary.get("total_cases", len(results))
        passed_cases = summary.get("quality_passed", 0)
        overall_score = (passed_cases / total_cases) if total_cases > 0 else 0.0

        with conn.cursor() as cur:
            # 1. Insert Run
            cur.execute("""
                INSERT INTO eval_runs (run_id, branch, commit_hash, model_version, judge_model, total_test_cases, passed_test_cases, overall_quality_score, duration_seconds)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id) DO NOTHING;
            """, (run_id, branch, commit_hash, model_version, "claude-3-5-sonnet", total_cases, passed_cases, overall_score, duration))

            # 2. Insert Test Cases and Metrics
            for r in results:
                test_case_id = str(uuid.uuid4())
                case_name = r.get("name", "unnamed_case")
                domain = r.get("domain", "gdb_queries")
                query = r.get("query", "")
                actual = r.get("response_text", "")
                expected = r.get("expected_output", "")
                passed = bool(r.get("quality_overall_passed", r.get("technical_pass", False)))

                rel_s = r.get("relevance_score") if isinstance(r.get("relevance_score"), (int, float)) else 0.0
                faith_s = r.get("faithfulness_score") if isinstance(r.get("faithfulness_score"), (int, float)) else 0.0
                gdb_s = r.get("gdb_match_score") if isinstance(r.get("gdb_match_score"), (int, float)) else 0.0
                agri_s = r.get("agri_correctness_score") if isinstance(r.get("agri_correctness_score"), (int, float)) else 0.0

                cur.execute("""
                    INSERT INTO eval_test_cases (test_case_id, run_id, case_name, domain, query, expected_output, actual_output, overall_passed, relevance_score, faithfulness_score, gdb_match_score, agri_correctness_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (test_case_id, run_id, case_name, domain, query, expected, actual, passed, rel_s, faith_s, gdb_s, agri_s))

                # Insert metric details
                metrics_to_log = [
                    ("relevance", rel_s, bool(r.get("relevance_passed", False)), r.get("relevance_reason", "")),
                    ("faithfulness", faith_s, bool(r.get("faithfulness_passed", False)), r.get("faithfulness_reason", "")),
                    ("gdb_match", gdb_s, bool(r.get("gdb_match_passed", False)), r.get("gdb_match_reason", "")),
                    ("agri_correctness", agri_s, bool(r.get("agri_correctness_passed", False)), r.get("agri_correctness_reason", "")),
                ]

                for m_name, m_score, m_passed, m_reason in metrics_to_log:
                    cur.execute("""
                        INSERT INTO eval_metric_scores (score_id, test_case_id, metric_name, score, passed, reason)
                        VALUES (%s, %s, %s, %s, %s, %s);
                    """, (str(uuid.uuid4()), test_case_id, m_name, m_score, m_passed, m_reason))

            # 3. Insert Domain Summaries
            for d_name, d_data in domain_breakdown.items():
                cur.execute("""
                    INSERT INTO eval_domain_summaries (summary_id, run_id, domain, total_cases, passed_cases, avg_relevance, avg_faithfulness, avg_gdb_match, avg_agri_correctness, overall_domain_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    str(uuid.uuid4()),
                    run_id,
                    d_name,
                    d_data.get("total_cases", 0),
                    d_data.get("passed_cases", 0),
                    d_data.get("avg_relevance", 0.0),
                    d_data.get("avg_faithfulness", 0.0),
                    d_data.get("avg_gdb_match", 0.0),
                    d_data.get("avg_agri_correctness", 0.0),
                    d_data.get("overall_domain_score", 0.0),
                ))

        conn.commit()
        conn.close()
        print(f"[Eval DB] Successfully logged run {run_id} to PostgreSQL database.")
        return True
    except Exception as exc:
        print(f"[Eval DB Error] Failed to persist evaluation results to PostgreSQL: {exc}")
        return False
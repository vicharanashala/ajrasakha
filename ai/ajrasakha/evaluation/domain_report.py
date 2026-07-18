"""
domain_report — per-domain quality report for PS3 baseline deliverables.

Takes a list of evaluate_response_quality() result dicts (one per
case) and produces a per-domain breakdown of:

  - case count
  - AnswerRelevancy mean score + pass rate
  - Faithfulness skip count
  - ContextualRelevancy skip count
  - gdb_match_score mean (when assessed)
  - agricultural_correctness mean (when assessed) + per-facet pass rates
  - assessed vs unassessed facet counts (transparency: surfaces what
    we did and did not measure, instead of hiding it)

PS3 brief asks for "Domain-level quality dashboards" and "Baseline
quality report covering: Weather, Market, Soil, Schemes, GDB
Queries, Greetings". This module produces both:
  - a dict suitable for machine consumption (e.g. dashboard JSON)
  - a markdown table suitable for human review (PR comments, doc)

Domains are extracted from result["expected_metadata"]["domain"]
which the loader (gdb_fixtures.py) populates either from the
fixture's metadata.domain field or from a top-level domain field
on legacy flat fixtures. Cases without a domain are bucketed as
"unspecified" so the report is never empty.
"""

from __future__ import annotations

from typing import Iterable


# ===========================================================================
# Public API
# ===========================================================================

def build_domain_report(results: list[dict]) -> dict:
    """
    Build a per-domain quality report from a list of eval_result dicts.

    Parameters
    ----------
    results : list[dict]
        Per-case result dicts from evaluate_response_quality(). The
        runner adds "question_id" and "query" keys; the loader adds
        "expected_metadata" to the source case (which the runner
        forwards as result["expected_metadata"]).

    Returns
    -------
    dict
        {
          "domains": [domain_name, ...],     # ordered, alphabetical
          "by_domain": {                     # per-domain stats
            domain_name: {
              "case_count": int,
              "answer_relevancy": {evaluated, passed, mean_score},
              "faithfulness":    {skipped},
              "contextual_relevancy": {skipped},
              "gdb_match_score":  {evaluated, mean_score},
              "agricultural_correctness": {
                  evaluated, mean_score,
                  facets: {
                      crop:      {assessed, passed, pass_rate},
                      treatment: {assessed, passed, pass_rate},
                      regional:  {assessed, passed, pass_rate},
                  },
              },
            },
            ...
          },
          "totals": {...},                   # population-level rollup (mirrors
                                             # build_summary for cross-check)
        }
    """
    by_domain: dict[str, list[dict]] = {}
    for r in results:
        meta = r.get("expected_metadata") or {}
        domain = meta.get("domain") or "unspecified"
        by_domain.setdefault(domain, []).append(r)

    return {
        "domains":  sorted(by_domain.keys()),
        "by_domain": {d: _per_domain_stats(rs) for d, rs in by_domain.items()},
        "totals":   _per_domain_stats(results),  # same shape, population-level
    }


def render_markdown(report: dict, title: str = "Per-Domain Quality Report") -> str:
    """
    Render a domain_report dict as a markdown table for human review.

    Output sections:
      1. Per-domain row: case_count + AR + F skipped + CR skipped +
         gdb_match mean + agricultural mean
      2. Per-domain agricultural facet breakdown (if any assessed)
      3. Totals row matching the runner's summary block

    Returns
    -------
    str
        The markdown text. Caller writes it to a file, prints it, or
        pastes it into a PR description.
    """
    out: list[str] = []
    out.append(f"# {title}\n")
    out.append("")
    if not report["by_domain"]:
        out.append("_(no results to report)_\n")
        return "\n".join(out)

    # ── Section 1: per-domain rollup ───────────────────────────────────
    out.append("## Per-domain rollup\n")
    out.append("")
    out.append("| Domain | Cases | AR mean | AR pass% | F skip | CR skip | gdb_match mean | agri mean |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|")
    for d in report["domains"]:
        s = report["by_domain"][d]
        ar = s["answer_relevancy"]
        out.append(
            f"| {d} "
            f"| {s['case_count']} "
            f"| {_fmt(ar.get('mean_score'))} "
            f"| {_fmt_pct(ar.get('pass_rate'))} "
            f"| {s['faithfulness']['skipped']} "
            f"| {s['contextual_relevancy']['skipped']} "
            f"| {_fmt(s['gdb_match_score'].get('mean_score'))} "
            f"| {_fmt(s['agricultural_correctness'].get('mean_score'))} |"
        )
    out.append("")

    # ── Section 2: agricultural_correctness facet breakdown ───────────
    has_any_assessed = any(
        _any_facet_assessed(report["by_domain"][d]["agricultural_correctness"]["facets"])
        for d in report["domains"]
    )
    if has_any_assessed:
        out.append("## Agricultural correctness facets by domain\n")
        out.append("")
        out.append("| Domain | crop pass% (n) | treatment pass% (n) | regional pass% (n) |")
        out.append("|---|---|---|---|")
        for d in report["domains"]:
            facets = report["by_domain"][d]["agricultural_correctness"]["facets"]
            row = f"| {d} "
            for facet in ("crop", "treatment", "regional"):
                f = facets[facet]
                if f["assessed"] == 0:
                    row += f"| _({f['assessed']} assessed)_ |"
                else:
                    row += f"| {_fmt_pct(f['pass_rate'])} ({f['passed']}/{f['assessed']}) |"
            out.append(row + "|")
        out.append("")

    # ── Section 3: totals ──────────────────────────────────────────────
    out.append("## Totals (all domains combined)\n")
    out.append("")
    t = report["totals"]
    out.append(f"- Cases: **{t['case_count']}**")
    ar = t["answer_relevancy"]
    out.append(
        f"- AnswerRelevancy: mean={_fmt(ar.get('mean_score'))}, "
        f"pass={ar.get('passed', 0)}/{ar.get('evaluated', 0)} "
        f"({_fmt_pct(ar.get('pass_rate'))})"
    )
    out.append(f"- Faithfulness skipped: {t['faithfulness']['skipped']}")
    out.append(f"- ContextualRelevancy skipped: {t['contextual_relevancy']['skipped']}")
    gms = t["gdb_match_score"]
    out.append(
        f"- gdb_match_score: evaluated={gms.get('evaluated', 0)}, "
        f"mean={_fmt(gms.get('mean_score'))}"
    )
    ags = t["agricultural_correctness"]
    out.append(
        f"- agricultural_correctness: evaluated={ags.get('evaluated', 0)}, "
        f"mean={_fmt(ags.get('mean_score'))}"
    )
    for facet in ("crop", "treatment", "regional"):
        f = ags["facets"][facet]
        if f["assessed"] > 0:
            out.append(
                f"  - facet `{facet}`: {_fmt_pct(f['pass_rate'])} "
                f"({f['passed']}/{f['assessed']} assessed)"
            )
    return "\n".join(out) + "\n"


# ===========================================================================
# Internal — stats helpers
# ===========================================================================

def _per_domain_stats(results: list[dict]) -> dict:
    """Build the per-domain (or per-population) stats dict."""
    return {
        "case_count": len(results),
        "answer_relevancy":         _answer_relevancy_stats(results),
        "faithfulness":             _skip_count(results, "faithfulnessmetric_passed"),
        "contextual_relevancy":     _skip_count(results, "contextualrelevancymetric_passed"),
        "gdb_match_score":          _gdb_match_stats(results),
        "agricultural_correctness": _agricultural_correctness_stats(results),
    }


def _answer_relevancy_stats(results: list[dict]) -> dict:
    evaluated = [r for r in results if r.get("answerrelevancymetric_passed") in ("PASS", "FAIL")]
    passed = sum(1 for r in evaluated if r.get("answerrelevancymetric_passed") == "PASS")
    scores = [_parse_score(r.get("answerrelevancymetric_score")) for r in evaluated]
    valid = [s for s in scores if s is not None]
    mean = round(sum(valid) / len(valid), 4) if valid else None
    return {
        "evaluated": len(evaluated),
        "passed":    passed,
        "pass_rate": round(passed / len(evaluated), 4) if evaluated else None,
        "mean_score": mean,
    }


def _skip_count(results: list[dict], key: str) -> dict:
    return {"skipped": sum(1 for r in results if r.get(key) == "SKIPPED")}


def _gdb_match_stats(results: list[dict]) -> dict:
    ran = [r for r in results if r.get("gdb_match_score_method") not in (None, "", "not_applicable")]
    scores = [_parse_score(r.get("gdb_match_score_score")) for r in ran]
    valid = [s for s in scores if s is not None]
    return {
        "evaluated":  len(ran),
        "mean_score": round(sum(valid) / len(valid), 4) if valid else None,
    }


def _agricultural_correctness_stats(results: list[dict]) -> dict:
    """Per-facet pass rates for agricultural_correctness, scoped to the given results."""
    ran = [
        r for r in results
        if r.get("agriculturalcorrectness_facets_assessed") not in (None, "", "not_applicable")
    ]
    scores = [_parse_score(r.get("agriculturalcorrectness_score")) for r in ran]
    valid = [s for s in scores if s is not None]
    mean = round(sum(valid) / len(valid), 4) if valid else None

    facets: dict[str, dict] = {}
    for facet in ("crop", "treatment", "regional"):
        passed = 0
        assessed_count = 0
        for r in ran:
            assessed_str = r.get("agriculturalcorrectness_facets_assessed") or ""
            if facet not in assessed_str.split(","):
                continue
            assessed_count += 1
            score = _parse_score(r.get(f"agriculturalcorrectness_facets_{facet}"))
            if score is not None and score >= 1.0:
                passed += 1
        rate = round(passed / assessed_count, 4) if assessed_count else None
        facets[facet] = {
            "assessed":   assessed_count,
            "passed":     passed,
            "pass_rate":  rate,
        }

    return {
        "evaluated":  len(ran),
        "mean_score": mean,
        "facets":     facets,
    }


def _any_facet_assessed(facets: dict) -> bool:
    return any(f.get("assessed", 0) > 0 for f in facets.values())


# ===========================================================================
# Internal — small utilities (kept private; no external reuse intended)
# ===========================================================================

def _parse_score(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt(value) -> str:
    """Format a numeric value as a string; None → 'N/A'."""
    if value is None:
        return "N/A"
    return f"{value:.4f}" if isinstance(value, float) else str(value)


def _fmt_pct(value) -> str:
    """Format a 0..1 ratio as a percentage; None → 'N/A'."""
    if value is None:
        return "N/A"
    return f"{value * 100:.1f}%"

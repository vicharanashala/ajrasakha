"""Run the quality checks over a file of answers and save the results in the
shape the GDB Cleaning page uses.

    python run_gdb_cleaning.py answers.xlsx --state "Madhya Pradesh" --limit 1000
    python run_gdb_cleaning.py answers.json --out data/results.json

Input is an .xlsx (first sheet) or .json list. Column names are matched
loosely, see COLUMN_ALIASES. Results are saved every 50 answers, so a
stopped run can be started again with the same command and carries on.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

PROJECT_DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIRECTORY / "checker"))

from check_report import _check_result, check_entry  # noqa: E402,F401  (also imported from here by gdb_cleaning_db)
from result_state import not_applicable_result  # noqa: E402
from run_checker import CHECK_GROUPS, run_until_complete  # noqa: E402

COLUMN_ALIASES = {
    "id": ("id", "answer_id", "answerid", "question_id", "questionid", "qid", "_id"),
    "question": ("question", "question_text", "questiontext", "query"),
    "answer": ("answer", "answer_text", "answertext", "final_answer"),
    "crop": ("crop", "normalized_crop", "normalizedcrop"),
    "state": ("state",),
    "domain": ("domain",),
    "sources": ("sources", "source_list"),
    "source": ("source", "source_url", "sourceurl", "url"),
    "page": ("page", "page_number", "pages", "pagenumber"),
    "source_name": ("source_name", "sourcename", "source_type"),
}


def _key(name: Any) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", str(name or "").strip().lower()).strip("_")


def _pick(row: dict[str, Any], field: str) -> Any:
    for alias in COLUMN_ALIASES[field]:
        if alias in row and row[alias] not in (None, ""):
            return row[alias]
    return None


def _parse_sources(row: dict[str, Any]) -> list[dict[str, str]]:
    raw = _pick(row, "sources")
    sources: list[Any] = []
    if isinstance(raw, list):
        sources = raw
    elif isinstance(raw, str) and raw.strip().startswith("["):
        for parse in (json.loads, ast.literal_eval):
            try:
                sources = parse(raw)
                break
            except (ValueError, SyntaxError):
                continue
    if not sources:
        # one source in plain columns, or numbered ones: source_1, page_1, ...
        numbered = sorted({m.group(1) for k in row if (m := re.search(r"_(\d+)$", k))})
        suffixes = [f"_{n}" for n in numbered] or [""]
        for suffix in suffixes:
            pick = lambda field: next(
                (row[a + suffix] for a in COLUMN_ALIASES[field] if row.get(a + suffix) not in (None, "")),
                None,
            )
            if pick("source") or pick("page"):
                sources.append({"source": pick("source"), "page": pick("page"), "sourceName": pick("source_name")})
    return [
        {
            "source": str(s.get("source") or ""),
            "page": str(s.get("page") or ""),
            "sourceName": str(s.get("sourceName") or s.get("source_name") or ""),
        }
        for s in sources
        if isinstance(s, dict)
    ]


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        records = json.loads(path.read_text(encoding="utf-8"))
        rows = [{_key(k): v for k, v in record.items()} for record in records]
    else:
        import openpyxl

        sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        table = list(sheet.iter_rows(values_only=True))
        headers = [_key(h) for h in table[0]]
        rows = [dict(zip(headers, values)) for values in table[1:] if any(values)]

    answers = []
    for number, row in enumerate(rows, start=1):
        question, answer = _pick(row, "question"), _pick(row, "answer")
        if not question or not answer:
            continue
        answers.append({
            "answer_id": str(_pick(row, "id") or f"row-{number}"),
            "question_text": str(question),
            "answer_text": str(answer),
            "crop": str(_pick(row, "crop") or ""),
            "state": str(_pick(row, "state") or ""),
            "domain": str(_pick(row, "domain") or ""),
            "sources": _parse_sources(row),
        })
    return answers


def _dose_uniformity_not_applicable(result: dict[str, Any]) -> None:
    # still "deferred" after the whole batch ran means there was nothing to compare with
    check = (result.get("parameters", {}).get("chemical") or {}).get("uniformity_of_dose")
    if check and check.get("execution") == "DEFERRED":
        result["parameters"]["chemical"]["uniformity_of_dose"] = not_applicable_result(
            "No other answer shares this chemical, crop and unit to compare with"
        )


def to_item(raw: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """One answer with the result of each check, as the GDB Cleaning page expects it."""
    _dose_uniformity_not_applicable(result)
    parameters = result.get("parameters") or {}
    checks = []
    for category, names in CHECK_GROUPS.items():
        for name in names:
            checks.append(check_entry(name, category, (parameters.get(category) or {}).get(name)))
    flags = [c["parameter"] for c in checks if c["result"] == "FAIL"]
    not_evaluated = [c["parameter"] for c in checks if c["result"] == "NOT_EVALUATED"]
    return {
        "id": raw["answer_id"],
        "question": raw["question_text"],
        "answer": raw["answer_text"],
        "state": raw["state"],
        "crop": raw["crop"],
        "domain": raw["domain"],
        "sources": [
            {"sourceName": s["sourceName"], "source": s["source"], "page": s["page"]}
            for s in raw["sources"]
        ],
        "checks": checks,
        "flags": flags,
        "notEvaluated": not_evaluated,
        "correctedAnswer": None,
        "status": "todo" if flags or not_evaluated else "clean",
        "checkedAt": result.get("checked_at"),
        "pipelineVersion": result.get("pipeline_version"),
        "model": result.get("model"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path)
    parser.add_argument("--state", help="only answers from this state")
    parser.add_argument("--limit", type=int, help="only the first N answers (after the state filter)")
    parser.add_argument("--out", type=Path, default=PROJECT_DIRECTORY / "data" / "gdb_cleaning_results.json")
    parser.add_argument("--workers", type=int, default=None)
    args = parser.parse_args()

    answers = load_rows(args.input)
    if args.state:
        answers = [a for a in answers if a["state"].strip().lower() == args.state.strip().lower()]
    if args.limit:
        answers = answers[: args.limit]
    if not answers:
        sys.exit("No answers to run (check the file, the column names and the --state value).")

    print(f"{len(answers)} answers from {args.input.name}", flush=True)
    started = time.time()
    results = run_until_complete(
        answers,
        max_workers=args.workers,
        checkpoint_path=args.out.with_suffix(".partial.json"),
        chunk_size=50,
    )
    items = [to_item(raw, result) for raw, result in zip(answers, results)]
    args.out.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    args.out.with_suffix(".partial.json").unlink(missing_ok=True)

    elapsed = time.time() - started
    flagged = [i for i in items if i["flags"]]
    incomplete = [i for i in items if i["notEvaluated"]]
    flag_counts = Counter(flag for i in items for flag in i["flags"])
    print(f"\nDone in {elapsed / 60:.1f} min ({elapsed / len(items):.1f} s per answer)")
    print(f"with flags: {len(flagged)} of {len(items)} | some checks could not run: {len(incomplete)}")
    print("most common failures:", flag_counts.most_common(6))
    print(f"saved to {args.out}")


if __name__ == "__main__":
    main()

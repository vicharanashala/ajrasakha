"""Seed the gdb_cleaning collection from answers and questions, then run the checks on it.

    python gdb_cleaning_db.py seed --limit 1 --state Punjab --crop Paddy
    python gdb_cleaning_db.py run --limit 1
    python gdb_cleaning_db.py run --limit 40000 --slice 500
    python gdb_cleaning_db.py rerun
    python gdb_cleaning_db.py dose-pass --since 2026-11-18 --yes
    python gdb_cleaning_db.py correct --limit 20
    python gdb_cleaning_db.py correct --apply
    python gdb_cleaning_db.py chem-pass
    python gdb_cleaning_db.py chem-pass --apply

seed  copies final answers (with their question) into gdb_cleaning as "pending".
      It only reads answers and questions, and never replaces a document that exists.
run   runs the 13 checks on pending documents and saves the result on the same document.
      It works in slices and saves each slice as soon as it is done, so a stopped run
      keeps everything finished and the next run carries on with what is still pending.
rerun runs again the answers where a check could not run, and replaces only those checks.
dose-pass compares doses across all answers in the collection and updates the dose check
      only on the answers checked since --since, so earlier answers are not touched.
correct drafts a corrected answer for flagged answers a rewrite can help, into a local preview file.
chem-pass runs the current chemical check, with its model step, on answers already checked.

The connection string is read from MONGODB_URI in .env.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from bson import ObjectId
from pymongo import MongoClient

PROJECT_DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIRECTORY / "checker"))
load_dotenv(PROJECT_DIRECTORY / ".env")

from run_checker import run_until_complete  # noqa: E402
from run_gdb_cleaning import (  # noqa: E402
    _check_result,
    _dose_uniformity_not_applicable,
    check_entry,
    to_item,
)
from chem_checker import check_banned_chemicals  # noqa: E402
from chem_llm import OK, find_chemical_mentions  # noqa: E402
from correction import problems_for, write_correction  # noqa: E402
from normalizer import normalize_answer  # noqa: E402
from uniformity_checker import run_uniformity_checks  # noqa: E402

DATABASE = os.getenv("MONGODB_DATABASE", "agriai")
COLLECTION = "gdb_cleaning"
BATCH = 200

# set from --since: only answers checked on or after this moment may be read or changed
# by rerun, chem-pass, correct and dose-pass, so answers checked earlier are left as they are
SINCE: datetime | None = None


def _new_only(query: dict) -> dict:
    return query if SINCE is None else {**query, "checkedAt": {"$gte": SINCE}}


def get_db():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        sys.exit("MONGODB_URI is not set in .env")
    return MongoClient(uri, serverSelectionTimeoutMS=20000)[DATABASE]


def _text(value) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or value.get("cropName") or "")
    return str(value or "")


def _document(answer: dict, question: dict) -> dict:
    details = question.get("details") or {}
    domain = details.get("domain")
    return {
        "answerId": answer["_id"],
        "questionId": answer["questionId"],
        "question": question.get("question") or "",
        "answer": answer.get("answer") or "",
        "state": _text(details.get("state")),
        "crop": _text(details.get("normalised_crop") or details.get("crop")),
        "domain": ", ".join(domain) if isinstance(domain, list) else _text(domain),
        "sources": [
            {
                "sourceName": str(s.get("sourceName") or ""),
                "source": str(s.get("source") or ""),
                "page": "" if s.get("page") in (None, "") else str(s["page"]),
            }
            for s in (answer.get("sources") or [])
            if isinstance(s, dict)
        ],
        "status": "pending",
        "checks": [],
        "flags": [],
        "notEvaluated": [],
        "correctedAnswer": None,
        "checkedAt": None,
        "pipelineVersion": None,
        "model": None,
        "reviewedBy": None,
        "reviewedAt": None,
    }


def seed(limit: int, state: str | None, crop: str | None) -> None:
    db = get_db()
    already = set(db[COLLECTION].distinct("answerId"))
    question_filter = {}
    if state:
        question_filter["details.state"] = state
    if crop:
        question_filter["details.normalised_crop"] = crop
    created = 0
    questions = db.questions.find(question_filter, {"question": 1, "details": 1}).batch_size(BATCH)
    batch: dict = {}

    def flush() -> None:
        nonlocal created
        if not batch:
            return
        answers = db.answers.find(
            {"isFinalAnswer": True, "questionId": {"$in": list(batch)}}, {"answer_embedding": 0}
        )
        for answer in answers:
            if created >= limit:
                break
            if answer["_id"] in already:
                continue
            document = _document(answer, batch[answer["questionId"]])
            db[COLLECTION].update_one(
                {"answerId": answer["_id"]}, {"$setOnInsert": document}, upsert=True
            )
            already.add(answer["_id"])
            created += 1
        batch.clear()
        print(f"{created} added so far", flush=True)

    for question in questions:
        if created >= limit:
            break
        batch[question["_id"]] = question
        if len(batch) >= BATCH:
            flush()
    if created < limit:
        flush()
    print(f"{created} document(s) added to {COLLECTION}")


def _raw(doc: dict) -> dict:
    return {
        "answer_id": str(doc["answerId"]),
        "question_text": doc["question"],
        "answer_text": doc["answer"],
        "crop": doc["crop"],
        "state": doc["state"],
        "domain": doc["domain"],
        "sources": doc["sources"],
    }


def _save_slice(db, pending: list[dict], results: list[dict]) -> tuple[int, int]:
    """Save the result of every answer in the slice. Returns (saved, with a check that could not run)."""
    saved = incomplete = 0
    for doc, result in zip(pending, results):
        item = to_item(_raw(doc), result)
        written = db[COLLECTION].update_one(
            {"_id": doc["_id"], "status": "pending"},
            {"$set": {
                "checks": item["checks"],
                "flags": item["flags"],
                "notEvaluated": item["notEvaluated"],
                "status": item["status"],
                "checkedAt": datetime.now(timezone.utc),
                "pipelineVersion": item["pipelineVersion"],
                "model": item["model"],
            }},
        )
        saved += written.modified_count
        incomplete += bool(item["notEvaluated"])
    return saved, incomplete


def run(limit: int, workers: int | None, slice_size: int = 500) -> None:
    """Check the pending answers a slice at a time, saving each slice before starting the next.

    A finished answer is no longer pending, so a stopped run loses at most one slice and
    the next run carries on where it stopped. The dose comparison needs all answers
    together, so it is left to dose-pass.
    """
    db = get_db()
    target = min(limit, db[COLLECTION].count_documents({"status": "pending"}))
    if not target:
        sys.exit("No pending documents to run.")
    print(f"{target} pending answers to check, {slice_size} at a time", flush=True)
    done = 0
    started = time.monotonic()
    while done < target:
        pending = list(db[COLLECTION].find({"status": "pending"}).limit(min(slice_size, target - done)))
        if not pending:
            break
        results = run_until_complete([_raw(doc) for doc in pending], max_workers=workers, checkpoint_path=None)
        saved, incomplete = _save_slice(db, pending, results)
        done += len(pending)
        rate = (time.monotonic() - started) / done
        left_hours = rate * (target - done) / 3600
        print(
            f"{done} of {target} checked, {saved} saved, {incomplete} in this slice with a check that "
            f"could not run | about {left_hours:.1f} hours left",
            flush=True,
        )
        if not saved:
            sys.exit("Nothing was saved from the last slice, so the run stopped. Nothing is lost; run it again.")
        if incomplete * 2 > len(pending):
            sys.exit(
                "More than half of the last slice had checks that could not run, so the model looks unreachable. "
                "The run stopped. Those answers are saved and can be repaired later with the rerun command."
            )
    print(f"done: {done} answers checked and saved")


def _summarise(checks: list[dict]) -> dict:
    flags = [c["parameter"] for c in checks if c["result"] == "FAIL"]
    not_evaluated = [c["parameter"] for c in checks if c["result"] == "NOT_EVALUATED"]
    return {
        "checks": checks,
        "flags": flags,
        "notEvaluated": not_evaluated,
        "status": "todo" if flags or not_evaluated else "clean",
    }


def rerun_incomplete(limit: int) -> None:
    """Run again the answers where a check could not run, and replace only those checks."""
    db = get_db()
    docs = list(db[COLLECTION].find(_new_only({"status": "todo", "notEvaluated.0": {"$exists": True}})).limit(limit))
    if not docs:
        sys.exit("No answers with a check that could not run.")
    raws = [
        {
            "answer_id": str(doc["answerId"]),
            "question_text": doc["question"],
            "answer_text": doc["answer"],
            "crop": doc["crop"],
            "state": doc["state"],
            "domain": doc["domain"],
            "sources": doc["sources"],
        }
        for doc in docs
    ]
    results = run_until_complete(raws, checkpoint_path=None)
    fixed = 0
    for doc, raw, result in zip(docs, raws, results):
        fresh = {c["parameter"]: c for c in to_item(raw, result)["checks"]}
        missing = set(doc["notEvaluated"])
        checks = [
            fresh[c["parameter"]]
            if c["parameter"] in missing and fresh[c["parameter"]]["result"] != "NOT_EVALUATED"
            else c
            for c in doc["checks"]
        ]
        summary = _summarise(checks)
        if len(summary["notEvaluated"]) < len(doc["notEvaluated"]) or summary["flags"] != doc["flags"]:
            fixed += 1
        db[COLLECTION].update_one(_new_only({"_id": doc["_id"], "status": "todo"}), {"$set": summary})
    still = db[COLLECTION].count_documents({"status": "todo", "notEvaluated.0": {"$exists": True}})
    print(f"re-ran {len(docs)} answers, {fixed} changed, {still} still have a check that could not run")


def dose_pass(write: bool, since: datetime | None = None) -> None:
    """Compare doses across every answer in the collection and update the dose check.

    All answers are compared, so the new ones are judged against the old ones, but only the
    answers checked on or after `since` are changed.
    """
    db = get_db()
    docs = list(db[COLLECTION].find({}, {"answerId": 1, "answer": 1, "crop": 1, "checks": 1, "status": 1, "flags": 1, "checkedAt": 1}))
    raws = [{"answer_id": str(d["answerId"]), "answer_text": d["answer"], "crop": d["crop"]} for d in docs]
    uniformity = run_uniformity_checks(raws)

    changed = 0
    flag_before = flag_after = 0
    for doc in docs:
        # unchecked answers have nothing to update and reviewed ones are never touched
        if doc["status"] not in ("todo", "clean") or not doc.get("checks"):
            continue
        if since and not (doc.get("checkedAt") and doc["checkedAt"] >= since):
            continue
        fake = {"parameters": {"chemical": {"uniformity_of_dose": uniformity[str(doc["answerId"])]["uniformity_of_dose"]}}}
        _dose_uniformity_not_applicable(fake)
        check = fake["parameters"]["chemical"]["uniformity_of_dose"]
        new = {
            "parameter": "uniformity_of_dose",
            "category": "chemical",
            "result": _check_result(check),
            "reason": str(check.get("detail") or "Check did not run"),
        }
        old = next(c for c in doc["checks"] if c["parameter"] == "uniformity_of_dose")
        flag_before += old["result"] == "FAIL"
        flag_after += new["result"] == "FAIL"
        if (old["result"], old["reason"]) == (new["result"], new["reason"]):
            continue
        changed += 1
        if write:
            summary = _summarise([new if c["parameter"] == "uniformity_of_dose" else c for c in doc["checks"]])
            db[COLLECTION].update_one({"_id": doc["_id"], "status": {"$in": ["todo", "clean"]}}, {"$set": summary})
    print(f"dose check across {len(docs)} answers: flagged {flag_before} before, {flag_after} after; {changed} answers change")
    print("written" if write else "dry run, nothing written (add --yes to write)")


CHEM_PREVIEW_PATH = PROJECT_DIRECTORY / "data" / "chem_pass_preview.json"


def chem_entry(doc: dict, mentions: list, model_check: str) -> dict:
    """What the chemical checks of one answer become, from what the model found in it."""
    context = normalize_answer({"answer_text": doc["answer"], "crop": doc["crop"]})
    found = check_banned_chemicals(context, [tuple(m) for m in mentions], model_check)
    fresh = {name: check_entry(name, "chemical", found[name]) for name in ("banned_chemical", "restricted_chemical")}
    old = {c["parameter"]: (c["result"], c["reason"]) for c in doc["checks"]}
    return {
        "answerId": str(doc["answerId"]),
        "crop": doc["crop"],
        "checks": [fresh.get(c["parameter"], c) for c in doc["checks"]],
        "changed": [name for name in fresh if (fresh[name]["result"], fresh[name]["reason"]) != old[name]],
        "before": {name: old[name][0] for name in fresh},
        "after": {name: fresh[name]["result"] for name in fresh},
        "found": {name: found[name].get("found") for name in fresh},
        "mentions": [list(m) for m in mentions],
        "modelCheck": model_check,
    }


def chem_pass(limit: int, workers: int, apply: bool, rebuild: bool = False) -> None:
    """Run the current chemical check, with its model step, on answers already checked.

    Only the banned and restricted chemical checks change. A normal run saves what it
    would write to a local preview file and changes nothing in Mongo; with --apply the
    preview is written, with no more model calls. A stopped run carries on from the
    preview file.
    """
    import json
    from concurrent.futures import ThreadPoolExecutor

    db = get_db()
    preview: dict[str, dict] = {}
    if CHEM_PREVIEW_PATH.exists():
        preview = {e["answerId"]: e for e in json.loads(CHEM_PREVIEW_PATH.read_text(encoding="utf-8"))}

    if apply:
        done = [e for e in preview.values() if e["modelCheck"] == OK]
        written = skipped = 0
        for entry in done:
            result = db[COLLECTION].update_one(
                _new_only({"answerId": ObjectId(entry["answerId"]), "status": {"$in": ["todo", "clean"]}}),
                {"$set": {**_summarise(entry["checks"]), "chemicalModelCheck": OK}},
            )
            written += result.modified_count
            skipped += result.matched_count == 0
        print(
            f"written to {written} answers | left alone because already decided or missing: {skipped} | "
            f"not applied because the model step did not complete: {len(preview) - len(done)}"
        )
        return

    if rebuild:
        by_id = {str(d["answerId"]): d for d in db[COLLECTION].find(_new_only({"status": {"$in": ["todo", "clean"]}}))}
        for answer_id, entry in list(preview.items()):
            if answer_id in by_id:
                preview[answer_id] = chem_entry(by_id[answer_id], entry["mentions"], entry["modelCheck"])
        CHEM_PREVIEW_PATH.write_text(json.dumps(list(preview.values()), ensure_ascii=False), encoding="utf-8")
        changed = [e for e in preview.values() if e["changed"]]
        print(f"rebuilt {len(preview)} answers from the preview, no model calls | reason or highlight changes: {len(changed)}")
        print("nothing written to Mongo; run with --apply to write the preview")
        return

    docs = [
        d for d in db[COLLECTION].find(_new_only({"status": {"$in": ["todo", "clean"]}})).limit(limit)
        if preview.get(str(d["answerId"]), {}).get("modelCheck") != OK
    ]
    print(f"{len(docs)} answers to run, {workers} at a time ({len(preview)} already in the preview file)", flush=True)

    def work(doc):
        mentions, model_check = find_chemical_mentions(doc["answer"])
        return chem_entry(doc, mentions, model_check)

    def save() -> None:
        CHEM_PREVIEW_PATH.write_text(json.dumps(list(preview.values()), ensure_ascii=False), encoding="utf-8")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for number, entry in enumerate(pool.map(work, docs), start=1):
            preview[entry["answerId"]] = entry
            if number % 50 == 0:
                save()
                print(f"  {number}/{len(docs)} done", flush=True)
    save()

    entries = list(preview.values())
    failed = sum(e["modelCheck"] != OK for e in entries)
    changed = [e for e in entries if e["changed"]]
    print(f"{len(entries)} answers in the preview | model step did not complete for {failed} | chemical checks change for {len(changed)}")
    print("nothing written to Mongo; run with --apply to write the preview")


CORRECTION_PREVIEW_PATH = PROJECT_DIRECTORY / "data" / "corrections_preview.json"


def correct_pass(limit: int, workers: int, apply: bool) -> None:
    """Draft a corrected answer for flagged answers that a rewrite can help.

    A normal run saves the drafts to a local preview file and changes nothing in Mongo; with
    --apply the good drafts are written, with no more model calls. An answer a reviewer has
    already written a correction for, or decided, is never touched. A stopped run carries on
    from the preview file, and answers whose model call failed are tried again.
    """
    import json
    import random
    from collections import Counter
    from concurrent.futures import ThreadPoolExecutor

    db = get_db()
    preview: dict[str, dict] = {}
    if CORRECTION_PREVIEW_PATH.exists():
        preview = {e["answerId"]: e for e in json.loads(CORRECTION_PREVIEW_PATH.read_text(encoding="utf-8"))}

    if apply:
        written = skipped = 0
        for entry in preview.values():
            if entry["status"] != "ok":
                continue
            result = db[COLLECTION].update_one(
                _new_only({"answerId": ObjectId(entry["answerId"]), "status": "todo", "correctedAnswer": None}),
                {"$set": {
                    "correctedAnswer": entry["correctedAnswer"],
                    "correctionSource": "system",
                    "correctionChanges": entry["changes"],
                    "correctionNotFixed": entry["notFixed"],
                    "correctionNeedsReviewer": entry["needsReviewer"],
                }},
            )
            written += result.modified_count
            skipped += result.matched_count == 0
        print(f"written to {written} answers | left alone because a reviewer already acted or wrote one: {skipped}")
        return

    candidates = [
        d for d in db[COLLECTION].find(_new_only({"status": "todo", "correctedAnswer": None}))
        if problems_for(d["checks"]) and preview.get(str(d["answerId"]), {}).get("status") in (None, "failed")
    ]
    random.Random(1).shuffle(candidates)
    docs = candidates[:limit]
    print(f"{len(candidates)} answers need a draft, doing {len(docs)}, {workers} at a time", flush=True)

    def work(doc):
        result = write_correction(doc)
        return {"answerId": str(doc["answerId"]), "crop": doc["crop"], "flags": doc["flags"], **result}

    def save() -> None:
        CORRECTION_PREVIEW_PATH.write_text(json.dumps(list(preview.values()), ensure_ascii=False), encoding="utf-8")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for number, entry in enumerate(pool.map(work, docs), start=1):
            preview[entry["answerId"]] = entry
            if number % 10 == 0:
                save()
                print(f"  {number}/{len(docs)} done", flush=True)
    save()

    entries = list(preview.values())
    print("drafts in the preview file:", dict(Counter(e["status"] for e in entries)))
    print("why drafts were dropped:", dict(Counter(e["note"].split(":")[0] for e in entries if e["status"] == "rejected")))
    print("drafts with a spot left for the reviewer:", sum(1 for e in entries if e.get("needsReviewer")))
    print("nothing written to Mongo; run with --apply to write the good drafts")


def _scope_arguments(parser) -> None:
    parser.add_argument("--since", help="only touch answers checked on or after this date, YYYY-MM-DD")
    parser.add_argument("--all", action="store_true", help="touch every answer, including earlier ones")


def _set_scope(args) -> None:
    """Writing to answers that already exist needs --since (or --all), so earlier ones stay as they are."""
    global SINCE
    SINCE = datetime.strptime(args.since, "%Y-%m-%d") if getattr(args, "since", None) else None
    writes = args.command in ("rerun",) or (args.command in ("chem-pass", "correct") and args.apply) or (
        args.command == "dose-pass" and args.yes
    )
    if writes and SINCE is None and not args.all:
        sys.exit("Add --since YYYY-MM-DD so answers checked earlier are not changed (or --all to change every answer).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    seed_parser = sub.add_parser("seed")
    seed_parser.add_argument("--limit", type=int, default=1)
    seed_parser.add_argument("--state")
    seed_parser.add_argument("--crop")
    run_parser = sub.add_parser("run")
    run_parser.add_argument("--limit", type=int, default=1)
    run_parser.add_argument("--workers", type=int, default=None)
    run_parser.add_argument("--slice", type=int, default=500, dest="slice_size")
    rerun_parser = sub.add_parser("rerun")
    rerun_parser.add_argument("--limit", type=int, default=500)
    _scope_arguments(rerun_parser)
    chem_parser = sub.add_parser("chem-pass")
    chem_parser.add_argument("--limit", type=int, default=100000)
    chem_parser.add_argument("--workers", type=int, default=8)
    chem_parser.add_argument("--apply", action="store_true")
    chem_parser.add_argument("--rebuild", action="store_true")
    _scope_arguments(chem_parser)
    correct_parser = sub.add_parser("correct")
    correct_parser.add_argument("--limit", type=int, default=100000)
    correct_parser.add_argument("--workers", type=int, default=6)
    correct_parser.add_argument("--apply", action="store_true")
    _scope_arguments(correct_parser)
    dose_parser = sub.add_parser("dose-pass")
    dose_parser.add_argument("--yes", action="store_true")
    _scope_arguments(dose_parser)
    args = parser.parse_args()
    if args.command != "seed" and args.command != "run":
        _set_scope(args)
    if args.command == "rerun":
        rerun_incomplete(args.limit)
    elif args.command == "correct":
        correct_pass(args.limit, args.workers, args.apply)
    elif args.command == "chem-pass":
        chem_pass(args.limit, args.workers, args.apply, args.rebuild)
    elif args.command == "dose-pass":
        dose_pass(args.yes, SINCE)
    elif args.command == "seed":
        seed(args.limit, args.state, args.crop)
    else:
        run(args.limit, args.workers, args.slice_size)


if __name__ == "__main__":
    main()

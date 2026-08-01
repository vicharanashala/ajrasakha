# GDB Gap Detector

Standalone Python tool to surface coverage gaps between farmer-asked
unanswered queries (`disclaimer_logs.status == "unanswered"`) and the
verified Golden Dataset (`gdb_entries`).

This is the **candidate discovery** stage of the gap-reporting pipeline.
A downstream generator consumes the output to produce the full
`gap_reports` collection shape.

## Files

```
gdb-gap-detector/
├── find_gap_candidates.py     # stage 1 — extract candidate disclaimers
├── clustering.py              # stage 2 — cluster into top_gaps
├── generate_report.py         # stage 3 — assemble full gap_reports doc
├── requirements.txt           # runtime + dev/test deps
├── README.md
└── tests/
    ├── conftest.py
    ├── test_find_gap_candidates.py
    ├── test_clustering.py
    └── test_generate_report.py
```

## Install

Runtime only:

```
pip install -r requirements.txt
```

Runtime + dev (required to run the test suite):

```
pip install -r requirements.txt
pip install pytest mongomock
# (mongomock is listed in requirements.txt under the "# --- dev / test ---" section)
```

## Run

Stage 1 (one-line summary):

```
export MONGODB_URI="mongodb://localhost:27017"
python find_gap_candidates.py                       # all-time, default 5k cap
python find_gap_candidates.py --since-days 30 --limit 10000
python find_gap_candidates.py --verbose
```

Stage 3 (assemble full `gap_reports` document + markdown summary):

```
# Read-only — writes ./gap_report.md, does NOT touch MongoDB
python generate_report.py

# Custom period / output
python generate_report.py --since-days 30 --output /tmp/gap.md

# Insert into the gap_reports collection (INSERT ONLY — never overwrites)
python generate_report.py --write-to-db
```

Stage 2 (`clustering.py`) is a library consumed by `generate_report.py`; it
is not invoked directly.

## Test

From `tools/gdb-gap-detector/`:

```
pytest -v
```

## Privacy

`farmer_id` is the single PII field in `disclaimer_logs`. The script
excludes it via a Mongo projection (`{"farmer_id": 0}`) so it never
leaves the database.

## Known limitations

**Clustering is keyword-based, not embedding-based.** Two records end up
in the same cluster only when their sets of significant keywords
(filtered for stopwords, with a small singular/plural fold) are
identical. Closely related questions phrased differently — for example,
"aphid control in mustard" vs. "how to get rid of aphids on mustard
plants" — may therefore land in separate clusters. This is a known
limitation of the current approach, not a bug.

A lightweight trailing-`s` strip is applied to tokens longer than 4
characters so that exact plural variants of the same word (e.g.
`aphids`/`aphid`) collapse to one keyword. This is a heuristic, not a
real lemmatizer: words ending in `s` that aren't plurals (e.g. `moss`,
`class`) are over-stripped. Documented trade-off; the heuristic
reduces one common cause of cluster fragmentation without claiming to
solve it generally.

Future work could replace the keyword-based clustering with the
embedding pipeline already in use by the Golden DB subagent
(`ai/ajrasakha/agents/acc_agent/` and the GDB embedding search) to
produce semantically similar clusters. Not implemented yet.
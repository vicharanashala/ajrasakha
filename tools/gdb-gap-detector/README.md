# GDB Coverage Gap Detector

Project 6 submission - Vicharanashala Summership 2026.

When a farmer asks something the GDB can't answer, the system logs a
disclaimer event, but there wasn't anything looking across all of those
logs together to find patterns. This pulls them, groups differently
worded versions of the same question, and ranks the results so the
review pipeline can grow the GDB by what actually affects the most
farmers instead of whatever a reviewer happens to notice first.

## What's here

```
backend/
  app/
    main.py             - FastAPI backend, reads from MongoDB or falls back to demo data
    clustering.py        - groups questions and ranks gaps, the core logic
    domain_matching.py   - fixes a domain-name mismatch found in the real data
    embeddings.py        - computes embeddings locally, no API key needed
    synthetic_data.py    - fake data for demo mode / tests
  tests/                - 33 tests
  discover_database.py  - read-only script used to find the real collection names
  inspect_candidates.py - same, but pulls full field lists/types
frontend/
  index.html             - the dashboard, open directly in a browser
```

## Running it (demo mode, no DB needed)

```bash
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v      # 33 passed
python -m uvicorn app.main:app --port 8000
```

Then open `frontend/index.html` in a browser. It'll say "Demo mode" at
the top and populate with synthetic data shaped like the real schema.

## Connecting to real data

Two databases, found by reading the schema directly since the public
Ajrasakha repo's Question model didn't match what's actually here:

- `gdb_gap_detector.raw_queries` - the disclaimer-triggered questions.
  Has `question`, `crop`, `state`, `domain`, `disclaimer_triggered`. No
  stored embedding, so we compute one locally at query time.
- `farmer_feedback.gdb_entries` - the verified answers, for the coverage
  ratio. Has `domain` and `state`, no `crop`.

Add a `.env` file in `backend/` (don't commit it):
```
MONGODB_URI=<connection string>
```
Restart uvicorn and the dashboard switches to live data automatically.

Doesn't touch `gdb_gap_detector.clusters` - that looks like it's already
holding another student's own output in the same shared DB.

## Two things found while testing against real data

**No stored embeddings.** Assumed at first that embeddings would already
exist on each question (based on reading the public repo), but the real
collection doesn't have one. Fixed by computing embeddings locally with
sentence-transformers instead - no API key needed, and it's one of the
two approaches the brief itself mentions.

**Domain name mismatch.** raw_queries says "Disease", gdb_entries says
"Crop Disease" - same topic, different wording. Same for "Pest" vs "Pest
Control", "Fertilizer" vs "Fertilizers". Without handling this the
coverage heatmap only ever showed 0% or 100%, since exact string
matching never found an overlap. Added a normalization step
(`domain_matching.py`) to fix it - it's a heuristic, not a verified
mapping, worth checking with whoever owns the actual domain list.

Also worth noting: a chunk of real GDB entries have no `state` recorded
at all, so those can't be matched geographically no matter what. Not
something the code can fix, just a real gap in the underlying data.

## A clustering bug found during testing

First version grouped by embedding similarity first and guessed
crop/state/domain from the result. Two genuinely different gaps -
cotton/Punjab pest questions and tomato/Karnataka pest questions - got
merged into one cluster because their embeddings happened to land close
together. Fixed by grouping on the real crop/state/domain metadata
first, then only using embeddings to separate different phrasings
within each group. There's a regression test for this specifically
(`test_never_merges_two_different_crop_state_groups...`).

## How this compares to other Project 6 submissions

A few classmates already built this same project. Checked three PRs
directly instead of assuming this is automatically different:

- **#1077** - keyword-based clustering, no embeddings (the PR calls this
  out as a known limitation). Does correctly compute coverage % against
  real GDB counts, tested on 279 real disclaimer logs.
- **#1102** - embedding-based clustering with FastAPI + React, closest
  architecture to this one. Doesn't appear to compute a true coverage
  ratio against real GDB counts based on the PR description.
- **#1058, #1016** - also Project 6 (only read titles given time).

This one combines embedding-based clustering (like #1102) with a real
coverage percentage against actual GDB counts (like #1077) - didn't see
both together in what's already been submitted.

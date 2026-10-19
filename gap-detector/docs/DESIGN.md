# Design — GDB Coverage Gap Detector

## Goal

Turn the stream of farmer questions the AjraSakha bot could **not** answer from the Golden
Database (the "2-hour disclaimer" cases) into a prioritised weekly list of question types the
GDB should cover next, plus a coverage map that tells the outreach team where to go.

## Boundaries

* **Read-only** on the bot's data: `farmer_feedback.disclaimer_logs`,
  `gdb_gap_detector.raw_queries`, `farmer_feedback.gdb_entries`.
* **Writes only** to its own database `ace_insights`.
* Never imports code from the AjraSakha repository; talks to it only through data.
* Farmer identifiers are stored as a salted SHA-256 prefix (`farmer_key`); phone numbers /
  user ids never reach `ace_insights`.

## Data flow

```
seed DBs (read-only)                     ace_insights (written by the job)
────────────────────                     ─────────────────────────────────
disclaimer_logs ─┐  normalise            disclaimer_queries   (normalised copies, idempotent)
raw_queries ─────┴─► DisclaimerQuery ──► embedding_cache      (text_hash + model → vector)
                       │                 clusters             (one doc per cluster per run)
gdb_entries ──► GdbEntry                 coverage_heatmap     (two per run: by state, by crop)
                       │                 gap_reports          (one doc per run — the report)
                       ▼                 job_runs             (audit trail)
   embed → cluster → score → heatmap → report
```

`pipeline/run_gap_report.py` is the only writer. `backend/app/routers/gaps.py` only reads.
The React dashboard only calls the API.

## Normalisation (`normalize.py`)

The seed data mixes three domain taxonomies, language names and ISO codes, channel names
stored as states, and has no crop field on disclaimer logs. Everything is mapped to one
vocabulary before analysis:

| Field | Rule |
|---|---|
| language | name or ISO code → `(name, code)`; unknown labels kept without a code |
| state | canonical 36 states/UTs (from the reviewer system's list); "Telegram", "Unknown", "" → `None` |
| domain | 13 canonical domains; table maps feedback / gap-detector / reviewer labels; keyword fallback |
| crop | explicit field if present, else first crop alias found in the query text (English + common Hindi transliterations) |
| farmer | salted hash, 16 hex chars |

### Exclusions

Not every unanswered query is evidence of a missing GDB entry. Two classes are removed before
analysis and reported as separate counts on the report (never silently dropped):

* **Off-topic questions** - "how do I earn money fast". The source data tags these, and
  `normalize_domain` maps them to a dedicated `Off-topic` canonical domain rather than folding
  them into `General`, so they stay distinguishable.
* **Synthetic test traffic** - the `test` channel.

Both lists are settings (`EXCLUDE_DOMAINS`, `EXCLUDE_CHANNELS`). On the sample data they remove
40 of 350 queries; left in, they put a phantom "General" bucket third in the domain ranking.

## Clustering (`services/clustering.py`)

* **Embeddings:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (CPU,
  ~470 MB, handles Hindi/Tamil/Kannada etc. alongside English). Vectors are cached in Mongo by
  `(text_hash, model)` so weekly runs only embed new queries. A deterministic hash embedder
  stands in for tests/CI.
* **Similarity:** `sentence_transformers.util.cos_sim` (torch).
* **Algorithm:** average-linkage agglomerative clustering (Lance-Williams UPGMA update) on
  cosine distance, implemented on torch tensors (no scikit-learn). Merged-away rows and columns
  are set to `+inf`, so the next merge is a single `argmin` over the live matrix with no masking
  pass or per-iteration copy. Merging stops at `CLUSTER_DISTANCE_THRESHOLD` (0.35); clusters
  smaller than `MIN_CLUSTER_SIZE` are dropped from the ranking but still counted in totals.
  Cost is an n × n matrix plus O(n) merges over it — comfortable into the low thousands of
  queries per run. Beyond that, bucket by domain or state and cluster each bucket.
* **Labelling:** TF-IDF-style keyword scoring within the cluster vs the whole batch, plus the
  dominant crop and domain → title like "Mustard Aphid Attack Pest Control". Representative
  queries are the members closest to the centroid.

## Scoring (`services/gap_scoring.py`)

```
gap_score = 0.40·frequency + 0.25·trend + 0.20·farmers + 0.15·geography      (0..1)
```
* frequency — cluster size ÷ largest cluster
* trend — growth of weekly counts, recent half vs earlier half, squashed to 0..1
  (flat = 0.5, doubled = 1.0, new = 1.0)
* farmers — unique hashed farmers ÷ max across clusters
* geography — distinct states ÷ max across clusters

Weights are settings. Priority bands: ≥ 0.75 CRITICAL · ≥ 0.55 HIGH · ≥ 0.35 MEDIUM · else LOW.

## Coverage (`services/coverage.py`)

Per cell: `coverage = gdb_count / (gdb_count + disclaimer_count)`. GDB entries with no state
are "national" and credited to every state at half weight, so a single generic answer does not
hide real regional gaps. Status: ≥ 60 % good · ≥ 30 % partial · else gap (both thresholds are
settings).

The same model runs at **two granularities** in every pipeline run: `domain × state` (the
dashboard grid) and `domain × state × crop` (the crop view the brief asks for). Both are stored
against the run id with a `dimension` field and served from `/gaps/heatmap`; the crop roll-up
also appears on the report as `crops_with_gaps`.

## Report (`services/gap_report.py`)

Assembles the seed-compatible `gap_reports` document: top-N clusters with a recommended
action, coverage stats at both granularities, outreach recommendations (state × domain gap
cells ranked by unanswered volume), and gaps-by-domain / by-state / by-crop roll-ups.

## Configuration

Everything an operator might tune is a setting (`backend/app/config.py`, `.env`):
window length, cluster threshold, minimum cluster size, score weights, coverage bands,
embedding backend/model, top-N. Two profiles: `demo` (hackathon sample) and `prod`.

## Dashboard (`frontend/`)

Vite + React 19 + TypeScript + Tailwind 4 + Recharts. Single page:
KPI row → ranked question types (sparklines, growth, priority, expandable detail) →
domain × state heatmap (single-hue sequential ramp, "!" glyph on gap cells, table view) →
gaps by domain / state / crop → outreach list. Colours are role tokens from a validated palette
with light/dark support; status colours always ship with an icon + label.

## Testing

`pytest` runs on synthetic fixtures + `mongomock` + the hash embedder — no network, no model
download. Covered: normalisation, ingestion, embedding cache, agglomerative clustering, keyword titles,
weekly counts / growth / trend, scoring order, heatmap statuses, exclusions, both heatmap
dimensions, the full pipeline end-to-end (including idempotent re-runs and dry-run), and every
API endpoint. `/gaps/trends` buckets weeks in Python rather than with `$dateTrunc`, so it needs
no particular MongoDB version and is testable against `mongomock`.

## Scaling notes

* Embedding cache makes weekly runs incremental.
* For > ~20k queries per run, cluster per domain (or per state) and merge, or switch the
  linkage step to `util.community_detection` for a fast first pass.
* Swap `ingest/gdb_source.py` for a reader over the production GDB to get real coverage
  denominators; nothing downstream changes.

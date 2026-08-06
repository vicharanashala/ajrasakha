# Multilingual Evaluation Suite

This suite is the Project 4 foundation for cross-lingual AjraSakha testing.
It runs the existing evaluation pipeline against multilingual farming scenarios
and produces a Language Quality Matrix by language and domain.

## What It Checks

- Whether the answer is in the same script/language family as the query.
- Whether the 2-hour/expert disclaimer marker appears in the expected language.
- Whether the answer has obvious mid-answer script switching.
- Whether the expected GDB entry was retrieved when a scenario declares one.
- Whether future agri-approved term markers are present.

## Current Scope

The case generator currently produces the requested shape:

```text
30 realistic agriculture scenarios x 6 languages = 180 multilingual cases
```

It also defines an additive romanized-input suite for farmers who type Indic
languages with an English keyboard:

```text
30 realistic agriculture scenarios x 5 Indic languages = 150 romanized input cases
```

These romanized cases do not replace or resize the existing 180-case
multilingual runner. They are kept separate so existing CLI behavior remains
backward compatible.

The 30 scenarios are balanced across the requested domains:

```text
Weather: 6
Pest & Disease: 6
Soil & Fertilizer: 6
Market: 6
Government Schemes: 6
```

Translations are draft evaluation data and should still be reviewed by the
agriculture/language team before a live quality baseline is treated as final.

## Run Without Credentials

Mock mode validates the framework and writes reports without calling live
services:

```bash
cd ai
python3 -m ajrasakha.evaluation.run --mode mock --multilingual
```

For a quick smoke run:

```bash
cd ai
python3 -m ajrasakha.evaluation.run --mode mock --multilingual --limit 6
```

## Generated Reports

Mock mode generates:

```text
multilingual_evaluation_report_mock.csv
language_quality_matrix_mock.csv
language_quality_summary.md
language_quality_summary.json
language_quality_recommendations.md
language_quality_metrics.md
language_quality_metrics.json
mock_deepeval_report.md
mock_deepeval_report.json
```

Live mode uses the same report names, with the detailed CSV files using the
`live` suffix:

```text
multilingual_evaluation_report_live.csv
language_quality_matrix_live.csv
```

## Run Against Live AjraSakha

Live mode uses the existing `LIVE_API_URL` and `ASSISTANT_ID` settings from the
evaluation runner:

```bash
cd ai
python3 -m ajrasakha.evaluation.run --mode live --multilingual
```

Live mode requires the project Python dependencies and staging/API credentials.

## Local Evaluation Dashboard

The dashboard provides a small human-readable interface for manual multilingual
probes. It lets a reviewer ask a question in one of the six supported
languages, run mock or live evaluation, view the language-quality checklist,
load romanized Indic input examples, open a recommendations page, inspect the
30 English test-case DB, and inspect Golden DB index readiness.

```bash
cd ai
python3 -m uvicorn ajrasakha.evaluation.dashboard:app --reload --port 8765
```

Then open:

```text
http://127.0.0.1:8765
```

The recommendations page is:

```text
http://127.0.0.1:8765/recommendations
```

The English test-case DB page is:

```text
http://127.0.0.1:8765/db
```

The dashboard uses the same `LIVE_API_URL` and `ASSISTANT_ID` values as the
CLI when `live` mode is selected.

### Optional Gemini DB Matcher

The dashboard can use Gemini to match paraphrased farmer questions to the
closest English test-case DB question:

```bash
export GEMINI_API_KEY=your-gemini-api-key
```

Optional model override:

```bash
export GEMINI_MATCHER_MODEL=gemini-2.5-flash
```

If `GEMINI_API_KEY` is not set, the dashboard falls back to the deterministic
mock matcher. This keeps mock mode runnable without credentials while allowing
semantic matching demos when Gemini credentials are available.

## Mock DeepEval Metrics

Mock mode also produces DeepEval-compatible semantic metrics without external
LLM judge credentials:

```text
Answer Relevancy
Faithfulness
Contextual Relevancy
```

These metrics use deterministic overlap scoring against the question, generated
answer, and matched DB context. They are intended to demonstrate the DeepEval
reporting shape in mock mode. When real model credentials and retrieved context
are available, the same conceptual metrics can be replaced with real DeepEval
judge calls.

## Golden DB Index Readiness

Golden DB retrieval expects Atlas Search indexes to exist before live GDB
validation can be trusted:

```text
GOLDEN_MONGODB_INDEX=review_questions_vector_index
GOLDEN_MONGODB_ANSWERS_INDEX=review_answers_vector_index
GOLDEN_MONGODB_SEARCH_INDEX=review_questions_search_index
```

The dashboard exposes a read-only index readiness check at:

```text
GET /api/indexes
```

The same check is available from the terminal:

```bash
cd ai
python3 -m ajrasakha.evaluation.golden_indexes
```

It also exposes an explicit creation endpoint for development/staging
environments where the MongoDB user has permission:

```text
POST /api/indexes/create
```

The equivalent terminal command is:

```bash
cd ai
python3 -m ajrasakha.evaluation.golden_indexes --create
```

Do not call the creation endpoint against production without approval.

## Unit Tests

```bash
cd ai
python3 -m pytest ajrasakha/evaluation/tests
```

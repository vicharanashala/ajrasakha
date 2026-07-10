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

Generated reports:

```text
multilingual_evaluation_report_mock.csv
language_quality_matrix_mock.csv
```

## Run Against Live AjraSakha

Live mode uses the existing `LIVE_API_URL` and `ASSISTANT_ID` settings from the
evaluation runner:

```bash
cd ai
python3 -m ajrasakha.evaluation.run --mode live --multilingual
```

Live mode requires the project Python dependencies and staging/API credentials.

## Unit Tests

```bash
cd ai
python3 -m pytest ajrasakha/evaluation/tests
```

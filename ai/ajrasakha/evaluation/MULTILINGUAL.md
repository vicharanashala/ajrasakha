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
30 scenario slots x 6 languages = 180 multilingual cases
```

The first scenario seeds are draft translations. Remaining scenario slots are
explicitly marked as fixtures with:

```text
translation_status=fixture_replace_with_agri_validated_scenario
```

Replace those fixture scenarios once the agriculture/language team provides the
final validated 30-scenario set.

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

# Project 4 — Cross-lingual and Multilingual Testing Suite

This suite measures **how well AjraSakha speaks the 22 Indic languages
it is supposed to serve**, with focus on the six pilot languages for
the national rollout: **Hindi, English, Kannada, Tamil, Punjabi,
Telugu**.

A farmer asking in Kannada must receive the same quality of advice as
a farmer asking in Hindi.  This suite is the first systematic,
reproducible evidence of whether that promise holds.

---

## What it does

1. Defines **30 canonical farming scenarios** spread across 5 domains
   (weather, pest, scheme, soil, market).
2. Translates each scenario into **6 languages** — **180 test cases
   total**.
3. Submits every case to AjraSakha through the WhatsApp test bot (or
   an in-process mock for offline runs).
4. Scores every response on **five axes**:
   - Was the correct Golden DB entry retrieved?
   - Is the response in the same language as the query?
   - Is the 2-hour advice-age disclaimer present in the correct
     language?
   - Did the answer switch languages mid-stream?
   - Are crop / scheme / pesticide names recognisable?
5. Builds the **Language Quality Matrix** (CSV + Markdown + JSON) and
   emits prioritised **recommendations for the AI team** before
   national rollout.

---

## Layout

```
qa/tests/multilingual/
├── scenarios/
│   └── farming_scenarios.py    # the 30 canonical scenarios
├── translations/
│   ├── language_meta.py        # supported languages + scripts + disclaimer
│   ├── hi_hi.py                # Hindi
│   ├── hi_en.py                # English
│   ├── hi_kn.py                # Kannada
│   ├── hi_ta.py                # Tamil
│   ├── hi_pa.py                # Punjabi
│   └── hi_te.py                # Telugu
├── evaluators/                 # pure-python evaluators
│   ├── language_detector.py
│   ├── gdb_accuracy.py
│   ├── disclaimer_check.py
│   ├── transliteration_check.py
│   └── language_switch_check.py
├── client/                     # AjraSakha + WhatsApp test transport
│   ├── ajrasakha_client.py     # mock + real client (WhatsApp webhook)
│   └── whatsapp_client.py
├── deep_eval/                  # DeepEval-aware scoring layer
├── reporter/                   # Language Quality Matrix + recommendations
├── tests/
│   └── test_suite.py           # unit + structural tests
├── conftest.py
├── pytest.ini
├── requirements.txt
├── run_suite.py                # CLI orchestrator
└── README.md                   # this file
```

---

## Quick start

### Run the full 180-case suite (mock transport)

```bash
cd ajrasakha
python -m qa.tests.multilingual.run_suite \
    --output-dir qa/artifacts/multilingual \
    --verbose
```

This produces, in `qa/artifacts/multilingual/`:

| File | Purpose |
| --- | --- |
| `language_quality_matrix.csv` | Domain × language pass rates |
| `language_quality_matrix.md`  | Same, in Markdown |
| `language_quality_matrix.json`| Full structured data |
| `recommendations.md`          | AI team remediation plan |
| `recommendations.json`        | Same, structured |
| `scores.json`                 | Per-case detailed scores |
| `raw_responses.json`          | AjraSakha raw replies (for debugging) |
| `summary.json`                | Headline counts + verdict |

### Run only some languages / domains

```bash
python -m qa.tests.multilingual.run_suite \
    --language kannada --language tamil \
    --domain pest --domain scheme
```

### Run against the live WhatsApp transport

```bash
export AJRASAKHA_USE_REAL_CLIENT=1
export AJRASAKHA_WHATSAPP_TEST_URL=https://staging.ajrasakha.in/test/ask
export AJRASAKHA_TEST_API_KEY=...
python -m qa.tests.multilingual.run_suite \
    --output-dir qa/artifacts/multilingual-staging
```

### Unit tests

```bash
pytest qa/tests/multilingual/tests/ -v
```

---

## How scoring works

For each case the suite computes five metrics on a 0..1 scale and
combines them with the following weights (calibrated against
farmer-impact priority):

| Metric              | Weight | What it measures |
| ------------------- | -----: | ---------------- |
| `gdb_accuracy`      | 0.35   | Correct Golden DB entry retrieved |
| `response_language` | 0.25   | Reply is in the query language |
| `disclaimer`        | 0.15   | 2-hour disclaimer is in correct language |
| `transliteration`   | 0.15   | Crop / scheme / pesticide names are recognisable |
| `no_switch`         | 0.10   | No mid-answer language switching |

Overall pass-rate thresholds for each (domain × language) cell:

- 🟢 **STRONG** ≥ 90 %  — ready for rollout
- 🟡 **WATCH**  70-89 % — needs improvement
- 🔴 **WEAK**   < 70 %  — blocks rollout

A case "passes" when its weighted overall score is **≥ 0.80**.

---

## The 30 scenarios

| Domain | Scenarios | Sample |
| ------ | --------- | ------ |
| weather  | 6 | Rainfall forecast, cyclone warning, frost risk, dew point, drainage timing |
| pest     | 6 | Pink bollworm, aphid, yellow rust, stem borer, whitefly, fall armyworm |
| scheme   | 6 | PM-Kisan, PMFBY, drip subsidy, KCC, eNAM, Soil Health Card |
| soil     | 6 | Clayey paddy soil, alkaline soil, nitrogen for sugarcane, sandy soil, black cotton soil, red soil groundnut |
| market   | 6 | Wheat Sirsa, tomato Kolar, cotton Warangal, paddy Karnal, turmeric Erode, mustard Jaipur |

Each scenario ships with:

* `expected_gdb_id`     — the Golden DB entry we expect AjraSakha to retrieve
* `required_keywords`   — entities that must appear in the answer
* `required_entities`   — canonical concept keys checked by the
  transliteration evaluator
* `language_hint`       — the *primary* language for the canonical
  GDB entry (used for cross-checking the matrix)

---

## Extending

- **Add a language** — drop a new `hi_<iso>.py` in `translations/`
  with the same 30 keys, then add the language to
  `SUPPORTED_LANGUAGES` in `language_meta.py`.
- **Add a scenario** — extend `FARMING_SCENARIOS` and provide the
  translation in every language file (use the suite's structural
  tests to keep things in sync).
- **Tune weights / thresholds** — edit the constants in
  `qa/tests/multilingual/deep_eval/__init__.py` (`WEIGHTS`,
  `PASS_THRESHOLD`).
- **Wire to DeepEval** — install `deepeval` and call
  `to_deepeval_test_cases()` to push results to the team dashboard.

---

## Why this matters

The national rollout targets farmers across every state. If the
system gives lower-quality answers in Kannada than in Hindi, farmers
in Karnataka are being underserved.  This suite produces the first
systematic evidence of language quality across the platform — and the
recommendations report is the AI team's sprint plan to close the gap
before go-live.
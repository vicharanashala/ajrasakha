# First GDB Gap Report

**Audience:** ACE agri team (what to write next) and outreach team (where to go next).
**Source:** pipeline run `20261008T001713-0d648f`, window 28 Jun → 26 Sep 2026 (90 days), on the
hackathon sample cluster. Reproduce with `python -m pipeline.run_gap_report`; browse it in the
dashboard (`frontend/`).

## Headline

| | |
|---|---|
| Unanswered (disclaimer-triggered) queries received in window | 350 |
| Excluded as not evidence of a GDB gap | 25 off-topic (“how do I earn money fast”) + 15 synthetic test queries |
| **Analysed** | **310** (121 unique wordings) |
| Grouped into question types (semantic clusters) | **37** |
| Coverage cells, domain × state | 56 → **18 gaps**, 14 partial, 24 good |
| Coverage cells, domain × state × crop | 97 → **51 gaps** |
| Queries whose best GDB match scored < 0.30 | 61 % — most disclaimers are true gaps, not near-misses |

Two problems dominate: **pest and disease questions in the north-western wheat/mustard belt**
(Punjab, Haryana, Rajasthan) and **horticulture questions in Maharashtra/Karnataka** (grapes,
mango, protected cultivation, organic inputs). Together they account for roughly half of all
unanswered volume.

## Top 10 question types to add to the GDB

Ranked by demand score = 0.40·frequency + 0.25·growth + 0.20·unique farmers + 0.15·geographic spread.

| # | Question type | Queries | Farmers | States | Priority | Suggested GDB work |
|---|---|---|---|---|---|---|
| 1 | **Mustard aphid attack — control** | 30 | 25 | Rajasthan, Haryana, Punjab | CRITICAL | 3–4 entries: ETL-based spray timing, recommended insecticides + doses, neem/biocontrol option, in Hindi + Punjabi |
| 2 | **Wheat yellow rust — which fungicide** | 25 | 24 | Haryana, Punjab, UP | HIGH | 2–3 entries: identification vs brown rust, propiconazole/tebuconazole schedule, resistant varieties per state |
| 3 | **Saline / alkaline soil reclamation** | 20 | 18 | Gujarat, Haryana, Rajasthan | HIGH | 2 entries: gypsum dose from soil test, drainage + green-manure sequence |
| 4 | **Mango fruit fly — control** | 20 | 17 | Maharashtra, UP, Gujarat | HIGH | 2 entries: methyl-eugenol traps per acre, bagging, harvest timing |
| 5 | **Grapes / pomegranate — drip schedule** | 20 | 18 | Maharashtra, Karnataka | MEDIUM | 2 entries: litres per vine by growth stage, run-time per emitter spacing |
| 6 | **Banana bunchy top disease** | 14 | 14 | Tamil Nadu, Maharashtra, Kerala | MEDIUM | 1–2 entries: aphid vector control, rogueing, clean planting material |
| 7 | **Crop selection for drought-prone areas** | 13 | 13 | Karnataka, Maharashtra, Rajasthan | MEDIUM | 1–2 entries per agro-zone: millet/pulse options, short-duration varieties |
| 8 | **Tomato / cucumber in polyhouse** | 15 | 15 | Karnataka, Maharashtra | MEDIUM | 2 entries: greenhouse setup basics, fertigation + pruning schedule |
| 9 | **Organic / bio-pesticide alternatives** | 13 | 11 | Tamil Nadu, Maharashtra, Karnataka | MEDIUM | 2 entries: neem, Trichoderma, Beauveria — crop-wise doses |
| 10 | **Rice — monsoon irrigation, asked in Hindi** | 3 | 3 | Haryana | MEDIUM (rising) | small today, but the only cluster still growing — see below |

The remaining 27 clusters are in `ace_insights.clusters` (run above) and on the dashboard.

## Growing question types (watch list)

**One cluster is still growing** once off-topic and test traffic are removed: *rice monsoon
irrigation, asked in Hindi from Haryana* (3 queries, +100 % against the earlier half of the
window). It is small, but it is the only demand in the sample that is rising rather than
decaying, and there is no Hindi rice entry to serve it.

Everything else shows negative growth because the sample arrives in bursts — a large batch in
July, a trickle afterwards. Treat the growth column as indicative only until the pipeline has
several weeks of continuous logs; today the ranking is carried by volume, unique farmers and
geographic spread, which are stable.

## Coverage heatmap — where the GDB is thin

Coverage = GDB entries ÷ (GDB entries + unanswered queries) per domain × state. Cells below
30 % are gaps:

| Domain | State | GDB entries | Unanswered | Coverage |
|---|---|---|---|---|
| Crop Disease | Punjab | 1 | 22 | 4 % |
| Crop Disease | Haryana | 1 | 18 | 5 % |
| Pest Control | Maharashtra | 6 | 20 | 23 % |
| Pest Control | Rajasthan | 5 | 16 | 24 % |
| Irrigation | Maharashtra | 4 | 14 | 22 % |
| Protected Cultivation | Karnataka | 0 | 14 | 0 % |
| Organic Farming | Madhya Pradesh | 0 | 12 | 0 % |
| Organic Farming | Maharashtra | 0 | 12 | 0 % |
| Protected Cultivation | Maharashtra | 0 | 11 | 0 % |
| Irrigation | Karnataka | 2 | 10 | 17 % |

By domain, unanswered volume in gap cells: Crop Disease 53 · Pest Control 36 ·
Protected Cultivation 25 · Irrigation 24 · Organic Farming 24 · Crop Selection 22 ·
Soil Health 20. By state: Maharashtra 70 · Karnataka 33 · Rajasthan 27 · Haryana 25 ·
Punjab 22 · Madhya Pradesh 12 · Gujarat 8 · Tamil Nadu 7.

### The same gaps, by crop

The coverage model also runs at crop granularity — 97 cells, 51 of them gaps. Unanswered volume
in crop-level gap cells:

| Crop | Unanswered | Crop | Unanswered |
|---|---|---|---|
| Mustard | 30 | Rice | 10 |
| Wheat | 28 | Cotton | 8 |
| Tomato | 21 | Grapes | 8 |
| Mango | 20 | Cucumber | 7 |
| Banana | 19 | Maize | 5 |

This is the most directly actionable list for commissioning work: five crops — mustard, wheat,
tomato, mango and banana — account for 118 of the unanswered queries.

**Protected Cultivation and Organic Farming have zero GDB entries** in the states asking about
them — these are whole topics, not individual missing answers.

## Recommendations

### For the agri team (GDB growth, in order)
1. **Commission the top 4 question types first** (mustard aphid, wheat yellow rust, saline-soil
   reclamation, mango fruit fly): 95 queries from 84 farmers across 6 states, all with
   near-zero existing coverage. ~10 well-written entries would close them.
2. **Open two new topic areas: Protected Cultivation and Organic Farming.** No entries exist;
   50 queries were turned away. Start with polyhouse tomato/cucumber and vermicompost/
   bio-pesticide basics.
3. **Write Hindi and Punjabi variants for the north-west belt entries** — that is where the
   language mix in unanswered queries is shifting, and where growth is appearing.
4. **Prompt for location before answering.** A sizeable share of unanswered queries carry no
   state at all, so they cannot be matched to regional entries or placed on the map. Asking for
   the state up front would improve retrieval and sharpen this report at the same time.

### For the outreach team (field engagement, ranked by unanswered volume)
| Priority | Where | Focus | Unanswered |
|---|---|---|---|
| CRITICAL | Punjab | Crop disease (wheat rust) | 22 |
| CRITICAL | Maharashtra | Pest control (mango fruit fly, cotton bollworm) | 20 |
| CRITICAL | Haryana | Crop disease (wheat rust, rice) | 18 |
| HIGH | Rajasthan | Pest control (mustard aphid) | 16 |
| HIGH | Maharashtra | Irrigation (grape/pomegranate drip) | 14 |
| HIGH | Karnataka | Protected cultivation | 14 |
| HIGH | Madhya Pradesh / Maharashtra | Organic farming | 12 + 12 |
| HIGH | Maharashtra | Protected cultivation | 11 |

Maharashtra appears in four of the top eight rows and carries 70 unanswered queries — a
single multi-topic visit (pest, irrigation, organic, polyhouse) would have the highest yield.

## Method and caveats
- Queries come from `farmer_feedback.disclaimer_logs` and the `disclaimer_triggered` rows of
  `gdb_gap_detector.raw_queries`. They are normalised (language, state, domain taxonomy, crop
  extracted from text), embedded with `paraphrase-multilingual-MiniLM-L12-v2`, and clustered by
  average-linkage on cosine distance (threshold 0.35, minimum cluster size 2). Farmer ids are
  hashed; only counts are reported.
- **Exclusions.** Off-topic questions and synthetic test traffic are removed before analysis and
  reported as separate counts, so neither can inflate a gap. Both lists are configurable
  (`EXCLUDE_DOMAINS`, `EXCLUDE_CHANNELS`).
- **Sample-size caveat:** 310 analysed queries over 90 days from a hackathon cluster. Ranks are
  robust at the top (the first four clusters are 2–6× larger than the rest); the tail and the
  growth column are not.
- **GDB caveat:** the production GDB (~20k entries) was not available; coverage uses the
  96-entry mini golden DB (`farmer_feedback.gdb_entries`). Absolute coverage percentages will
  rise against the real GDB; the *relative* ranking of gaps should hold because the unanswered
  side of the ratio is real.
- Channel mix of the source data: web, telegram, chat and unknown; the `test` channel is
  excluded from the analysis by default.

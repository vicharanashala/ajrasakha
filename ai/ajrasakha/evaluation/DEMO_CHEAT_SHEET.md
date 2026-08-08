# Project 3 Demo — Cheat Sheet (15 min)

Before you start talking: `cd ai` then have this ready to run:
`uv run python ajrasakha/evaluation/demo_project3.py` (~10 sec, prints all 6 steps in one go — scroll/point at each section as you narrate; Step 5 needs one extra manual action).

| # | What I run / click | What I say out loud | Time |
|---|---|---|---|
| **Open** | *(before running anything)* | "Before this PR, the pipeline tested whether an answer came out — not whether it was correct. We have 20,000+ expert-validated GDB answers as ground truth, but nothing compared against them." | 0:30 |
| **1** | Run the script; point at STEP 1's diff | "`answer_eval.py` was a disabled stub — always returned 'disabled,' ignored its inputs. Here's the diff: it now actually calls the real scoring logic in `deepeval_metrics.py`, which existed the whole time but was never wired up." | 1:30 |
| **2** | Point at STEP 2's console output | "This is the exact documented pipeline command, unmodified — real routing, real tool checks, real CSV report, and it regenerates the trends report automatically at the end. No demo-only shortcuts." | 2:00 |
| **3** | Point at STEP 3's score table | "Real Gemini call, real content: crop's right — 1.0. Treatment's mostly right — 0.3. Region's flatly wrong — 0.0. A bundled score would've averaged to 0.43 — that tells you something's medium, not what's wrong. Three separate numbers make the region failure impossible to miss." | 3:00 |
| **4** | Point at STEP 4's output | "Mock mode never calls a judge by design, so I can't flip one live score here in real time — and even in live mode, Gemini's free tier caps at 5 requests/minute while one full scoring call needs 15+, so a live run isn't demo-safe either way. So I'm feeding the same shape of regression — a wrong-region score — through the real detection pipeline, labeled honestly as a demo run, not live output." | 3:00 |
| **5** | **Open `quality_trends.html` in browser** | "Regenerated automatically, no extra step. Red banner: GDB Queries, RegionCorrectness, dropped 0.90 to 0.20 — a 78% drop. Only that cell is flagged; crop and treatment for the same domain stay green. The regression is pinned to one specific fact, not a vague 'quality dropped.'" | 2:30 |
| **6** | Point at STEP 6 — **do not read the table aloud** | "Two other open PRs solve this same problem statement. We share the core fix with both — wiring up real scoring. What neither of them has: quality-trend tracking over time and automatic regression alerts, wired straight into the existing pipeline command with zero extra steps." | 1:30 |
| **Close** | — | "57 out of 57 tests passing (`uv run python -m pytest ajrasakha/evaluation/tests`), plus 3 more for the stable-suite tool under `ai/tests`. Full writeup and honest PR comparison, including the post-audit fixes, in `product.md`." | 1:00 |

**Total: ~15:00**

---

## If asked

**"What's that `\ No newline at end of file` line in the diff?"**
Normal git artifact — the old file just didn't end with a trailing newline. Not a bug, not related to this change.

**"Why does TreatmentCorrectness need to literally name 'Cultural Practices'?"**
That was the pre-audit design — STEP 3's table above replays a real Gemini call captured under
the *old* criteria (checking the domain label as a stand-in for treatment), kept as an honest
historical record rather than re-run. It's since been fixed (product.md §7, FIX 6):
TreatmentCorrectness now checks real treatment/dosage content against a reference answer —
real GDB fixture data for "GDB queries", a clearly-labeled hand-authored stand-in for "Soil"
(no real dosage data exists in this repo), and N/A for domains where "treatment" isn't a
coherent concept at all (Weather/Market/Schemes/Greetings).

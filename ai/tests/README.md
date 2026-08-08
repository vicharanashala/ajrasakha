\# Ajrasakha Stable Health Suite



\## Purpose



This framework provides automated health validation for Ajrasakha after deployment.



The goal is to quickly answer:



\* Are critical APIs working?

\* Are MCP services reachable?

\* Can the core AI workflows execute successfully?



This suite is intended as a deployment health check and regression detection tool.



\---



\# Test Layers



\## Layer 1 — API Contract Validation



Validates that critical backend endpoints are reachable and behave as expected.



Examples:



\* AI API health endpoints

\* Questions endpoints

\* Answers endpoints

\* Analytics endpoints

\* Authentication endpoints

\* WhatsApp backend endpoints



A PASS means:



\* Endpoint responded successfully

\* Expected authentication behavior is enforced

\* Response status matches expectations



\---



\## Layer 2 — MCP Connectivity



Validates connectivity to all required MCP services.



Current MCPs:



\* GDB

\* Weather

\* Soil

\* eNAM

\* Agmarknet

\* Reviewer

\* Location

\* Schemes

\* Chemical Checker



A PASS means:



\* MCP endpoint is reachable

\* MCP responds correctly



\---



\## Layer 3 — Stable LangGraph Scenarios



Runs the stable:True live AI workflow scenarios - one per brief domain.



Current scenarios:



\* weather\_question\_1 (Weather)

\* market\_question\_1 (Market)

\* soil\_question\_1 (Soil)

\* scheme\_question\_1 (Schemes)

\* gdb\_question\_1 (GDB queries)

\* greeting\_question (Greetings)



A PASS means:



\* Request successfully enters the graph

\* Planner executes

\* Expected tool path is observed

\* Graph completes successfully

\* No runtime exception occurs



Layer 3 also runs answer-quality scoring (`--mode live` calls

`evaluate\_response\_quality()` - see `ajrasakha/evaluation/answer\_eval.py`),

so `evaluation\_report\_live.csv` carries per-metric quality-score columns

alongside the execution-health checks. The combined `stable\_suite\_report.csv`

/`.html` preserve those columns per test case and per domain (see

`run\_stable\_suite.py`'s `QUALITY\_SCORE\_COLUMNS`) - Layer 1/2 rows simply

leave them blank, since API/MCP checks have no quality score to report.



\---



\# Running Locally



From:



```bash

ai/

```



Run:



```bash

python -m tests.run\_stable\_suite

```



Reports generated:



```text

tests/reports/stable\_suite\_report.html

tests/reports/stable\_suite\_report.csv

tests/api/reports/api\_contract\_report.csv

tests/api/reports/mcp\_connectivity\_report.csv

evaluation\_report\_live.csv

```



\---



\# Environment Variables



Required:



```text

BACKEND\_BASE\_URL

REMOTE\_IP

LIVE\_API\_URL

ASSISTANT\_ID

```



Example:



```text

BACKEND\_BASE\_URL=https://desk.vicharanashala.ai/api

REMOTE\_IP=100.100.108.44

LIVE\_API\_URL=http://<deployment-host>:2026/runs/stream

ASSISTANT\_ID=<assistant-id>

```



\---



\# CI/CD Integration



Recommended execution point:



Post Deployment



Flow:



Deployment

↓

Stable Suite

↓

HTML Report Generation

↓

Artifact Upload

↓

Developer Review



The suite should run automatically after successful deployment.



\---



\# Current Limitations



The suite currently validates:



\* Infrastructure health

\* MCP connectivity

\* AI workflow execution

\* Answer quality, for Layer 3's live-mode scenarios (relevancy, faithfulness,

  contextual relevancy, GDB-reference match, and crop/treatment/region

  correctness - see `ajrasakha/evaluation/deepeval\_metrics.py`)



The suite does NOT currently validate:



\* Farmer friendliness

\* Safety quality



Answer quality evaluation (DeepEval metrics) now runs as part of Layer 3 -

no longer a future phase. Farmer-friendliness and safety-specific checks

remain unimplemented.



\---



\# Future Roadmap



Phase 1 (done)



\* Infrastructure Validation

\* MCP Validation

\* Workflow Validation



Phase 2 (done)



\* Answer Quality Evaluation

\* DeepEval Metrics



Golden Scenario Benchmarks remain future work.



Phase 3



\* Trend Tracking

\* Historical Performance Monitoring

\* Release Confidence Scoring




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



Runs a small set of stable live AI workflow scenarios.



Current scenarios:



\* weather\_question\_1

\* market\_question\_1

\* gdb\_question\_1



A PASS means:



\* Request successfully enters the graph

\* Planner executes

\* Expected tool path is observed

\* Graph completes successfully

\* No runtime exception occurs



Current Layer 3 validates execution health, not answer quality.



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



The suite does NOT currently validate:



\* Factual correctness of answers

\* Groundedness

\* Farmer friendliness

\* Safety quality

\* Hallucinations



Answer quality evaluation is planned as a future phase.



\---



\# Future Roadmap



Phase 1



\* Infrastructure Validation

\* MCP Validation

\* Workflow Validation



Phase 2



\* Answer Quality Evaluation

\* DeepEval Metrics

\* Golden Scenario Benchmarks



Phase 3



\* Trend Tracking

\* Historical Performance Monitoring

\* Release Confidence Scoring




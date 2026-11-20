# Ajrasakha Hybrid Agentic Testing Architecture
### Enterprise Multi-Layer CI/CD & Synthetic Quality Verification

---

## 1. Executive Summary & Purpose

The Ajrasakha repository is a polyglot monorepo of **43 interconnected applications, microservices, and specialized interfaces** spanning Python, Node.js, React, and containerized MCP servers.

### The Problem Solved
* **Why not a single monolithic test suite?** Running all 43 services on every pull request incurs 25–35+ minute CI times, high runner costs, and blocks developers across teams whenever non-deterministic LLM tests (Promptfoo) or external APIs experience transient variance.
* **Why not purely isolated app suites?** Siloed app tests fail to catch cross-service contract breaking changes (e.g. backend route changes breaking the Reviewer Author interface, or MCP schema modifications breaking LangGraph tool calls).

### The Solution: The 3-Tier Hybrid Strategy
1. **Layer 1: App-Isolated Fast CI (PR Gates)** &rarr; Fine-grained Git `paths:` triggers run only the tests for modified code in 2–5 minutes.
2. **Layer 2: Cross-Boundary Contract & Schema Gate** &rarr; Validates schema parity across Frontend &harr; Backend, AI &harr; MCP, and microservices in under 2 minutes.
3. **Layer 3: End-to-End Agentic Synthetic Journey (Nightly / Staging Gate)** &rarr; Asynchronously simulates the complete farmer-to-expert-to-GDB lifecycle across the entire system.

---

## 2. Interactive CLI Demonstration Commands

Run these commands in terminal to demonstrate the test architecture to leadership:

### Master Orchestrator (Demonstration Runner)
```bash
# Run default demonstration (Layer 2 Contract Gate + Layer 3 Synthetic Farmer Journey)
npm run test:hybrid

# Or run via Node directly
node testing/orchestrator.js

# Run the complete suite including Layer 1 Playwright & Promptfoo
node testing/orchestrator.js --all
```

### Layer-by-Layer Verification

#### Layer 1: App-Isolated Test Suites
```bash
# 1. Specialized Microservices (Playwright API + Swagger UI + Promptfoo LLMs)
npm run test:layer1:apis

# 2. Reviewer Core Backend (TypeScript build & service tests)
npm run test:layer1:backend

# 3. Reviewer Frontend & Author Desk (Vite + React build & typecheck)
npm run test:layer1:frontend

# 4. AI & LangGraph Multi-Agent Engine (Pytest agents & gate tests)
npm run test:layer1:ai

# 5. Model Context Protocol (MCP) Servers (Syntax & container checks)
npm run test:layer1:mcp

# 6. Testers Dashboard (Vitest suite)
npm run test:layer1:testers-dashboard
```

#### Layer 2: Cross-Boundary Contract Gateway
```bash
# Validates schema parity between Frontend <-> Backend, AI <-> MCP, and Microservices
npm run test:layer2:contracts
```

#### Layer 3: End-to-End Synthetic Farmer Journey
```bash
# Simulates the full organizational lifecycle from farmer WhatsApp query to GDB publication
npm run test:layer3:synthetic
```

---

## 3. The End-to-End Synthetic Journey (Layer 3)

The synthetic runner simulates the true organizational workflow:

```
[Phase 1: Farmer Ingress]
   Farmer sends question via WhatsApp ("Cotton leaf spot in Rupnagar, Punjab")
           │
           ▼
[Phase 2: Three-Tier Knowledge Resolution]
   ├─ GDB Semantic Search  ──> [MISS] (Unseen question, score 0.41)
   ├─ PoP Guideline Search ──> [MISS] (No specific diagnosis)
   └─ AI Fallback Engine   ──> [HIT]  (LangGraph + Weather telemetry + Chemical detector)
           │
           ├─ Instant Provisional Advisory dispatched to farmer with disclaimer
           │
           ▼
[Phase 3: Reviewer System Allocation]
   Question routed to Reviewer Backend (backend/src/modules/question)
   Allocated to Expert Dr. R. Sharma based on single ownership workload
           │
           ▼
[Phase 4: Author's Desk]
   Author drafts verified answer using Writing Assistant API & Chemical Safety checks
           │
           ▼
[Phase 5: Consensus Peer Review (3-Approval Rule)]
   ├─ Reviewer 1 (Agronomist): APPROVE (+1)
   ├─ Reviewer 2 (Pathologist): Suggests modification -> Approval count resets to 0!
   ├─ Re-drafted and verified:
   │    Reviewer 1: APPROVE (+1)
   │    Reviewer 2: APPROVE (+2)
   │    Reviewer 3: APPROVE (+3) -> Consensus reached!
           │
           ▼
[Phase 6: Moderator Quality Gate & Ingestion]
   Chief Moderator conducts final standards review -> APPROVES
   Committed to Golden Dataset (GDB) via gdb-draft daemon
   Farmer receives WhatsApp resolution message
           │
           ▼
[Phase 7: Closed-Loop Verification]
   Identical farmer query re-submitted
   Tier 1 GDB Vector Search returns DIRECT HIT in 38ms!
   Zero hallucinations, instant expert verified answer
```

---

## 4. GitHub Actions Workflows Directory Structure

```
.github/workflows/
├── apis-test-suite.yml              # Layer 1: paths: ['apis/**', '.github/workflows/apis-test-suite.yml']
├── backend-test-suite.yml           # Layer 1: paths: ['backend/**', '.github/workflows/backend-test-suite.yml']
├── frontend-test-suite.yml          # Layer 1: paths: ['frontend/**', '.github/workflows/frontend-test-suite.yml']
├── ai-test-suite.yml                # Layer 1: paths: ['ai/**', '.github/workflows/ai-test-suite.yml']
├── mcp-test-suite.yml               # Layer 1: paths: ['mcp/**', '.github/workflows/mcp-test-suite.yml']
├── testers-dashboard-test-suite.yml # Layer 1: paths: ['testers-dashboard/**', '.github/workflows/testers-dashboard-test-suite.yml']
├── contracts-validation.yml         # Layer 2: paths: ['**/types/**', '**/interfaces/**', 'apis/**', 'mcp/**']
└── e2e-synthetic-flow.yml           # Layer 3: schedule: ['0 2 * * *'] (Nightly), workflow_dispatch, staging
```

---

## 5. Audit Reports Generated

All verification scripts write structured Markdown reports ready for PR comments or CI summaries:
* **APIs Agentic QA Report:** `apis/testing/reports/qa-verification-report.md`
* **Contract Verification Report:** `testing/contracts/reports/contracts-verification-report.md`
* **End-to-End Synthetic Journey Report:** `testing/e2e-synthetic/reports/synthetic-journey-report.md`

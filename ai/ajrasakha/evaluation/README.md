# Ajrasakha Evaluation Pipeline

## Overview

This pipeline is used to evaluate the live Ajrasakha LangGraph + MCP orchestration system.

The evaluator validates:

- Routing correctness
- MCP tool invocation
- Runtime execution failures
- Tool usage
- Response generation
- Latency
- Trace extraction

The pipeline generates structured CSV reports for debugging and analysis.

---

## Architecture

Flow:

User Query
→ LangGraph Orchestration
→ MCP Tool Routing
→ Tool Execution
→ Response Generation
→ Evaluation Pipeline
→ CSV Report Generation

Current evaluation focuses on:
- routing validation
- tool validation
- runtime error detection
- MCP extraction
- trace diagnostics

---

## Environment Setup

Create virtual environment:

```bash
uv venv
```

Activate environment (Windows):

```powershell
.\.venv\Scripts\activate
```

Install dependencies:

```bash
uv sync
```

---

## Starting MCP Servers

Start MCP services:

```bash
docker compose -f docker-compose.mcp.yml up --build
```

Verify MCP server is reachable:

```powershell
curl -UseBasicParsing http://localhost:8004/mcp
```

---

## Running Live Evaluation

Run live evaluation pipeline:

```bash
python -m ajrasakha.evaluation.run --mode live
```

Generated report:

```text
evaluation_report_live.csv
```

---

## Evaluation Output

The generated CSV contains:

- expected_tools
- observed_tools
- technical_pass
- routing_pass
- tool_pass
- latency_seconds
- executed_tools
- executed_mcp_services
- runtime errors
- trace diagnostics

Current live evaluation status:

- technical validation working
- routing validation working
- tool extraction working
- MCP extraction working
- runtime failure capture working

---

## Common Issues & Fixes

### 1. MCP Server Returning Zero Tools

Issue:

```text
RuntimeError: No tools returned from MCP server
```

Cause:

Using:

```python
@tool
```

instead of:

```python
@mcp.tool()
```

Fix:

Register tools using FastMCP decorator:

```python
@mcp.tool()
```

---


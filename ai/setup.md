# Initial Setup — AjraSakha AI (`ai/`)

Commands below assume a Unix-like shell (Linux or macOS) and that you work from the `ai` directory:

```bash
cd /path/to/ajrasakha/ai
```

Replace `/path/to/ajrasakha` with your clone path (for example `/bigworkspace/shubhankar/ajrasakha`).

---

## 1. Install uv (Python toolchain)

If `uv` is not installed:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Add it to your PATH for the current shell (the installer also suggests this):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

To persist for new shells (bash):

```bash
grep -q '\.local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

Verify:

```bash
uv --version
```

---

## 2. Python version

This project pins **Python 3.11** (required for `langgraph dev` with the in-memory server). The file `.python-version` tells `uv` which interpreter to use.

Install that interpreter with `uv` (downloads if missing):

```bash
cd /path/to/ajrasakha/ai
uv python install 3.11
```

---

## 3. Environment variables

Create a local env file from the example:

```bash
cp .env.example .env
```

Edit `.env` and set API keys, MongoDB URIs, and any other values your team uses. The example file is minimal; your deployment may need additional variables (LLM keys, MCP URLs, Postgres, and so on). Coordinate with the team or see `README.md` for architecture context.

`langgraph.json` points the dev server at `.env` automatically.

---

## 4. Install Python dependencies

Install the package and all dependency groups:

```bash
uv sync --all-groups
```

This creates or refreshes `.venv` under `ai/` using the pinned Python.

### 4a. Install LangGraph CLI (required for `langgraph dev`)

> [!IMPORTANT]
> The LangGraph CLI (`langgraph-cli`) and in-memory runtime are **not** included in the base `pyproject.toml` dependencies. You must install them explicitly as a dev dependency, otherwise `uv run langgraph dev` will fail with:
> ```
> error: Failed to spawn: `langgraph`
>   Caused by: No such file or directory (os error 2)
> ```

Install the CLI with the in-memory extra:

```bash
uv add --dev "langgraph-cli[inmem]"
```

This pulls in `langgraph-cli`, `langgraph-api`, and `langgraph-runtime-inmem`.

---

## 5. Create `langgraph.json` (required for `langgraph dev`)

> [!IMPORTANT]
> The repository does not ship a `langgraph.json` config file. Without it, `langgraph dev` will fail with:
> ```
> Error: Invalid value for '--config': Path 'langgraph.json' does not exist.
> ```

Create `langgraph.json` in the `ai/` directory with the following content:

```json
{
  "dependencies": ["."],
  "graphs": {
    "ajrasakha": "./ajrasakha/agents/ajrasakha.py:graph"
  },
  "env": ".env"
}
```

This tells the LangGraph dev server:
- **`dependencies`** — install the current project (`.`) into the runtime
- **`graphs`** — expose the compiled `graph` object from `ajrasakha/agents/ajrasakha.py`
- **`env`** — load environment variables from `.env`

---

## 6. Run LangGraph locally (Studio / dev API)

From `ai/`:

```bash
uv run langgraph dev
```

Useful options:

```bash
uv run langgraph dev --no-browser   # do not open a browser tab
uv run langgraph dev --port 2024    # custom port (default may vary by CLI version)
```

The CLI prints the local API URL (often `http://127.0.0.1:2024`) and a Studio link.

> [!NOTE]
> If the default port is already in use, the server will automatically pick a different port and print it in the output.

---

## 7. Run tests (optional)

```bash
uv run pytest
```

---

## 8. Run the FastAPI app directly (optional)

If you need the standalone app module:

```bash
uv run python -m ajrasakha.app
```

(Default bind is defined in `ajrasakha/app.py`.)

---

## 9. Docker stack (optional)

For Postgres, Redis, and the containerized API workflow, see `README.md` (prerequisites: Docker and Compose). Typical patterns referenced there:

```bash
docker compose up postgres -d     # database only, for lighter local use
docker compose up --build         # full stack (see compose file comments)
```

Some workflows use `aegra` CLI; install and commands are documented in `README.md`.

---

## Quick copy-paste checklist

```bash
# 1. Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# 2. Navigate & install Python 3.11
cd /path/to/ajrasakha/ai
uv python install 3.11

# 3. Environment variables
cp .env.example .env
# ⚠️  Edit .env with real credentials

# 4. Install dependencies + LangGraph CLI
uv sync --all-groups
uv add --dev "langgraph-cli[inmem]"

# 5. Create langgraph.json (if missing)
cat > langgraph.json << 'EOF'
{
  "dependencies": ["."],
  "graphs": {
    "ajrasakha": "./ajrasakha/agents/ajrasakha.py:graph"
  },
  "env": ".env"
}
EOF

# 6. Run the dev server
uv run langgraph dev
```

---

## Troubleshooting

### `error: Failed to spawn: langgraph`

**Cause:** The `langgraph-cli` package is not installed in the virtual environment.

**Fix:**

```bash
uv add --dev "langgraph-cli[inmem]"
```

---

### `Error: Invalid value for '--config': Path 'langgraph.json' does not exist.`

**Cause:** The `langgraph.json` config file is missing from the `ai/` directory.

**Fix:** Create the file as described in [Step 5](#5-create-langgraphjson-required-for-langgraph-dev) above.

---

### `uv: command not found`

**Cause:** The `uv` binary is not on your PATH.

**Fix:**

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Or re-run the installer: `curl -LsSf https://astral.sh/uv/install.sh | sh`

---

### Port already in use

**Cause:** Another process (or a previous dev server) is using the default port.

**Fix:** Either stop the other process, or specify a different port:

```bash
uv run langgraph dev --port 3000
```

---

If anything still fails, confirm:
1. `uv --version` works
2. You are inside `ai/`
3. `.python-version` contains `3.11`
4. `langgraph.json` exists in `ai/`
5. `langgraph-cli` is installed (`uv run langgraph --help`)

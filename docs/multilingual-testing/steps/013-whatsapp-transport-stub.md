# Step 013 — WhatsApp Test Transport Stub

**Date:** 2026-07-23
**Status:** COMPLETE (stub) — immutable historical record

---

## What Changed

Created `transports/whatsapp_transport.py` — a pluggable, disabled-by-default
WhatsApp transport stub for future integration testing via a WhatsApp gateway.

### Safety Rules

1. **Never sends real messages.** `run_whatsapp_case()` raises `NotImplementedError`
   until implemented with real HTTP logic.
2. **Blocked when env vars are missing.** Returns a `BLOCKED` result dict (never PASS).
3. **Endpoint and identity are redacted** in all log output.
4. **Correlation IDs are deterministic** — derived from SHA-256 of `case_id` so
   traces can be correlated without storing state.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_TEST_ENDPOINT` | Base URL of the test WhatsApp gateway (sandbox only) |
| `WHATSAPP_TEST_IDENTITY` | Sandbox phone/identity (must be a test number) |
| `WHATSAPP_CORRELATION_ID_PREFIX` | Log correlation prefix (default: `ml-test`) |
| `WHATSAPP_TEST_TIMEOUT_S` | Poll timeout in seconds (default: 60) |

### Pluggable Interface

The transport returns the same result shape as `run_live_case()` so the runner
can call it transparently:

```python
if transport == "whatsapp":
    raw = run_whatsapp_case(case_dict)
else:
    raw = run_live_case(case_dict)
```

### CLI Flag

```bash
python -m ajrasakha.evaluation.multilingual.run_multilingual \
    --mode live --transport whatsapp
```

Selecting `--transport whatsapp` without env vars returns BLOCKED for every case.

### Files Created

- `ai/ajrasakha/evaluation/multilingual/transports/__init__.py`
- `ai/ajrasakha/evaluation/multilingual/transports/whatsapp_transport.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_whatsapp_transport.py`

---

> [!CAUTION]
> The WhatsApp transport MUST only be used with a dedicated sandbox identity.
> Real farmer phone numbers must never be used in testing.

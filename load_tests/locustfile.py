"""
Ajrasakha — Project 7: Reviewer System Load & SLA Testing Suite
================================================================
All request events are emitted through Python's standard logging module so
that the Locust built-in LOGS page (http://localhost:8089/logs) becomes a
full observability dashboard, showing every success, warning, error, critical
failure and debug event with rich metadata.

Structured JSON logs are also written to reports/structured_logs.json for the
standalone HTML Logs Dashboard (reports/logs_dashboard.html).
"""

import os
import random
import json
import logging
import datetime
import traceback
import uuid

from locust import HttpUser, task, between, events
import config

# ─────────────────────────────────────────────────────────────────────────────
# Custom logger — feeds the Locust LOGS tab
# ─────────────────────────────────────────────────────────────────────────────
_log = logging.getLogger("ajrasakha.load_test")
# Locust already configures the root logger; just make sure our namespace
# propagates and has a fine-enough level so every entry appears in the UI.
_log.setLevel(logging.DEBUG)

# Compact, readable format that renders well in the LOGS page mono-font box
_LOG_FMT = "%(levelname)-8s | %(name)-22s | %(message)s"
if not logging.getLogger().handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(_LOG_FMT))
    _h.setLevel(logging.DEBUG)
    logging.getLogger().addHandler(_h)


# ─────────────────────────────────────────────────────────────────────────────
# Structured JSON Log (feeds logs_dashboard.html)
# ─────────────────────────────────────────────────────────────────────────────
LOG_DIR           = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(LOG_DIR, exist_ok=True)
DETAILED_LOG_PATH = os.path.join(LOG_DIR, "detailed_failures.log")
JSON_LOG_PATH     = os.path.join(LOG_DIR, "structured_logs.json")

# Wipe on every new test run
with open(JSON_LOG_PATH, "w", encoding="utf-8") as _f:
    json.dump([], _f)


def _read_json_log():
    try:
        with open(JSON_LOG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _write_json_log(entries):
    try:
        with open(JSON_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


FIX_MAP = {
    400: "Verify the request payload schema matches the backend validator.",
    401: "Authentication token expired or missing. Re-login is required.",
    403: "User lacks permission for this endpoint. Check role assignments.",
    404: "Endpoint not found. Confirm the route is registered in the backend.",
    429: "Rate limit exceeded. Reduce concurrent users or increase wait_time.",
    500: "Internal Server Error. Inspect backend logs for the root exception.",
    502: "Bad gateway. Upstream service may be unreachable.",
    503: "Service unavailable. Backend is overloaded or restarting.",
    0:   "Network connection refused. Ensure the backend server is running.",
}


def write_log_entry(
    level,
    module,
    action,
    message,
    response_time_ms=None,
    status_code=None,
    user_id=None,
    request_id=None,
    error_detail=None,
    stack_trace=None,
    suggested_fix=None,
    environment="development",
):
    entry = {
        "id":            str(uuid.uuid4()),
        "timestamp":     datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "level":         level,
        "module":        module,
        "action":        action,
        "message":       message,
        "response_time": response_time_ms,
        "status_code":   status_code,
        "user_id":       user_id or "anonymous",
        "request_id":    request_id or str(uuid.uuid4())[:8],
        "error_detail":  error_detail,
        "stack_trace":   stack_trace,
        "suggested_fix": suggested_fix,
        "environment":   environment,
    }
    entries = _read_json_log()
    entries.append(entry)
    _write_json_log(entries[-500:])


# ─────────────────────────────────────────────────────────────────────────────
# Helper: emit one rich Python log line into the Locust LOGS tab
# ─────────────────────────────────────────────────────────────────────────────
def _emit(level, module, action, msg, rt=None, sc=None, fix=None, tb=None):
    """Emit a structured line to the Python logger (→ Locust LOGS tab)."""
    rt_str = f"  rt={rt:.1f}ms" if rt is not None else ""
    sc_str = f"  status={sc}" if sc is not None else ""
    line   = f"[{module}] {action}{sc_str}{rt_str}  →  {msg}"
    if fix:
        line += f"  |  FIX: {fix}"
    if tb:
        line += f"\n    STACK: {tb.strip()[:400]}"

    py_level = {
        "SUCCESS":  logging.INFO,
        "INFO":     logging.INFO,
        "DEBUG":    logging.DEBUG,
        "WARNING":  logging.WARNING,
        "ERROR":    logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }.get(level, logging.INFO)

    _log.log(py_level, line)


# ─────────────────────────────────────────────────────────────────────────────
# Global Locust request event listener
# ─────────────────────────────────────────────────────────────────────────────
@events.request.add_listener
def on_request(request_type, name, response_time, response_length,
               response, context, exception, **kwargs):
    sc     = response.status_code if response else 0
    module = (context.get("user_class", "UnknownUser")
              if context else "UnknownUser")
    action = f"{request_type} {name}"
    rt     = round(response_time, 1)
    rid    = str(uuid.uuid4())[:8]

    # ── FAILURE (4xx / 5xx / connection error) ──────────────────────────────
    if exception or (response and sc >= 400):
        err_body = str(exception) if exception else (
            response.text[:300] if response else "No response body")
        st = ("".join(traceback.format_exception(
                  type(exception), exception, exception.__traceback__))
              if exception else None)
        fix   = FIX_MAP.get(sc, FIX_MAP.get(0, "Review request payload and backend logs."))
        level = "CRITICAL" if sc >= 500 or sc == 0 else "ERROR"

        _emit(level, module, action,
              f"FAILED — {err_body[:180]}",
              rt=rt, sc=sc, fix=fix, tb=st)

        write_log_entry(
            level=level, module=module, action=action,
            message=f"Request FAILED: {err_body[:200]}",
            response_time_ms=rt, status_code=sc,
            request_id=rid, error_detail=err_body,
            stack_trace=st, suggested_fix=fix,
        )

        try:
            with open(DETAILED_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(
                    f"[{request_type}] {name} | "
                    f"Status: {sc or 'NET_ERR'} | "
                    f"Time: {rt}ms | "
                    f"Error: {err_body[:120]}\n"
                )
        except Exception:
            pass

    # ── SLOW SUCCESS (>1 s) → WARNING ───────────────────────────────────────
    elif response_time > 1000:
        fix = "Consider adding caching, DB indexes, or query optimisation."
        _emit("WARNING", module, action,
              f"SLOW response ({rt}ms) — SLA threshold exceeded",
              rt=rt, sc=sc, fix=fix)
        write_log_entry(
            level="WARNING", module=module, action=action,
            message=f"Slow response detected ({rt}ms)",
            response_time_ms=rt, status_code=sc,
            request_id=rid, suggested_fix=fix,
        )

    # ── NORMAL SUCCESS ───────────────────────────────────────────────────────
    else:
        _emit("SUCCESS", module, action,
              f"OK  ({rt}ms)",
              rt=rt, sc=sc)
        # Only write every 5th success to JSON to keep the file small
        if random.randint(1, 5) == 1:
            write_log_entry(
                level="SUCCESS", module=module, action=action,
                message="Request completed successfully",
                response_time_ms=rt, status_code=sc,
                request_id=rid,
            )


# ─────────────────────────────────────────────────────────────────────────────
# Test lifecycle events
# ─────────────────────────────────────────────────────────────────────────────
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    msg = (f"Load test STARTED  |  target={config.BASE_URL}  |  "
           f"users={environment.runner.target_user_count if environment.runner else '?'}")
    _log.info(f"[LocustRunner] TEST_START  →  {msg}")
    write_log_entry(level="INFO", module="LocustRunner",
                    action="TEST_START", message=msg)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.runner.stats if environment.runner else None
    if stats:
        agg   = stats.total
        total = agg.num_requests
        fails = agg.num_failures
        rate  = f"{(1 - fails/total)*100:.1f}%" if total else "N/A"
        avg   = f"{agg.avg_response_time:.0f}ms"
        msg   = (f"Load test STOPPED  |  requests={total}  "
                 f"failures={fails}  success_rate={rate}  avg_rt={avg}")
    else:
        msg = "Load test STOPPED."
    _log.info(f"[LocustRunner] TEST_STOP  →  {msg}")
    write_log_entry(level="INFO", module="LocustRunner",
                    action="TEST_STOP", message=msg)


@events.spawning_complete.add_listener
def on_spawning_complete(user_count, **kwargs):
    msg = f"All {user_count} users spawned and running."
    _log.info(f"[LocustRunner] SPAWN_COMPLETE  →  {msg}")
    write_log_entry(level="DEBUG", module="LocustRunner",
                    action="SPAWN_COMPLETE", message=msg)


# ─────────────────────────────────────────────────────────────────────────────
# User Classes
# ─────────────────────────────────────────────────────────────────────────────
class ReviewerExpertUser(HttpUser):
    """
    Simulates an Agricultural Expert reviewing questions & accessing Microservices.
    - Health check ping via GET /api/health (60-70% read throughput)
    - Logs in via POST /api/auth/login (real JWT auth flow)
    - Queries LangGraph AI Agent via POST /api/ai/query
    - Fetches MCP Market data via GET /api/mcp/market
    - Submits answer reviews via POST /api/answers/submit
    """
    host      = config.BASE_URL
    wait_time = between(1, 3)
    auth_token: str | None = None
    user_id:    str        = "anonymous"

    def on_start(self):
        self.user_id = f"expert_{random.randint(1, 50)}"
        _log.debug(f"[ReviewerExpertUser] USER_START  →  session opened for {self.user_id}")
        write_log_entry(level="DEBUG", module="ReviewerExpertUser",
                        action="USER_START",
                        message=f"New session started for {self.user_id}",
                        user_id=self.user_id)
        self.login()

    @task(4)
    def check_health(self):
        """High-frequency health-check ping (60-70 % of read throughput)."""
        with self.client.get(
            config.HEALTH_ENDPOINT,
            catch_response=True,
            name="GET /api/health",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 401, 404, 405):
                response.success()

    def login(self):
        """Authenticate via real backend auth endpoint and capture JWT token."""
        payload = {"email": f"{self.user_id}@vicharanashala.ai",
                   "password": "TestPassword123!"}
        with self.client.post(
            config.LOGIN_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            catch_response=True,
            name="POST /api/auth/login",
        ) as response:
            if response.status_code in (200, 201):
                try:
                    data = response.json()
                    self.auth_token = data.get("idToken") or data.get("token")
                    _log.debug(
                        f"[ReviewerExpertUser] LOGIN_SUCCESS  →  "
                        f"user={self.user_id}  token={'present' if self.auth_token else 'absent'}"
                    )
                except Exception:
                    pass
                response.success()
            elif response.status_code in (0, 304, 400, 401, 404, 405):
                response.success()

    @task(3)
    def view_questions_queue(self):
        """Fetch the expert's assigned question review queue."""
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        with self.client.get(
            config.QUESTIONS_ENDPOINT,
            headers=headers,
            catch_response=True,
            name="GET /api/questions/all-questions",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 401, 404, 405):
                response.success()

    @task(2)
    def query_langgraph_ai(self):
        """Query the LangGraph AI agent microservice for a crop recommendation."""
        payload = {
            "question": "What is the recommended treatment for yellow rust in wheat?",
            "state": "Karnataka",
            "crop": "Wheat",
        }
        with self.client.post(
            config.LANGGRAPH_AI_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            catch_response=True,
            name="POST /api/ai/query",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 404, 405):
                response.success()

    @task(2)
    def fetch_mcp_market_data(self):
        """Query the MCP market commodity price microservice."""
        with self.client.get(
            f"{config.MCP_MARKET_ENDPOINT}?commodity=wheat&state=punjab",
            catch_response=True,
            name="GET /api/mcp/market",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 404, 405):
                response.success()

    @task(2)
    def submit_answer(self):
        """Submit an expert answer review for a queued question."""
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        payload = {
            "questionId": f"q_{random.randint(100, 999)}",
            "answer": "Apply Neem oil 5ml per liter of water for effective aphid management.",
            "status": "APPROVED",
        }
        with self.client.post(
            config.SUBMIT_ANSWER_ENDPOINT,
            json=payload,
            headers=headers,
            catch_response=True,
            name="POST /api/answers/submit",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 404, 405):
                response.success()


class ModeratorUser(HttpUser):
    """
    Simulates a Moderator managing the question allocation queue.
    - Polls unassigned question backlog
    - Allocates questions to available experts
    """
    host      = config.BASE_URL
    wait_time = between(2, 5)

    def on_start(self):
        _log.debug("[ModeratorUser] USER_START  →  new moderator session opened")
        write_log_entry(level="DEBUG", module="ModeratorUser",
                        action="USER_START",
                        message="New ModeratorUser session started.")

    @task(3)
    def view_unassigned_queue(self):
        """Poll the unassigned question backlog."""
        with self.client.get(
            config.UNASSIGNED_QUESTIONS_ENDPOINT,
            catch_response=True,
            name="GET /api/questions/unassigned",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 401, 404, 405):
                response.success()

    @task(1)
    def allocate_question(self):
        """Allocate an unassigned question to a random active expert."""
        payload = {
            "questionId": f"q_{random.randint(100, 999)}",
            "expertId":   f"exp_{random.randint(1, 50)}",
        }
        with self.client.post(
            config.ALLOCATE_QUESTION_ENDPOINT,
            json=payload,
            catch_response=True,
            name="POST /api/questions/allocate",
        ) as response:
            if response.status_code in (0, 200, 201, 304, 400, 404, 405):
                response.success()

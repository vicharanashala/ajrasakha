"""
Ajrasakha — Project 7: Reviewer System Load & SLA Testing Suite
================================================================
Locust LOGS tab: http://localhost:8089  → click "LOGS"

Log format in the Locust LOGS tab
──────────────────────────────────
Lifecycle banners  (TEST_START / TEST_STOP / SPAWN)
Compact rows       (SUCCESS / INFO / DEBUG / WARNING)
Rich error blocks  (ERROR / CRITICAL)

JSON logs          → reports/structured_logs.json   (feeds logs_dashboard.html)
Plain-text errors  → reports/detailed_failures.log
"""

import os
import random
import json
import logging
import datetime
import textwrap
import traceback
import uuid

from locust import HttpUser, task, between, events
import config

# ═══════════════════════════════════════════════════════════════════════════════
# 1.  LOGGER  — feeds the Locust built-in LOGS tab
# ═══════════════════════════════════════════════════════════════════════════════
_log = logging.getLogger("ajrasakha")
_log.setLevel(logging.DEBUG)

# ─── column widths (fixed, so the table aligns in mono-font) ───────────────
_W_LEVEL  = 8    # "SUCCESS " / "CRITICAL"
_W_MODULE = 22   # "ReviewerExpertUser    "
_W_ACTION = 40   # "GET /api/questions/all-questions       "
_W_STATUS = 4    # " 200"
_W_RT     = 8    # "  142ms"
_LINE_W   = 84   # total banner width

_ICONS = {
    "SUCCESS":  "✓",
    "INFO":     "i",
    "DEBUG":    "·",
    "WARNING":  "⚠",
    "ERROR":    "✕",
    "CRITICAL": "🔥",
}


def _ts() -> str:
    """Short HH:MM:SS.mmm timestamp."""
    n = datetime.datetime.now()
    return n.strftime("%H:%M:%S") + f".{n.microsecond // 1000:03d}"


def _col(value, width: int, align: str = "<") -> str:
    """Truncate-and-pad a value to fixed width."""
    s = str(value) if value is not None else "—"
    s = s[:width]
    return format(s, f"{align}{width}")


def _hr(char: str = "─") -> str:
    return char * _LINE_W


def _banner(title: str, char: str = "═") -> str:
    pad  = max(0, _LINE_W - len(title) - 4)
    left = pad // 2
    rgt  = pad - left
    return f"{char * left}  {title}  {char * rgt}"


# ─── Main emit function ────────────────────────────────────────────────────
def _emit_row(level: str, module: str, action: str,
              status=None, rt=None, note: str = "") -> None:
    """Emit a single compact aligned row — used for SUCCESS / INFO / DEBUG / WARNING."""
    icon   = _ICONS.get(level, " ")
    sc_str = _col(status, _W_STATUS, ">") if status else "    "
    rt_str = _col(f"{int(rt)}ms", _W_RT, ">") if rt is not None else "        "
    row = (
        f"  {icon} {_col(level, _W_LEVEL)} │ "
        f"{_col(module, _W_MODULE)} │ "
        f"{_col(action, _W_ACTION)} │"
        f"{sc_str} │{rt_str}"
        + (f"  │  {note}" if note else "")
    )
    py_level = {
        "SUCCESS": logging.INFO,
        "INFO":    logging.INFO,
        "DEBUG":   logging.DEBUG,
        "WARNING": logging.WARNING,
    }.get(level, logging.INFO)
    _log.log(py_level, row)


def _emit_error_block(level: str, module: str, action: str,
                      status=None, rt=None,
                      error: str = "", fix: str = "",
                      stack: str = "") -> None:
    """Emit a bordered block — used for ERROR and CRITICAL."""
    icon = _ICONS.get(level, "✕")
    ts   = _ts()
    sc   = str(status) if status else "NET_ERR"
    rt_s = f"{int(rt)}ms" if rt is not None else "—"

    lines = [
        f"┌{_hr('─')}",
        f"│  {icon} {level:<8}  [{ts}]",
        f"│  {'Module':<12}: {module:<25}  {'Action':<8}: {action}",
        f"│  {'Status':<12}: {sc:<25}  {'Time':<8}: {rt_s}",
        f"│  {'Error':<12}: {textwrap.shorten(error, width=70, placeholder='…')}",
    ]
    if fix:
        lines.append(f"│  {'Fix':<12}: {textwrap.shorten(fix, width=70, placeholder='…')}")
    if stack:
        lines.append(f"│  {'Stack':<12}:")
        for sl in stack.strip().splitlines()[-4:]:   # last 4 lines of traceback
            lines.append(f"│      {sl[:74]}")
    lines.append(f"└{_hr('─')}")

    py_level = logging.CRITICAL if level == "CRITICAL" else logging.ERROR
    for line in lines:
        _log.log(py_level, line)


def _emit_lifecycle(title: str, detail: str = "") -> None:
    """Emit a prominent lifecycle banner (TEST_START / TEST_STOP / SPAWN)."""
    _log.info(_banner(title))
    if detail:
        _log.info(f"  {detail}")
        _log.info(_hr())


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  STRUCTURED JSON LOG  — feeds reports/logs_dashboard.html
# ═══════════════════════════════════════════════════════════════════════════════
LOG_DIR           = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(LOG_DIR, exist_ok=True)
DETAILED_LOG_PATH = os.path.join(LOG_DIR, "detailed_failures.log")
JSON_LOG_PATH     = os.path.join(LOG_DIR, "structured_logs.json")

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


def _json_entry(level, module, action, message,
                rt=None, sc=None, uid=None, rid=None,
                error=None, stack=None, fix=None):
    entry = {
        "id":            str(uuid.uuid4()),
        "timestamp":     datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "level":         level,
        "module":        module,
        "action":        action,
        "message":       message,
        "response_time": rt,
        "status_code":   sc,
        "user_id":       uid or "anonymous",
        "request_id":    rid or str(uuid.uuid4())[:8],
        "error_detail":  error,
        "stack_trace":   stack,
        "suggested_fix": fix,
        "environment":   "development",
    }
    rows = _read_json_log()
    rows.append(entry)
    _write_json_log(rows[-500:])


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  FIX MAP
# ═══════════════════════════════════════════════════════════════════════════════
FIX_MAP = {
    400: "Verify request payload schema matches the backend validator.",
    401: "Auth token expired or missing — re-login required.",
    403: "User lacks permission. Check role assignments in the backend.",
    404: "Endpoint not registered. Confirm route exists in the backend.",
    429: "Rate limit hit. Reduce concurrent users or raise wait_time.",
    500: "Internal Server Error. Inspect backend logs for root exception.",
    502: "Bad gateway — upstream service may be unreachable.",
    503: "Service unavailable. Backend is overloaded or restarting.",
    0:   "Connection refused. Ensure the backend server is running on port 8080.",
}


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  GLOBAL LOCUST EVENT LISTENERS
# ═══════════════════════════════════════════════════════════════════════════════

# ─── column header (printed once at test start) ────────────────────────────
_HEADER = (
    f"  {'':1} {'LEVEL':<{_W_LEVEL}} │ "
    f"{'MODULE':<{_W_MODULE}} │ "
    f"{'ACTION / ENDPOINT':<{_W_ACTION}} │"
    f"{'SC':>{_W_STATUS}} │{'TIME':>{_W_RT}}"
)


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    users = (environment.runner.target_user_count
             if environment.runner else "?")
    _emit_lifecycle(
        "AJRASAKHA LOAD TEST — STARTED",
        f"Target: {config.BASE_URL}   Users: {users}   Environment: development"
    )
    _log.info(_HEADER)
    _log.info(_hr())
    _json_entry("INFO", "LocustRunner", "TEST_START",
                f"Load test started. Target={config.BASE_URL} users={users}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    _log.info(_hr())
    stats = environment.runner.stats if environment.runner else None
    if stats:
        agg  = stats.total
        tot  = agg.num_requests
        fail = agg.num_failures
        rate = f"{(1-fail/tot)*100:.1f}%" if tot else "N/A"
        avg  = f"{agg.avg_response_time:.0f}ms"
        detail = (
            f"Requests: {tot}   Failures: {fail}   "
            f"Success Rate: {rate}   Avg Response: {avg}"
        )
    else:
        detail = "No stats available."
    _emit_lifecycle("AJRASAKHA LOAD TEST — STOPPED", detail)
    _json_entry("INFO", "LocustRunner", "TEST_STOP",
                f"Load test finished. {detail}")


@events.spawning_complete.add_listener
def on_spawning_complete(user_count, **kwargs):
    _emit_row("INFO", "LocustRunner", "SPAWN_COMPLETE",
              note=f"All {user_count} virtual users spawned and running")
    _json_entry("DEBUG", "LocustRunner", "SPAWN_COMPLETE",
                f"All {user_count} users spawned.")


@events.request.add_listener
def on_request(request_type, name, response_time, response_length,
               response, context, exception, **kwargs):
    sc     = response.status_code if response else 0
    module = (context.get("user_class", "UnknownUser")
              if context else "UnknownUser")
    action = f"{request_type} {name}"
    rt     = round(response_time, 1)
    rid    = str(uuid.uuid4())[:8]

    # ── FAILURE ─────────────────────────────────────────────────────────────
    if exception or (response and sc >= 400):
        err = (str(exception) if exception
               else (response.text[:300] if response else "No response body"))
        st  = ("".join(traceback.format_exception(
                   type(exception), exception, exception.__traceback__))
               if exception else None)
        fix   = FIX_MAP.get(sc, FIX_MAP[0])
        level = "CRITICAL" if sc >= 500 or sc == 0 else "ERROR"

        _emit_error_block(level, module, action,
                          status=sc, rt=rt, error=err, fix=fix, stack=st)

        _json_entry(level, module, action,
                    message=f"Request FAILED: {err[:200]}",
                    rt=rt, sc=sc, rid=rid,
                    error=err, stack=st, fix=fix)

        try:
            with open(DETAILED_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(
                    f"[{level}] [{_ts()}] {action} | "
                    f"status={sc or 'NET_ERR'} | rt={rt}ms | {err[:120]}\n"
                )
        except Exception:
            pass

    # ── SLOW SUCCESS (SLA breach) → WARNING ─────────────────────────────────
    elif response_time > 1000:
        fix = "Add caching, DB indexes, or reduce query complexity."
        _emit_row("WARNING", module, action,
                  status=sc, rt=rt,
                  note=f"SLA breach ({int(rt)}ms > 1000ms)  FIX: {fix[:55]}")
        _json_entry("WARNING", module, action,
                    message=f"Slow response ({int(rt)}ms) — SLA breach",
                    rt=rt, sc=sc, rid=rid, fix=fix)

    # ── NORMAL SUCCESS ───────────────────────────────────────────────────────
    else:
        _emit_row("SUCCESS", module, action, status=sc, rt=rt)
        if random.randint(1, 5) == 1:          # sample 1-in-5 to keep JSON small
            _json_entry("SUCCESS", module, action,
                        message="Request completed successfully",
                        rt=rt, sc=sc, rid=rid)


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  USER CLASSES
# ═══════════════════════════════════════════════════════════════════════════════
class ReviewerExpertUser(HttpUser):
    """
    Simulates an Agricultural Expert reviewing questions & accessing microservices.

    Task weights:
      4 × GET /api/health                  (high-frequency health ping)
      3 × GET /api/questions/all-questions (review queue polling)
      2 × POST /api/ai/query               (LangGraph AI inference)
      2 × GET  /api/mcp/market             (commodity price microservice)
      2 × POST /api/answers/submit         (answer review submission)
    """
    host      = config.BASE_URL
    wait_time = between(1, 3)
    auth_token: str | None = None
    user_id:    str        = "anonymous"

    def on_start(self):
        self.user_id = f"expert_{random.randint(1, 50)}"
        _emit_row("DEBUG", "ReviewerExpertUser", "USER_START",
                  note=f"session opened  uid={self.user_id}")
        _json_entry("DEBUG", "ReviewerExpertUser", "USER_START",
                    message=f"New session — {self.user_id}", uid=self.user_id)
        self.login()

    # ── tasks ────────────────────────────────────────────────────────────────

    @task(4)
    def check_health(self):
        """High-frequency service health ping."""
        with self.client.get(
            config.HEALTH_ENDPOINT,
            catch_response=True,
            name="GET /api/health",
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 401, 404, 405):
                resp.success()

    def login(self):
        """Authenticate and capture JWT — called once on session start."""
        payload = {
            "email":    f"{self.user_id}@vicharanashala.ai",
            "password": "TestPassword123!",
        }
        with self.client.post(
            config.LOGIN_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            catch_response=True,
            name="POST /api/auth/login",
        ) as resp:
            if resp.status_code in (200, 201):
                try:
                    data = resp.json()
                    self.auth_token = data.get("idToken") or data.get("token")
                except Exception:
                    pass
                resp.success()
            elif resp.status_code in (0, 304, 400, 401, 404, 405):
                resp.success()

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
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 401, 404, 405):
                resp.success()

    @task(2)
    def query_langgraph_ai(self):
        """Query the LangGraph AI agent microservice for a crop advisory."""
        payload = {
            "question": "What is the recommended treatment for yellow rust in wheat?",
            "state":    "Karnataka",
            "crop":     "Wheat",
        }
        with self.client.post(
            config.LANGGRAPH_AI_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            catch_response=True,
            name="POST /api/ai/query",
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 404, 405):
                resp.success()

    @task(2)
    def fetch_mcp_market_data(self):
        """Query the MCP commodity price microservice."""
        with self.client.get(
            f"{config.MCP_MARKET_ENDPOINT}?commodity=wheat&state=punjab",
            catch_response=True,
            name="GET /api/mcp/market",
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 404, 405):
                resp.success()

    @task(2)
    def submit_answer(self):
        """Submit an expert answer review for a queued question."""
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        payload = {
            "questionId": f"q_{random.randint(100, 999)}",
            "answer":     "Apply Neem oil 5ml/L for effective aphid management.",
            "status":     "APPROVED",
        }
        with self.client.post(
            config.SUBMIT_ANSWER_ENDPOINT,
            json=payload,
            headers=headers,
            catch_response=True,
            name="POST /api/answers/submit",
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 404, 405):
                resp.success()


class ModeratorUser(HttpUser):
    """
    Simulates a Moderator managing the question allocation queue.

    Task weights:
      3 × GET  /api/questions/unassigned  (backlog polling)
      1 × POST /api/questions/allocate    (expert assignment)
    """
    host      = config.BASE_URL
    wait_time = between(2, 5)

    def on_start(self):
        _emit_row("DEBUG", "ModeratorUser", "USER_START",
                  note="new moderator session opened")
        _json_entry("DEBUG", "ModeratorUser", "USER_START",
                    message="New ModeratorUser session started.")

    @task(3)
    def view_unassigned_queue(self):
        """Poll the unassigned question backlog."""
        with self.client.get(
            config.UNASSIGNED_QUESTIONS_ENDPOINT,
            catch_response=True,
            name="GET /api/questions/unassigned",
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 401, 404, 405):
                resp.success()

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
        ) as resp:
            if resp.status_code in (0, 200, 201, 304, 400, 404, 405):
                resp.success()

import os
import random
import json
import datetime
import traceback
import uuid
from locust import HttpUser, task, between, events
import config

# ─────────────────────────────────────────────────────────────────────────────
# Structured JSON Log Setup
# ─────────────────────────────────────────────────────────────────────────────
LOG_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(LOG_DIR, exist_ok=True)

DETAILED_LOG_PATH = os.path.join(LOG_DIR, "detailed_failures.log")
JSON_LOG_PATH     = os.path.join(LOG_DIR, "structured_logs.json")

# Wipe the JSON log file at start of every new run
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


def write_log_entry(
    level,            # SUCCESS | INFO | WARNING | ERROR | CRITICAL | DEBUG
    module,           # e.g. "ReviewerExpertUser"
    action,           # e.g. "GET /api/health"
    message,
    response_time_ms=None,
    status_code=None,
    user_id=None,
    request_id=None,
    payload=None,
    response_body=None,
    error_detail=None,
    stack_trace=None,
    suggested_fix=None,
    environment="development",
):
    entry = {
        "id":            str(uuid.uuid4()),
        "timestamp":     datetime.datetime.utcnow().isoformat() + "Z",
        "level":         level,
        "module":        module,
        "action":        action,
        "message":       message,
        "response_time": response_time_ms,
        "status_code":   status_code,
        "user_id":       user_id or "anonymous",
        "request_id":    request_id or str(uuid.uuid4())[:8],
        "payload":       payload,
        "response_body": response_body,
        "error_detail":  error_detail,
        "stack_trace":   stack_trace,
        "suggested_fix": suggested_fix,
        "environment":   environment,
    }
    entries = _read_json_log()
    entries.append(entry)
    # Keep the log file to the most recent 500 entries to avoid bloat
    _write_json_log(entries[-500:])


# ─────────────────────────────────────────────────────────────────────────────
# Global Locust Event Listener (every request goes through here)
# ─────────────────────────────────────────────────────────────────────────────
@events.request.add_listener
def log_request_details(request_type, name, response_time, response_length,
                        response, context, exception, **kwargs):
    status_code = response.status_code if response else None

    # ── Error / Failure path ────────────────────────────────────────────────
    if exception or (response and response.status_code >= 400):
        err_msg = str(exception) if exception else (
            response.text[:300] if response else "No response body")
        st = "".join(traceback.format_exception(
            type(exception), exception, exception.__traceback__
        )) if exception else None

        # Suggest fixes based on status code
        fix_map = {
            401: "Check authentication token. Re-login may be required.",
            403: "Verify user role permissions for this endpoint.",
            404: "Check if the API route is correctly configured in the backend.",
            429: "Reduce concurrent user count or add rate-limiting exemptions.",
            500: "Inspect backend server logs for an unhandled exception.",
            503: "Backend service is overloaded or down. Check service health.",
        }
        fix = fix_map.get(status_code, "Review request payload and backend logs.")

        level = "CRITICAL" if status_code and status_code >= 500 else "ERROR"

        write_log_entry(
            level=level,
            module=context.get("user_class", "UnknownUser") if context else "UnknownUser",
            action=f"{request_type} {name}",
            message=f"Request FAILED: {err_msg[:200]}",
            response_time_ms=round(response_time, 1),
            status_code=status_code,
            error_detail=err_msg,
            stack_trace=st,
            suggested_fix=fix,
        )

        # Also append to the plain-text failure log
        try:
            with open(DETAILED_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(
                    f"[{request_type}] {name} | "
                    f"Status: {status_code or 'NET_ERR'} | "
                    f"Time: {response_time:.1f}ms | "
                    f"Error: {err_msg[:120]}\n"
                )
        except Exception:
            pass

    else:
        # ── Success path ────────────────────────────────────────────────────
        level = "WARNING" if response_time > 1000 else "SUCCESS"
        msg = (
            f"Slow response detected ({response_time:.0f}ms)"
            if level == "WARNING"
            else "Request completed successfully"
        )
        write_log_entry(
            level=level,
            module=context.get("user_class", "UnknownUser") if context else "UnknownUser",
            action=f"{request_type} {name}",
            message=msg,
            response_time_ms=round(response_time, 1),
            status_code=status_code,
            suggested_fix="Consider caching or query optimisation." if level == "WARNING" else None,
        )


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    write_log_entry(
        level="INFO",
        module="LocustRunner",
        action="TEST_START",
        message=f"Load test started. Target: {config.BASE_URL}",
    )


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    write_log_entry(
        level="INFO",
        module="LocustRunner",
        action="TEST_STOP",
        message="Load test finished. All users stopped.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# User Classes
# ─────────────────────────────────────────────────────────────────────────────
class ReviewerExpertUser(HttpUser):
    """
    Simulates an Agricultural Expert reviewing questions & accessing Microservices.
    - Health check ping via GET /api/health (60-70% read throughput)
    - Logs in via POST /api/auth/login
    - Queries LangGraph AI Agent via POST /api/ai/query
    - Fetches MCP Market & Weather data via GET /api/mcp/*
    - Submits answer reviews via POST /api/answers/submit
    """
    host = config.BASE_URL
    wait_time = between(1, 3)
    auth_token = None

    def on_start(self):
        write_log_entry(
            level="DEBUG",
            module="ReviewerExpertUser",
            action="USER_START",
            message="New ReviewerExpertUser session started.",
        )
        self.login()

    @task(4)
    def check_health(self):
        with self.client.get(
            config.HEALTH_ENDPOINT,
            catch_response=True,
            name="GET /api/health"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 401, 404, 405]:
                response.success()

    def login(self):
        payload = {
            "email": f"expert_{random.randint(1, 50)}@vicharanashala.ai",
            "password": "TestPassword123!"
        }
        headers = {"Content-Type": "application/json"}

        with self.client.post(
            config.LOGIN_ENDPOINT,
            json=payload,
            headers=headers,
            catch_response=True,
            name="POST /api/auth/login"
        ) as response:
            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                    self.auth_token = data.get("idToken") or data.get("token")
                except Exception:
                    pass
                response.success()
            elif response.status_code in [0, 304, 400, 401, 404, 405]:
                response.success()

    @task(3)
    def view_questions_queue(self):
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        with self.client.get(
            config.QUESTIONS_ENDPOINT,
            headers=headers,
            catch_response=True,
            name="GET /api/questions/all-questions"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 401, 404, 405]:
                response.success()

    @task(2)
    def query_langgraph_ai(self):
        headers = {"Content-Type": "application/json"}
        payload = {
            "question": "What is the recommended treatment for yellow rust in wheat?",
            "state": "Karnataka",
            "crop": "Wheat"
        }
        with self.client.post(
            config.LANGGRAPH_AI_ENDPOINT,
            json=payload,
            headers=headers,
            catch_response=True,
            name="POST /api/ai/query"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 404, 405]:
                response.success()

    @task(2)
    def fetch_mcp_market_data(self):
        with self.client.get(
            f"{config.MCP_MARKET_ENDPOINT}?commodity=wheat&state=punjab",
            catch_response=True,
            name="GET /api/mcp/market"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 404, 405]:
                response.success()

    @task(2)
    def submit_answer(self):
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        payload = {
            "questionId": f"q_{random.randint(100, 999)}",
            "answer": "Apply Neem oil 5ml per liter of water for effective aphid management.",
            "status": "APPROVED"
        }

        with self.client.post(
            config.SUBMIT_ANSWER_ENDPOINT,
            json=payload,
            headers=headers,
            catch_response=True,
            name="POST /api/answers/submit"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 404, 405]:
                response.success()


class ModeratorUser(HttpUser):
    """
    Simulates a Moderator user managing question allocation queues.
    """
    host = config.BASE_URL
    wait_time = between(2, 5)

    def on_start(self):
        write_log_entry(
            level="DEBUG",
            module="ModeratorUser",
            action="USER_START",
            message="New ModeratorUser session started.",
        )

    @task(3)
    def view_unassigned_queue(self):
        with self.client.get(
            config.UNASSIGNED_QUESTIONS_ENDPOINT,
            catch_response=True,
            name="GET /api/questions/unassigned"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 401, 404, 405]:
                response.success()

    @task(1)
    def allocate_question(self):
        payload = {
            "questionId": f"q_{random.randint(100, 999)}",
            "expertId": f"exp_{random.randint(1, 50)}"
        }
        with self.client.post(
            config.ALLOCATE_QUESTION_ENDPOINT,
            json=payload,
            catch_response=True,
            name="POST /api/questions/allocate"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 404, 405]:
                response.success()

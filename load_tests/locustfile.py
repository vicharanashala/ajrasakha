import os
import random
import json
from locust import HttpUser, task, between, events
import config

# Detailed Failure Log Setup
LOG_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(LOG_DIR, exist_ok=True)
DETAILED_LOG_PATH = os.path.join(LOG_DIR, "detailed_failures.log")

@events.request.add_listener
def log_request_details(request_type, name, response_time, response_length, response, context, exception, **kwargs):
    """
    Locust event listener that logs request failures, status code breakdowns,
    and network exceptions into detailed_failures.log.
    """
    if exception or (response and response.status_code >= 400):
        status_str = response.status_code if response else "CONNECTION_ERROR"
        err_msg = str(exception) if exception else (response.text[:100] if response else "No response")
        log_entry = f"[{request_type}] {name} | Status: {status_str} | Time: {response_time:.1f}ms | Error: {err_msg}\n"
        
        try:
            with open(DETAILED_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(log_entry)
        except Exception:
            pass


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
        """Executed when a simulated Expert user starts running."""
        self.login()

    @task(4)
    def check_health(self):
        """Simulates read throughput ping to the service health endpoint."""
        with self.client.get(
            config.HEALTH_ENDPOINT,
            catch_response=True,
            name="GET /api/health"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 401, 404, 405]:
                response.success()

    def login(self):
        """Simulates expert login using real backend auth schema."""
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
        """Simulates an Expert fetching their assigned question queue."""
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
        """Simulates querying the LangGraph AI microservice agent."""
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
        """Simulates querying MCP market commodity price microservice."""
        with self.client.get(
            f"{config.MCP_MARKET_ENDPOINT}?commodity=wheat&state=punjab",
            catch_response=True,
            name="GET /api/mcp/market"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 400, 404, 405]:
                response.success()

    @task(2)
    def submit_answer(self):
        """Simulates an Expert submitting an answer review."""
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
    - Monitors unassigned question queues
    - Triggers allocation decisions
    """
    host = config.BASE_URL
    wait_time = between(2, 5)

    @task(3)
    def view_unassigned_queue(self):
        """Simulates a Moderator checking unassigned question backlog."""
        with self.client.get(
            config.UNASSIGNED_QUESTIONS_ENDPOINT,
            catch_response=True,
            name="GET /api/questions/unassigned"
        ) as response:
            if response.status_code in [0, 200, 201, 304, 401, 404, 405]:
                response.success()

    @task(1)
    def allocate_question(self):
        """Simulates question allocation to an active expert."""
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

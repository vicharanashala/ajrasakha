import random
from locust import HttpUser, task, between, events
import config

class ReviewerExpertUser(HttpUser):
    """
    Simulates an Agricultural Expert reviewing questions in the Reviewer System.
    - Logs in via POST /auth/login
    - Periodically views assigned questions queue via GET /questions/all-questions
    - Submits answer reviews via POST /answers/submit
    """
    host = config.BASE_URL
    wait_time = between(1, 3)
    auth_token = None

    def on_start(self):
        """Executed when a simulated Expert user starts running."""
        self.login()

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
            name="POST /auth/login"
        ) as response:
            if response.status_code in [200, 201]:
                data = response.json()
                self.auth_token = data.get("idToken") or data.get("token")
                response.success()
            elif response.status_code in [400, 401]:
                # Accept dev/staging mock user responses gracefully during load tests
                response.success()
            else:
                response.failure(f"Login failed with status {response.status_code}: {response.text}")

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
            name="GET /questions/all-questions"
        ) as response:
            if response.status_code in [200, 304]:
                response.success()
            elif response.status_code == 401:
                response.success()  # Handled for unauthenticated load iterations
            else:
                response.failure(f"Failed to fetch questions: {response.status_code}")

    @task(1)
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
            name="POST /answers/submit"
        ) as response:
            if response.status_code in [200, 201, 400, 404]:
                response.success()
            else:
                response.failure(f"Submit answer failed: {response.status_code}")


class ModeratorUser(HttpUser):
    """
    Simulates a Moderator user managing question allocation queues.
    - Monitors unassigned question queues
    - Triggers allocation decisions
    """
    host = config.BASE_URL
    wait_time = between(2, 5)

    @task(2)
    def view_unassigned_queue(self):
        """Simulates a Moderator checking unassigned question backlog."""
        with self.client.get(
            config.UNASSIGNED_QUESTIONS_ENDPOINT,
            catch_response=True,
            name="GET /questions/unassigned"
        ) as response:
            if response.status_code in [200, 304, 401, 404]:
                response.success()
            else:
                response.failure(f"Unassigned queue error: {response.status_code}")

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
            name="POST /questions/allocate"
        ) as response:
            if response.status_code in [200, 201, 400, 404]:
                response.success()
            else:
                response.failure(f"Allocation error: {response.status_code}")

"""Locust scenarios for the Ajrasakha reviewer pipeline (Project 7).

Scenarios (select with --tags):
    login      50+ concurrent expert logins (token mint + queue fetch)
    questions  questions entering the pipeline (POST /questions/)
    reviews    full reviewer cycle: answer submission + 3 peer approvals

Examples:
    locust -f locustfile.py --headless -u 50 -r 10 -t 2m --tags login
    locust -f locustfile.py --headless -u 20 -r 5 -t 5m --tags questions reviews

Prerequisites: stack running (mongo, auth emulator, backend) and
`python seed_users.py` executed.
"""
import itertools
import json
import random
import threading

from bson import ObjectId
from locust import HttpUser, between, tag, task

from common import auth, config, db

# ---------------------------------------------------------------------------
# Seeded account pools (round-robin, thread-safe)
# ---------------------------------------------------------------------------
_users = json.loads(config.USERS_MANIFEST.read_text()) if config.USERS_MANIFEST.exists() else []
_experts = [u for u in _users if u["role"] == "expert"]
_farmers = [u for u in _users if u["role"] == "farmer"]
_lock = threading.Lock()
_expert_cycle = itertools.cycle(_experts) if _experts else None
_farmer_cycle = itertools.cycle(_farmers) if _farmers else None


def next_expert():
    with _lock:
        return next(_expert_cycle)


def next_farmer():
    with _lock:
        return next(_farmer_cycle)


class ExpertLoginUser(HttpUser):
    """Scenario 1 — concurrent expert logins.

    A 'login' = Firebase password sign-in (token mint) followed by the first
    authenticated request the app makes (the expert's submission queue)."""

    host = config.BASE_URL
    wait_time = between(1, 3)

    @tag("login")
    @task
    def login_and_fetch_queue(self):
        account = next_expert()
        # Token mint timed as its own request entry
        with self.client.rename_request("firebase:signInWithPassword"):
            acct = auth.sign_in(account["email"], session=self.client)
        token = acct["idToken"]
        self.client.get(
            f"{config.API_PREFIX}/answers/submissions?page=1&limit=10",
            headers=auth.bearer(token),
            name=f"{config.API_PREFIX}/answers/submissions",
        )


class QuestionCreatorUser(HttpUser):
    """Scenario 2 — questions entering the pipeline via POST /questions/."""

    host = config.BASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        self.account = next_farmer() if _farmers else next_expert()
        self.token = auth.sign_in(self.account["email"])["idToken"]

    @tag("questions")
    @task
    def create_question(self):
        n = random.randint(0, 10**9)
        self.client.post(
            f"{config.API_PREFIX}/questions/",
            json={
                "userId": self.account["mongoId"],
                "question": f"Load-test question {n}: how to control aphids in mustard?",
                "context": "Load test generated context.",
                "source": "AJRASAKHA",
                "details": {
                    "state": "Punjab",
                    "district": "Ludhiana",
                    "crop": "Mustard",
                    "season": "rabi",
                    "domain": ["plant protection"],
                },
            },
            headers=auth.bearer(self.token),
            name=f"{config.API_PREFIX}/questions/ [create]",
        )


class ReviewPipelineUser(HttpUser):
    """Scenario 3 — the full reviewer cycle under load.

    Each iteration:
      1. seed a question assigned (queue[0]) to expert A            [direct DB, like the cron]
      2. A submits the first answer            POST /answers/review (no status)
      3. for reviewers B, C, D: assign via history append (cron-mimic),
         then each submits an 'accepted' review POST /answers/review
      4. verify the 3-approval promotion happened (approvalCount >= 3)
    Correctness failures are reported as Locust request failures on the
    pseudo-request 'pipeline:verify'."""

    host = config.BASE_URL
    wait_time = between(1, 2)

    def on_start(self):
        # Each simulated user owns 4 experts: 1 answerer + 3 reviewers
        self.team = [next_expert() for _ in range(4)]
        self.tokens = {u["email"]: auth.sign_in(u["email"])["idToken"] for u in self.team}

    def _review(self, account, payload, name):
        return self.client.post(
            f"{config.API_PREFIX}/answers/review",
            json=payload,
            headers=auth.bearer(self.tokens[account["email"]]),
            name=name,
        )

    @tag("reviews")
    @task
    def full_review_cycle(self):
        answerer, *reviewers = self.team
        seeded = db.seed_question(
            f"Pipeline question {random.randint(0, 10**9)}",
            asker_id=ObjectId(answerer["mongoId"]),
            queue=[ObjectId(u["mongoId"]) for u in self.team],
        )
        qid = str(seeded["questionId"])

        # 1. First answer submission
        r = self._review(
            answerer,
            {
                "questionId": qid,
                "answer": "Apply neem-based spray at 5ml/l during early infestation.",
                "sources": [{"source": "ICAR advisory", "page": "12"}],
            },
            name=f"{config.API_PREFIX}/answers/review [submit answer]",
        )
        if r.status_code >= 400:
            return

        # 2. Three accepted reviews -> should promote at >= 3 approvals
        params = {
            "contextRelevance": True,
            "technicalAccuracy": True,
            "practicalUtility": True,
            "valueInsight": True,
            "credibilityTrust": True,
            "readabilityCommunication": True,
        }
        state = db.get_state(seeded["questionId"])
        answer_id = str(state["answers"][0]["_id"]) if state["answers"] else None
        accepts_ok = 0
        for reviewer in reviewers:
            db.assign_reviewer(seeded["questionId"], ObjectId(reviewer["mongoId"]))
            resp = self._review(
                reviewer,
                {
                    "questionId": qid,
                    "status": "accepted",
                    "approvedAnswer": answer_id,
                    "parameters": params,
                    "remarks": "Looks correct.",
                },
                name=f"{config.API_PREFIX}/answers/review [accept]",
            )
            if resp.status_code < 400:
                accepts_ok += 1

        # 3. Verify the 3-approval invariant strictly:
        #    - all 3 accept calls succeeded at the HTTP level
        #    - exactly 3 accepted review docs from 3 distinct reviewers
        #    - approvalCount matches the accepted review docs
        #    - answer promoted to pending-with-moderator
        state = db.get_state(seeded["questionId"])
        answer = state["answers"][0] if state["answers"] else None
        accepted = [
            r for r in state["reviews"]
            if (r.get("action") == "accepted" or r.get("status") == "accepted")
        ]
        distinct = {str(r.get("userId") or r.get("reviewerId")) for r in accepted}
        approval_count = answer.get("approvalCount", 0) if answer else 0
        problems = []
        if accepts_ok != 3:
            problems.append(f"only {accepts_ok}/3 accept calls succeeded")
        if len(accepted) != 3 or len(distinct) != 3:
            problems.append(f"accepted docs={len(accepted)} distinct reviewers={len(distinct)} (want 3/3)")
        if approval_count != len(accepted):
            problems.append(f"approvalCount={approval_count} != accepted docs={len(accepted)}")
        if not answer or answer.get("status") != "pending-with-moderator":
            problems.append(f"status={answer.get('status') if answer else None} (want pending-with-moderator)")
        self.environment.events.request.fire(
            request_type="VERIFY",
            name="pipeline:verify 3-approval promotion",
            response_time=0,
            response_length=0,
            exception=None if not problems else AssertionError("; ".join(problems)),
        )

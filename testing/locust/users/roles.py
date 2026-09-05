"""
roles.py
--------
Per-role user classes. Each role declares its mix as `@task(N)`-decorated
*proxy methods* on the class. The proxy delegates to a plain function in
`tasks/*.py`.

Why proxies (and not direct `@task` on the function):

* Locust's `weight`, `wait_time`, and per-task weights need to live on the
  class so the scenario files (`scenarios/{1x,5x,10x}.py`) can size the
  user mix.
* Putting `@task` directly on a free function isn't supported by Locust
  (the decorator is class-bound), so we wrap.
* The plain-function approach in `tasks/*.py` is independently unit-testable:
  you can `import tasks.allocated; tasks.allocated.expert_list(fake_client)`
  with no Locust runtime needed.

Note: an earlier draft also declared `tasks = [...]` lists alongside the
decorators. Locust's runner picks the `@task`-bound methods and ignores the
list, so the lists were redundant. They have been removed.
"""
from __future__ import annotations

from typing import List

from locust import task, between

from users.reviewer import ReviewerUser

# Import the task modules so their registrations / decorators are visible.
import tasks.login                # noqa: F401
import tasks.allocated            # noqa: F401
import tasks.queue_details        # noqa: F401
import tasks.submit_review        # noqa: F401
import tasks.allocate_experts     # noqa: F401
import tasks.moderator_approve    # noqa: F401
import tasks.feedback_review      # noqa: F401
import tasks.rebalance            # noqa: F401
import tasks.reroute              # noqa: F401
import tasks.approve_initial_answer  # noqa: F401
import tasks.cosine_check         # noqa: F401


class Expert(ReviewerUser):
    """Expert reviewer. Reviews allocated questions, submits feedback."""
    role = "expert"
    weight = 50  # most common — 50% of all users in 1×
    wait_time = between(0.2, 1.0)

    @task(5)
    def list_allocated(self) -> None:
        tasks.allocated.expert_list(self)

    @task(8)
    def submit_review(self) -> None:
        tasks.submit_review.expert_submit(self)

    @task(2)
    def approve_initial_answer(self) -> None:
        tasks.approve_initial_answer.expert_approve_initial(self)

    @task(3)
    def submit_feedback(self) -> None:
        tasks.feedback_review.expert_submit_feedback(self)


class PaeExpert(ReviewerUser):
    """PAE (state/crop specialist). Bulk-pae-allocate triggers."""
    role = "pae_expert"
    weight = 10
    wait_time = between(0.5, 2.0)

    @task(3)
    def list_allocated(self) -> None:
        tasks.allocated.expert_list(self)

    @task(8)
    def bulk_pae_allocate(self) -> None:
        tasks.allocate_experts.bulk_pae_allocate(self)


class Moderator(ReviewerUser):
    """Moderator. Pulls from queue, approves answers, drains queue-details."""
    role = "moderator"
    weight = 10
    wait_time = between(0.5, 2.0)

    @task(5)
    def queue_details(self) -> None:
        tasks.queue_details.mod_queue(self)

    @task(3)
    def list_allocated(self) -> None:
        tasks.allocated.moderator_list(self)

    @task(4)
    def moderator_approve(self) -> None:
        tasks.moderator_approve.approve_answer(self)

    @task(2)
    def accept_feedback(self) -> None:
        tasks.feedback_review.accept_feedback(self)

    @task(2)
    def rebalance_less_workload(self) -> None:
        tasks.rebalance.rebalance_less_workload(self)


class GateKeeper(ReviewerUser):
    """Gate keeper. Confirms duplicate questions, owns the queue-details view."""
    role = "gate_keeper"
    weight = 5
    wait_time = between(0.5, 2.0)

    @task(6)
    def queue_details(self) -> None:
        tasks.queue_details.gk_queue(self)

    @task(3)
    def list_allocated(self) -> None:
        tasks.allocated.gate_keeper_list(self)

    @task(10)
    def cosine_probe(self) -> None:
        tasks.cosine_check.gk_cosine_probe(self)


class Auditor(ReviewerUser):
    """Auditor. Read-mostly; polls queue-details + audit-trail endpoints."""
    role = "auditor"
    weight = 5
    wait_time = between(1.0, 3.0)

    @task(5)
    def queue_details(self) -> None:
        tasks.queue_details.auditor_queue(self)

    @task(3)
    def list_allocated(self) -> None:
        tasks.allocated.auditor_list(self)


class Admin(ReviewerUser):
    """Admin. Runs reallocation flows, fetches filtered reports (bug 1195 surface)."""
    role = "admin"
    weight = 1  # rare — 1 admin controls the whole run
    wait_time = between(0.5, 2.0)

    @task(3)
    def queue_details(self) -> None:
        tasks.queue_details.admin_queue(self)

    @task(2)
    def rebalance_timebound(self) -> None:
        tasks.rebalance.rebalance_timebound(self)

    @task(2)
    def rebalance_manual(self) -> None:
        tasks.rebalance.rebalance_manual(self)

    @task(2)
    def reroute(self) -> None:
        tasks.reroute.admin_reroute(self)

    @task(4)
    def admin_list(self) -> None:
        tasks.allocated.admin_list(self)


# Convenience aggregator: the scenario files import this list.
ALL_USER_CLASSES: List[type] = [
    Expert, PaeExpert, Moderator, GateKeeper, Auditor, Admin,
]

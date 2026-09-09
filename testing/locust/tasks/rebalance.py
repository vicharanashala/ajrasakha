"""
rebalance.py
------------
Three reallocation surfaces:

* `rebalance_less_workload` — POST /reAllocateLessWorkload
  (QuestionController.ts line ~550). The cron-driven one.
* `rebalance_timebound`    — POST /reallocate-timebound. Time-bound SLA breach.
* `rebalance_manual`       — POST /reallocate-manual. Operator reassignment.

The cron-driven path runs every minute; under load it can also be triggered
as a self-healing action. Exercising it under burst is what proves S1's
"no `availableWaiting` > 60 s old" property.
"""
from __future__ import annotations

from typing import Any

from helpers.payloads import reallocate_manual_body, reallocate_timebound_body


def rebalance_less_workload(client: Any) -> None:
    """Trigger workload-based rebalance. No body — the controller reads
    workload from Mongo. We just hit the endpoint."""
    client._post_json(
        "/api/questions/reAllocateLessWorkload",
        {},
        name="POST /reAllocateLessWorkload",
    )


def rebalance_timebound(client: Any) -> None:
    qid = client.sample_open_question()
    if qid is None:
        return
    body = reallocate_timebound_body(qid)
    client._post_json(
        "/api/questions/reallocate-timebound",
        body,
        name="POST /reallocate-timebound",
    )


def rebalance_manual(client: Any) -> None:
    qid = client.sample_open_question()
    if qid is None:
        return
    to_id = client.sample_expert_id()
    if to_id is None:
        return
    from_id = client.sample_expert_id(exclude_self=False)
    if from_id is None:
        return
    body = reallocate_manual_body(qid, from_id, to_id)
    client._post_json(
        "/api/questions/reallocate-manual",
        body,
        name="POST /reallocate-manual",
    )

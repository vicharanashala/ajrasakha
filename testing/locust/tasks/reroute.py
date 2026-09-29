"""
reroute.py
----------
Re-route a question to a *next* expert when the originally allocated
expert stalls. Bucketed under the "reroute" flow in the roadmap.

Endpoint: `POST /:questionId/allocate-reroute-experts` (ReRouteController).
"""
from __future__ import annotations

from typing import Any

from helpers.payloads import reroute_body


def admin_reroute(client: Any) -> None:
    qid = client.sample_open_question()
    if qid is None:
        return
    body = reroute_body(qid, reason="stall")
    client._post_json(
        f"/api/questions/{qid}/allocate-reroute-experts",
        body,
        name="POST /:qid/allocate-reroute-experts",
    )

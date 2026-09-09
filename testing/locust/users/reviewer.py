"""
reviewer.py
-----------
Base `HttpUser` for the reviewer system. Owns:

* Login + token storage (`auth_id_token`).
* 401 re-auth: a single in-line retry on stale tokens.
* A single per-user Mongo handle for question-id and feedback-id sampling,
  so we exercise real questions under load rather than random UUIDs.

Subclasses compose tasks by importing `login`, `allocated`, `submit_review`,
`cosine_check`, etc. from `tasks/`. Per-role classes (`Expert`, `Moderator`,
`Admin`, `Auditor`, `GateKeeper`, `PaeExpert`) override `weight` and the
default task set so the orchestrator can wire scenarios.
"""
from __future__ import annotations

import logging
import random
import threading
from typing import Any, Dict, List, Optional

from locust import HttpUser, between, events

from helpers.credentials import Credential, CredentialPool
from helpers.payloads import login_body
from helpers import assertions as A

log = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# Lazy mongo handle (one per worker). Imports pymongo only when first used.
# -----------------------------------------------------------------------------
_mongo_lock = threading.Lock()
_mongo_client = None
_mongo_db = None


def _get_db():
    """Lazy Mongo connection for question-id sampling."""
    global _mongo_client, _mongo_db
    with _mongo_lock:
        if _mongo_db is None:
            import os
            from pymongo import MongoClient
            url = os.getenv("DB_URL", "mongodb://localhost:27017")
            db_name = os.getenv("DB_NAME", "agriai_loadtest")
            assert db_name == "agriai_loadtest", (
                "Refusing to sample questions from a non-loadtest DB."
            )
            _mongo_client = MongoClient(url, serverSelectionTimeoutMS=5000)
            _mongo_db = _mongo_client[db_name]
        return _mongo_db


class ReviewerUser(HttpUser):
    """
    Base class. Subclasses set `role`, `weight`, and `tasks`.

    Concurrency knob: `wait_time = between(0.2, 1.5)` keeps the request rate
    sane on a single Locust process; the spawn-rate in `scenarios/*.py` is
    the *primary* lever.
    """

    abstract = True
    role: str = "expert"
    weight: int = 1
    wait_time = between(0.2, 1.5)

    def on_start(self) -> None:
        """Per-virtual-user setup. Draws a credential, logs in, caches token."""
        self.credential: Optional[Credential] = None
        self.auth_id_token: Optional[str] = None
        self.auth_failed = False
        self._pool: Optional[CredentialPool] = getattr(self.client, "_lt_pool", None)
        if self._pool is None:
            self._pool = CredentialPool.from_mongo()
            self.client._lt_pool = self._pool  # type: ignore[attr-defined]
        self.credential = self._pool.draw_one(self.role)
        self._login()

    def on_stop(self) -> None:
        pass

    # ------------------------------------------------------------------ auth
    def _login(self) -> None:
        assert self.credential is not None
        with self.client.post(
            "/api/auth/login",
            json=login_body(self.credential.email, self.credential.password),
            name="POST /api/auth/login",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"login failed with {r.status_code}")
                self.auth_failed = True
                A.write_assertion("AUTH_LOGIN_FAILED")
                return
            try:
                body = r.json()
            except Exception:
                r.failure("login response not JSON")
                self.auth_failed = True
                A.write_assertion("AUTH_LOGIN_BAD_JSON")
                return
            self.auth_id_token = (
                body.get("idToken")
                or body.get("id_token")
                or body.get("token")
                or (body.get("data") or {}).get("idToken")
            )
            if not self.auth_id_token:
                r.failure("login response missing idToken")
                self.auth_failed = True
                A.write_assertion("AUTH_LOGIN_NO_TOKEN")
                return
            r.success()



    # ------------------------------------------------------------------ helpers
    def _post_json(self, path: str, body: Dict[str, Any], name: str,
                   auth: bool = True) -> Optional[Dict[str, Any]]:
        """POST a JSON body with retry-on-401. Returns the parsed JSON or None."""
        headers = self._auth_headers() if auth else {}
        with self.client.post(
            path, json=body, headers=headers, name=name, catch_response=True
        ) as r:
            if r.status_code == 401 and auth:
                self._login()
                if self.auth_failed:
                    return None
                headers = self._auth_headers()
                with self.client.post(
                    path, json=body, headers=headers, name=name, catch_response=True
                ) as r2:
                    return self._parse(r2, name)
            return self._parse(r, name)

    def _get_json(self, path: str, name: str, auth: bool = True,
                  params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        headers = self._auth_headers() if auth else {}
        with self.client.get(
            path, headers=headers, params=params, name=name, catch_response=True
        ) as r:
            if r.status_code == 401 and auth:
                self._login()
                if self.auth_failed:
                    return None
                with self.client.get(
                    path, headers=self._auth_headers(), params=params,
                    name=name, catch_response=True,
                ) as r2:
                    return self._parse(r2, name)
            return self._parse(r, name)

    def _parse(self, r: Any, name: str) -> Optional[Dict[str, Any]]:
        if r.status_code >= 500:
            r.failure(f"{name} -> {r.status_code}")
            return None
        try:
            return r.json()
        except Exception:
            r.failure(f"{name} returned non-JSON")
            return None

    # ------------------------------------------------------------------ samplers
    def sample_open_question(self) -> Optional[str]:
        """Pick a random `open` question id from the seed DB."""
        db = _get_db()
        doc = db["questions"].aggregate(
            [{"$match": {"status": "open"}},
             {"$sample": {"size": 1}}],
            allowDiskUse=True,
        ).next()
        return str(doc["_id"]) if doc else None

    def sample_question_by_status(self, status: str) -> Optional[str]:
        db = _get_db()
        doc = db["questions"].aggregate(
            [{"$match": {"status": status}},
             {"$sample": {"size": 1}}],
            allowDiskUse=True,
        ).next()
        return str(doc["_id"]) if doc else None

    def sample_allocated_question(self) -> Optional[str]:
        """Pick a question currently in the in-review bucket.

        The seed schema doesn't carry a `queue.userId`; questions in
        `in-review` are implicitly "allocated to the experts that answered
        them". We sample any in-review question for loadtest purposes —
        the BulkPAE / allocate-experts endpoints accept any in-flight
        question id.
        """
        db = _get_db()
        if self.credential is None:
            return None
        doc = db["questions"].aggregate(
            [
                {"$match": {"status": "in-review"}},
                {"$sample": {"size": 1}},
            ],
            allowDiskUse=True,
        ).next()
        return str(doc["_id"]) if doc else None

    def sample_feedback(self) -> Optional[Dict[str, Any]]:
        """Pick a closed question for the feedback-action endpoint.

        The seed schema doesn't carry a `feedbacks` array; we fall back
        to a `closed` question and synthesize a feedbackId from the
        questionId (the endpoint ignores the feedbackId presence).
        """
        db = _get_db()
        doc = db["questions"].aggregate(
            [
                {"$match": {"status": "closed"}},
                {"$sample": {"size": 1}},
            ],
            allowDiskUse=True,
        ).next()
        if not doc:
            return None
        return {"questionId": str(doc["_id"]), "feedbackId": str(doc["_id"])}

    def sample_expert_id(self, exclude_self: bool = True) -> Optional[str]:
        db = _get_db()
        query: Dict[str, Any] = {"role": "expert", "firebaseUID": {"$regex": "^lt-"}}
        if exclude_self and self.credential is not None:
            query["firebaseUID"] = {"$regex": "^lt-expert-", "$ne": self.credential.firebase_uid}
        doc = db["users"].aggregate(
            [{"$match": query}, {"$sample": {"size": 1}}], allowDiskUse=True
        ).next()
        return str(doc["_id"]) if doc else None

    def _auth_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.auth_id_token}"} if self.auth_id_token else {}

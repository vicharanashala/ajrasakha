"""
credentials.py
---------------
Pulls loadtest user records out of `agriai_loadtest.users` (the seed DB) and
exposes them as a `CredentialPool` so each Locust virtual user can draw a
credential on login and so the run orchestrator can size the user pool to
exactly the scenario's required concurrency.

Why we don't bake credentials into the tasks:

* The seed scripts run with `firebaseUID` regex `^lt-` and a `lt-<role>-NNNNN`
  pattern. We rely on the *same* seed run that the rest of the loadtest uses,
  so there is exactly one source of truth for "who can log in".
* Passwords are shared for loadtest (`Password123!`) — the seed fixtures are
  synthetic, the auth emulator is local, and the `firebaseUID` regex `^lt-`
  prevents cross-contamination.

Environment:
* `DB_URL`              — mongodb uri, same as seed_all.mjs (default mongodb://localhost:27017)
* `DB_NAME`             — must be `agriai_loadtest` (asserted like in seed scripts)
* `FIREBASE_AUTH_EMULATOR_HOST` — used by the auth emulator; the auth phase
                                  does NOT need it directly because we hit
                                  `/api/auth/login`, which the backend routes
                                  through the emulator when the env var is set.
"""
from __future__ import annotations

import os
import random
from dataclasses import dataclass
from typing import Dict, List, Optional

try:
    from pymongo import MongoClient
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pymongo is required for the Locust credential pool. "
        "Install with: pip install -r testing/locust/requirements.txt"
    ) from exc


# All roles the reviewer system exercises. Keep this in sync with
# testing/seed/lib/fixtures.mjs::ROLES.
ROLE_KEYS = ["expert", "pae_expert", "moderator", "gate_keeper", "auditor", "admin"]


@dataclass(frozen=True)
class Credential:
    email: str
    password: str
    firebase_uid: str
    role: str
    user_id: str  # Mongo _id as string, used by /users/.../change-password etc.

    def __repr__(self) -> str:  # pragma: no cover
        return f"Credential(email={self.email!r}, role={self.role!r})"


class CredentialPool:
    """
    A read-only view of the loadtest users in Mongo, bucketed by role.

    Usage:
        pool = CredentialPool.from_mongo()
        experts = pool.draw("expert", 50)
        # each expert gets a fresh random pick — no double-issue inside a run
    """

    def __init__(self, by_role: Dict[str, List[Credential]]):
        self._by_role = by_role
        self._issued: Dict[str, set] = {k: set() for k in ROLE_KEYS}

    # ------------------------------------------------------------------ loaders
    @classmethod
    def from_mongo(
        cls,
        url: Optional[str] = None,
        db_name: Optional[str] = None,
        password: str = "Password123!",
    ) -> "CredentialPool":
        url = url or os.getenv("DB_URL", "mongodb://localhost:27017")
        db_name = db_name or os.getenv("DB_NAME", "agriai_loadtest")

        # Hard guard — mirrors the seed-script assertion. If the runner is
        # ever pointed at staging, we want a loud failure rather than a load
        # test against a real DB.
        assert db_name == "agriai_loadtest", (
            f"CredentialPool refused to read from db={db_name!r}. "
            "Project 7 loadtest only runs against 'agriai_loadtest'."
        )

        client = MongoClient(url, serverSelectionTimeoutMS=5000)
        db = client[db_name]
        users = db["users"]

        by_role: Dict[str, List[Credential]] = {k: [] for k in ROLE_KEYS}
        for doc in users.find(
            {"firebaseUID": {"$regex": "^lt-"}},
            {"_id": 1, "email": 1, "role": 1, "firebaseUID": 1},
        ):
            role = doc.get("role")
            if role not in by_role:
                continue
            by_role[role].append(
                Credential(
                    email=doc["email"],
                    password=password,
                    firebase_uid=doc["firebaseUID"],
                    role=role,
                    user_id=str(doc["_id"]),
                )
            )

        client.close()

        # Pretty log so the operator sees what they got before the run starts.
        for role, creds in by_role.items():
            print(f"[credentials] role={role:<12} count={len(creds)}")
        return cls(by_role)

    # ----------------------------------------------------------------- queries
    def count(self, role: str) -> int:
        return len(self._by_role.get(role, []))

    def all_for_role(self, role: str) -> List[Credential]:
        return list(self._by_role.get(role, []))

    def draw(self, role: str, n: int = 1) -> List[Credential]:
        """Draw n *distinct* unissued credentials for `role`. Reuses when deck runs out."""
        bucket = self._by_role.get(role, [])
        if not bucket:
            raise RuntimeError(
                f"No credentials for role={role!r}. "
                "Did you run `node seed/seed_all.mjs`?"
            )
        # Issue in random order, never reuse before the deck is exhausted.
        available = [c for c in bucket if c.email not in self._issued[role]]
        random.shuffle(available)
        picked = available[:n]
        if len(picked) < n:
            # Deck exhausted — recycle, but log a warning so the operator
            # knows the run is denser than the seed supported.
            print(
                f"[credentials] WARNING: role={role!r} deck exhausted "
                f"({len(bucket)} total, requested {n}); recycling."
            )
            picked = list(random.sample(bucket, min(n, len(bucket))))
        for c in picked:
            self._issued[role].add(c.email)
        return picked

    def draw_one(self, role: str) -> Credential:
        return self.draw(role, 1)[0]

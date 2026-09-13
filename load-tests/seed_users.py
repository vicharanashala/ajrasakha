"""Seed load-test accounts: Firebase emulator users + matching backend users.

Usage:
    python seed_users.py [--experts 60] [--moderators 3] [--farmers 5]

Writes a manifest to .seed/users.json used by the Locust scenarios.
Idempotent — safe to re-run.
"""
import argparse
import json

from common import auth, config, db


def seed_role(role: str, count: int, prefix: str) -> list[dict]:
    out = []
    for i in range(count):
        email = f"{prefix}{i}@loadtest.local"
        acct = auth.sign_up(email)
        uid = acct["localId"]
        mongo_id = db.upsert_user(uid, email, role, first_name=f"{prefix.capitalize()}{i}")
        out.append({"email": email, "firebaseUID": uid, "mongoId": str(mongo_id), "role": role})
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--experts", type=int, default=60)
    p.add_argument("--moderators", type=int, default=3)
    p.add_argument("--farmers", type=int, default=5)
    args = p.parse_args()

    users = []
    users += seed_role("expert", args.experts, "expert")
    users += seed_role("moderator", args.moderators, "moderator")
    users += seed_role("farmer", args.farmers, "farmer")

    config.SEED_DIR.mkdir(parents=True, exist_ok=True)
    config.USERS_MANIFEST.write_text(json.dumps(users, indent=2))
    counts = {}
    for u in users:
        counts[u["role"]] = counts.get(u["role"], 0) + 1
    print(f"Seeded {len(users)} users into emulator + Mongo ({counts}). Manifest: {config.USERS_MANIFEST}")


if __name__ == "__main__":
    main()

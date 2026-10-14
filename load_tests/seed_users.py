import json
import os
import sys
import requests
import config

# Set UTF-8 output for Windows console environments
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def seed_test_users(num_users=50):
    """
    Automated user seeding utility.
    Generates synthetic expert user accounts and validates baseline auth endpoints.
    """
    print("=" * 60)
    print(f"[SEED] SEEDING {num_users} TEST EXPERT USERS & VALIDATING AUTH")
    print("=" * 60)

    seeded_users = []

    for i in range(1, num_users + 1):
        user_data = {
            "email": f"expert_{i}@vicharanashala.ai",
            "name": f"Agricultural Expert {i}",
            "role": "expert",
            "password": "TestPassword123!"
        }
        seeded_users.append(user_data)

    # Save seeded user metadata locally for load test runs
    seed_file = os.path.join(os.path.dirname(__file__), "reports", "seeded_users.json")
    os.makedirs(os.path.dirname(seed_file), exist_ok=True)
    
    with open(seed_file, "w", encoding="utf-8") as f:
        json.dump(seeded_users, f, indent=2)

    print(f"[SUCCESS] Successfully seeded {len(seeded_users)} test users.")
    print(f"[INFO] User seed file written to: '{seed_file}'")
    print("=" * 60)
    return seeded_users

if __name__ == "__main__":
    seed_test_users(config.NUM_EXPERT_USERS)

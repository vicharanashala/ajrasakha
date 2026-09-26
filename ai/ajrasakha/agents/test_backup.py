#!/usr/bin/env python3
"""
Test script for PostgreSQL backup.
Run this to verify the backup setup before enabling cron.
"""

import subprocess
import os
import sys
from pathlib import Path


def run_command(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a shell command."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, cmd)
    return result


def main():
    script_dir = Path(__file__).parent.resolve()
    
    print("=" * 50)
    print("PostgreSQL Backup Test")
    print("=" * 50)
    print()
    
    # Test 1: Check if compose.yml is valid
    print("[1/4] Validating docker-compose configuration...")
    result = run_command(["docker", "compose", "config"], check=False)
    if result.returncode == 0:
        print("  ✓ compose.yml is valid")
    else:
        print("  ✗ compose.yml has errors")
        print(result.stderr)
        sys.exit(1)
    
    # Test 2: Check if ai container is running
    print("[2/4] Checking if ai container is running...")
    result = run_command(["docker", "compose", "ps", "ai"], check=False)
    if result.returncode == 0 and "Up" in result.stdout:
        print("  ✓ ai container is running")
    else:
        print("  ✗ ai container is not running")
        print(result.stdout)
        sys.exit(1)
    
    # Test 3: Check if credentials file exists
    print("[3/4] Checking GCP credentials...")
    creds_file = script_dir / "gcp-credentials.json"
    if creds_file.exists():
        print("  ✓ gcp-credentials.json exists")
    else:
        print("  ✗ gcp-credentials.json not found")
        sys.exit(1)
    
    # Test 4: Run backup with IS_BACKUP=true
    print("[4/4] Running backup test with IS_BACKUP=true...")
    print("  (This will upload a backup to gs://annam-langgraph-db/postgres-backups/)")
    print()
    
    env = os.environ.copy()
    env["IS_BACKUP"] = "test"
    
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "ai", "python3", "/app/backup_to_gcs.py"],
        env=env,
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print()
        print("  ✓ Backup completed successfully!")
    else:
        print()
        print("  ✗ Backup failed")
        print(result.stdout)
        print(result.stderr)
        print()
        print("Debug with:")
        print("  IS_BACKUP=true docker compose exec ai python3 /app/backup_to_gcs.py")
        sys.exit(1)
    
    print()
    print("=" * 50)
    print("✓ All tests passed!")
    print()
    print("Backup location: gs://annam-langgraph-db/postgres-backups/")
    print()
    print("To enable the cron job, run:")
    print("  python3 setup_backup_cron.py")
    print("=" * 50)


if __name__ == "__main__":
    main()
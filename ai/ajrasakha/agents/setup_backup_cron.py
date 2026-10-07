#!/usr/bin/env python3
"""
Setup script for PostgreSQL backup cron job.
Installs cron to run backup via ai container daily at 2:00 AM.
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], capture: bool = False) -> tuple[int, str, str]:
    """Run a shell command and return exit code, stdout, stderr."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def main():
    script_dir = Path(__file__).parent.resolve()
    cron_file = script_dir / "crontab"
    backup_log = Path("/var/log/postgres_backup.log")
    
    print("=" * 50)
    print("Langgraph PostgreSQL Backup Setup")
    print("=" * 50)
    print()
    
    # Create log file if it doesn't exist
    print("[1/3] Setting up log file...")
    try:
        backup_log.parent.mkdir(parents=True, exist_ok=True)
        backup_log.touch()
        backup_log.chmod(0o644)
        print(f"  ✓ Log file: {backup_log}")
    except PermissionError:
        print(f"  ⚠ Cannot create {backup_log} (need sudo), using /tmp/postgres_backup.log")
        backup_log = Path("/tmp/postgres_backup.log")
        backup_log.touch()
    
    # Backup existing crontab
    print("[2/3] Installing cron schedule...")
    rc, existing_cron, _ = run_command(["crontab", "-l"])
    
    if rc == 0 and existing_cron:
        with open("/tmp/existing_crontab.bak", "w") as f:
            f.write(existing_cron)
        print("  ✓ Backed up existing crontab")
    
    # Filter out old backup entries
    cron_content = cron_file.read_text()
    new_entry = None
    for line in cron_content.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "backup_to_gcs" in line:
            new_entry = line
            break
    
    # Remove old backup entries and add new one
    if rc == 0 and existing_cron:
        lines = existing_cron.strip().splitlines()
        filtered = [l for l in lines if "backup_to_gcs" not in l and "postgres_backup" not in l]
        if new_entry and new_entry not in filtered:
            filtered.append(new_entry)
        new_cron = "\n".join(filtered) + "\n"
    else:
        new_cron = new_entry + "\n" if new_entry else ""
    
    # Write new crontab
    proc = subprocess.Popen(["crontab", "-"], stdin=subprocess.PIPE)
    proc.communicate(input=new_cron.encode())
    
    # Verify installation
    print("[3/3] Verifying installation...")
    print()
    print("Current crontab:")
    rc, current_cron, _ = run_command(["crontab", "-l"])
    if rc == 0:
        print(current_cron)
    else:
        print("(no crontab)")
    
    print()
    print("=" * 50)
    print("✓ Backup cron job installed!")
    print()
    print("Schedule: Daily at 2:00 AM")
    print(f"Log file: {backup_log}")
    print("Bucket: gs://annam-langgraph-db/postgres-backups/")
    print()
    print("To test the backup manually, run:")
    print(f"  cd {script_dir}")
    print("  IS_BACKUP=true docker compose exec ai python3 /app/backup_to_gcs.py")
    print()
    print("To view backup logs:")
    print(f"  tail -f {backup_log}")
    print("=" * 50)


if __name__ == "__main__":
    main()
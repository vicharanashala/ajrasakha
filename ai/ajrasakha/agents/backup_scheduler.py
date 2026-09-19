#!/usr/bin/env python3
"""Background scheduler for PostgreSQL backup - runs inside container."""
import os
import sys
import time
import signal
import subprocess
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
BACKUP_HOUR = int(os.environ.get('BACKUP_HOUR', '2'))   # Default: 2 AM IST
BACKUP_MINUTE = int(os.environ.get('BACKUP_MINUTE', '0'))


def run_backup():
    """Run the backup script with current environment."""
    print(f"[{datetime.now(IST)}] Starting scheduled backup...")
    
    env = os.environ.copy()
    env['IS_BACKUP'] = 'true'
    
    result = subprocess.run(
        [sys.executable, '-m', 'ajrasakha.agents.backup_to_gcs'],
        env=env,
        cwd='/app'
    )
    
    return result.returncode == 0


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    print(f"\n[{datetime.now(IST)}] Scheduler shutting down...")
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    print(f"[{datetime.now(IST)}] Backup scheduler started. Will run daily at {BACKUP_HOUR:02d}:{BACKUP_MINUTE:02d} IST")
    
    while True:
        now = datetime.now(IST)
        
        # Check if it's backup time (2:00 AM)
        if now.hour == BACKUP_HOUR and now.minute == BACKUP_MINUTE:
            run_backup()
            # Wait 60 seconds to avoid duplicate runs
            time.sleep(60)
        
        # Sleep for 30 seconds between checks
        time.sleep(30)


if __name__ == '__main__':
    main()
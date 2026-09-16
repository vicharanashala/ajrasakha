#!/usr/bin/env python3
"""
PostgreSQL Backup to GCP Storage
Run daily via cron or manually

Usage:
    python3 backup_to_gcs.py
    
Environment Variables:
    IS_BACKUP: Set to 'true' to run backup (default: 'false')

Requirements:
    google-cloud-storage (auto-installed with uv sync)
"""

import os
import sys
import subprocess
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

# Check if backup mode is enabled
IS_BACKUP = os.environ.get('IS_BACKUP', 'false').lower()

# Determine if this is a test run or production
IS_TEST = IS_BACKUP == 'test'
IS_BACKUP = IS_BACKUP in ('true', 'test')

# Only run if IS_BACKUP=true
if not IS_BACKUP:
    logger.info("IS_BACKUP=false, skipping backup. Exiting.")
    sys.exit(0)

# Configuration from environment
BACKUP_DIR = "/tmp/backups"
GCS_BUCKET = "annam-langgraph-db"
GCS_PATH = "postgres-backups"

# Database configuration - uses docker network host
PG_HOST = os.environ.get('POSTGRES_HOST', 'postgres3')
PG_PORT = os.environ.get('POSTGRES_PORT', '5432')
PG_USER = os.environ.get('POSTGRES_USER', 'ai3')
PG_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'ai_secret3')
PG_DATABASE = os.environ.get('POSTGRES_DB', 'ai3')

# GCP credentials
GCP_CREDS_FILE = "/app/gcp-credentials.json"


def run_pg_dump(backup_file: Path):
    """Create PostgreSQL dump using pg_dump"""
    env = os.environ.copy()
    env['PGPASSWORD'] = PG_PASSWORD
    
    cmd = [
        'pg_dump',
        '-h', PG_HOST,
        '-p', PG_PORT,
        '-U', PG_USER,
        '-d', PG_DATABASE,
        '-F', 'c',  # Custom format (compressed)
        '-f', str(backup_file)
    ]
    
    logger.info(f"Running pg_dump to {backup_file}")
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"pg_dump failed: {result.stderr}")
        raise subprocess.CalledProcessError(result.returncode, cmd)
    
    if not backup_file.exists() or backup_file.stat().st_size == 0:
        raise RuntimeError("Backup file is empty or not created!")
    
    size = backup_file.stat().st_size / (1024 * 1024)
    logger.info(f"Backup created: {backup_file} ({size:.2f} MB)")
    
    return backup_file, size


def upload_to_gcs(backup_file: Path):
    """Upload backup to Google Cloud Storage using Python SDK"""
    from google.cloud import storage
    
    logger.info(f"Uploading to gs://{GCS_BUCKET}/{GCS_PATH}/")
    
    # Initialize GCS client with service account credentials
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = GCP_CREDS_FILE
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(f"{GCS_PATH}/{backup_file.name}")
    
    # Upload the file
    blob.upload_from_filename(str(backup_file))
    
    gcs_path = f"gs://{GCS_BUCKET}/{GCS_PATH}/{backup_file.name}"
    logger.info(f"Uploaded to: {gcs_path}")
    
    # Verify upload
    blob.reload()
    size_mb = blob.size / (1024 * 1024)
    logger.info(f"File size in GCS: {size_mb:.2f} MB")
    
    return gcs_path, size_mb


def cleanup_local_backups():
    """Remove local backups older than 7 days"""
    if not Path(BACKUP_DIR).exists():
        return
    
    import time
    max_age = 7 * 24 * 60 * 60  # 7 days in seconds
    
    for backup in Path(BACKUP_DIR).glob("*.sql.gz"):
        age = time.time() - backup.stat().st_mtime
        if age > max_age:
            backup.unlink()
            logger.info(f"Removed old backup: {backup}")


def send_backup_email(
    backup_size_mb: float,
    gcs_path: str,
    backup_time: datetime,
    error: str | None = None
) -> bool:
    """Send email notification about backup result."""
    from email_service import send_backup_notification
    return send_backup_notification(
        backup_size_mb=backup_size_mb,
        gcs_path=gcs_path,
        backup_time=backup_time,
        error=error
    )


def main():
    backup_time = datetime.now(IST)
    
    try:
        logger.info("=" * 50)
        logger.info("Starting PostgreSQL backup to GCP")
        logger.info("=" * 50)
        
        # Create backup directory
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
        # Generate backup filename
        timestamp = backup_time.strftime("%Y-%m-%d_%H-%M-%S")
        prefix = "test_" if IS_TEST else ""
        backup_file = Path(BACKUP_DIR) / f"{prefix}{timestamp}.sql.gz"
        
        # Create backup
        backup_file, local_size = run_pg_dump(backup_file)
        
        # Upload to GCS
        gcs_path, gcs_size = upload_to_gcs(backup_file)
        
        # Cleanup old local backups
        cleanup_local_backups()
        
        # Remove the backup file after successful upload
        backup_file.unlink()
        logger.info(f"Removed local file: {backup_file}")
        
        logger.info("=" * 50)
        logger.info(f"✓ Backup completed successfully!")
        logger.info(f"  Location: {gcs_path}")
        logger.info(f"  Size: {gcs_size:.2f} MB")
        logger.info("=" * 50)
        
        # Send success email
        send_backup_email(
            backup_size_mb=gcs_size,
            gcs_path=gcs_path,
            backup_time=backup_time
        )
        
        return 0
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"✗ Backup failed: {error_msg}")
        
        # Send failure email
        send_backup_email(
            backup_size_mb=0,
            gcs_path="",
            backup_time=backup_time,
            error=error_msg
        )
        
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
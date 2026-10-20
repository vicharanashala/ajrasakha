"""Standalone cron runner for all background tasks.

This script runs as a separate process so the cron jobs work even when
the FastAPI app is not running. Use this for production deployment.

Usage:
    python cron_runner.py
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import asyncio
import signal
import sys
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime

from cron.auto_flag_cron import flag_low_rated_entries
from cron.weekly_digest_cron import generate_weekly_digest
from services.gap_detector import detector


async def run_auto_flag():
    """Run auto-flagging job"""
    try:
        print(f"[{datetime.utcnow()}] 🤖 Running auto-flag cron...")
        flagged = flag_low_rated_entries()
        print(f"[{datetime.utcnow()}] ✅ Flagged {flagged} entries")
    except Exception as e:
        print(f"[{datetime.utcnow()}] ❌ Auto-flag error: {e}")


async def run_weekly_digest():
    """Generate weekly digest"""
    try:
        print(f"[{datetime.utcnow()}] 📊 Running weekly digest...")
        digest_id = generate_weekly_digest()
        if digest_id:
            print(f"[{datetime.utcnow()}] ✅ Digest created: {digest_id}")
    except Exception as e:
        print(f"[{datetime.utcnow()}] ❌ Weekly digest error: {e}")


async def run_gap_report():
    """Generate gap report (running weekly is fine since data accumulates)"""
    try:
        print(f"[{datetime.utcnow()}] 🔍 Running gap report...")
        report = detector.generate_weekly_report(days=14, top_n=20)
        print(f"[{datetime.utcnow()}] ✅ Gap report: {report.get('clusters_found', 0)} clusters, {len(report.get('top_gaps', []))} top gaps")
    except Exception as e:
        print(f"[{datetime.utcnow()}] ❌ Gap report error: {e}")


async def main():
    """Start the scheduler with all cron jobs"""
    scheduler = AsyncIOScheduler(timezone="UTC")

    # Auto-flag low-rated entries: Daily at 2 AM UTC
    scheduler.add_job(
        run_auto_flag,
        CronTrigger(hour=2, minute=0),
        id="auto_flag_daily",
        name="Auto-flag low-rated entries",
        replace_existing=True
    )

    # Weekly digest: Mondays at 3 AM UTC
    scheduler.add_job(
        run_weekly_digest,
        CronTrigger(day_of_week="mon", hour=3, minute=0),
        id="weekly_digest",
        name="Weekly digest",
        replace_existing=True
    )

    # Gap report: Mondays at 3:30 AM UTC (right after digest)
    scheduler.add_job(
        run_gap_report,
        CronTrigger(day_of_week="mon", hour=3, minute=30),
        id="gap_report_weekly",
        name="GDB Gap Report",
        replace_existing=True
    )

    scheduler.start()

    print("=" * 60)
    print("🌾  AjraSakha Cron Scheduler Started")
    print("=" * 60)
    print(f"📅  Current time (UTC): {datetime.utcnow()}")
    print()
    print("📋 Scheduled jobs:")
    for job in scheduler.get_jobs():
        print(f"   • {job.name}")
        print(f"     ID: {job.id}")
        print(f"     Next run: {job.next_run_time}")
        print()
    print("=" * 60)
    print("Press Ctrl+C to stop")
    print()

    # Run once immediately on startup (optional - comment out in production)
    print("🚀 Running initial jobs...")
    await run_auto_flag()
    await run_gap_report()

    # Wait for cron triggers
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        print("\n👋 Shutting down scheduler...")
        scheduler.shutdown()
        print("✅ Stopped")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Scheduler stopped.")

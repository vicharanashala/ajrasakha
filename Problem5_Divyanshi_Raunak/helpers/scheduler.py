from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo
import logging
from typing import Dict, Any, List
from helpers.flagging_pipeline import scan_and_flag_all_candidates

logger = logging.getLogger("ajrasakha.scheduler")

_scheduler: BackgroundScheduler = None
IST_TIMEZONE = ZoneInfo("Asia/Kolkata")
JOB_ID = "daily_gdb_flagging_cron"

def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone=IST_TIMEZONE)
    return _scheduler

def start_scheduler() -> BackgroundScheduler:
    """
    Initializes and starts the APScheduler background daemon.
    Schedules the daily GDB flagging scan to run everyday at 2:00 AM IST.
    """
    sched = get_scheduler()
    
    # Configure daily cron trigger using configured hour and minute (Asia/Kolkata)
    from backend.app.config import settings
    cron_hour = getattr(settings, "CRON_FLAGGING_HOUR", 2)
    cron_minute = getattr(settings, "CRON_FLAGGING_MINUTE", 0)
    trigger = CronTrigger(hour=cron_hour, minute=cron_minute, timezone=IST_TIMEZONE)
    
    # Add or update the 2:00 AM IST flagging scan job
    sched.add_job(
        func=scan_and_flag_all_candidates,
        trigger=trigger,
        id=JOB_ID,
        name=f"Daily GDB Flagging Quality Scan ({cron_hour:02d}:{cron_minute:02d} IST)",
        replace_existing=True,
        misfire_grace_time=3600 # 1 hour grace if server was temporarily restarted
    )

    # Configure unresponded farmers feedback nudge cron trigger at 7:00 PM & 9:00 PM IST (Asia/Kolkata)
    from helpers.session_pipeline import run_unresponded_farmer_nudge_cron
    nudge_trigger = CronTrigger(hour="19,21", minute=0, timezone=IST_TIMEZONE)
    sched.add_job(
        func=run_unresponded_farmer_nudge_cron,
        trigger=nudge_trigger,
        id="unresponded_farmer_nudge_cron",
        name="Unresponded Farmers Feedback Nudge (7:00 PM & 9:00 PM IST)",
        replace_existing=True,
        misfire_grace_time=3600
    )
    
    if not sched.running:
        sched.start()
        logger.info("APScheduler background scheduler started successfully.")
        
    for j in sched.get_jobs():
        logger.info(f"Scheduled '{j.name}' [ID: {j.id}] - Next run: {j.next_run_time}")
        
    return sched

def shutdown_scheduler():
    """
    Gracefully shuts down the background scheduler.
    """
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler background scheduler shut down.")
        _scheduler = None

def get_scheduler_info() -> Dict[str, Any]:
    """
    Returns diagnostic information about active scheduler jobs.
    """
    sched = get_scheduler()
    jobs_info: List[Dict[str, Any]] = []
    
    if sched:
        for j in sched.get_jobs():
            jobs_info.append({
                "id": j.id,
                "name": j.name,
                "trigger": str(j.trigger),
                "next_run_time": str(j.next_run_time) if j.next_run_time else None
            })
            
    return {
        "is_running": sched.running if sched else False,
        "timezone": "Asia/Kolkata (IST)",
        "jobs": jobs_info
    }

def trigger_cron_now() -> Dict[str, Any]:
    """
    Manually triggers the daily GDB flagging scan immediately.
    """
    logger.info("Manual trigger requested for daily GDB flagging scan...")
    return scan_and_flag_all_candidates()

def trigger_evening_nudge_cron_now() -> Dict[str, Any]:
    """
    Manually triggers the unresponded farmers feedback nudge cron job immediately.
    """
    logger.info("Manual trigger requested for unresponded farmers feedback nudge...")
    from helpers.session_pipeline import run_unresponded_farmer_nudge_cron
    return run_unresponded_farmer_nudge_cron()

def trigger_unresponded_nudge_cron_now() -> Dict[str, Any]:
    """Alias for trigger_evening_nudge_cron_now."""
    return trigger_evening_nudge_cron_now()


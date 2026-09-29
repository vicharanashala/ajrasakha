from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv

load_dotenv()

from shared.utils import Config
from shared.mongodb import get_db
from routers import feedback, dashboard, flagged, weekly_digest, chat, admin, gaps, gdb_entries, auth

# Module-level scheduler so it persists
_scheduler = {"instance": None, "started": False}


async def run_auto_flag():
    """Run auto-flagging job (async wrapper)"""
    from cron.auto_flag_cron import flag_low_rated_entries
    try:
        from datetime import datetime
        print(f"[{datetime.utcnow()}] 🤖 Running auto-flag cron...")
        flagged = flag_low_rated_entries()
        print(f"[{datetime.utcnow()}] ✅ Flagged {flagged} entries")
    except Exception as e:
        print(f"Auto-flag error: {e}")


async def run_weekly_digest():
    """Generate weekly digest (async wrapper)"""
    from cron.weekly_digest_cron import generate_weekly_digest
    try:
        from datetime import datetime
        print(f"[{datetime.utcnow()}] 📊 Running weekly digest...")
        digest_id = generate_weekly_digest()
        if digest_id:
            print(f"[{datetime.utcnow()}] ✅ Digest created")
    except Exception as e:
        print(f"Weekly digest error: {e}")


async def run_gap_report():
    """Generate gap report (async wrapper)"""
    from services.gap_detector import detector
    try:
        from datetime import datetime
        print(f"[{datetime.utcnow()}] 🔍 Running gap report...")
        report = detector.generate_weekly_report(days=14, top_n=20)
        print(f"[{datetime.utcnow()}] ✅ Gap report: {report.get('clusters_found', 0)} clusters")
    except Exception as e:
        print(f"Gap report error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager - start scheduler, run jobs at scheduled times"""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from datetime import datetime

    scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler["instance"] = scheduler

    # Auto-flag low-rated entries: Daily at 2 AM UTC
    scheduler.add_job(
        run_auto_flag,
        CronTrigger(hour=2, minute=0),
        id="auto_flag_daily",
        name="Auto-flag low-rated entries",
        replace_existing=True,
        misfire_grace_time=3600  # 1 hour grace period
    )

    # Weekly digest: Mondays at 3 AM UTC
    scheduler.add_job(
        run_weekly_digest,
        CronTrigger(day_of_week="mon", hour=3, minute=0),
        id="weekly_digest",
        name="Weekly Digest",
        replace_existing=True,
        misfire_grace_time=3600
    )

    # Gap report: Mondays at 3:30 AM UTC (right after digest)
    scheduler.add_job(
        run_gap_report,
        CronTrigger(day_of_week="mon", hour=3, minute=30),
        id="gap_report_weekly",
        name="GDB Gap Report",
        replace_existing=True,
        misfire_grace_time=3600
    )

    scheduler.start()
    _scheduler["started"] = True

    print("⏰ APScheduler started!")
    print("📋 Scheduled jobs:")
    for job in scheduler.get_jobs():
        print(f"   • {job.name}")
        print(f"     ID: {job.id}")
        print(f"     Next run: {job.next_run_time}")
        print()

    # Run auto-flag immediately on startup (catches up missed runs)
    print("🚀 Running initial auto-flag...")
    try:
        await run_auto_flag()
    except Exception as e:
        print(f"Initial auto-flag error: {e}")

    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown()
            print("⏰ APScheduler stopped")


app = FastAPI(
    title="Farmer Feedback API",
    description="API for AjraSakha Farmer Feedback System",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(flagged.router, prefix="/api/flagged", tags=["Flagged"])
app.include_router(weekly_digest.router, prefix="/api/weekly-digest", tags=["Weekly Digest"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(gaps.router, prefix="/api/gaps", tags=["Coverage Gaps"])
app.include_router(gdb_entries.router, prefix="/api", tags=["GDB Entries"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])


@app.get("/")
def root():
    return {
        "service": "Farmer Feedback API",
        "version": "1.0.0",
        "status": "running",
        "scheduler": _scheduler.get("started", False),
        "scheduled_jobs": [job.name for job in _scheduler["instance"].get_jobs()] if _scheduler.get("instance") else []
    }


@app.get("/health")
def health():
    scheduler_status = "running" if _scheduler.get("started") else "stopped"
    job_count = 0
    next_runs = []
    if _scheduler.get("instance"):
        jobs = _scheduler["instance"].get_jobs()
        job_count = len(jobs)
        next_runs = [
            {"name": job.name, "next_run": str(job.next_run_time)}
            for job in jobs
        ]
    return {
        "status": "healthy",
        "scheduler": scheduler_status,
        "scheduled_jobs_count": job_count,
        "next_runs": next_runs
    }


@app.get("/api/scheduler/status")
def scheduler_status():
    """Get current scheduler status and job details"""
    if not _scheduler.get("instance"):
        return {"error": "Scheduler not initialized"}

    scheduler = _scheduler["instance"]
    jobs = scheduler.get_jobs()

    return {
        "running": scheduler.running,
        "started": _scheduler.get("started", False),
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": str(job.next_run_time),
                "trigger": str(job.trigger)
            }
            for job in jobs
        ]
    }


@app.post("/api/scheduler/run-now/{job_id}")
async def run_job_now(job_id: str):
    """Manually trigger a scheduled job"""
    scheduler = _scheduler.get("instance")
    if not scheduler:
        return {"error": "Scheduler not initialized"}

    job = scheduler.get_job(job_id)
    if not job:
        return {"error": f"Job {job_id} not found"}

    try:
        job.func.run()
        return {"success": True, "job_id": job_id, "message": "Job executed"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/stats")
def api_stats():
    db = get_db()

    total = db.feedback.count_documents({})
    helpful = db.feedback.count_documents({"response": "1"})
    not_helpful = db.feedback.count_documents({"response": "2"})

    return {
        "total_feedback": total,
        "helpful_count": helpful,
        "not_helpful_count": not_helpful,
        "helpfulness_score": (helpful / total * 100) if total > 0 else 0
    }

import logging
from typing import Any
from fastapi import APIRouter

logger = logging.getLogger("gdb_gap_detector.api.routers.scheduler")
router = APIRouter(prefix="/api/v1/scheduler", tags=["Scheduler"])


def get_scheduler_status() -> dict[str, Any]:
    """Get status of scheduler and trigger configuration."""
    return {
        "running": True,
        "mode": "external_cron_webhook",
        "trigger_endpoint": "/api/v1/run-now",
        "available": True,
    }


def start_scheduler() -> None:
    """No-op scheduler start handler for external cron mode."""
    pass


def stop_scheduler() -> None:
    """No-op scheduler stop handler for external cron mode."""
    pass


@router.get("/status", response_model=dict[str, Any])
def get_status() -> dict[str, Any]:
    """Get status of scheduler and trigger configuration."""
    return get_scheduler_status()


@router.post("/start", response_model=dict[str, Any])
async def start() -> dict[str, Any]:
    """Start endpoint confirmation for external trigger."""
    start_scheduler()
    status = get_scheduler_status()
    status["message"] = "Pipeline trigger active via POST /api/v1/run-now."
    return status


@router.post("/stop", response_model=dict[str, Any])
async def stop() -> dict[str, Any]:
    """Stop endpoint confirmation for external trigger."""
    stop_scheduler()
    status = get_scheduler_status()
    status["message"] = "External scheduler mode active."
    return status

import logging
from typing import Any
from gdb_gap_detector.core import MongoDB, settings
from gdb_gap_detector.services import run_full_pipeline

logger = logging.getLogger("gdb_gap_detector.worker")


async def weekly_gap_detector_job() -> None:
    """Weekly automated job executing pipeline and saving report to MongoDB."""
    logger.info("Executing scheduled weekly GDB Gap Detector job...")
    try:
        db = MongoDB.get_db()
        report = await run_full_pipeline(
            db, period_days=settings.period_days, write_to_db=True
        )
        logger.info(
            f"Scheduled job completed successfully. Report generated with "
            f"{report.clusters_found} clusters across {report.total_disclaimers} disclaimers."
        )
    except Exception as err:
        logger.error(f"Scheduled GDB Gap Detector job failed: {err}", exc_info=True)


def start_scheduler() -> None:
    """No-op scheduler start handler."""
    pass


def stop_scheduler() -> None:
    """No-op scheduler stop handler."""
    pass


def get_scheduler_status() -> dict[str, Any]:
    """Get current scheduler status."""
    return {
        "running": True,
        "mode": "external_cron_webhook",
        "available": True,
    }

"""Main entry point for HuggingFace sync Cloud Run job.

This module is the entry point for Google Cloud Run Jobs.
It runs the sync script to push golden Q&A data to HuggingFace.
"""

import logging
import sys

from sync import GoldenToHuggingFaceSync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s IST %(levelname)s [sync] %(message)s",
)
log = logging.getLogger(__name__)


def main():
    """Run the sync job."""
    log.info("=" * 60)
    log.info("HuggingFace Sync Job Started")
    log.info("=" * 60)

    try:
        sync = GoldenToHuggingFaceSync()
        sync.run_sync()
        log.info("Sync job completed successfully")
        sys.exit(0)
    except Exception as e:
        log.error("Sync job failed: %s", str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
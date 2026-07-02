"""Sync crop_master MongoDB → crop_chemical_name.py (literal Python dict).

Usage:
  cd ajrasakha/ai
  python -m ajrasakha.agents.build_crop_master_dictionary

Requires GOLDEN_MONGODB_URI.
"""

from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

from ajrasakha.agents.crop_chemical_resolver import (
    crop_chemical_name_path,
    load_memory_from_crop_chemical_name,
    sync_crop_chemical_name_from_mongo,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    load_dotenv()
    try:
        out = sync_crop_chemical_name_from_mongo()
        load_memory_from_crop_chemical_name(reload=True)
        logger.info("crop_chemical_name ready at: %s", out)
        return 0
    except Exception as exc:
        logger.error("Failed to build crop_chemical_name: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())

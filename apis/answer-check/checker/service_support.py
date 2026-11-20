"""Start-up logging and single-answer handling for the check API."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import llm_checker
from llm_client import MINIMAX_URL, api_key_is_set, call_llm_once
from result_state import not_applicable_result

logger = logging.getLogger("answer_check")

STARTUP_CHECK_ATTEMPTS = 3
# a reasoning model can spend a small reply length before it answers, so the test call allows enough
STARTUP_CHECK_TOKENS = 1024


def log_startup_config() -> None:
    """Log the config at boot: whether the key is set, never the key."""
    logger.info("answer-check starting")
    logger.info("MINIMAX_API_KEY: %s", "set" if api_key_is_set() else "NOT SET -- every model-based check will fail")
    logger.info("USE_MOCK_LLM: %s", llm_checker.USE_MOCK_LLM)
    logger.info("model endpoint: %s", MINIMAX_URL)
    logger.info(
        "PIPELINE_WORKERS=%s PIPELINE_RETRY_ROUNDS=%s",
        os.getenv("PIPELINE_WORKERS", "(default 8)"),
        os.getenv("PIPELINE_RETRY_ROUNDS", "(default 5)"),
    )


def startup_model_check() -> None:
    """Make one small model call at boot and log whether it worked (3 tries)."""
    if llm_checker.USE_MOCK_LLM:
        logger.info("startup model check skipped: USE_MOCK_LLM is on")
        return
    if not api_key_is_set():
        logger.error("startup model check skipped: MINIMAX_API_KEY is not set")
        return
    for attempt in range(1, STARTUP_CHECK_ATTEMPTS + 1):
        started = time.time()
        try:
            call_llm_once('Reply with exactly: {"ok": true}', max_completion_tokens=STARTUP_CHECK_TOKENS)
        except Exception as exc:
            logger.warning(
                "startup model check attempt %d/%d failed: %s: %s",
                attempt, STARTUP_CHECK_ATTEMPTS, type(exc).__name__, str(exc)[:200],
            )
            continue
        logger.info(
            "startup model check OK (attempt %d, %.1fs): model API reachable with the configured key",
            attempt, time.time() - started,
        )
        return
    logger.error(
        "startup model check FAILED %d/%d -- model-based checks will fail until this is fixed",
        STARTUP_CHECK_ATTEMPTS, STARTUP_CHECK_ATTEMPTS,
    )


def resolve_uniformity_of_dose_for_single_answer(result: dict[str, Any]) -> None:
    """Mark dose uniformity as not applicable.

    It compares a dose with other answers in the same batch, and a check of one answer has
    no other answer to compare with.
    """
    check = (result.get("parameters", {}).get("chemical") or {}).get("uniformity_of_dose")
    if check and check.get("execution") == "DEFERRED":
        result["parameters"]["chemical"]["uniformity_of_dose"] = not_applicable_result(
            "Cannot check dose uniformity: one answer is checked at a time, so there is never "
            "another answer in the same batch to compare against.",
        )

"""
MongoDB index setup for the feedback collection.
Called automatically on server startup via main.py startup_event.
Can also be triggered manually via POST /admin/create-indexes endpoint.
"""

import logging
logger = logging.getLogger(__name__)


async def create_indexes(feedback_collection, pending_feedback_collection):
    """Create all indexes. Accepts collections as arguments so it
    reuses the existing motor connections from database.py."""

    logger.info("Creating indexes on feedback collection...")

    await feedback_collection.create_index("answer_id")
    await feedback_collection.create_index("question_id")
    await feedback_collection.create_index("farmer_phone")
    await feedback_collection.create_index("domain")
    await feedback_collection.create_index("state")
    await feedback_collection.create_index("language")
    await feedback_collection.create_index("created_at")

    await feedback_collection.create_index(
        [("answer_id", 1), ("response", 1)],
        name="answer_response_compound"
    )

    logger.info("✅ feedback collection indexes created")

    await pending_feedback_collection.create_index(
        "farmer_phone",
        unique=True,
        name="pending_farmer_phone_unique"
    )

    logger.info("✅ pending_feedback collection indexes created")

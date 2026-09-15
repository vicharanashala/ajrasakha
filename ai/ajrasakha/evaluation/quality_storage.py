"""
Postgres storage for answer quality scores (Project 3 requirement).

Uses SQLAlchemy async engine (matches the project's existing
DATABASE_URL convention of postgresql+asyncpg://).
"""

import os
import json
from dotenv import load_dotenv

load_dotenv()
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, DateTime, JSON, Integer
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class QualityScore(Base):
    __tablename__ = "quality_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_name = Column(String, nullable=False)
    domain = Column(String, nullable=False)
    query = Column(String, nullable=False)
    answer_relevancy_score = Column(Float, nullable=True)
    faithfulness_score = Column(Float, nullable=True)
    contextual_relevancy_score = Column(Float, nullable=True)
    gdb_match_score = Column(Float, nullable=True)
    crop_correctness_status = Column(String, nullable=True)
    treatment_correctness_status = Column(String, nullable=True)
    region_correctness_status = Column(String, nullable=True)
    raw_scores = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


def _get_engine():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL not set in environment")
    return create_async_engine(url)


async def init_db():
    """Create the quality_scores table if it doesn't exist yet."""
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def save_quality_score(case_name: str, domain: str, query: str, answer_quality_scores: dict):
    """Save one case's quality score breakdown to Postgres."""
    def _get(key, subkey="score"):
        val = answer_quality_scores.get(key)
        if isinstance(val, dict):
            return val.get(subkey)
        return None

    engine = _get_engine()
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        row = QualityScore(
            case_name=case_name,
            domain=domain,
            query=query,
            answer_relevancy_score=_get("AnswerRelevancyMetric"),
            faithfulness_score=_get("FaithfulnessMetric"),
            contextual_relevancy_score=_get("ContextualRelevancyMetric"),
            gdb_match_score=_get("GDBMatchScore"),
            crop_correctness_status=answer_quality_scores.get("crop_correctness_status"),
            treatment_correctness_status=answer_quality_scores.get("treatment_correctness_status"),
            region_correctness_status=answer_quality_scores.get("region_correctness_status"),
            raw_scores=answer_quality_scores,
        )
        session.add(row)
        await session.commit()

    await engine.dispose()


async def get_all_scores():
    """Fetch all stored quality scores, most recent first."""
    from sqlalchemy import select

    engine = _get_engine()
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        result = await session.execute(select(QualityScore).order_by(QualityScore.created_at.desc()))
        rows = result.scalars().all()

    await engine.dispose()
    return rows

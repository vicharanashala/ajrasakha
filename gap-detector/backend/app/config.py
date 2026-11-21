"""Central configuration.

Every threshold, weight, DB name and URL lives here (or in .env). Nothing in the
services or pipeline hard-codes a number an operator might want to tune.

Two profiles:
  * ``prod`` - production defaults (30-day window, clusters of 3+).
  * ``demo`` - looser thresholds so the ~7 MB hackathon sample still yields output.
Any value set explicitly in the environment overrides the profile.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Profile = Literal["demo", "prod"]

PROFILES: dict[Profile, dict[str, object]] = {
    "prod": {"min_cluster_size": 3, "gap_report_period_days": 30},
    "demo": {"min_cluster_size": 2, "gap_report_period_days": 90},
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    # ---- database ----------------------------------------------------------
    mongodb_uri: str = Field(default="mongodb://localhost:27017")
    source_db_feedback: str = "farmer_feedback"
    source_db_gap: str = "gdb_gap_detector"
    source_db_reviewer: str = "agriai"
    output_db: str = "ace_insights"

    # ---- profile -----------------------------------------------------------
    ace_profile: Profile = "demo"

    # ---- gap detector (P6) -------------------------------------------------
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_backend: Literal["sentence-transformers", "hash"] = "sentence-transformers"
    cluster_distance_threshold: float = 0.35  # cosine distance, agglomerative
    min_cluster_size: int | None = None
    gap_report_period_days: int | None = None
    gap_top_n: int = 20
    # Queries that are not evidence of a GDB gap: off-topic questions and synthetic
    # test traffic. Counted and reported separately rather than silently dropped.
    exclude_domains: str = "Off-topic"
    exclude_channels: str = "test"
    gap_weight_frequency: float = 0.40
    gap_weight_trend: float = 0.25
    gap_weight_farmers: float = 0.20
    gap_weight_geography: float = 0.15
    coverage_good: float = 0.60
    coverage_partial: float = 0.30

    # ---- api -----------------------------------------------------------------
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    farmer_key_salt: str = "ace-insights"

    @model_validator(mode="after")
    def _apply_profile(self) -> Settings:
        for key, value in PROFILES[self.ace_profile].items():
            if getattr(self, key) is None:
                setattr(self, key, value)
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def excluded_domain_set(self) -> set[str]:
        return {d.strip() for d in self.exclude_domains.split(",") if d.strip()}

    @property
    def excluded_channel_set(self) -> set[str]:
        return {c.strip().lower() for c in self.exclude_channels.split(",") if c.strip()}

    @property
    def gap_weights(self) -> dict[str, float]:
        return {
            "frequency": self.gap_weight_frequency,
            "trend": self.gap_weight_trend,
            "farmers": self.gap_weight_farmers,
            "geography": self.gap_weight_geography,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()

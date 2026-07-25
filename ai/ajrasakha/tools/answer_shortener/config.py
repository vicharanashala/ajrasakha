"""Environment-backed configuration for the answer-shortener service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


_SERVICE_ENV_FILE = Path(__file__).with_name(".env")
_ANTHROPIC_KEY_PLACEHOLDERS = {
    "your_anthropic_api_key_here",
    "replace_with_your_anthropic_api_key",
}
load_dotenv(_SERVICE_ENV_FILE)
load_dotenv()


class SettingsError(RuntimeError):
    """Raised when service configuration is missing or invalid."""


def _read_int(
    name: str,
    default: int,
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise SettingsError(f"{name} must be an integer") from exc
    if value < minimum:
        raise SettingsError(f"{name} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise SettingsError(f"{name} must be at most {maximum}")
    return value


def _read_float(name: str, default: float, *, minimum: float = 0.0) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = float(raw)
    except ValueError as exc:
        raise SettingsError(f"{name} must be a number") from exc
    if value < minimum:
        raise SettingsError(f"{name} must be at least {minimum}")
    return value


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str
    model: str
    provider_timeout_seconds: float
    provider_max_retries: int
    rewrite_attempts: int
    max_output_tokens: int
    service_api_key: str
    character_tolerance: int = 50

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
            model=os.getenv(
                "ANSWER_SHORTENER_MODEL",
                "claude-sonnet-4-6",
            ).strip(),
            provider_timeout_seconds=_read_float(
                "ANTHROPIC_TIMEOUT_SECONDS", 30.0, minimum=1.0
            ),
            provider_max_retries=_read_int(
                "ANTHROPIC_MAX_RETRIES", 2, minimum=0
            ),
            rewrite_attempts=_read_int(
                "ANSWER_SHORTENER_REWRITE_ATTEMPTS", 3, minimum=1, maximum=3
            ),
            max_output_tokens=_read_int(
                "ANSWER_SHORTENER_MAX_OUTPUT_TOKENS", 32768, minimum=256
            ),
            service_api_key=os.getenv("ANSWER_SHORTENER_API_KEY", "").strip(),
        )

    def require_provider_configuration(self) -> None:
        if (
            not self.anthropic_api_key
            or self.anthropic_api_key.casefold() in _ANTHROPIC_KEY_PLACEHOLDERS
        ):
            raise SettingsError("ANTHROPIC_API_KEY is not configured")
        if not self.model:
            raise SettingsError("ANSWER_SHORTENER_MODEL is not configured")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()

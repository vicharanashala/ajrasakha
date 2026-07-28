"""Small async gateway around Anthropic's Messages API."""

from __future__ import annotations

from anthropic import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AsyncAnthropic,
    RateLimitError,
)

try:  # Package import for local Uvicorn and tests.
    from .config import Settings
except ImportError:  # Docker runs this directory directly as ``api:app``.
    from config import Settings


class ClaudeClientError(RuntimeError):
    """Base class for provider failures safe to map at the API boundary."""


class ClaudeTimeoutError(ClaudeClientError):
    pass


class ClaudeUnavailableError(ClaudeClientError):
    pass


class ClaudeConfigurationError(ClaudeClientError):
    pass


class ClaudeProviderError(ClaudeClientError):
    pass


class AnthropicClaudeGateway:
    def __init__(
        self,
        settings: Settings,
        *,
        client: AsyncAnthropic | None = None,
    ) -> None:
        self._client = client or AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.provider_timeout_seconds,
            max_retries=settings.provider_max_retries,
        )
        self.model = settings.model

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str:
        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=0.0,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except APITimeoutError as exc:
            raise ClaudeTimeoutError("Claude request timed out") from exc
        except RateLimitError as exc:
            raise ClaudeUnavailableError("Claude rate limit reached") from exc
        except APIConnectionError as exc:
            raise ClaudeUnavailableError("Claude could not be reached") from exc
        except APIStatusError as exc:
            if exc.status_code in {401, 403, 404}:
                raise ClaudeConfigurationError(
                    "Claude credentials were rejected"
                ) from exc
            if exc.status_code >= 500:
                raise ClaudeUnavailableError(
                    "Claude is temporarily unavailable"
                ) from exc
            raise ClaudeProviderError("Claude returned an API error") from exc
        except APIError as exc:
            raise ClaudeProviderError("Claude returned an unexpected SDK error") from exc

        if getattr(response, "stop_reason", None) == "max_tokens":
            raise ClaudeProviderError("Claude output reached the token limit")

        parts: list[str] = []
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text = getattr(block, "text", "")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(part.strip() for part in parts if part.strip()).strip()

"""Async gateway for Samagama's OpenAI-compatible chat-completions proxy."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Mapping, Sequence
from typing import Any, Protocol

import httpx

try:  # Package import for local Uvicorn and tests.
    from .config import Settings
except ImportError:  # Docker runs this directory directly as ``api:app``.
    from config import Settings


logger = logging.getLogger(__name__)


class ModelClientError(RuntimeError):
    """Base class for provider failures safe to map at the API boundary."""


class ModelTimeoutError(ModelClientError):
    pass


class ModelUnavailableError(ModelClientError):
    pass


class ModelConfigurationError(ModelClientError):
    pass


class ModelProviderError(ModelClientError):
    pass


class AsyncChatClient(Protocol):
    async def post(self, url: str, **kwargs: Any) -> httpx.Response: ...


_LEADING_THINK_BLOCKS_RE = re.compile(
    r"^\s*(?:<think>.*?</think>\s*)+",
    re.IGNORECASE | re.DOTALL,
)


class SamagamaMiniMaxGateway:
    """Use MiniMax-M3 through Samagama without changing service semantics."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: AsyncChatClient | None = None,
    ) -> None:
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.provider_timeout_seconds)
        )
        self._url = settings.samagama_chat_completions_url
        self._api_key = settings.samagama_api_key
        self._provider_max_retries = settings.provider_max_retries
        self.model = settings.model

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.0,
            "max_tokens": max_tokens,
            # Source selection and constrained compression do not require
            # chain-of-thought.  MiniMax-M3 enables it by default, which can
            # consume the entire response budget before the required JSON or
            # final text is produced.
            "thinking": {"type": "disabled"},
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        for attempt in range(self._provider_max_retries + 1):
            try:
                response = await self._client.post(
                    self._url,
                    headers=headers,
                    json=payload,
                )
            except httpx.TimeoutException as exc:
                if await self._retry_or_exhaust(attempt):
                    continue
                raise ModelTimeoutError("Samagama request timed out") from exc
            except httpx.RequestError as exc:
                if await self._retry_or_exhaust(attempt):
                    continue
                raise ModelUnavailableError("Samagama could not be reached") from exc

            if response.status_code in {401, 403, 404}:
                logger.warning(
                    "Samagama configuration rejected completion request status_code=%d",
                    response.status_code,
                )
                raise ModelConfigurationError("Samagama credentials or endpoint were rejected")
            if response.status_code == 429 or response.status_code >= 500:
                if await self._retry_or_exhaust(attempt):
                    continue
                raise ModelUnavailableError("Samagama is temporarily unavailable")
            if response.status_code >= 400:
                logger.warning(
                    "Samagama rejected completion request status_code=%d",
                    response.status_code,
                )
                raise ModelProviderError("Samagama returned an API error")

            return self._parse_response(response)

        raise AssertionError("provider retry loop unexpectedly completed")

    async def _retry_or_exhaust(self, attempt: int) -> bool:
        if attempt >= self._provider_max_retries:
            return False
        await asyncio.sleep(min(0.25 * (2**attempt), 2.0))
        return True

    @staticmethod
    def _parse_response(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError as exc:
            # Samagama has occasionally returned a JSON envelope with literal
            # newlines inside the model text.  That is not strictly valid JSON,
            # but it is otherwise the documented chat-completions shape.  Accept
            # only this narrow encoding variation; every later schema check still
            # applies as normal.
            try:
                payload = json.loads(response.text, strict=False)
            except (TypeError, ValueError) as permissive_exc:
                content_type = response.headers.get("content-type", "unknown")
                body = response.text.lstrip()
                if not body:
                    body_kind = "empty"
                elif body.startswith("<"):
                    body_kind = "html_or_xml"
                elif body.startswith("data:"):
                    body_kind = "server_sent_events"
                else:
                    body_kind = "non_json_text"
                logger.warning(
                    "Samagama returned non-JSON completion response status_code=%d "
                    "content_type=%s body_kind=%s body_length=%d",
                    response.status_code,
                    content_type,
                    body_kind,
                    len(response.content),
                )
                raise ModelProviderError("Samagama returned invalid JSON") from permissive_exc

        if not isinstance(payload, Mapping):
            raise ModelProviderError("Samagama returned an invalid response")
        choices = payload.get("choices")
        if not isinstance(choices, Sequence) or isinstance(choices, (str, bytes)) or not choices:
            raise ModelProviderError("Samagama response contains no completion choices")
        choice = choices[0]
        if not isinstance(choice, Mapping):
            raise ModelProviderError("Samagama response contains an invalid completion choice")
        finish_reason = choice.get("finish_reason")
        if finish_reason in {"length", "max_tokens"}:
            logger.warning(
                "Samagama completion reached token limit finish_reason=%s",
                finish_reason,
            )
            raise ModelProviderError("MiniMax output reached the token limit")

        message = choice.get("message")
        if not isinstance(message, Mapping):
            raise ModelProviderError("Samagama response contains no completion message")
        content = message.get("content")
        text = SamagamaMiniMaxGateway._content_to_text(content)
        if not text:
            raise ModelProviderError("Samagama response contains empty completion text")
        return text

    @staticmethod
    def _content_to_text(content: object) -> str:
        if isinstance(content, str):
            return _LEADING_THINK_BLOCKS_RE.sub("", content).strip()
        if not isinstance(content, Sequence) or isinstance(content, (str, bytes)):
            return ""

        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, Mapping) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        text = "\n".join(part.strip() for part in parts if part.strip())
        return _LEADING_THINK_BLOCKS_RE.sub("", text).strip()

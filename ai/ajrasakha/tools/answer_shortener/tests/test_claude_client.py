from __future__ import annotations

from types import SimpleNamespace

import pytest

from ajrasakha.tools.answer_shortener.claude_client import (
    AnthropicClaudeGateway,
    ClaudeProviderError,
)
from ajrasakha.tools.answer_shortener.config import Settings


class FakeMessages:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeAnthropicClient:
    def __init__(self, response: object) -> None:
        self.messages = FakeMessages(response)


def make_settings() -> Settings:
    return Settings(
        anthropic_api_key="test-key",
        model="claude-test-sonnet",
        provider_timeout_seconds=30.0,
        provider_max_retries=0,
        rewrite_attempts=3,
        max_output_tokens=32768,
        service_api_key="",
    )


@pytest.mark.asyncio
async def test_gateway_uses_deterministic_messages_call_and_joins_text_blocks():
    response = SimpleNamespace(
        stop_reason="end_turn",
        content=[
            SimpleNamespace(type="text", text="first paragraph"),
            SimpleNamespace(type="tool_use", text="ignored"),
            SimpleNamespace(type="text", text="second paragraph"),
        ],
    )
    client = FakeAnthropicClient(response)
    gateway = AnthropicClaudeGateway(make_settings(), client=client)

    result = await gateway.generate(
        system_prompt="system",
        user_prompt="user",
        max_tokens=500,
    )

    assert result == "first paragraph\nsecond paragraph"
    call = client.messages.calls[0]
    assert call["model"] == "claude-test-sonnet"
    assert call["temperature"] == 0.0
    assert call["max_tokens"] == 500


@pytest.mark.asyncio
async def test_gateway_rejects_token_truncated_output():
    response = SimpleNamespace(
        stop_reason="max_tokens",
        content=[SimpleNamespace(type="text", text="incomplete")],
    )
    gateway = AnthropicClaudeGateway(
        make_settings(),
        client=FakeAnthropicClient(response),
    )

    with pytest.raises(ClaudeProviderError):
        await gateway.generate(
            system_prompt="system",
            user_prompt="user",
            max_tokens=10,
        )

from __future__ import annotations

import json

import httpx
import pytest

from ajrasakha.tools.answer_shortener.config import Settings
from ajrasakha.tools.answer_shortener.samagama_client import (
    ModelConfigurationError,
    ModelProviderError,
    SamagamaMiniMaxGateway,
)


class FakeSamagamaClient:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.responses = list(responses)
        self.calls: list[dict] = []

    async def post(self, url: str, **kwargs) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        return self.responses.pop(0)


def make_settings(*, retries: int = 0) -> Settings:
    return Settings(
        samagama_api_key="test-key",
        samagama_chat_completions_url="https://samagama.example/v1/chat/completions",
        model="MiniMax-M3",
        provider_timeout_seconds=30.0,
        provider_max_retries=retries,
        rewrite_attempts=3,
        max_output_tokens=32768,
        service_api_key="",
    )


def response(status_code: int, payload: object) -> httpx.Response:
    request = httpx.Request("POST", "https://samagama.example/v1/chat/completions")
    return httpx.Response(status_code, content=json.dumps(payload), request=request)


def raw_response(status_code: int, content: str) -> httpx.Response:
    request = httpx.Request("POST", "https://samagama.example/v1/chat/completions")
    return httpx.Response(status_code, content=content, request=request)


@pytest.mark.asyncio
async def test_gateway_uses_openai_compatible_chat_completion_request():
    client = FakeSamagamaClient(
        [
            response(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": "short answer"},
                        }
                    ]
                },
            )
        ]
    )
    gateway = SamagamaMiniMaxGateway(make_settings(), client=client)

    result = await gateway.generate(
        system_prompt="system prompt",
        user_prompt="user prompt",
        max_tokens=500,
    )

    assert result == "short answer"
    call = client.calls[0]
    assert call["url"] == "https://samagama.example/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer test-key"
    assert call["headers"]["Accept"] == "application/json"
    assert call["json"] == {
        "model": "MiniMax-M3",
        "messages": [
            {"role": "system", "content": "system prompt"},
            {"role": "user", "content": "user prompt"},
        ],
        "temperature": 0.0,
        "max_tokens": 500,
        "thinking": {"type": "disabled"},
    }


@pytest.mark.asyncio
async def test_gateway_removes_leading_minimax_thinking_before_returning_text():
    client = FakeSamagamaClient(
        [
            response(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": (
                                    "<think>Internal reasoning must not be returned.</think>\n\n"
                                    '{"ranked_segment_ids":["s0002","s0001"]}'
                                )
                            },
                        }
                    ]
                },
            )
        ]
    )
    gateway = SamagamaMiniMaxGateway(make_settings(), client=client)

    result = await gateway.generate(
        system_prompt="system",
        user_prompt="user",
        max_tokens=100,
    )

    assert result == '{"ranked_segment_ids":["s0002","s0001"]}'


@pytest.mark.asyncio
async def test_gateway_accepts_json_envelope_with_literal_newline_in_model_content():
    client = FakeSamagamaClient(
        [
            raw_response(
                200,
                '{"choices":[{"finish_reason":"stop","message":{"content":"line one\nline two"}}]}',
            )
        ]
    )
    gateway = SamagamaMiniMaxGateway(make_settings(), client=client)

    result = await gateway.generate(
        system_prompt="system",
        user_prompt="user",
        max_tokens=100,
    )

    assert result == "line one\nline two"


@pytest.mark.asyncio
async def test_gateway_rejects_token_truncated_output():
    client = FakeSamagamaClient(
        [
            response(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {"content": "incomplete"},
                        }
                    ]
                },
            )
        ]
    )
    gateway = SamagamaMiniMaxGateway(make_settings(), client=client)

    with pytest.raises(ModelProviderError):
        await gateway.generate(
            system_prompt="system",
            user_prompt="user",
            max_tokens=10,
        )


@pytest.mark.asyncio
async def test_gateway_maps_rejected_credentials_to_configuration_error():
    client = FakeSamagamaClient([response(401, {"error": "unauthorized"})])
    gateway = SamagamaMiniMaxGateway(make_settings(), client=client)

    with pytest.raises(ModelConfigurationError):
        await gateway.generate(
            system_prompt="system",
            user_prompt="user",
            max_tokens=10,
        )

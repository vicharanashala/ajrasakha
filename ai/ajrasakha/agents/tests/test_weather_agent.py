"""Tests for weather agent classification and tracing."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ajrasakha.agents.weather_agent import classify_weather_query


@pytest.mark.asyncio
async def test_classify_weather_query_traces_gemma_response(caplog):
    import logging

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "forecast"}}],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

    with caplog.at_level(logging.INFO, logger="ajrasakha.agents.thread_trace"):
        with patch("ajrasakha.agents.weather_agent.httpx.AsyncClient", return_value=mock_client):
            data_type = await classify_weather_query("What is the weather tomorrow?")

    assert data_type == "forecast"
    assert "llm_weather_classifier_request" in caplog.text
    assert "llm_weather_classifier_response" in caplog.text
    assert "gemma" in caplog.text


@pytest.mark.asyncio
async def test_classify_weather_query_traces_heuristic_fallback(caplog):
    import logging

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value.post = AsyncMock(side_effect=RuntimeError("API down"))

    with caplog.at_level(logging.INFO, logger="ajrasakha.agents.thread_trace"):
        with patch("ajrasakha.agents.weather_agent.httpx.AsyncClient", return_value=mock_client):
            data_type = await classify_weather_query("any rain warnings today?")

    assert data_type == "district_warnings"
    assert "llm_weather_classifier_request" in caplog.text
    assert "llm_weather_classifier_error" in caplog.text
    assert "heuristic_fallback" in caplog.text

"""
LLM Client for Grammar Validator API.

Handles communication with the locally deployed MiniMax model.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv

from models import (
    GrammarCorrection,
    GrammarValidationResponse,
    ValidationError,
)

load_dotenv()

log = logging.getLogger("grammar_validator.llm")

# Configuration
LLM_API_URL = os.getenv(
    "LLM_API_URL",
    ""  # Required: Set your MiniMax API URL
)
LLM_MODEL = os.getenv(
    "LLM_MODEL",
    "MiniMaxAI/MiniMax-M2.7"
)
LLM_API_KEY = os.getenv(
    "LLM_API_KEY",
    ""  # Required: Set your MiniMax API key
)
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))


class GrammarValidatorClientError(Exception):
    """Custom exception for GrammarValidatorClient errors."""
    pass


class GrammarValidatorClient:
    """
    Client for interacting with the MiniMax LLM for grammar validation.
    """

    SYSTEM_PROMPT = """You are a grammar and language validation assistant.
Your task is to validate text for:
1. Grammatical correctness
2. English language compliance (text must be written in English)

For the given text:
- If the text is grammatically correct AND written in English, return is_valid=true with empty suggestions
- If there are issues, return is_valid=false with specific correction suggestions

Response format:
{
  "is_valid": true/false,
  "original_text": "the original text",
  "suggestions": [
    {
      "original": "problematic phrase/word",
      "corrected": "corrected phrase/word",
      "explanation": "brief explanation of the correction"
    }
  ],
  "validation_errors": [
    {
      "error_type": "grammar|spelling|punctuation|language",
      "description": "description of the error",
      "position": "start-end character indices or null"
    }
  ]
}

CRITICAL RULES:
- Respond with ONLY valid JSON. No explanations, no preamble, no text before or after.
- Do not wrap the JSON in markdown code blocks.
- Do not add "Here is the JSON" or any other prefix.
- The response must start with '{' and end with '}'.
- If text contains non-English content, mark it as language error."""

    def __init__(self):
        self.base_url = LLM_API_URL
        self.model = LLM_MODEL
        self.api_key = LLM_API_KEY
        self.timeout = LLM_TIMEOUT_SECONDS
        self.max_tokens = LLM_MAX_TOKENS
        log.info(
            "GrammarValidatorClient initialized with URL: %s, Model: %s",
            self.base_url,
            self.model,
        )

    async def _make_request(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Make a request to the LLM API.

        Args:
            messages: List of message dictionaries with 'role' and 'content'

        Returns:
            Parsed JSON response from the LLM

        Raises:
            GrammarValidatorClientError: If the request fails
        """
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": 0.1,  # Low temperature for consistent validation
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()

                if "choices" not in result or not result["choices"]:
                    raise GrammarValidatorClientError(
                        "Invalid response from LLM: no choices in response"
                    )

                message = result["choices"][0].get("message", {})
                content = message.get("content") or message.get("reasoning") or ""
                if not content:
                    raise GrammarValidatorClientError(
                        "Invalid response from LLM: empty content"
                    )

                # Parse the JSON response
                try:
                    # Try to extract JSON from the response
                    json_str = content.strip()
                    
                    # Try direct parse first
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass
                    
                    # Try markdown code blocks
                    if "```json" in content:
                        json_str = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        json_str = content.split("```")[1].split("```")[0].strip()
                    else:
                        # Try to find JSON object in the text using regex-like approach
                        # Look for first { and last }
                        first_brace = content.find('{')
                        last_brace = content.rfind('}')
                        if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                            json_str = content[first_brace:last_brace + 1]
                    
                    return json.loads(json_str)
                except json.JSONDecodeError as exc:
                    log.error("Failed to parse LLM response as JSON: %s", exc)
                    log.debug("Raw response content: %s", content)
                    raise GrammarValidatorClientError(
                        f"Failed to parse LLM response as JSON: {exc}"
                    ) from exc

        except httpx.HTTPStatusError as exc:
            log.error("HTTP error from LLM: %s", exc)
            raise GrammarValidatorClientError(
                f"HTTP error from LLM: {exc.response.status_code} - {exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            log.error("Request error to LLM: %s", exc)
            raise GrammarValidatorClientError(
                f"Request error to LLM: {exc}"
            ) from exc

    async def validate_grammar(
        self,
        text: str,
        max_suggestions: int = 3,
    ) -> GrammarValidationResponse:
        """
        Validate text for grammar and language correctness.

        Args:
            text: The text to validate
            max_suggestions: Maximum number of suggestions to return

        Returns:
            GrammarValidationResponse with validation results
        """
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f'Validate the following text:\n"""\n{text}\n"""',
            },
        ]

        log.info("Validating text of length %d", len(text))
        result = await self._make_request(messages)

        # Build response
        suggestions = []
        validation_errors = []

        if not result.get("is_valid", True):
            # Parse suggestions
            raw_suggestions = result.get("suggestions", [])
            for sug in raw_suggestions[:max_suggestions]:
                if isinstance(sug, dict):
                    suggestions.append(
                        GrammarCorrection(
                            original=sug.get("original", ""),
                            corrected=sug.get("corrected", ""),
                            explanation=sug.get("explanation", ""),
                        )
                    )

            # Parse validation errors
            raw_errors = result.get("validation_errors", [])
            for err in raw_errors:
                if isinstance(err, dict):
                    validation_errors.append(
                        ValidationError(
                            error_type=err.get("error_type", "unknown"),
                            description=err.get("description", ""),
                            position=err.get("position"),
                        )
                    )

        return GrammarValidationResponse(
            isValid=result.get("is_valid", True),
            originalText=text,
            suggestions=suggestions,
            validationErrors=validation_errors,
        )

    async def check_health(self) -> bool:
        """
        Check if the LLM service is reachable.

        Returns:
            True if the service is reachable, False otherwise
        """
        try:
            messages = [
                {"role": "user", "content": "Hello, respond with just 'ok'."}
            ]
            await self._make_request(messages)
            return True
        except Exception as exc:
            log.warning("Health check failed: %s", exc)
            return False
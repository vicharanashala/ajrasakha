"""
Pydantic models for Grammar Validator API.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class GrammarCorrection(BaseModel):
    """A single grammar correction suggestion."""

    original: str = Field(
        ...,
        description="The original problematic phrase or word"
    )
    corrected: str = Field(
        ...,
        description="The corrected phrase or word"
    )
    explanation: str = Field(
        ...,
        description="Brief explanation of the correction"
    )


class ValidationError(BaseModel):
    """Details about a specific validation error found in the text."""

    error_type: str = Field(
        ...,
        description=(
            "Type of error: 'grammar', 'spelling', 'punctuation', or 'language'"
        )
    )
    description: str = Field(
        ...,
        description="Description of the error"
    )
    position: Optional[str] = Field(
        default=None,
        description="Character indices indicating position of error (start-end) or null"
    )


class GrammarValidationRequest(BaseModel):
    """Request model for grammar validation."""

    text: str = Field(
        ...,
        description="The text to validate for grammatical correctness and English language compliance"
    )
    maxSuggestions: int = Field(
        default=3,
        description="Maximum number of correction suggestions to return",
        ge=1,
        le=10,
    )


class GrammarValidationResponse(BaseModel):
    """Response model for grammar validation."""

    isValid: bool = Field(
        ...,
        description="Whether the text is grammatically correct and written in English"
    )
    originalText: str = Field(
        ...,
        description="The original input text"
    )
    suggestions: List[GrammarCorrection] = Field(
        default_factory=list,
        description="List of correction suggestions when text is not valid"
    )
    validationErrors: List[ValidationError] = Field(
        default_factory=list,
        description="Detailed list of grammar/language issues found"
    )
"""Reporter package — turns raw per-case scores into a Language Quality Matrix.

Exposes :class:`LanguageQualityMatrix` for tabular outputs (CSV,
Markdown, JSON) and :func:`generate_recommendations` for the
human-readable roll-up that gets pushed to the AI team.
"""
from .language_quality_matrix import (  # noqa: F401
    LanguageQualityMatrix,
    build_matrix,
)
from .recommendations import (  # noqa: F401
    generate_recommendations,
    format_recommendations_markdown,
)

__all__ = [
    "LanguageQualityMatrix",
    "build_matrix",
    "generate_recommendations",
    "format_recommendations_markdown",
]
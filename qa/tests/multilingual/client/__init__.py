"""AjraSakha client package.

Exposes :class:`AjraSakhaClient` — the WhatsApp-compatible transport
that submits a localised farmer query and returns the
:class:`AjraSakhaResponse` (text + GDB ids + timing).
"""
from .ajrasakha_client import (  # noqa: F401
    AjraSakhaClient,
    AjraSakhaResponse,
    MockAjraSakhaClient,
    RealAjraSakhaClient,
    default_client,
)
from .whatsapp_client import (  # noqa: F401
    WhatsAppTestClient,
    WhatsAppConfig,
)

__all__ = [
    "AjraSakhaClient",
    "AjraSakhaResponse",
    "MockAjraSakhaClient",
    "RealAjraSakhaClient",
    "WhatsAppTestClient",
    "WhatsAppConfig",
    "default_client",
]

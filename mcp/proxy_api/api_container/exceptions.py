"""
Custom exceptions and exception handlers for the proxy API.
"""
from fastapi import Request
from fastapi.responses import JSONResponse


class ProxyException(Exception):
    """Base exception for proxy errors."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class UpstreamConnectionError(ProxyException):
    """Failed to connect to upstream server."""
    def __init__(self, message: str = "Upstream connection failed"):
        super().__init__(message, status_code=502)


class UpstreamError(ProxyException):
    """Generic upstream error."""
    def __init__(self, message: str):
        super().__init__(f"Upstream error: {message}", status_code=502)


class VisionAPIError(ProxyException):
    """Vision API call failed."""
    def __init__(self, message: str):
        super().__init__(f"Vision API error: {message}", status_code=500)


class TranslationError(ProxyException):
    """Translation service failed."""
    def __init__(self, message: str):
        super().__init__(f"Translation error: {message}", status_code=500)


class IntentClassificationError(ProxyException):
    """Intent classification failed."""
    def __init__(self, message: str):
        super().__init__(f"Intent classification error: {message}", status_code=500)


# FastAPI exception handlers
async def proxy_exception_handler(request: Request, exc: ProxyException) -> JSONResponse:
    """Handle ProxyException and return appropriate JSON response."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message}
    )


def register_exception_handlers(app):
    """Register all custom exception handlers with the FastAPI app."""
    app.add_exception_handler(ProxyException, proxy_exception_handler)

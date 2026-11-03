from pydantic import BaseModel


class ClassifyRequest(BaseModel):
    question: str


class ClassifyResponse(BaseModel):
    # Plain snake_case, not CamelModel - the task specifies these exact
    # field names (is_agriculture, disclaimer) as the wire contract.
    is_agriculture: bool
    disclaimer: str


class LLMUnavailableError(Exception):
    """Raised when the MiniMax call itself cannot complete (network error,
    timeout, bad response shape) - callers must treat this as a failure,
    never as a default classification."""

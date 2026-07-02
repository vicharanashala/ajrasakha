"""
Utility functions for the proxy API.
"""
import json
from typing import Optional, List, Dict, Any, TypeVar, Generic, Callable, Union, Tuple
from dataclasses import dataclass

# ============================================================
# Result Type (Either Monad Pattern)
# ============================================================

T = TypeVar('T')
E = TypeVar('E')


@dataclass
class Success(Generic[T]):
    """Represents a successful result."""
    value: T
    
    def is_success(self) -> bool:
        return True
    
    def is_failure(self) -> bool:
        return False
    
    def map(self, func: Callable[[T], Any]) -> 'Union[Success, Failure]':
        """Apply function to the value if successful."""
        try:
            return Success(func(self.value))
        except Exception as e:
            return Failure(str(e))
    
    def flat_map(self, func: Callable[[T], 'Union[Success, Failure]']) -> 'Union[Success, Failure]':
        """Apply function that returns Result."""
        try:
            return func(self.value)
        except Exception as e:
            return Failure(str(e))
    
    def get_or_else(self, default: T) -> T:
        """Return value or default."""
        return self.value
    
    def get_or_raise(self) -> T:
        """Return value or raise exception."""
        return self.value


@dataclass
class Failure(Generic[E]):
    """Represents a failed result."""
    error: E
    
    def is_success(self) -> bool:
        return False
    
    def is_failure(self) -> bool:
        return True
    
    def map(self, func: Callable) -> 'Union[Success, Failure]':
        """Return self (no operation on failure)."""
        return self
    
    def flat_map(self, func: Callable) -> 'Union[Success, Failure]':
        """Return self (no operation on failure)."""
        return self
    
    def get_or_else(self, default: Any) -> Any:
        """Return default value."""
        return default
    
    def get_or_raise(self) -> Any:
        """Raise exception with error message."""
        raise ValueError(self.error)


# Result is a type alias for Either pattern
Result = Union[Success, Failure]


def try_result(func: Callable[[], T]) -> Union[Success[T], Failure[str]]:
    """Execute function and wrap result in Success/Failure."""
    try:
        return Success(func())
    except Exception as e:
        return Failure(str(e))


# ============================================================
# JSON Utilities
# ============================================================

def safe_parse_json(data: bytes) -> Optional[Dict[str, Any]]:
    """Safely parse JSON bytes, returning None on failure."""
    try:
        return json.loads(data)
    except Exception:
        return None


def parse_json_result(data: bytes) -> Union[Success[Dict[str, Any]], Failure[str]]:
    """Parse JSON bytes returning Result."""
    try:
        return Success(json.loads(data))
    except json.JSONDecodeError as e:
        return Failure(f"JSON parse error: {e}")
    except Exception as e:
        return Failure(str(e))


# ============================================================
# Content Extraction
# ============================================================

def extract_text_from_content(content) -> str:
    """
    Extracts text from message content which can be a string or a list of blocks.
    
    Args:
        content: Either a string or list of content blocks
        
    Returns:
        Extracted text as a string
        
    Example:
        >>> extract_text_from_content("Hello")
        "Hello"
        >>> extract_text_from_content([{"type": "text", "text": "Hi"}, {"type": "image_url", ...}])
        "Hi"
    """
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        return " ".join(text_parts)
    return ""


# ============================================================
# Message Utilities
# ============================================================

def find_last_user_message(messages: List[Dict[str, Any]]) -> Tuple[int, Optional[Any]]:
    """
    Find the last user message in a list of messages.
    
    Args:
        messages: List of message dictionaries
        
    Returns:
        Tuple of (index, content) where index is -1 if not found
    """
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "user":
            return i, messages[i].get("content")
    return -1, None


def find_last_assistant_message(messages: List[Dict[str, Any]]) -> Optional[str]:
    """
    Find the last non-empty assistant message content.
    
    Args:
        messages: List of message dictionaries
        
    Returns:
        Text content of last assistant message, or None if not found
    """
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "assistant":
            content = messages[i].get("content")
            if content:
                text = extract_text_from_content(content)
                if text.strip():
                    return text
    return None


def get_messages_for_language_detection(messages: List[Dict[str, Any]]) -> str:
    """
    Get combined text from last user and assistant messages for language detection.
    
    Args:
        messages: List of message dictionaries
        
    Returns:
        Combined text from relevant messages
    """
    detection_parts = []
    
    # Add last user message
    _, user_content = find_last_user_message(messages)
    if user_content:
        detection_parts.append(extract_text_from_content(user_content))
    
    # Add last assistant message
    assistant_text = find_last_assistant_message(messages)
    if assistant_text:
        detection_parts.append(assistant_text)
    
    return " ".join(detection_parts)

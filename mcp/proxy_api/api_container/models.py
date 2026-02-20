"""
Pydantic models for request/response structures.
"""
from pydantic import BaseModel
from typing import Optional, List, Union, Dict, Any


class TextBlock(BaseModel):
    """Text content block in a message.
    
    Example:
        {"type": "text", "text": "Hello, how can I help?"}
    """
    type: str = "text"
    text: str


class ImageUrlData(BaseModel):
    """Image URL data within an image block.
    
    Example:
        {"url": "https://example.com/image.jpg"}
    """
    url: str


class ImageBlock(BaseModel):
    """Image content block in a message.
    
    Example:
        {"type": "image_url", "image_url": {"url": "https://..."}}
    """
    type: str = "image_url"
    image_url: ImageUrlData


ContentBlock = Union[TextBlock, ImageBlock, Dict[str, Any]]


class Message(BaseModel):
    """A chat message with role and content.
    
    Content can be:
    - A simple string: "Hello"
    - A list of content blocks: [{"type": "text", "text": "..."}, {"type": "image_url", ...}]
    
    Example:
        {"role": "user", "content": "What is the price of wheat?"}
        {"role": "user", "content": [{"type": "text", "text": "Analyze this"}, {"type": "image_url", ...}]}
    """
    role: str
    content: Union[str, List[ContentBlock]]


class ChatRequest(BaseModel):
    """Chat completion request structure.
    
    Example:
        {
            "messages": [{"role": "user", "content": "Hello"}],
            "tools": [...],
            "stream": true
        }
    """
    messages: List[Message]
    tools: Optional[List[Dict[str, Any]]] = None
    stream: Optional[bool] = False


class VisionPrediction(BaseModel):
    """Response from the vision API.
    
    Example:
        {"class_name": "Rice Leaf Folder", "confidence": 0.95}
    """
    class_name: str
    confidence: float

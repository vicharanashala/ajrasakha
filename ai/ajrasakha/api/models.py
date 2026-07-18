from typing import Literal, Optional, List, Dict, Any

from pydantic import BaseModel


class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    thinking: Optional[Dict[str, Any]] = None  # Extended thinking support
    # Thread GPS / resolved place fields merged into graph state `location` (e.g. latitude, longitude, city, state).
    location: Optional[Dict[str, Any]] = None
    include_feedback_prompt: Optional[bool] = False

    @staticmethod
    def format_with_feedback_prompt(answer_text: str) -> str:
        """Appends interactive post-answer feedback options for WhatsApp / Web loop."""
        feedback_footer = (
            "\n\n---\n"
            "Was this answer helpful to your farming needs?\n"
            "Reply 1 for Yes\n"
            "Reply 2 for No"
        )
        return answer_text + feedback_footer

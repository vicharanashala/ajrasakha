import re
from typing import List, Optional
from pydantic import BaseModel, field_validator
from datetime import datetime


def normalize_text(value: str) -> str:
    if not isinstance(value, str):
        return value
    # 1. Strip leading/trailing whitespace
    value = value.strip()
    # 2. Remove unwanted characters at start/end (keep only word chars, spaces, and hyphens inside)
    value = re.sub(r"^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$", "", value)
    # 3. Normalize case (lowercase)
    return value.lower()


def get_id(value: str):
    return re.sub(r"[^a-zA-Z0-9]", "_", value).lower() or "node"

class ContextRequest(BaseModel):
    context: str

class SimilarityScoreRequest(BaseModel):
    text1: str
    text2: str

class QuestionAnswerResponse(BaseModel):
    question: str
    answer: str
    agri_specialist: str


class Message(BaseModel):
    role: str
    content: str
    thinking: Optional[str] = None  # For "think" mode responses
    tool_calls: Optional[List] = None  # List of tool names to use


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "mock-gpt-model"
    messages: List[Message]
    stream: Optional[bool] = False
    tools: List


class StreamingMessageChunk(BaseModel):
    model: str
    message: Message
    done: bool = False
    created_at: datetime = datetime.now()


class QuestionAnswerPairMetaData(BaseModel):
    similarity_score: float | None
    agri_specialist: str
    sources: str
    state: str
    crop: str


class KnowledgeGraphNodes(BaseModel):
    start_node: str
    relation_node: str
    end_node: str
    score: Optional[float] = None
    
    @field_validator("start_node", "relation_node", "end_node", mode="before")
    def normalize_fields(cls, v):
        return normalize_text(v)



class ContextQuestionAnswerPair(BaseModel):
    question: str
    answer: str
    meta_data: QuestionAnswerPairMetaData


class POPMetaData(BaseModel):
    similarity_score: float | None
    page_no: int
    source: str
    topics: List[str]


class ContextPOP(BaseModel):
    text: str
    meta_data: POPMetaData


class ThinkingResponseChunk:
    def __init__(self, message: str, model: str = "ajrasakha", tools_calls: List = None):
        self.model = model
        self.message = message
        self.tools_calls = tools_calls if tools_calls else []

        self.chunk = StreamingMessageChunk(
            model=model,
            message=Message(role="assistant", content="", thinking=self.message, tools_calls=self.tools_calls),
            done=False,
        )

    def encode(self, encoding: str = "utf-8", errors: str = "strict"):
        return str(self).encode(encoding=encoding, errors=errors)

    def __str__(self):
        return self.chunk.model_dump_json(indent=0).replace("\n", " ") + "\n"


class ContentResponseChunk:
    def __init__(
        self, message: str, final_chunk: bool = False, model: str = "ajrasakha", tool_calls: List = None
    ):
        self.chunk = StreamingMessageChunk(
            model=model,
            message=Message(role="assistant", content=message, thinking="", tool_calls=tool_calls),
            done=final_chunk,
        )

    @property
    def text(self):
        return self.chunk.message.content

    def encode(self, encoding: str = "utf-8", errors: str = "strict"):
        return str(self).encode(encoding=encoding, errors=errors)

    def __str__(self):
        return self.chunk.model_dump_json(indent=0).replace("\n", " ") + "\n"

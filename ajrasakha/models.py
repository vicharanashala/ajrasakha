from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


class Message(BaseModel):
    role: str
    content: str
    thinking: Optional[str] = None  # For "think" mode responses

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "mock-gpt-model"
    messages: List[Message]
    stream: Optional[bool] = False
    
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
    def __init__(self, message: str, model: str ="ajrasakha"):
        self.model = model
        self.message = message
        
        self.chunk = StreamingMessageChunk(
            model=model, 
            message=Message(
                role="assistant", 
                content="", 
                thinking=self.message
            ),
            done=False
        )
        
    def encode(self, encoding: str= "utf-8", errors: str = "strict"):
        return str(self).encode(encoding=encoding,errors=errors)
    
    def __str__(self):
        return self.chunk.model_dump_json(indent=0).replace('\n', ' ')+'\n'

class ContentResponseChunk:
    def __init__(self, message: str, final_chunk: bool=False, model: str ="ajrasakha"):
        self.chunk = StreamingMessageChunk(
            model=model, 
            message=Message(
                role="assistant", 
                content=message, 
                thinking=""
            ),
            done=final_chunk
        )
        
    def encode(self, encoding: str= "utf-8", errors: str = "strict"):
        return str(self).encode(encoding=encoding,errors=errors)
    
    def __str__(self):
        return self.chunk.model_dump_json(indent=0).replace('\n', ' ')+'\n'

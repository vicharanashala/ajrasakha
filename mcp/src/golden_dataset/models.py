from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class ContextQuestionAnswerPair:
    question: str
    answer: str
    meta_data: Dict[str, Any]


@dataclass
class ContextPOP:
    content: str
    meta_data: Dict[str, Any]
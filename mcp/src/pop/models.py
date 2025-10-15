from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class ContextPOP:
    content: str
    meta_data: Dict[str, Any]
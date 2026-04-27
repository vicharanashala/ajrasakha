from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class Source(BaseModel):
    agri_expert: Optional[str] = Field(
        None,
        description="First name of the agri specialist who authored the answer"
    )
    question_text: Optional[str] = Field(
        None,
        description="The original matched question from the database"
    )
    source_name: Optional[str] = Field(
        None,
        description="Name of the document or dataset (second element of sources list if it is a string)"
    )
    link: Optional[str] = Field(
        None,
        description="URL or file link (first element of sources list if it is a string, or url/link key if dict)"
    )
    page_number: Optional[int] = Field(
        None,
        description="Page number if the source is a PDF document"
    )
    similarity_score: Optional[float] = Field(
        None,
        description="Similarity score from vector search, higher means more relevant"
    )
    source_type: str = Field(
        description="One of: reviewer_dataset, golden_dataset, package_of_practices"
    )


class GdbAnswer(BaseModel):
    """Full detailed answer from the GDB knowledge base agent."""
    answer: str = Field(
        description="Full structured answer following the appropriate format for the query type"
    )
    short_answer: str = Field(
        description="Farmer-friendly short answer: 3-5 crisp bullet points or 2-3 short sentences. Plain language, no jargon, max 100 words."
    )
    sources: List[Source] = Field(
        description="Sources ranked by similarity_score descending. Each entry maps to one QuestionAnswerPair."
    )


class RouterSchema(BaseModel):
    intents: List[str] = Field(
        description="Applicable intents from: 'market' (prices), 'gdb' (diseases/general), 'weather' (rain/forecast), 'soil' (fertilizers/nutrients)."
    )
    entities: dict = Field(
        description="Extracted context as a dict, e.g. {'crop': 'wheat', 'state': 'Haryana'}. Empty dict if nothing found."
    )

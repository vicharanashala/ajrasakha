from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    query: str = Field(..., description="User agricultural query")
    state: str = Field(..., description="Indian state name")
    crop: str = Field(..., description="Crop name for the state")


class POPMetaData(BaseModel):
    similarity_score: float | None = None
    page_no: Optional[int] = None
    source: str = ""
    source_name: Optional[str] = None
    doc_id: Optional[str] = None
    chunk_id: Optional[str] = None
    doc_origin: Optional[str] = None
    verified_by: Optional[str] = None


class ContextPOP(BaseModel):
    text: str
    meta_data: POPMetaData


class RestrictedChemicalFlag(BaseModel):
    chemical_id: str
    chemical_name: str
    allowed_usage: str = ""
    restriction_text: str = ""


class POPComplianceNotice(BaseModel):
    message: str
    restricted_chemicals: List[RestrictedChemicalFlag] = Field(default_factory=list)
    blocked_non_restricted_chemicals: List[str] = Field(default_factory=list)
    blocked_message: Optional[str] = None


class POPContextResponse(BaseModel):
    contexts: List[ContextPOP] = Field(default_factory=list)
    compliance_notice: Optional[POPComplianceNotice] = None
    response_guidance: str = ""


class SourceReference(BaseModel):
    doc_id: Optional[str] = None
    chunk_id: Optional[str] = None
    source_name: Optional[str] = None
    source_url: str = ""
    page_no: Optional[int] = None
    doc_origin: Optional[str] = None
    verified_by: Optional[str] = None


class AnsGenPopResponse(BaseModel):
    answer: str
    contexts: List[ContextPOP] = Field(default_factory=list)
    sources: List[SourceReference] = Field(default_factory=list)
    similarity_scores: List[float] = Field(default_factory=list)

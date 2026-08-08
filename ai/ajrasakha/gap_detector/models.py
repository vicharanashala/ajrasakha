"""Data models for GDB Coverage Debt Radar."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GapSignalModel(BaseModel):
    disclaimerIssued: bool = True
    trigger: str = "empty_gdb"
    gdbTopScore: float = 0.0
    gdbCandidateIds: List[str] = Field(default_factory=list)
    detectedAt: Optional[str] = None


class GapClusterItem(BaseModel):
    clusterId: str
    crop: str
    state: str
    domain: str
    affectedFarmersCount: int
    rawQuestionsCount: int
    weekGrowthPercent: float
    coverageDebtScore: float
    diagnosis: str  # missing_knowledge | retrieval_failure | language_alias_gap | missing_context | safety_escalation
    diagnosisLabel: str
    recommendedAction: str
    fourWeekTrend: List[int] = Field(default_factory=list)
    representativeQuestions: List[str] = Field(default_factory=list)
    anonymizedFarmerHashes: List[str] = Field(default_factory=list)


class CoverageDebtRadarSummary(BaseModel):
    week: str
    totalDisclaimers: int
    activeClustersCount: int
    weekOverWeekGrowth: float
    coverageDebtScore: float
    disclaimerDeflectionImpact: float
    topGapCluster: Optional[GapClusterItem] = None
    clusters: List[GapClusterItem] = Field(default_factory=list)

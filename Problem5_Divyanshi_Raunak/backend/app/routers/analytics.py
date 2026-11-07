from fastapi import APIRouter
from helpers.feedback_service import (
    get_analytics_overview,
    get_domain_analytics,
    get_state_analytics,
    get_root_cause_analytics
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/overview")
def overview():
    return get_analytics_overview()

@router.get("/domains")
def domains():
    return get_domain_analytics()

@router.get("/states")
def states():
    return get_state_analytics()

@router.get("/root-causes")
def root_causes():
    return get_root_cause_analytics()

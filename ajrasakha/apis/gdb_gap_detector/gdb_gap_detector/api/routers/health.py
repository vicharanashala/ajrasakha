from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Service health check endpoint."""
    return {"status": "ok", "service": "gdb_gap_detector"}

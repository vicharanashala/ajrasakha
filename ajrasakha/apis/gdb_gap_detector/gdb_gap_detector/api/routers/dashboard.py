from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Dashboard"])

# Point to templates/dashboard.html
DASHBOARD_PATH = Path(__file__).parents[2] / "templates" / "dashboard.html"


@router.get("/", response_class=HTMLResponse)
@router.get("/dashboard", response_class=HTMLResponse)
def get_dashboard() -> str:
    """Serve single-page interactive HTML Dashboard."""
    if DASHBOARD_PATH.exists():
        return DASHBOARD_PATH.read_text(encoding="utf-8")
    return "<h1>GDB Coverage Gap Detector Dashboard</h1><p>Dashboard HTML template not found.</p>"

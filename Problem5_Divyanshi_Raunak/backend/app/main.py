import sys
from pathlib import Path

# Ensure backend and root directory are in sys.path regardless of execution CWD
_CURRENT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CURRENT_DIR.parent
_ROOT_DIR = _BACKEND_DIR.parent

for _p in [str(_BACKEND_DIR), str(_ROOT_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from app.config import settings
from app.database import init_db, close_db
from app.routers import whatsapp, gdb, analytics, flagged, digest, weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ajrasakha")


from app.scheduler import start_scheduler, shutdown_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Initializing {settings.PROJECT_NAME} v{settings.VERSION}...")
    init_db()
    start_scheduler()
    yield
    shutdown_scheduler()
    close_db()
    logger.info("Shutdown complete.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Farmer Answer Feedback Loop & Automated Quality Pipeline for AjraSakha (ANNAM.AI / IIT Ropar)",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(whatsapp.router, prefix=settings.API_V1_PREFIX)
app.include_router(gdb.router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics.router, prefix=settings.API_V1_PREFIX)
app.include_router(flagged.router, prefix=settings.API_V1_PREFIX)
app.include_router(digest.router, prefix=settings.API_V1_PREFIX)
app.include_router(weather.router, prefix=settings.API_V1_PREFIX)

@app.get("/api/health")
@app.get("/health")
def health_check():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs",
        "supported_features": [
            "WhatsApp Two-Turn Feedback State Machine",
            "1-Tap Quick-Reply Buttons",
            "Multimodal Indic Voice Note Processing",
            "Smart Agro-Chrono Scheduling (Evening Leisure)",
            "Automated Statistical Flagging (<60%, N>=10)",
            "Weekly Agri Intelligence Digest",
            "IMD Agro-Meteorological Risk Matrix"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, app_dir=str(_BACKEND_DIR))


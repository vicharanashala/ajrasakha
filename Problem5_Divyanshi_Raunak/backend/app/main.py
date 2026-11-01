from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from app.config import settings
from app.database import init_db, close_db
from app.routers import whatsapp, gdb, analytics, flagged, digest, weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ajrasakha")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Initializing {settings.PROJECT_NAME} v{settings.VERSION}...")
    init_db()
    yield
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

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "ONLINE",
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

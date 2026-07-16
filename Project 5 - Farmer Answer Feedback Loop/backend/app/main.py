"""
FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import connect_db, disconnect_db
from app.routes import webhook, feedback, analytics, flagging, digest
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="Farmer Feedback System API",
    description=(
        "Backend for the ACE Farmer Feedback System. "
        "Captures farmer 👍/👎 responses via WhatsApp, "
        "aggregates helpfulness metrics per GDB entry, "
        "auto-flags low-rated entries for re-review, "
        "and generates GROQ-powered weekly digests."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allows the React dashboard to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await connect_db()
    logger.info("Farmer Feedback System API started ✅")


@app.on_event("shutdown")
async def shutdown():
    await disconnect_db()
    logger.info("Farmer Feedback System API stopped")


# Include all routers
app.include_router(webhook.router)
app.include_router(feedback.router)
app.include_router(analytics.router)
app.include_router(flagging.router)
app.include_router(digest.router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Farmer Feedback System API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}

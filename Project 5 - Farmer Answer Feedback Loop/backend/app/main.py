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
    # Restore any persisted flagging settings from DB
    from app.database import get_db
    db = get_db()
    saved = await db.flagging_settings.find_one({"_id": "global"})
    if saved:
        if "feedback_threshold" in saved:
            flagging.router  # ensure module loaded
            import app.routes.flagging as _fl
            _fl._threshold_override = saved["feedback_threshold"]
        if "min_responses_to_flag" in saved:
            import app.routes.flagging as _fl
            _fl._min_responses_override = saved["min_responses_to_flag"]
        logger.info(f"Restored flagging settings from DB: threshold={saved.get('feedback_threshold')}, min_resp={saved.get('min_responses_to_flag')}")
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

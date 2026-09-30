from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gdb_gap_detector.api.routers import (
    dashboard,
    export,
    gaps,
    health,
    heatmap,
    scheduler,
)
from gdb_gap_detector.core import MongoDB

logger = logging.getLogger("gdb_gap_detector.api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI Lifespan Context Manager for DB connection."""
    logger.info("Initializing GDB Gap Detector FastAPI application...")
    MongoDB.connect()
    yield
    logger.info("Shutting down GDB Gap Detector FastAPI application...")
    MongoDB.disconnect()


app = FastAPI(
    title="GDB Coverage Gap Detector Microservice",
    description="Standalone Python FastAPI microservice for agricultural question clustering and GDB gap detection.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for web frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Router Handlers
app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(gaps.router)
app.include_router(heatmap.router)
app.include_router(export.router)
app.include_router(scheduler.router)

from .feedback import router as feedback_router
from .dashboard import router as dashboard_router
from .flagged import router as flagged_router
from .weekly_digest import router as weekly_digest_router
from .chat import router as chat_router

__all__ = [feedback_router, dashboard_router, flagged_router, weekly_digest_router, chat_router]
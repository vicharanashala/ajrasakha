"""Long-term memory loading from LangGraph store."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

from ajrasakha.agents.config import resolve_thread_id, resolve_user_id


def _coerce_store_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for k in ("summary", "text", "content", "value"):
            if k in value and isinstance(value[k], str):
                return value[k].strip()
    return ""


async def load_long_term_summary(store: BaseStore | None, config: RunnableConfig) -> str:
    if store is None:
        return ""

    thread_id = resolve_thread_id(config)
    user_id = resolve_user_id(config)

    namespace = ("farmer_profiles", str(user_id or "unknown_user"))
    summary_parts: list[str] = []

    if thread_id:
        maybe_get = getattr(store, "aget", None)
        if callable(maybe_get):
            item = await maybe_get(namespace, str(thread_id))  # type: ignore
            text = _coerce_store_text(getattr(item, "value", item))
            if text:
                summary_parts.append(text)
        else:
            maybe_sync_get = getattr(store, "get", None)
            if callable(maybe_sync_get):
                item = maybe_sync_get(namespace, str(thread_id))
                text = _coerce_store_text(getattr(item, "value", item))
                if text:
                    summary_parts.append(text)

    if not summary_parts:
        maybe_search = getattr(store, "asearch", None)
        if callable(maybe_search):
            results = await maybe_search(namespace, limit=5)  # type: ignore
        else:
            maybe_sync_search = getattr(store, "search", None)
            results = maybe_sync_search(namespace, limit=5) if callable(maybe_sync_search) else []
        for item in results or []:
            text = _coerce_store_text(getattr(item, "value", item))
            if text:
                summary_parts.append(text)

    return "\n".join(summary_parts[:3]).strip()

import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from typing import Optional, Dict, Any, List
from shared.mongodb import get_db


class GDBService:
    def __init__(self):
        self.db = get_db()

    def get_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        return self.db.gdb_entries.find_one({"_id": entry_id})

    def search_entries(
        self,
        query: str,
        language: Optional[str] = None,
        state: Optional[str] = None,
        domain: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        filter_query = {}

        if language:
            filter_query["language"] = language
        if state:
            filter_query["state"] = state
        if domain:
            filter_query["domain"] = domain

        if query:
            filter_query["$or"] = [
                {"question": {"$regex": query, "$options": "i"}},
                {"keywords": {"$regex": query, "$options": "i"}}
            ]

        return list(self.db.gdb_entries.find(filter_query).limit(limit))

    def get_entry_content(self, entry_id: str) -> Optional[str]:
        entry = self.get_entry(entry_id)
        if entry:
            return entry.get("answer", "")
        return None

    def get_entry_metadata(self, entry_id: str) -> Optional[Dict[str, Any]]:
        entry = self.get_entry(entry_id)
        if entry:
            return {
                "domain": entry.get("domain"),
                "language": entry.get("language"),
                "state": entry.get("state"),
                "question": entry.get("question")
            }
        return None
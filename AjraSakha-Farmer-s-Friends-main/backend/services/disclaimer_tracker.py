#!/usr/bin/env python3
"""
Disclaimer Tracking Service
Logs questions that triggered the 2-hour disclaimer (couldn't be answered)
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from typing import Optional, Dict, List
from shared.mongodb import get_db
import hashlib


class DisclaimerTracker:
    """Tracks questions that trigger the 2-hour disclaimer"""

    def __init__(self):
        self.db = get_db()

    def log_disclaimer(
        self,
        query: str,
        farmer_id: str,
        source: str = "unknown",
        language: str = "English",
        state: Optional[str] = None,
        domain: Optional[str] = None,
        confidence: float = 0.0,
        best_match_id: Optional[str] = None,
        best_match_score: Optional[float] = None,
        metadata: Optional[Dict] = None
    ) -> str:
        """Log a disclaimer-triggered query"""

        # Generate query hash for clustering
        query_hash = hashlib.md5(query.lower().strip().encode()).hexdigest()

        doc = {
            "query": query,
            "query_hash": query_hash,
            "query_normalized": query.lower().strip(),
            "farmer_id": farmer_id,
            "source": source,
            "language": language,
            "state": state,
            "domain": domain,
            "confidence": confidence,
            "best_match_id": best_match_id,
            "best_match_score": best_match_score,
            "timestamp": datetime.utcnow(),
            "status": "unanswered",
            "metadata": metadata or {}
        }

        result = self.db.disclaimer_logs.insert_one(doc)
        return str(result.inserted_id)

    def get_recent_disclaimers(
        self,
        days: int = 7,
        limit: int = 1000
    ) -> List[Dict]:
        """Get disclaimers from the last N days"""

        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)

        cursor = self.db.disclaimer_logs.find({
            "timestamp": {"$gte": cutoff}
        }).sort("timestamp", -1).limit(limit)

        return list(cursor)

    def get_disclaimers_by_state(
        self,
        state: str,
        days: int = 30
    ) -> List[Dict]:
        """Get disclaimers for a specific state"""

        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)

        return list(self.db.disclaimer_logs.find({
            "state": state,
            "timestamp": {"$gte": cutoff}
        }))

    def get_stats(self) -> Dict:
        """Get overall disclaimer statistics"""

        total = self.db.disclaimer_logs.count_documents({})

        # By source
        pipeline = [
            {"$group": {"_id": "$source", "count": {"$sum": 1}}}
        ]
        by_source = {r['_id'] or 'unknown': r['count'] for r in self.db.disclaimer_logs.aggregate(pipeline)}

        # By domain
        pipeline = [
            {"$match": {"domain": {"$ne": None}}},
            {"$group": {"_id": "$domain", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        by_domain = [
            {"domain": r['_id'], "count": r['count']}
            for r in self.db.disclaimer_logs.aggregate(pipeline)
        ]

        # By state
        pipeline = [
            {"$match": {"state": {"$ne": None}}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        by_state = [
            {"state": r['_id'], "count": r['count']}
            for r in self.db.disclaimer_logs.aggregate(pipeline)
        ]

        # Last 7 days
        from datetime import timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent = self.db.disclaimer_logs.count_documents({
            "timestamp": {"$gte": week_ago}
        })

        # Last 30 days
        month_ago = datetime.utcnow() - timedelta(days=30)
        monthly = self.db.disclaimer_logs.count_documents({
            "timestamp": {"$gte": month_ago}
        })

        return {
            "total_disclaimers": total,
            "last_7_days": recent,
            "last_30_days": monthly,
            "by_source": by_source,
            "by_domain": by_domain,
            "by_state": by_state
        }


# Singleton
tracker = DisclaimerTracker()

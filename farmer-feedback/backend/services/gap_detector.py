#!/usr/bin/env python3
"""
GDB Coverage Gap Detector
Analyzes disclaimer logs weekly, clusters them, identifies gaps
Generates reports for agri and outreach teams
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import List, Dict, Optional
from shared.mongodb import get_db
from services.disclaimer_tracker import tracker
from services.query_clusterer import clusterer


class GapDetector:
    """Detect GDB coverage gaps from disclaimer logs"""

    def __init__(self):
        self.db = get_db()

    def generate_weekly_report(
        self,
        days: int = 7,
        top_n: int = 20,
        min_cluster_size: int = 2
    ) -> Dict:
        """Generate the weekly GDB gap report"""

        print(f"📊 Generating weekly gap report ({days} days)...")

        # Get all disclaimers from the past N days
        disclaimers = tracker.get_recent_disclaimers(days=days)

        if not disclaimers:
            return {
                "report_type": "weekly_gap_report",
                "period_days": days,
                "generated_at": datetime.utcnow(),
                "total_disclaimers": 0,
                "top_gaps": [],
                "coverage_stats": self._calculate_coverage_stats()
            }

        print(f"   Found {len(disclaimers)} disclaimer logs")

        # Cluster queries
        clusters = clusterer.cluster_with_sklearn(
            disclaimers,
            min_cluster_size=min_cluster_size
        )

        print(f"   Found {len(clusters)} clusters")

        # Calculate growth rate (compare with previous week)
        prev_week = tracker.get_recent_disclaimers(days=days * 2)
        prev_week = [d for d in prev_week if d not in disclaimers]

        prev_clusters = clusterer.cluster_with_sklearn(
            prev_week,
            min_cluster_size=min_cluster_size
        )

        # Score clusters
        scored_clusters = []
        for cluster in clusters:
            growth_rate = self._calculate_growth_rate(cluster, prev_clusters)

            # Priority score = size * growth_factor * severity_factor
            priority_score = self._calculate_priority_score(cluster, growth_rate)

            scored_clusters.append({
                "cluster_id": cluster["cluster_id"],
                "cluster_name": cluster["cluster_name"],
                "size": cluster["size"],
                "keywords": cluster["keywords"],
                "sample_queries": cluster["queries"][:3],
                "domains": cluster.get("domains", []),
                "states": cluster.get("states", []),
                "growth_rate": growth_rate,
                "priority_score": priority_score,
                "first_seen": cluster.get("first_seen"),
                "last_seen": cluster.get("last_seen"),
                "farmer_demand": cluster["size"],
                "recommended_action": self._get_recommendation(cluster, growth_rate),
                "priority_level": self._get_priority_level(priority_score)
            })

        # Sort by priority score
        scored_clusters.sort(key=lambda x: x["priority_score"], reverse=True)
        top_gaps = scored_clusters[:top_n]

        # Coverage stats
        coverage_stats = self._calculate_coverage_stats()

        # Outreach recommendations
        outreach_recs = self._generate_outreach_recommendations(disclaimers)

        report = {
            "report_type": "weekly_gap_report",
            "period_days": days,
            "start_date": datetime.utcnow() - timedelta(days=days),
            "end_date": datetime.utcnow(),
            "generated_at": datetime.utcnow(),
            "total_disclaimers": len(disclaimers),
            "unique_queries": len(set(d.get('query_normalized') for d in disclaimers)),
            "clusters_found": len(clusters),
            "top_gaps": top_gaps,
            "coverage_stats": coverage_stats,
            "outreach_recommendations": outreach_recs,
            "domains_with_gaps": self._get_domains_with_gaps(disclaimers),
            "states_with_gaps": self._get_states_with_gaps(disclaimers)
        }

        # Save report to DB
        self.db.gap_reports.insert_one(report)

        print(f"   Report saved. Top {len(top_gaps)} gaps identified")
        return report

    def _calculate_priority_score(self, cluster: Dict, growth_rate: float) -> float:
        """Calculate priority score for a cluster"""
        base_score = cluster['size']

        # Growth factor: more weight if growing
        growth_factor = 1.0 + max(0, growth_rate) * 0.5

        # Multi-domain factor: gaps spanning multiple domains are critical
        domain_factor = 1.0 + len(cluster.get('domains', [])) * 0.1

        # Multi-state factor: gaps affecting multiple states
        state_factor = 1.0 + len(cluster.get('states', [])) * 0.05

        return round(base_score * growth_factor * domain_factor * state_factor, 2)

    def _calculate_growth_rate(self, current_cluster: Dict, prev_clusters: List[Dict]) -> float:
        """Calculate growth rate by comparing with previous period"""
        if not prev_clusters:
            return 0.0

        # Try to find similar cluster in previous period
        current_keywords = set(current_cluster.get('keywords', []))
        current_name = current_cluster.get('cluster_name', '')

        for prev_cluster in prev_clusters:
            prev_keywords = set(prev_cluster.get('keywords', []))

            # Check keyword overlap
            if current_keywords and prev_keywords:
                overlap = len(current_keywords & prev_keywords)
                if overlap >= 1:
                    # Growth rate = (current - prev) / prev
                    prev_size = prev_cluster['size']
                    growth = (current_cluster['size'] - prev_size) / max(prev_size, 1)
                    return round(growth, 2)

        # New cluster (not in previous period)
        return 1.0  # 100% growth as it's new

    def _get_recommendation(self, cluster: Dict, growth_rate: float) -> str:
        """Get action recommendation for a gap"""
        if cluster['size'] >= 10 and growth_rate > 0.2:
            return "URGENT - Add to reviewer pipeline immediately. High demand and growing."
        elif cluster['size'] >= 5:
            return "HIGH - Schedule for expert review this week."
        elif growth_rate > 0.5:
            return "MEDIUM - Monitor, may grow rapidly."
        else:
            return "LOW - Add to backlog for periodic review."

    def _get_priority_level(self, score: float) -> str:
        """Get priority level from score"""
        if score >= 15:
            return "CRITICAL"
        elif score >= 10:
            return "HIGH"
        elif score >= 5:
            return "MEDIUM"
        return "LOW"

    def _calculate_coverage_stats(self) -> Dict:
        """Calculate coverage stats by crop-state-domain combination"""

        # Get all GDB entries
        gdb_entries = list(self.db.gdb_entries.find({"status": {"$ne": "rejected"}}))

        # Get all disclaimers
        all_disclaimers = list(self.db.disclaimer_logs.find())

        # Coverage matrix: domain x state
        coverage = {}
        disclaimer_counts = {}

        for entry in gdb_entries:
            domain = entry.get('domain', 'Unknown')
            state = entry.get('state', 'All')
            key = f"{domain}|{state}"
            coverage[key] = coverage.get(key, 0) + 1

        for disc in all_disclaimers:
            domain = disc.get('domain', 'Unknown') or 'Unknown'
            state = disc.get('state', 'All') or 'All'
            key = f"{domain}|{state}"
            disclaimer_counts[key] = disclaimer_counts.get(key, 0) + 1

        # Build heatmap data
        heatmap_data = []
        all_keys = set(coverage.keys()) | set(disclaimer_counts.keys())

        for key in all_keys:
            domain, state = key.split('|')
            gdb_count = coverage.get(key, 0)
            disc_count = disclaimer_counts.get(key, 0)

            # Coverage score: 0-100 (higher = better coverage)
            if gdb_count == 0 and disc_count == 0:
                coverage_score = 50  # No data
            elif disc_count == 0:
                coverage_score = 100  # Full coverage
            else:
                ratio = gdb_count / max(gdb_count + disc_count, 1)
                coverage_score = round(ratio * 100, 1)

            heatmap_data.append({
                "domain": domain,
                "state": state,
                "gdb_count": gdb_count,
                "disclaimer_count": disc_count,
                "coverage_score": coverage_score,
                "status": self._get_heatmap_status(coverage_score)
            })

        return {
            "heatmap": heatmap_data,
            "total_combinations": len(heatmap_data),
            "covered": len([h for h in heatmap_data if h['coverage_score'] >= 70]),
            "partial": len([h for h in heatmap_data if 30 <= h['coverage_score'] < 70]),
            "gaps": len([h for h in heatmap_data if h['coverage_score'] < 30])
        }

    def _get_heatmap_status(self, score: float) -> str:
        if score >= 70:
            return "good"
        elif score >= 30:
            return "partial"
        return "gap"

    def _get_domains_with_gaps(self, disclaimers: List[Dict]) -> List[Dict]:
        """Get domains with most gaps"""
        from collections import Counter
        domain_counts = Counter(d.get('domain') for d in disclaimers if d.get('domain'))
        return [
            {"domain": d, "gap_count": c}
            for d, c in domain_counts.most_common(10)
        ]

    def _get_states_with_gaps(self, disclaimers: List[Dict]) -> List[Dict]:
        """Get states with most gaps"""
        from collections import Counter
        state_counts = Counter(d.get('state') for d in disclaimers if d.get('state'))
        return [
            {"state": s, "gap_count": c}
            for s, c in state_counts.most_common(10)
        ]

    def _generate_outreach_recommendations(self, disclaimers: List[Dict]) -> List[Dict]:
        """Generate outreach recommendations for the field team"""
        from collections import Counter

        # Count state+domain combinations
        combos = Counter()
        for d in disclaimers:
            state = d.get('state')
            domain = d.get('domain')
            if state and domain:
                combos[(state, domain)] += 1

        recommendations = []
        for (state, domain), count in combos.most_common(10):
            recommendations.append({
                "target_state": state,
                "focus_domain": domain,
                "gap_questions": count,
                "recommendation": f"Conduct field visits in {state} focusing on {domain}. Collect expert Q&A for top {count} unanswered questions.",
                "priority": "HIGH" if count >= 5 else "MEDIUM"
            })

        return recommendations

    def get_latest_report(self) -> Optional[Dict]:
        """Get the most recent gap report"""
        report = self.db.gap_reports.find_one(
            {},
            sort=[("generated_at", -1)]
        )
        if report:
            report['_id'] = str(report['_id'])
        return report

    def get_all_reports(self, limit: int = 10) -> List[Dict]:
        """Get historical reports"""
        reports = list(self.db.gap_reports.find({}).sort("generated_at", -1).limit(limit))
        for r in reports:
            r['_id'] = str(r['_id'])
        return reports


detector = GapDetector()
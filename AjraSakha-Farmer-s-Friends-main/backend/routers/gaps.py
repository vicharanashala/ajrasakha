import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel
from services.disclaimer_tracker import tracker
from services.gap_detector import detector
from shared.mongodb import get_db

router = APIRouter()


class LogDisclaimerRequest(BaseModel):
    query: str
    farmer_id: str
    source: str = "unknown"
    language: str = "English"
    state: Optional[str] = None
    domain: Optional[str] = None
    confidence: float = 0.0
    best_match_id: Optional[str] = None
    best_match_score: Optional[float] = None


@router.post("/disclaimers/log")
def log_disclaimer(request: LogDisclaimerRequest):
    """Log a disclaimer-triggered query"""
    log_id = tracker.log_disclaimer(
        query=request.query,
        farmer_id=request.farmer_id,
        source=request.source,
        language=request.language,
        state=request.state,
        domain=request.domain,
        confidence=request.confidence,
        best_match_id=request.best_match_id,
        best_match_score=request.best_match_score
    )
    return {"success": True, "log_id": log_id}


@router.get("/disclaimers/stats")
def get_disclaimer_stats():
    """Get disclaimer statistics"""
    return tracker.get_stats()


@router.get("/disclaimers/recent")
def get_recent_disclaimers(days: int = 7, limit: int = 100):
    """Get recent disclaimers"""
    disclaimers = tracker.get_recent_disclaimers(days=days, limit=limit)
    return {
        "count": len(disclaimers),
        "disclaimers": [
            {
                "_id": str(d["_id"]),
                "query": d.get("query"),
                "source": d.get("source"),
                "domain": d.get("domain"),
                "state": d.get("state"),
                "language": d.get("language"),
                "farmer_id": d.get("farmer_id"),
                "confidence": d.get("confidence"),
                "best_match_id": d.get("best_match_id"),
                "best_match_score": d.get("best_match_score"),
                "timestamp": d.get("timestamp")
            }
            for d in disclaimers
        ]
    }


@router.get("/gap-report/latest")
def get_latest_gap_report():
    """Get the most recent gap report"""
    report = detector.get_latest_report()
    if not report:
        return {"message": "No gap reports available. Run /gap-report/generate first."}
    return report


@router.get("/gap-report/all")
def get_all_gap_reports(limit: int = 10):
    """Get all gap reports"""
    reports = detector.get_all_reports(limit=limit)
    return {"reports": reports, "count": len(reports)}


@router.post("/gap-report/generate")
def generate_gap_report(days: int = 7, top_n: int = 20):
    """Generate a new gap report"""
    report = detector.generate_weekly_report(days=days, top_n=top_n)

    # Convert ObjectId to string for JSON
    if '_id' in report:
        report['_id'] = str(report['_id'])

    return report


@router.get("/coverage/heatmap")
def get_coverage_heatmap():
    """Get coverage heatmap data"""
    from services.gap_detector import detector
    stats = detector._calculate_coverage_stats()
    return stats


@router.get("/report/download")
def download_gap_report(format: str = "txt"):
    """Download gap report as text or HTML file"""
    from services.gap_detector import detector
    from fastapi import Response
    from datetime import datetime

    report = detector.get_latest_report()
    if not report:
        # Generate one if none exists
        report = detector.generate_weekly_report(days=14, top_n=20)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if format == "html":
        # Generate HTML report
        html = _generate_html_report(report)
        filename = f"AjraSakha_Gap_Report_{timestamp}.html"
        return Response(
            content=html,
            media_type="text/html",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    # Generate text report
    txt = _generate_text_report(report)
    filename = f"AjraSakha_Gap_Report_{timestamp}.txt"
    return Response(
        content=txt,
        media_type="text/plain",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


def _generate_text_report(report: dict) -> str:
    """Generate plain text gap report"""
    lines = []
    lines.append("=" * 70)
    lines.append("🌾 AJRASAKHA - GDB COVERAGE GAP REPORT")
    lines.append("=" * 70)
    lines.append("")
    lines.append(f"Report Period: {report.get('start_date', 'N/A')} to {report.get('end_date', 'N/A')}")
    lines.append(f"Generated: {report.get('generated_at', 'N/A')}")
    lines.append(f"Total Disclaimers Analyzed: {report.get('total_disclaimers', 0)}")
    lines.append(f"Unique Queries: {report.get('unique_queries', 0)}")
    lines.append(f"Clusters Found: {report.get('clusters_found', 0)}")
    lines.append("")
    lines.append("=" * 70)
    lines.append("🔥 TOP 20 GDB GAPS (Ranked by Priority)")
    lines.append("=" * 70)
    lines.append("")

    for i, gap in enumerate(report.get("top_gaps", []), 1):
        lines.append(f"#{i} {gap.get('cluster_name', 'Unknown')}")
        lines.append(f"   Priority: {gap.get('priority_level', 'N/A')} (Score: {gap.get('priority_score', 0)})")
        lines.append(f"   Farmers Affected: {gap.get('farmer_demand', 0)}")
        lines.append(f"   Growth Rate: {gap.get('growth_rate', 0) * 100:.0f}%")
        lines.append(f"   Domains: {', '.join(gap.get('domains', []))}")
        lines.append(f"   States: {', '.join(gap.get('states', []))}")
        lines.append(f"   Sample Questions:")
        for q in gap.get("sample_queries", [])[:3]:
            lines.append(f"      • {q}")
        lines.append(f"   Action: {gap.get('recommended_action', 'N/A')}")
        lines.append("")
        lines.append("-" * 70)
        lines.append("")

    lines.append("")
    lines.append("=" * 70)
    lines.append("📍 OUTREACH TEAM RECOMMENDATIONS")
    lines.append("=" * 70)
    lines.append("")
    for rec in report.get("outreach_recommendations", []):
        lines.append(f"📍 {rec.get('target_state')} - {rec.get('focus_domain')}")
        lines.append(f"   Priority: {rec.get('priority', 'N/A')}")
        lines.append(f"   Gap Questions: {rec.get('gap_questions', 0)}")
        lines.append(f"   Recommendation: {rec.get('recommendation', 'N/A')}")
        lines.append("")

    lines.append("=" * 70)
    lines.append("🌡️ COVERAGE STATS")
    lines.append("=" * 70)
    coverage = report.get("coverage_stats", {})
    lines.append(f"Total Combinations: {coverage.get('total_combinations', 0)}")
    lines.append(f"Covered: {coverage.get('covered', 0)}")
    lines.append(f"Partial: {coverage.get('partial', 0)}")
    lines.append(f"Gaps: {coverage.get('gaps', 0)}")
    lines.append("")
    lines.append("=" * 70)
    lines.append("Generated by AjraSakha Coverage Gap Detector")
    lines.append("=" * 70)

    return "\n".join(lines)


def _generate_html_report(report: dict) -> str:
    """Generate styled HTML gap report"""
    rows = ""
    for i, gap in enumerate(report.get("top_gaps", []), 1):
        priority_color = {
            "CRITICAL": "#dc2626",
            "HIGH": "#ea580c",
            "MEDIUM": "#ca8a04",
            "LOW": "#65a30d"
        }.get(gap.get("priority_level", "LOW"), "#65a30d")

        queries = "".join(
            f"<li style='margin: 4px 0; color: #4b5563;'>{q}</li>"
            for q in gap.get("sample_queries", [])[:3]
        )

        rows += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">#{i}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #166534;">{gap.get('cluster_name', 'Unknown')}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="background: {priority_color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                    {gap.get('priority_level', 'N/A')}
                </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: bold;">{gap.get('farmer_demand', 0)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{gap.get('growth_rate', 0) * 100:.0f}%</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">{', '.join(gap.get('domains', []))}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <ul style="margin: 0; padding-left: 16px;">{queries}</ul>
                <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 4px; font-size: 12px; color: #92400e;">
                    <strong>Action:</strong> {gap.get('recommended_action', 'N/A')}
                </div>
            </td>
        </tr>
        """

    coverage = report.get("coverage_stats", {})

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>AjraSakha Gap Report</title>
    </head>
    <body style="font-family: 'Segoe UI', sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f9fafb;">
        <div style="background: linear-gradient(135deg, #2E7D32 0%, #0288D1 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 32px;">🌾 AjraSakha GDB Coverage Gap Report</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.95;">
                Report Period: {report.get('start_date', 'N/A')} to {report.get('end_date', 'N/A')}<br>
                Generated: {report.get('generated_at', 'N/A')}
            </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 32px; font-weight: bold; color: #2E7D32;">{report.get('total_disclaimers', 0)}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">Disclaimers Analyzed</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 32px; font-weight: bold; color: #0288D1;">{report.get('unique_queries', 0)}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">Unique Questions</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 32px; font-weight: bold; color: #dc2626;">{report.get('clusters_found', 0)}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">Clusters Found</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 32px; font-weight: bold; color: #ea580c;">{len(report.get('top_gaps', []))}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">Priority Gaps</div>
            </div>
        </div>

        <h2 style="color: #166534; border-bottom: 3px solid #2E7D32; padding-bottom: 8px; margin-top: 40px;">
            🔥 Top 20 Priority Gaps
        </h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
                <tr style="background: linear-gradient(135deg, #2E7D32, #43A047); color: white;">
                    <th style="padding: 12px; text-align: left;">#</th>
                    <th style="padding: 12px; text-align: left;">Topic</th>
                    <th style="padding: 12px; text-align: left;">Priority</th>
                    <th style="padding: 12px; text-align: center;">Farmers</th>
                    <th style="padding: 12px; text-align: center;">Growth</th>
                    <th style="padding: 12px; text-align: left;">Domain</th>
                    <th style="padding: 12px; text-align: left;">Details</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>

        <h2 style="color: #166534; border-bottom: 3px solid #2E7D32; padding-bottom: 8px; margin-top: 40px;">
            📍 Outreach Team Recommendations
        </h2>
        <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            {''.join(
                f'<div style="padding: 16px; border-left: 4px solid {"#dc2626" if rec.get("priority") == "HIGH" else "#ca8a04"}; background: #f9fafb; margin-bottom: 12px; border-radius: 4px;">'
                f'<strong style="color: #166534;">{rec.get("target_state")} - {rec.get("focus_domain")}</strong> '
                f'<span style="background: {"#dc2626" if rec.get("priority") == "HIGH" else "#ca8a04"}; color: white; padding: 2px 8px; border-radius: 8px; font-size: 11px; margin-left: 8px;">{rec.get("priority", "MEDIUM")}</span><br>'
                f'<span style="color: #4b5563; font-size: 14px;">{rec.get("recommendation", "")}</span><br>'
                f'<span style="color: #6b7280; font-size: 12px;">{rec.get("gap_questions", 0)} unanswered questions in this region/domain</span>'
                f'</div>'
                for rec in report.get("outreach_recommendations", [])
            )}
        </div>

        <h2 style="color: #166534; border-bottom: 3px solid #2E7D32; padding-bottom: 8px; margin-top: 40px;">
            🌡️ Coverage Statistics
        </h2>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #2E7D32;">{coverage.get('covered', 0)}</div>
                <div style="color: #6b7280; font-size: 14px;">Covered</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #ca8a04;">{coverage.get('partial', 0)}</div>
                <div style="color: #6b7280; font-size: 14px;">Partial</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #dc2626;">{coverage.get('gaps', 0)}</div>
                <div style="color: #6b7280; font-size: 14px;">Gaps</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #0288D1;">{coverage.get('total_combinations', 0)}</div>
                <div style="color: #6b7280; font-size: 14px;">Total</div>
            </div>
        </div>

        <div style="text-align: center; margin-top: 40px; padding: 20px; color: #6b7280; font-size: 14px;">
            <p>Generated by AjraSakha Coverage Gap Detector</p>
            <p style="margin-top: 8px;">🌾 Empowering Indian Farmers with AI</p>
        </div>
    </body>
    </html>
    """
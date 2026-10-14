import os
from datetime import datetime
from engine import run_gap_analysis

def generate_weekly_report():
    print("Running gap analysis for weekly report...")
    report = run_gap_analysis()
    top_gaps = report.get("top_gaps", [])
    
    # Ensure reports directory exists
    reports_dir = os.path.join(os.path.dirname(__file__), "reports")
    os.makedirs(reports_dir, exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    report_filename = os.path.join(reports_dir, f"gap_report_{today}.md")
    
    with open(report_filename, "w", encoding="utf-8") as f:
        f.write(f"# GDB Coverage Gap Weekly Report\n\n")
        f.write(f"**Date:** {today}\n")
        f.write(f"**Total Queries Analyzed:** {report.get('total_queries_analyzed')}\n")
        f.write(f"**Total Clusters Found:** {report.get('total_clusters_found')}\n\n")
        f.write("## Top 20 Coverage Gaps\n\n")
        
        f.write("| Rank | Crop | State | Domain | Size | Growth Rate | Trend | Urgency |\n")
        f.write("|---|---|---|---|---|---|---|---|\n")
        
        for idx, gap in enumerate(top_gaps, 1):
            f.write(f"| {idx} | {gap.get('crop')} | {gap.get('state')} | {gap.get('domain')} | ")
            f.write(f"{gap.get('size')} | {gap.get('growth_rate')} | {gap.get('trend')} | {gap.get('urgency_score')} |\n")
            
        f.write("\n## Detailed Sample Queries\n\n")
        for idx, gap in enumerate(top_gaps, 1):
            f.write(f"### {idx}. {gap.get('crop')} / {gap.get('state')} / {gap.get('domain')}\n")
            f.write(f"**Urgency:** {gap.get('urgency_score')} | **Trend:** {gap.get('trend')}\n\n")
            f.write("**Sample Queries:**\n")
            for q in gap.get('sample_queries', []):
                f.write(f"- {q}\n")
            f.write("\n")
            
    print(f"Report successfully generated and saved to {report_filename}")

if __name__ == "__main__":
    generate_weekly_report()

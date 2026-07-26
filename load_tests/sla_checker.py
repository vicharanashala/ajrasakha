import os
import sys
import pandas as pd
import config

# Set UTF-8 output for Windows console environments
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def check_slas(stats_csv_path="reports/report_stats.csv"):
    """
    Parses Locust output CSV report and verifies 95th percentile SLAs.
    Exits with code 0 on PASS, code 1 on FAIL.
    """
    if not os.path.exists(stats_csv_path):
        print(f"[ERROR] Locust stats CSV file not found at '{stats_csv_path}'.")
        sys.exit(1)

    print("=" * 65)
    print("  ACE REVIEWER SYSTEM -- SLA VERIFICATION REPORT")
    print("=" * 65)

    df = pd.read_csv(stats_csv_path)
    
    # Filter out the summary 'Aggregated' row if present
    endpoints_df = df[df["Name"] != "Aggregated"]
    
    sla_failures = []
    
    for _, row in endpoints_df.iterrows():
        name = row.get("Name", "")
        # Find 95th percentile column (Locust CSVs use '95%' or '95th percentile')
        p95_col = [col for col in df.columns if "95%" in col or "95th" in col]
        if not p95_col:
            print("[WARN] 95th percentile column not found in Locust CSV headers.")
            continue
            
        p95_val = float(row[p95_col[0]]) if pd.notnull(row[p95_col[0]]) else 0.0
        req_count = int(row.get("Request Count", 0))
        fail_count = int(row.get("Failure Count", 0))
        
        # Determine target threshold for endpoint
        target_sla_ms = config.SLA_ANSWER_SUBMIT_MS
        if "login" in name.lower():
            target_sla_ms = config.SLA_LOGIN_MS
        elif "allocate" in name.lower():
            target_sla_ms = config.SLA_ALLOCATION_SEC * 1000

        status = "[PASS]"
        if p95_val > target_sla_ms:
            status = f"[FAIL] (P95 {p95_val:.1f}ms > Target {target_sla_ms}ms)"
            sla_failures.append(f"{name}: P95 response time {p95_val:.1f}ms exceeded SLA threshold {target_sla_ms}ms")
            
        print(f"• Endpoint: {name:<30} | P95: {p95_val:>7.1f}ms | Target: {target_sla_ms:>5}ms | Requests: {req_count:>5} | Status: {status}")

    print("-" * 65)
    if sla_failures:
        print("[FAIL] SLA CHECK FAILED:")
        for failure in sla_failures:
            print(f"  - {failure}")
        print("=" * 65)
        sys.exit(1)
    else:
        print("[SUCCESS] ALL SLA TARGETS PASSED SUCCESSFULLY!")
        print("=" * 65)
        sys.exit(0)

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "reports/report_stats.csv"
    check_slas(csv_file)

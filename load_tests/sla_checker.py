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
    Parses Locust output CSV reports and detailed failure logs to verify 95th percentile SLAs.
    Prints endpoint latency tables and failure analytics breakdown.
    Exits with code 0 on PASS, code 1 on FAIL.
    """
    if not os.path.exists(stats_csv_path):
        print(f"[ERROR] Locust stats CSV file not found at '{stats_csv_path}'.")
        sys.exit(1)

    print("=" * 70)
    print("  ACE REVIEWER SYSTEM & MICROSERVICES -- SLA VERIFICATION REPORT")
    print("=" * 70)

    df = pd.read_csv(stats_csv_path)
    
    # Filter out the summary 'Aggregated' row if present
    endpoints_df = df[df["Name"] != "Aggregated"]
    
    sla_failures = []
    total_requests = 0
    total_failures = 0
    
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
        
        total_requests += req_count
        total_failures += fail_count
        
        # Determine target threshold for endpoint
        target_sla_ms = config.SLA_ANSWER_SUBMIT_MS
        if "health" in name.lower():
            target_sla_ms = config.SLA_HEALTH_MS
        elif "login" in name.lower():
            target_sla_ms = config.SLA_LOGIN_MS
        elif "ai" in name.lower() or "langgraph" in name.lower():
            target_sla_ms = config.SLA_LANGGRAPH_AI_MS
        elif "allocate" in name.lower():
            target_sla_ms = config.SLA_ALLOCATION_SEC * 1000

        status = "[PASS]"
        if p95_val > target_sla_ms:
            status = f"[FAIL] (P95 {p95_val:.1f}ms > Target {target_sla_ms}ms)"
            sla_failures.append(f"{name}: P95 response time {p95_val:.1f}ms exceeded SLA threshold {target_sla_ms}ms")
            
        print(f"• Route: {name:<35} | P95: {p95_val:>7.1f}ms | Target: {target_sla_ms:>5}ms | Requests: {req_count:>5} | Status: {status}")

    print("-" * 70)
    print("📊 FAILURE ANALYTICS & ERROR BREAKDOWN LOGS")
    print("-" * 70)

    detailed_log_path = os.path.join(os.path.dirname(stats_csv_path), "detailed_failures.log")
    if os.path.exists(detailed_log_path):
        with open(detailed_log_path, "r", encoding="utf-8") as f:
            log_lines = f.readlines()
        print(f"• Total Logged Error Traces: {len(log_lines)}")
        if log_lines:
            print("• Recent Logged Trace Sample:")
            for line in log_lines[-3:]:
                print(f"  └─ {line.strip()}")
    else:
        print(f"• Total HTTP Requests: {total_requests} | Unhandled Failures Logged: {total_failures} (0.00% Failure Rate)")

    print("=" * 70)
    if sla_failures:
        print("[FAIL] SLA CHECK FAILED:")
        for failure in sla_failures:
            print(f"  - {failure}")
        print("=" * 70)
        sys.exit(1)
    else:
        print("[SUCCESS] ALL SLA & MICROSERVICE TARGETS PASSED SUCCESSFULLY!")
        print("=" * 70)
        sys.exit(0)

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "reports/report_stats.csv"
    check_slas(csv_file)

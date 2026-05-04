import asyncio
import sys
from pathlib import Path
from datetime import datetime

# Add root directory to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from state_masters.odisha_mandi_master import get_odisha_prices_master
from state_masters.manipur_mandi_master import fetch_agmarknet as manipur_fetch_agmarknet, fetch_datagov as manipur_fetch_datagov
from state_masters.haryana_mandi_master import get_haryana_prices_master
from state_masters.jk_mandi_master import get_jk_prices_master

def print_neat_table(data_rows, headers):
    """Prints a neat tabular column without needing external libraries."""
    if not data_rows:
        print("No data available.")
        return

    col_widths = [len(h) for h in headers]
    for row in data_rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))
    
    row_format = " | ".join([f"{{:<{w}}}" for w in col_widths])
    separator = "-+-".join(["-" * w for w in col_widths])
    
    print(row_format.format(*headers))
    print(separator)
    for row in data_rows:
        print(row_format.format(*[str(val).strip() for val in row]))



async def fetch_manipur(commodity, date):
    res = await manipur_fetch_agmarknet(commodity, date)
    if res and isinstance(res, dict) and res.get("status") == "success":
        return {"status": "success", "state": "Manipur", "data": res["data"]}
    res = await manipur_fetch_datagov(commodity, date)
    if res and isinstance(res, dict) and res.get("status") == "success":
        return {"status": "success", "state": "Manipur", "data": res["data"]}
    return {"status": "error", "message": "All nodes failed."}

async def test_all_states():
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"\n{'='*80}")
    print(f" FETCHING MANDI PRICES FOR ALL 4 STATES FOR {today} ".center(80))
    print(f"{'='*80}\n")
    
    commodity = ""
    district = "" 
    results = []

    print("[*] Fetching Odisha...")
    try:
        odisha_res = await get_odisha_prices_master("Odisha", commodity, district, today)
        results.append(("Odisha", odisha_res))
    except Exception as e:
        results.append(("Odisha", {"status": "error", "message": str(e)}))

    print("[*] Fetching Manipur...")
    try:
        manipur_res = await fetch_manipur(commodity, today)
        results.append(("Manipur", manipur_res))
    except Exception as e:
        results.append(("Manipur", {"status": "error", "message": str(e)}))

    print("[*] Fetching Haryana...")
    try:
        haryana_res = await get_haryana_prices_master("Haryana", commodity, district, today)
        results.append(("Haryana", haryana_res))
    except Exception as e:
        results.append(("Haryana", {"status": "error", "message": str(e)}))

    print("[*] Fetching Jammu & Kashmir...")
    try:
        jk_res = await get_jk_prices_master(commodity, today)
        results.append(("Jammu & Kashmir", jk_res))
    except Exception as e:
        results.append(("Jammu & Kashmir", {"status": "error", "message": str(e)}))

    print("\n\n" + "="*80)
    print("FINAL RESULTS TABLE".center(80))
    print("="*80 + "\n")

    headers = ["Commodity", "Modal Price (Rs)", "Source", "Date"]

    for state, res in results:
        print(f"--- {state.upper()} ---")
        if res.get("status") == "success" and res.get("data"):
            table_data = []
            for item in res["data"]:
                source = item.get("source", "N/A")
                cmdty = item.get("commodity", "N/A")
                price = item.get("modal_price", "N/A")
                item_date = item.get("date", today)
                table_data.append([cmdty, price, source, item_date])
            
            print_neat_table(table_data[:20], headers)
            if len(table_data) > 20:
                print(f"... and {len(table_data) - 20} more crops listed.")
        else:
            print(f"No data available or error: {res.get('message', 'Empty')}")
        print("\n")

if __name__ == "__main__":
    asyncio.run(test_all_states())

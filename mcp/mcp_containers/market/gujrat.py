import aiohttp
from datetime import datetime

async def fetch_gujarat_mandi_prices(state, commodity, district, date):
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        api_date = dt.strftime("%d/%m/%Y")
    except:
        api_date = date

    base_url = "https://www.apmcrajkot.com/home/daily_rates"
    api_url = "https://www.apmcrajkot.com/home/get_daily_rates"

    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": base_url,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(base_url, timeout=10) as first_resp:
                await first_resp.text() 

            payload = {'date': api_date}

            async with session.post(api_url, data=payload, timeout=15) as resp:

                try:
                    json_data = await resp.json(content_type=None)
                except Exception:
                    raw = await resp.text()
                    return [{"error": f"Server blocked request. Preview: {raw[:100]}"}]
                
                grains = json_data.get("data", [])
                veggies = json_data.get("datas", [])
                combined = grains + veggies

                if not combined:
                    return []

                results = []
                for item in combined:
                    name = item.get("jansi_english_name", "").strip()
                    if not name: continue
                    if commodity and commodity.lower() not in name.lower():
                        continue

                    # --- MODAL PRICE CALCULATION LOGIC ---
                    try:
                        low = int(item.get("lowrate", 0))
                        high = int(item.get("highrate", 0))
                        
                        calculated_modal = (low + high) // 2 if (low + high) > 0 else 0
                    except (ValueError, TypeError):
                        # Fallback if rates are not numeric
                        low = item.get("lowrate")
                        high = item.get("highrate")
                        calculated_modal = low # Default to low 
                    results.append({
                        "commodity": name,
                        "state": "Gujarat",
                        "district": "Rajkot",
                        "market name": "Rajkot",
                        "variety if available": item.get("jansi_type", "-") or "-",
                        "min_price": item.get("lowrate"),
                        "max_price": item.get("highrate"),
                        "modal_price": calculated_modal,
                        "date": item.get("date"),
                        "source": "apmc-rajkot"
                    })

                return results

    except Exception as e:
        return [{"error": str(e)}]

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from market import getMandiPrices

logging.basicConfig(level=logging.INFO)

async def main():
    target_state = "Gujarat" 
    test_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    print(f"Testing {target_state} Mandi Price Fetcher...")
    print(f"Fetching data for {test_date}...\n")
    
    results = await getMandiPrices("gujrat", '', '', date=test_date)
    
    if isinstance(results, dict):
        if not results.get("success", True):
            print(f"Error fetching data: {results.get('error')}")
        else:
            print("Received dictionary but expected a list.")
        return
        
    if not results:
        print("No data found for the given criteria.")
        return
    
    cropsData = defaultdict(list)
    for item in results:
        if isinstance(item, dict) and 'commodity' in item:
            cropsData[item['commodity']].append(item)
    
    # Header
    print(f"{'commodity':<20} {'district':<10} {'market':<10} {'variety':<10} {'min price':<10} {'max price':<10} {'modal price':<12} {'date':<12} {'source':<12}")
    print("-"*120)
    
    for crop in sorted(cropsData.keys()):
        for entry in cropsData[crop]:
            comm = entry.get('commodity', '')
            dist = entry.get('district', '-')
            mkt = entry.get('market', entry.get('market name', '-'))
            var = entry.get('variety', entry.get('variety if available', '-'))
            minp = entry.get('min_price', 'n/a')
            maxp = entry.get('max_price', 'n/a')
            modal = entry.get('modal_price', 'n/a')
            dt = entry.get('date', 'n/a')
            src = "apmc-rajkot"
            
            print(f"{str(comm):<20} {str(dist):<10} {str(mkt):<10} {str(var):<10} {str(minp):<10} {str(maxp):<10} {str(modal):<12} {str(dt):<12} {src:<12}")

    print(f"\nTotal results: {len(results)}")
    print(f"Unique Crops: {len(cropsData)}")
    print("-" * 115)
    

if __name__ == "__main__":
    asyncio.run(main())
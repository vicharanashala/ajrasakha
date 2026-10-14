import asyncio
import json
import logging
from collections import defaultdict
from market import getMandiPrices

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing Maharashtra Mandi Price Fetcher...")
    
    results= await getMandiPrices("Maharashtra",'cucumber','','')
    
    # Checks if the API returned an error dictionary instead of a list
    if isinstance(results, dict):
        if not results.get("success", True):
            print(f"Error fetching data: {results.get('error')}")
            if "raw_preview" in results:
                print(f"Raw Response: {results['raw_preview']}")
        else:
            print("Received dictionary but expected a list.")
        return
        
    if not results:
        print("No data found for the given criteria.")
        return
    
    cropsData= defaultdict(list)
    for item in results:
        if isinstance(item, dict) and 'commodity' in item:
            cropsData[item['commodity']].append(item)
    
    #Header
    print(f"{'commodity':<20} {'district':<10} {'market':<30} {'variety':<15} {'min price':<15} {'max price':<15} {'modal price':<15} {'date':<15} {'source':<15}")
    print("-"*160)
    
    for crop in sorted(cropsData.keys()):
        for entry in cropsData[crop]:
            comm = entry.get('commodity', '')
            dist = entry.get('district',"-")
            mkt = entry.get('market','-')
            var = entry.get('variety', entry.get('variety if available', '-')) 
            minp = entry.get('min_price', 'n/a')
            maxp = entry.get('max_price', 'n/a')
            modal = entry.get('modal_price')
            dt = entry.get('date')
            src = "MSAMB"

            print(f"{str(comm):<20} {str(dist):<10} {str(mkt):<30} {str(var):<15} {str(minp):<15} {str(maxp):<15} {str(modal):<15} {str(dt):<15} {src:<15}")
           
            
    print(f"\nTotal results: {len(results)}")
    print(f"Unique Crops: {len(cropsData)}")
    print("-" * 115)
   
if __name__ == "__main__":
    asyncio.run(main())   
   
  
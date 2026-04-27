import asyncio
import httpx
import re

async def run():
    url = "https://osamb.odisha.gov.in/"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp1 = await client.get(url, follow_redirects=True)
            print("Page status:", resp1.status_code)
            
            match = re.search(r'name="csrf_price_token"\s+value="([^"]+)"', resp1.text)
            token = match.group(1) if match else None
            print("Token found:", token)
            
            # Print if there are any forms
            print("Forms count:", len(re.findall(r'<form', resp1.text)))
    except Exception as e:
        print("Error:", e)

asyncio.run(run())

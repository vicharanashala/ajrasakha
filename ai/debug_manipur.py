import asyncio
import httpx
import traceback

async def run():
    url = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24"
    params = {
        "format": "json",
        "api-key": "579b464db66ec23bdd000001cdc3b564546246a772a26393094f5645",
        "filters[State]": "Manipur", "limit": 100
    }
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, params=params, timeout=15.0)
            res.raise_for_status()
            print("Status Code:", res.status_code)
            print("Response:", res.text[:200])
    except Exception as e:
        print("Error details:")
        traceback.print_exc()

asyncio.run(run())

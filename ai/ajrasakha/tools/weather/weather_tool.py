import os
import aiohttp
from datetime import datetime
from typing import Dict, Any
from dotenv import load_dotenv
from langchain.tools import tool

load_dotenv()
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")


@tool
async def weather_information_tool(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Returns today's weather and next 7-day day-wise forecast
    (Free tier compatible)
    """

    async with aiohttp.ClientSession() as session:
        try:
            # 1️⃣ Current weather
            current_url = "https://api.openweathermap.org/data/2.5/weather"
            current_params = {
                "lat": latitude,
                "lon": longitude,
                "appid": OPENWEATHER_API_KEY,
                "units": "metric",
            }

            async with session.get(
                    current_url,
                    params=current_params,
                    timeout=aiohttp.ClientTimeout(total=10)
            ) as current_resp:
                current_resp.raise_for_status()
                current_data = await current_resp.json()

            today_weather = {
                "date": datetime.fromtimestamp(current_data["dt"]).strftime("%Y-%m-%d"),
                "temperature": current_data["main"]["temp"],
                "condition": current_data["weather"][0]["main"],
                "description": current_data["weather"][0]["description"],
                "city": current_data["name"],
            }

            # 2️⃣ 7-day forecast (using daily forecast endpoint)
            forecast_url = "https://api.openweathermap.org/data/2.5/forecast"
            forecast_params = {
                "lat": latitude,
                "lon": longitude,
                "appid": OPENWEATHER_API_KEY,
                "units": "metric",
            }

            async with session.get(
                    forecast_url,
                    params=forecast_params,
                    timeout=aiohttp.ClientTimeout(total=10)
            ) as forecast_resp:
                forecast_resp.raise_for_status()
                forecast_data = await forecast_resp.json()

            # Group forecast by day
            daily = {}
            for item in forecast_data["list"]:
                date = item["dt_txt"].split(" ")[0]
                temp = item["main"]["temp"]
                condition = item["weather"][0]["main"]
                description = item["weather"][0]["description"]

                if date not in daily:
                    daily[date] = {
                        "min_temp": temp,
                        "max_temp": temp,
                        "condition": condition,
                        "description": description,
                    }
                else:
                    daily[date]["min_temp"] = min(daily[date]["min_temp"], temp)
                    daily[date]["max_temp"] = max(daily[date]["max_temp"], temp)

            # Next 7 days (excluding today)
            forecast = []
            today_date = today_weather["date"]

            for date, data in list(daily.items()):
                if date != today_date:
                    forecast.append({
                        "date": date,
                        "min_temp": round(data["min_temp"], 1),
                        "max_temp": round(data["max_temp"], 1),
                        "condition": data["condition"],
                        "description": data["description"],
                    })

            forecast = forecast[:7]

            return {
                "today": today_weather,
                "forecast": forecast
            }

        except Exception as e:
            return {"status": "error", "error": str(e)}
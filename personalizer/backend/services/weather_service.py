import os
import requests

class WeatherService:
    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY')
        self.base_url = "https://api.openweathermap.org/data/2.5/forecast"

    def get_forecast(self, latitude, longitude):
        if not self.api_key:
            raise Exception("OpenWeather API key not found in environment.")

        params = {
            'lat': latitude,
            'lon': longitude,
            'appid': self.api_key,
            'units': 'metric' # Celsius
        }

        response = requests.get(self.base_url, params=params)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch weather: {response.text}")
            
        data = response.json()
        
        # Summarize next 5 days of rainfall and temp
        summary = {
            'forecast': []
        }
        
        # OpenWeather forecast is every 3 hours for 5 days (40 items).
        # Group by day roughly by jumping every 8 items (24 hours).
        for i in range(0, len(data['list']), 8):
            day_data = data['list'][i]
            summary['forecast'].append({
                'date': day_data['dt_txt'].split(' ')[0],
                'temp': day_data['main']['temp'],
                'weather': day_data['weather'][0]['description'],
                'rain_probability': day_data.get('pop', 0) * 100 # Probability of precipitation
            })
            
        return summary

weather_service = WeatherService()


import { injectable } from 'inversify';
import axios from 'axios';
import { appConfig } from '#root/config/app.js';
import { InternalServerError } from 'routing-controllers';

// A simple interface for our weather data
export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
}

export interface IWeatherService {
  getWeatherByLocation(lat: number, lon: number): Promise<WeatherData>;
}

@injectable()
export class WeatherService implements IWeatherService {
  private readonly apiKey = appConfig.OPENWEATHER_API_KEY;
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5/weather';

  constructor() {
    if (!this.apiKey) {
      console.warn('OpenWeatherMap API key is not configured. Weather feature will not work.');
    }
  }

  async getWeatherByLocation(lat: number, lon: number): Promise<WeatherData> {
    if (!this.apiKey) {
      throw new InternalServerError('Weather service is not configured.');
    }

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric', // To get temperature in Celsius
          lang: 'hi' // To get description in Hindi if available
        },
      });

      const data = response.data;

      if (!data || !data.main || !data.weather || !data.wind) {
        throw new Error('Invalid data received from weather API');
      }

      const weatherData: WeatherData = {
        temperature: data.main.temp,
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
      };

      return weatherData;

    } catch (error) {
      console.error('Error fetching weather data:', error);
      throw new InternalServerError('Failed to fetch weather data.');
    }
  }
}

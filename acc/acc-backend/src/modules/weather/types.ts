export interface ImdHourlyForecast {
  time: string;
  temp: number;
  precipitationProb: number;
  windSpeed: number;
}

export interface ImdDailyForecast {
  dayName: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  forecastText: string;
}

export interface ImdWeatherResponse {
  currentTemp: number;
  precipitationProb: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  conditionText: string;
  pressure?: number | string;
  stationName?: string;
  distanceKm?: number | null;
  observationTime?: string;
  hourly: ImdHourlyForecast[];
  daily: ImdDailyForecast[];
  source: 'IMD (India Meteorological Department)';
  warnings?: string[];
  rainfallStatus?: string;
  rawImd?: any;
}

export interface IDistrictWeather {
  district: string;
  state: string;
  temp: number;
  feelsLike: number;
  condition: string;
  icon: string;
  humidity: number;
  rainChance: number;
  windSpeed: number; // km/h
  soilMoisture: number; // %
  sprayWindow: 'OPTIMAL' | 'MODERATE' | 'UNFAVORABLE';
  sprayAdvice: string;
  irrigationAdvice: string;
  diseaseRisk: string;
  forecast: {
    day: string;
    tempMax: number;
    tempMin: number;
    condition: string;
    conditionHi?: string;
    rainProb: number;
  }[];
}

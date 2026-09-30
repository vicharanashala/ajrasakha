import { injectable } from 'inversify';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpError } from 'routing-controllers';
import type { ImdWeatherResponse, ImdHourlyForecast, ImdDailyForecast } from '../types.js';

@injectable()
export class WeatherService {
  private readonly upstreamUrls: string[] = [
    'http://100.100.108.44:6103/imd/weather',
  ];

  // SOCKS5 proxy agent for Tailscale network (localhost:1055) in Cloud Run userspace networking
  private readonly httpAgent = new SocksProxyAgent('socks5://localhost:1055');

  /**
   * Helper to fetch from upstream mirror, routing 100.x addresses through Tailscale SOCKS5 proxy
   * (matching AccAgentService, PlivoService, and ContextService) with fallback to direct for local dev.
   */
  private async fetchFromMirror(url: string, params: Record<string, any>) {
    const isTailscale = /^https?:\/\/100\./.test(url);

    if (isTailscale) {
      try {
        const proxyClient = axios.create({
          httpAgent: this.httpAgent,
          httpsAgent: this.httpAgent,
        });
        return await proxyClient.get(url, { params, timeout: 8000 });
      } catch (proxyErr: any) {
        // If SOCKS proxy is not running on localhost:1055 (e.g. local dev with native Tailscale OS adapter), try direct
        if (proxyErr.code === 'ECONNREFUSED') {
          return await axios.get(url, { params, timeout: 8000 });
        }
        throw proxyErr;
      }
    }

    return await axios.get(url, { params, timeout: 8000 });
  }

  /**
   * Map IMD weather condition string or code to standard numeric code and text
   */
  private parseCondition(text?: string): { code: number; text: string } {
    if (!text) return { code: 2, text: 'Partly Cloudy' };
    const lower = text.toLowerCase();
    if (lower.includes('thunder') || lower.includes('squall')) return { code: 95, text: 'Thunderstorm' };
    if (lower.includes('heavy rain') || lower.includes('torrential')) return { code: 65, text: 'Heavy Rain' };
    if (lower.includes('rain') || lower.includes('shower') || lower.includes('drizzle')) return { code: 61, text: 'Rain Showers' };
    if (lower.includes('overcast') || lower.includes('cloudy')) return { code: 3, text: 'Cloudy' };
    if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) return { code: 45, text: 'Fog / Mist' };
    if (lower.includes('sun') || lower.includes('clear')) return { code: 0, text: 'Clear Sky' };
    return { code: 2, text: text };
  }

  /**
   * Fetch live IMD Weather data for a location
   */
  public async getImdWeather(params: {
    lat: number;
    lon: number;
    state?: string;
    district?: string;
    taluk?: string;
    village?: string;
  }): Promise<ImdWeatherResponse> {
    const { lat, lon, state, district, taluk, village } = params;

    // Try to fetch from active upstream IMD mirror endpoints
    for (const upstreamUrl of this.upstreamUrls) {
      try {
        const resp = await this.fetchFromMirror(upstreamUrl, {
          latitude: lat,
          longitude: lon,
          data_type: 'forecast',
        });

        const res = resp.data?.result || resp.data;

        if (resp.status === 200 && resp.data && resp.data.success !== false && res?.success !== false) {
          return this.formatUpstreamImdResponse(resp.data, params);
        }
      } catch (err: any) {
        // continue to next mirror
      }
    }

    // No fallback: if IMD is unreachable, throw an error
    throw new HttpError(
      503,
      `IMD Weather Service is currently unavailable. Could not fetch live data from IMD mirror (${this.upstreamUrls.join(', ')}).`,
    );
  }

  /**
   * Format upstream IMD mirror response (supports both data_type='forecast' and data_type='bundle')
   */
  private formatUpstreamImdResponse(
    data: any,
    params: {
      lat: number;
      lon: number;
      state?: string;
      district?: string;
      taluk?: string;
      village?: string;
    },
  ): ImdWeatherResponse {
    const res = data.result || data;

    // Helper to safely parse strings or numeric values from IMD
    const parseValidNum = (...vals: any[]): number | undefined => {
      for (const val of vals) {
        if (val == null) continue;
        const str = String(val).trim();
        if (str === '' || str === '-' || str.toUpperCase() === 'NA' || str.toUpperCase() === 'N/A') continue;
        const num = Number(str);
        if (!isNaN(num)) return num;
      }
      return undefined;
    };

    const parseNum = (val: any, fallback: number): number => parseValidNum(val) ?? fallback;

    // Supports data_type='forecast' (direct city forecast) and data_type='bundle' (nested bundle)
    const today = res.today || res.forecast?.today || {};
    const aws = res.nearest_aws?.station || res.aws?.station || res.station || {};
    const rawForecastList: any[] = Array.isArray(res.forecast)
      ? res.forecast
      : Array.isArray(res.forecast?.forecast)
        ? res.forecast.forecast
        : [];

    // Ensure IMD actually provided weather data for this location
    const rawMax = parseValidNum(
      today.observed_max_temp,
      today.forecast_max_temp,
      rawForecastList[0]?.max_temp,
      rawForecastList[0]?.Day_Max_Temp,
      aws.temperature_c,
    );
    const rawMin = parseValidNum(
      today.observed_min_temp,
      today.forecast_min_temp,
      rawForecastList[0]?.min_temp,
      rawForecastList[0]?.Day_Min_temp,
    );

    if (rawMax == null && rawMin == null && aws.temperature_c == null) {
      throw new HttpError(502, 'Temperature observation data missing from IMD response.');
    }

    if (!today.station && rawForecastList.length === 0) {
      throw new HttpError(502, 'Forecast station data missing from IMD response.');
    }

    // Temperature resolution: direct official IMD min and max without synthetic constants
    const tempMax = Math.round(rawMax ?? rawMin!);
    const tempMin = Math.round(rawMin ?? rawMax!);
    const currentTemp = parseValidNum(aws.temperature_c);

    // Humidity resolution (IMD records morning 08:30 and evening 17:30 humidity)
    let humidity = 0;
    if (aws.humidity_pct != null) {
      humidity = Math.round(parseNum(aws.humidity_pct, 0));
    } else if (today.humidity_0830 != null || today.humidity_1730 != null) {
      const istHour = Number(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          hour12: false,
        }).format(new Date())
      );
      if (istHour < 12 && today.humidity_0830 != null) {
        humidity = Math.round(parseNum(today.humidity_0830, 0));
      } else if (today.humidity_1730 != null) {
        humidity = Math.round(parseNum(today.humidity_1730, 0));
      } else {
        humidity = Math.round(parseNum(today.humidity_0830 ?? today.humidity_1730, 0));
      }
    }

    // Wind speed resolution
    const windSpeed = aws.wind_speed_kmph != null ? Math.round(parseNum(aws.wind_speed_kmph, 0)) : 0;

    // Weather condition resolution
    const rawCondition = today.forecast || aws.weather_message || 'Clear';
    const condition = this.parseCondition(rawCondition);

    // Station name and distance
    const stationName = today.station || aws.name || aws.STATION || params.taluk || params.district || 'IMD Station';
    const distanceKm = today.distance_to_station_km ?? res.distance_km ?? aws.distance_km ?? null;

    // Precipitation probability estimation from IMD rainfall records
    let precipitationProb = 0;
    const pastRain = parseNum(today.past_24hrs_rainfall, 0);
    const condLower = (rawCondition || '').toLowerCase();
    if (pastRain > 0 || condLower.includes('rain') || condLower.includes('shower') || condLower.includes('thunder')) {
      precipitationProb = 80;
    } else if (condLower.includes('cloud') || condLower.includes('overcast')) {
      precipitationProb = 30;
    } else {
      precipitationProb = 0;
    }

    // Hourly projection aligned to Indian Standard Time (IST)
    const istCurrentHour = Number(
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false,
      }).format(new Date())
    );

    const hourly: ImdHourlyForecast[] = [];
    for (let i = 0; i < 8; i++) {
      const hour = (istCurrentHour + i * 3) % 24;
      const period = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const sunRatio = Math.sin(((hour - 6) / 24) * 2 * Math.PI);
      const hourTemp = (tempMax + tempMin) / 2 + (sunRatio * (tempMax - tempMin)) / 2;
      hourly.push({
        time: `${displayHour} ${period}`,
        temp: Math.round(hourTemp),
        precipitationProb,
        windSpeed,
      });
    }

    // 7-day daily forecast strictly from IMD bulletin
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDate = new Date();
    const daily: ImdDailyForecast[] = [];

    // Day 1 is Today from IMD station observation
    daily.push({
      dayName: 'Today',
      weatherCode: condition.code,
      tempMax,
      tempMin,
      forecastText: today.forecast || condition.text,
    });

    // Days 2 to 7 strictly from IMD forecast list - zero synthetic days
    if (rawForecastList.length > 0) {
      rawForecastList.slice(0, 6).forEach((f: any, idx: number) => {
        const nextDate = new Date(todayDate);
        nextDate.setDate(todayDate.getDate() + idx + 1);
        const dayCond = this.parseCondition(f.forecast);
        daily.push({
          dayName: daysOfWeek[nextDate.getDay()],
          weatherCode: dayCond.code,
          tempMax: Math.round(parseNum(f.max_temp ?? f.Day_Max_Temp, tempMax)),
          tempMin: Math.round(parseNum(f.min_temp ?? f.Day_Min_temp, tempMin)),
          forecastText: f.forecast || dayCond.text,
        });
      });
    }

    return {
      tempMax,
      tempMin,
      currentTemp,
      precipitationProb: hourly[0]?.precipitationProb ?? precipitationProb,
      humidity,
      windSpeed,
      weatherCode: condition.code,
      conditionText: condition.text,
      pressure: aws.mslp ? `${aws.mslp} hPa` : '1012 hPa',
      stationName,
      distanceKm: distanceKm != null ? Number(distanceKm) : null,
      observationTime: aws.time ? `${aws.date || ''} ${aws.time}`.trim() : undefined,
      hourly,
      daily,
      source: 'IMD (India Meteorological Department)',
      rawImd: data,
    };
  }
}

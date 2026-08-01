import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./atoms/select";
import { Button } from "./atoms/button";
import { Badge } from "./atoms/badge";
import {
  Cloud,
  Sun,
  CloudRain,
  CloudLightning,
  CloudSnow,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  RefreshCw,
  Navigation,
} from "lucide-react";

// List of Indian States & UTs with capital coordinates for weather fetching
const INDIAN_STATES_COORDINATES: Record<string, { city: string; lat: number; lon: number }> = {
  "Karnataka": { city: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  "Andhra Pradesh": { city: "Vijayawada", lat: 16.5062, lon: 80.6480 },
  "Arunachal Pradesh": { city: "Itanagar", lat: 27.0844, lon: 93.6053 },
  "Assam": { city: "Guwahati", lat: 26.1433, lon: 91.7898 },
  "Bihar": { city: "Patna", lat: 25.5941, lon: 85.1376 },
  "Chhattisgarh": { city: "Raipur", lat: 21.2514, lon: 81.6296 },
  "Goa": { city: "Panaji", lat: 15.4909, lon: 73.8278 },
  "Gujarat": { city: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  "Haryana": { city: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  "Himachal Pradesh": { city: "Shimla", lat: 31.1048, lon: 77.1734 },
  "Jharkhand": { city: "Ranchi", lat: 23.3441, lon: 85.3096 },
  "Kerala": { city: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366 },
  "Madhya Pradesh": { city: "Bhopal", lat: 23.2599, lon: 77.4126 },
  "Maharashtra": { city: "Mumbai", lat: 19.0760, lon: 72.8777 },
  "Manipur": { city: "Imphal", lat: 24.8170, lon: 93.9368 },
  "Meghalaya": { city: "Shillong", lat: 25.5788, lon: 91.8933 },
  "Mizoram": { city: "Aizawl", lat: 23.7271, lon: 92.7176 },
  "Nagaland": { city: "Kohima", lat: 25.6751, lon: 94.1086 },
  "Odisha": { city: "Bhubaneswar", lat: 20.2961, lon: 85.8245 },
  "Punjab": { city: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  "Rajasthan": { city: "Jaipur", lat: 26.9124, lon: 75.7873 },
  "Sikkim": { city: "Gangtok", lat: 27.3389, lon: 88.6065 },
  "Tamil Nadu": { city: "Chennai", lat: 13.0827, lon: 80.2707 },
  "Telangana": { city: "Hyderabad", lat: 17.3850, lon: 78.4867 },
  "Tripura": { city: "Agartala", lat: 23.8315, lon: 91.2868 },
  "Uttar Pradesh": { city: "Lucknow", lat: 26.8467, lon: 80.9462 },
  "Uttarakhand": { city: "Dehradun", lat: 30.3165, lon: 78.0322 },
  "West Bengal": { city: "Kolkata", lat: 22.5726, lon: 88.3639 },
  "Delhi": { city: "New Delhi", lat: 28.6139, lon: 77.2090 },
  "Jammu and Kashmir": { city: "Srinagar", lat: 34.0837, lon: 74.7973 },
};

interface HourlyForecast {
  time: string;
  temp: number;
  precipitationProb: number;
  windSpeed: number;
}

interface DailyForecast {
  dayName: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
}

interface WeatherData {
  currentTemp: number;
  precipitationProb: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  conditionText: string;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  source: "IMD" | "Open-Meteo";
}

// Weather WMO Code mapping helper
const getWeatherCondition = (code: number): { text: string; icon: React.ReactNode } => {
  if (code === 0) return { text: "Sunny / Clear", icon: <Sun className="h-8 w-8 text-amber-400 animate-spin-slow" /> };
  if (code === 1 || code === 2) return { text: "Partly Cloudy", icon: <Cloud className="h-8 w-8 text-sky-400" /> };
  if (code === 3) return { text: "Cloudy", icon: <Cloud className="h-8 w-8 text-zinc-400" /> };
  if (code >= 51 && code <= 67) return { text: "Rainy", icon: <CloudRain className="h-8 w-8 text-blue-400" /> };
  if (code >= 80 && code <= 82) return { text: "Showers", icon: <CloudRain className="h-8 w-8 text-indigo-400" /> };
  if (code >= 95 && code <= 99) return { text: "Thunderstorm", icon: <CloudLightning className="h-8 w-8 text-purple-400" /> };
  if (code >= 71 && code <= 77) return { text: "Snowy", icon: <CloudSnow className="h-8 w-8 text-cyan-300" /> };
  return { text: "Cloudy", icon: <Cloud className="h-8 w-8 text-zinc-400" /> };
};

// Helper to normalize fuzzy/abbreviated Indian state names
const normalizeStateName = (inputState: string): string => {
  if (!inputState || !inputState.trim()) return "Karnataka";
  const trimmed = inputState.trim();

  if (INDIAN_STATES_COORDINATES[trimmed]) return trimmed;

  const lower = trimmed.toLowerCase();

  const abbrevMap: Record<string, string> = {
    pb: "Punjab",
    mh: "Maharashtra",
    up: "Uttar Pradesh",
    mp: "Madhya Pradesh",
    ap: "Andhra Pradesh",
    tn: "Tamil Nadu",
    wb: "West Bengal",
    ka: "Karnataka",
    dl: "Delhi",
    ts: "Telangana",
    rj: "Rajasthan",
    gj: "Gujarat",
    hr: "Haryana",
    hp: "Himachal Pradesh",
    uk: "Uttarakhand",
    kl: "Kerala",
    or: "Odisha",
    od: "Odisha",
    cg: "Chhattisgarh",
    jh: "Jharkhand",
    as: "Assam",
    br: "Bihar",
    ga: "Goa",
    jk: "Jammu and Kashmir",
  };

  if (abbrevMap[lower]) return abbrevMap[lower];

  for (const stateName of Object.keys(INDIAN_STATES_COORDINATES)) {
    if (
      stateName.toLowerCase() === lower ||
      stateName.toLowerCase().includes(lower) ||
      lower.includes(stateName.toLowerCase())
    ) {
      return stateName;
    }
  }

  return "Karnataka";
};

export const WeatherWidget: React.FC<{ defaultState?: string }> = ({ defaultState = "Karnataka" }) => {
  const [selectedState, setSelectedState] = useState<string>(() =>
    normalizeStateName(defaultState)
  );
  const [unit, setUnit] = useState<"C" | "F">("C");
  const [activeTab, setActiveTab] = useState<"Temperature" | "Precipitation" | "Wind">("Temperature");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultState) {
      const normalized = normalizeStateName(defaultState);
      if (normalized && normalized !== selectedState) {
        setSelectedState(normalized);
      }
    }
  }, [defaultState]);

  const stateInfo = INDIAN_STATES_COORDINATES[selectedState] || INDIAN_STATES_COORDINATES["Karnataka"];

  const fetchWeatherData = async () => {
    setIsLoading(true);
    setError(null);

    const { lat, lon } = stateInfo;

    const fetchOpenMeteoFallback = async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch weather data from Open-Meteo");
      const data = await res.json();

      const currentTemp = Math.round(data.current.temperature_2m);
      const humidity = Math.round(data.current.relative_humidity_2m);
      const windSpeed = Math.round(data.current.wind_speed_10m);
      const weatherCode = data.current.weather_code;

      const currentHourIdx = new Date().getHours();
      const hourlyList: HourlyForecast[] = [];
      for (let i = 0; i < 8; i++) {
        const idx = (currentHourIdx + i * 3) % 24;
        const timeStr = new Date(data.hourly.time[idx]).toLocaleTimeString([], { hour: "numeric" }).toLowerCase();
        hourlyList.push({
          time: timeStr,
          temp: Math.round(data.hourly.temperature_2m[idx] || currentTemp),
          precipitationProb: data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 15,
          windSpeed: Math.round(data.hourly.wind_speed_10m[idx] || windSpeed),
        });
      }

      const dailyList: DailyForecast[] = [];
      const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      if (data.daily && data.daily.time) {
        for (let i = 0; i < Math.min(7, data.daily.time.length); i++) {
          const d = new Date(data.daily.time[i]);
          dailyList.push({
            dayName: daysOfWeek[d.getDay()],
            weatherCode: data.daily.weather_code[i],
            tempMax: Math.round(data.daily.temperature_2m_max[i]),
            tempMin: Math.round(data.daily.temperature_2m_min[i]),
          });
        }
      }

      const condition = getWeatherCondition(weatherCode);

      setWeather({
        currentTemp,
        precipitationProb: hourlyList[0]?.precipitationProb || 20,
        humidity,
        windSpeed,
        weatherCode,
        conditionText: condition.text,
        hourly: hourlyList,
        daily: dailyList,
        source: "Open-Meteo",
      });
    };

    try {
      // Priority 1: IMD Weather API
      const imdResp = await fetch(
        `https://api.imd.gov.in/public/weather?lat=${lat}&lon=${lon}`,
        { method: "GET", signal: AbortSignal.timeout(3000) }
      );

      if (!imdResp.ok) {
        throw new Error(`IMD API returned HTTP ${imdResp.status}`);
      }

      const imdData = await imdResp.json();
      if (!imdData || !imdData.current) {
        throw new Error("IMD response payload missing current weather data");
      }

      setWeather({
        currentTemp: Math.round(imdData.current.temp || 26),
        precipitationProb: imdData.current.precipitation || 20,
        humidity: imdData.current.humidity || 70,
        windSpeed: Math.round(imdData.current.wind_speed || 15),
        weatherCode: imdData.current.weather_code || 3,
        conditionText: imdData.current.condition || "Cloudy",
        hourly: imdData.hourly || [],
        daily: imdData.daily || [],
        source: "IMD",
      });
    } catch (imdError) {
      console.warn("[WeatherWidget] IMD API unavailable, switching to Open-Meteo fallback:", imdError);
      // Priority 2: Fallback to Open-Meteo in Catch block
      try {
        await fetchOpenMeteoFallback();
      } catch (fallbackError: any) {
        console.error("[WeatherWidget] Weather fallback error:", fallbackError);
        setError(fallbackError.message || "Unable to fetch weather data");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
  }, [selectedState]);

  const displayTemp = (celsius: number) => {
    if (unit === "F") return Math.round((celsius * 9) / 5 + 32);
    return celsius;
  };

  const now = new Date();
  const dayTimeString = `${now.toLocaleDateString("en-US", { weekday: "long" })}, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Card className="border border-zinc-200/50 dark:border-zinc-800/80 shadow-2xl bg-zinc-950/90 text-zinc-100 backdrop-blur-xl overflow-hidden rounded-2xl transition-all duration-300">
      <CardHeader className="border-b border-zinc-800/70 bg-zinc-900/60 px-5 py-3.5">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          {/* Location Header */}
          <div className="flex items-center gap-2 text-zinc-200">
            <MapPin className="h-4 w-4 text-indigo-400" />
            <span className="font-bold text-sm sm:text-base">
              {stateInfo.city}, {selectedState}
            </span>
            <Badge variant="outline" className="text-[10px] bg-indigo-950/50 text-indigo-300 border-indigo-800/50 ml-1 font-mono">
              {weather?.source || "IMD"} Weather
            </Badge>
          </div>

          {/* Controls: State Selector Dropdown & Refresh */}
          <div className="flex items-center gap-2">
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100 w-[180px]">
                <SelectValue placeholder="Select State..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-h-60">
                {Object.keys(INDIAN_STATES_COORDINATES).map((st) => (
                  <SelectItem key={st} value={st} className="text-xs focus:bg-indigo-600 focus:text-white">
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={fetchWeatherData}
              disabled={isLoading}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              title="Refresh Weather"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Fetching live weather data...</p>
          </div>
        ) : error || !weather ? (
          <div className="text-center py-8 text-zinc-400 space-y-2">
            <p className="text-sm font-semibold text-red-400">Failed to load weather forecast.</p>
            <Button onClick={fetchWeatherData} size="sm" variant="outline" className="text-xs border-zinc-700">
              Try Again
            </Button>
          </div>
        ) : (
          <>
            {/* Top Weather Section: Temperature, Stats & Condition */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Left Column: Big Temp Display & Switcher */}
              <div className="flex items-center gap-4">
                <div className="shrink-0">{getWeatherCondition(weather.weatherCode).icon}</div>
                <div className="flex items-start">
                  <span className="text-5xl font-extrabold tracking-tight text-white font-mono">
                    {displayTemp(weather.currentTemp)}
                  </span>
                  <div className="flex items-center text-sm font-semibold ml-2 text-zinc-400 pt-1">
                    <button
                      onClick={() => setUnit("C")}
                      className={`hover:text-white transition-colors ${unit === "C" ? "text-white font-bold underline" : ""}`}
                    >
                      °C
                    </button>
                    <span className="mx-1">|</span>
                    <button
                      onClick={() => setUnit("F")}
                      className={`hover:text-white transition-colors ${unit === "F" ? "text-white font-bold underline" : ""}`}
                    >
                      °F
                    </button>
                  </div>
                </div>

                {/* Additional Stats: Precipitation, Humidity, Wind */}
                <div className="border-l border-zinc-800 pl-4 space-y-1 text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="h-3.5 w-3.5 text-blue-400" />
                    <span>Precipitation: <strong className="text-zinc-200">{weather.precipitationProb}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                    <span>Humidity: <strong className="text-zinc-200">{weather.humidity}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wind className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Wind: <strong className="text-zinc-200">{weather.windSpeed} km/h</strong></span>
                  </div>
                </div>
              </div>

              {/* Right Column: Condition & Day/Time */}
              <div className="text-left md:text-right space-y-1">
                <h4 className="text-xl font-bold text-zinc-100">{weather.conditionText}</h4>
                <p className="text-xs text-zinc-400 font-medium">{dayTimeString}</p>
              </div>
            </div>

            {/* Interactive Tabs for Graph View */}
            <div className="space-y-3">
              <div className="flex items-center gap-4 border-b border-zinc-800 pb-2 text-xs font-semibold">
                {(["Temperature", "Precipitation", "Wind"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`transition-all pb-1.5 border-b-2 ${activeTab === tab
                        ? "border-amber-400 text-amber-400 font-bold"
                        : "border-transparent text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Hourly Temperature / Metric SVG Smooth Curve Chart */}
              <div className="relative pt-6 pb-2 px-2 bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
                <svg className="w-full h-20 overflow-visible" viewBox="0 0 800 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* SVG Curve Line */}
                  <path
                    d={(() => {
                      const points = weather.hourly.map((h, idx) => {
                        const x = (idx / 7) * 800;
                        let val = h.temp;
                        if (activeTab === "Precipitation") val = h.precipitationProb;
                        if (activeTab === "Wind") val = h.windSpeed;
                        const min = Math.min(...weather.hourly.map((item) => (activeTab === "Temperature" ? item.temp : activeTab === "Precipitation" ? item.precipitationProb : item.windSpeed)));
                        const max = Math.max(...weather.hourly.map((item) => (activeTab === "Temperature" ? item.temp : activeTab === "Precipitation" ? item.precipitationProb : item.windSpeed))) || min + 1;
                        const y = 80 - ((val - min) / (max - min || 1)) * 50;
                        return { x, y };
                      });
                      let pathD = `M ${points[0].x} ${points[0].y}`;
                      for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                      }
                      return pathD;
                    })()}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                  />
                </svg>

                {/* Hourly Time Slots Label Row */}
                <div className="grid grid-cols-8 gap-1 text-center mt-2">
                  {weather.hourly.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center space-y-1">
                      <span className="text-[11px] font-bold text-zinc-200">
                        {activeTab === "Temperature"
                          ? `${displayTemp(item.temp)}°`
                          : activeTab === "Precipitation"
                            ? `${item.precipitationProb}%`
                            : `${item.windSpeed}k`}
                      </span>
                      <span className="text-[10px] text-zinc-400">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 7-Day Forecast Cards Strip */}
            <div className="pt-2 border-t border-zinc-800">
              <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">7-Day Weather Forecast</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {weather.daily.map((day, idx) => {
                  const cond = getWeatherCondition(day.weatherCode);
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${idx === 0
                          ? "bg-zinc-800/80 border-indigo-500/50 shadow-lg"
                          : "bg-zinc-900/30 border-zinc-800/60 hover:bg-zinc-800/40"
                        }`}
                    >
                      <span className="text-xs font-semibold text-zinc-300">{idx === 0 ? "Today" : day.dayName}</span>
                      <div className="my-1.5">{cond.icon}</div>
                      <div className="flex items-center gap-1 text-xs font-bold font-mono">
                        <span className="text-zinc-100">{displayTemp(day.tempMax)}°</span>
                        <span className="text-zinc-500 text-[10px]">{displayTemp(day.tempMin)}°</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherWidget;

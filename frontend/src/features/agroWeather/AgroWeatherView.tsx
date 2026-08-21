import React, { useState, useEffect } from "react";
import type { IDistrictWeather } from "./types";
import { WeatherService, type IGeocodingResult } from "./services/weatherService";
import {
  CloudSun,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  Sprout,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Compass,
  MapPin,
  Search,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "react-hot-toast";

const POPULAR_LOCATIONS = [
  { name: "Ludhiana", state: "Punjab", lat: 30.9010, lon: 75.8573 },
  { name: "Karnal", state: "Haryana", lat: 29.6857, lon: 76.9905 },
  { name: "Varanasi", state: "Uttar Pradesh", lat: 25.3176, lon: 82.9739 },
  { name: "Yavatmal", state: "Maharashtra", lat: 20.3888, lon: 78.1204 },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lon: 75.8648 },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lon: 75.8577 },
  { name: "Meerut", state: "Uttar Pradesh", lat: 28.9845, lon: 77.7064 },
  { name: "Guntur", state: "Andhra Pradesh", lat: 16.3067, lon: 80.4365 },
];

export const AgroWeatherView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IGeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [weather, setWeather] = useState<IDistrictWeather | null>(null);

  // Load default location (Ludhiana) on mount
  useEffect(() => {
    loadLocationWeather(POPULAR_LOCATIONS[0].name, POPULAR_LOCATIONS[0].state, POPULAR_LOCATIONS[0].lat, POPULAR_LOCATIONS[0].lon);
  }, []);

  const loadLocationWeather = async (name: string, state: string, lat: number, lon: number) => {
    setIsLoadingWeather(true);
    try {
      const data = await WeatherService.fetchLiveWeather(name, state, lat, lon);
      setWeather(data);
      setSearchResults([]);
      setSearchQuery("");
      toast.success(`${name}, ${state} का लाइव मौसम अपडेट लोड हो गया! 🌦️`);
    } catch {
      toast.error("लाइव मौसम लोड करने में समस्या हुई।");
    } finally {
      setIsLoadingWeather(false);
    }
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim().length >= 2) {
      setIsSearching(true);
      const results = await WeatherService.searchLocations(val);
      setSearchResults(results);
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectLocation = (loc: IGeocodingResult) => {
    loadLocationWeather(loc.name, loc.admin1 || loc.country, loc.latitude, loc.longitude);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 border border-amber-400/50 flex items-center justify-center text-white shadow-lg shadow-amber-950/60">
            <CloudSun className="w-7 h-7 text-amber-100 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                Live Agro-Weather & Smart Advisory (लाइव कृषि मौसम)
              </h2>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Satellite Data
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Search any district or city worldwide for real-time spray window, rain risk, & crop advisories.
            </p>
          </div>
        </div>

        {/* Global Live Location Search Box */}
        <div className="relative w-full md:w-80">
          <div className="flex items-center bg-slate-950 border border-slate-700/80 focus-within:border-emerald-500 rounded-xl px-3 py-2 shadow-inner">
            <Search className="w-4 h-4 text-emerald-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search any city/district (उदा. Pune, Karnal)..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="bg-transparent text-xs text-slate-200 focus:outline-none w-full placeholder:text-slate-500"
            />
            {isSearching && <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />}
          </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-800 animate-in fade-in duration-200">
              {searchResults.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className="w-full px-3 py-2 text-left hover:bg-emerald-950/70 flex items-center justify-between text-xs text-slate-200 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="font-semibold">{loc.name}</span>
                    <span className="text-slate-400 text-[11px]">
                      {loc.admin1 ? `${loc.admin1}, ` : ""}{loc.country}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-medium">Select</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Select Popular Districts Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
          Quick Districts (प्रमुख कृषि क्षेत्र):
        </span>
        {POPULAR_LOCATIONS.map((loc) => (
          <button
            key={loc.name}
            onClick={() => loadLocationWeather(loc.name, loc.state, loc.lat, loc.lon)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all shadow-sm active:scale-95 border ${
              weather?.district === loc.name
                ? "bg-emerald-950 text-emerald-300 border-emerald-600 font-bold"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800"
            }`}
          >
            {loc.name} ({loc.state})
          </button>
        ))}
      </div>

      {isLoadingWeather ? (
        <div className="p-16 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-300">
            Fetching real-time satellite agro-meteorological data...
          </p>
        </div>
      ) : weather ? (
        <>
          {/* Main Weather Hero Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Current Temp & Status Card */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl" />

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Current Live Weather (वर्तमान मौसम)
                  </span>
                  <h3 className="text-xl font-bold text-slate-100 mt-0.5">
                    {weather.district}, {weather.state}
                  </h3>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  {weather.rainChance > 50 ? (
                    <CloudRain className="w-8 h-8 text-blue-400" />
                  ) : (
                    <Sun className="w-8 h-8 text-amber-400" />
                  )}
                </div>
              </div>

              <div className="my-6 flex items-baseline gap-2">
                <span className="text-5xl font-black text-slate-50 tracking-tight">
                  {weather.temp}°
                </span>
                <span className="text-lg text-slate-400">C</span>
                <span className="text-xs text-emerald-400 ml-3 font-medium">
                  Feels like {weather.feelsLike}°C • {weather.condition}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800/80 text-center">
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Humidity (नमी)</span>
                  <span className="text-xs font-bold text-slate-200">{weather.humidity}%</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Rain Risk (बारिश)</span>
                  <span className="text-xs font-bold text-slate-200">{weather.rainChance}%</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Wind (हवा)</span>
                  <span className="text-xs font-bold text-slate-200">{weather.windSpeed} km/h</span>
                </div>
              </div>
            </div>

            {/* Actionable Agro-Advisories Card (Bilingual: Hindi + English) */}
            <div className="md:col-span-2 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl backdrop-blur-xl flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sprout className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-sm font-bold text-slate-200">
                    कृषि वैज्ञानिक सलाह (Actionable Agro-Advisories)
                  </h4>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    weather.sprayWindow === "OPTIMAL"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                      : weather.sprayWindow === "MODERATE"
                      ? "bg-amber-950 text-amber-300 border-amber-700"
                      : "bg-rose-950 text-rose-300 border-rose-700"
                  }`}
                >
                  Spray Window: {weather.sprayWindow}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Spray Advisory */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>कीटनाशक छिड़काव (Spray)</span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {weather.sprayAdvice}
                  </p>
                </div>

                {/* Irrigation Advisory */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs">
                    <Droplets className="w-4 h-4" />
                    <span>सिंचाई परामर्श (Irrigation)</span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {weather.irrigationAdvice}
                  </p>
                </div>

                {/* Disease Risk */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>रोग जोखिम (Disease Risk)</span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {weather.diseaseRisk}
                  </p>
                </div>
              </div>

              {/* Soil Moisture Bar */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span>खेत में मिट्टी की नमी (Soil Moisture Index):</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{ width: `${weather.soilMoisture}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-emerald-400">{weather.soilMoisture}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Day Forecast Grid */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-200">
                5-Day Agricultural Forecast (5 दिवसीय मौसम पूर्वानुमान)
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {weather.forecast.map((f, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center space-y-2 hover:border-slate-700 transition-all"
                >
                  <span className="text-xs font-semibold text-slate-400 block">{f.day}</span>
                  <div className="text-xl">
                    {f.rainProb > 50 ? "🌧️" : f.rainProb > 20 ? "⛅" : "☀️"}
                  </div>
                  <div className="text-xs font-bold text-slate-100">
                    {f.tempMax}° / <span className="text-slate-400">{f.tempMin}°</span>
                  </div>
                  <span className="text-[11px] text-slate-300 block font-medium">
                    {f.condition}
                  </span>
                  <span className="text-[10px] text-blue-400 font-medium block">
                    💧 {f.rainProb}% Rain
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

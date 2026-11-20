import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { WeatherZone, CropSmartAdvisoryResponse } from '../types';
import { 
  CloudRain, 
  SunMedium, 
  RotateCw, 
  ShieldAlert, 
  Wind, 
  Droplets, 
  Thermometer, 
  Bug, 
  Sprout, 
  Search, 
  MapPin, 
  Calendar,
  CloudSun,
  AlertCircle
} from 'lucide-react';
import { BackendOfflineError } from './BackendOfflineError';

const QUICK_CITIES = ['Ludhiana', 'Karnal', 'Roorkee', 'Jaipur', 'Bhopal', 'Pune', 'Patna', 'Shimla'];
const CROPS = ['Wheat', 'Paddy', 'Mustard', 'Cotton', 'Sugarcane', 'Soybean', 'Potato'];

export const WeatherAdvisoryView: React.FC = () => {
  const [zones, setZones] = useState<WeatherZone[]>([]);
  const [activeCityWeather, setActiveCityWeather] = useState<WeatherZone | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Ludhiana');
  const [selectedCrop, setSelectedCrop] = useState('Wheat');
  const [advisory, setAdvisory] = useState<CropSmartAdvisoryResponse | null>(null);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // Load all stations across India
  const loadStations = async () => {
    setIsLoadingStations(true);
    try {
      const data = await api.getWeatherAlerts();
      setZones(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load stations:', e);
      setHasError(true);
    } finally {
      setIsLoadingStations(false);
    }
  };

  // Load live dynamic weather for active city
  const loadCityWeather = async (cityName: string, cropName: string) => {
    setIsLoadingCity(true);
    setSearchError(null);
    try {
      const data = await api.getCityWeather(cityName, cropName);
      setActiveCityWeather(data);
      if (data.crop_advisory) {
        setAdvisory(data.crop_advisory);
      }
    } catch (e: any) {
      console.error('Failed to load live city weather:', e);
      setSearchError(`Unable to fetch live weather for "${cityName}". Please check the spelling or connection.`);
    } finally {
      setIsLoadingCity(false);
    }
  };

  // Initial load
  useEffect(() => {
    setHasError(false);
    loadStations();
    loadCityWeather(selectedCity, selectedCrop);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const target = searchQuery.trim();
    setSelectedCity(target);
    loadCityWeather(target, selectedCrop);
  };

  const handleSelectQuickCity = (city: string) => {
    setSearchQuery(city);
    setSelectedCity(city);
    loadCityWeather(city, selectedCrop);
  };

  const handleCropChange = (crop: string) => {
    setSelectedCrop(crop);
    loadCityWeather(selectedCity, crop);
  };

  const handleStationClick = (stationCity: string) => {
    const cleanName = stationCity.split(',')[0].trim();
    setSearchQuery(cleanName);
    setSelectedCity(cleanName);
    loadCityWeather(cleanName, selectedCrop);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (hasError && zones.length === 0 && !activeCityWeather) {
    return (
      <BackendOfflineError 
        onRetry={() => {
          setHasError(false);
          loadStations();
          loadCityWeather(selectedCity, selectedCrop);
        }}
        title="Weather Service Offline"
        message="Unable to connect to the Dynamic Weather API (/api/weather/alerts). Please ensure the backend is running."
      />
    );
  }

  // Active weather data
  const current = activeCityWeather;
  const isRed = current?.status?.includes('RED');
  const isYellow = current?.status?.includes('YELLOW');
  const alertColor = isRed ? 'rose' : isYellow ? 'amber' : 'emerald';

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-br from-sky-500/15 via-slate-900/90 to-indigo-500/10 backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center flex-wrap gap-4 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="bg-sky-500/20 text-sky-400 p-3 rounded-2xl border border-sky-500/30 shadow-lg shadow-sky-500/10">
              <CloudRain size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold font-['Outfit'] text-white">
                  Dynamic Agro-Meteorological Weather & Advisories
                </h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE MET-API
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Real-time open meteorological observations, 5-day forecasts & automated crop decision matrix
              </p>
            </div>
          </div>

          <button 
            className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-white/10 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            onClick={() => {
              loadStations();
              loadCityWeather(selectedCity, selectedCrop);
            }} 
            title="Refresh Live Weather Data"
          >
            <RotateCw size={14} className={isLoadingCity || isLoadingStations ? 'spin-anim' : ''} />
            <span>Refresh Live Data</span>
          </button>
        </div>

        {/* Dynamic City Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <MapPin size={18} className="text-sky-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any Indian city, district, or block (e.g. Ludhiana, Karnal, Jaipur, Pune, Roorkee)..."
                className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-white/15 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingCity}
              className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 cursor-pointer"
            >
              <Search size={16} />
              <span>{isLoadingCity ? 'Searching...' : 'Search Weather'}</span>
            </button>
          </div>

          {searchError && (
            <div className="mt-2 text-xs text-rose-300 flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
              <AlertCircle size={14} className="text-rose-400 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Quick Hub Chips */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3 text-xs">
            <span className="text-slate-400 text-[11px] font-medium mr-1">Major Hubs:</span>
            {QUICK_CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectQuickCity(c)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  selectedCity.toLowerCase() === c.toLowerCase()
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                📍 {c}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Active Searched Location Hero Card */}
      {current && (
        <div className={`backdrop-blur-md border rounded-2xl p-6 transition-all ${
          isRed 
            ? 'bg-rose-500/5 border-rose-500/30' 
            : isYellow 
            ? 'bg-amber-500/5 border-amber-500/30' 
            : 'bg-slate-900/80 border-white/10'
        }`}>
          <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {current.agro_zone}
                </span>
                <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                  alertColor === 'rose'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : alertColor === 'amber'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {current.status} • {current.status_desc}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit']">
                📍 {current.city}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Current Condition: <span className="font-semibold text-sky-400">{current.condition}</span> • Regional Focus Crops: {current.major_crops}
              </p>
            </div>

            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-4xl sm:text-5xl font-black text-white font-['Outfit']">
                  {current.temp}°
                </span>
                <span className="text-xl font-bold text-slate-400">C</span>
              </div>
              {current.apparent_temp !== undefined && (
                <div className="text-xs text-slate-400">
                  Feels like: <strong className="text-slate-200">{current.apparent_temp}°C</strong>
                </div>
              )}
            </div>
          </div>

          {/* Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
              <span className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                <Thermometer size={14} className="text-amber-400" /> Temperature
              </span>
              <span className="text-base sm:text-lg font-bold text-white">{current.temp}°C</span>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
              <span className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                <Wind size={14} className="text-sky-400" /> Wind Velocity
              </span>
              <span className="text-base sm:text-lg font-bold text-white">{current.wind}</span>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
              <span className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                <Droplets size={14} className="text-blue-400" /> Rel. Humidity
              </span>
              <span className="text-base sm:text-lg font-bold text-white">{current.humidity}</span>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
              <span className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                <CloudRain size={14} className="text-indigo-400" /> Precipitation
              </span>
              <span className="text-base sm:text-lg font-bold text-white">{current.precipitation || '0.0 mm'}</span>
            </div>
          </div>

          {/* Live Advisory Highlight */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs sm:text-sm text-slate-200 leading-relaxed border-l-4 border-l-sky-500">
            <strong className="text-sky-400 font-bold block mb-1">🌾 Live Agro-Meteorological Advisory:</strong>
            {current.advisory}
          </div>

          {/* 5-Day Forecast Strip */}
          {current.forecast && current.forecast.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-3">
                <Calendar size={14} className="text-sky-400" />
                <span>5-Day Outlook & Rainfall Probability</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {current.forecast.map((day, idx) => {
                  const dateObj = new Date(day.date);
                  const dayName = idx === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
                  return (
                    <div key={day.date} className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
                      <div className="text-[11px] font-bold text-slate-300 mb-1">{dayName}</div>
                      <div className="flex items-center justify-center text-sky-400 my-1">
                        <CloudSun size={20} />
                      </div>
                      <div className="text-xs font-extrabold text-white">
                        {day.max_temp}° <span className="text-slate-400 font-normal">/ {day.min_temp}°</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        🌧️ {day.rain_prob}% rain
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Crop-Specific Decision Matrix */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-500/20 text-amber-400 p-2 rounded-xl border border-amber-500/30">
              <SunMedium size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white font-['Outfit']">
                Crop-Specific Weather-Risk Decision Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Automated spray windows, irrigation recommendations & pest index calculated from live conditions
              </p>
            </div>
          </div>

          {/* Crop Selector Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {CROPS.map((c) => (
              <button
                key={c}
                onClick={() => handleCropChange(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  selectedCrop === c 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm' 
                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {advisory && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm sm:text-base font-bold text-white">
                Live Decisions for {advisory.crop_label || selectedCrop} in {selectedCity} {isLoadingCity ? '...' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Spray Window */}
              {advisory.spray_window && (
                <div className="bg-white/5 border border-emerald-500/25 rounded-xl p-4.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Sprout size={16} /> SPRAY WINDOW
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-extrabold">
                        {advisory.spray_window.badge}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white mb-1.5">{advisory.spray_window.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{advisory.spray_window.details}</p>
                  </div>
                </div>
              )}

              {/* Irrigation Recommendation */}
              {advisory.irrigation && (
                <div className="bg-white/5 border border-sky-500/25 rounded-xl p-4.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                        <Droplets size={16} /> IRRIGATION
                      </span>
                      <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded font-extrabold">
                        {advisory.irrigation.badge}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white mb-1.5">{advisory.irrigation.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{advisory.irrigation.details}</p>
                  </div>
                </div>
              )}

              {/* Pest Surveillance Index */}
              {advisory.pest_index && (
                <div className="bg-white/5 border border-amber-500/25 rounded-xl p-4.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Bug size={16} /> PEST INDEX
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-extrabold">
                        {advisory.pest_index.badge}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white mb-1.5">{advisory.pest_index.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{advisory.pest_index.details}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Regional Agro-Met Monitoring Stations */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-emerald-400" />
            <div>
              <h3 className="font-bold text-base text-white font-['Outfit']">
                Major Agro-Meteorological Stations
              </h3>
              <p className="text-xs text-slate-400">
                Click any station to view its live weather forecast and tailored advisories
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
            {zones.length} active stations
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {zones.map((zone) => {
            const isStationRed = zone.status?.includes('RED');
            const isStationYellow = zone.status?.includes('YELLOW');
            const isSelected = selectedCity.toLowerCase() === zone.city.split(',')[0].toLowerCase().trim();

            const borderColor = isSelected
              ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500'
              : isStationRed 
              ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60' 
              : isStationYellow 
              ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60' 
              : 'border-white/10 bg-slate-950/40 hover:border-white/20';

            const badgeBg = isStationRed 
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
              : isStationYellow 
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

            return (
              <div
                key={zone.id}
                onClick={() => handleStationClick(zone.city)}
                className={`border rounded-xl p-4 transition-all cursor-pointer hover:scale-[1.01] ${borderColor}`}
              >
                <div className="flex justify-between items-start mb-2 gap-2">
                  <div>
                    <span className="font-bold text-white text-sm block">
                      📍 {zone.city}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {zone.agro_zone}
                    </span>
                  </div>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border whitespace-nowrap ${badgeBg}`}>
                    {zone.status}
                  </span>
                </div>

                {/* Weather Metrics Strip */}
                <div className="grid grid-cols-3 gap-1.5 my-2.5 p-2 bg-black/40 rounded-lg text-center border border-white/5">
                  <div>
                    <span className="text-[9px] text-slate-400 block">Temp</span>
                    <span className="text-xs font-bold text-white">{zone.temp}°C</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">Wind</span>
                    <span className="text-xs font-bold text-white">{zone.wind}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">Humidity</span>
                    <span className="text-xs font-bold text-white">{zone.humidity}</span>
                  </div>
                </div>

                <div className="text-[11px] text-sky-300 mb-1.5 font-medium truncate">
                  {zone.condition}
                </div>

                <div className="text-[10px] text-slate-300 line-clamp-2 leading-relaxed">
                  {zone.advisory}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

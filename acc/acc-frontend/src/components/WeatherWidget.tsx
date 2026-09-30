import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader } from "./atoms/card";
import { Popover, PopoverContent, PopoverTrigger } from "./atoms/popover";
import { Button } from "./atoms/button";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
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
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { getDistrictsForState, getTaluksForDistrict } from "@/utils/indiaLocationData";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

// List of Indian States & UTs with central/capital coordinates for weather fetching
const INDIAN_STATES_COORDINATES: Record<string, { city: string; lat: number; lon: number }> = {
  "Andaman and Nicobar Islands": { city: "Port Blair", lat: 11.6234, lon: 92.7265 },
  "Andhra Pradesh": { city: "Vijayawada", lat: 16.5062, lon: 80.6480 },
  "Arunachal Pradesh": { city: "Itanagar", lat: 27.0844, lon: 93.6053 },
  "Assam": { city: "Guwahati", lat: 26.1433, lon: 91.7898 },
  "Bihar": { city: "Patna", lat: 25.5941, lon: 85.1376 },
  "Chandigarh": { city: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  "Chhattisgarh": { city: "Raipur", lat: 21.2514, lon: 81.6296 },
  "Dadra and Nagar Haveli and Daman and Diu": { city: "Daman", lat: 20.4283, lon: 72.8397 },
  "Delhi": { city: "New Delhi", lat: 28.6139, lon: 77.2090 },
  "Goa": { city: "Panaji", lat: 15.4909, lon: 73.8278 },
  "Gujarat": { city: "Gandhinagar", lat: 23.2156, lon: 72.6369 },
  "Haryana": { city: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  "Himachal Pradesh": { city: "Shimla", lat: 31.1048, lon: 77.1734 },
  "Jammu and Kashmir": { city: "Srinagar", lat: 34.0837, lon: 74.7973 },
  "Jharkhand": { city: "Ranchi", lat: 23.3441, lon: 85.3096 },
  "Karnataka": { city: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  "Kerala": { city: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366 },
  "Ladakh": { city: "Leh", lat: 34.1526, lon: 77.5771 },
  "Lakshadweep": { city: "Kavaratti", lat: 10.5667, lon: 72.6417 },
  "Madhya Pradesh": { city: "Bhopal", lat: 23.2599, lon: 77.4126 },
  "Maharashtra": { city: "Mumbai", lat: 19.0760, lon: 72.8777 },
  "Manipur": { city: "Imphal", lat: 24.8170, lon: 93.9368 },
  "Meghalaya": { city: "Shillong", lat: 25.5788, lon: 91.8933 },
  "Mizoram": { city: "Aizawl", lat: 23.7271, lon: 92.7176 },
  "Nagaland": { city: "Kohima", lat: 25.6751, lon: 94.1086 },
  "Odisha": { city: "Bhubaneswar", lat: 20.2961, lon: 85.8245 },
  "Puducherry": { city: "Puducherry", lat: 11.9416, lon: 79.8083 },
  "Punjab": { city: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  "Rajasthan": { city: "Jaipur", lat: 26.9124, lon: 75.7873 },
  "Sikkim": { city: "Gangtok", lat: 27.3389, lon: 88.6065 },
  "Tamil Nadu": { city: "Chennai", lat: 13.0827, lon: 80.2707 },
  "Telangana": { city: "Hyderabad", lat: 17.3850, lon: 78.4867 },
  "Tripura": { city: "Agartala", lat: 23.8315, lon: 91.2868 },
  "Uttar Pradesh": { city: "Lucknow", lat: 26.8467, lon: 80.9462 },
  "Uttarakhand": { city: "Dehradun", lat: 30.3165, lon: 78.0322 },
  "West Bengal": { city: "Kolkata", lat: 22.5726, lon: 88.3639 },
};

export interface FarmerLocation {
  state?: string;
  district?: string;
  taluk?: string; // Block / Taluk / Tehsil
  village?: string;
}

export interface WeatherWidgetProps {
  defaultState?: string;
  farmerLocation?: FarmerLocation;
}

interface GeocodePlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string; // State
  admin2?: string; // District
  admin3?: string; // Taluk / Sub-district
}

interface ResolvedLocation {
  state: string;
  district?: string;
  taluk?: string;
  village?: string;
  lat: number;
  lon: number;
  displayName: string;
  isFromProfile: boolean;
}

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
  tempMax: number;
  tempMin: number;
  currentTemp?: number;
  precipitationProb: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  conditionText: string;
  pressure?: number | string;
  stationName?: string;
  distanceKm?: number | null;
  observationTime?: string;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  source: "IMD (India Meteorological Department)";
}

// In-memory cache for OpenStreetMap Nominatim geocoding requests
const geocodeCache = new Map<string, GeocodePlace[]>();

async function searchOsmNominatim(query: string, stateFilter?: string): Promise<GeocodePlace[]> {
  const cleanName = query.split(",")[0].trim();
  if (cleanName.length < 2) return [];

  const cacheKey = `${cleanName.toLowerCase()}__${(stateFilter || "").toLowerCase()}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const searchParam = stateFilter ? `${cleanName}, ${stateFilter}, India` : `${cleanName}, India`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchParam)}&countrycodes=in&format=json&addressdetails=1&limit=5`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: GeocodePlace[] = (data || []).map((r: any) => ({
      id: r.place_id,
      name: r.address?.village || r.address?.suburb || r.address?.town || r.address?.city || r.name || cleanName,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      admin1: r.address?.state || "",
      admin2: r.address?.state_district || r.address?.county || "",
      admin3: r.address?.subdistrict || r.address?.taluk || r.address?.tehsil || "",
    }));

    let filtered = results;
    if (stateFilter) {
      const sf = stateFilter.toLowerCase();
      const stateMatches = results.filter(
        (r) =>
          r.admin1?.toLowerCase().includes(sf) ||
          sf.includes(r.admin1?.toLowerCase() || "")
      );
      if (stateMatches.length > 0) {
        filtered = stateMatches;
      }
    }

    geocodeCache.set(cacheKey, filtered);
    return filtered;
  } catch (err) {
    console.warn("[WeatherWidget] OSM Nominatim geocoding lookup failed:", err);
    return [];
  }
}

// Reusable Searchable Dropdown with search embedded directly inside the dropdown menu
interface SearchableDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  onDynamicSearch?: (query: string) => Promise<GeocodePlace[]>;
  onSelectDynamicPlace?: (place: GeocodePlace) => void;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search...",
  disabled = false,
  onDynamicSearch,
  onSelectDynamicPlace,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dynamicResults, setDynamicResults] = useState<GeocodePlace[]>([]);
  const [isSearchingDynamic, setIsSearchingDynamic] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Reset search when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setDynamicResults([]);
    }
  }, [isOpen]);

  // Filter static options
  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Dynamic geocoding search if no static match
  useEffect(() => {
    if (!isOpen || !onDynamicSearch) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const q = search.trim();
    if (q.length >= 2 && filteredOptions.length === 0) {
      setIsSearchingDynamic(true);
      searchDebounceRef.current = setTimeout(async () => {
        const results = await onDynamicSearch(q);
        setDynamicResults(results);
        setIsSearchingDynamic(false);
      }, 250);
    } else {
      setDynamicResults([]);
      setIsSearchingDynamic(false);
    }
  }, [search, isOpen, filteredOptions.length, onDynamicSearch]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-7.5 w-full items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
      >
        <span className="truncate text-left font-medium">
          {value || <span className="text-zinc-400 dark:text-zinc-500 font-normal">{placeholder}</span>}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-50 ml-1.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu with Embedded Search */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-40 flex flex-col">
          {/* Search Input right inside the dropdown */}
          <div className="p-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2 h-3 w-3 text-zinc-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-6.5 text-[11px] pl-6.5 pr-6 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Items List */}
          <div className="overflow-y-auto max-h-44 p-1 space-y-0.5 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt.toLowerCase() === value.toLowerCase();
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between transition-colors ${isSelected
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                      }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                );
              })
            ) : isSearchingDynamic ? (
              <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                <span>Searching online...</span>
              </div>
            ) : dynamicResults.length > 0 ? (
              <div>
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
                  Online Locations
                </div>
                {dynamicResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      if (onSelectDynamicPlace) {
                        onSelectDynamicPlace(place);
                      } else {
                        onChange(place.name);
                      }
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/60 flex items-center justify-between text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    <span className="font-semibold truncate">{place.name}</span>
                    <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                      {[place.admin2, place.admin1].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : search.trim().length >= 2 ? (
              <button
                type="button"
                onClick={() => {
                  onChange(search.trim());
                  setIsOpen(false);
                }}
                className="w-full text-left px-2 py-2 rounded-md text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 font-semibold flex items-center gap-1.5"
              >
                <Search className="h-3 w-3" />
                <span>Use "{search.trim()}"</span>
              </button>
            ) : (
              <div className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                {options.length === 0 ? "No options available" : "No matches found"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Weather WMO Code mapping helper
const getWeatherCondition = (code: number, sizeClass = "h-7 w-7"): { text: string; icon: React.ReactNode } => {
  if (code === 0) return { text: "Sunny / Clear", icon: <Sun className={`${sizeClass} text-amber-400`} /> };
  if (code === 1 || code === 2) return { text: "Partly Cloudy", icon: <Cloud className={`${sizeClass} text-sky-400`} /> };
  if (code === 3) return { text: "Cloudy", icon: <Cloud className={`${sizeClass} text-zinc-400`} /> };
  if (code >= 51 && code <= 67) return { text: "Rainy", icon: <CloudRain className={`${sizeClass} text-blue-400`} /> };
  if (code >= 80 && code <= 82) return { text: "Showers", icon: <CloudRain className={`${sizeClass} text-indigo-400`} /> };
  if (code >= 95 && code <= 99) return { text: "Thunderstorm", icon: <CloudLightning className={`${sizeClass} text-purple-400`} /> };
  if (code >= 71 && code <= 77) return { text: "Snowy", icon: <CloudSnow className={`${sizeClass} text-cyan-300`} /> };
  return { text: "Cloudy", icon: <Cloud className={`${sizeClass} text-zinc-400`} /> };
};

// Helper to normalize fuzzy/abbreviated Indian state names
const normalizeStateName = (inputState?: string): string => {
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
    ch: "Chandigarh",
    py: "Puducherry",
    la: "Ladakh",
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

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  defaultState = "Karnataka",
  farmerLocation,
}) => {
  // Active resolved location for weather display
  const [activeLocation, setActiveLocation] = useState<ResolvedLocation>(() => {
    const norm = normalizeStateName(defaultState);
    const defInfo = INDIAN_STATES_COORDINATES[norm] || INDIAN_STATES_COORDINATES["Karnataka"];
    return {
      state: norm,
      lat: defInfo.lat,
      lon: defInfo.lon,
      displayName: `${defInfo.city}, ${norm}`,
      isFromProfile: false,
    };
  });

  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [unit, setUnit] = useState<"C" | "F">("C");
  const [activeTab, setActiveTab] = useState<"Temperature" | "Precipitation" | "Wind">("Temperature");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Ref to track the last resolved farmer location fingerprint
  const lastFarmerLocationKeyRef = useRef<string>("");

  // Fingerprint for the current farmer profile location details
  const farmerLocationKey = [
    farmerLocation?.state || "",
    farmerLocation?.district || "",
    farmerLocation?.taluk || "",
    farmerLocation?.village || "",
  ]
    .map((s) => s.trim().toLowerCase())
    .join("|");

  // Popover state
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  const [selectedState, setSelectedState] = useState<string>(() => activeLocation.state);
  const [selectedDistrict, setSelectedDistrict] = useState<string>(() => activeLocation.district || "");
  const [selectedTaluk, setSelectedTaluk] = useState<string>(() => activeLocation.taluk || "");

  // Pre-loaded dropdown lists
  const availableDistricts = getDistrictsForState(selectedState);
  const availableTaluks = getTaluksForDistrict(selectedDistrict);

  // Helper to format clean breadcrumb
  const buildBreadcrumb = (parts: {
    village?: string;
    taluk?: string;
    district?: string;
    state: string;
    fallbackCity?: string;
  }): string => {
    const list: string[] = [];
    const v = parts.village?.trim();
    const t = parts.taluk?.trim();
    const d = parts.district?.trim();
    const s = parts.state?.trim();

    if (v) {
      list.push(v);
    }
    if (t && (!v || t.toLowerCase() !== v.toLowerCase())) {
      list.push(t);
    }
    if (d && (!t || d.toLowerCase() !== t.toLowerCase()) && (!v || d.toLowerCase() !== v.toLowerCase())) {
      list.push(d);
    }
    if (list.length === 0 && parts.fallbackCity) {
      list.push(parts.fallbackCity);
    }
    if (s) {
      list.push(s);
    }
    return list.join(", ");
  };

  // Hierarchical location resolver: Village (if present) -> Taluk/Block -> District -> State
  const resolveLocationHierarchically = useCallback(async (loc: FarmerLocation) => {
    const rawState = loc.state?.trim() || "";
    const rawDistrict = loc.district?.trim() || "";
    const rawTaluk = loc.taluk?.trim() || "";
    const rawVillage = loc.village?.trim() || "";

    const normalizedState = normalizeStateName(rawState || defaultState);
    const stateInfo = INDIAN_STATES_COORDINATES[normalizedState] || INDIAN_STATES_COORDINATES["Karnataka"];

    // Level 1: Village level (highest precision when present in farmer profile)
    if (rawVillage && rawVillage.toLowerCase() !== "all" && rawVillage.length >= 2) {
      const villageResults = await searchOsmNominatim(rawVillage, normalizedState);
      if (villageResults.length > 0) {
        const matched = rawDistrict
          ? villageResults.find(
            (r) =>
              r.admin2?.toLowerCase().includes(rawDistrict.toLowerCase()) ||
              rawDistrict.toLowerCase().includes(r.admin2?.toLowerCase() || "")
          ) || villageResults[0]
          : villageResults[0];

        const resTaluk = rawTaluk || matched.admin3 || "";
        const resDistrict = rawDistrict || matched.admin2 || "";
        const breadcrumb = buildBreadcrumb({
          village: rawVillage,
          taluk: resTaluk,
          district: resDistrict,
          state: normalizedState,
        });

        setActiveLocation({
          state: normalizedState,
          district: resDistrict,
          taluk: resTaluk,
          village: rawVillage,
          lat: matched.latitude,
          lon: matched.longitude,
          displayName: breadcrumb,
          isFromProfile: true,
        });
        setSelectedState(normalizedState);
        setSelectedDistrict(resDistrict);
        setSelectedTaluk(resTaluk);
        return;
      }
    }

    // Level 2: Taluk / Block (if village not present or village geocoding returned no results)
    if (rawTaluk && rawTaluk.toLowerCase() !== "all" && rawTaluk.length >= 2) {
      const results = await searchOsmNominatim(rawTaluk, normalizedState);
      if (results.length > 0) {
        const matched = rawDistrict
          ? results.find(
            (r) =>
              r.admin2?.toLowerCase().includes(rawDistrict.toLowerCase()) ||
              rawDistrict.toLowerCase().includes(r.admin2?.toLowerCase() || "")
          ) || results[0]
          : results[0];

        const resDistrict = rawDistrict || matched.admin2 || matched.admin3 || "";
        const breadcrumb = buildBreadcrumb({
          taluk: rawTaluk,
          district: resDistrict,
          state: normalizedState,
        });

        setActiveLocation({
          state: normalizedState,
          district: resDistrict,
          taluk: rawTaluk,
          village: undefined,
          lat: matched.latitude,
          lon: matched.longitude,
          displayName: breadcrumb,
          isFromProfile: true,
        });
        setSelectedState(normalizedState);
        setSelectedDistrict(resDistrict);
        setSelectedTaluk(rawTaluk);
        return;
      }
    }

    // Level 3: District (if taluk not present or geocoding returned no results)
    if (rawDistrict && rawDistrict.toLowerCase() !== "all" && rawDistrict.length >= 2) {
      const results = await searchOsmNominatim(rawDistrict, normalizedState);
      if (results.length > 0) {
        const top = results[0];
        const breadcrumb = buildBreadcrumb({
          district: rawDistrict,
          state: normalizedState,
        });
        setActiveLocation({
          state: normalizedState,
          district: rawDistrict,
          taluk: undefined,
          village: undefined,
          lat: top.latitude,
          lon: top.longitude,
          displayName: breadcrumb,
          isFromProfile: true,
        });
        setSelectedState(normalizedState);
        setSelectedDistrict(rawDistrict);
        setSelectedTaluk("");
        return;
      } else {
        const breadcrumb = buildBreadcrumb({
          district: rawDistrict,
          state: normalizedState,
        });
        setActiveLocation({
          state: normalizedState,
          district: rawDistrict,
          taluk: undefined,
          village: undefined,
          lat: stateInfo.lat,
          lon: stateInfo.lon,
          displayName: breadcrumb,
          isFromProfile: true,
        });
        setSelectedState(normalizedState);
        setSelectedDistrict(rawDistrict);
        setSelectedTaluk("");
        return;
      }
    }

    // Level 4: State capital fallback
    const breadcrumb = buildBreadcrumb({
      state: normalizedState,
      fallbackCity: stateInfo.city,
    });
    setActiveLocation({
      state: normalizedState,
      district: undefined,
      taluk: undefined,
      village: undefined,
      lat: stateInfo.lat,
      lon: stateInfo.lon,
      displayName: breadcrumb,
      isFromProfile: Boolean(rawState),
    });
    setSelectedState(normalizedState);
    setSelectedDistrict("");
    setSelectedTaluk("");
  }, [defaultState]);

  // Synchronize whenever farmer profile location details change
  useEffect(() => {
    const hasLocationData = Boolean(
      farmerLocation &&
      (farmerLocation.state ||
        farmerLocation.district ||
        farmerLocation.taluk ||
        farmerLocation.village)
    );

    const isNewLocation = farmerLocationKey !== lastFarmerLocationKeyRef.current;

    if (isNewLocation) {
      lastFarmerLocationKeyRef.current = farmerLocationKey;

      // When the farmer profile location details change, immediately reset manual override
      setIsManualOverride(false);

      if (hasLocationData && farmerLocation) {
        resolveLocationHierarchically(farmerLocation);
      } else if (defaultState) {
        const norm = normalizeStateName(defaultState);
        const stateInfo = INDIAN_STATES_COORDINATES[norm] || INDIAN_STATES_COORDINATES["Karnataka"];
        setActiveLocation({
          state: norm,
          lat: stateInfo.lat,
          lon: stateInfo.lon,
          displayName: `${stateInfo.city}, ${norm}`,
          isFromProfile: false,
        });
        setSelectedState(norm);
        setSelectedDistrict("");
        setSelectedTaluk("");
      }
    }
  }, [farmerLocationKey, farmerLocation, defaultState, resolveLocationHierarchically]);

  // Handle State Change in Popover
  const handleStateChange = (newState: string) => {
    setSelectedState(newState);
    setSelectedDistrict("");
    setSelectedTaluk("");
    setIsManualOverride(true);

    const stateInfo = INDIAN_STATES_COORDINATES[newState] || INDIAN_STATES_COORDINATES["Karnataka"];
    const breadcrumb = buildBreadcrumb({
      state: newState,
      fallbackCity: stateInfo.city,
    });
    setActiveLocation({
      state: newState,
      district: undefined,
      taluk: undefined,
      village: undefined,
      lat: stateInfo.lat,
      lon: stateInfo.lon,
      displayName: breadcrumb,
      isFromProfile: false,
    });
  };

  // Handle District selection from Dropdown
  const handleSelectDistrictName = async (districtName: string) => {
    setSelectedDistrict(districtName);
    setSelectedTaluk(""); // Reset taluk when district changes
    setIsManualOverride(true);

    const results = await searchOsmNominatim(districtName, selectedState);
    const breadcrumb = buildBreadcrumb({
      district: districtName,
      state: selectedState,
    });

    if (results.length > 0) {
      const top = results[0];
      setActiveLocation({
        state: selectedState,
        district: districtName,
        taluk: undefined,
        village: undefined,
        lat: top.latitude,
        lon: top.longitude,
        displayName: breadcrumb,
        isFromProfile: false,
      });
    } else {
      const stateInfo = INDIAN_STATES_COORDINATES[selectedState] || INDIAN_STATES_COORDINATES["Karnataka"];
      setActiveLocation({
        state: selectedState,
        district: districtName,
        taluk: undefined,
        village: undefined,
        lat: stateInfo.lat,
        lon: stateInfo.lon,
        displayName: breadcrumb,
        isFromProfile: false,
      });
    }
  };

  // Handle Taluk selection from Dropdown
  const handleSelectTalukName = async (talukName: string) => {
    setSelectedTaluk(talukName);
    setIsManualOverride(true);

    const results = await searchOsmNominatim(talukName, selectedState);
    const breadcrumb = buildBreadcrumb({
      taluk: talukName,
      district: selectedDistrict,
      state: selectedState,
    });

    if (results.length > 0) {
      const matched = selectedDistrict
        ? results.find(
          (r) =>
            r.admin2?.toLowerCase().includes(selectedDistrict.toLowerCase()) ||
            selectedDistrict.toLowerCase().includes(r.admin2?.toLowerCase() || "")
        ) || results[0]
        : results[0];

      setActiveLocation({
        state: selectedState,
        district: selectedDistrict || matched.admin2,
        taluk: talukName,
        village: undefined,
        lat: matched.latitude,
        lon: matched.longitude,
        displayName: breadcrumb,
        isFromProfile: false,
      });
    } else {
      setActiveLocation((prev) => ({
        ...prev,
        taluk: talukName,
        village: undefined,
        displayName: breadcrumb,
        isFromProfile: false,
      }));
    }
  };

  // Dynamic geocode place selection for District
  const handleSelectDistrictPlace = (place: GeocodePlace) => {
    const districtName = place.name;
    setSelectedDistrict(districtName);
    setSelectedTaluk("");
    setIsManualOverride(true);

    const breadcrumb = buildBreadcrumb({
      district: districtName,
      state: selectedState,
    });
    setActiveLocation({
      state: selectedState,
      district: districtName,
      taluk: undefined,
      village: undefined,
      lat: place.latitude,
      lon: place.longitude,
      displayName: breadcrumb,
      isFromProfile: false,
    });
  };

  // Dynamic geocode place selection for Taluk
  const handleSelectTalukPlace = (place: GeocodePlace) => {
    const talukName = place.name;
    setSelectedTaluk(talukName);
    setIsManualOverride(true);

    const breadcrumb = buildBreadcrumb({
      taluk: talukName,
      district: selectedDistrict || place.admin2,
      state: selectedState,
    });
    setActiveLocation({
      state: selectedState,
      district: selectedDistrict || place.admin2,
      taluk: talukName,
      village: undefined,
      lat: place.latitude,
      lon: place.longitude,
      displayName: breadcrumb,
      isFromProfile: false,
    });
  };

  // Reset to profile location
  const handleResetToProfile = () => {
    setIsManualOverride(false);
    if (farmerLocation && (farmerLocation.state || farmerLocation.district || farmerLocation.taluk)) {
      resolveLocationHierarchically(farmerLocation);
    } else {
      const norm = normalizeStateName(defaultState);
      const stateInfo = INDIAN_STATES_COORDINATES[norm] || INDIAN_STATES_COORDINATES["Karnataka"];
      setActiveLocation({
        state: norm,
        lat: stateInfo.lat,
        lon: stateInfo.lon,
        displayName: `${stateInfo.city}, ${norm}`,
        isFromProfile: false,
      });
      setSelectedState(norm);
      setSelectedDistrict("");
      setSelectedTaluk("");
    }
    setIsPopoverOpen(false);
  };

  // Weather data fetching directly from India Meteorological Department (IMD) endpoint
  const fetchWeatherData = async () => {
    setIsLoading(true);
    setError(null);

    const lat = activeLocation.lat;
    const lon = activeLocation.lon;
    const state = activeLocation.state || "";
    const district = activeLocation.district || "";
    const taluk = activeLocation.taluk || "";
    const village = activeLocation.village || "";

    try {
      const queryParams = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
      });
      if (state) queryParams.set("state", state);
      if (district) queryParams.set("district", district);
      if (taluk) queryParams.set("taluk", taluk);
      if (village) queryParams.set("village", village);

      const imdData = await apiFetch<WeatherData>(
        `${env.apiBaseUrl()}/weather/imd?${queryParams.toString()}`
      );

      if (!imdData || (imdData.tempMax === undefined && imdData.currentTemp === undefined)) {
        throw new Error("Invalid response received from IMD weather service");
      }

      setWeather({
        tempMax: Math.round(imdData.tempMax ?? imdData.currentTemp ?? 0),
        tempMin: Math.round(imdData.tempMin ?? imdData.currentTemp ?? 0),
        currentTemp: imdData.currentTemp !== undefined ? Math.round(imdData.currentTemp) : undefined,
        precipitationProb: imdData.precipitationProb ?? 0,
        humidity: Math.round(imdData.humidity ?? 0),
        windSpeed: Math.round(imdData.windSpeed ?? 0),
        weatherCode: imdData.weatherCode,
        conditionText: imdData.conditionText,
        hourly: imdData.hourly || [],
        daily: imdData.daily || [],
        source: "IMD (India Meteorological Department)",
        stationName: imdData.stationName,
        observationTime: imdData.observationTime,
      });
    } catch (imdError: any) {
      console.error("[WeatherWidget] IMD API fetch error:", imdError);
      setWeather(null);
      setError(imdError.message || "Unable to fetch IMD weather data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
  }, [activeLocation.lat, activeLocation.lon]);

  const displayTemp = (celsius: number) => {
    if (unit === "F") return Math.round((celsius * 9) / 5 + 32);
    return celsius;
  };

  const now = new Date();
  const dayTimeString = `${now.toLocaleDateString("en-US", { weekday: "long" })}, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Card className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg text-zinc-900 dark:text-zinc-100 overflow-hidden rounded-2xl transition-all duration-300">
      <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2.5">
        {/* Row 1: Location & Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Location Header - Clean Breadcrumb Display */}
          <div
            className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 cursor-pointer select-none min-w-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={activeLocation.displayName}
          >
            <MapPin className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="font-bold text-base sm:text-lg text-zinc-900 dark:text-zinc-100 tracking-tight truncate max-w-[210px] sm:max-w-[300px]">
              {activeLocation.displayName}
            </span>
          </div>

          {/* Controls: Change Location Popover + Refresh + Accordion Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Location Popover for manual selection: State, District, Taluk */}
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-sm flex items-center gap-1 rounded-lg"
                  title="Change Location (State, District, Taluk dropdowns)"
                >
                  <MapPin className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Location</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-h-[85vh] overflow-y-auto p-3.5 space-y-3.5 shadow-2xl border-zinc-200 dark:border-zinc-800 rounded-xl" align="end">
                {/* Popover Header */}
                <div className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 pb-2">
                  <div>
                    <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                      Select Weather Location
                    </h4>
                  </div>
                  {isManualOverride && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetToProfile}
                      className="h-6 px-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center gap-1 font-semibold rounded-md"
                      title="Reset to Farmer Profile location"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </Button>
                  )}
                </div>

                {/* 1. State Searchable Dropdown */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    State
                  </Label>
                  <SearchableDropdown
                    value={selectedState}
                    onChange={handleStateChange}
                    options={Object.keys(INDIAN_STATES_COORDINATES)}
                    placeholder="Select State..."
                    searchPlaceholder="Search state (e.g. Karnataka)..."
                  />
                </div>

                {/* 2. District Searchable Dropdown */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                      District
                    </Label>
                    {selectedDistrict && (
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[140px]">
                        Active: <strong className="text-indigo-600 dark:text-indigo-400">{selectedDistrict}</strong>
                      </span>
                    )}
                  </div>
                  <SearchableDropdown
                    value={selectedDistrict}
                    onChange={handleSelectDistrictName}
                    options={availableDistricts}
                    placeholder={
                      availableDistricts.length > 0
                        ? "Select District..."
                        : "Select State first"
                    }
                    searchPlaceholder="Search district (e.g. Mandya)..."
                    disabled={availableDistricts.length === 0}
                    onDynamicSearch={(q) => searchOsmNominatim(`${q} ${selectedState}`, selectedState)}
                    onSelectDynamicPlace={handleSelectDistrictPlace}
                  />
                </div>

                {/* 3. Taluk / Block Searchable Dropdown */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                      Taluk / Block
                    </Label>
                    {selectedTaluk && (
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[140px]">
                        Active: <strong className="text-indigo-600 dark:text-indigo-400">{selectedTaluk}</strong>
                      </span>
                    )}
                  </div>
                  <SearchableDropdown
                    value={selectedTaluk}
                    onChange={handleSelectTalukName}
                    options={availableTaluks}
                    placeholder={
                      !selectedDistrict
                        ? "Select District first"
                        : availableTaluks.length > 0
                          ? "Select Taluk / Block..."
                          : "Search taluk / block..."
                    }
                    searchPlaceholder="Search taluk (e.g. Maddur)..."
                    disabled={!selectedDistrict}
                    onDynamicSearch={(q) => searchOsmNominatim(`${q} ${selectedDistrict || ""} ${selectedState}`, selectedState)}
                    onSelectDynamicPlace={handleSelectTalukPlace}
                  />
                </div>

                {/* Footer Controls */}
                <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {activeLocation.isFromProfile ? "Profile location" : "Custom location"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsPopoverOpen(false)}
                    className="h-6.5 px-3 text-xs font-semibold btn-primary-emerald rounded-md shadow-xs flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    <span>Done</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              onClick={fetchWeatherData}
              disabled={isLoading}
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-sm"
              title="Refresh Weather"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-7 w-7 p-0 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100/80 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-300/80 dark:border-zinc-700/80 rounded-lg shrink-0 shadow-sm transition-all hover:scale-105 active:scale-95"
              title={isCollapsed ? "Expand Weather Card" : "Collapse Weather Card"}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Row 2: Full-width Weather Summary Bar */}
        <div className="h-8.5 w-full flex items-center justify-between px-3 rounded-lg bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 text-xs font-semibold shadow-sm overflow-hidden">
          {weather ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-extrabold text-zinc-900 dark:text-zinc-100 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">
                  {weather.tempMin !== weather.tempMax
                    ? `${displayTemp(weather.tempMin)}° – ${displayTemp(weather.tempMax)}°${unit}`
                    : `${displayTemp(weather.tempMin)}°${unit}`}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 font-medium truncate max-w-[110px] sm:max-w-[160px]">
                  {weather.conditionText}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 tracking-wide uppercase shrink-0">
                  IMD
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Droplets className="h-3 w-3 text-blue-500 shrink-0" />
                  <span>Rain: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{weather.precipitationProb}%</strong></span>
                </span>
                <span className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                  <Wind className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>Wind: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{weather.windSpeed} km/h</strong></span>
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] text-red-500 dark:text-red-400 font-medium truncate max-w-[220px]" title={error || ""}>
                {error ? "IMD Weather Unavailable" : "Fetching weather summary..."}
              </span>
              {error && (
                <button
                  type="button"
                  onClick={fetchWeatherData}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="p-3 sm:p-3.5 space-y-3 h-[360px] overflow-y-auto overscroll-contain pr-2 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-2">
              <RefreshCw className="h-5 w-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wider">Fetching live weather data...</p>
            </div>
          ) : error || !weather ? (
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 space-y-2">
              <div className="inline-flex p-2.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 mb-0.5">
                <CloudRain className="h-6 w-6 opacity-80" />
              </div>
              <p className="text-xs font-bold text-red-600 dark:text-red-400">
                Failed to fetch IMD weather data
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
                {error || "Could not connect to India Meteorological Department service"}
              </p>
              <Button onClick={fetchWeatherData} size="sm" variant="outline" className="h-7 text-xs border-zinc-200 dark:border-zinc-800 font-semibold mt-1">
                <RefreshCw className="h-3 w-3 mr-1" /> Try Again
              </Button>
            </div>
          ) : (
            <>
              {/* Top Weather Section: Temperature & Condition Header */}
              <div className="flex items-start justify-between gap-3">
                {/* Left: Weather Icon + Temperature Range & Unit Switcher */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="p-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 shrink-0">
                    {getWeatherCondition(weather.weatherCode, "h-8 w-8").icon}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white font-mono whitespace-nowrap">
                        {weather.tempMin !== weather.tempMax
                          ? `${displayTemp(weather.tempMin)}° – ${displayTemp(weather.tempMax)}°`
                          : `${displayTemp(weather.tempMin)}°`}
                      </span>
                      <div className="inline-flex items-center text-xs font-semibold text-zinc-400 bg-zinc-100/90 dark:bg-zinc-900/90 px-1.5 py-0.5 rounded-md border border-zinc-200/80 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setUnit("C")}
                          className={`hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer ${unit === "C" ? "text-zinc-900 dark:text-white font-bold" : "text-zinc-400"}`}
                        >
                          °C
                        </button>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
                        <button
                          type="button"
                          onClick={() => setUnit("F")}
                          className={`hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer ${unit === "F" ? "text-zinc-900 dark:text-white font-bold" : "text-zinc-400"}`}
                        >
                          °F
                        </button>
                      </div>
                    </div>
                    {weather.tempMin !== weather.tempMax ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap mt-0.5">
                        <span>Min: <strong className="text-blue-600 dark:text-blue-400 font-mono">{displayTemp(weather.tempMin)}°{unit}</strong></span>
                        <span className="text-zinc-300 dark:text-zinc-700">•</span>
                        <span>Max: <strong className="text-amber-600 dark:text-amber-400 font-mono">{displayTemp(weather.tempMax)}°{unit}</strong></span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">
                        Current IMD Observation
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Condition & Day/Time */}
                <div className="text-right space-y-0.5 min-w-0">
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {weather.conditionText}
                  </h4>
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                    {dayTimeString}
                  </p>
                </div>
              </div>

              {/* Key Weather Metrics Strip: Rain, Humidity, Wind */}
              <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 text-xs shadow-inner">
                <div className="flex items-center gap-1.5 justify-center py-0.5">
                  <Droplets className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Rain:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-[11px] whitespace-nowrap">{weather.precipitationProb}%</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center py-0.5 border-x border-zinc-200/60 dark:border-zinc-800/60">
                  <Thermometer className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Humidity:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-[11px] whitespace-nowrap">{weather.humidity}%</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center py-0.5">
                  <Wind className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Wind:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-[11px] whitespace-nowrap">{weather.windSpeed} km/h</span>
                </div>
              </div>

              {/* Interactive Tabs for Graph View */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-1 text-xs font-semibold">
                  {(["Temperature", "Precipitation", "Wind"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`transition-all pb-1 border-b-2 text-[11px] ${activeTab === tab
                        ? "border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400 font-bold"
                        : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Hourly Temperature / Metric SVG Smooth Curve Chart */}
                <div className="relative pt-2.5 pb-1 px-2 bg-zinc-100/50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/50 rounded-xl overflow-hidden">
                  <svg className="w-full h-12 overflow-visible" viewBox="0 0 800 80" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={(() => {
                        const points = weather.hourly.map((h, idx) => {
                          const x = (idx / 7) * 800;
                          let val = h.temp;
                          if (activeTab === "Precipitation") val = h.precipitationProb;
                          if (activeTab === "Wind") val = h.windSpeed;
                          const min = Math.min(...weather.hourly.map((item) => (activeTab === "Temperature" ? item.temp : activeTab === "Precipitation" ? item.precipitationProb : item.windSpeed)));
                          const max = Math.max(...weather.hourly.map((item) => (activeTab === "Temperature" ? item.temp : activeTab === "Precipitation" ? item.precipitationProb : item.windSpeed))) || min + 1;
                          const y = 65 - ((val - min) / (max - min || 1)) * 45;
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
                      strokeWidth="2"
                    />
                  </svg>

                  {/* Hourly Time Slots Label Row */}
                  <div className="grid grid-cols-8 gap-0.5 text-center mt-1">
                    {weather.hourly.map((item, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200">
                          {activeTab === "Temperature"
                            ? `${displayTemp(item.temp)}°`
                            : activeTab === "Precipitation"
                              ? `${item.precipitationProb}%`
                              : `${item.windSpeed}k`}
                        </span>
                        <span className="text-[9px] text-zinc-500 dark:text-zinc-400">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 7-Day Forecast Cards Strip */}
              <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <h5 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">7-Day Forecast</h5>
                <div className="grid grid-cols-7 gap-1">
                  {weather.daily.map((day, idx) => {
                    const cond = getWeatherCondition(day.weatherCode, "h-4 w-4");
                    return (
                      <div
                        key={idx}
                        className={`p-1 sm:p-1.5 rounded-lg border flex flex-col items-center justify-between text-center transition-all ${idx === 0
                          ? "bg-indigo-50/80 dark:bg-zinc-800/80 border-indigo-500/50 shadow-sm"
                          : "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
                          }`}
                      >
                        <span className="text-[9.5px] font-semibold text-zinc-700 dark:text-zinc-300 truncate w-full">{idx === 0 ? "Today" : day.dayName}</span>
                        <div className="my-0.5">{cond.icon}</div>
                        <div className="flex items-center gap-0.5 text-[9.5px] font-bold font-mono">
                          <span className="text-zinc-900 dark:text-zinc-100">{displayTemp(day.tempMax)}°</span>
                          <span className="text-zinc-400 dark:text-zinc-500 text-[8px]">{displayTemp(day.tempMin)}°</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* IMD Official Source Attribution & Station Badge */}
              <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                    IMD (India Meteorological Department)
                  </span>
                  {weather.stationName && (
                    <span className="truncate opacity-80 hidden sm:inline">
                      • Station: {weather.stationName}
                    </span>
                  )}
                </div>
                {weather.observationTime && (
                  <span className="font-mono text-[9px] text-zinc-400 shrink-0">
                    Obs: {weather.observationTime}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default WeatherWidget;

import { useState, useEffect, useRef } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import type { CallTranscript } from "./IncomingCallBox";
import { FarmerDetails } from "./FarmerDetails";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { toast } from "sonner";
import { Button } from "./atoms/button";
import {
  RotateCcw,
  Send,
  MessageSquare,
  Globe,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Copy,
  Check,
  Sparkles,
  FlaskConical,
  Pencil,
  Trash2,
  X,
  Mic,
  Loader2,
  Radio,
  Wind,
  Droplets,
  Gauge,
  MapPin,
  Clock,
} from "lucide-react";
import WeatherWidget from "./WeatherWidget";
import { useAccAgentThread } from "@/hooks/api/acc-agent/useAccAgentThread";
import { useAccAgentExtract } from "@/hooks/api/acc-agent/useAccAgentExtract";
import { useAccAgentUpdateState } from "@/hooks/api/acc-agent/useAccAgentUpdateState";
import { useAccAgentResume } from "@/hooks/api/acc-agent/useAccAgentResume";
import SarvamTranslatePairDropdown from "@/components/SarvamTranslatePairDropdown";
import { renderMarkdown } from "@/utils/markdownRenderer";
import { transcribeAudioWithSarvamDetailed } from "@/hooks/services/sarvamSttService";
import { translateService } from "@/hooks/services/translateService";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { Input } from "./atoms/input";
import { Textarea } from "./atoms/textarea";
import { Label } from "./atoms/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import type { GeneratedQuestion } from "@/hooks/services/questionService";
import type { ExtractDataResponse } from "@/hooks/services/accAgentService";
import { plivoService } from "@/hooks/api/plivo/api";

const DOMAIN_OPTIONS = [
  "Soil Health and Nutrient Management",
  "Irrigation and Water Management",
  "Insect - Pest Management",
  "Disease Management",
  "Seed and Variety Selection",
  "Cultural and Crop Management Practices",
  "Organic and Natural Farming",
  "Weed Management",
  "Climate, Weather & Stress Management",
  "Farm Tools & Mechanisation",
  "Post-Harvest Management & Storage",
  "Market Prices, MSP & Marketing",
  "Agricultural Schemes & Subsidies",
  "Credit, Loan & Insurance",
  "Capacity Building & Extension",
  "Rural Infrastructure",
  "Animal Husbandry & Livestock",
  "Fisheries & Aquaculture",
  "Horticulture & Landscaping",
  "Allied Agricultural Activities",
  "Others",
  "NA / Invalid Data",
];

// Auto-select season based on current month
const getAutoSelectedSeason = (): string => {
  const currentMonth = new Date().getMonth() + 1; // 1-12
  if (currentMonth >= 4 && currentMonth <= 8) {
    return "Kharif";
  } else if (currentMonth >= 9 && currentMonth <= 12) {
    return "Rabi";
  } else if (currentMonth >= 1 && currentMonth <= 3) {
    return "Rabi";
  } else {
    return "Kharif";
  }
};

export const stripMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .trim();
};

const getCompassDirection = (deg: number | string | undefined | null): string => {
  if (deg === null || deg === undefined || deg === "") return "";
  const d = Number(deg);
  if (isNaN(d)) return String(deg);
  const directions = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
  ];
  const idx = Math.round(d / 22.5) % 16;
  return directions[idx < 0 ? idx + 16 : idx];
};

const formatWeatherTime = (dateStr?: string, timeStr?: string) => {
  if (!dateStr && !timeStr) return "";
  let formattedTime = "";
  if (timeStr) {
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parts[1];
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      formattedTime = `${h12}:${m} ${ampm}`;
    } else {
      formattedTime = timeStr;
    }
  }

  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const month = d.toLocaleDateString("en-IN", { month: "short" });
        return formattedTime ? `${day} ${month}, ${formattedTime}` : `${day} ${month}`;
      }
    } catch { }
  }

  return [dateStr, formattedTime || timeStr].filter(Boolean).join(" ");
};

const getWeatherSource = (weatherInput: any): { label: string; tag: string } => {
  let weather = weatherInput;
  if (typeof weather === "string") {
    try {
      weather = JSON.parse(weather);
    } catch {
      return { label: "IMD Weather Service", tag: "IMD" };
    }
  }

  if (!weather || typeof weather !== "object") {
    return { label: "Weather Service", tag: "Weather" };
  }

  const rawSource = weather.source || weather.provider || weather.source_name;
  if (rawSource) {
    const s = String(rawSource).trim();
    return { label: s, tag: s.toUpperCase() };
  }

  const dataType = String(weather.data_type || "").toLowerCase();
  const res = weather.result || weather;

  if (dataType === "current_aws" || res?.station) {
    return {
      label: "IMD AWS (Automatic Weather Station)",
      tag: "IMD AWS",
    };
  }

  if (dataType === "forecast" || res?.today || res?.forecast) {
    return {
      label: "IMD Weather Forecast",
      tag: "IMD Forecast",
    };
  }

  if (dataType.includes("warning")) {
    return {
      label: "IMD Weather Warnings",
      tag: "IMD Warnings",
    };
  }

  if (dataType.includes("rainfall")) {
    return {
      label: "IMD Rainfall",
      tag: "IMD Rainfall",
    };
  }

  if (res?.imd_state_sid != null) {
    return {
      label: "IMD (India Meteorological Department)",
      tag: "IMD",
    };
  }

  return {
    label: "IMD (India Meteorological Department)",
    tag: "IMD",
  };
};

const renderWeatherInsights = (weatherInput: any) => {
  if (!weatherInput) return null;

  let weather = weatherInput;
  if (typeof weather === "string") {
    try {
      weather = JSON.parse(weather);
    } catch {
      return <p className="text-xs text-sky-900 dark:text-sky-300">{weather}</p>;
    }
  }

  if (typeof weather !== "object") {
    return null;
  }

  let result = weather.result || weather;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch { }
  }

  const dataType = String(weather.data_type || "").toLowerCase();
  const isAws = dataType === "current_aws" || Boolean(result?.station);

  // Fallback if neither structured AWS nor forecast
  if (!result || (typeof result === "object" && !isAws && !result.today && !result.forecast)) {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
        {Object.entries(result || weather).map(([key, val]) => {
          if (val === null || val === undefined || typeof val === "function" || key === "result")
            return null;
          return (
            <div key={key} className="flex gap-1.5">
              <span className="font-semibold capitalize text-sky-900 dark:text-sky-400">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="text-sky-850 dark:text-sky-300 truncate">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Branch 1: Automatic Weather Station (Live AWS Observation)
  if (isAws) {
    const station = result.station || {};
    const rawDistance = result.distance_km ?? result.distance ?? result.distance_to_station_km;
    const distance = rawDistance != null ? Number(rawDistance).toFixed(1) : null;
    const obsTime = formatWeatherTime(station.date, station.time);
    const compassDir = getCompassDirection(station.wind_direction_deg);
    const locationParts = [station.district, station.state].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(", ") : (weather.geocode?.state || "");

    const tempVal = station.temperature_c != null ? `${station.temperature_c}°C` : "--";
    const feelsLikeVal = station.feel_like_c != null ? `${station.feel_like_c}°C` : null;

    return (
      <div className="space-y-2.5 text-sky-900 dark:text-sky-300">
        {/* Station Sub-Bar: Clean Location, Distance, and Observed Time */}
        <div className="flex flex-wrap items-center justify-between text-[11px] pb-1.5 border-b border-sky-200/40 dark:border-sky-800/40 gap-1.5">
          <div className="flex items-center gap-1.5 text-sky-900 dark:text-sky-200">
            <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-semibold text-sky-950 dark:text-sky-100">
              {station.name || station.district || "Station"}
            </span>
            {locationStr && locationStr.toLowerCase() !== (station.name || "").toLowerCase() && (
              <span className="text-sky-600 dark:text-sky-400">
                • {locationStr}
              </span>
            )}
            {distance && (
              <span className="text-sky-600 dark:text-sky-400 font-normal">
                ({distance} km away)
              </span>
            )}
          </div>
          {obsTime && (
            <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium text-[10px]">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{obsTime}</span>
            </div>
          )}
        </div>

        {/* Primary Hero Row: Large Temp + Feels Like + Sky Condition */}
        <div className="flex items-center justify-between bg-white/50 dark:bg-zinc-950/40 rounded-xl p-3 border border-sky-100/60 dark:border-sky-900/40">
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-sky-950 dark:text-sky-50 tracking-tight">
              {tempVal}
            </span>
            {feelsLikeVal && (
              <span className="text-xs font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap">
                Feels like <strong className="font-semibold text-sky-900 dark:text-sky-200">{feelsLikeVal}</strong>
              </span>
            )}
          </div>
          <div className="text-right pl-2">
            <span className="text-sm font-bold text-sky-950 dark:text-sky-100 block">
              {station.weather_message || "Clear Sky"}
            </span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
              Sky Condition
            </span>
          </div>
        </div>

        {/* Stats Grid: 3 Sleek Metric Tiles */}
        <div className="grid grid-cols-3 gap-2">
          {/* Humidity */}
          <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
              <Droplets className="w-3 h-3 text-sky-500 shrink-0" />
              <span>Humidity</span>
            </div>
            <span className="text-sm font-bold text-sky-950 dark:text-sky-100">
              {station.humidity_pct != null ? `${station.humidity_pct}%` : "--"}
            </span>
          </div>

          {/* Wind */}
          <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
              <Wind className="w-3 h-3 text-sky-500 shrink-0" />
              <span>Wind</span>
            </div>
            <div className="flex items-baseline gap-1 text-sm font-bold text-sky-950 dark:text-sky-100 whitespace-nowrap">
              <span>{station.wind_speed_kmph != null ? `${station.wind_speed_kmph}` : "--"}</span>
              <span className="text-[10px] font-normal text-sky-600 dark:text-sky-400">km/h</span>
              {compassDir && (
                <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 ml-0.5">
                  {compassDir}
                </span>
              )}
            </div>
          </div>

          {/* Pressure */}
          <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
              <Gauge className="w-3 h-3 text-sky-500 shrink-0" />
              <span>Pressure</span>
            </div>
            <div className="flex items-baseline gap-1 text-sm font-bold text-sky-950 dark:text-sky-100 whitespace-nowrap">
              <span>{station.mslp || "--"}</span>
              {station.mslp && (
                <span className="text-[10px] font-normal text-sky-600 dark:text-sky-400">hPa</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Branch 2: Predictive Forecast format
  const today = result.today || {};
  const forecastList = result.forecast || [];
  const distance = today.distance_to_station_km != null ? Number(today.distance_to_station_km).toFixed(1) : null;
  const tempRange = (today.observed_min_temp || today.forecast_min_temp) && (today.observed_max_temp || today.forecast_max_temp)
    ? `${today.observed_min_temp || today.forecast_min_temp}°C – ${today.observed_max_temp || today.forecast_max_temp}°C`
    : "--";

  return (
    <div className="space-y-2.5 text-sky-900 dark:text-sky-300">
      {/* Station Sub-Bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] pb-1.5 border-b border-sky-200/40 dark:border-sky-800/40 gap-1.5">
        <div className="flex items-center gap-1.5 text-sky-900 dark:text-sky-200">
          <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="font-semibold text-sky-950 dark:text-sky-100">
            {today.station || "Forecast Station"}
          </span>
          {distance && (
            <span className="text-sky-600 dark:text-sky-400 font-normal">
              ({distance} km away)
            </span>
          )}
        </div>
        {today.date && (
          <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium text-[10px]">
            <Clock className="w-3 h-3 shrink-0" />
            <span>As of {today.date}</span>
          </div>
        )}
      </div>

      {/* Primary Hero Row */}
      <div className="flex items-center justify-between bg-white/50 dark:bg-zinc-950/40 rounded-xl p-3 border border-sky-100/60 dark:border-sky-900/40">
        <div>
          <span className="text-xl sm:text-2xl font-extrabold text-sky-950 dark:text-sky-50 tracking-tight">
            {tempRange}
          </span>
          <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium block">
            Expected Temperature Range
          </span>
        </div>
        <div className="text-right pl-2">
          <span className="text-sm font-bold text-sky-950 dark:text-sky-100 block">
            {today.forecast || "Forecast N/A"}
          </span>
          <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
            Outlook
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Humidity */}
        <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
            <Droplets className="w-3 h-3 text-sky-500 shrink-0" />
            <span>Humidity</span>
          </div>
          <span className="text-xs font-bold text-sky-950 dark:text-sky-100">
            {today.humidity_0830 || "--"}% / {today.humidity_1730 || "--"}%
          </span>
        </div>

        {/* Rain (Last 24h) */}
        <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
            <Wind className="w-3 h-3 text-sky-500 shrink-0" />
            <span>Rain (24h)</span>
          </div>
          <span className="text-xs font-bold text-sky-950 dark:text-sky-100 truncate">
            {today.past_24hrs_rainfall || "Nil"}
          </span>
        </div>

        {/* Solar */}
        <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-2.5 border border-sky-100/50 dark:border-sky-900/30 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold mb-1">
            <Clock className="w-3 h-3 text-sky-500 shrink-0" />
            <span>Sun Timings</span>
          </div>
          <span className="text-[11px] font-bold text-sky-950 dark:text-sky-100 whitespace-nowrap">
            🌅 {today.sunrise || "--"} • 🌇 {today.sunset || "--"}
          </span>
        </div>
      </div>

      {/* Multi-Day Forecast Table */}
      {forecastList.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
            Upcoming Forecast
          </p>
          <div className="overflow-x-auto rounded-lg border border-sky-100/50 dark:border-sky-900/30 bg-white/30 dark:bg-zinc-950/20">
            <table className="min-w-full text-xs text-left divide-y divide-sky-100/30 dark:divide-sky-900/30">
              <thead className="bg-sky-100/40 dark:bg-sky-950/40 text-sky-850 dark:text-sky-350">
                <tr>
                  <th className="px-3 py-1.5 font-semibold text-[11px]">Day</th>
                  <th className="px-3 py-1.5 font-semibold text-[11px]">Temp (Min/Max)</th>
                  <th className="px-3 py-1.5 font-semibold text-[11px]">Forecast Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100/20 dark:divide-sky-900/20">
                {forecastList.map((f: any, idx: number) => (
                  <tr key={idx} className="hover:bg-sky-50/20 dark:hover:bg-sky-950/10">
                    <td className="px-3 py-1.5 font-semibold text-sky-900 dark:text-sky-300">
                      Day {f.day || idx + 2}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-sky-950 dark:text-sky-200">
                      {f.min_temp}°C - {f.max_temp}°C
                    </td>
                    <td className="px-3 py-1.5 text-sky-850 dark:text-sky-300">
                      {f.forecast}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const CallInterface = () => {
  const [transcriptsList, setTranscriptsList] = useState<CallTranscript[]>([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callUuid, setCallUuid] = useState<string | null>(null);
  const [lastCallUuid, setLastCallUuid] = useState<string | null>(null);
  const callUuidRef = useRef<string | null>(null);
  const lastCallUuidRef = useRef<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  interface ExtGeneratedQuestion extends GeneratedQuestion {
    weather?: any;
    authorName?: string;
    sourceName?: string;
    sourceLink?: string;
  }
  const [questions, setQuestions] = useState<ExtGeneratedQuestion[]>([]);
  const [translatedQuestions, setTranslatedQuestions] = useState<Record<string, string>>({});
  const [translatedAnswers, setTranslatedAnswers] = useState<Record<string, string>>({});
  const [translatingQuestions, setTranslatingQuestions] = useState<Record<string, boolean>>({});
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const handleCopyAnswer = async (qnKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates((prev) => ({ ...prev, [qnKey]: true }));
      toast.success("Answer copied to clipboard!");
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [qnKey]: false }));
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast.error("Failed to copy answer.");
    }
  };

  const lastTranscriptRef = useRef("");

  // ACC Agent HITL hooks
  const { mutateAsync: createThread } = useAccAgentThread();
  const { mutateAsync: extractData, isPending: isExtracting } =
    useAccAgentExtract();
  const { mutateAsync: updateState } = useAccAgentUpdateState();
  const { mutateAsync: resumeAndGetAnswer, isPending: isResuming } =
    useAccAgentResume();

  // Live conversation box 3-stage elastic state ("collapsed" | "half" | "full")
  const [liveConvState, setLiveConvState] = useState<"collapsed" | "half" | "full">("collapsed");

  const [_isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [_editableSummaryText, setEditableSummaryText] = useState("");
  const [extractedState, setExtractedState] = useState("");
  const [_extractedCrop, setExtractedCrop] = useState("");
  const [_hasGeneratedQuestions, setHasGeneratedQuestions] = useState(false);

  // Phone number state tracking
  const [callPhoneNumber, setCallPhoneNumber] = useState<string | null>(null);
  const [lastCallPhoneNumber, setLastCallPhoneNumber] = useState<string | null>(null);
  const callPhoneNumberRef = useRef<string | null>(null);
  const lastCallPhoneNumberRef = useRef<string | null>(null);
  const activeProfileRef = useRef<any>(null);

  // HITL state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [extractedData, setExtractedData] =
    useState<ExtractDataResponse | null>(null);
  const [isHumanVerificationMode, setIsHumanVerificationMode] = useState(false);
  const [editableQuery, setEditableQuery] = useState("");
  const [editableCrop, setEditableCrop] = useState("");
  const [editableState, setEditableState] = useState("");
  const [editableDistrict, setEditableDistrict] = useState("");
  const [editableBlock, setEditableBlock] = useState("");
  const [editableVillage, setEditableVillage] = useState("");
  const [editableDomain, setEditableDomain] = useState<string[]>([]);
  const [editableSeason, setEditableSeason] = useState("");

  // Multiple extracted query cards state
  const [queryCards, setQueryCards] = useState<Array<{
    id: string;
    query: string;
    crop: string;
    season: string;
    state: string;
    district: string;
    block: string;
    village: string;
    domain: string[];
    isGenerated?: boolean;
  }>>([]);
  const [activeQueryIndex, setActiveQueryIndex] = useState(0);

  const handleToggleDomain = (domain: string) => {
    const newDomains = editableDomain.includes(domain)
      ? editableDomain.filter((d) => d !== domain)
      : [...editableDomain, domain];
    setEditableDomain(newDomains);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], domain: newDomains };
      return copy;
    });
  };

  const handleQueryTextChange = (val: string) => {
    setEditableQuery(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], query: val };
      return copy;
    });
  };

  const handleCropChange = (val: string) => {
    setEditableCrop(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], crop: val };
      return copy;
    });
  };

  const handleSeasonChange = (val: string) => {
    setEditableSeason(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], season: val };
      return copy;
    });
  };

  const handleStateChange = (val: string) => {
    setEditableState(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], state: val };
      return copy;
    });
  };

  const handleDistrictChange = (val: string) => {
    setEditableDistrict(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], district: val };
      return copy;
    });
  };

  const handleBlockChange = (val: string) => {
    setEditableBlock(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], block: val };
      return copy;
    });
  };

  const handleVillageChange = (val: string) => {
    setEditableVillage(val);
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = { ...copy[activeQueryIndex], village: val };
      return copy;
    });
  };

  const handleSelectQueryCard = (index: number) => {
    if (index < 0 || index >= queryCards.length || index === activeQueryIndex) return;

    // Persist current in-memory edits to active card before switching
    setQueryCards((prev) => {
      if (!prev[activeQueryIndex]) return prev;
      const copy = [...prev];
      copy[activeQueryIndex] = {
        ...copy[activeQueryIndex],
        query: editableQuery,
        crop: editableCrop,
        season: editableSeason,
        state: editableState,
        district: editableDistrict,
        block: editableBlock,
        village: editableVillage,
        domain: editableDomain,
      };
      return copy;
    });

    setActiveQueryIndex(index);
    const card = queryCards[index];
    if (card) {
      setEditableQuery(card.query || "");
      setEditableCrop(card.crop || "");
      setEditableSeason(card.season || "");
      setEditableState(card.state || "");
      setEditableDistrict(card.district || "");
      setEditableBlock(card.block || "");
      setEditableVillage(card.village || "");
      setEditableDomain(card.domain || []);
    }
  };

  // Farmer Details HITL state
  const [extractedFarmerProfile, setExtractedFarmerProfile] = useState<any>(null);
  const [_activeExtractionModes, setActiveExtractionModes] = useState<Set<'farmer' | 'query'>>(new Set(['farmer', 'query']));
  const [currentExtractionType, setCurrentExtractionType] = useState<'farmer_details' | 'query_details' | null>(null);

  // Live conversation simulation state
  const [isSimulatingMode, setIsSimulatingMode] = useState(false);
  const [simRole, setSimRole] = useState<"inbound" | "outbound">("inbound");
  const [simText, setSimText] = useState("");
  const [simOriginalText, setSimOriginalText] = useState("");
  const [showOriginalInput, setShowOriginalInput] = useState(false);

  // Simulation voice mic recording state
  const [isSimRecording, setIsSimRecording] = useState(false);
  const [isSimProcessingAudio, setIsSimProcessingAudio] = useState(false);
  const simMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const simAudioChunksRef = useRef<Blob[]>([]);
  const simStreamRef = useRef<MediaStream | null>(null);

  // Test mode message inline editing state
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<"inbound" | "outbound">("inbound");
  const [editText, setEditText] = useState("");
  const [editOriginalText, setEditOriginalText] = useState("");
  const [showEditOriginalInput, setShowEditOriginalInput] = useState(false);

  const handleStartEditMessage = (index: number) => {
    if (!isSimulatingMode) return;
    const msg = transcriptsList[index];
    if (!msg) return;
    setEditingMessageIndex(index);
    setEditRole(msg.track === "inbound" ? "inbound" : "outbound");
    setEditText(msg.translatedText || msg.text || "");
    setEditOriginalText(msg.originalText || "");
    setShowEditOriginalInput(Boolean(msg.originalText && msg.originalText !== (msg.translatedText || msg.text)));
  };

  const handleSaveEditMessage = (index: number) => {
    if (!isSimulatingMode || !editText.trim()) {
      toast.error("Message text cannot be empty.");
      return;
    }

    setTranscriptsList((prev) => {
      const updated = [...prev];
      const existing = updated[index];
      if (!existing) return prev;
      updated[index] = {
        ...existing,
        track: editRole,
        text: editText.trim(),
        translatedText: editText.trim(),
        originalText: editOriginalText.trim() || "",
      };
      return updated;
    });

    setEditingMessageIndex(null);
    setEditText("");
    setEditOriginalText("");
    setShowEditOriginalInput(false);
    toast.success("Message updated.");
  };

  const handleCancelEditMessage = () => {
    setEditingMessageIndex(null);
    setEditText("");
    setEditOriginalText("");
    setShowEditOriginalInput(false);
  };

  const handleDeleteMessage = (index: number) => {
    if (!isSimulatingMode) return;
    setTranscriptsList((prev) => prev.filter((_, i) => i !== index));
    if (editingMessageIndex === index) {
      handleCancelEditMessage();
    } else if (editingMessageIndex !== null && editingMessageIndex > index) {
      setEditingMessageIndex(editingMessageIndex - 1);
    }
    toast.success("Message deleted from test transcript.");
  };

  // Auto-scroll to bottom of chat bubbles
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [transcriptsList]);

  const handleResetConversation = () => {
    setCallUuid(null);
    setLastCallUuid(null);
    callUuidRef.current = null;
    lastCallUuidRef.current = null;
    setCallPhoneNumber(null);
    setLastCallPhoneNumber(null);
    callPhoneNumberRef.current = null;
    lastCallPhoneNumberRef.current = null;
    activeProfileRef.current = null;
    setExtractedFarmerProfile(null);
    setTranscriptsList([]);
    setQuestions([]);
    setTranslatedQuestions({});
    setTranslatedAnswers({});
    setTranslatingQuestions({});
    setCopiedStates({});
    lastTranscriptRef.current = "";
    setIsSummaryOpen(false);
    setEditableSummaryText("");
    setExtractedState("");
    setExtractedCrop("");
    setHasGeneratedQuestions(false);
    // Reset HITL state
    setThreadId(null);
    setExtractedData(null);
    setIsHumanVerificationMode(false);
    setEditableQuery("");
    setEditableCrop("");
    setEditableState("");
    setEditableDistrict("");
    setEditableBlock("");
    setEditableVillage("");
    setEditableDomain([]);
    setEditableSeason("");
    setQueryCards([]);
    setActiveQueryIndex(0);
    setIsSimulatingMode(false);
    setSimText("");
    setSimOriginalText("");
    if (simMediaRecorderRef.current && simMediaRecorderRef.current.state !== "inactive") {
      try {
        simMediaRecorderRef.current.stop();
      } catch (e) { }
    }
    if (simStreamRef.current) {
      simStreamRef.current.getTracks().forEach((track) => track.stop());
      simStreamRef.current = null;
    }
    setIsSimRecording(false);
    setIsSimProcessingAudio(false);
    handleCancelEditMessage();
    toast.success("Conversation cleared");
  };

  // Clean up media recorder stream on unmount
  useEffect(() => {
    return () => {
      if (simMediaRecorderRef.current && simMediaRecorderRef.current.state !== "inactive") {
        try {
          simMediaRecorderRef.current.stop();
        } catch (e) { }
      }
      if (simStreamRef.current) {
        simStreamRef.current.getTracks().forEach((track) => track.stop());
        simStreamRef.current = null;
      }
    };
  }, []);


  const handleLoadTestTranscript = () => {
    handleCancelEditMessage();
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + "_" +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const mockCallUuid = `testing_${dateStr}`;
    const testPhone = "+919999999999";

    const sampleTranscripts: CallTranscript[] = [
      {
        track: "inbound",
        text: "नमस्कार सर, माझ्या कपाशीच्या पिकावर पांढरी माशी आणि पानावरील पिवळेपणा खूप वाढला आहे. पाने खाली वाकत आहेत. काय फवारणी करावी?",
        originalText: "नमस्कार सर, माझ्या कपाशीच्या पिकावर पांढरी माशी आणि पानावरील पिवळेपणा खूप वाढला आहे. पाने खाली वाकत आहेत. काय फवारणी करावी?",
        translatedText: "Hello sir, whitefly infestation and yellowing of leaves has increased significantly on my cotton crop. Leaves are curling downwards. What should I spray?",
        detectedLanguage: "mr-IN",
        timestamp: new Date(Date.now() - 120000).toISOString(),
      },
      {
        track: "outbound",
        text: "नमस्कार शेतकरी बंधू. तुमचे शेत कोणत्या जिल्ह्यात आहे आणि कपाशीचे वय किती आहे?",
        originalText: "नमस्कार शेतकरी बंधू. तुमचे शेत कोणत्या जिल्ह्यात आहे आणि कपाशीचे वय किती आहे?",
        translatedText: "Hello farmer brother. In which district is your farm located and what is the age of the cotton crop?",
        detectedLanguage: "mr-IN",
        timestamp: new Date(Date.now() - 90000).toISOString(),
      },
      {
        track: "inbound",
        text: "माझे शेत यवतमाळ, महाराष्ट्र येथे आहे. पीक सुमारे ६० दिवसांचे आहे. मी आधी युरिया दिला होता.",
        originalText: "माझे शेत यवतमाळ, महाराष्ट्र येथे आहे. पीक सुमारे ६० दिवसांचे आहे. मी आधी युरिया दिला होता.",
        translatedText: "My farm is in Yavatmal, Maharashtra. The crop is about 60 days old. I had applied urea earlier.",
        detectedLanguage: "mr-IN",
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
    ];

    setTranscriptsList(sampleTranscripts);
    setCallUuid(mockCallUuid);
    setLastCallUuid(mockCallUuid);
    callUuidRef.current = mockCallUuid;
    lastCallUuidRef.current = mockCallUuid;
    setCallPhoneNumber(testPhone);
    setLastCallPhoneNumber(testPhone);
    callPhoneNumberRef.current = testPhone;
    lastCallPhoneNumberRef.current = testPhone;

    // Reset previous Q&A states
    setQuestions([]);
    setTranslatedQuestions({});
    setTranslatedAnswers({});
    setTranslatingQuestions({});
    setCopiedStates({});
    lastTranscriptRef.current = "";
    setIsSummaryOpen(false);
    setEditableSummaryText("");
    setExtractedState("");
    setExtractedCrop("");
    setHasGeneratedQuestions(false);

    // Reset HITL state
    setThreadId(null);
    setExtractedData(null);
    setIsHumanVerificationMode(false);
    setEditableQuery("");
    setEditableCrop("");
    setEditableState("");
    setEditableDistrict("");
    setEditableBlock("");
    setEditableVillage("");
    setEditableDomain([]);
    setEditableSeason("");
    setQueryCards([]);
    setActiveQueryIndex(0);

    setIsSimulatingMode(true);
    toast.success(`Loaded test transcript with UUID: ${mockCallUuid}. Click 'Extract & Verify' to test AI response.`);
  };

  const handleAddSimulatedMessage = async () => {
    const rawText = simText.trim();
    if (!rawText) {
      toast.error("Please enter a message to simulate.");
      return;
    }

    // Check if user typed regional script (non-ASCII Indic characters)
    const isRegional = /[^\x00-\x7F]/.test(rawText);
    let englishText = rawText;
    let originalText = simOriginalText.trim();
    let detectedLanguage = "en-IN";

    if (isRegional) {
      originalText = rawText;
      detectedLanguage = "auto";
      try {
        const translated = await translateService(rawText, "en-IN", "auto");
        if (translated) {
          englishText = translated;
        }
      } catch (transErr) {
        console.warn("Failed to translate typed regional text:", transErr);
      }
    } else if (originalText) {
      detectedLanguage = "custom";
    }

    const newMsg: CallTranscript = {
      track: simRole,
      text: englishText,
      originalText: originalText,
      translatedText: englishText,
      detectedLanguage: detectedLanguage,
      timestamp: new Date().toISOString(),
    };

    setTranscriptsList((prev) => [...prev, newMsg]);

    // Ensure callUuid & mock state is initialized if not present
    let currentUuid = callUuidRef.current || callUuid;
    if (!currentUuid) {
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + "_" +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      const mockCallUuid = `testing_${dateStr}`;
      setCallUuid(mockCallUuid);
      setLastCallUuid(mockCallUuid);
      setCallPhoneNumber("+919999999999");
      setLastCallPhoneNumber("+919999999999");
    }

    setIsSimulatingMode(true);
    setSimText("");
    setSimOriginalText("");
    toast.success(`Added ${simRole === "inbound" ? "Farmer" : "Agent"} message to conversation.`);
  };

  const handleToggleSimMic = async () => {
    // If currently recording, stop it to trigger onstop processing
    if (isSimRecording) {
      if (simMediaRecorderRef.current && simMediaRecorderRef.current.state !== "inactive") {
        simMediaRecorderRef.current.stop();
      }
      setIsSimRecording(false);
      return;
    }

    // Start voice recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      simStreamRef.current = stream;
      simAudioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      simMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          simAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        simStreamRef.current = null;

        const audioBlob = new Blob(simAudioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 500) {
          toast.info("Audio recording was too short.");
          return;
        }

        setIsSimProcessingAudio(true);
        const processingToastId = toast.loading("Transcribing regional speech & translating to English...");

        try {
          // Step 1: Transcribe with Sarvam Saaras v3 STT & detect regional language
          const sttRes = await transcribeAudioWithSarvamDetailed(audioBlob, "unknown");
          const nativeTranscript = sttRes.transcript.trim();
          const detectedLang = sttRes.languageCode || "unknown";

          if (!nativeTranscript) {
            toast.dismiss(processingToastId);
            toast.error("No speech detected.");
            return;
          }

          // Step 2: Determine if translation is needed
          const isNonEnglish = detectedLang !== "en-IN" || /[^\x00-\x7F]/.test(nativeTranscript);
          let englishText = nativeTranscript;

          if (isNonEnglish) {
            try {
              englishText = await translateService(nativeTranscript, "en-IN", detectedLang);
            } catch (transErr: any) {
              console.warn("Translation failed, using native transcript:", transErr);
              englishText = nativeTranscript;
            }
          }

          // Step 3: Ensure mock call UUID & state is initialized if not present
          let currentUuid = callUuidRef.current || callUuid;
          if (!currentUuid) {
            const now = new Date();
            const dateStr =
              now.getFullYear().toString() +
              String(now.getMonth() + 1).padStart(2, "0") +
              String(now.getDate()).padStart(2, "0") +
              "_" +
              String(now.getHours()).padStart(2, "0") +
              String(now.getMinutes()).padStart(2, "0") +
              String(now.getSeconds()).padStart(2, "0");
            currentUuid = `testing_${dateStr}`;
            setCallUuid(currentUuid);
            setLastCallUuid(currentUuid);
            callUuidRef.current = currentUuid;
            lastCallUuidRef.current = currentUuid;
            setCallPhoneNumber("+919999999999");
            setLastCallPhoneNumber("+919999999999");
            callPhoneNumberRef.current = "+919999999999";
            lastCallPhoneNumberRef.current = "+919999999999";
          }

          // Step 4: Append new message to conversation with both translated and original regional text
          const newMsg: CallTranscript = {
            track: simRole,
            text: englishText,
            translatedText: englishText,
            originalText: isNonEnglish ? nativeTranscript : (nativeTranscript !== englishText ? nativeTranscript : ""),
            detectedLanguage: detectedLang || "auto",
            timestamp: new Date().toISOString(),
          };

          setTranscriptsList((prev) => [...prev, newMsg]);
          setIsSimulatingMode(true);

          toast.dismiss(processingToastId);
          toast.success(
            `Added ${simRole === "inbound" ? "Farmer" : "Agent"} message (${detectedLang.toUpperCase()}) with English translation.`
          );
        } catch (err: any) {
          console.error("Simulation voice error:", err);
          toast.dismiss(processingToastId);
          toast.error(err.message || "Failed to process voice recording.");
        } finally {
          setIsSimProcessingAudio(false);
        }
      };

      mediaRecorder.start(250);
      setIsSimRecording(true);
      toast.info("Listening... Speak in any regional language (Kannada, Marathi, Hindi, etc.). Click mic again to finish & send.");
    } catch (err: any) {
      console.error("Microphone access error:", err);
      toast.error("Could not access microphone. Please check browser microphone permissions.");
      setIsSimRecording(false);
      setIsSimProcessingAudio(false);
    }
  };

  const handleResetQuestions = () => {
    setQuestions([]);
    setHasGeneratedQuestions(false);
    toast.success("Questions cleared");
  };

  const handleExtractWithHITL = async (extractionType: 'farmer_details' | 'query_details') => {
    if (transcriptsList.length === 0) {
      toast.info("No transcripts available to extract.");
      return;
    }

    setCurrentExtractionType(extractionType);

    if (extractionType === 'farmer_details') {
      if (!isHumanVerificationMode) {
        setActiveExtractionModes(new Set(['farmer']));
      } else {
        setActiveExtractionModes((prev) => new Set([...prev, 'farmer']));
      }
    } else if (extractionType === 'query_details') {
      if (!isHumanVerificationMode) {
        setActiveExtractionModes(new Set(['query']));
      } else {
        setActiveExtractionModes((prev) => new Set([...prev, 'query']));
      }
    }

    const allTranscriptText = transcriptsList
      .map((t) => {
        const speaker = t.track === "inbound" ? "Farmer" : "Expert";
        return `${speaker}: ${t.translatedText || t.text || t.originalText}`;
      })
      .filter(Boolean)
      .join("\n");

    try {
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const thread = await createThread();
        activeThreadId = thread.thread_id;
        setThreadId(thread.thread_id);
      }

      // Step 2: Extract data
      const data = await extractData({
        threadId: activeThreadId,
        transcript: allTranscriptText,
        extractionType,
      });
      console.log("📋 [EXTRACTION_DATA] (CallInterface) Extracted data response:", data);
      setExtractedData(data);

      if (extractionType === 'query_details') {
        const farmer = activeProfileRef.current || extractedFarmerProfile || {};
        const resolveLocation = (
          extractedVal?: string | null,
          farmerVal?: string | null,
          fallbackVal: string = ""
        ): string => {
          const ext = (extractedVal || "").trim();
          const isExtEmptyOrAll = !ext || ext.toLowerCase() === "all";
          const farm = (farmerVal || "").trim();
          const isFarmValid = Boolean(farm && farm.toLowerCase() !== "all");

          if (isExtEmptyOrAll && isFarmValid) {
            return farm;
          }
          return ext || (fallbackVal || "").trim();
        };

        const rootState = resolveLocation(
          data.extracted_state,
          farmer.state || farmer.stateName,
          editableState
        );
        const rootDistrict = resolveLocation(
          data.extracted_district,
          farmer.district || farmer.districtName,
          editableDistrict
        );
        const rootBlock = resolveLocation(
          data.extracted_block,
          farmer.blockName || farmer.block,
          editableBlock
        );
        const rootVillage = resolveLocation(
          data.extracted_village,
          farmer.villageName || farmer.village,
          editableVillage
        );
        const defaultSeason = (data as any).extracted_season || editableSeason || getAutoSelectedSeason();

        const rawQueries = data.extracted_queries && data.extracted_queries.length > 0
          ? data.extracted_queries
          : data.extracted_query
            ? [{
              query: data.extracted_query,
              crop: data.extracted_crop || "",
              standardized_domains: Array.isArray(data.extracted_domain)
                ? data.extracted_domain
                : data.extracted_domain ? [data.extracted_domain] : (data.standardized_domains || [])
            }]
            : [];

        const newCards = rawQueries.map((q, idx) => {
          const doms = Array.isArray(q.standardized_domains)
            ? q.standardized_domains
            : typeof q.standardized_domains === 'string' && q.standardized_domains
              ? [q.standardized_domains]
              : [];
          return {
            id: `query_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            query: q.query || "",
            crop: q.crop || "",
            season: defaultSeason,
            state: rootState,
            district: rootDistrict,
            block: rootBlock,
            village: rootVillage,
            domain: doms,
            isGenerated: false,
          };
        });

        if (newCards.length > 0) {
          // Completely replace existing queryCards with newCards
          setQueryCards(newCards);
          const lastIndex = newCards.length - 1;
          setActiveQueryIndex(lastIndex);
          const activeCard = newCards[lastIndex];
          if (activeCard) {
            setEditableQuery(activeCard.query);
            setEditableCrop(activeCard.crop);
            setEditableSeason(activeCard.season);
            setEditableState(activeCard.state);
            setEditableDistrict(activeCard.district);
            setEditableBlock(activeCard.block);
            setEditableVillage(activeCard.village);
            setEditableDomain(activeCard.domain);
          }
        } else {
          setEditableQuery(data.extracted_query || "");
          setEditableCrop(data.extracted_crop || "");
          setEditableState(rootState);
          setEditableDistrict(rootDistrict);
          setEditableBlock(rootBlock);
          setEditableVillage(rootVillage);
          const normalizedDomain = data.extracted_domain
            ? Array.isArray(data.extracted_domain)
              ? data.extracted_domain
              : [data.extracted_domain]
            : [];
          setEditableDomain(normalizedDomain);
          setEditableSeason(defaultSeason);
        }
      }

      if (extractionType === 'farmer_details') {
        const primaryCrop = data.extracted_primary_crop || data.extracted_crop || "";
        const secondaryCropsRaw = data.extracted_secondary_crops || (data as any).extracted_secondary_crop || (Array.isArray((data as any).cropsCultivated) ? (data as any).cropsCultivated.filter((c: string) => c !== primaryCrop).join(", ") : "");
        const secondaryCrop = Array.isArray(secondaryCropsRaw)
          ? secondaryCropsRaw.join(", ")
          : typeof secondaryCropsRaw === "string"
            ? secondaryCropsRaw
            : "";

        const farmerProfileData = {
          farmerName: data.extracted_name || "",
          phoneNo: data.extracted_phone || callPhoneNumber || lastCallPhoneNumber || lastCallPhoneNumberRef.current || "",
          age: data.extracted_age !== undefined && data.extracted_age !== null ? Number(data.extracted_age) : undefined,
          gender: data.extracted_gender || "",
          villageName: data.extracted_village || "",
          blockName: data.extracted_block || "",
          state: data.extracted_state || "",
          district: data.extracted_district || "",
          primaryCrop: primaryCrop,
          secondaryCrop: secondaryCrop,
          languagePreference: data.extracted_language_preference || (data as any).extracted_language || "",
          yearsOfExperience: data.extracted_years_of_experience !== undefined && data.extracted_years_of_experience !== null ? Number(data.extracted_years_of_experience) : undefined,
          highestEducatedPerson: data.extracted_highest_education || (data as any).extracted_highest_educated || "",
          numberOfSmartphones: data.extracted_smartphones_at_home !== undefined && data.extracted_smartphones_at_home !== null ? Number(data.extracted_smartphones_at_home) : undefined,
        };
        setExtractedFarmerProfile(farmerProfileData);
        activeProfileRef.current = farmerProfileData;
        setEditableState(data.extracted_state || "");
        setEditableDistrict(data.extracted_district || "");
        setEditableBlock(data.extracted_block || "");
        setEditableVillage(data.extracted_village || "");

        // Auto-save extracted farmer details to backend if phone number exists
        const phoneToSave = (farmerProfileData.phoneNo || "").trim();
        if (phoneToSave) {
          try {
            await plivoService.updateFarmer(phoneToSave, farmerProfileData);
            console.log(`✅ [FARMER_FLOW] Auto-saved extracted farmer details for ${phoneToSave}`);
          } catch (e) {
            console.warn(`[FARMER_FLOW] Could not auto-save extracted farmer profile:`, e);
          }
        }
      }

      setIsHumanVerificationMode(true);
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      setEditableSummaryText(data.extracted_query || "");
      setExtractedState(data.extracted_state || "");
      setExtractedCrop(data.extracted_crop || "");

      toast.success(
        `Data (${extractionType === 'farmer_details' ? 'Farmer Details' : 'Query Details'}) extracted successfully. Please review and edit if needed.`,
      );
    } catch (err) {
      console.error("Error in HITL extraction", err);
      toast.error("Failed to extract data. Please try again.");
    } finally {
      setCurrentExtractionType(null);
    }
  };

  const handleApproveAndResume = async () => {
    if (!threadId) {
      toast.error("No active thread. Please extract data first.");
      return;
    }

    // Validate domain selection
    if (editableDomain.length === 0) {
      toast.error("Please select at least one domain.");
      return;
    }

    // Validate season selection
    if (!editableSeason) {
      toast.error("Please select a season.");
      return;
    }

    try {
      const finalDomain = editableDomain;

      // Normalize extracted domain to array for comparison
      const extractedDomainArray = extractedData?.extracted_domain
        ? Array.isArray(extractedData.extracted_domain)
          ? extractedData.extracted_domain
          : [extractedData.extracted_domain]
        : [];

      // Sync current edits to queryCards
      const updatedCards = [...queryCards];
      if (updatedCards[activeQueryIndex]) {
        updatedCards[activeQueryIndex] = {
          ...updatedCards[activeQueryIndex],
          query: editableQuery,
          crop: editableCrop,
          season: editableSeason,
          state: editableState,
          district: editableDistrict,
          block: editableBlock,
          village: editableVillage,
          domain: finalDomain,
        };
        setQueryCards(updatedCards);
      }

      const wasEdited =
        editableQuery !== extractedData?.extracted_query ||
        editableCrop !== extractedData?.extracted_crop ||
        editableState !== extractedData?.extracted_state ||
        editableDistrict !== extractedData?.extracted_district ||
        editableBlock !== extractedData?.extracted_block ||
        editableVillage !== extractedData?.extracted_village ||
        JSON.stringify(finalDomain) !== JSON.stringify(extractedDomainArray) ||
        editableSeason !== (extractedData as any)?.extracted_season;

      if (wasEdited || queryCards.length > 1) {
        // Step 3: Update state with corrections
        const currentFarmer = activeProfileRef.current || extractedFarmerProfile || {};
        await updateState({
          threadId,
          correctedData: {
            query: editableQuery,
            crop: editableCrop,
            state: editableState,
            district: editableDistrict,
            block: editableBlock,
            village: editableVillage,
            domain: finalDomain,
            season: editableSeason,
            farmerName: currentFarmer.farmerName,
            farmerPhone: currentFarmer.phoneNo,
            farmerAge: currentFarmer.age,
            farmerGender: currentFarmer.gender,
            farmerVillage: currentFarmer.villageName,
            farmerBlock: currentFarmer.blockName,
            farmerPrimaryCrop: currentFarmer.primaryCrop,
            farmerSecondaryCrops: currentFarmer.secondaryCrop,
            farmerLanguagePreference: currentFarmer.languagePreference,
            farmerYearsOfExperience: currentFarmer.yearsOfExperience,
            farmerHighestEducation: currentFarmer.highestEducatedPerson,
            farmerSmartphonesAtHome: currentFarmer.numberOfSmartphones,
          },
        });
        if (wasEdited) {
          toast.info("Updated extracted data with your corrections.");
        }
      }

      // Step 4: Auto-save farmer profile if present on real calls
      const targetCallUuid = callUuid || lastCallUuid || lastCallUuidRef.current || undefined;
      const isRealCall = Boolean(targetCallUuid && !targetCallUuid.startsWith("testing_"));
      const targetPhone = isRealCall
        ? (callPhoneNumber || lastCallPhoneNumber || lastCallPhoneNumberRef.current || activeProfileRef.current?.phoneNo || extractedData?.extracted_phone || "").trim()
        : "";
      const farmerProfileToPersist = activeProfileRef.current || (extractedFarmerProfile ? { ...extractedFarmerProfile } : null);

      if (isRealCall && targetPhone && farmerProfileToPersist) {
        try {
          const profilePayload = {
            ...farmerProfileToPersist,
            phoneNo: targetPhone,
            state: editableState || farmerProfileToPersist.state,
            district: editableDistrict || farmerProfileToPersist.district,
            blockName: editableBlock || farmerProfileToPersist.blockName,
            villageName: editableVillage || farmerProfileToPersist.villageName,
            primaryCrop: editableCrop || farmerProfileToPersist.primaryCrop,
          };
          await plivoService.updateFarmer(targetPhone, profilePayload);
          console.log(`✅ [FARMER_FLOW] Saved farmer details on approval for ${targetPhone}`);
        } catch (farmerErr) {
          console.warn(`[FARMER_FLOW] Error saving farmer details on approval:`, farmerErr);
        }
      }

      const resolvedFarmerName = activeProfileRef.current?.farmerName || extractedFarmerProfile?.farmerName || extractedData?.extracted_name || "";

      // Step 5: Resume and get answer with guaranteed targetCallUuid
      const metadata = {
        extracted_query: editableQuery,
        extracted_crop: editableCrop,
        extracted_state: editableState,
        extracted_district: editableDistrict,
        extracted_block: editableBlock || extractedData?.extracted_block || "",
        extracted_village: editableVillage || extractedData?.extracted_village || "",
        standardized_domains: finalDomain,
        extracted_domain: finalDomain,
        extracted_season: editableSeason,
        farmerPhone: isRealCall && targetPhone ? targetPhone : undefined,
        farmerName: isRealCall && resolvedFarmerName ? resolvedFarmerName : undefined,
      };

      console.log(`🚀 [ACC-AGENT] Resuming with callUuid=${targetCallUuid}, metadata=`, metadata);

      const result = await resumeAndGetAnswer({
        threadId,
        callUuid: targetCallUuid,
        metadata,
      });

      // Extract details from parsed values.final_answer object (or root response if flat)
      const finalAnswerObj = result?.values?.final_answer || result;
      let finalAnswerMarkdown = "";
      if (typeof finalAnswerObj === "string") {
        finalAnswerMarkdown = finalAnswerObj;
      } else if (finalAnswerObj?.final_answer) {
        finalAnswerMarkdown = finalAnswerObj.final_answer;
      } else {
        const answersList = Array.isArray(finalAnswerObj?.answers)
          ? finalAnswerObj.answers
          : (Array.isArray(finalAnswerObj?.final_answers) ? finalAnswerObj.final_answers : []);
        if (answersList.length > 0) {
          // Priority 1: Match by the active query text
          const queryToMatch = editableQuery.trim().toLowerCase();
          const matched = answersList.find((a: any) =>
            a?.query && (
              a.query.trim().toLowerCase() === queryToMatch ||
              a.query.trim().toLowerCase().includes(queryToMatch) ||
              queryToMatch.includes(a.query.trim().toLowerCase())
            )
          );
          if (matched?.answer) {
            finalAnswerMarkdown = matched.answer;
          } else if (answersList[activeQueryIndex]?.answer) {
            // Priority 2: Match by card index
            finalAnswerMarkdown = answersList[activeQueryIndex].answer;
          } else {
            // Priority 3: Fallback to last answer
            finalAnswerMarkdown = answersList[answersList.length - 1]?.answer || "";
          }
        } else {
          finalAnswerMarkdown = result?.final_answer || "";
        }
      }

      let weather = finalAnswerObj?.weather || null;
      if (!weather && finalAnswerObj?.weather_response) {
        try {
          weather = typeof finalAnswerObj.weather_response === 'string'
            ? JSON.parse(finalAnswerObj.weather_response)
            : finalAnswerObj.weather_response;
        } catch (e) { }
      }
      if (!weather && (result as any)?.values?.weather_response) {
        try {
          weather = typeof (result as any).values.weather_response === 'string'
            ? JSON.parse((result as any).values.weather_response)
            : (result as any).values.weather_response;
        } catch (e) { }
      }
      if (!weather && Array.isArray((result as any)?.values?.query_tool_responses)) {
        const toolResp = (result as any).values.query_tool_responses[activeQueryIndex]?.tool_responses?.weather
          || (result as any).values.query_tool_responses[0]?.tool_responses?.weather;
        if (toolResp) {
          try {
            weather = typeof toolResp === 'string' ? JSON.parse(toolResp) : toolResp;
          } catch (e) { }
        }
      }
      if (typeof weather === 'string') {
        try {
          weather = JSON.parse(weather);
        } catch (e) { }
      }

      let gdbData = finalAnswerObj?.gdb || null;
      if (!gdbData && finalAnswerObj?.gdb_response) {
        try {
          gdbData = typeof finalAnswerObj.gdb_response === 'string'
            ? JSON.parse(finalAnswerObj.gdb_response)
            : finalAnswerObj.gdb_response;
        } catch (e) { }
      }
      const similarPair = gdbData?.similar_pair1 || gdbData?.exact_match || null;
      const authorName = similarPair?.details?.[0]?.author_name || "";
      const sourceName = similarPair?.details?.[0]?.source_name || "";
      const sourceLink = similarPair?.details?.[0]?.source_link || "";

      // Convert final answer to question format
      const generatedQuestion: ExtGeneratedQuestion = {
        question: editableQuery,
        answer: finalAnswerMarkdown,
        agri_specialist: "ACC_AGENT",
        referenceSource: "acc_agent_hitl",
        id: Date.now().toString(),
        weather,
        authorName,
        sourceName,
        sourceLink,
      };

      setQuestions((prev) => [...prev, generatedQuestion]);
      setHasGeneratedQuestions(true);

      // Mark the active query card as generated
      setQueryCards((prev) => {
        if (!prev || prev.length === 0 || !prev[activeQueryIndex]) {
          return [{
            id: 'q1',
            query: editableQuery,
            crop: editableCrop,
            season: editableSeason,
            state: editableState,
            district: editableDistrict,
            block: editableBlock,
            village: editableVillage,
            domain: editableDomain,
            isGenerated: true,
          }];
        }
        const copy = [...prev];
        copy[activeQueryIndex] = { ...copy[activeQueryIndex], isGenerated: true };
        return copy;
      });

      // Keep the form card visible with all its populated fields on the UI
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      toast.success("Final answer generated successfully!");
    } catch (err) {
      console.error("Error in resume", err);
      toast.error("Failed to generate final answer.");
    }
  };



  return (
    <div className="space-y-3.5 w-full max-w-full px-1.5 sm:px-3 py-1.5 relative">
      {/* Incoming Call Box - Top Sticky Bar */}
      <div className="sticky top-0 z-40 bg-background/95 dark:bg-background/95 backdrop-blur-md pt-0.5 pb-2 -mt-1">
        <IncomingCallBox
          extractedFarmerProfile={extractedFarmerProfile}
          onTranscriptChange={() => { }} // Not using direct strings anymore
          onOriginalTranscriptChange={() => { }}
          onTranscriptsListChange={(list) => setTranscriptsList(list)}
          onCallStateChange={(isActive) => {
            setIsCallActive(isActive);
            if (isActive) {
              // Clear transcripts, questions, summary, HITL and simulation states when a new call becomes active
              setExtractedFarmerProfile(null);
              activeProfileRef.current = null;
              setTranscriptsList([]);
              setQuestions([]);
              setTranslatedQuestions({});
              setTranslatedAnswers({});
              setTranslatingQuestions({});
              setCopiedStates({});
              lastTranscriptRef.current = "";
              setIsSummaryOpen(false);
              setEditableSummaryText("");
              setExtractedState("");
              setExtractedCrop("");
              setHasGeneratedQuestions(false);
              setThreadId(null);
              setExtractedData(null);
              setIsHumanVerificationMode(false);
              setEditableQuery("");
              setEditableCrop("");
              setEditableState("");
              setEditableDistrict("");
              setEditableBlock("");
              setEditableVillage("");
              setEditableDomain([]);
              setEditableSeason("");

              setIsSimulatingMode(false);
            }
          }}
          onCallUuidChange={(uuid) => {
            if (uuid) {
              callUuidRef.current = uuid;
              lastCallUuidRef.current = uuid;
              setCallUuid(uuid);
              setLastCallUuid(uuid);
            } else {
              setCallUuid(null);
              callUuidRef.current = null;
            }
          }}
          onPhoneNumberChange={(phone) => {
            if (phone) {
              callPhoneNumberRef.current = phone;
              lastCallPhoneNumberRef.current = phone;
              setCallPhoneNumber(phone);
              setLastCallPhoneNumber(phone);
            } else {
              setCallPhoneNumber(null);
              callPhoneNumberRef.current = null;
            }
          }}
        />
      </div>


      {/* 3-Column Modern Call Interface Layout (Left 25%: Farmer Details, Center: 50% of rest, Right: 50% of rest) */}
      <div className="grid grid-cols-1 lg:grid-cols-[25%_1fr_1fr] gap-4 items-start">
        {/* Left Column: Farmer Information Form (25%) */}
        <div className="w-full flex flex-col space-y-4">
          <FarmerDetails
            phoneNo={callPhoneNumber || lastCallPhoneNumber || lastCallPhoneNumberRef.current || ""}
            extractedProfile={extractedFarmerProfile}
            disabled={!isCallActive && !isSimulatingMode && !(callUuid && callUuid.startsWith("testing_")) && !callPhoneNumber && !lastCallPhoneNumber}
            onProfileUpdated={(profile) => {
              activeProfileRef.current = profile;
            }}
            defaultOpen={true}
            className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300"
          />
        </div>

        {/* Center Column: Live Conversation Dialogue + Extracted Query Details below (30%) */}
        <div className="w-full space-y-4 flex flex-col">
          <Card className="col-span-1 h-fit border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
            <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2.5">
              {/* Row 1: Title (Left) + Test & Reset (Center/Right) + Far Right Chevron */}
              <div className="flex items-center justify-between gap-2">
                {/* Left Side: Title and optional UUID */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => setLiveConvState(liveConvState === "collapsed" ? "full" : "collapsed")}
                  >
                    <MessageSquare className={`h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400 ${isCallActive ? "animate-pulse" : ""}`} />
                    <h3 className="font-bold text-base sm:text-lg text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                      Live conversation
                    </h3>
                  </div>

                  {callUuid && typeof callUuid === "string" && (
                    <span
                      className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[140px] sm:max-w-[200px] pl-6"
                      title={callUuid}
                    >
                      UUID: {callUuid.length > 8 ? `${callUuid.slice(0, 8)}...` : callUuid}
                    </span>
                  )}
                </div>

                {/* Right Side: [ Test ] [ Reset ] + [ ↓ Chevron Button ] */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    onClick={handleLoadTestTranscript}
                    disabled={isCallActive || isExtracting || isResuming}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs font-semibold border-amber-300 dark:border-amber-700/60 bg-amber-50/80 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 shadow-sm rounded-lg flex items-center gap-1 transition-all"
                    title="Load sample farmer transcript for testing AI response without a real phone call"
                  >
                    <FlaskConical className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    <span>Test</span>
                  </Button>

                  <Button
                    onClick={handleResetConversation}
                    disabled={transcriptsList.length === 0}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 rounded-lg flex items-center gap-1 font-medium"
                    title="Reset conversation transcript"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </Button>

                  {/* Far Right: Dropdown Chevron Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLiveConvState(liveConvState === "collapsed" ? "full" : "collapsed")}
                    className="h-7 w-7 p-0 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100/80 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-300/80 dark:border-zinc-700/80 rounded-lg shrink-0 shadow-sm transition-all hover:scale-105 active:scale-95"
                    title={liveConvState === "collapsed" ? "Expand Live Conversation" : "Collapse Live Conversation"}
                  >
                    {liveConvState === "collapsed" ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Row 2: Full Width "Extract & Verify" Dropdown Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={isExtracting || transcriptsList.length === 0}
                    size="sm"
                    className="h-8.5 w-full text-xs sm:text-sm font-bold btn-primary-emerald shadow-sm rounded-lg flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary-accent-fg/80" />
                    <span>
                      {isExtracting
                        ? currentExtractionType === "farmer_details"
                          ? "Extracting Farmer..."
                          : currentExtractionType === "query_details"
                            ? "Extracting Query..."
                            : "Extracting..."
                        : "Extract and Verify"}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 ml-0.5 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl p-1 z-50">
                  <DropdownMenuItem
                    onClick={() => handleExtractWithHITL("farmer_details")}
                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <User className="h-4 w-4 text-emerald-600" />
                    <span>Extract Farmer Details</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleExtractWithHITL("query_details")}
                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span>Extract Query Details</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>

            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${liveConvState !== "collapsed"
                ? "max-h-[1200px] opacity-100"
                : "max-h-0 opacity-0 hidden"
                }`}
            >
              <CardContent className="p-3 sm:p-4 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-2.5 h-[360px] flex flex-col">
                <div
                  ref={chatContainerRef}
                  className="space-y-3 overflow-y-auto pr-2 sm:pr-3 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 flex flex-col flex-1 transition-all duration-300"
                >
                  {transcriptsList.length > 0 ? (
                    transcriptsList.map((msg, index) => {
                      const isCaller = msg.track === "inbound";
                      const speakerLabel = isCaller ? "Farmer" : "Expert";
                      const isEditingThis = editingMessageIndex === index;

                      return (
                        <div
                          key={index}
                          className={`flex flex-col ${isCaller ? "items-start" : "items-end"} space-y-1.5 animate-in fade-in-50 slide-in-from-bottom-3 duration-300 w-full`}
                        >
                          {/* Speaker & Timestamp + Test Mode Edit/Delete Controls */}
                          <div
                            className={`flex items-center gap-2 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase ${!isCaller ? "flex-row-reverse" : ""}`}
                          >
                            <span>{speakerLabel}</span>
                            <span>•</span>
                            <span>
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })
                                : new Date().toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                            </span>

                            {/* Only visible in Test/Simulation Mode */}
                            {isSimulatingMode && (
                              <div className={`flex items-center gap-0.5 ml-1 ${!isCaller ? "mr-1 ml-0" : ""}`}>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMessage(index)}
                                  className="p-1 rounded text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-950/50 transition-all cursor-pointer"
                                  title="Edit this message (Test Mode)"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(index)}
                                  className="p-1 rounded text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-950/50 transition-all cursor-pointer"
                                  title="Delete this message (Test Mode)"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Chat Bubble or Inline Editor */}
                          {isEditingThis ? (
                            <div className="w-full max-w-[95%] sm:max-w-[85%] p-3 rounded-2xl border border-amber-400/70 dark:border-amber-600/70 bg-white/95 dark:bg-zinc-900/95 shadow-lg space-y-2.5 backdrop-blur-md">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2">
                                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Edit Message #{index + 1}</span>
                                </span>

                                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setEditRole("inbound")}
                                    className={`px-2.5 py-0.5 rounded-md font-semibold text-[10.5px] transition-all flex items-center gap-1 cursor-pointer ${editRole === "inbound"
                                      ? "bg-amber-500 text-white shadow-xs"
                                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                                      }`}
                                  >
                                    <User className="h-3 w-3" />
                                    <span>Farmer</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditRole("outbound")}
                                    className={`px-2.5 py-0.5 rounded-md font-semibold text-[10.5px] transition-all flex items-center gap-1 cursor-pointer ${editRole === "outbound"
                                      ? "bg-indigo-600 text-white shadow-xs"
                                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                                      }`}
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                    <span>Expert</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                  Message Text (English / Translated)
                                </label>
                                <Textarea
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  placeholder="Enter message text..."
                                  className="min-h-[70px] text-xs resize-none bg-zinc-50 dark:bg-zinc-950 font-medium"
                                />
                              </div>

                              {showEditOriginalInput ? (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                    Original Language Text (Optional)
                                  </label>
                                  <Input
                                    value={editOriginalText}
                                    onChange={(e) => setEditOriginalText(e.target.value)}
                                    placeholder="Enter original local language text..."
                                    className="h-7 text-xs bg-zinc-50 dark:bg-zinc-950"
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setShowEditOriginalInput(true)}
                                  className="text-[10.5px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                                >
                                  <Globe className="h-3 w-3" />
                                  <span>+ Add original local language text</span>
                                </button>
                              )}

                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEditMessage}
                                  className="h-6.5 px-2.5 text-xs text-zinc-600 dark:text-zinc-300"
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  <span>Cancel</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSaveEditMessage(index)}
                                  className="h-6.5 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  <span>Save Changes</span>
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`max-w-[80%] px-4 py-3 rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-md ${isCaller
                                ? "chat-bubble-farmer rounded-tl-none"
                                : "chat-bubble-agent rounded-tr-none"
                                }`}
                            >
                              {/* English Translation (Primary) */}
                              <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium">
                                {msg.translatedText || msg.text}
                              </p>

                              {/* Original text & language metadata (Secondary) */}
                              {msg.originalText && (
                                <div
                                  className={`mt-2 pt-1.5 border-t text-[11px] flex flex-col gap-1 ${isCaller
                                    ? "border-farmer-border/30 text-farmer-text/80"
                                    : "border-agent-border/30 text-agent-text/80"
                                    }`}
                                >
                                  <div className="flex items-center gap-1 font-bold tracking-wider uppercase text-[9px]">
                                    <Globe className="h-3 w-3 animate-spin-slow" />
                                    <span>
                                      Original ({msg.detectedLanguage || "unknown"})
                                    </span>
                                  </div>
                                  <p className="italic leading-normal">
                                    {msg.originalText}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : isCallActive ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                      <div className="flex items-center gap-1.5 mb-3">
                        <span
                          className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <p className="text-sm font-semibold tracking-wide uppercase text-indigo-600 dark:text-indigo-400 animate-pulse">
                        Listening for conversation...
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        Speak into the line to stream transcripts in real-time.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
                      <FlaskConical className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs font-semibold uppercase tracking-wider">Simulation Mode Inactive</p>
                      <p className="text-[11px] mt-0.5">Click "Test" above to switch to test simulation mode.</p>
                    </div>
                  )}
                </div>

                {/* Interactive Conversation Simulation Bar (Only Available in Test/Simulation Mode) */}
                {isSimulatingMode && (
                  <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2 bg-amber-500/5 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-500/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <FlaskConical className="h-3.5 w-3.5" />
                        <span>Simulate Conversation Message</span>
                      </div>

                      {/* Role Selection Toggle */}
                      <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5 rounded-lg text-xs">
                        <button
                          type="button"
                          onClick={() => setSimRole("inbound")}
                          className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all flex items-center gap-1.5 ${simRole === "inbound"
                            ? "bg-amber-500 text-white shadow-sm"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                            }`}
                        >
                          <User className="h-3 w-3" />
                          <span>Farmer (Inbound)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimRole("outbound")}
                          className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all flex items-center gap-1.5 ${simRole === "outbound"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                            }`}
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>Agent / Expert (Outbound)</span>
                        </button>
                      </div>
                    </div>

                    {/* Text Input & Send Button */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={simText}
                        onChange={(e) => setSimText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddSimulatedMessage();
                          }
                        }}
                        placeholder={`Type simulated ${simRole === "inbound" ? "Farmer query..." : "Agent response..."}`}
                        className="h-8.5 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-inner focus-visible:ring-amber-500"
                        disabled={isSimProcessingAudio}
                      />

                      {/* Mic Voice Button */}
                      <Button
                        type="button"
                        onClick={handleToggleSimMic}
                        disabled={isSimProcessingAudio}
                        size="sm"
                        className={`h-8.5 px-2.5 text-xs rounded-lg flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${isSimRecording
                          ? "bg-red-600 hover:bg-red-700 text-white animate-pulse ring-2 ring-red-400 shadow-md"
                          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/60"
                          }`}
                        title={
                          isSimRecording
                            ? "Recording voice... Click to finish and send"
                            : isSimProcessingAudio
                              ? "Transcribing & translating..."
                              : "Speak in regional language (Kannada, Marathi, Hindi, etc.)"
                        }
                      >
                        {isSimProcessingAudio ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                            <span className="hidden sm:inline font-medium">Processing...</span>
                          </>
                        ) : isSimRecording ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            <Mic className="h-3.5 w-3.5" />
                            <span className="font-bold">Stop</span>
                          </>
                        ) : (
                          <>
                            <Mic className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline font-medium">Voice</span>
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={handleAddSimulatedMessage}
                        disabled={!simText.trim() || isSimProcessingAudio}
                        size="sm"
                        className="h-8.5 px-3.5 text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-sm rounded-lg flex items-center gap-1.5 shrink-0 transition-all"
                      >
                        <Send className="h-3 w-3" />
                        <span>Add</span>
                      </Button>
                    </div>

                    {/* Expandable Original Language Input */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowOriginalInput(!showOriginalInput)}
                        className="text-[11px] text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 font-medium flex items-center gap-1 transition-colors"
                      >
                        <Globe className="h-3 w-3" />
                        <span>{showOriginalInput ? "Hide original native language text" : "+ Add original native language text (e.g. Marathi/Hindi)"}</span>
                      </button>
                      {showOriginalInput && (
                        <Input
                          value={simOriginalText}
                          onChange={(e) => setSimOriginalText(e.target.value)}
                          placeholder="Original native language text (e.g. माझ्या कपाशीच्या पिकावर पांढरी माशी आहे...)"
                          className="h-8 text-xs mt-1.5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                        />
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>

          {/* Review & Edit Extracted Query Data Card (Center Column, below Live Conversation) */}
          <Card className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300 animate-in fade-in-50 slide-in-from-top-2">
            <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-4 sm:px-5 py-2.5 sm:py-3 min-h-[52px] flex items-center justify-between transition-colors">
              <CardTitle className="flex items-center justify-between w-full text-base sm:text-lg font-bold">
                <span
                  className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                >
                  <Edit3 className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  Review & Edit Extracted Query Data
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-transparent"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                >
                  {isSummaryExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${isSummaryExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <CardContent className="p-4 sm:p-5 pt-1.5 sm:pt-2 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-3">
                {isExtracting && currentExtractionType === 'query_details' ? (
                  <div className="flex flex-col space-y-3">
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="h-4 w-full rounded-md" />
                    <Skeleton className="h-4 w-5/6 rounded-md" />
                  </div>
                ) : !editableQuery.trim() && !editableCrop.trim() && !editableState.trim() && !isHumanVerificationMode ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-400 dark:text-zinc-500 space-y-2">
                    <div className="p-3 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40 shadow-sm">
                      <FileText className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Extracted details appear here
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[240px]">
                      Query parameters will appear here when extracted from the live conversation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-3">
                      <div>
                        <Label
                          htmlFor="queryText"
                          className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                        >
                          Extracted Query
                        </Label>
                        <Textarea
                          id="queryText"
                          value={editableQuery}
                          onChange={(e) => handleQueryTextChange(e.target.value)}
                          className="min-h-[80px] text-sm"
                          placeholder="Edit extracted query..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label
                            htmlFor="cropName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Crop
                          </Label>
                          <Input
                            id="cropName"
                            value={editableCrop}
                            onChange={(e) => handleCropChange(e.target.value)}
                            className="text-sm"
                            placeholder="Crop..."
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="season"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Season
                          </Label>
                          <Select
                            value={editableSeason}
                            onValueChange={handleSeasonChange}
                          >
                            <SelectTrigger id="season" className="text-sm">
                              <SelectValue placeholder="Select Season" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Kharif">Kharif</SelectItem>
                              <SelectItem value="Rabi">Rabi</SelectItem>
                              <SelectItem value="Zaid">Zaid</SelectItem>
                              <SelectItem value="Whole Year">
                                Whole Year
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label
                            htmlFor="stateName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            State
                          </Label>
                          <Input
                            id="stateName"
                            value={editableState}
                            onChange={(e) =>
                              handleStateChange(e.target.value)
                            }
                            className="text-sm"
                            placeholder="State..."
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="districtName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            District
                          </Label>
                          <Input
                            id="districtName"
                            value={editableDistrict}
                            onChange={(e) =>
                              handleDistrictChange(e.target.value)
                            }
                            className="text-sm"
                            placeholder="District..."
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="blockName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Block
                          </Label>
                          <Input
                            id="blockName"
                            value={editableBlock}
                            onChange={(e) =>
                              handleBlockChange(e.target.value)
                            }
                            className="text-sm"
                            placeholder="Block..."
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="villageName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Village
                          </Label>
                          <Input
                            id="villageName"
                            value={editableVillage}
                            onChange={(e) =>
                              handleVillageChange(e.target.value)
                            }
                            className="text-sm"
                            placeholder="Village..."
                          />
                        </div>
                      </div>


                      {/* Domain selection list with check icons */}
                      <div>
                        <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                          Domains (Select All That Apply)
                        </Label>
                        <div className="grid grid-cols-2 gap-1.5 p-2 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 max-h-48 overflow-y-auto">
                          {DOMAIN_OPTIONS.map((domain) => {
                            const isSelected =
                              editableDomain.includes(domain);
                            return (
                              <div
                                key={domain}
                                onClick={() => handleToggleDomain(domain)}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${isSelected
                                  ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-500/20"
                                  : "hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                                  }`}
                              >
                                <span className="truncate">{domain}</span>
                                {isSelected && (
                                  <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Multi-Query Navigation Bar (Q1, Q2, Prev, Next) */}
                    {(queryCards.length > 0 ? queryCards : [{ id: 'q1', isGenerated: false }]).length > 0 && (
                      <div className="flex items-center justify-between gap-2 p-2 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs">
                        {/* Far Left: Prev Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectQueryCard(activeQueryIndex - 1)}
                          disabled={activeQueryIndex === 0}
                          className="h-7 px-2.5 text-xs font-semibold border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 disabled:opacity-40 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Prev</span>
                        </Button>

                        {/* Middle: Centered Q1, Q2, Q3... */}
                        <div className="flex items-center justify-center gap-1.5 flex-wrap flex-1 mx-2">
                          {(queryCards.length > 0 ? queryCards : [{ id: 'q1', isGenerated: false }]).map((card, idx) => {
                            const isActive = idx === activeQueryIndex;
                            return (
                              <button
                                key={card.id || idx}
                                type="button"
                                onClick={() => handleSelectQueryCard(idx)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${isActive
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                  }`}
                              >
                                <span>Q{idx + 1}</span>
                                {card.isGenerated && (
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shadow-xs" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Far Right: Next Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectQueryCard(activeQueryIndex + 1)}
                          disabled={activeQueryIndex >= (queryCards.length > 0 ? queryCards.length : 1) - 1}
                          className="h-7 px-2.5 text-xs font-semibold border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 disabled:opacity-40 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <span>Next</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Action buttons (Cancel + Approve & Generate) */}
                    <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <Button
                        onClick={() => setIsHumanVerificationMode(false)}
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 text-xs font-semibold border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleApproveAndResume}
                        disabled={
                          isResuming ||
                          !editableQuery.trim() ||
                          editableDomain.length === 0 ||
                          !editableSeason
                        }
                        size="sm"
                        className="h-10 px-5 text-xs md:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4 text-indigo-200" />
                        <span>
                          {isResuming
                            ? "Generating Answer..."
                            : queryCards[activeQueryIndex]?.isGenerated
                              ? "Regenerate Answer"
                              : "Approve & Generate Answer"}
                        </span>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </div>

        {/* Right Column: Weather Information (top) + Live Questions & Specialist Answers (bottom) (Rest: 45%) */}
        <div className="w-full space-y-4 flex flex-col">
          {/* Weather Widget */}
          <WeatherWidget defaultState={editableState || extractedState || "Karnataka"} />

          {/* Live Questions & AI Specialist Answers List */}
          <Card className="flex-1 min-h-[400px] md:h-auto border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
            <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-4 sm:px-5 py-2.5 sm:py-3 min-h-[52px] flex items-center justify-between transition-colors">
              <CardTitle className="flex items-center justify-between w-full text-base sm:text-lg font-bold">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 cursor-pointer">
                      <HelpCircle className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      Live Questions
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    These are questions generated from your transcript
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-2.5">
                  <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">{questions?.length} {questions?.length === 1 ? 'question' : 'questions'}</Badge>
                  <Button
                    onClick={handleResetQuestions}
                    disabled={questions?.length === 0}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs font-semibold border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 mr-0.5" />
                    Reset
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="h-full p-3 sm:p-4 pt-1.5 sm:pt-2 bg-zinc-50/20 dark:bg-zinc-950/20">
              {(!questions || questions.length === 0) ? (
                isResuming ? (
                  <div className="py-2">
                    <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-white/95 dark:bg-zinc-900/95 shadow-sm p-3.5 sm:p-4 space-y-3 animate-pulse">
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            Generating AI specialist answer...
                          </span>
                        </div>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div className="space-y-2 pt-1">
                        <Skeleton className="h-4 w-4/5 rounded-md bg-indigo-100/50 dark:bg-indigo-950/40" />
                        <Skeleton className="h-3.5 w-full rounded-md" />
                        <Skeleton className="h-3.5 w-11/12 rounded-md" />
                        <Skeleton className="h-3.5 w-3/4 rounded-md" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <Lightbulb className="h-10 w-10 mb-3 opacity-40 text-amber-500" />
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      No generated questions yet
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-[260px] mt-1">
                      Click "Approve & Generate Answer" on an extracted query to receive AI specialist recommendations.
                    </p>
                  </div>
                )
              ) : (
                <div className="max-h-[calc(100vh-250px)] min-h-[300px] overflow-y-auto overscroll-contain pr-1 sm:pr-1.5 space-y-3.5 scroll-smooth scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800">
                  {/* Single Skeleton Card at top during generation when older answers exist */}
                  {isResuming && (
                    <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-white/95 dark:bg-zinc-900/95 shadow-sm p-3.5 sm:p-4 space-y-3 animate-pulse">
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            Generating AI specialist answer...
                          </span>
                        </div>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div className="space-y-2 pt-1">
                        <Skeleton className="h-4 w-4/5 rounded-md bg-indigo-100/50 dark:bg-indigo-950/40" />
                        <Skeleton className="h-3.5 w-full rounded-md" />
                        <Skeleton className="h-3.5 w-11/12 rounded-md" />
                        <Skeleton className="h-3.5 w-3/4 rounded-md" />
                      </div>
                    </div>
                  )}

                  {[...questions].map((qn, originalIndex) => ({ qn, originalIndex })).reverse().map(({ qn, originalIndex }, revIdx) => {
                    const qnKey = qn.id || `${qn.question}-${originalIndex}`;
                    const isLatest = revIdx === 0;

                    return (
                      <div
                        key={`${qn.question}-${qn.id || originalIndex}`}
                        className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                          isLatest
                            ? "border-indigo-300 dark:border-indigo-800/80 bg-white dark:bg-zinc-900 shadow-sm"
                            : "border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 hover:shadow-sm"
                        }`}
                      >
                        <div className="p-3.5 sm:p-4">
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50 shrink-0">
                                Q{originalIndex + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                {translatingQuestions[qnKey] ? (
                                  <div className="space-y-1.5 py-1 animate-pulse">
                                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
                                  </div>
                                ) : (
                                  <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50 leading-snug break-words">
                                    {translatedQuestions[qnKey] || qn.question}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            <AccordionItem
                              value="answer"
                              className="border-none"
                            >
                              <div className="flex items-center gap-2">
                                <AccordionTrigger className="py-2 px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold tracking-wide uppercase hover:no-underline flex-1 min-w-0 cursor-pointer">
                                  <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>View Answer & Details</span>
                                  </div>
                                </AccordionTrigger>

                                {(qn.question?.trim() || qn.answer?.trim()) && (
                                  <div className="shrink-0">
                                    <SarvamTranslatePairDropdown
                                      query1={qn.question || ""}
                                      query2={qn.answer || ""}
                                      sourceLang="en-IN"
                                      onTranslateStart={() => {
                                        setTranslatingQuestions((prev) => ({
                                          ...prev,
                                          [qnKey]: true,
                                        }));
                                      }}
                                      onTranslateEnd={() => {
                                        setTranslatingQuestions((prev) => ({
                                          ...prev,
                                          [qnKey]: false,
                                        }));
                                      }}
                                      onTranslate={(translatedQn, translatedAns) => {
                                        setTranslatedQuestions((prev) => ({
                                          ...prev,
                                          [qnKey]: translatedQn,
                                        }));
                                        setTranslatedAnswers((prev) => ({
                                          ...prev,
                                          [qnKey]: translatedAns,
                                        }));
                                      }}
                                    />
                                  </div>
                                )}
                              </div>

                              {qn.weather && (
                                <AccordionContent className="pt-2 pb-1">
                                  <div className="bg-sky-50/40 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-900/50 rounded-xl p-3 space-y-2 mb-3">
                                    <div className="flex justify-between items-center w-full px-1">
                                      <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-semibold text-xs tracking-wider uppercase">
                                        <svg
                                          className="w-3.5 h-3.5 animate-pulse"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                          />
                                        </svg>
                                        <span>Weather Insights</span>
                                      </div>
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100/90 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300/60 dark:border-sky-800/60 tracking-wider uppercase shadow-2xs"
                                        title={getWeatherSource(qn.weather).label}
                                      >
                                        <Radio className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
                                        {getWeatherSource(qn.weather).tag}
                                      </span>
                                    </div>
                                    <div className="text-xs text-sky-900 dark:text-sky-300 leading-relaxed px-1">
                                      {renderWeatherInsights(qn.weather)}
                                    </div>
                                  </div>
                                </AccordionContent>
                              )}

                              {(qn.authorName || qn.sourceName) && (
                                <AccordionContent className="pt-0 pb-1">
                                  <div className="bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-3 space-y-2 mb-3">
                                    <div className="flex justify-between items-center w-full px-1">
                                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                                        <User className="w-3.5 h-3.5" />
                                        <span>Author & Reference Document</span>
                                      </div>
                                    </div>
                                    <div className="text-xs text-zinc-800 dark:text-zinc-200 px-1 space-y-1">
                                      {qn.authorName && (
                                        <p><span className="text-zinc-500">Author:</span> <strong>{qn.authorName}</strong></p>
                                      )}
                                      {qn.sourceName && (
                                        <p><span className="text-zinc-500">Source:</span> {qn.sourceLink ? <a href={qn.sourceLink} target="_blank" rel="noreferrer" className="text-indigo-600 underline">{qn.sourceName}</a> : <strong>{qn.sourceName}</strong>}</p>
                                      )}
                                    </div>
                                  </div>
                                </AccordionContent>
                              )}

                              <AccordionContent className="pt-0 pb-1">
                                <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/50 rounded-xl p-3 space-y-2">
                                  <div className="flex justify-between items-center w-full px-1">
                                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs tracking-wider uppercase">
                                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                      <span>AI Specialist Recommendation</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCopyAnswer(qnKey, translatedAnswers[qnKey] || qn.answer || "")}
                                      className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
                                      title="Copy recommendation"
                                    >
                                      {copiedStates[qnKey] ? (
                                        <>
                                          <Check className="h-3 w-3 text-emerald-600" />
                                          <span className="text-emerald-600 font-semibold">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                  <div className="text-[14.5px] leading-relaxed px-1 text-zinc-900 dark:text-zinc-100">
                                    {translatingQuestions[qnKey] ? (
                                      <div className="space-y-2 py-1 animate-pulse">
                                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-5/6"></div>
                                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-full"></div>
                                        <div className="h-3 bg-emerald-200/60 dark:bg-emerald-900/40 rounded w-2/3"></div>
                                      </div>
                                    ) : (
                                      renderMarkdown(translatedAnswers[qnKey] || qn.answer || "Nil", { baseFontSize: "text-[14px]" })
                                    )}
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CallInterface;

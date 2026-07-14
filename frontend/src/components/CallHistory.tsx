import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { Badge } from "./atoms/badge";
import { Switch } from "./atoms/switch";
import {
  Phone,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  MessageSquare,
  Languages,
  Globe,
  ChevronDown,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { plivoApi } from "@/hooks/api/plivo/api";
import type { CallHistoryItem } from "@/hooks/api/plivo/api";
import { format } from "date-fns";
import { FarmerDetails } from "./FarmerDetails";
import Plivo from "plivo-browser-sdk";
import { toast } from "@/shared/components/toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@radix-ui/react-accordion";
import { translateService } from "@/hooks/services/translateService";

const formatDomainField = (domainVal: any): string => {
  if (!domainVal) return "N/A";
  if (Array.isArray(domainVal)) {
    return domainVal.filter(Boolean).join(", ");
  }
  return String(domainVal);
};

const renderMarkdown = (text: string) => {
  if (!text) return null;

  const parseInlineMarkdown = (textVal: string) => {
    if (!textVal) return "";
    const boldParts = textVal.split(/\*\*([^*]+)\*\*/g);
    return boldParts.flatMap((boldPart, bIdx) => {
      const isBold = bIdx % 2 === 1;
      const codeParts = boldPart.split(/`([^`]+)`/g);
      const elements = codeParts.flatMap((codePart, cIdx) => {
        const isCode = cIdx % 2 === 1;
        if (isCode) {
          return (
            <code
              key={`c-${bIdx}-${cIdx}`}
              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[11px] border border-zinc-200/50 dark:border-zinc-700/50"
            >
              {codePart}
            </code>
          );
        }
        const italicParts = codePart.split(/\*([^*]+)\*/g);
        return italicParts.map((italicPart, iIdx) => {
          const isItalic = iIdx % 2 === 1;
          if (isItalic) {
            return (
              <em
                key={`i-${bIdx}-${cIdx}-${iIdx}`}
                className="italic text-zinc-850 dark:text-zinc-200"
              >
                {italicPart}
              </em>
            );
          }
          return italicPart;
        });
      });

      if (isBold) {
        return (
          <strong
            key={`b-${bIdx}`}
            className="font-bold text-zinc-950 dark:text-zinc-50"
          >
            {elements}
          </strong>
        );
      }
      return elements;
    });
  };

  const lines = text.split("\n");
  const blocks: any[] = [];
  let currentList: { type: "bullet" | "number"; items: string[] } | null = null;

  const pushCurrentList = () => {
    if (currentList) {
      blocks.push({
        type: currentList.type === "bullet" ? "unordered-list" : "ordered-list",
        items: currentList.items,
      });
      currentList = null;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Check if it's a bullet list item
    const isBullet = trimmed.startsWith("-") || trimmed.startsWith("*");
    // Check if it's a numbered list item
    const numberMatch = trimmed.match(/^\d+\.\s+(.*)$/);

    if (isBullet) {
      const itemText = trimmed.replace(/^[-*]\s*/, "");
      if (currentList && currentList.type === "bullet") {
        currentList.items.push(itemText);
      } else {
        pushCurrentList();
        currentList = { type: "bullet", items: [itemText] };
      }
    } else if (numberMatch) {
      const itemText = numberMatch[1];
      if (currentList && currentList.type === "number") {
        currentList.items.push(itemText);
      } else {
        pushCurrentList();
        currentList = { type: "number", items: [itemText] };
      }
    } else {
      pushCurrentList();

      // Parse header or paragraph
      const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        blocks.push({
          type: "header",
          level: headerMatch[1].length,
          text: headerMatch[2],
        });
      } else if (trimmed.length > 0) {
        blocks.push({
          type: "paragraph",
          text: line,
        });
      } else {
        blocks.push({
          type: "empty-line",
        });
      }
    }
  });

  pushCurrentList();

  return blocks.map((block, idx) => {
    switch (block.type) {
      case "header": {
        const level = block.level;
        if (level === 1) {
          return (
            <h1
              key={idx}
              className="text-[13.5px] font-extrabold text-zinc-950 dark:text-zinc-50 mt-4 mb-2 pb-1 border-b border-zinc-100 dark:border-zinc-800"
            >
              {parseInlineMarkdown(block.text)}
            </h1>
          );
        }
        if (level === 2) {
          return (
            <h2
              key={idx}
              className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-3.5 mb-1.5"
            >
              {parseInlineMarkdown(block.text)}
            </h2>
          );
        }
        return (
          <h3
            key={idx}
            className="text-[11.5px] font-semibold text-zinc-800 dark:text-zinc-200 mt-3 mb-1"
          >
            {parseInlineMarkdown(block.text)}
          </h3>
        );
      }
      case "unordered-list":
        return (
          <ul key={idx} className="space-y-1.5 my-2.5 pl-1.5">
            {block.items.map((item: string, itemIdx: number) => (
              <li
                key={itemIdx}
                className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 flex items-start gap-2"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mt-1.5 shrink-0" />
                <span className="flex-1">{parseInlineMarkdown(item)}</span>
              </li>
            ))}
          </ul>
        );
      case "ordered-list":
        return (
          <ol key={idx} className="space-y-1.5 my-2.5 pl-1.5">
            {block.items.map((item: string, itemIdx: number) => (
              <li
                key={itemIdx}
                className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 flex items-start gap-2"
              >
                <span className="flex-shrink-0 w-4 h-4 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[9px] font-bold mt-0.5">
                  {itemIdx + 1}
                </span>
                <span className="flex-1 pt-0.5">
                  {parseInlineMarkdown(item)}
                </span>
              </li>
            ))}
          </ol>
        );
      case "paragraph":
        return (
          <p
            key={idx}
            className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 mb-2 last:mb-0"
          >
            {parseInlineMarkdown(block.text)}
          </p>
        );
      case "empty-line":
        return <div key={idx} className="h-1.5" />;
      default:
        return null;
    }
  });
};

const renderWeatherInsights = (weather: any) => {
  if (!weather || typeof weather !== "object") {
    return typeof weather === "string" ? <p>{weather}</p> : null;
  }

  const { result } = weather;
  if (!result) {
    // Fallback if structure is flat or result key is missing
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(weather).map(([key, val]) => {
          if (val === null || val === undefined || typeof val === "function")
            return null;
          return (
            <div key={key} className="flex gap-1.5">
              <span className="font-semibold capitalize text-sky-900 dark:text-sky-400">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="text-sky-850 dark:text-sky-300">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const today = result.today || {};
  const forecastList = result.forecast || [];

  return (
    <div className="space-y-4 text-sky-900 dark:text-sky-300">
      {/* Location / Station Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-sky-200/50 dark:border-sky-800/50 pb-2 mb-2 gap-1">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
            Weather Station:{" "}
          </span>
          <span className="text-sm font-bold text-sky-950 dark:text-sky-100">
            {today.station || "Unknown"}
          </span>
          {today.distance_to_station_km && (
            <span className="text-xs text-sky-600 dark:text-sky-400 ml-1.5 font-medium">
              ({Number(today.distance_to_station_km).toFixed(1)} km away)
            </span>
          )}
        </div>
        {today.date && (
          <span className="text-xs font-medium text-sky-600 dark:text-sky-400">
            As of {today.date}
          </span>
        )}
      </div>

      {/* Today's Stats & Forecast Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Today's Condition Card */}
        <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-3 border border-sky-100/50 dark:border-sky-900/30">
          <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider mb-2">
            Today's Forecast
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-sky-700/80 dark:text-sky-400/80 font-medium">
                Condition:
              </span>
              <span className="font-semibold text-sky-950 dark:text-sky-100">
                {today.forecast || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-700/80 dark:text-sky-400/80 font-medium">
                Temperature:
              </span>
              <span className="font-semibold text-sky-950 dark:text-sky-100">
                {today.observed_min_temp || today.forecast_min_temp || "--"}°C
                to {today.observed_max_temp || today.forecast_max_temp || "--"}
                °C
              </span>
            </div>
            {today.past_24hrs_rainfall && (
              <div className="flex justify-between">
                <span className="text-sky-700/80 dark:text-sky-400/80 font-medium">
                  Rain (Last 24h):
                </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {today.past_24hrs_rainfall}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Today's Climate details Card */}
        <div className="bg-white/40 dark:bg-zinc-950/30 rounded-lg p-3 border border-sky-100/50 dark:border-sky-900/30">
          <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider mb-2">
            Humidity & Solar
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-sky-700/80 dark:text-sky-400/80 font-medium">
                Humidity (08:30 / 17:30):
              </span>
              <span className="font-semibold text-sky-950 dark:text-sky-100">
                {today.humidity_0830 || "--"}% / {today.humidity_1730 || "--"}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-700/80 dark:text-sky-400/80 font-medium">
                Sunrise / Sunset:
              </span>
              <span className="font-semibold text-sky-950 dark:text-sky-100">
                🌅 {today.sunrise || "--"} / 🌇 {today.sunset || "--"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Day Forecast */}
      {forecastList.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
            Upcoming Forecast
          </p>
          <div className="overflow-x-auto rounded-lg border border-sky-100/50 dark:border-sky-900/30 bg-white/30 dark:bg-zinc-950/20">
            <table className="min-w-full text-xs text-left divide-y divide-sky-100/30 dark:divide-sky-900/30">
              <thead className="bg-sky-100/40 dark:bg-sky-950/40 text-sky-850 dark:text-sky-350">
                <tr>
                  <th className="px-3 py-2 font-semibold">Day</th>
                  <th className="px-3 py-2 font-semibold">Temp (Min/Max)</th>
                  <th className="px-3 py-2 font-semibold">
                    Forecast Condition
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100/20 dark:divide-sky-900/20">
                {forecastList.map((f: any, idx: number) => (
                  <tr
                    key={idx}
                    className="hover:bg-sky-50/20 dark:hover:bg-sky-950/10"
                  >
                    <td className="px-3 py-2 font-semibold text-sky-900 dark:text-sky-300">
                      Day {f.day || idx + 2}
                    </td>
                    <td className="px-3 py-2 font-medium text-sky-950 dark:text-sky-200">
                      {f.min_temp}°C - {f.max_temp}°C
                    </td>
                    <td className="px-3 py-2 text-sky-850 dark:text-sky-300">
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

interface CallHistoryProps {
  onRedial?: (phoneNumber: string) => void;
}

export const CallHistory = ({ onRedial }: CallHistoryProps) => {
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const limit = 20;

  // Farmer Details
  const [selectedCallForDetails, setSelectedCallForDetails] = useState<
    string | null
  >(null);

  // Message
  const [messageRow, setMessageRow] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const MAX_MESSAGE_LENGTH = 150;

  // Translation
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");
  const [sendTranslated, setSendTranslated] = useState(false);
  const languageManuallyChangedRef = useRef(false);

  const SARVAM_LANGUAGES = [
    { code: "en-IN", name: "English" },
    { code: "hi-IN", name: "Hindi" },
    { code: "bn-IN", name: "Bengali" },
    { code: "gu-IN", name: "Gujarati" },
    { code: "kn-IN", name: "Kannada" },
    { code: "ml-IN", name: "Malayalam" },
    { code: "mr-IN", name: "Marathi" },
    { code: "od-IN", name: "Odia" },
    { code: "pa-IN", name: "Punjabi" },
    { code: "ta-IN", name: "Tamil" },
    { code: "te-IN", name: "Telugu" },
    { code: "as-IN", name: "Assamese" },
    { code: "doi-IN", name: "Dogri" },
    { code: "kok-IN", name: "Konkani" },
    { code: "ks-IN", name: "Kashmiri" },
    { code: "mai-IN", name: "Maithili" },
    { code: "mni-IN", name: "Manipuri" },
    { code: "ne-IN", name: "Nepali" },
    { code: "sa-IN", name: "Sanskrit" },
    { code: "sat-IN", name: "Santali" },
    { code: "sd-IN", name: "Sindhi" },
    { code: "ur-IN", name: "Urdu" },
    { code: "brx-IN", name: "Bodo" },
  ];

  // Reset translation state when message row is closed
  useEffect(() => {
    if (!messageRow) {
      setSendTranslated(false);
      languageManuallyChangedRef.current = false;
    }
  }, [messageRow]);

  // Initialize selectedLanguage with detected language when message row opens
  useEffect(() => {
    if (messageRow && !languageManuallyChangedRef.current) {
      const call = calls.find((c) => c.uuid === messageRow);
      if (
        call?.callDetails?.caller?.detectedLanguage &&
        call.callDetails?.caller?.detectedLanguage !== "unknown"
      ) {
        setSelectedLanguage(call.callDetails.caller.detectedLanguage);
      }
    }
  }, [messageRow, calls]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [directionFilter, setDirectionFilter] = useState<string>("");

  const fetchCallHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = page * limit;
      const data = await plivoApi.getCallHistory({
        limit,
        offset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: statusFilter || undefined,
        direction: directionFilter || undefined,
      });
      setCalls(data);
      // Note: Backend doesn't return total count, so we'll estimate based on returned data
      setTotalCalls(
        data.length === limit ? (page + 2) * limit : (page + 1) * limit,
      );
    } catch (err: any) {
      setError(err.message || "Failed to fetch call history");
      console.error("Error fetching call history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallHistory();
  }, [page]);

  const handleRefresh = () => {
    setPage(0);
    fetchCallHistory();
  };

  const handleApplyFilters = () => {
    setPage(0);
    fetchCallHistory();
  };

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setStatusFilter("");
    setDirectionFilter("");
    setPage(0);
    fetchCallHistory();
  };

  // const handleRedial = (phoneNumber: string) => {
  //   if (onRedial) {
  //     onRedial(phoneNumber);
  //   }
  // };

  const handleSendMessage = async (CallHistoryItem: any) => {
    const { from, to } = CallHistoryItem;

    // Designated numbers to check
    const designatedNumbers = [
      "918031150392",
      "sip:annamuser1293525305518427216@phone.plivo.com",
    ];

    // // Determine which number to call
    let numbertomsg; // Default to calling the 'to' number

    // // If 'from' contains any of the designated numbers, call the opposite (to)
    if (designatedNumbers.some((dn) => from?.includes(dn))) {
      numbertomsg = to;
    }
    // // If 'to' contains any of the designated numbers, call the opposite (from)
    else if (designatedNumbers.some((dn) => to?.includes(dn))) {
      numbertomsg = from;
    }
    const textToSend =
      sendTranslated && translatedText ? translatedText : messageText;
    if (!textToSend.trim()) return;
    if (textToSend.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Message exceeds ${MAX_MESSAGE_LENGTH} character limit`);
      return;
    }
    setSendingMessage(true);
    try {
      numbertomsg = numbertomsg.replace(/^91/, "");
      await plivoApi.sendMessage(numbertomsg, textToSend);
      toast.success("SMS sent successfully!");
      setMessageRow(null);
      setMessageText("");
      setTranslatedText(null);
      setSendTranslated(false);
    } catch (err: any) {
      toast.error(`Failed to send SMS: ${err.message || "Unknown error"}`);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleTranslate = async () => {
    // Always check original messageText for translation, not the displayed translated text
    if (!messageText.trim()) {
      toast.error("Please enter text to translate");
      return;
    }

    // Always use selectedLanguage since that's what the user manually selected
    const targetLanguage = selectedLanguage;

    // Check if source and target languages are the same
    if (targetLanguage === "en-IN") {
      toast.error(
        "Cannot translate to the same language (English). Please select a different target language.",
      );
      return;
    }

    setTranslating(true);
    try {
      const translated = await translateService(
        messageText,
        targetLanguage,
        "en-IN",
      );
      setTranslatedText(translated);
      setSendTranslated(true);
      toast.success("Text translated successfully!");
    } catch (err: any) {
      console.error("Translation error:", err);
      if (
        err.message?.includes("timeout") ||
        err.message?.includes("504") ||
        err.name === "AbortError"
      ) {
        toast.error("Translation request timed out. Please try again.");
      } else if (
        err.message?.includes("fetch") ||
        err.message?.includes("network")
      ) {
        toast.error(
          "Network error. Please check your connection and try again.",
        );
      } else if (
        err.message?.includes("Source and target languages must be different")
      ) {
        toast.error(
          "Source and target languages must be different. Please select a different target language.",
        );
      } else {
        toast.error(`Failed to translate: ${err.message || "Unknown error"}`);
      }
    } finally {
      setTranslating(false);
    }
  };

  const handleRedial = async (CallHistoryItem: any) => {
    // const { from, to } = CallHistoryItem;

    // // Designated numbers to check
    // const designatedNumbers = ["918031150392", "sip:annamuser1293525305518427216@phone.plivo.com"];

    // // Determine which number to call
    let numberToCall = "+919606751041"; // Default to calling the 'to' number

    // // If 'from' contains any of the designated numbers, call the opposite (to)
    // if (designatedNumbers.some(dn => from?.includes(dn))) {
    //   numberToCall = to;
    // }
    // // If 'to' contains any of the designated numbers, call the opposite (from)
    // else if (designatedNumbers.some(dn => to?.includes(dn))) {
    //   numberToCall = from;
    // }

    // Preserved for redial hook implementation

    let plivoClientRef;
    const options = {
      debug: "DEBUG" as const,
      permOnClick: true,
      enableTracking: true,
    };

    const client = new Plivo(options);
    plivoClientRef = client;
    try {
      const extraHeaders = {
        "X-PH-destination": "+919606751041",
      };
      const result = plivoClientRef.client.call("+919606751041", extraHeaders);
      toast.success(`Redialing ${numberToCall}. Call UUID: ${result}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate call");
    }
  };

  const getStatusColor = (status: string) => {
    if (!status) {
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
    switch (status.toLowerCase()) {
      case "completed":
      case "answered":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "failed":
      case "no answer":
      case "busy":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "in-progress":
      case "ringing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "queued":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getDirectionColor = (direction: string) => {
    if (!direction) {
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
    switch (direction.toLowerCase()) {
      case "inbound":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "outbound":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatPhoneNumber = (phoneNumber: string) => {
    if (
      phoneNumber.includes("sip:annamuser1293525305518427216@phone.plivo.com")
    ) {
      return "Expert";
    }
    return phoneNumber;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        {showFilters && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="no answer">No Answer</option>
                  <option value="busy">Busy</option>
                  <option value="in-progress">In Progress</option>
                  <option value="ringing">Ringing</option>
                  <option value="queued">Queued</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Direction</label>
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background"
                >
                  <option value="">All Directions</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApplyFilters} size="sm">
                Apply Filters
              </Button>
              <Button onClick={handleClearFilters} variant="outline" size="sm">
                Clear Filters
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && calls.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Call History Table */}
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Direction
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        From
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        To
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No calls found
                        </td>
                      </tr>
                    ) : (
                      calls.map((call) => (
                        <>
                          <tr
                            key={call.uuid}
                            className="border-b hover:bg-muted/50"
                          >
                            <td className="px-4 py-3">
                              <Badge
                                className={getDirectionColor(call.direction)}
                              >
                                {call.direction}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatPhoneNumber(call.from)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatPhoneNumber(call.to)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <Badge className={getStatusColor(call.status)}>
                                  {call.status}
                                </Badge>
                                {call.startTime && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(
                                      new Date(call.startTime),
                                      "MMM dd, HH:mm",
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatDuration(call.duration)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRedial(call)}
                                  className="gap-2"
                                >
                                  <Phone className="h-4 w-4" />
                                  Redial
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setMessageRow(
                                      messageRow === call.uuid
                                        ? null
                                        : call.uuid,
                                    );
                                    setMessageText("");
                                  }}
                                  className="gap-3"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                  Message
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setSelectedCallForDetails(
                                      selectedCallForDetails === call.uuid
                                        ? null
                                        : call.uuid,
                                    )
                                  }
                                  className="gap-2"
                                >
                                  <Eye className="h-4 w-4" />
                                  {selectedCallForDetails === call.uuid
                                    ? "Hide"
                                    : "View"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {selectedCallForDetails === call.uuid && (
                            <tr key={`details-${call.uuid}`}>
                              <td
                                colSpan={6}
                                className="px-6 py-5 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-b border-zinc-200/50 dark:border-zinc-800/50"
                              >
                                <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                  {/* Top Row: Farmer Details & Extracted Data Side-by-Side */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                                    <FarmerDetails
                                      phoneNo={call.from}
                                      defaultOpen={true}
                                      className="border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm bg-white dark:bg-zinc-900 rounded-xl h-full"
                                    />

                                    <Card className="border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm bg-white dark:bg-zinc-900 rounded-xl flex flex-col h-full">
                                      <CardHeader className="border-b border-zinc-100 dark:border-zinc-800">
                                        <CardTitle className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                          Extracted Call Data
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="p-3 pt-0 flex-1 flex flex-col justify-center">
                                        {call.callDetails?.QA_pairs
                                          ?.metadata ? (
                                          <ul className="space-y-3.5 text-xs text-zinc-600 dark:text-zinc-400">
                                            <li className="flex items-center gap-2">
                                              <span className="font-bold text-zinc-700 dark:text-zinc-300 min-w-[70px]">
                                                Crop:
                                              </span>
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded border border-zinc-200/30 dark:border-zinc-800/30">
                                                {call.callDetails.QA_pairs
                                                  .metadata.extracted_crop ||
                                                  "N/A"}
                                              </span>
                                            </li>
                                            <li className="flex items-center gap-2">
                                              <span className="font-bold text-zinc-700 dark:text-zinc-300 min-w-[70px]">
                                                Season:
                                              </span>
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded border border-zinc-200/30 dark:border-zinc-800/30">
                                                {call.callDetails.QA_pairs
                                                  .metadata.extracted_season ||
                                                  "N/A"}
                                              </span>
                                            </li>
                                            <li className="flex items-center gap-2">
                                              <span className="font-bold text-zinc-700 dark:text-zinc-300 min-w-[70px]">
                                                State:
                                              </span>
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded border border-zinc-200/30 dark:border-zinc-800/30">
                                                {call.callDetails.QA_pairs
                                                  .metadata.extracted_state ||
                                                  "N/A"}
                                              </span>
                                            </li>
                                            <li className="flex items-center gap-2">
                                              <span className="font-bold text-zinc-700 dark:text-zinc-300 min-w-[70px]">
                                                District:
                                              </span>
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded border border-zinc-200/30 dark:border-zinc-800/30">
                                                {call.callDetails.QA_pairs
                                                  .metadata
                                                  .extracted_district || "N/A"}
                                              </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                              <span className="font-bold text-zinc-700 dark:text-zinc-300 min-w-[70px] shrink-0 pt-0.5">
                                                Domain:
                                              </span>
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded border border-zinc-200/30 dark:border-zinc-800/30">
                                                {formatDomainField(
                                                  call.callDetails.QA_pairs
                                                    .metadata.extracted_domain,
                                                )}
                                              </span>
                                            </li>
                                          </ul>
                                        ) : (
                                          <div className="text-xs text-zinc-500 italic text-center py-4">
                                            No metadata extracted for this call
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  </div>

                                  {/* Call Transcripts (Full Width) */}
                                  <div className="space-y-3">
                                    <h3 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                      Call Transcripts
                                    </h3>

                                    {call.callDetails ? (
                                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 flex flex-col bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                                        {/* Farmer bubble (Inbound) */}
                                        {call.callDetails.caller &&
                                          (call.callDetails.caller.transcript ||
                                            call.callDetails.caller
                                              .translation) && (
                                            <div className="flex flex-col items-start space-y-1 animate-in fade-in duration-200">
                                              <div className="flex items-center gap-2 px-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold tracking-wider uppercase">
                                                <span>Farmer</span>
                                              </div>
                                              <div className="max-w-[85%] px-4 py-3 rounded-2xl shadow-sm border bg-zinc-50 dark:bg-zinc-800/30 border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none">
                                                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap font-medium">
                                                  {call.callDetails.caller
                                                    .translation || "N/A"}
                                                </p>
                                                {call.callDetails.caller
                                                  .transcript &&
                                                  call.callDetails.caller
                                                    .transcript !==
                                                  call.callDetails.caller
                                                    .translation && (
                                                    <div className="mt-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                                                      <div className="flex items-center gap-1.5 mb-1 text-[9px] uppercase tracking-wider font-bold text-zinc-400">
                                                        <Globe className="h-3 w-3" />
                                                        <span>
                                                          Original (
                                                          {call.callDetails
                                                            .caller
                                                            .detectedLanguage ||
                                                            "unknown"}
                                                          )
                                                        </span>
                                                      </div>
                                                      <p className="italic leading-relaxed">
                                                        {
                                                          call.callDetails
                                                            .caller.transcript
                                                        }
                                                      </p>
                                                    </div>
                                                  )}
                                              </div>
                                            </div>
                                          )}

                                        {/* Expert bubble (Outbound) */}
                                        {call.callDetails.agent &&
                                          (call.callDetails.agent.transcript ||
                                            call.callDetails.agent
                                              .translation) && (
                                            <div className="flex flex-col items-end space-y-1 animate-in fade-in duration-200">
                                              <div className="flex items-center gap-2 px-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold tracking-wider uppercase">
                                                <span>Expert</span>
                                              </div>
                                              <div className="max-w-[85%] px-4 py-3 rounded-2xl shadow-sm border bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 border-indigo-500 text-white rounded-tr-none shadow-indigo-500/10">
                                                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap font-medium">
                                                  {call.callDetails.agent
                                                    .translation || "N/A"}
                                                </p>
                                                {call.callDetails.agent
                                                  .transcript &&
                                                  call.callDetails.agent
                                                    .transcript !==
                                                  call.callDetails.agent
                                                    .translation && (
                                                    <div className="mt-2.5 pt-2.5 border-t border-white/20 text-xs text-white/80">
                                                      <div className="flex items-center gap-1.5 mb-1 text-[9px] uppercase tracking-wider font-bold text-white/75">
                                                        <Globe className="h-3 w-3" />
                                                        <span>
                                                          Original (
                                                          {call.callDetails
                                                            .agent
                                                            .detectedLanguage ||
                                                            "unknown"}
                                                          )
                                                        </span>
                                                      </div>
                                                      <p className="italic leading-relaxed">
                                                        {
                                                          call.callDetails.agent
                                                            .transcript
                                                        }
                                                      </p>
                                                    </div>
                                                  )}
                                              </div>
                                            </div>
                                          )}

                                        {!(
                                          call.callDetails.caller?.transcript ||
                                          call.callDetails.caller
                                            ?.translation ||
                                          call.callDetails.agent?.transcript ||
                                          call.callDetails.agent?.translation
                                        ) && (
                                            <div className="text-sm text-muted-foreground text-center py-6">
                                              No transcript data available for
                                              this call
                                            </div>
                                          )}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground text-center py-8 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                                        No transcript data available for this
                                        call
                                      </div>
                                    )}
                                  </div>

                                  {/* QnA Pairs (Full Width) */}
                                  {call.callDetails?.QA_pairs && (
                                    <div className="space-y-3">
                                      <h3 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Question & Answer Pairs
                                      </h3>

                                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                                        <Accordion
                                          type="single"
                                          collapsible
                                          className="w-full"
                                        >
                                          {call.callDetails.QA_pairs.QnA.map(
                                            (qa, index) => (
                                              <AccordionItem
                                                key={qa.id}
                                                value={`qa-${index}`}
                                                className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-b-0"
                                              >
                                                <AccordionTrigger className="text-left hover:no-underline py-3.5 w-full flex items-center justify-between group gap-2">
                                                  <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
                                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-55 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold mt-0.5">
                                                      {index + 1}
                                                    </span>
                                                    <div className="font-semibold text-[13.5px] text-zinc-800 dark:text-zinc-100 leading-normal flex-1">
                                                      {renderMarkdown(
                                                qa.question,
                                                      )}
                                                    </div>
                                                  </div>
                                                  <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-zinc-550 transition-transform duration-300 group-data-[state=open]:rotate-180 shrink-0 group-hover:text-zinc-600 dark:group-hover:text-zinc-350" />
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-1 pb-4">
                                                  <div className="pl-9 space-y-2.5">
                                                    <div className="bg-emerald-50/15 dark:bg-emerald-950/10 rounded-xl p-4 border border-emerald-100/50 dark:border-emerald-900/30 shadow-inner">
                                                      <div className="space-y-1 font-medium">
                                                        {renderMarkdown(
                                                          qa.answer,
                                                        )}
                                                      </div>
                                                    </div>

                                                    {/* Weather Insights */}
                                                    {qa.weather && (
                                                      <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-900/50 rounded-xl p-4 space-y-2">
                                                        <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-semibold text-xs tracking-wider uppercase">
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
                                                              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                                            />
                                                          </svg>
                                                          <span>Weather Insights</span>
                                                        </div>
                                                        <div className="text-[13px] text-sky-850 dark:text-sky-300 leading-relaxed">
                                                          {renderWeatherInsights(qa.weather)}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* Author & Reference Document */}
                                                    {(qa.authorName || qa.sourceName) && (
                                                      <div className="bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-4 space-y-2">
                                                        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                                                          <User className="w-3.5 h-3.5" />
                                                          <span>Author & Reference Document</span>
                                                        </div>
                                                        <div className="text-[13px] text-zinc-805 dark:text-zinc-305 leading-relaxed space-y-1">
                                                          {qa.authorName && (
                                                            <p>
                                                              <span className="font-semibold text-zinc-900 dark:text-zinc-400">
                                                                Author Name:
                                                              </span>{" "}
                                                              {qa.authorName}
                                                            </p>
                                                          )}
                                                          {qa.sourceName && (
                                                            <p>
                                                              <span className="font-semibold text-zinc-900 dark:text-zinc-400">
                                                                Source:
                                                              </span>{" "}
                                                              {qa.sourceLink ? (
                                                                <a
                                                                  href={qa.sourceLink}
                                                                  target="_blank"
                                                                  rel="noopener noreferrer"
                                                                  className="text-indigo-650 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1"
                                                                >
                                                                  {qa.sourceName}
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
                                                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                    />
                                                                  </svg>
                                                                </a>
                                                              ) : (
                                                                qa.sourceName
                                                              )}
                                                            </p>
                                                          )}
                                                        </div>
                                                      </div>
                                                    )}

                                                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider pl-1 mt-1.5">
                                                      <Badge
                                                        variant="outline"
                                                        className="text-[9px] px-2 py-0.5 border-emerald-200/50 dark:border-emerald-900/40 text-emerald-650 dark:text-emerald-400 font-bold bg-emerald-50/20 dark:bg-emerald-950/20"
                                                      >
                                                        {qa.agri_specialist}
                                                      </Badge>
                                                      <span className="text-zinc-350 dark:text-zinc-650">
                                                        •
                                                      </span>
                                                      <span className="text-zinc-500 dark:text-zinc-450">
                                                        {qa.referenceSource}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </AccordionContent>
                                              </AccordionItem>
                                            ),
                                          )}
                                        </Accordion>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {messageRow === call.uuid && (
                            <tr key={`message-${call.uuid}`}>
                              <td colSpan={6} className="px-4 py-4 bg-muted/10">
                                <div className="flex flex-col gap-2 max-w-md">
                                  <div className="flex items-center gap-2 justify-between">
                                    <h4 className="text-sm font-semibold">
                                      Send SMS to{" "}
                                      {call.direction === "inbound"
                                        ? call.from
                                        : call.to}
                                    </h4>
                                    {translatedText && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Switch
                                          id="show-translated"
                                          checked={sendTranslated}
                                          onCheckedChange={setSendTranslated}
                                        />
                                        <label
                                          htmlFor="show-translated"
                                          className="text-xs font-medium text-muted-foreground cursor-pointer"
                                        >
                                          Show translated text
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                  <textarea
                                    className="w-full p-2 border rounded-md text-sm bg-background"
                                    rows={3}
                                    placeholder="Type your SMS message here..."
                                    value={
                                      sendTranslated && translatedText
                                        ? translatedText
                                        : messageText
                                    }
                                    onChange={(e) => {
                                      if (
                                        e.target.value.length <=
                                        MAX_MESSAGE_LENGTH
                                      ) {
                                        setMessageText(e.target.value);
                                      }
                                    }}
                                    maxLength={MAX_MESSAGE_LENGTH}
                                    readOnly={
                                      !!(sendTranslated && translatedText)
                                    }
                                  />
                                  <div className="flex justify-between items-center mt-1">
                                    <span
                                      className={cn(
                                        "text-xs",
                                        (sendTranslated && translatedText
                                          ? translatedText.length
                                          : messageText.length) >=
                                          MAX_MESSAGE_LENGTH
                                          ? "text-red-500 font-semibold"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {sendTranslated && translatedText
                                        ? translatedText.length
                                        : messageText.length}
                                      /{MAX_MESSAGE_LENGTH} characters
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                      Select Target Language:
                                    </label>
                                    <select
                                      value={selectedLanguage}
                                      onChange={(e) => {
                                        setSelectedLanguage(e.target.value);
                                        languageManuallyChangedRef.current = true;
                                        setTranslatedText(null);
                                        setSendTranslated(false);
                                      }}
                                      className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                                    >
                                      {SARVAM_LANGUAGES.map((lang) => (
                                        <option
                                          key={lang.code}
                                          value={lang.code}
                                        >
                                          {lang.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex justify-end gap-2 mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setMessageRow(null);
                                        setSendTranslated(false);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleTranslate()}
                                      disabled={
                                        !(
                                          sendTranslated && translatedText
                                            ? translatedText
                                            : messageText
                                        ).trim() || translating
                                      }
                                      className="gap-2"
                                    >
                                      {translating && (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      )}
                                      <Languages className="h-3 w-3" />
                                      Translate
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleSendMessage(call)}
                                      disabled={
                                        !(
                                          sendTranslated && translatedText
                                            ? translatedText
                                            : messageText
                                        ).trim() ||
                                        sendingMessage ||
                                        (sendTranslated && translatedText
                                          ? translatedText
                                          : messageText
                                        ).length > MAX_MESSAGE_LENGTH
                                      }
                                      className="gap-2"
                                    >
                                      {sendingMessage && (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      )}
                                      Send SMS
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {calls.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {page * limit + 1} to{" "}
                  {Math.min((page + 1) * limit, totalCalls)} of {totalCalls}{" "}
                  calls
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm">Page {page + 1}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={calls.length < limit || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CallHistory;

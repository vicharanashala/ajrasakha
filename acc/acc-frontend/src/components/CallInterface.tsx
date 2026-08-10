import { useState, useEffect, useRef } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import type { CallTranscript } from "./IncomingCallBox";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { toast } from "sonner";
import { Button } from "./atoms/button";
import {
  RotateCcw,
  Send,
  MessageSquare,
  Globe,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lightbulb,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit3,
  Power,
  PowerOff,
  Copy,
  Check,
  Sparkles,
  FlaskConical,
  Maximize2,
  Minimize2,
} from "lucide-react";
import WeatherWidget from "./WeatherWidget";
import { plivoService } from "@/hooks/api/plivo/api";
import { useSubmitTranscript } from "@/hooks/api/context/useSubmitTranscript";
import { useAccAgentThread } from "@/hooks/api/acc-agent/useAccAgentThread";
import { useAccAgentExtract } from "@/hooks/api/acc-agent/useAccAgentExtract";
import { useAccAgentUpdateState } from "@/hooks/api/acc-agent/useAccAgentUpdateState";
import { useAccAgentResume } from "@/hooks/api/acc-agent/useAccAgentResume";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import SarvamTranslatePairDropdown from "@/components/SarvamTranslatePairDropdown";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { Checkbox } from "./atoms/checkbox";
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
import Plivo from "plivo-browser-sdk";
import type { ExtractDataResponse } from "@/hooks/services/accAgentService";
import { UserService } from "@/hooks/services/userService";

const userService = new UserService();

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

const SEASON_OPTIONS = ["Kharif", "Rabi", "Zaid"];

// Auto-select season based on current month
const getAutoSelectedSeason = (): string => {
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Season mapping based on Indian agricultural calendar:
  // Kharif → Sow: Apr–Aug | Harvest: Aug–Dec
  // Rabi → Sow: Sep–Dec | Harvest: Feb–May
  // Zaid [Summer] → Sow: Jan–Apr | Harvest: Apr–Jul

  if (currentMonth >= 4 && currentMonth <= 8) {
    // April to August: Kharif sowing season
    return "Kharif";
  } else if (currentMonth >= 9 && currentMonth <= 12) {
    // September to December: Kharif harvest / Rabi sowing
    return "Rabi";
  } else if (currentMonth >= 1 && currentMonth <= 3) {
    // January to March: Rabi harvest / Zaid sowing
    return "Rabi";
  } else {
    // Default fallback
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
              className="px-1.5 py-0.5 rounded bg-zinc-150 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[11px] border border-zinc-200/50 dark:border-zinc-700/50"
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
                className="italic text-zinc-800 dark:text-zinc-200"
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
              className="text-[14px] font-extrabold text-zinc-950 dark:text-zinc-50 mt-4 mb-2 pb-1 border-b border-zinc-100 dark:border-zinc-800"
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

export const CallInterface = () => {
  const { data: currentUser, refetch: refetchCurrentUser } =
    useGetCurrentUser();
  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();
  const [editableTranslatedTranscript, setEditableTranslatedTranscript] =
    useState("");
  const [transcriptsList, setTranscriptsList] = useState<CallTranscript[]>([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callUuid, setCallUuid] = useState<string | null>(null);
  const [lastCallUuid, setLastCallUuid] = useState<string | null>(null);
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
  const isGeneratingQuestions = isExtracting || isResuming;

  // Live conversation box 3-stage elastic state ("collapsed" | "half" | "full")
  const [liveConvState, setLiveConvState] = useState<"collapsed" | "half" | "full">("collapsed");

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [editableSummaryText, setEditableSummaryText] = useState("");
  const [extractedState, setExtractedState] = useState("");
  const [extractedCrop, setExtractedCrop] = useState("");
  const [hasGeneratedQuestions, setHasGeneratedQuestions] = useState(false);

  // Phone number state tracking
  const [callPhoneNumber, setCallPhoneNumber] = useState<string | null>(null);
  const [lastCallPhoneNumber, setLastCallPhoneNumber] = useState<string | null>(null);

  // HITL state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [extractedData, setExtractedData] =
    useState<ExtractDataResponse | null>(null);
  const [isHumanVerificationMode, setIsHumanVerificationMode] = useState(false);
  const [editableQuery, setEditableQuery] = useState("");
  const [editableCrop, setEditableCrop] = useState("");
  const [editableState, setEditableState] = useState("");
  const [editableDistrict, setEditableDistrict] = useState("");
  const [editableDomain, setEditableDomain] = useState<string[]>([]);
  const [editableSeason, setEditableSeason] = useState("");

  const handleToggleDomain = (domain: string) => {
    setEditableDomain((prev) =>
      prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain]
    );
  };

  // Farmer Details HITL state
  const [extractedFarmerProfile, setExtractedFarmerProfile] = useState<any>(null);
  const [activeExtractionModes, setActiveExtractionModes] = useState<Set<'farmer' | 'query'>>(new Set(['farmer', 'query']));
  const [currentExtractionType, setCurrentExtractionType] = useState<'farmer_details' | 'query_details' | null>(null);

  // Live conversation simulation state
  const [isSimulatingMode, setIsSimulatingMode] = useState(false);
  const [simRole, setSimRole] = useState<"inbound" | "outbound">("inbound");
  const [simText, setSimText] = useState("");
  const [simOriginalText, setSimOriginalText] = useState("");
  const [showOriginalInput, setShowOriginalInput] = useState(false);

  // Auto-scroll to bottom of chat bubbles
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [transcriptsList]);

  // Sync the editable translation draft when call ends
  useEffect(() => {
    if (!isCallActive && transcriptsList.length > 0) {
      const draft = transcriptsList
        .map((t) => {
          if (!t.translatedText?.trim()) return null;
          const speaker = t.track === "inbound" ? "Farmer" : "Expert";
          return `${speaker}: ${t.translatedText}`;
        })
        .filter(Boolean)
        .join("\n");
      setEditableTranslatedTranscript(draft);
    }
  }, [isCallActive, transcriptsList]);

  const handleSubmit = async () => {
    if (!editableTranslatedTranscript.trim()) {
      toast.error("Transcript is empty!");
      return;
    }

    try {
      await submitTranscript(editableTranslatedTranscript);
      setEditableTranslatedTranscript("");
      setTranscriptsList([]); // Clear the conversation view
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
      toast.success("Transcript submitted successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit transcript. Try again!");
    }
  };

  const handleResetTranscript = () => {
    setEditableTranslatedTranscript("");
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
    setEditableDomain([]);
    setEditableSeason("");
    setEditableFarmerName("");
    setEditableFarmerPhone("");
    setEditableFarmerAge("");
    setEditableFarmerGender("");
    setEditableFarmerVillage("");
    setEditableFarmerBlock("");
    setEditableFarmerPrimaryCrop("");
    setShouldUpdateFarmerProfile(true);
  };

  const handleResetConversation = () => {
    setCallUuid(null);
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
    setEditableDomain([]);
    setEditableSeason("");
    setEditableFarmerName("");
    setEditableFarmerPhone("");
    setEditableFarmerAge("");
    setEditableFarmerGender("");
    setEditableFarmerVillage("");
    setEditableFarmerBlock("");
    setEditableFarmerPrimaryCrop("");
    setShouldUpdateFarmerProfile(true);
    setIsSimulatingMode(false);
    setSimText("");
    setSimOriginalText("");
    toast.success("Conversation cleared");
  };

  const handleLoadTestTranscript = () => {
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + "_" +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const mockCallUuid = `testing_${dateStr}`;

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
    setCallPhoneNumber("+919999999999");
    setLastCallPhoneNumber("+919999999999");

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
    setEditableDomain([]);
    setEditableSeason("");

    setIsSimulatingMode(true);
    toast.success(`Loaded test transcript with UUID: ${mockCallUuid}. Click 'Extract & Verify' to test AI response.`);
  };

  const handleAddSimulatedMessage = () => {
    if (!simText.trim()) {
      toast.error("Please enter a message to simulate.");
      return;
    }

    const newMsg: CallTranscript = {
      track: simRole,
      text: simText.trim(),
      originalText: simOriginalText.trim() || undefined,
      translatedText: simText.trim(),
      detectedLanguage: simOriginalText.trim() ? "custom" : "en-IN",
      timestamp: new Date().toISOString(),
    };

    setTranscriptsList((prev) => [...prev, newMsg]);

    // Ensure callUuid & mock state is initialized if not present
    if (!callUuid) {
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

  const handleResetQuestions = () => {
    setQuestions([]);
    setHasGeneratedQuestions(false);
    toast.success("Questions cleared");
  };

  const handleGenerateQuestions = async () => {
    if (isHumanVerificationMode && threadId) {
      await handleApproveAndResume();
    } else {
      await handleExtractWithHITL("query_details");
    }
  };

  const handleExtractWithHITL = async (extractionType: 'farmer_details' | 'query_details') => {
    if (transcriptsList.length === 0) {
      toast.info("No transcripts available to extract.");
      return;
    }

    setCurrentExtractionType(extractionType);
    setQuestions([]);

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
      setExtractedData(data);

      if (extractionType === 'query_details') {
        if (data.extracted_query) setEditableQuery(data.extracted_query);
        if (data.extracted_crop) setEditableCrop(data.extracted_crop);
        if (data.extracted_state) setEditableState(data.extracted_state);
        if (data.extracted_district) setEditableDistrict(data.extracted_district);

        const normalizedDomain = data.extracted_domain
          ? Array.isArray(data.extracted_domain)
            ? data.extracted_domain
            : [data.extracted_domain]
          : [];
        if (normalizedDomain.length > 0) setEditableDomain(normalizedDomain);
        setEditableSeason(getAutoSelectedSeason());
      }

      if (extractionType === 'farmer_details') {
        setExtractedFarmerProfile({
          farmerName: data.extracted_name,
          phoneNo: data.extracted_phone || callPhoneNumber || lastCallPhoneNumber || "",
          age: data.extracted_age !== undefined && data.extracted_age !== null ? Number(data.extracted_age) : 45,
          gender: data.extracted_gender || "",
          villageName: data.extracted_village || "",
          blockName: data.extracted_block || "",
          primaryCrop: data.extracted_primary_crop || data.extracted_crop || "",
          secondaryCrop: (data as any).extracted_secondary_crop || "",
          state: data.extracted_state || "",
          district: data.extracted_district || "",
          languagePreference: (data as any).extracted_language || "",
          cropsCultivated: data.extracted_crop ? [data.extracted_crop] : [""],
        });
        if (data.extracted_state) setEditableState(data.extracted_state);
        if (data.extracted_district) setEditableDistrict(data.extracted_district);
      }

      setIsHumanVerificationMode(true);
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      if (data.extracted_query) setEditableSummaryText(data.extracted_query);
      if (data.extracted_state) setExtractedState(data.extracted_state);
      if (data.extracted_crop) setExtractedCrop(data.extracted_crop);

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

    let toastId;
    try {
      const finalDomain = editableDomain;

      // Normalize extracted domain to array for comparison
      const extractedDomainArray = extractedData?.extracted_domain
        ? Array.isArray(extractedData.extracted_domain)
          ? extractedData.extracted_domain
          : [extractedData.extracted_domain]
        : [];

      // Save/update farmer details if option is enabled and phone number is provided
      if (shouldUpdateFarmerProfile && editableFarmerPhone.trim()) {
        try {
          const phoneNoKey = editableFarmerPhone.trim();
          const profilePayload = {
            farmerName: editableFarmerName.trim() || undefined,
            phoneNo: phoneNoKey,
            age: editableFarmerAge.trim() ? parseInt(editableFarmerAge.trim(), 10) : undefined,
            gender: editableFarmerGender.trim() || undefined,
            villageName: editableFarmerVillage.trim() || undefined,
            blockName: editableFarmerBlock.trim() || undefined,
            state: editableState.trim() || undefined,
            district: editableDistrict.trim() || undefined,
            primaryCrop: editableFarmerPrimaryCrop.trim() || undefined,
          };

          console.log(`[FARMER_FLOW] Saving/updating farmer details for phone ${phoneNoKey}:`, profilePayload);

          // Check if farmer exists
          let existing = null;
          try {
            existing = await plivoService.getFarmerByPhoneNo(phoneNoKey);
          } catch (err) {
            console.warn(`[FARMER_FLOW] Error checking existing farmer:`, err);
          }

          if (existing && existing.profile) {
            // Update
            const updatedProfile = { ...existing.profile, ...profilePayload };
            await plivoService.updateFarmer(phoneNoKey, updatedProfile);
            console.log(`[FARMER_FLOW] Successfully updated farmer profile for ${phoneNoKey}`);
          } else {
            // Create
            await plivoService.createFarmer(phoneNoKey, profilePayload);
            console.log(`[FARMER_FLOW] Successfully created farmer profile for ${phoneNoKey}`);
          }
        } catch (farmerErr) {
          console.error(`[FARMER_FLOW] Failed to auto-save farmer profile:`, farmerErr);
          toast.error("Failed to automatically save farmer profile details.");
        }
      }

      const wasEdited =
        editableQuery !== extractedData?.extracted_query ||
        editableCrop !== extractedData?.extracted_crop ||
        editableState !== extractedData?.extracted_state ||
        editableDistrict !== extractedData?.extracted_district ||
        JSON.stringify(finalDomain) !== JSON.stringify(extractedDomainArray) ||
        editableSeason !== "" ||
        editableFarmerName !== (extractedData?.extracted_name || "") ||
        editableFarmerPhone !== (extractedData?.extracted_phone || "") ||
        editableFarmerAge !== (extractedData?.extracted_age !== undefined && extractedData?.extracted_age !== null ? String(extractedData.extracted_age) : "") ||
        editableFarmerGender !== (extractedData?.extracted_gender || "") ||
        editableFarmerVillage !== (extractedData?.extracted_village || "") ||
        editableFarmerBlock !== (extractedData?.extracted_block || "") ||
        editableFarmerPrimaryCrop !== (extractedData?.extracted_primary_crop || "");

      if (wasEdited) {
        // Step 3: Update state with corrections
        await updateState({
          threadId,
          correctedData: {
            query: editableQuery,
            crop: editableCrop,
            state: editableState,
            district: editableDistrict,
            domain: finalDomain,
            season: editableSeason,
            farmerName: editableFarmerName.trim() || undefined,
            farmerPhone: editableFarmerPhone.trim() || undefined,
            farmerAge: editableFarmerAge.trim() ? parseInt(editableFarmerAge.trim(), 10) : undefined,
            farmerGender: editableFarmerGender.trim() || undefined,
            farmerVillage: editableFarmerVillage.trim() || undefined,
            farmerBlock: editableFarmerBlock.trim() || undefined,
            farmerPrimaryCrop: editableFarmerPrimaryCrop.trim() || undefined,
          },
        });
        toast.info("Updated extracted data with your corrections.");
      }

      // Step 4: Resume and get answer
      const metadata = {
        extracted_query: editableQuery,
        extracted_crop: editableCrop,
        extracted_state: editableState,
        extracted_district: editableDistrict,
        extracted_block: editableFarmerBlock,
        standardized_domains: finalDomain,
        extracted_domain: finalDomain,
        extracted_season: editableSeason,
      };
      // Use lastCallUuid if call has ended, otherwise use current callUuid
      const targetCallUuid = callUuid || lastCallUuid || undefined;
      const result = await resumeAndGetAnswer({
        threadId,
        callUuid: targetCallUuid,
        metadata,
      });

      // Reset lastCallUuid after successful Q/A storage to prevent re-association
      if (targetCallUuid) {
        setLastCallUuid(null);
      }

      // Extract details from parsed values.final_answer object (or root response if flat)
      const finalAnswerObj = result?.values?.final_answer || result;
      const finalAnswerMarkdown =
        typeof finalAnswerObj === "string"
          ? finalAnswerObj
          : finalAnswerObj?.final_answer || result?.final_answer || "";

      const weather = finalAnswerObj?.weather || null;
      const similarPair = finalAnswerObj?.gdb?.similar_pair1 || null;
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

      toast.success("Final answer generated successfully!");
    } catch (err) {
      console.error("Error in resume", err);
      toast.error("Failed to generate final answer.");
    }
  };

  let plivoClientRef;

  const handleRedial = async (phoneNumber: string) => {
    // Preserved for redial hook implementation
    const options = {
      debug: "DEBUG" as const,
      permOnClick: true,
      enableTracking: true,
    };

    const client = new Plivo(options);
    plivoClientRef = client;
    try {
      const extraHeaders = {
        "X-PH-destination": "+919606751041", // e.g. "+919606751041"
      };
      const result = plivoClientRef.client.call("+919606751041", extraHeaders);
      toast.success(`Redialing ${phoneNumber}. Call UUID: ${result}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate call");
    }
  };

  const handleToggleAgentStatus = async (online: boolean) => {
    try {
      await userService.toggleAgentStatus(online);
      toast.success(
        online
          ? "You are now online and ready to receive calls"
          : "You are now offline",
      );
      // Refetch current user to update UI without page reload
      refetchCurrentUser();
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-full px-4 md:px-6 py-2 relative">
      {/* Agent Status Toggle - Top Right Corner */}
      {currentUser?.role === "call_agent" && (
        <div className="absolute -top-6 right-4 md:right-6 z-10">
          {currentUser?.agent && currentUser.agent !== "not_available" ? (
            <Button
              onClick={() => handleToggleAgentStatus(false)}
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-300 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20 text-red-700 dark:text-red-400"
            >
              <PowerOff className="h-3 w-3 mr-1" />
              Go Offline
            </Button>
          ) : (
            <Button
              onClick={() => handleToggleAgentStatus(true)}
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-300 hover:bg-green-50 dark:border-green-900 dark:hover:bg-green-950/20 text-green-700 dark:text-green-400"
            >
              <Power className="h-3 w-3 mr-1" />
              Go Online
            </Button>
          )}
        </div>
      )}
      {/* Incoming Call Box - Top Section */}
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
            setTranscriptsList([]);
            setQuestions([]);
            setTranslatedQuestions({});
            setTranslatedAnswers({});
            setTranslatingQuestions({});
            setCopiedStates({});
            setEditableTranslatedTranscript("");
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
            setEditableDomain([]);
            setEditableSeason("");
            setIsSimulatingMode(false);
          }
        }}
        onCallUuidChange={(uuid) => {
          if (uuid === callUuid) {
            return;
          }
          setCallUuid(uuid);
          // Preserve the last call's UUID when call ends for question generation
          if (uuid === null && callUuid !== null) {
            setLastCallUuid(callUuid);
          }
          // Reset lastCallUuid when a new call comes in
          if (uuid !== null) {
            setLastCallUuid(null);
            if (isHumanVerificationMode) {
              toast.info("New call connected. Resetting previous review draft.");
            }
            // Clear transcripts, questions, summary and translation states for new calls
            setTranscriptsList([]);
            setQuestions([]);
            setTranslatedQuestions({});
            setTranslatedAnswers({});
            setTranslatingQuestions({});
            setCopiedStates({});
            setEditableTranslatedTranscript("");
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
            setEditableDomain([]);
            setEditableSeason("");
            setIsSimulatingMode(false);
          }
        }}
        onPhoneNumberChange={(phone) => {
          if (phone === callPhoneNumber) {
            return;
          }
          setCallPhoneNumber(phone);
          // Preserve the last call's phone number when call ends
          if (phone === null && callPhoneNumber !== null) {
            setLastCallPhoneNumber(callPhoneNumber);
          }
          if (phone !== null) {
            setLastCallPhoneNumber(null);
          }
        }}
      />
      {/* <button onClick={() => handleRedial("+919606751041")}>Redial</button> */}

      {/* Premium Read-Only Chat-Bubble Conversation View (3-Stage Vertical Elastic Box) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Live Conversation Dialogue + Extracted Details below */}
        <div className="space-y-6 flex flex-col">
          <Card className="col-span-1 h-fit border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
            <CardHeader className="border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-3.5 py-2 sm:px-5 sm:py-2.5">
              <div className="flex items-center justify-between gap-3">
                {/* Left Side: Title on top, UUID & Status stacked underneath */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => setLiveConvState(liveConvState === "collapsed" ? "full" : "collapsed")}
                  >
                    <MessageSquare className={`h-4 w-4 text-indigo-600 dark:text-indigo-400 ${isCallActive ? "animate-pulse" : ""}`} />
                    <h3 className="font-bold text-lg sm:text-xl text-zinc-900 dark:text-zinc-100 tracking-tight">
                      Live conversation Dialogue
                    </h3>
                  </div>

                  {/* Sub-details: UUID & Status stacked vertically */}
                  <div className="flex flex-col gap-0.5 pl-6">
                    {callUuid && (
                      <span
                        className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 font-medium truncate max-w-[200px] sm:max-w-[280px]"
                        title={callUuid}
                      >
                        UUID: {callUuid}
                      </span>
                    )}

                    <div>
                      {isCallActive ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Streaming Live
                        </span>
                      ) : isSimulatingMode ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Simulation Mode
                        </span>
                      ) : transcriptsList.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Call Concluded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Buttons in 2 rows + Far-Right Dropdown Arrow */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex flex-col items-end gap-1.5">
                    {/* Top Row: Test & Reset Buttons */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        onClick={handleLoadTestTranscript}
                        disabled={isCallActive || isExtracting || isResuming}
                        size="sm"
                        variant="outline"
                        className="h-6.5 w-22 px-2.5 text-[11px] font-semibold border-amber-300 dark:border-amber-700/60 bg-amber-50/80 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 shadow-sm rounded-md flex items-center gap-1 transition-all"
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
                        className="h-6.5  w-23 px-2.5 text-[11px] border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 rounded-md flex items-center gap-1 font-medium"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </Button>
                    </div>

                    {/* Bottom Row: Extract and Verify Dropdown Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          disabled={isExtracting || transcriptsList.length === 0}
                          size="sm"
                          className="h-9 px-3 text-sm sm:text-base font-extrabold btn-primary-emerald shadow-md rounded-lg flex items-center gap-1.5 transition-all w-full justify-center"
                        >
                          <Sparkles className="h-4 w-4 text-primary-accent-fg/80" />
                          <span>
                            {isExtracting
                              ? currentExtractionType === "farmer_details"
                                ? "Extracting Farmer..."
                                : currentExtractionType === "query_details"
                                  ? "Extracting Query..."
                                  : "Extracting..."
                              : "Extract and Verify"}
                          </span>
                          <ChevronDown className="h-4 w-4 ml-0.5 opacity-80" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl p-1 z-50">
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
                  </div>

                  {/* Far Right: Dropdown Chevron Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLiveConvState(liveConvState === "collapsed" ? "full" : "collapsed")}
                    className="h-10 w-10 p-0 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100/80 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-300/80 dark:border-zinc-700/80 rounded-xl shrink-0 shadow-sm transition-all hover:scale-105 active:scale-95"
                    title={liveConvState === "collapsed" ? "Expand Live Conversation" : "Collapse Live Conversation"}
                  >
                    {liveConvState === "collapsed" ? (
                      <ChevronDown className="h-6.5 w-6.5 stroke-[2.5]" />
                    ) : (
                      <ChevronUp className="h-6.5 w-6.5 stroke-[2.5]" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${liveConvState !== "collapsed"
                ? "max-h-[1200px] opacity-100"
                : "max-h-0 opacity-0 hidden"
                }`}
            >
              <CardContent className="p-3 sm:p-4 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-2.5">
                <div
                  ref={chatContainerRef}
                  className={`space-y-3 overflow-y-auto pr-2 sm:pr-3 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 flex flex-col border-b border-zinc-100 dark:border-zinc-900 pb-2 transition-all duration-300 ${liveConvState === "full" ? "h-[420px]" : "h-[210px]"
                    }`}
                >
                  {transcriptsList.length > 0 ? (
                    transcriptsList.map((msg, index) => {
                      const isCaller = msg.track === "inbound";
                      const speakerLabel = isCaller ? "Farmer" : "Expert";
                      return (
                        <div
                          key={index}
                          className={`flex flex-col ${isCaller ? "items-start" : "items-end"} space-y-1.5 animate-in fade-in-50 slide-in-from-bottom-3 duration-300`}
                        >
                          {/* Speaker & Timestamp */}
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
                          </div>

                          {/* Chat Bubble Card */}
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
                      />

                      <Button
                        onClick={handleAddSimulatedMessage}
                        disabled={!simText.trim()}
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
                <div className="flex justify-end pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setLiveConvState(liveConvState === "full" ? "half" : "full")}
                    className="h-6 w-6 p-0 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-md shrink-0 ml-auto"
                    title={liveConvState === "full" ? "Compress height" : "Expand height"}
                  >
                    {liveConvState === "full" ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </div>
          </Card>


        </div>

        {/* Right Column: Extracted Query Details & Generated Answers */}
        <div className="space-y-6 flex flex-col h-full">
          {/* Extracted Query Details & Summary Card (Right Column) */}
          {isSummaryOpen && activeExtractionModes.has('query') && (
            <Card className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300 animate-in fade-in-50 slide-in-from-top-2">
              <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4 transition-colors">
                <CardTitle className="flex items-center justify-between text-sm font-semibold">
                  <span
                    className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  >
                    <FileText className="h-4 w-4" />
                    Extracted Query Details & Summary
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-transparent"
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
                <CardContent className="p-6 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-4">
                  {isExtracting && currentExtractionType === 'query_details' ? (
                    <div className="flex flex-col space-y-3">
                      <Skeleton className="h-4 w-3/4 rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-5/6 rounded-md" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Edit3 className="h-4 w-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          Review & Edit Extracted Query Data
                        </span>
                      </div>

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
                            onChange={(e) => setEditableQuery(e.target.value)}
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
                              onChange={(e) => setEditableCrop(e.target.value)}
                              className="text-sm"
                              placeholder="Crop..."
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
                                setEditableDistrict(e.target.value)
                              }
                              className="text-sm"
                              placeholder="District..."
                            />
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
                                setEditableState(e.target.value)
                              }
                              className="text-sm"
                              placeholder="State..."
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
                              onValueChange={setEditableSeason}
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

                      <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
                        <Button
                          onClick={() => setIsHumanVerificationMode(false)}
                          variant="outline"
                          size="sm"
                          className="h-10 px-4 text-xs font-semibold border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all"
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
                          className="h-10 px-5 text-xs md:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <CheckCircle2 className="h-4 w-4 text-indigo-200" />
                          <span>
                            {isResuming
                              ? "Generating Answer..."
                              : "Approve & Generate Answer"}
                          </span>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </div>
            </Card>
          )}

          {/* Right Column: Generated Questions & Answers List */}
          <Card className="flex-1 min-h-[400px] md:h-auto border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
            <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2 text-primary">
                      <HelpCircle className="h-4 w-4" />
                      Live Questions
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    These are questions generated from your transcript
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{questions?.length} questions</Badge>
                  <Button
                    onClick={handleResetQuestions}
                    disabled={questions?.length === 0}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="h-full overflow-hidden p-6 bg-zinc-50/20 dark:bg-zinc-950/20">
              {isGeneratingQuestions && transcriptsList.length > 0 ? (
                <div className="flex flex-col h-[400px] text-center text-muted-foreground space-y-4">
                  <Skeleton className="h-24 w-full rounded-md" />
                  <Skeleton className="h-24 w-full rounded-md" />
                  <Skeleton className="h-24 w-full rounded-md" />
                </div>
              ) : (
                <ScrollArea className="h-[400px] w-full">
                  {!questions || questions?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground mt-10">
                      <Lightbulb className="h-10 w-10 mb-4 opacity-50" />
                      <p className="text-sm">
                        Click "Generate question" to fetch AI insights from the
                        current conversation.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-10">
                      {questions?.map((qn, index) => {
                        const qnKey = qn.id || `${qn.question}-${index}`;
                        return (
                          <div
                            key={`${qn.question}-${qn.id + index}`}
                            className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-md transition-all duration-300 overflow-hidden"
                          >
                            <div className="p-4">
                              <div className="flex items-start gap-3 mb-3">
                                <div className="text-indigo-600 dark:text-indigo-400 mt-1">
                                  <HelpCircle className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="flex-1">
                                      {translatingQuestions[qnKey] ? (
                                        <div className="space-y-2 py-1 animate-pulse">
                                          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
                                        </div>
                                      ) : (
                                        <p className="text-sm font-medium text-foreground leading-relaxed">
                                          {translatedQuestions[qnKey] || qn.question}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                                      {(qn.question?.trim() || qn.answer?.trim()) && (
                                        <SarvamTranslatePairDropdown
                                          query1={qn.question || ""}
                                          query2={qn.answer || ""}
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
                                      )}
                                      {qn.agri_specialist &&
                                        qn.agri_specialist !== "Unknown" &&
                                        qn.agri_specialist !== "AGRI_EXPERT" && (
                                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider whitespace-nowrap">
                                            <User className="w-3 h-3" />
                                            {qn.agri_specialist}
                                          </div>
                                        )}
                                    </div>
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
                                  <AccordionTrigger className="py-2 px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold tracking-wide uppercase hover:no-underline">
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
                                      View Details
                                    </div>
                                  </AccordionTrigger>

                                  {qn.weather && (
                                    <AccordionContent className="pt-0 pb-1">
                                      <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-900/50 rounded-lg p-3 space-y-2 mb-3">
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
                                        </div>
                                        <div className="text-[13px] text-sky-850 dark:text-sky-300 leading-relaxed px-1">
                                          {renderWeatherInsights(qn.weather)}
                                        </div>
                                      </div>
                                    </AccordionContent>
                                  )}

                                  {(qn.authorName || qn.sourceName) && (
                                    <AccordionContent className="pt-0 pb-1">
                                      <div className="bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 rounded-lg p-3 space-y-2 mb-3">
                                        <div className="flex justify-between items-center w-full px-1">
                                          <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                                            <User className="w-3.5 h-3.5" />
                                            <span>
                                              Author & Reference Document
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-[13px] text-zinc-805 dark:text-zinc-305 leading-relaxed px-1 space-y-1">
                                          {qn.authorName && (
                                            <p>
                                              <span className="font-semibold text-zinc-900 dark:text-zinc-400">
                                                Author Name:
                                              </span>{" "}
                                              {qn.authorName}
                                            </p>
                                          )}
                                          {qn.sourceName && (
                                            <p>
                                              <span className="font-semibold text-zinc-900 dark:text-zinc-400">
                                                Source:
                                              </span>{" "}
                                              {qn.sourceLink ? (
                                                <a
                                                  href={qn.sourceLink}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1"
                                                >
                                                  {qn.sourceName}
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
                                                qn.sourceName
                                              )}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </AccordionContent>
                                  )}

                                  <AccordionContent className="pt-0 pb-1">
                                    <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/50 rounded-lg p-3 space-y-2">
                                      <div className="flex justify-between items-center w-full px-1">
                                        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 font-semibold text-xs tracking-wider uppercase">
                                          <MessageSquare className="w-3.5 h-3.5" />
                                          <span>Specialist Answer</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyAnswer(qnKey, translatedAnswers[qnKey] || qn.answer || "");
                                            }}
                                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 transition-all text-[10px] font-semibold uppercase tracking-wider border border-indigo-100/50 dark:border-indigo-900/30 ml-2 active:scale-95"
                                            title="Copy Answer"
                                          >
                                            {copiedStates[qnKey] ? (
                                              <>
                                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-3 h-3" />
                                                <span>Copy</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                          <User className="w-3 h-3" />
                                          <span>
                                            {qn.agri_specialist || "Unknown"}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="text-[13px] text-indigo-800 dark:text-indigo-300 leading-relaxed px-1">
                                        {translatingQuestions[qnKey] ? (
                                          <div className="space-y-2 py-1 animate-pulse">
                                            <div className="h-3 bg-indigo-200 dark:bg-indigo-900/50 rounded w-5/6"></div>
                                            <div className="h-3 bg-indigo-200 dark:bg-indigo-900/50 rounded w-full"></div>
                                            <div className="h-3 bg-indigo-200 dark:bg-indigo-900/50 rounded w-2/3"></div>
                                          </div>
                                        ) : (
                                          <p className="whitespace-pre-wrap leading-relaxed">
                                            {stripMarkdown(translatedAnswers[qnKey] || qn.answer || "Nil")}
                                          </p>
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
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              )}

              {(questions?.length || 0) > 0 && (
                <div className="text-center text-xs text-muted-foreground pt-4 font-medium uppercase tracking-wider">
                  <p>Questions generated from conversation</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="w-full pt-4">
        <WeatherWidget defaultState={editableState || extractedState || "Karnataka"} />
      </div>
    </div>
  );
};

export default CallInterface;

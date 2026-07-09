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
} from "lucide-react";
import { useSubmitTranscript } from "@/hooks/api/context/useSubmitTranscript";
import { useGenerateCallQuestion } from "@/hooks/api/question/useGenerateCallQuestion";
import { useAccAgentThread } from "@/hooks/api/acc-agent/useAccAgentThread";
import { useAccAgentExtract } from "@/hooks/api/acc-agent/useAccAgentExtract";
import { useAccAgentUpdateState } from "@/hooks/api/acc-agent/useAccAgentUpdateState";
import { useAccAgentResume } from "@/hooks/api/acc-agent/useAccAgentResume";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
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
  const lastTranscriptRef = useRef("");
  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } =
    useGenerateCallQuestion();

  // ACC Agent HITL hooks
  const { mutateAsync: createThread } = useAccAgentThread();
  const { mutateAsync: extractData, isPending: isExtracting } =
    useAccAgentExtract();
  const { mutateAsync: updateState } = useAccAgentUpdateState();
  const { mutateAsync: resumeAndGetAnswer, isPending: isResuming } =
    useAccAgentResume();

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [editableSummaryText, setEditableSummaryText] = useState("");
  const [extractedState, setExtractedState] = useState("");
  const [extractedCrop, setExtractedCrop] = useState("");
  const [hasGeneratedQuestions, setHasGeneratedQuestions] = useState(false);

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
  };

  const handleResetConversation = () => {
    setTranscriptsList([]);
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
    toast.success("Conversation cleared");
  };

  const handleResetQuestions = () => {
    setQuestions([]);
    setHasGeneratedQuestions(false);
    toast.success("Questions cleared");
  };

  const handleGenerateQuestions = async () => {
    if (!editableSummaryText.trim()) {
      toast.info("Summary is empty. Please summarize the conversation first.");
      return;
    }

    try {
      const qstns = await generateQuestions({
        transcript: editableSummaryText,
        state: extractedState,
        crop: extractedCrop,
      });
      setQuestions((prev) => [...prev, ...(qstns || [])]);
      setHasGeneratedQuestions(true);
    } catch (err) {
      console.error("Error generating question", err);
      toast.error("Failed to generate questions.");
    }
  };

  const handleExtractWithHITL = async () => {
    if (transcriptsList.length === 0) {
      toast.info("No transcripts available to extract.");
      return;
    }

    const allTranscriptText = transcriptsList
      .map((t) => {
        const speaker = t.track === "inbound" ? "Farmer" : "Expert";
        return `${speaker}: ${t.translatedText || t.text || t.originalText}`;
      })
      .filter(Boolean)
      .join("\n");

    let toastId;
    try {
      // Step 1: Create thread
      const thread = await createThread();
      setThreadId(thread.thread_id);

      // Step 2: Extract data
      const data = await extractData({
        threadId: thread.thread_id,
        transcript: allTranscriptText,
      });
      setExtractedData(data);

      // Initialize editable fields with extracted data
      setEditableQuery(data.extracted_query);
      setEditableCrop(data.extracted_crop);
      setEditableState(data.extracted_state);
      setEditableDistrict(data.extracted_district);

      // Use domain from AI response if available, otherwise empty array
      const normalizedDomain = data.extracted_domain
        ? Array.isArray(data.extracted_domain)
          ? data.extracted_domain
          : [data.extracted_domain]
        : [];
      setEditableDomain(normalizedDomain);

      // Auto-select season based on current month
      setEditableSeason(getAutoSelectedSeason());

      setIsHumanVerificationMode(true);
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      // Also set the old format for backward compatibility
      setEditableSummaryText(data.extracted_query);
      setExtractedState(data.extracted_state);
      setExtractedCrop(data.extracted_crop);

      toast.success(
        "Data extracted successfully. Please review and edit if needed.",
      );
    } catch (err) {
      console.error("Error in HITL extraction", err);
      toast.error("Failed to extract data. Please try again.");
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

      const wasEdited =
        editableQuery !== extractedData?.extracted_query ||
        editableCrop !== extractedData?.extracted_crop ||
        editableState !== extractedData?.extracted_state ||
        editableDistrict !== extractedData?.extracted_district ||
        JSON.stringify(finalDomain) !== JSON.stringify(extractedDomainArray) ||
        editableSeason !== "";

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
      setIsHumanVerificationMode(false);

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
        onTranscriptChange={() => {}} // Not using direct strings anymore
        onOriginalTranscriptChange={() => {}}
        onTranscriptsListChange={(list) => setTranscriptsList(list)}
        onCallStateChange={(isActive) => setIsCallActive(isActive)}
        onCallUuidChange={(uuid) => {
          setCallUuid(uuid);
          // Preserve the last call's UUID when call ends for question generation
          if (uuid === null && callUuid !== null) {
            setLastCallUuid(callUuid);
          }
          // Reset lastCallUuid when a new call comes in
          if (uuid !== null) {
            setLastCallUuid(null);
          }
        }}
      />
      {/* <button onClick={() => handleRedial("+919606751041")}>Redial</button> */}

      {/* Premium Read-Only Chat-Bubble Conversation View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-fit border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
          <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex flex-col md:flex-row md:items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <div className="flex items-center gap-2">
                  <MessageSquare
                    className={`h-4 w-4 ${isCallActive ? "animate-pulse" : ""}`}
                  />
                  Live Conversation Dialogue
                </div>
                {callUuid && (
                  <Badge
                    variant="secondary"
                    className="font-mono text-[10px] py-0.5 px-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30"
                  >
                    UUID: {callUuid}
                  </Badge>
                )}
              </span>
              <div className="flex items-center gap-4">
                {isCallActive ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400 font-semibold uppercase tracking-wider animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Streaming Live
                  </span>
                ) : transcriptsList.length > 0 ? (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Call Concluded
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                    Inactive
                  </span>
                )}
                <Button
                  onClick={handleExtractWithHITL}
                  disabled={isExtracting || transcriptsList.length === 0}
                  size="sm"
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isExtracting ? "Extracting..." : "Extract & Verify"}
                </Button>

                <Button
                  onClick={handleResetConversation}
                  disabled={transcriptsList.length === 0}
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
          <div
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isCallActive || transcriptsList.length > 0
                ? "max-h-[850px] opacity-100"
                : "max-h-0 opacity-0"
            }`}
          >
            <CardContent className="p-6 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-4">
              <div
                ref={chatContainerRef}
                className="space-y-5 h-[400px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 flex flex-col border-b border-zinc-100 dark:border-zinc-900 pb-4"
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
                          className={`max-w-[80%] px-5 py-3.5 rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-md ${
                            isCaller
                              ? "bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none"
                              : "bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 border-indigo-500 text-white rounded-tr-none shadow-indigo-500/10 dark:shadow-indigo-500/5"
                          }`}
                        >
                          {/* English Translation (Primary) */}
                          <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                            {msg.translatedText || msg.text}
                          </p>

                          {/* Original text & language metadata (Secondary) */}
                          {msg.originalText && (
                            <div
                              className={`mt-2.5 pt-2 border-t text-[12px] flex flex-col gap-1 ${
                                isCaller
                                  ? "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
                                  : "border-white/20 text-white/80"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[10px]">
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
                ) : null}
              </div>
            </CardContent>
          </div>
        </Card>

        <div className="space-y-6 flex flex-col h-full">
          {isSummaryOpen && (
            <Card className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300 animate-in fade-in-50 slide-in-from-top-2">
              <CardHeader
                className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              >
                <CardTitle className="flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <FileText className="h-4 w-4" />
                    Conversation Summary
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-transparent"
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
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isSummaryExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}
              >
                <CardContent className="p-6 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-4">
                  {isExtracting ? (
                    <div className="flex flex-col space-y-3">
                      <Skeleton className="h-4 w-3/4 rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-5/6 rounded-md" />
                    </div>
                  ) : isHumanVerificationMode ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Edit3 className="h-4 w-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          Review & Edit Extracted Data
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <Label
                            htmlFor="query"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Query / Question
                          </Label>
                          <Input
                            id="query"
                            value={editableQuery}
                            onChange={(e) => setEditableQuery(e.target.value)}
                            className="text-sm"
                            placeholder="Extracted question..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label
                              htmlFor="crop"
                              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                            >
                              Crop
                            </Label>
                            <Input
                              id="crop"
                              value={editableCrop}
                              onChange={(e) => setEditableCrop(e.target.value)}
                              className="text-sm"
                              placeholder="Crop..."
                            />
                          </div>

                          <div>
                            <Label
                              htmlFor="state"
                              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                            >
                              State
                            </Label>
                            <Input
                              id="state"
                              value={editableState}
                              onChange={(e) => setEditableState(e.target.value)}
                              className="text-sm"
                              placeholder="State..."
                            />
                          </div>
                        </div>

                        <div>
                          <Label
                            htmlFor="district"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            District
                          </Label>
                          <Input
                            id="district"
                            value={editableDistrict}
                            onChange={(e) =>
                              setEditableDistrict(e.target.value)
                            }
                            className="text-sm"
                            placeholder="District..."
                          />
                        </div>

                        <div className="md:col-span-2">
                          <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                            Domain (Select multiple)
                          </Label>
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2.5 border border-zinc-200/60 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800">
                            {DOMAIN_OPTIONS.map((domain) => (
                              <div
                                key={domain}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={`domain-${domain}`}
                                  checked={editableDomain.includes(domain)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setEditableDomain([
                                        ...editableDomain,
                                        domain,
                                      ]);
                                    } else {
                                      setEditableDomain(
                                        editableDomain.filter(
                                          (d) => d !== domain,
                                        ),
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`domain-${domain}`}
                                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer"
                                >
                                  {domain}
                                </label>
                              </div>
                            ))}
                          </div>
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
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Select season..." />
                            </SelectTrigger>
                            <SelectContent>
                              {SEASON_OPTIONS.map((season) => (
                                <SelectItem key={season} value={season}>
                                  {season}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          onClick={() => setIsHumanVerificationMode(false)}
                          variant="outline"
                          size="sm"
                          className="text-xs"
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
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          {isResuming
                            ? "Generating..."
                            : "Approve & Generate Answer"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <textarea
                      value={editableSummaryText}
                      onChange={(e) => setEditableSummaryText(e.target.value)}
                      readOnly={hasGeneratedQuestions}
                      className={`w-full p-3 text-sm leading-relaxed rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all duration-300 dark:text-zinc-100 shadow-inner ${
                        hasGeneratedQuestions
                          ? "min-h-[60px] max-h-[100px] resize-none overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/50 opacity-90 text-zinc-600 dark:text-zinc-400 text-xs"
                          : "min-h-[150px] resize-y overflow-y-auto focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                      }`}
                      placeholder="Conversation summary will appear here..."
                    />
                  )}
                  {!hasGeneratedQuestions && !isHumanVerificationMode && (
                    <div className="flex justify-end mt-4">
                      <Button
                        onClick={handleGenerateQuestions}
                        disabled={
                          isGeneratingQuestions || !editableSummaryText.trim()
                        }
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all font-medium h-9 px-4 rounded-lg"
                      >
                        {isGeneratingQuestions
                          ? "Generating..."
                          : "Generate question"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </div>
            </Card>
          )}

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
                      {questions?.map((qn, index) => (
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
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground leading-relaxed">
                                    {qn.question}
                                  </p>
                                  {qn.agri_specialist &&
                                    qn.agri_specialist !== "Unknown" &&
                                    qn.agri_specialist !== "AGRI_EXPERT" && (
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider whitespace-nowrap self-start sm:self-auto">
                                        <User className="w-3 h-3" />
                                        {qn.agri_specialist}
                                      </div>
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
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                        <User className="w-3 h-3" />
                                        <span>
                                          {qn.agri_specialist || "Unknown"}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-[13px] text-indigo-800 dark:text-indigo-300 leading-relaxed px-1">
                                      {qn.agri_specialist === "ACC_AGENT" ? (
                                        <div className="space-y-1">
                                          {renderMarkdown(qn.answer)}
                                        </div>
                                      ) : (
                                        qn.answer || "Nil"
                                      )}
                                    </p>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        </div>
                      ))}
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

      {!isCallActive && transcriptsList.length > 0 && (
        <Card className="border border-indigo-200/30 dark:border-indigo-900/30 shadow-lg bg-gradient-to-br from-white to-zinc-50/30 dark:from-zinc-950 dark:to-zinc-900/30 rounded-xl overflow-hidden animate-in fade-in-50 slide-in-from-bottom-5 duration-400">
          <CardHeader className="border-b border-zinc-200/30 dark:border-zinc-800/30 px-4">
            <CardTitle className="text-sm font-semibold flex justify-between items-center text-zinc-900 dark:text-zinc-100">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-indigo-500" />
                Review & Edit Translation Draft
              </span>
              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={handleResetTranscript}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1 text-xs border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 rounded-lg font-medium transition-all px-2.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Draft
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!editableTranslatedTranscript.trim() || isPending}
                  size="sm"
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 h-8 rounded-lg shadow-md shadow-indigo-600/10 hover:shadow-lg hover:shadow-indigo-600/20 transition-all duration-200 disabled:opacity-50 text-base"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPending ? "Submitting Draft..." : "Submit Translation"}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <textarea
              value={editableTranslatedTranscript}
              onChange={(e) => setEditableTranslatedTranscript(e.target.value)}
              className="w-full min-h-[300px] max-h-[220px] mx-auto p-3 text-sm leading-relaxed rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 resize-y overflow-y-auto whitespace-pre-wrap focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all dark:text-zinc-100"
              placeholder="Edit the complete translated conversation transcript before final submission..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CallInterface;

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
  Edit3,
  Copy,
  Check,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import WeatherWidget from "./WeatherWidget";
import { useAccAgentThread } from "@/hooks/api/acc-agent/useAccAgentThread";
import { useAccAgentExtract } from "@/hooks/api/acc-agent/useAccAgentExtract";
import { useAccAgentUpdateState } from "@/hooks/api/acc-agent/useAccAgentUpdateState";
import { useAccAgentResume } from "@/hooks/api/acc-agent/useAccAgentResume";
import SarvamTranslatePairDropdown from "@/components/SarvamTranslatePairDropdown";
import { renderMarkdown } from "@/utils/markdownRenderer";
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

  const [_isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [_editableSummaryText, setEditableSummaryText] = useState("");
  const [extractedState, setExtractedState] = useState("");
  const [_extractedCrop, setExtractedCrop] = useState("");
  const [_hasGeneratedQuestions, setHasGeneratedQuestions] = useState(false);

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
  const [editableBlock, setEditableBlock] = useState("");
  const [editableVillage, setEditableVillage] = useState("");
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
  const [_activeExtractionModes, setActiveExtractionModes] = useState<Set<'farmer' | 'query'>>(new Set(['farmer', 'query']));
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
    setEditableBlock("");
    setEditableVillage("");
    setEditableDomain([]);
    setEditableSeason("");
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
    setEditableBlock("");
    setEditableVillage("");
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
      originalText: simOriginalText.trim() || "",
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
        setEditableQuery(data.extracted_query || "");
        setEditableCrop(data.extracted_crop || "");
        setEditableState(data.extracted_state || "");
        setEditableDistrict(data.extracted_district || "");
        setEditableBlock(data.extracted_block || "");
        setEditableVillage(data.extracted_village || "");

        const normalizedDomain = data.extracted_domain
          ? Array.isArray(data.extracted_domain)
            ? data.extracted_domain
            : [data.extracted_domain]
          : [];
        setEditableDomain(normalizedDomain);
        setEditableSeason((data as any).extracted_season || getAutoSelectedSeason());
      }

      if (extractionType === 'farmer_details') {
        setExtractedFarmerProfile({
          farmerName: data.extracted_name || "",
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
        setEditableState(data.extracted_state || "");
        setEditableDistrict(data.extracted_district || "");
        setEditableBlock(data.extracted_block || "");
        setEditableVillage(data.extracted_village || "");
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

      const wasEdited =
        editableQuery !== extractedData?.extracted_query ||
        editableCrop !== extractedData?.extracted_crop ||
        editableState !== extractedData?.extracted_state ||
        editableDistrict !== extractedData?.extracted_district ||
        editableBlock !== extractedData?.extracted_block ||
        editableVillage !== extractedData?.extracted_village ||
        JSON.stringify(finalDomain) !== JSON.stringify(extractedDomainArray) ||
        editableSeason !== (extractedData as any)?.extracted_season;

      if (wasEdited) {
        // Step 3: Update state with corrections
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
        extracted_block: editableBlock || extractedData?.extracted_block || "",
        extracted_village: editableVillage || extractedData?.extracted_village || "",
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
      const similarPair = finalAnswerObj?.gdb?.similar_pair1 || finalAnswerObj?.gdb?.exact_match || null;
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

      // Keep the form card visible with all its populated fields on the UI
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      toast.success("Final answer generated successfully!");



    } catch (err) {
      console.error("Error in resume", err);
      toast.error("Failed to generate final answer.");
    }
  };

  /*
  // Preserved for redial hook implementation
  let plivoClientRef: any;

  const handleRedial = async (phoneNumber: string) => {
    const options = {
      debug: "DEBUG" as const,
      permOnClick: true,
      enableTracking: true,
    };

    const client = new (Plivo as any)(options);
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
  */

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
            if (uuid === callUuid) {
              return;
            }
            setCallUuid(uuid);
            // Preserve the last call's UUID when call ends for question generation
            if (uuid === null && callUuid !== null) {
              setLastCallUuid(callUuid);
            }
            if (uuid !== null) {
              setLastCallUuid(null);
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
      </div>
      {/* <button onClick={() => handleRedial("+919606751041")}>Redial</button> */}

      {/* 3-Column Modern Call Interface Layout (Left 25%: Farmer Details, Center: 50% of rest, Right: 50% of rest) */}
      <div className="grid grid-cols-1 lg:grid-cols-[25%_1fr_1fr] gap-4 items-start">
        {/* Left Column: Farmer Information Form (25%) */}
        <div className="w-full flex flex-col space-y-4">
          <FarmerDetails
            phoneNo={callPhoneNumber || lastCallPhoneNumber || ""}
            extractedProfile={extractedFarmerProfile}
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

                  {callUuid && (
                    <span
                      className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[140px] sm:max-w-[200px] pl-6"
                      title={callUuid}
                    >
                      UUID: {callUuid.slice(0, 8)}...
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
              <CardContent className="p-3 sm:p-4 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-2.5">
                <div
                  ref={chatContainerRef}
                  className="space-y-3 overflow-y-auto pr-2 sm:pr-3 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 flex flex-col transition-all duration-300 h-[275px]"
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
              </CardContent>
            </div>
          </Card>

          {/* Extracted Query Details & Summary Card (Center Column, below Live Conversation) */}
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
                            htmlFor="blockName"
                            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block"
                          >
                            Block
                          </Label>
                          <Input
                            id="blockName"
                            value={editableBlock}
                            onChange={(e) =>
                              setEditableBlock(e.target.value)
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
                              setEditableVillage(e.target.value)
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
        </div>

        {/* Right Column: Weather Information (top) + Live Questions & Specialist Answers (bottom) (Rest: 45%) */}
        <div className="w-full space-y-4 flex flex-col">
          {/* Weather Widget */}
          <WeatherWidget defaultState={editableState || extractedState || "Karnataka"} />

          {/* Live Questions & AI Specialist Answers List */}
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
                            <div className="p-3.5 sm:p-4">
                              <div className="flex items-start gap-2.5 sm:gap-3 mb-3">
                                <div className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
                                  <HelpCircle className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {translatingQuestions[qnKey] ? (
                                    <div className="space-y-1.5 py-1 animate-pulse">
                                      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
                                    </div>
                                  ) : (
                                    <p className="text-[15px] font-bold text-zinc-950 dark:text-zinc-50 leading-snug break-words">
                                      {translatedQuestions[qnKey] || qn.question}
                                    </p>
                                  )}
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
                                    <AccordionTrigger className="py-2 px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold tracking-wide uppercase hover:no-underline flex-1 min-w-0">
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
                                    <AccordionContent className="pt-0 pb-1">
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
                                            <span>
                                              Author & Reference Document
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed px-1 space-y-1">
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
                                    <div className="bg-emerald-50/20 dark:bg-emerald-950/15 border border-emerald-200/50 dark:border-emerald-900/40 rounded-xl p-3.5 space-y-2.5">
                                      <div className="flex justify-between items-center w-full px-1">
                                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-xs tracking-wider uppercase">
                                          <MessageSquare className="w-3.5 h-3.5" />
                                          <span>Specialist Answer</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyAnswer(qnKey, translatedAnswers[qnKey] || qn.answer || "");
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100/70 dark:bg-emerald-900/30 hover:bg-emerald-200/70 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 transition-all text-[10px] font-bold uppercase tracking-wider border border-emerald-200/60 dark:border-emerald-800/50 ml-2 active:scale-95 cursor-pointer"
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
                                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                                          <User className="w-3 h-3" />
                                          <span>
                                            {qn.agri_specialist || "ACC_AGENT"}
                                          </span>
                                        </div>
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
    </div>
  );
};

export default CallInterface;

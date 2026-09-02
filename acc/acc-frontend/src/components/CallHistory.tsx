import React, { useState, useEffect, useRef } from "react";
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
  Mic,
  MicOff,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { plivoApi } from "@/hooks/api/plivo/api";
import type { CallHistoryItem } from "@/hooks/api/plivo/api";
import { format } from "date-fns";
import { FarmerDetails } from "./FarmerDetails";
import { AudioPlayer } from "./atoms/AudioPlayer";
import { usePlivo } from "@/context/PlivoContext";

import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@radix-ui/react-accordion";
import { translateService } from "@/hooks/services/translateService";
import { transcribeAudioWithSarvam } from "@/hooks/services/sarvamSttService";
import { QuestionMetadataPopover } from "./QuestionMetadataPopover";



const getQueryMetadata = (qItem: any, callDetails?: any, farmerProfile?: any) => {
  const meta = qItem?.metadata || {};
  const fallbackMeta = callDetails?.QA_pairs?.metadata || {};

  const crop = meta.extracted_crop || meta.crop || qItem?.crop || fallbackMeta.extracted_crop || fallbackMeta.crop;
  const season = meta.extracted_season || meta.season || qItem?.season || fallbackMeta.extracted_season || fallbackMeta.season;
  const state = meta.extracted_state || meta.state || qItem?.state || fallbackMeta.extracted_state || fallbackMeta.state || farmerProfile?.state || farmerProfile?.stateName;
  const district = meta.extracted_district || meta.district || qItem?.district || fallbackMeta.extracted_district || fallbackMeta.district || farmerProfile?.district || farmerProfile?.districtName;
  const block = meta.extracted_block || meta.block || qItem?.block || fallbackMeta.extracted_block || fallbackMeta.block || farmerProfile?.block || farmerProfile?.blockName;
  const village = meta.extracted_village || meta.village || qItem?.village || fallbackMeta.extracted_village || fallbackMeta.village || farmerProfile?.village || farmerProfile?.villageName;
  const domain = meta.extracted_domain || meta.domain || meta.standardized_domains || qItem?.domain || fallbackMeta.extracted_domain || fallbackMeta.domain;
  const specialist = qItem?.agri_specialist || meta.agri_specialist || "ACC_AGENT";
  const reference = qItem?.referenceSource || meta.referenceSource;
  const weather = qItem?.weather || meta.weather;

  return { crop, season, state, district, block, village, domain, specialist, reference, weather };
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
              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs border border-zinc-200/50 dark:border-zinc-700/50"
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
              className="text-[17px] font-extrabold text-zinc-950 dark:text-zinc-50 mt-3 mb-1.5 pb-1 border-b border-zinc-100 dark:border-zinc-800"
            >
              {parseInlineMarkdown(block.text)}
            </h1>
          );
        }
        if (level === 2) {
          return (
            <h2
              key={idx}
              className="text-[16px] font-bold text-zinc-900 dark:text-zinc-100 mt-2.5 mb-1"
            >
              {parseInlineMarkdown(block.text)}
            </h2>
          );
        }
        return (
          <h3
            key={idx}
            className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200 mt-2 mb-0.5"
          >
            {parseInlineMarkdown(block.text)}
          </h3>
        );
      }
      case "unordered-list":
        return (
          <ul key={idx} className="space-y-1.5 my-1.5 pl-1">
            {block.items.map((item: string, itemIdx: number) => (
              <li
                key={itemIdx}
                className="text-[15px] sm:text-[15.5px] leading-relaxed text-zinc-850 dark:text-zinc-100 flex items-start gap-2.5"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 mt-2 shrink-0" />
                <span className="flex-1">{parseInlineMarkdown(item)}</span>
              </li>
            ))}
          </ul>
        );
      case "ordered-list":
        return (
          <ol key={idx} className="space-y-1.5 my-1.5 pl-1">
            {block.items.map((item: string, itemIdx: number) => (
              <li
                key={itemIdx}
                className="text-[15px] sm:text-[15.5px] leading-relaxed text-zinc-850 dark:text-zinc-100 flex items-start gap-2.5"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold mt-0.5 border border-emerald-200/50 dark:border-emerald-800/50">
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
            className="text-[15px] sm:text-[15.5px] leading-relaxed text-zinc-850 dark:text-zinc-100 mb-1.5 last:mb-0 font-normal"
          >
            {parseInlineMarkdown(block.text)}
          </p>
        );
      case "empty-line":
        return <div key={idx} className="h-1" />;
      default:
        return null;
    }
  });
};

interface CallHistoryProps {
  onRedial?: (phoneNumber: string) => void;
}

export const CallHistory = ({ onRedial }: CallHistoryProps) => {
  const { initiateRedial } = usePlivo();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
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

  // Voice-to-Text STT States
  const [isSttRecording, setIsSttRecording] = useState(false);
  const [isSttTranscribing, setIsSttTranscribing] = useState(false);
  const sttMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttAudioChunksRef = useRef<Blob[]>([]);

  // Voice-to-Text STT Handler with REAL-TIME Live Recognition
  const sttSpeechRecognitionRef = useRef<any>(null);

  const handleToggleSttRecording = async () => {
    if (isSttRecording) {
      if (sttSpeechRecognitionRef.current) {
        try {
          sttSpeechRecognitionRef.current.stop();
        } catch (e) { }
      }
      if (sttMediaRecorderRef.current && sttMediaRecorderRef.current.state !== "inactive") {
        sttMediaRecorderRef.current.stop();
      }
      setIsSttRecording(false);
      return;
    }

    // 1. Try Web Speech API first for REAL-TIME Live Speech-to-Text as user speaks
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        sttSpeechRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLanguage || "en-IN";

        const baseText = messageText ? messageText + " " : "";

        recognition.onresult = (event: any) => {
          let liveText = "";
          for (let i = 0; i < event.results.length; i++) {
            liveText += event.results[i][0].transcript;
          }
          setMessageText((baseText + liveText).trim().slice(0, MAX_MESSAGE_LENGTH));
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          if (event.error === "not-allowed") {
            toast.error("Microphone access denied.");
            setIsSttRecording(false);
          }
        };

        recognition.onend = () => {
          setIsSttRecording(false);
        };

        recognition.start();
        setIsSttRecording(true);
        toast.info("Speak now...");
        return;
      } catch (err) {
        console.warn("Web Speech API error, falling back to Sarvam STT:", err);
      }
    }

    // 2. Fallback / Sarvam STT: Use MediaRecorder to capture complete valid audio stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rawMime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mediaRecorder = new MediaRecorder(stream, rawMime ? { mimeType: rawMime } : undefined);
      sttMediaRecorderRef.current = mediaRecorder;
      sttAudioChunksRef.current = [];

      const cleanMime = (mediaRecorder.mimeType || "audio/webm").split(";")[0].trim();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          sttAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const fullAudioBlob = new Blob(sttAudioChunksRef.current, {
          type: cleanMime || "audio/webm",
        });

        if (fullAudioBlob.size === 0) {
          setIsSttRecording(false);
          return;
        }

        setIsSttTranscribing(true);
        try {
          const text = await transcribeAudioWithSarvam(fullAudioBlob, selectedLanguage);
          if (text && text.trim()) {
            setMessageText((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()).slice(0, MAX_MESSAGE_LENGTH));
            toast.success("Voice transcribed successfully!");
          }
        } catch (err: any) {
          console.error("STT Error:", err);
          toast.error(err.message || "Failed to transcribe audio.");
        } finally {
          setIsSttTranscribing(false);
          setIsSttRecording(false);
        }
      };

      mediaRecorder.start();
      setIsSttRecording(true);
      toast.info("Speak into your mic, click Mic again when finished.");
    } catch (err) {
      console.error("Microphone access error:", err);
      toast.error("Microphone access denied or unavailable.");
    }
  };

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

  const handleRedial = async (callItem?: any) => {
    if (!callItem) return;
    const { from, to, farmerProfile } = callItem;

    // Helper to detect our call center helpline number (+918031150392) or internal SIP endpoints
    const isOurNumberOrSip = (val: string) => {
      if (!val) return false;
      const clean = String(val).replace(/[^\d]/g, "");
      const lower = String(val).toLowerCase();
      return (
        lower.startsWith("sip:") ||
        lower.includes("phone.plivo.com") ||
        lower.includes("endpoint") ||
        clean.includes("8031150392") ||
        clean.includes("15551234567")
      );
    };

    let targetPhone = "";
    // If 'from' contains our number (+918031150392), redial the 'to' number
    if (isOurNumberOrSip(from) && to && !isOurNumberOrSip(to)) {
      targetPhone = to;
    }
    // If 'to' contains our number (+918031150392), redial the 'from' number
    else if (isOurNumberOrSip(to) && from && !isOurNumberOrSip(from)) {
      targetPhone = from;
    }
    // If 'from' is our number and 'to' is also present
    else if (isOurNumberOrSip(from)) {
      targetPhone = to || farmerProfile?.phoneNo || "";
    }
    // If 'to' is our number and 'from' is also present
    else if (isOurNumberOrSip(to)) {
      targetPhone = from || farmerProfile?.phoneNo || "";
    }
    // Fallback checks
    else if (from && !isOurNumberOrSip(from)) {
      targetPhone = from;
    } else if (to && !isOurNumberOrSip(to)) {
      targetPhone = to;
    } else if (farmerProfile?.phoneNo) {
      targetPhone = farmerProfile.phoneNo;
    } else {
      targetPhone = to || from || "";
    }

    if (!targetPhone) {
      toast.error("Could not find a valid farmer phone number to redial.");
      return;
    }

    const success = await initiateRedial(targetPhone, {
      "X-PH-previousCallUuid": callItem.uuid || "",
    });

    if (success && onRedial) {
      onRedial(targetPhone);
    }
  };

  const getStatusColor = (status: string) => {
    if (!status) {
      return "badge-status-offline";
    }
    switch (status.toLowerCase()) {
      case "completed":
      case "answered":
        return "badge-status-online";
      case "in-progress":
      case "ringing":
      case "queued":
      case "busy":
      case "debouncing":
        return "badge-status-busy";
      case "failed":
      case "no answer":
      case "disconnected":
      case "error":
      default:
        return "badge-status-offline";
    }
  };

  const getDirectionColor = (direction: string) => {
    if (!direction) {
      return "bg-muted text-muted-foreground";
    }
    switch (direction.toLowerCase()) {
      case "inbound":
        return "bg-farmer-tint text-farmer-text border border-farmer-border/40 font-semibold";
      case "outbound":
        return "bg-agent-tint text-agent-text border border-agent-border/40 font-semibold";
      default:
        return "bg-muted text-muted-foreground font-semibold";
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
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="px-5 py-3.5 w-[12%]">
                        Direction
                      </th>
                      <th className="px-5 py-3.5 w-[17%]">
                        From
                      </th>
                      <th className="px-5 py-3.5 w-[17%]">
                        To
                      </th>
                      <th className="px-5 py-3.5 w-[16%]">
                        Status
                      </th>
                      <th className="px-5 py-3.5 w-[12%]">
                        Duration
                      </th>
                      <th className="px-5 py-3.5 w-[26%] text-right pr-6">
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
                        <React.Fragment key={call.uuid}>
                          <tr
                            className="border-b hover:bg-muted/50 transition-colors"
                          >
                            <td className="px-5 py-3.5">
                              <Badge
                                className={getDirectionColor(call.direction)}
                              >
                                {call.direction}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-sm font-medium">
                              {formatPhoneNumber(call.from)}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-medium">
                              {formatPhoneNumber(call.to)}
                            </td>
                            <td className="px-5 py-3.5">
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
                            <td className="px-5 py-3.5 text-sm font-medium">
                              {formatDuration(call.duration)}
                            </td>
                            <td className="px-5 py-3.5 pr-6">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRedial(call)}
                                  className="gap-1.5 h-8 px-3 text-xs"
                                >
                                  <Phone className="h-3.5 w-3.5" />
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
                                  className="gap-1.5 h-8 px-3 text-xs"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
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
                                  className="gap-1.5 h-8 px-3 text-xs"
                                >
                                  <Eye className="h-3.5 w-3.5" />
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
                                <div className="space-y-6 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                                  {/* Call Audio Player Banner (Only shown if recording exists with a valid storagePath) */}
                                  {(call.callDetails?.recording?.storagePath || (call.callDetails?.recordings && call.callDetails.recordings.some((r: any) => r?.storagePath))) && (
                                    <AudioPlayer
                                      callUuid={call.uuid}
                                      duration={call.duration}
                                      recording={call.callDetails?.recording}
                                    />
                                  )}

                                  {/* Top Row: Farmer Details (40%) & Call Transcripts (60%) Side-by-Side */}
                                  <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-stretch w-full">
                                    <div className="lg:col-span-4 w-full flex flex-col h-[280px]">
                                      <FarmerDetails
                                        phoneNo={call.from}
                                        defaultOpen={false}
                                        extractedProfile={call.farmerProfile}
                                        className="border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm bg-white dark:bg-zinc-900 rounded-xl w-full h-full"
                                      />
                                    </div>

                                    {/* Call Transcripts / Conversation Box (60%) - Matches Default Farmer Details Height */}
                                    <div className="lg:col-span-6 w-full flex flex-col h-[280px]">
                                      <Card className="border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm bg-white dark:bg-zinc-900 rounded-xl flex flex-col h-full w-full overflow-hidden !gap-0 !p-0 !py-0">
                                        <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 !py-1.5 !px-3.5 !pb-1.5 flex-shrink-0 !gap-0">
                                          <CardTitle className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                            Call Conversation
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent className="!p-2.5 !px-3 flex-1 flex flex-col min-h-0 overflow-hidden">
                                          {call.callDetails ? (
                                            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col w-full custom-scrollbar">
                                              {/* Farmer bubble (Inbound) */}
                                              {call.callDetails.caller &&
                                                (call.callDetails.caller.transcript ||
                                                  call.callDetails.caller.translation) && (
                                                  <div className="flex flex-col items-start space-y-0.5 animate-in fade-in duration-200">
                                                    <div className="flex items-center gap-1 px-1 text-[9px] text-zinc-400 dark:text-zinc-500 font-bold tracking-wider uppercase">
                                                      <span>Farmer</span>
                                                    </div>
                                                    <div className="max-w-[90%] px-3 py-2 rounded-xl shadow-sm border chat-bubble-farmer rounded-tl-none">
                                                      <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                                                        {call.callDetails.caller.translation || "N/A"}
                                                      </p>
                                                      {call.callDetails.caller.transcript &&
                                                        call.callDetails.caller.transcript !==
                                                        call.callDetails.caller.translation && (
                                                          <div className="mt-1 pt-1 border-t border-farmer-border/30 text-[11px] text-farmer-text/80">
                                                            <div className="flex items-center gap-1 mb-0.5 text-[8.5px] uppercase tracking-wider font-bold text-zinc-400">
                                                              <Globe className="h-2.5 w-2.5" />
                                                              <span>
                                                                Original (
                                                                {call.callDetails.caller.detectedLanguage || "unknown"}
                                                                )
                                                              </span>
                                                            </div>
                                                            <p className="italic leading-relaxed text-[11px]">
                                                              {call.callDetails.caller.transcript}
                                                            </p>
                                                          </div>
                                                        )}
                                                    </div>
                                                  </div>
                                                )}

                                              {/* Expert bubble (Outbound) */}
                                              {call.callDetails.agent &&
                                                (call.callDetails.agent.transcript ||
                                                  call.callDetails.agent.translation) && (
                                                  <div className="flex flex-col items-end space-y-0.5 animate-in fade-in duration-200">
                                                    <div className="flex items-center gap-1 px-1 text-[9px] text-zinc-400 dark:text-zinc-500 font-bold tracking-wider uppercase">
                                                      <span>Expert</span>
                                                    </div>
                                                    <div className="max-w-[90%] px-3 py-2 rounded-xl shadow-sm border chat-bubble-agent rounded-tr-none">
                                                      <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                                                        {call.callDetails.agent.translation || "N/A"}
                                                      </p>
                                                      {call.callDetails.agent.transcript &&
                                                        call.callDetails.agent.transcript !==
                                                        call.callDetails.agent.translation && (
                                                          <div className="mt-1 pt-1 border-t border-agent-border/30 text-[11px] text-agent-text/80">
                                                            <div className="flex items-center gap-1 mb-0.5 text-[8.5px] uppercase tracking-wider font-bold text-white/75">
                                                              <Globe className="h-2.5 w-2.5" />
                                                              <span>
                                                                Original (
                                                                {call.callDetails.agent.detectedLanguage || "unknown"}
                                                                )
                                                              </span>
                                                            </div>
                                                            <p className="italic leading-relaxed text-[11px]">
                                                              {call.callDetails.agent.transcript}
                                                            </p>
                                                          </div>
                                                        )}
                                                    </div>
                                                  </div>
                                                )}

                                              {!(
                                                call.callDetails.caller?.transcript ||
                                                call.callDetails.caller?.translation ||
                                                call.callDetails.agent?.transcript ||
                                                call.callDetails.agent?.translation
                                              ) && (
                                                  <div className="text-xs text-muted-foreground text-center py-6">
                                                    No transcript data available for this call
                                                  </div>
                                                )}
                                            </div>
                                          ) : (
                                            <div className="text-xs text-muted-foreground text-center py-8">
                                              No transcript data available for this call
                                            </div>
                                          )}
                                        </CardContent>
                                      </Card>
                                    </div>
                                  </div>

                                  {/* QnA Pairs (Full Width) */}
                                  {((call.callDetails?.queries && call.callDetails.queries.length > 0) || call.callDetails?.QA_pairs) && (
                                    <div className="space-y-2">
                                      <h3 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Question & Answer Pairs
                                      </h3>

                                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 sm:p-4 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                                        <Accordion
                                          type="single"
                                          collapsible
                                          className="w-full"
                                        >
                                          {call.callDetails?.queries && call.callDetails.queries.length > 0
                                            ? call.callDetails.queries.map((qItem, index) => {
                                              const qMeta = getQueryMetadata(qItem, call.callDetails, call.farmerProfile);
                                              return (
                                                <AccordionItem
                                                  key={qItem._id || `query-${index}`}
                                                  value={`query-${index}`}
                                                  className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-b-0"
                                                >
                                                  <div className="flex items-center justify-between py-2 sm:py-2.5 w-full gap-2 group">
                                                    <AccordionTrigger className="text-left hover:no-underline flex items-start gap-2.5 flex-1 min-w-0 pr-1.5 group/trigger cursor-pointer">
                                                      <span className="flex-shrink-0 w-6.5 h-6.5 rounded-full bg-emerald-55 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold mt-0.5 border border-emerald-200/50 dark:border-emerald-800/50">
                                                        {index + 1}
                                                      </span>
                                                      <div className="font-bold text-[16px] text-zinc-950 dark:text-zinc-50 leading-snug flex-1 min-w-0">
                                                        {renderMarkdown(qItem.question)}
                                                      </div>
                                                    </AccordionTrigger>

                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      <QuestionMetadataPopover qMeta={qMeta} />
                                                      <AccordionTrigger className="hover:no-underline p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer group/icon">
                                                        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-data-[state=open]:rotate-180 shrink-0" />
                                                      </AccordionTrigger>
                                                    </div>
                                                  </div>
                                                  <AccordionContent className="pt-0.5 pb-2.5">
                                                    <div className="pl-7 sm:pl-8 space-y-2">
                                                      <div className="bg-emerald-50/15 dark:bg-emerald-950/10 rounded-xl p-3 sm:p-3.5 border border-emerald-100/50 dark:border-emerald-900/30 shadow-inner">
                                                        <div className="space-y-1 font-normal text-[15px] sm:text-[15.5px] leading-relaxed text-zinc-850 dark:text-zinc-100">
                                                          {renderMarkdown(qItem.answer)}
                                                        </div>
                                                      </div>
                                                      {(qItem.sourceName || qItem.sourceLink) && (
                                                        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider pl-1 mt-1">
                                                          <span>Source:</span>
                                                          {qItem.sourceLink ? (
                                                            <a
                                                              href={qItem.sourceLink}
                                                              target="_blank"
                                                              rel="noreferrer"
                                                              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                                            >
                                                              {qItem.sourceName || "Reference Link"}
                                                              <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                          ) : (
                                                            <span>{qItem.sourceName}</span>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </AccordionContent>
                                                </AccordionItem>
                                              );
                                            })
                                            : call.callDetails?.QA_pairs?.QnA.map((qa, index) => {
                                              const qMeta = getQueryMetadata(qa, call.callDetails, call.farmerProfile);
                                              return (
                                                <AccordionItem
                                                  key={qa.id}
                                                  value={`qa-${index}`}
                                                  className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-b-0"
                                                >
                                                  <div className="flex items-center justify-between py-2 sm:py-2.5 w-full gap-2 group">
                                                    <AccordionTrigger className="text-left hover:no-underline flex items-start gap-2.5 flex-1 min-w-0 pr-1.5 group/trigger cursor-pointer">
                                                      <span className="flex-shrink-0 w-6.5 h-6.5 rounded-full bg-emerald-55 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold mt-0.5 border border-emerald-200/50 dark:border-emerald-800/50">
                                                        {index + 1}
                                                      </span>
                                                      <div className="font-bold text-[16px] text-zinc-950 dark:text-zinc-50 leading-snug flex-1 min-w-0">
                                                        {renderMarkdown(qa.question)}
                                                      </div>
                                                    </AccordionTrigger>

                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      <QuestionMetadataPopover qMeta={qMeta} />
                                                      <AccordionTrigger className="hover:no-underline p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer group/icon">
                                                        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-data-[state=open]:rotate-180 shrink-0" />
                                                      </AccordionTrigger>
                                                    </div>
                                                  </div>
                                                  <AccordionContent className="pt-0.5 pb-2.5">
                                                    <div className="pl-7 sm:pl-8 space-y-2">
                                                      <div className="bg-emerald-50/15 dark:bg-emerald-950/10 rounded-xl p-3 sm:p-3.5 border border-emerald-100/50 dark:border-emerald-900/30 shadow-inner">
                                                        <div className="space-y-1 font-normal text-[15px] sm:text-[15.5px] leading-relaxed text-zinc-850 dark:text-zinc-100">
                                                          {renderMarkdown(qa.answer)}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </AccordionContent>
                                                </AccordionItem>
                                              );
                                            })}
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
                                    <Button
                                      type="button"
                                      onClick={handleToggleSttRecording}
                                      disabled={isSttTranscribing}
                                      size="sm"
                                      variant="outline"
                                      className={cn(
                                        "h-7 text-xs gap-1 transition-all",
                                        isSttRecording && "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse font-semibold"
                                      )}
                                      title={isSttRecording ? "Click to stop recording" : "Click to speak (Voice-to-Text)"}
                                    >
                                      {isSttTranscribing ? (
                                        <>
                                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                          <span>Transcribing...</span>
                                        </>
                                      ) : isSttRecording ? (
                                        <>
                                          <MicOff className="h-3 w-3 text-red-500 animate-bounce" />
                                          <span>Stop Mic</span>
                                        </>
                                      ) : (
                                        <>
                                          <Mic className="h-3 w-3 text-zinc-600 dark:text-zinc-400" />
                                          <span>Voice to Text</span>
                                        </>
                                      )}
                                    </Button>
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
                        </React.Fragment>
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
                  Showing {page * limit + 1} to {page * limit + calls.length} calls
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
                  <div className="text-sm font-medium px-2.5 py-1 bg-muted/60 dark:bg-zinc-800 rounded-md border text-zinc-900 dark:text-zinc-100">
                    Page {page + 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={calls.length === 0 || loading}
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

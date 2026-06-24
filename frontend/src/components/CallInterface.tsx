import { useState, useEffect, useRef } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import type { CallTranscript } from "./IncomingCallBox";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { RotateCcw, Send, MessageSquare, Globe, CheckCircle2, AlertCircle, HelpCircle, Lightbulb, User, FileText, ChevronDown, ChevronUp, Edit3, Power, PowerOff } from "lucide-react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./atoms/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { Checkbox } from "./atoms/checkbox";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./atoms/select";
import type { GeneratedQuestion } from "./voice-recorder-card";
import Plivo from "plivo-browser-sdk";
import { toast } from "@/shared/components/toast";
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
  "Other"
];

const SEASON_OPTIONS = [
  "Kharif",
  "Rabi",
  "Zaid"
];

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

const DUMMY_TRANSCRIPTS: CallTranscript[] = [
  {
    track: "inbound",
    text: "नमस्ते, मेरी टमाटर की फसल में पत्तियाँ सिकुड़ रही हैं और पौधे का विकास रुक गया है। मुझे क्या करना चाहिए?",
    originalText: "नमस्ते, मेरी टमाटर की फसल में पत्तियाँ सिकुड़ रही हैं और पौधे का विकास रुक गया है। मुझे क्या करना चाहिए?",
    translatedText: "Hello, the leaves of my tomato crop are curling and the plant growth has stopped. What should I do?",
    detectedLanguage: "hi-IN",
    timestamp: new Date(Date.now() - 120000).toISOString()
  },
  {
    track: "outbound",
    text: "नमस्ते। क्या पत्तियों पर कोई सफेद मक्खी या छोटे कीड़े दिखाई दे रहे हैं? यह लीफ कर्ल वायरस के लक्षण हो सकते हैं।",
    originalText: "नमस्ते। क्या पत्तियों पर कोई सफेद मक्खी या छोटे कीड़े दिखाई दे रहे हैं? यह लीफ कर्ल वायरस के लक्षण हो सकते हैं।",
    translatedText: "Hello. Are there any whiteflies or small insects visible on the leaves? These could be symptoms of Leaf Curl Virus.",
    detectedLanguage: "hi-IN",
    timestamp: new Date(Date.now() - 90000).toISOString()
  },
  {
    track: "inbound",
    text: "हाँ, पत्तियों के निचले हिस्से में बहुत सारे छोटे सफेद कीड़े उड़ रहे हैं।",
    originalText: "हाँ, पत्तियों के निचले हिस्से में बहुत सारे छोटे सफेद कीड़े उड़ रहे हैं।",
    translatedText: "Yes, there are many small white insects flying under the leaves.",
    detectedLanguage: "hi-IN",
    timestamp: new Date(Date.now() - 60000).toISOString()
  },
  {
    track: "outbound",
    text: "यह सफेद मक्खी (whitefly) का हमला है जो वायरस फैलाती है। आप नियंत्रण के लिए इमिडाक्लोप्रिड या नीम के तेल का छिड़काव करें।",
    originalText: "यह सफेद मक्खी (whitefly) का हमला है जो वायरस फैलाती है। आप नियंत्रण के लिए इमिडाक्लोप्रिड या नीम के तेल का छिड़काव करें।",
    translatedText: "This is a whitefly infestation which transmits the virus. You should spray Imidacloprid or Neem oil for control.",
    detectedLanguage: "hi-IN",
    timestamp: new Date(Date.now() - 30000).toISOString()
  }
];

export const CallInterface = () => {
  const { data: currentUser, refetch: refetchCurrentUser } = useGetCurrentUser();
  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();
  const [editableTranslatedTranscript, setEditableTranslatedTranscript] = useState("");
  const [transcriptsList, setTranscriptsList] = useState<CallTranscript[]>(DUMMY_TRANSCRIPTS);
  const [isCallActive, setIsCallActive] = useState(true);
  const [callUuid, setCallUuid] = useState<string | null>("8abb85d7-aa02-4b69-95de-cf82034f0988");
  const [lastCallUuid, setLastCallUuid] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const lastTranscriptRef = useRef("");
  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } = useGenerateCallQuestion();

  // ACC Agent HITL hooks
  const { mutateAsync: createThread } = useAccAgentThread();
  const { mutateAsync: extractData, isPending: isExtracting } = useAccAgentExtract();
  const { mutateAsync: updateState } = useAccAgentUpdateState();
  const { mutateAsync: resumeAndGetAnswer, isPending: isResuming } = useAccAgentResume();

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [editableSummaryText, setEditableSummaryText] = useState("");
  const [extractedState, setExtractedState] = useState("");
  const [extractedCrop, setExtractedCrop] = useState("");
  const [hasGeneratedQuestions, setHasGeneratedQuestions] = useState(false);

  // HITL state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractDataResponse | null>(null);
  const [isHumanVerificationMode, setIsHumanVerificationMode] = useState(false);
  const [editableQuery, setEditableQuery] = useState("");
  const [editableCrop, setEditableCrop] = useState("");
  const [editableState, setEditableState] = useState("");
  const [editableDistrict, setEditableDistrict] = useState("");
  const [editableDomain, setEditableDomain] = useState<string[]>([]);
  const [customDomain, setCustomDomain] = useState("");
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
    let toastId;
    try {
      toastId = toast.loading('submitting transcript...')
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
      toast.dismiss(toastId)
      toast.success("Transcript submitted successfully!");
    } catch (error) {
      toast.dismiss(toastId)
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
    setCustomDomain("");
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
    setCustomDomain("");
    setEditableSeason("");
    toast.success("Conversation cleared");
  };

  const handleLoadTestData = () => {
    setTranscriptsList(DUMMY_TRANSCRIPTS);
    setIsCallActive(true);
    setCallUuid("8abb85d7-aa02-4b69-95de-cf82034f0988");
    setLastCallUuid(null);
    setIsSummaryOpen(false);
    setEditableSummaryText("");
    setExtractedState("");
    setExtractedCrop("");
    setHasGeneratedQuestions(false);
    setQuestions([]);
    // Reset HITL state
    setThreadId(null);
    setExtractedData(null);
    setIsHumanVerificationMode(false);
    setEditableQuery("");
    setEditableCrop("");
    setEditableState("");
    setEditableDistrict("");
    setEditableDomain([]);
    setCustomDomain("");
    setEditableSeason("");
    toast.success("Loaded test dummy transcript data!");
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
    let toastId;
    try {
      toastId = toast.loading('generating questions...')
      const qstns = await generateQuestions({
        transcript: editableSummaryText,
        state: extractedState,
        crop: extractedCrop
      });
      setQuestions(prev => [...prev, ...(qstns || [])]);
      setHasGeneratedQuestions(true);
      toast.dismiss(toastId)
      toast.success('question generated successfully')
    } catch (err) {
      toast.dismiss(toastId)
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
      .map(t => {
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
      toastId = toast.loading('generating summary...')
      const data = await extractData({
        threadId: thread.thread_id,
        transcript: allTranscriptText
      });
      setExtractedData(data);

      // Initialize editable fields with extracted data
      setEditableQuery(data.extracted_query);
      setEditableCrop(data.extracted_crop);
      setEditableState(data.extracted_state);
      setEditableDistrict(data.extracted_district);

      // Use domain from AI response if available, otherwise empty array
      // Normalize to array (backend might return string or array)
      const normalizedDomain = data.extracted_domain
        ? Array.isArray(data.extracted_domain)
          ? data.extracted_domain
          : [data.extracted_domain]
        : [];
      setEditableDomain(normalizedDomain);
      setCustomDomain("");

      // Auto-select season based on current month
      setEditableSeason(getAutoSelectedSeason());

      setIsHumanVerificationMode(true);
      setIsSummaryOpen(true);
      setIsSummaryExpanded(true);

      // Also set the old format for backward compatibility
      setEditableSummaryText(data.extracted_query);
      setExtractedState(data.extracted_state);
      setExtractedCrop(data.extracted_crop);
      toast.dismiss(toastId)
      toast.success("Data extracted successfully. Please review and edit if needed.");
    } catch (err) {
      toast.dismiss(toastId)
      console.error("Error in HITL extraction", err);
      toast.error("Failed to extract data. Please try again.");
    }
  };

  const handleApproveAndResume = async () => {
    if (!threadId) {
      toast.error("No active thread. Please extract data first.");
      return;
    }

    // Validate domain selection - at least one domain must be selected
    if (editableDomain.length === 0) {
      toast.error("Please select at least one domain.");
      return;
    }

    // Validate custom domain if "Other" is selected
    if (editableDomain.includes("Other") && !customDomain.trim()) {
      toast.error("Please enter a custom domain value.");
      return;
    }

    // Validate season selection
    if (!editableSeason) {
      toast.error("Please select a season.");
      return;
    }

    let toastId;
    try {
      // Check if data was edited
      // Replace "Other" with customDomain if present
      const finalDomain = editableDomain.includes("Other")
        ? editableDomain.map(d => d === "Other" ? customDomain : d)
        : editableDomain;

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
        toastId = toast.loading('updating extracted data...')
        // Step 3: Update state with corrections
        await updateState({
          threadId,
          correctedData: {
            query: editableQuery,
            crop: editableCrop,
            state: editableState,
            district: editableDistrict,
            domain: finalDomain,
            season: editableSeason
          }
        });
        toast.dismiss(toastId)
        toast.info("Updated extracted data with your corrections.");
      }
      toastId = toast.loading('generating final answer...')
      // Step 4: Resume and get answer
      const metadata = {
        extracted_query: editableQuery,
        extracted_crop: editableCrop,
        extracted_state: editableState,
        extracted_district: editableDistrict,
        extracted_domain: finalDomain,
        extracted_season: editableSeason,
      };
      // Use lastCallUuid if call has ended, otherwise use current callUuid
      const targetCallUuid = callUuid || lastCallUuid || undefined;
      const result = await resumeAndGetAnswer({ threadId, callUuid: targetCallUuid, metadata });
      setIsHumanVerificationMode(false);

      // Reset lastCallUuid after successful Q/A storage to prevent re-association
      if (targetCallUuid) {
        setLastCallUuid(null);
      }

      // Convert final answer to question format
      const generatedQuestion: GeneratedQuestion = {
        question: editableQuery,
        answer: result.final_answer,
        agri_specialist: "ACC_AGENT",
        referenceSource: "acc_agent_hitl",
        id: Date.now().toString()
      };

      setQuestions([generatedQuestion]);
      setHasGeneratedQuestions(true);
      toast.dismiss(toastId)
      toast.success("Final answer generated successfully!");
    } catch (err) {
      toast.dismiss(toastId)
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
      enableTracking: true
    };

    const client = new Plivo(options);
    plivoClientRef = client;
    try {
      const extraHeaders = {
        'X-PH-destination': "+919606751041"       // e.g. "+919606751041"
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
      toast.success(online ? "You are now online and ready to receive calls" : "You are now offline");
      // Refetch current user to update UI without page reload
      refetchCurrentUser();
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-full px-4 md:px-6 py-2 relative">
      {/* Agent Status Toggle - Top Right Corner */}
      {currentUser?.role === 'call_agent' && (
        <div className="absolute -top-6 right-4 md:right-6 z-10">
          {currentUser?.agent && currentUser.agent !== 'not_available' ? (
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
        onTranscriptChange={() => { }} // Not using direct strings anymore
        onOriginalTranscriptChange={() => { }}
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
              <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <MessageSquare className={`h-4 w-4 ${isCallActive ? "animate-pulse" : ""}`} />
                Live Conversation Dialogue
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
                  onClick={handleLoadTestData}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                >
                  Load Test Data
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
            className={`transition-all duration-500 ease-in-out overflow-hidden ${(isCallActive || transcriptsList.length > 0) ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
              }`}
          >
            <CardContent className="p-6 bg-zinc-50/20 dark:bg-zinc-950/20">
              <div
                ref={chatContainerRef}
                className="space-y-5 h-[400px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 flex flex-col"
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
                        <div className={`flex items-center gap-2 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase ${!isCaller ? "flex-row-reverse" : ""}`}>
                          <span>{speakerLabel}</span>
                          <span>•</span>
                          <span>
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        {/* Chat Bubble Card */}
                        <div
                          className={`max-w-[80%] px-5 py-3.5 rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-md ${isCaller
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
                            <div className={`mt-2.5 pt-2 border-t text-[12px] flex flex-col gap-1 ${isCaller
                              ? "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
                              : "border-white/20 text-white/80"
                              }`}>
                              <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[10px]">
                                <Globe className="h-3 w-3 animate-spin-slow" />
                                <span>Original ({msg.detectedLanguage || "unknown"})</span>
                              </div>
                              <p className="italic leading-normal">{msg.originalText}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : isCallActive ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-transparent">
                    {isSummaryExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                  </Button>
                </CardTitle>
              </CardHeader>
              <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isSummaryExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
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
                          <Label htmlFor="query" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
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
                            <Label htmlFor="crop" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
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
                            <Label htmlFor="state" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
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
                          <Label htmlFor="district" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
                            District
                          </Label>
                          <Input
                            id="district"
                            value={editableDistrict}
                            onChange={(e) => setEditableDistrict(e.target.value)}
                            className="text-sm"
                            placeholder="District..."
                          />
                        </div>

                        <div>
                          <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                            Domain (Select multiple)
                          </Label>
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                            {DOMAIN_OPTIONS.map((domain) => (
                              <div key={domain} className="flex items-center gap-2">
                                <Checkbox
                                  id={`domain-${domain}`}
                                  checked={editableDomain.includes(domain)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setEditableDomain([...editableDomain, domain]);
                                    } else {
                                      setEditableDomain(editableDomain.filter(d => d !== domain));
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

                        {editableDomain.includes("Other") && (
                          <div className="md:col-span-2">
                            <Label htmlFor="customDomain" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
                              Custom Domain
                            </Label>
                            <Input
                              id="customDomain"
                              value={customDomain}
                              onChange={(e) => setCustomDomain(e.target.value)}
                              className="text-sm"
                              placeholder="Enter custom domain..."
                            />
                          </div>
                        )}

                        <div>
                          <Label htmlFor="season" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">
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
                          disabled={isResuming || !editableQuery.trim() || !editableDomain || (editableDomain.includes("Other") && !customDomain.trim()) || !editableSeason}
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          {isResuming ? "Generating..." : "Approve & Generate Answer"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <textarea
                      value={editableSummaryText}
                      onChange={(e) => setEditableSummaryText(e.target.value)}
                      readOnly={hasGeneratedQuestions}
                      className={`w-full p-3 text-sm leading-relaxed rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all duration-300 dark:text-zinc-100 shadow-inner ${hasGeneratedQuestions
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
                        disabled={isGeneratingQuestions || !editableSummaryText.trim()}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all font-medium h-9 px-4 rounded-lg"
                      >
                        {isGeneratingQuestions ? "Generating..." : "Generate question"}
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
                        Click "Generate question" to fetch AI insights from the current conversation.
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
                                  {qn.agri_specialist && qn.agri_specialist !== "Unknown" && qn.agri_specialist !== "AGRI_EXPERT" && (
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

                                <AccordionContent className="pt-3 pb-1">
                                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/50 rounded-lg p-3 space-y-2 mb-3">
                                    <div className="flex justify-between items-center w-full px-1">
                                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs tracking-wider uppercase">
                                        <Globe className="w-3.5 h-3.5" />
                                        <span>Reference Source</span>
                                      </div>
                                    </div>
                                    <p className="text-[13px] text-emerald-800 dark:text-emerald-300 leading-relaxed px-1">
                                      {qn.referenceSource || "Nil"}
                                    </p>
                                  </div>
                                </AccordionContent>

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
                                      {qn.answer || "Nil"}
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

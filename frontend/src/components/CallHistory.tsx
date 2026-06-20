import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { plivoApi } from "@/hooks/api/plivo/api";
import type { CallHistoryItem } from "@/hooks/api/plivo/api";
import { format } from "date-fns";
import { FarmerDetails } from "./FarmerDetails";
import Plivo from "plivo-browser-sdk";
import { toast } from "@/shared/components/toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@radix-ui/react-accordion";
import { translateService } from "@/hooks/services/translateService";

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
    }
  }, [messageRow]);

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
    if (!messageText.trim()) return;
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Message exceeds ${MAX_MESSAGE_LENGTH} character limit`);
      return;
    }
    setSendingMessage(true);
    try {
      numbertomsg = numbertomsg.replace(/^91/, "");
      const textToSend = sendTranslated && translatedText ? translatedText : messageText;
      await plivoApi.sendMessage(numbertomsg, textToSend);
      toast.success(`SMS sent successfully! (${sendTranslated ? "Translated" : "English"})`);
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

  const handleTranslate = async (call: CallHistoryItem) => {
    if (!messageText.trim()) {
      toast.error("Please enter text to translate");
      return;
    }

    const farmerLanguage = call.callDetails?.caller?.detectedLanguage;
    const targetLanguage = (farmerLanguage && farmerLanguage !== "unknown") ? farmerLanguage : selectedLanguage;

    setTranslating(true);
    try {
      const translated = await translateService(messageText, targetLanguage, "en-IN");
      setTranslatedText(translated);
      toast.success("Text translated successfully!");
    } catch (err: any) {
      console.error("Translation error:", err);
      if (err.message?.includes("timeout") || err.message?.includes("504") || err.name === "AbortError") {
        toast.error("Translation request timed out. Please try again.");
      } else if (err.message?.includes("fetch") || err.message?.includes("network")) {
        toast.error("Network error. Please check your connection and try again.");
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
                              <td colSpan={6} className="px-4 py-4 bg-muted/30">
                                <div className="space-y-6">
                                  <FarmerDetails phoneNo={call.from} />

                                  <div className="space-y-3">
                                    <h3 className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                      Call Transcripts
                                    </h3>

                                    {call.callDetails ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                          <h4 className="font-semibold text-sm mb-3 text-indigo-600 dark:text-indigo-400">
                                            Farmer
                                          </h4>
                                          <div className="space-y-3 text-sm">
                                            <div>
                                              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                                                Original (
                                                {call.callDetails.caller
                                                  ?.detectedLanguage ||
                                                  "unknown"}
                                                )
                                              </span>
                                              <p className="mt-1 leading-relaxed text-zinc-700 dark:text-zinc-300 italic">
                                                {call.callDetails.caller
                                                  ?.transcript || "N/A"}
                                              </p>
                                            </div>
                                            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                                                English Translation
                                              </span>
                                              <p className="mt-1 leading-relaxed font-medium">
                                                {call.callDetails.caller
                                                  ?.translation || "N/A"}
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-zinc-900 dark:to-zinc-900 rounded-xl p-4 border border-indigo-100 dark:border-zinc-800 shadow-sm">
                                          <h4 className="font-semibold text-sm mb-3 text-indigo-700 dark:text-indigo-400">
                                            Expert
                                          </h4>
                                          <div className="space-y-3 text-sm">
                                            <div>
                                              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                                                Original (
                                                {call.callDetails.agent
                                                  ?.detectedLanguage ||
                                                  "unknown"}
                                                )
                                              </span>
                                              <p className="mt-1 leading-relaxed text-zinc-700 dark:text-zinc-300 italic">
                                                {call.callDetails.agent
                                                  ?.transcript || "N/A"}
                                              </p>
                                            </div>
                                            <div className="pt-2 border-t border-indigo-100 dark:border-zinc-800">
                                              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                                                English Translation
                                              </span>
                                              <p className="mt-1 leading-relaxed font-medium">
                                                {call.callDetails.agent
                                                  ?.translation || "N/A"}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground text-center py-6 bg-white/50 dark:bg-zinc-900/50 rounded-xl border border-dashed">
                                        No transcript data available for this
                                        call
                                      </div>
                                    )}
                                  </div>

                                  {call.callDetails?.QA_pairs && (
                                    <div className="space-y-3">
                                      <h3 className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Question & Answer Pairs
                                      </h3>

                                      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                        <div className="space-y-3 text-sm mb-4">
                                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                                            <div>
                                              <span className="font-medium text-muted-foreground">Crop:</span>
                                              <span className="ml-1">{call.callDetails.QA_pairs.metadata.extracted_crop || "N/A"}</span>
                                            </div>
                                            <div>
                                              <span className="font-medium text-muted-foreground">State:</span>
                                              <span className="ml-1">{call.callDetails.QA_pairs.metadata.extracted_state || "N/A"}</span>
                                            </div>
                                            <div>
                                              <span className="font-medium text-muted-foreground">District:</span>
                                              <span className="ml-1">{call.callDetails.QA_pairs.metadata.extracted_district || "N/A"}</span>
                                            </div>
                                            <div>
                                              <span className="font-medium text-muted-foreground">Domain:</span>
                                              <span className="ml-1">{call.callDetails.QA_pairs.metadata.extracted_domain || "N/A"}</span>
                                            </div>
                                            <div>
                                              <span className="font-medium text-muted-foreground">Season:</span>
                                              <span className="ml-1">{call.callDetails.QA_pairs.metadata.extracted_season || "N/A"}</span>
                                            </div>
                                          </div>
                                        </div>

                                        <Accordion type="single" collapsible className="w-full">
                                          {call.callDetails.QA_pairs.QnA.map((qa, index) => (
                                            <AccordionItem key={qa.id} value={`qa-${index}`}>
                                              <AccordionTrigger className="text-left hover:no-underline py-3">
                                                <div className="flex items-start gap-3 w-full">
                                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                                                    {index + 1}
                                                  </span>
                                                  <span className="font-medium text-sm text-left flex-1">
                                                    {qa.question}
                                                  </span>
                                                </div>
                                              </AccordionTrigger>
                                              <AccordionContent className="pt-2">
                                                <div className="pl-9 space-y-2">
                                                  <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                                                    <p className="text-sm leading-relaxed">
                                                      {qa.answer}
                                                    </p>
                                                  </div>
                                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="outline" className="text-[10px]">
                                                      {qa.agri_specialist}
                                                    </Badge>
                                                    <span>•</span>
                                                    <span>{qa.referenceSource}</span>
                                                  </div>
                                                </div>
                                              </AccordionContent>
                                            </AccordionItem>
                                          ))}
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
                                  <h4 className="text-sm font-semibold">
                                    Send SMS to{" "}
                                    {call.direction === "inbound"
                                      ? call.from
                                      : call.to}
                                  </h4>
                                  <textarea
                                    className="w-full p-2 border rounded-md text-sm bg-background"
                                    rows={3}
                                    placeholder="Type your SMS message here..."
                                    value={messageText}
                                    onChange={(e) => {
                                      if (
                                        e.target.value.length <=
                                        MAX_MESSAGE_LENGTH
                                      ) {
                                        setMessageText(e.target.value);
                                      }
                                    }}
                                    maxLength={MAX_MESSAGE_LENGTH}
                                  />
                                  <div className="flex justify-between items-center mt-1">
                                    <span
                                      className={cn(
                                        "text-xs",
                                        messageText.length >= MAX_MESSAGE_LENGTH
                                          ? "text-red-500 font-semibold"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {messageText.length}/{MAX_MESSAGE_LENGTH}{" "}
                                      characters
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                      Select Target Language:
                                    </label>
                                    <select
                                      value={call.callDetails?.caller?.detectedLanguage && call.callDetails?.caller?.detectedLanguage !== "unknown" ? call.callDetails?.caller?.detectedLanguage : selectedLanguage}
                                      onChange={(e) => setSelectedLanguage(e.target.value)}
                                      className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                                    >
                                      {SARVAM_LANGUAGES.map((lang) => (
                                        <option key={lang.code} value={lang.code}>
                                          {lang.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {translatedText && (
                                    <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-md border border-indigo-200 dark:border-indigo-800">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Languages className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                          Translation Preview ({call.callDetails?.caller?.detectedLanguage || "Unknown"})
                                        </span>
                                      </div>
                                      <p className="text-sm text-indigo-900 dark:text-indigo-100">
                                        {translatedText}
                                      </p>
                                    </div>
                                  )}
                                  {translatedText && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <Switch
                                        id="send-translated"
                                        checked={sendTranslated}
                                        onCheckedChange={setSendTranslated}
                                      />
                                      <label
                                        htmlFor="send-translated"
                                        className="text-xs font-medium text-muted-foreground cursor-pointer"
                                      >
                                        Send translated text instead of English
                                      </label>
                                    </div>
                                  )}
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
                                      onClick={() => handleTranslate(call)}
                                      disabled={
                                        !messageText.trim() ||
                                        translating
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
                                        !messageText.trim() ||
                                        sendingMessage ||
                                        messageText.length > MAX_MESSAGE_LENGTH
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

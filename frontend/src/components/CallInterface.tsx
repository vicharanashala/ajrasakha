import { useState, useEffect, useRef } from "react";
import { IncomingCallBox } from "./IncomingCallBox";
import type { CallTranscript } from "./IncomingCallBox";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { toast } from "sonner";
import { Button } from "./atoms/button";
import { RotateCcw, Send, MessageSquare, Globe, CheckCircle2, AlertCircle, HelpCircle, Lightbulb, User } from "lucide-react";
import { useSubmitTranscript } from "@/hooks/api/context/useSubmitTranscript";
import { useGenerateCallQuestion } from "@/hooks/api/question/useGenerateCallQuestion";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./atoms/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { Checkbox } from "./atoms/checkbox";
import type { GeneratedQuestion } from "./voice-recorder-card";
import Plivo from "plivo-browser-sdk";

export const CallInterface = () => {
  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();
  const [editableTranslatedTranscript, setEditableTranslatedTranscript] = useState("");
  const [transcriptsList, setTranscriptsList] = useState<CallTranscript[]>([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const lastTranscriptRef = useRef("");
  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } = useGenerateCallQuestion();
  const [selectedTranscriptIndices, setSelectedTranscriptIndices] = useState<Set<number>>(new Set());

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
      setSelectedTranscriptIndices(new Set());
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
  };

  const handleGenerateQuestions = async () => {
    if (selectedTranscriptIndices.size === 0) {
      toast.info("Please select at least one transcript to generate questions.");
      return;
    }

    const selectedTranscripts = Array.from(selectedTranscriptIndices)
      .sort((a, b) => a - b)
      .map(index => transcriptsList[index])
      .filter(Boolean);

    const liveTranscript = selectedTranscripts
      .map(t => t.translatedText || t.text || t.originalText)
      .filter(Boolean)
      .join(" ");

    if (!liveTranscript || liveTranscript.trim().length <= 10) {
      toast.info("Selected transcripts don't contain enough text.");
      return;
    }

    try {
      const qstns = await generateQuestions(liveTranscript);
      setQuestions(prev => [...prev, ...(qstns || [])]);
      setSelectedTranscriptIndices(new Set());
    } catch (err) {
      console.error("Error generating question", err);
      toast.error("Failed to generate questions.");
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

  return (
    <div className="space-y-4 w-full max-w-full px-4 md:px-6 py-2">
      {/* Incoming Call Box - Top Section */}
      <IncomingCallBox
        onTranscriptChange={() => { }} // Not using direct strings anymore
        onOriginalTranscriptChange={() => { }}
        onTranscriptsListChange={setTranscriptsList}
        onCallStateChange={(isActive) => setIsCallActive(isActive)}
      />
      <button onClick={() => handleRedial("+919606751041")}>Redial</button>

      {/* Premium Read-Only Chat-Bubble Conversation View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
          <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <MessageSquare className={`h-4 w-4 ${isCallActive ? "animate-pulse" : ""}`} />
                Live Conversation Dialogue
              </span>
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
                    const isSelected = selectedTranscriptIndices.has(index);

                    const toggleSelection = () => {
                      setSelectedTranscriptIndices(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(index)) {
                          newSet.delete(index);
                        } else {
                          newSet.add(index);
                        }
                        return newSet;
                      });
                    };

                    return (
                      <div
                        key={index}
                        className={`flex flex-col ${isCaller ? "items-start" : "items-end"} space-y-1.5 animate-in fade-in-50 slide-in-from-bottom-3 duration-300`}
                      >
                        {/* Speaker & Timestamp */}
                        <div className={`flex items-center gap-2 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase ${!isCaller ? "flex-row-reverse" : ""}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelection()}
                            className="h-3.5 w-3.5 cursor-pointer"
                          />
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
                          {msg.originalText && msg.originalText.trim() !== msg.translatedText?.trim() && (
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

        <Card className="min-h-[80%] md:h-auto border border-zinc-200/40 dark:border-zinc-800/40 shadow-2xl bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg overflow-hidden rounded-2xl transition-all duration-300">
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
                  onClick={handleGenerateQuestions}
                  disabled={isGeneratingQuestions || selectedTranscriptIndices.size === 0}
                  size="sm"
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isGeneratingQuestions ? "Generating..." : "Generate question"}
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
                              <p className="text-sm font-medium text-foreground leading-relaxed">
                                {qn.question}
                              </p>
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

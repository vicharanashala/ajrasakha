import React, { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Textarea } from "@/components/atoms/textarea";
import { anaraService, type AnaraCitation, type AnaraDraftResponse } from "@/hooks/services/anaraService";
import {
  Sparkles,
  BookOpen,
  FileText,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface AiDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  crop?: string | null;
  state?: string | null;
  domain?: string | null;
  initialDraft?: AnaraDraftResponse | null;
  onDraftChange?: (draft: AnaraDraftResponse) => void;
  onInsertAnswer?: (answer: string) => void;
}

export const AiDraftModal: React.FC<AiDraftModalProps> = ({
  isOpen,
  onClose,
  query,
  crop,
  state,
  domain,
  initialDraft,
  onDraftChange,
  onInsertAnswer,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<AnaraDraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Edit mode state
  const [answerText, setAnswerText] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedAnswer, setEditedAnswer] = useState<string>("");

  // Guard refs to strictly prevent duplicate or infinite fetch loops
  const hasLoadedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const fetchDraft = async () => {
    if (!query?.trim() || !crop?.trim()) {
      setError("Both Query and Crop are required to generate an AI draft.");
      setLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      console.warn("[AiDraftModal] Fetch already in progress, skipping.");
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    setIsEditing(false);

    try {
      const response = await anaraService.draft(
        query.trim(),
        crop?.trim() || null,
        domain?.trim() || null,
        state?.trim() || null
      );
      setData(response);
      setAnswerText(response.answer || "");
      setEditedAnswer(response.answer || "");
      onDraftChange?.(response);
    } catch (err: any) {
      console.error("[AiDraftModal] Error fetching draft:", err);
      setError(err?.message || "Failed to fetch AI draft from the library.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setIsEditing(false);
      setError(null);

      // Check if this query already has a cached draft in frontend state
      if (initialDraft != null) {
        setData(initialDraft);
        setAnswerText(initialDraft.answer || "");
        setEditedAnswer(initialDraft.answer || "");
        setLoading(false);
        hasLoadedRef.current = true;
      } else if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchDraft();
      }
    } else {
      // Modal closed - reset load guard for next open
      hasLoadedRef.current = false;
      isFetchingRef.current = false;
      setIsEditing(false);
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleCopy = () => {
    if (!answerText) return;
    navigator.clipboard.writeText(answerText);
    setCopied(true);
    toast.success("Draft answer copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartEdit = () => {
    setEditedAnswer(answerText);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedAnswer(answerText);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (!editedAnswer.trim()) {
      toast.error("Answer cannot be empty");
      return;
    }
    const updatedAnswer = editedAnswer.trim();
    setAnswerText(updatedAnswer);
    setIsEditing(false);

    // Overwrite the cached draft with the edited answer
    if (data) {
      const updatedDraft: AnaraDraftResponse = {
        ...data,
        answer: updatedAnswer,
      };
      setData(updatedDraft);
      onDraftChange?.(updatedDraft);
    }
    toast.success("AI draft answer updated successfully");
  };

  const handleOpenPdf = async (citation: AnaraCitation) => {
    if (!citation.documentId) {
      toast.error("Document ID is missing for this citation");
      return;
    }

    setOpeningDocId(citation.documentId);
    try {
      const pageToJump = citation.pageNumber ?? (citation.sourcePages?.[0] ?? undefined);
      await anaraService.openLibraryPdf(citation.documentId, pageToJump);
    } catch (err: any) {
      console.error("[AiDraftModal] Failed to open PDF:", err);
      toast.error(err?.message || "Could not open library PDF");
    } finally {
      setOpeningDocId(null);
    }
  };

  /**
   * Renders the answer text with:
   * 1. Section headers styled cleanly
   * 2. In-text citation references like [P1], [P1, P2, P7, P8] formatted as distinct,
   *    slightly dimmed passage pills rather than mixing into body prose
   * 3. Italics (*...*) and bold (**...**) preserved
   */
  const renderFormattedAnswer = (text: string) => {
    if (!text) {
      return (
        <p className="text-sm text-zinc-500 italic">
          No direct answer text was generated from the library passages.
        </p>
      );
    }

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(<div key={`spacer-${lineIdx}`} className="h-3" />);
        return;
      }

      // Check if line is a prominent section header
      const isHeader =
        trimmed.startsWith("#") ||
        trimmed === "Recommendations for Wheat Crop" ||
        trimmed === "Application Details and Precautions" ||
        trimmed === "Conclusion" ||
        (/^[A-Z][A-Za-z0-9\s,&-]{3,45}$/.test(trimmed) &&
          !trimmed.includes(".") &&
          !trimmed.includes(";"));

      if (isHeader) {
        const headerTitle = trimmed.replace(/^#+\s*/, "");
        elements.push(
          <div
            key={`h-${lineIdx}`}
            className="pt-3.5 pb-1 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-2"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shadow-2xs shrink-0" />
            <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-wide">
              {headerTitle}
            </h4>
          </div>
        );
        return;
      }

      // Format inline passage citations: e.g. [P1], [P1, P2, P7, P8]
      const passagePattern = /(\[(?:P\d+(?:,\s*P\d+)*)\])/g;
      const segments = line.split(passagePattern);

      const formattedLine = segments.map((segment, sIdx) => {
        // Test if this segment is a passage reference bracket
        const match = segment.match(/^\[((?:P\d+(?:,\s*P\d+)*))\]$/);
        if (match) {
          const passageNumbers = match[1].split(",").map((p) => p.trim());
          return (
            <span
              key={`cite-${lineIdx}-${sIdx}`}
              className="inline-flex items-center gap-1 mx-1 align-baseline select-none"
            >
              {passageNumbers.map((p, pIdx) => (
                <span
                  key={pIdx}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300/80 dark:border-zinc-700 hover:bg-emerald-100 hover:text-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-300 hover:border-emerald-300 transition-colors cursor-help tracking-tight shadow-3xs"
                  title={`Cited from Passage ${p.replace('P', '')} in the POP library source document`}
                >
                  {p}
                </span>
              ))}
            </span>
          );
        }

        // Process bold (**...**) and italic (*...*) in text segments
        const boldParts = segment.split(/\*\*([^*]+)\*\*/g);
        return boldParts.map((boldPart, bIdx) => {
          const isBold = bIdx % 2 === 1;
          const italicParts = boldPart.split(/\*([^*]+)\*/g);
          const subContent = italicParts.map((italicPart, iIdx) => {
            const isItalic = iIdx % 2 === 1;
            if (isItalic) {
              return (
                <em
                  key={`em-${lineIdx}-${sIdx}-${bIdx}-${iIdx}`}
                  className="italic font-medium text-emerald-800 dark:text-emerald-300"
                >
                  {italicPart}
                </em>
              );
            }
            return italicPart;
          });

          if (isBold) {
            return (
              <strong
                key={`bold-${lineIdx}-${sIdx}-${bIdx}`}
                className="font-bold text-zinc-950 dark:text-white"
              >
                {subContent}
              </strong>
            );
          }
          return <span key={`sub-${lineIdx}-${sIdx}-${bIdx}`}>{subContent}</span>;
        });
      });

      elements.push(
        <p
          key={`p-${lineIdx}`}
          className="text-sm sm:text-[15.5px] text-zinc-800 dark:text-zinc-200 leading-relaxed sm:leading-[1.75] font-normal"
        >
          {formattedLine}
        </p>
      );
    });

    return <div className="space-y-3">{elements}</div>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl w-[96vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl">
        {/* Header (fixed height, shrink-0) */}
        <DialogHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-r from-emerald-50/60 via-zinc-50/40 to-white dark:from-emerald-950/20 dark:via-zinc-900/40 dark:to-zinc-950 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>AI Draft</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Grounded agricultural answer with official source document citations (Anara integration).
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Query Context Strip (fixed height, shrink-0) */}
        <div className="px-5 py-2.5 bg-zinc-50/80 dark:bg-zinc-900/50 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-2 text-xs shrink-0">
          <span className="font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px] shrink-0">
            Query:
          </span>
          <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate italic">
            "{query}"
          </span>
          {domain && (
            <Badge variant="outline" className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 font-semibold px-2 py-0.5">
              {domain}
            </Badge>
          )}
          {crop && (
            <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-semibold px-2 py-0.5">
              {crop}
            </Badge>
          )}
          {state && (
            <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold px-2 py-0.5">
              {state}
            </Badge>
          )}
        </div>

        {/* Main Body: Fixed to remaining viewport height, overflow-hidden on outer container */}
        <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-5 flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Searching POP Library & Drafting Answer...
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                  Checking official translated Package of Practices documents and retrieving grounded passages.
                </p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="p-4 max-w-md w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 text-red-700 dark:text-red-300 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-xs font-semibold">Failed to generate AI Draft</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchDraft}
                    className="h-7 text-xs border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-800 dark:text-red-200 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
              {/* Optional Note Banner (shrink-0) */}
              {data.note && (
                <div className="p-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2 shrink-0">
                  <BookOpen className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{data.note}</span>
                </div>
              )}

              {/* Two-Column Independent Scroll Grid: Extends to the end of window height */}
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 overflow-hidden">
                {/* Left Column: Citations List (5 cols on lg) */}
                <div className="lg:col-span-5 h-full flex flex-col min-h-0 overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 rounded-xl p-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-800/60 shrink-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                        Source Citations ({data.citations?.length || 0})
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-400">
                      Passages P1–P{data.citations?.length || 0}
                    </span>
                  </div>

                  {data.citations && data.citations.length > 0 ? (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5 pt-2.5 overscroll-contain scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
                      {data.citations.map((citation, idx) => {
                        const isOpening = openingDocId === citation.documentId;
                        return (
                          <div
                            key={citation.passageId || idx}
                            className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/70 shadow-xs flex flex-col gap-2 hover:border-emerald-300 dark:hover:border-emerald-800 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0 h-4.5 shadow-2xs">
                                  Passage {citation.passageNumber} [P{citation.passageNumber}]
                                </Badge>
                                {citation.pageNumber != null && (
                                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                                    Page {citation.pageNumber}
                                  </span>
                                )}
                                {citation.sourcePages && citation.sourcePages.length > 0 && (
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                    (source p. {citation.sourcePages.join(", ")})
                                  </span>
                                )}
                              </div>

                              {citation.documentId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenPdf(citation)}
                                  disabled={isOpening}
                                  className="h-6.5 px-2 text-[11px] border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                                  title="Open source PDF at this page"
                                >
                                  {isOpening ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <ExternalLink className="h-3 w-3" />
                                      <span>View PDF</span>
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>

                            <p
                              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 break-words line-clamp-2"
                              title={citation.documentName || "Library Document"}
                            >
                              {citation.documentName || "Library Document"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-6 text-center text-zinc-400 text-xs italic border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl my-2">
                      No document passages cited for this query.
                    </div>
                  )}
                </div>

                {/* Right Column: Grounded Advisory Answer (7 cols on lg) */}
                <div className="lg:col-span-7 h-full flex flex-col min-h-0 overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 p-4">
                  {/* Answer Header with Edit & Copy actions */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200/50 dark:border-zinc-800/50 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                        {isEditing ? "Editing Advisory Answer" : "Grounded Advisory Answer"}
                      </span>
                      {isEditing && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 font-semibold px-1.5 py-0">
                          Edit Mode
                        </Badge>
                      )}
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            className="h-7 px-2.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 border-zinc-300 dark:border-zinc-700 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                            <span>Cancel</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                          >
                            <Check className="h-3 w-3" />
                            <span>Submit</span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleStartEdit}
                            className="h-7 px-2.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 border-zinc-300 dark:border-zinc-700 rounded-lg flex items-center gap-1 cursor-pointer"
                            title="Edit this drafted answer"
                          >
                            <Pencil className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCopy}
                            className="h-7 px-2.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 cursor-pointer"
                            title="Copy answer to clipboard"
                          >
                            {copied ? (
                              <>
                                <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Content Area: Individual Scroll */}
                  {isEditing ? (
                    <div className="flex-1 min-h-0 flex flex-col gap-2 pt-2.5">
                      <Textarea
                        value={editedAnswer}
                        onChange={(e) => setEditedAnswer(e.target.value)}
                        className="w-full text-sm sm:text-[15.5px] leading-relaxed p-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 focus-visible:ring-emerald-500 font-sans bg-white dark:bg-zinc-900 resize-none flex-1 min-h-0 overflow-y-auto"
                        placeholder="Edit the advisory answer..."
                      />
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 shrink-0">
                        <span>Click "Submit" to save changes into the query draft.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto pr-2 pt-2.5 overscroll-contain scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
                      {renderFormattedAnswer(answerText)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer (fixed height, shrink-0) */}
        <DialogFooter className="p-3.5 sm:p-4 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40 flex items-center justify-between sm:justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchDraft}
              disabled={loading || !query?.trim() || !crop?.trim()}
              className="h-8 text-xs cursor-pointer border-zinc-300 dark:border-zinc-700"
              title="Force re-generate draft from POP library"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              <span>Regenerate</span>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {onInsertAnswer && answerText && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onInsertAnswer(answerText);
                  toast.success("Answer inserted into query notes");
                  onClose();
                }}
                className="h-8 text-xs border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950 cursor-pointer"
              >
                <span>Use as Answer</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

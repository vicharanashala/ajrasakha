import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, User, Mail, Clock, Hash, Brain, Wrench, CheckCircle2, MessageSquareText, CheckCircle, XCircle, Save, Pencil, X, SkipForward, Loader2, RefreshCw, ExternalLink, ArrowUpRight } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { toast } from "sonner";
import { Button } from "./atoms/button";
import type { IQuestionFullData, SourceItem } from "@/types";
import { useGetQuestionMessageDetailsByQuestionId } from "@/hooks/api/question/useGetQuestionMessageDetailsByQuestionId";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/atoms/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/atoms/alert-dialog";

// const msg = {
//     messageId: "msg_67f0a1b2c3d4",
//     createdAt: "2026-04-05T09:15:00.000Z",
//     updatedAt: "2026-04-05T09:18:45.000Z",
//     user: {
//         username: "abi",
//         email: "abi@example.com",
//         emailVerified: true,
//         avatar: "https://i.pravatar.cc/150?img=12",
//     },
//     content: [
//         {
//             type: "think",
//             think: `The user is asking about guar crop in Haryana state. The question is in English, so I must respond in English.

// Key points:
// 1. Recommended sowing time for guar
// 2. Why weed control should be done up to 30 days after sowing
// 3. Location: Haryana state

// I need to:
// 1. First upload the question to the reviewer system
// 2. Search the reviewer dataset
// 3. Search golden dataset with state code HR
// 4. Search package of practices dataset
// 5. Search FAQ videos if relevant`,
//         },
//         {
//             type: "tool_call",
//             tool_call: {
//                 id: "toolu_01QfeYmWSZFSg1AnaEEuMvVJ",
//                 name: "upload_question_to_reviewer_system_mcp_pop",
//                 args: {
//                     question:
//                         "What is the recommended sowing time and why should weed control be carried out up to 30 days after sowing in guar crop?",
//                     state_name: "Haryana",
//                     crop: "Guar",
//                 },
//                 type: "tool_call",
//                 progress: 1,
//                 output: [
//                     {
//                         type: "text",
//                         text: {
//                             status: "Uploaded Successfully",
//                         },
//                     },
//                 ],
//             },
//         },
//         {
//             type: "tool_call",
//             tool_call: {
//                 id: "toolu_01GSPkaMtCNtdnTiFG9vguym",
//                 name: "get_context_from_reviewer_dataset_mcp_reviewer",
//                 args: {
//                     query: "recommended sowing time weed control 30 days guar crop Haryana",
//                     state: "Haryana",
//                     crop: "Guar",
//                 },
//                 type: "tool_call",
//                 progress: 1,
//                 output: [
//                     {
//                         type: "text",
//                         text: [
//                             {
//                                 question_id: "69ce0ad8201d9072ae36b07a",
//                                 similarity_score: 0.916,
//                             },
//                         ],
//                     },
//                 ],
//             },
//         },
//         {
//             type: "think",
//             think: `The reviewer dataset provides the most relevant Haryana-specific guar crop guidance. I should now formulate a concise answer using the approved sources and include weed control timing rationale.`,
//         },
//         {
//             type: "text",
//             text: `The recommended sowing time for guar (cluster bean) in Haryana varies by variety maturity: **early maturing varieties** (HG 365, HG 563) should be sown in the **second fortnight of June**, **medium maturing varieties** (HG 870, HG 2-20) in the **first fortnight of July**, and **late maturing varieties** (HG 75) in **mid-July**.

// **Weed control up to 30 days after sowing is critical** because this is when guar plants are in the early establishment phase. During the first 25–30 days, weeds compete strongly for **water, nutrients, sunlight, and space**, which can reduce crop vigor, nodulation, and final yield.

// **Recommended practice:**
// - One hoeing at **25–30 days after sowing**
// - If required, a second hoeing later
// - For chemical control, apply **Fluchloralin 45% EC @ 800 ml/acre** in **250 liters of water before sowing** and incorporate into the soil
// - Increase dose by **25% in heavy soils**

// Always follow label directions, use PPE, and observe PHI.`,
//         },
//     ],
// };


interface MessageDetailCardProps {
    question: IQuestionFullData;
    isQuestionAllocatedToExpert: boolean;
    navigateToQuestionPage: () => void;
}

const MessageDetail = ({
    question,
    isQuestionAllocatedToExpert,
    navigateToQuestionPage
}: MessageDetailCardProps) => {
    const [expanded, setExpanded] = useState(false);
    const selectedQuestionId = question?._id || null;

    const {
        data: messageDetails,
        refetch: refechMessageDetails,
        isLoading,
    } = useGetQuestionMessageDetailsByQuestionId(selectedQuestionId);


    const msg = messageDetails?.data

    const isError = false;
    // const isLoading = false;

    let thinkIndex = 0;

    return (
        // <div className="w-full mx-auto">
        //     <button
        //         onClick={() => setExpanded(!expanded)}
        //         className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-border bg-card hover:shadow-md transition-all duration-200 group"
        //     >
        <div className="relative w-full rounded-xl p-[1px] overflow-hidden">
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-xl bg-primary animate-pulse opacity-80 h-19" />

            {/* Soft glow layer */}
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md h-19" />

            {/* Actual button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="relative z-10 w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-card border border-transparent hover:shadow-md transition-all duration-300 group"
            >
                {expanded ? (
                    <ChevronDown className="h-5 w-5 text-primary shrink-0 transition-transform" />
                ) : (
                    <ChevronRight className="h-5 w-5 text-primary shrink-0 transition-transform" />
                )}

                <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">Message Details</span>
                    <span className="text-xs text-muted-foreground">
                        {expanded ? "Click to collapse" : "Click to expand & fetch details"}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {!expanded && !isLoading && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                refechMessageDetails();
                            }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md border bg-background hover:bg-muted transition-colors"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                    )}

                    <Badge variant="secondary" className="text-[10px]">
                        {isLoading ? "Loading…" : expanded && msg ? `ID: ${msg.messageId}` : "View More"}
                    </Badge>
                </div>
            </button>

            {expanded && (
                <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    {isLoading && (
                        <div className="p-5 space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-8 w-2/3" />
                            <Skeleton className="h-32 w-full" />
                        </div>
                    )}

                    {isError && (
                        <div className="p-5 text-sm text-destructive">Failed to fetch message details.</div>
                    )}

                    {!isLoading && !isError && !msg && (
                        <div className="p-6 text-center">
                            <p className="text-sm font-medium text-foreground">
                                No message details available
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                No processing steps or message metadata were found for this question.
                            </p>
                        </div>
                    )}

                    {msg && (
                        <div className="divide-y divide-border">
                            {/* User & Meta */}
                            <div className="p-5 flex items-start gap-4">
                                <Avatar className="h-10 w-10 border border-border">
                                    <AvatarImage src={msg.user.avatar} alt={msg.user.username} />
                                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                        {msg.user.username[0].toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-muted-foreground" /> {msg.user.username}
                                        </span>
                                        {msg.user.emailVerified && (
                                            <Badge className="text-[10px] bg-success/10 text-success border-success/20">Verified</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Mail className="h-3 w-3" /> {msg.user.email}
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mt-1">
                                        <span className="flex items-center gap-1">
                                            <Hash className="h-3 w-3" /> {msg.messageId}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> {new Date(msg.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Steps */}
                            <div className="p-5 space-y-3">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                    Processing Steps ({msg.content.length})
                                </p>
                                {msg.content.map((item: any, i: number) => {
  const isLastItem = i === msg.content.length - 1;
 
  if (item.type === "think") {
    const idx = thinkIndex++;
    return <ContentThinkStep key={i} think={item.think} index={idx} />;
  }
 
  if (item.type === "tool_call") {
    return <ContentToolCall key={i} toolCall={item.tool_call} />;
  }
 
  if (item.type === "text" && isLastItem) {
    return (
      <ContentAnswer
        key={i}
        text={item.text}
        question={question}
        isQuestionAllocatedToExpert={isQuestionAllocatedToExpert}
        navigateToQuestionPage={navigateToQuestionPage}
      />
    );
  }
 
  return null;
})}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MessageDetail;



// --- Types for parsed chatbot text ---
interface AgriSpecialist {
    name: string;
    sourceName: string;
    sourceLink: string;
}

interface PdfSource {
    name: string;
    link: string;
    pages: string;
    sourceType: string;
}

interface ParsedChatbotText {
    answerBody: string;
    agriSpecialists: AgriSpecialist[];
    pdfSources: PdfSource[];
}

// --- Parser function ---
const parseChatbotText = (text: string): ParsedChatbotText => {
    let workingText = text;
    const noticeIdx = workingText.indexOf('\u26A0\uFE0F');
    if (noticeIdx !== -1) workingText = workingText.substring(0, noticeIdx).trim();

    let answerBody = workingText;
    let sourcesSection = '';
    const parts = workingText.split(/\n---\n/);
    if (parts.length > 1) {
        answerBody = parts[0].trim();
        sourcesSection = parts.slice(1).join('\n---\n').trim();
    } else {
        const sourceMarker = workingText.match(/\*?\*?The answer I provided[^*\n]*/i);
        if (sourceMarker && sourceMarker.index !== undefined) {
            answerBody = workingText.substring(0, sourceMarker.index).trim();
            sourcesSection = workingText.substring(sourceMarker.index).trim();
        }
    }
    answerBody = answerBody.replace(/\n---\s*$/, '').trim();

    const agriSpecialists: AgriSpecialist[] = [];
    const agriRows = sourcesSection.match(/\|\s*Agri Specialist Name\s*\|\s*Source Link\s*\|[^\n]*\n\|[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n\s*\|[^|]*Source\/PDF|$)/i);
    if (agriRows) {
        for (const row of agriRows[1].trim().split('\n').filter((r: string) => r.startsWith('|'))) {
            const cells = row.split('|').filter((c: string) => c.trim() !== '');
            if (cells.length >= 2) {
                const name = cells[0].trim();
                const lm = cells[1].trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
                agriSpecialists.push({ name, sourceName: lm ? lm[1] : cells[1].trim(), sourceLink: lm ? lm[2] : '' });
            }
        }
    }

    const pdfSources: PdfSource[] = [];
    const pdfRows = sourcesSection.match(/\|\s*Source\/PDF Link\s*\|\s*Page Number\s*\|[^\n]*\n\|[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n---|\n\u26A0|$)/i);
    if (pdfRows) {
        for (const row of pdfRows[1].trim().split('\n').filter((r: string) => r.startsWith('|'))) {
            const cells = row.split('|').filter((c: string) => c.trim() !== '');
            if (cells.length >= 2) {
                const lm = cells[0].trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
                pdfSources.push({ name: lm ? lm[1] : cells[0].trim(), link: lm ? lm[2] : '', pages: cells[1].trim(), sourceType: 'other' });
            }
        }
    }

    return { answerBody, agriSpecialists, pdfSources };
};

interface ContentAnswerProps {
    text: string;
    question: IQuestionFullData;
    isQuestionAllocatedToExpert: boolean;
    navigateToQuestionPage(): void;
}

const ContentAnswer = ({ text, question, isQuestionAllocatedToExpert, navigateToQuestionPage }: ContentAnswerProps) => {
    const parsed = parseChatbotText(text);
    const [approved, setApproved] = useState<boolean | null>(null);
    const [editedAnswerBody, setEditedAnswerBody] = useState(parsed.answerBody);
    const [editedSpecialists, setEditedSpecialists] = useState<AgriSpecialist[]>(parsed.agriSpecialists);
    const [editedPdfSources, setEditedPdfSources] = useState<PdfSource[]>(parsed.pdfSources);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editModalKey, setEditModalKey] = useState(0);
    const [translatedText, setTranslatedText] = useState<string>("");
    const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: "pass" | "approve" | "save" | "cancel" }>({ open: false, type: "pass" });

    const { mutateAsync: updateAnswer, isPending: isUpdating } = useUpdateAnswer();
    const { mutateAsync: updateQuestion, isPending: updatingQuestion } = useUpdateQuestion();

    useEffect(() => {
        const p = parseChatbotText(text);
        setEditedAnswerBody(p.answerBody);
        setEditedSpecialists(p.agriSpecialists);
        setEditedPdfSources(p.pdfSources);
        setTranslatedText("");
    }, [text]);

    const handleApprove = () => {
        if (!editedAnswerBody.trim()) { toast.error("Answer cannot be empty."); return; }
        if (!question?._id) { toast.error("Question data is missing."); return; }
        if (question.source !== "AJRASAKHA") { toast.error("Only AJRASAKHA answers can be approved."); return; }
        setConfirmDialog({ open: true, type: "approve" });
    };

    const doApprove = async () => {
        try {
            const sources: SourceItem[] = [];
            for (const spec of editedSpecialists) {
                if (spec.sourceLink) sources.push({ sourceType: "other", sourceName: spec.sourceName || spec.name || "chatbot", source: spec.sourceLink });
            }
            for (const pdf of editedPdfSources) {
                if (pdf.link) {
                    const firstPage = pdf.pages ? parseInt(pdf.pages.split(',')[0].trim(), 10) : NaN;
                    sources.push({ sourceType: (pdf.sourceType || "other") as any, sourceName: pdf.name || "chatbot", source: pdf.link, page: isNaN(firstPage) ? undefined : firstPage });
                }
            }
            await updateAnswer({
                updatedAnswer: editedAnswerBody.trim(),
                sources: sources.length > 0 ? sources : [{ sourceType: "MODERATOR_REVIEW", source: "Answer reviewed and approved by moderator" }],
                answerId: undefined, questionId: question._id, source: "AJRASAKHA",
            });
            setApproved(true);
            toast.success("Answer approved successfully");
            navigateToQuestionPage();
        } catch (error) {
            console.error("Failed to approve answer:", error);
            toast.error("Failed to approve the answer. Please try again.");
        }
    };

    const handleEdit = () => { setEditModalKey(k => k + 1); setIsEditModalOpen(true); };
    const handleCancelEdit = () => { const p = parseChatbotText(text); setEditedAnswerBody(p.answerBody); setEditedSpecialists(p.agriSpecialists); setEditedPdfSources(p.pdfSources); setIsEditModalOpen(false); };
    const handleSaveEdit = () => { toast.success("Changes saved"); setIsEditModalOpen(false); };
    const handleSkip = () => { setConfirmDialog({ open: true, type: "pass" }); };

    const doSkip = async () => { await updateQuestion({ isHidden: true, _id: question._id! }); toast.success("Question has been hidden"); navigateToQuestionPage(); };

    const handleConfirm = () => {
        const type = confirmDialog.type;
        setConfirmDialog({ open: false, type: "pass" });
        if (type === "pass") { doSkip(); }
        else if (type === "approve") { doApprove(); }
    };


    const renderAnswerBody = (raw: string) => raw.split("\n").map((line, i) => {
        if (line.trim() === "") return <br key={i} />;
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return (<p key={i} className="leading-relaxed">{parts.map((part, pi) => {
            if (part.startsWith("**") && part.endsWith("**")) return <strong key={pi} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
            if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) return <em key={pi} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
            return <span key={pi}>{part}</span>;
        })}</p>);
    });

    return (
        <>
        <div className="rounded-lg border-2 border-info/30 bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-info/5 border-b border-info/20">
                <MessageSquareText className="h-4 w-4 text-info" />
                <span className="text-sm font-semibold text-foreground">Final Answer</span>

                <div className="ml-auto flex items-center gap-2">
                    <SarvamTranslateDropdown
                        query={editedAnswerBody}
                        onTranslate={(result) => setTranslatedText(result)}
                    />
                    {approved === true && <span className="flex items-center gap-1 text-xs text-success font-medium"><CheckCircle className="h-3.5 w-3.5" /> Approved</span>}
                    {approved === false && <span className="flex items-center gap-1 text-xs text-destructive font-medium"><XCircle className="h-3.5 w-3.5" /> Rejected</span>}
                </div>
            </div>

            <div className="px-4 py-4 text-sm text-foreground/90 space-y-4">
                {renderAnswerBody(translatedText || editedAnswerBody)}

                {editedSpecialists.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2"><User className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agri Specialists</span></div>
                        <div className="overflow-x-auto"><table className="w-full text-sm border border-border rounded"><thead><tr className="bg-surface"><th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border">Specialist Name</th><th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border">Source</th></tr></thead><tbody>
                            {editedSpecialists.map((spec, idx) => (<tr key={idx} className="border-b border-border last:border-0"><td className="px-3 py-2 text-muted-foreground">{spec.name}</td><td className="px-3 py-2">{spec.sourceLink ? <a href={spec.sourceLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{spec.sourceName} <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">{spec.sourceName}</span>}</td></tr>))}
                        </tbody></table></div>
                    </div>
                )}

                {editedPdfSources.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2"><Hash className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference Sources</span></div>
                        <div className="space-y-2">
                            {editedPdfSources.map((src, idx) => (
                                <div key={idx} className="grid grid-cols-[140px_1fr_auto_auto] items-center gap-6 rounded-lg border bg-muted/30 p-3">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/10 text-foreground border border-foreground/20 whitespace-nowrap overflow-x-auto">
                                        Other{src.name ? `: ${src.name}` : ""}
                                    </span>
                                    <span className="text-sm truncate text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" onClick={() => src.link && window.open(src.link, "_blank")}>
                                        {src.link || <span className="text-muted-foreground">No link</span>}
                                    </span>
                                    {src.pages ? <span className="text-xs text-muted-foreground whitespace-nowrap">pg {src.pages}</span> : <span />}
                                    <a href={src.link} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted/20 transition-colors">
                                        <ArrowUpRight className="w-4 h-4 text-foreground/80" />
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {approved === null && question && question.isAutoAllocate === false && question.source == "AJRASAKHA" && question.status !== "closed" && !isQuestionAllocatedToExpert && (
                <div className="w-full flex flex-col gap-3 px-4 py-3 border-t border-border md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-muted-foreground leading-relaxed md:max-w-[60%]">On approval, this answer will be finalized, the question will be marked as closed, and the result will be pushed to the Golden dataset. Please review carefully before approving.</p>
                    <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
                        <Button type="button" variant="outline" size="sm" onClick={handleEdit} className="gap-2 rounded-xl px-4"><Pencil className="h-4 w-4" /> Edit Answer</Button>
                        <Button type="button" variant="outline" size="sm" disabled={updatingQuestion} onClick={handleSkip} className={`gap-2 rounded-xl px-4 ${updatingQuestion ? "cursor-not-allowed opacity-50" : ""}`}>{updatingQuestion ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}{updatingQuestion ? "Passing..." : "Pass"}</Button>
                        <Button type="button" onClick={handleApprove} size="sm" disabled={isUpdating} className="gap-2 rounded-xl px-4 bg-primary text-primary-foreground hover:opacity-90">{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{isUpdating ? "Approving..." : "Approve"}</Button>
                    </div>
                </div>
            )}
        </div>

        <EditAnswerModal
            key={editModalKey}
            open={isEditModalOpen}
            onOpenChange={(open) => {
                if (!open) {
                    handleCancelEdit();
                }
            }}
            editedAnswerBody={editedAnswerBody}
            onAnswerBodyChange={setEditedAnswerBody}
            editedSpecialists={editedSpecialists}
            onSpecialistsChange={setEditedSpecialists}
            editedPdfSources={editedPdfSources}
            onPdfSourcesChange={setEditedPdfSources}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
        />

        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {confirmDialog.type === "pass" && "Pass this question?"}
                        {confirmDialog.type === "approve" && "Approve this answer?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {confirmDialog.type === "save" && "Are you sure you want to save these changes to the answer?"}
                        {confirmDialog.type === "cancel" && "Are you sure you want to cancel? Any unsaved changes will be lost."}
                        {confirmDialog.type === "pass" && "Are you sure you want to pass this question? It will be hidden from the Question list."}
                        {confirmDialog.type === "approve" && "Are you sure you want to approve this answer? The question will  allocate to task_force team."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Go back</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm}>
                        {confirmDialog.type === "pass" && "Yes, pass"}
                        {confirmDialog.type === "approve" && "Yes, approve"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
};



// --- Edit Answer Modal ---

interface EditAnswerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editedAnswerBody: string;
    onAnswerBodyChange: (v: string) => void;
    editedSpecialists: AgriSpecialist[];
    onSpecialistsChange: (v: AgriSpecialist[]) => void;
    editedPdfSources: PdfSource[];
    onPdfSourcesChange: (v: PdfSource[]) => void;
    onSave: () => void;
    onCancel: () => void;
}

const EditAnswerModal = ({
    open,
    onOpenChange,
    editedAnswerBody,
    onAnswerBodyChange,
    editedSpecialists,
    onSpecialistsChange,
    editedPdfSources,
    onPdfSourcesChange,
    onSave,
    onCancel,
}: EditAnswerModalProps) => {
    const [pendingAction, setPendingAction] = useState<'save' | 'cancel' | null>(null);

    const updateSpecialist = (idx: number, field: keyof AgriSpecialist, value: string) =>
        onSpecialistsChange(editedSpecialists.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    const removeSpecialist = (idx: number) =>
        onSpecialistsChange(editedSpecialists.filter((_, i) => i !== idx));

    const updatePdfSource = (idx: number, field: keyof PdfSource, value: string) =>
        onPdfSourcesChange(editedPdfSources.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    const removePdfSource = (idx: number) =>
        onPdfSourcesChange(editedPdfSources.filter((_, i) => i !== idx));
    const SOURCE_TYPE_OPTIONS = [
        { value: "hyper_local", label: "Hyper Local" },
        { value: "state", label: "State" },
        { value: "central", label: "Central" },
        { value: "other", label: "Other" },
    ];

    const addPdfSource = () =>
        onPdfSourcesChange([...editedPdfSources, { name: '', link: '', pages: '', sourceType: '' }]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[880px] w-full flex flex-col overflow-hidden p-0">
                {/* Header */}
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" /> Edit Answer
                    </DialogTitle>
                </DialogHeader>

                {/* Two-column scrollable body */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="grid grid-cols-2 gap-0 divide-x divide-border">
                        {/* Left column: Answer text */}
                        <div className="p-5 space-y-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Answer Text</label>
                            <textarea
                                value={editedAnswerBody}
                                onChange={(e) => onAnswerBodyChange(e.target.value)}
                                className="w-full h-[420px] rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none resize-none focus:ring-2 focus:ring-primary/30"
                                placeholder="Edit the answer..."
                            />
                        </div>

                        {/* Right column: Sources */}
                        <div className="p-5 space-y-5 overflow-y-auto max-h-[480px]">
                            {/* Agri Specialists */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agri Specialists</span>
                                </div>
                                <div className="space-y-2">
                                    {editedSpecialists.map((spec, idx) => (
                                        <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-lg border border-border bg-surface/30">
                                            <div className="flex items-center gap-1.5">
                                                <input type="text" value={spec.name} onChange={(e) => updateSpecialist(idx, 'name', e.target.value)} placeholder="Name" className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                                <button type="button" onClick={() => removeSpecialist(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"><X className="h-3.5 w-3.5" /></button>
                                            </div>
                                            <input type="text" value={spec.sourceName} onChange={(e) => updateSpecialist(idx, 'sourceName', e.target.value)} placeholder="Source Name" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                            <input type="text" value={spec.sourceLink} onChange={(e) => updateSpecialist(idx, 'sourceLink', e.target.value)} placeholder="Source URL" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Reference Sources */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference Sources</span>
                                </div>
                                <div className="space-y-2">
                                    {editedPdfSources.map((src, idx) => (
                                        <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-lg border border-border bg-surface/30">
                                            <div className="flex items-center gap-1.5">
                                                <input type="text" value={src.name} onChange={(e) => updatePdfSource(idx, 'name', e.target.value)} placeholder="Source Name" className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                                <button type="button" onClick={() => removePdfSource(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"><X className="h-3.5 w-3.5" /></button>
                                            </div>
                                            <select value={src.sourceType} onChange={(e) => updatePdfSource(idx, 'sourceType', e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30">
                                                <option value="">Select Source Type</option>
                                                {SOURCE_TYPE_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <input type="text" value={src.link} onChange={(e) => updatePdfSource(idx, 'link', e.target.value)} placeholder="Source URL" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                            <input type="text" value={src.pages} onChange={(e) => updatePdfSource(idx, 'pages', e.target.value)} placeholder="Pages (e.g. 12, 13)" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                        </div>
                                    ))}
                                    <button type="button" onClick={addPdfSource} className="flex items-center gap-1 text-xs text-primary hover:underline"><span className="text-base leading-none">+</span> Add Source</button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-3">
                    {pendingAction === null && (
                        <>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPendingAction('cancel')} className="gap-2 rounded-xl">
                                <X className="h-4 w-4" /> Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={() => setPendingAction('save')} className="gap-2 rounded-xl">
                                <Save className="h-4 w-4" /> Save Changes
                            </Button>
                        </>
                    )}
                    {pendingAction === 'save' && (
                        <>
                            <span className="text-sm text-muted-foreground mr-auto">Save changes?</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPendingAction(null)} className="rounded-xl">Go back</Button>
                            <Button type="button" size="sm" onClick={() => { setPendingAction(null); onSave(); }} className="rounded-xl">Yes, save</Button>
                        </>
                    )}
                    {pendingAction === 'cancel' && (
                        <>
                            <span className="text-sm text-muted-foreground mr-auto">Discard changes?</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPendingAction(null)} className="rounded-xl">Go back</Button>
                            <Button type="button" size="sm" onClick={() => { setPendingAction(null); onCancel(); }} className="gap-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, discard</Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};



interface ContentThinkStepProps {
    think: string;
    index: number;
}

const ContentThinkStep = ({ think, index }: ContentThinkStepProps) => {
    const [expanded, setExpanded] = useState(false);
    const preview = think.slice(0, 120) + (think.length > 120 ? "…" : "");

    return (
        <div className="rounded-lg border border-border bg-surface/50 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
            >
                <Brain className="h-4 w-4 text-info shrink-0" />
                <span className="text-xs font-medium text-info">Thinking #{index + 1}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">
                    {!expanded && preview}
                </span>
                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
            </button>
            {expanded && (
                <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-wrap border-t border-border bg-surface/30">
                    <div className="pt-3">{think}</div>
                </div>
            )}
        </div>
    );
};



interface ToolOutputItem {
    type: string;
    text?: string;
    [key: string]: any;
}

interface ContentToolCallProps {
    toolCall: {
        id: string;
        name: string;
        args: string | Record<string, any>;
        progress: number;
        output: string | ToolOutputItem[] | Record<string, any>;
    };
}

const formatJsonString = (value: string): string => {
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
};

const formatArgs = (args: unknown): string => {
    if (typeof args === "string") {
        return formatJsonString(args);
    }

    try {
        return JSON.stringify(args, null, 2);
    } catch {
        return String(args);
    }
};

const formatOutput = (output: unknown): string => {
    if (typeof output === "string") {
        return formatJsonString(output);
    }

    if (Array.isArray(output)) {
        return output
            .map((item) => {
                if (item?.type === "text" && typeof item.text === "string") {
                    return formatJsonString(item.text);
                }

                try {
                    return JSON.stringify(item, null, 2);
                } catch {
                    return String(item);
                }
            })
            .join("\n\n");
    }

    try {
        return JSON.stringify(output, null, 2);
    } catch {
        return String(output);
    }
};

const ContentToolCall = ({ toolCall }: ContentToolCallProps) => {
    const [expanded, setExpanded] = useState(false);

    const parsedArgs = formatArgs(toolCall.args);
    const parsedOutput = formatOutput(toolCall.output);

    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
            >
                <Wrench className="h-4 w-4 text-warning shrink-0" />

                <span className="text-xs font-mono font-medium text-foreground truncate flex-1">
                    {toolCall.name}
                </span>

                {toolCall.progress === 1 && (
                    <Badge
                        variant="outline"
                        className="text-success border-success/30 text-[10px] gap-1"
                    >
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                    </Badge>
                )}

                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
            </button>

            {expanded && (
                <div className="border-t border-border text-xs font-mono">
                    <div className="px-4 py-3 bg-surface/30">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-sans">
                            Arguments
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-foreground/80">
                            {parsedArgs}
                        </pre>
                    </div>

                    <div className="px-4 py-3 bg-surface/50 border-t border-border">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-sans">
                            Output
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/80">
                            {parsedOutput}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
};




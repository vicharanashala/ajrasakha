import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, User, Mail, Clock, Hash, Brain, Wrench, CheckCircle2, MessageSquareText, CheckCircle, XCircle, Pencil, X, SkipForward, Loader2, RefreshCw, ExternalLink, ArrowUpRight, AlertCircle } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select";
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
import { useGenerateInitialAnswer } from "@/hooks/api/question/useGenerateInitialAnswer";
import { ScrollArea } from "./atoms/scroll-area";

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
        error: fetchError
    } = useGetQuestionMessageDetailsByQuestionId(selectedQuestionId);

    const { mutateAsync: generateAI, isPending: isGenerating } = useGenerateInitialAnswer();

    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [chatbotError, setChatbotError] = useState<string | null>(null);

    useEffect(() => {
        if (expanded) {
            if (fetchError) {
                setChatbotError(fetchError.message);
                setIsErrorModalOpen(true);
            } else if (messageDetails && messageDetails.success === false) {
                setChatbotError(messageDetails.message || "An error occurred with the chatbot.");
                setIsErrorModalOpen(true);
            }
        }
    }, [fetchError, messageDetails, expanded]);

    const handleGenerateAI = async () => {
        try {
            await generateAI(selectedQuestionId!);
            toast.success("AI Answer generation triggered successfully");
            setIsErrorModalOpen(false);
            refechMessageDetails();
        } catch (err: any) {
            toast.error(err.message || "Failed to trigger AI generation");
        }
    };


    const msg = messageDetails?.data

    const isError = !!fetchError || (messageDetails && messageDetails.success === false);

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
                                {
                                    // question.source === "WHATSAPP" ? (
                                    //     (() => {
                                    //         const lastAiIndex = msg.content.map((item: any) => item.type).lastIndexOf("ai");
                                    //         return msg.content.map((item: any, i: number) => {
                                    //             if (item.type === "human") {
                                    //                 return <ContentHuman key={i} text={item.text} />;
                                    //             }

                                    //             if (item.type === "ai") {
                                    //                 if (i === lastAiIndex) {
                                    //                     return (
                                    //                         <ContentAnswer
                                    //                             key={i}
                                    //                             text={item.text}
                                    //                             question={question}
                                    //                             isQuestionAllocatedToExpert={isQuestionAllocatedToExpert}
                                    //                             navigateToQuestionPage={navigateToQuestionPage}
                                    //                         />
                                    //                     );
                                    //                 }
                                    //                 return <ContentTextStep key={i} text={item.text} />;
                                    //             }

                                    //             if (item.type === "tool") {
                                    //                 return (
                                    //                     <ContentToolCall
                                    //                         key={i}
                                    //                         toolCall={{
                                    //                             id: i.toString(),
                                    //                             name: item.toolName || "tool",
                                    //                             args: item.toolArgs || {},
                                    //                             progress: item.toolResponse ? 1 : 0,
                                    //                             output: item.toolResponse || "Calling tool..."
                                    //                         }}
                                    //                     />
                                    //                 );
                                    //             }

                                    //             return null;
                                    //         });
                                    //     })()
                                    // ) : (
                                    // msg.content.map((item: any, i: number) => {
                                    //     const isLastItem = i === msg.content.length - 1;

                                    //     if (item.type === "think") {
                                    //         const idx = thinkIndex++;
                                    //         return <ContentThinkStep key={i} think={item.think} index={idx} />;
                                    //     }

                                    //     if (item.type === "tool_call") {
                                    //         return <ContentToolCall key={i} toolCall={item.tool_call} />;
                                    //     }

                                    //     if (item.type === "text" && isLastItem) {
                                    //         return (
                                    //             <ContentAnswer
                                    //                 key={i}
                                    //                 text={item.text}
                                    //                 question={question}
                                    //                 isQuestionAllocatedToExpert={isQuestionAllocatedToExpert}
                                    //                 navigateToQuestionPage={navigateToQuestionPage}
                                    //             />
                                    //         );
                                    //     }

                                    //     return null;
                                    // })

                                    (() => {
                                        const lastAiIndex = msg.content
                                            .map((item: any) => item.type)
                                            .lastIndexOf("ai");

                                        const lastTextIndex = msg.content
                                            .map((item: any) => item.type)
                                            .lastIndexOf("text");

                                        return msg.content.map((item: any, i: number) => {

                                            if (item.type === "human") {
                                                return <ContentHuman key={i} text={item.text} />;
                                            }

                                            if (item.type === "think") {
                                                const idx = thinkIndex++;
                                                return (
                                                    <ContentThinkStep
                                                        key={i}
                                                        think={item.think}
                                                        index={idx}
                                                    />
                                                );
                                            }

                                            if (item.type === "tool") {
                                                return (
                                                    <ContentToolCall
                                                        key={i}
                                                        toolCall={{
                                                            id: i.toString(),
                                                            name: item.toolName || "tool",
                                                            args: item.toolArgs || {},
                                                            progress: item.toolResponse ? 1 : 0,
                                                            output: item.toolResponse || "Calling tool..."
                                                        }}
                                                    />
                                                );
                                            }

                                            // toolcall(old formt)
                                            if (item.type === "tool_call") {
                                                return (
                                                    <ContentToolCall
                                                        key={i}
                                                        toolCall={item.tool_call}
                                                    />
                                                );
                                            }

                                            // AI
                                            if (item.type === "ai") {

                                                // final AI answer
                                                if (i === lastAiIndex) {
                                                    return (
                                                        <ContentAnswer
                                                            key={i}
                                                            text={item.text}
                                                            question={question}
                                                            isQuestionAllocatedToExpert={
                                                                isQuestionAllocatedToExpert
                                                            }
                                                            navigateToQuestionPage={
                                                                navigateToQuestionPage
                                                            }
                                                        />
                                                    );
                                                }

                                                return (
                                                    <ContentTextStep
                                                        key={i}
                                                        text={item.text}
                                                    />
                                                );
                                            }

                                            // (Old format)
                                            if (item.type === "text") {

                                                if (i === lastTextIndex) {
                                                    return (
                                                        <ContentAnswer
                                                            key={i}
                                                            text={item.text}
                                                            question={question}
                                                            isQuestionAllocatedToExpert={
                                                                isQuestionAllocatedToExpert
                                                            }
                                                            navigateToQuestionPage={
                                                                navigateToQuestionPage
                                                            }
                                                        />
                                                    );
                                                }

                                                return (
                                                    <ContentTextStep
                                                        key={i}
                                                        text={item.text}
                                                    />
                                                );
                                            }

                                            return null;
                                        });
                                    })()
                                    // )
                                }
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Dialog open={isErrorModalOpen} onOpenChange={setIsErrorModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            Chatbot Processing Error
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {chatbotError || "The chatbot encountered an error while processing this message. This could be due to a temporary failure or missing data."}
                        </p>

                    </div>
                    <div className="flex items-center justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setIsErrorModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleGenerateAI}
                            disabled={isGenerating}
                            className="bg-primary text-primary-foreground hover:opacity-90"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    Generate AI Answer
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default MessageDetail;



// --- Types for parsed chatbot text ---
interface AgriSpecialist {
    name: string;
    sourceType: string;
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
// const parseChatbotText = (text: string): ParsedChatbotText => {
//     let workingText = text;
//     // const noticeIdx = workingText.indexOf('\u26A0\uFE0F');
//     // if (noticeIdx !== -1) workingText = workingText.substring(0, noticeIdx).trim();
//     const testingNoticeIndex = workingText.indexOf(
//         "⚠️ *Important Notice (Testing)*"
//     );

//     if (testingNoticeIndex !== -1) {
//         workingText = workingText.substring(0, testingNoticeIndex).trim();
//     }

//     let answerBody = workingText;
//     let sourcesSection = '';
//     const parts = workingText.split(/\n---\n/);
//     if (parts.length > 1) {
//         const lastPart = parts[parts.length - 1].trim();
//         const looksLikeSources = /\|\s*(?:Agri Specialist Name|Source\/PDF Link)/i.test(lastPart);
//         if (looksLikeSources) {
//             answerBody = parts[0].trim();
//             sourcesSection = parts.slice(1).join('\n---\n').trim();
//         }
//     }
//     if (!sourcesSection) {
//         const sourceMarker = workingText.match(/\*?\*?The answer I provided[^*\n]*/i);
//         if (sourceMarker && sourceMarker.index !== undefined) {
//             answerBody = workingText.substring(0, sourceMarker.index).trim();
//             sourcesSection = workingText.substring(sourceMarker.index).trim();
//         }
//     }
//     answerBody = answerBody.replace(/\n---\s*$/, '').trim();

//     const agriSpecialists: AgriSpecialist[] = [];
//     const agriRows = sourcesSection.match(/\|\s*Agri Specialist Name\s*\|\s*Source Link\s*\|[^\n]*\n\|[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n\s*\|[^|]*Source\/PDF|$)/i);
//     if (agriRows) {
//         for (const row of agriRows[1].trim().split('\n').filter((r: string) => r.startsWith('|'))) {
//             const cells = row.split('|').filter((c: string) => c.trim() !== '');
//             if (cells.length >= 2) {
//                 const name = cells[0].trim();
//                 const raw = cells[1].trim();
//                 const links = [...raw.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
//                 if (links.length > 0) {
//                     for (const link of links) {
//                         agriSpecialists.push({ name, sourceType: 'other', sourceLink: link[2] });
//                     }
//                 } else {
//                     // plain URL(s), possibly semicolon-separated
//                     for (const url of raw.split(';').map(s => s.trim()).filter(Boolean)) {
//                         agriSpecialists.push({ name, sourceType: 'other', sourceLink: url });
//                     }
//                 }
//             }
//         }
//     }

//     const pdfSources: PdfSource[] = [];
//     const pdfRows = sourcesSection.match(/\|\s*Source\/PDF Link\s*\|\s*Page Number\s*\|[^\n]*\n\|[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n---|\n\u26A0|$)/i);
//     if (pdfRows) {
//         for (const row of pdfRows[1].trim().split('\n').filter((r: string) => r.startsWith('|'))) {
//             const cells = row.split('|').filter((c: string) => c.trim() !== '');
//             if (cells.length >= 2) {
//                 const lm = cells[0].trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
//                 if (lm) {
//                     pdfSources.push({ name: lm[1], link: lm[2], pages: cells[1].trim(), sourceType: 'other' });
//                 } else {
//                     const raw = cells[0].trim();
//                     const isUrl = /^https?:\/\//.test(raw);
//                     pdfSources.push({
//                         name: isUrl ? cells[1].trim() : raw,
//                         link: isUrl ? raw : '',
//                         pages: isUrl ? '' : cells[1].trim(),
//                         sourceType: 'other',
//                     });
//                 }
//             }
//         }
//     }

//     for (const line of sourcesSection.split('\n')) {
//         if (!line.includes('📺')) continue;
//         const lm = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
//         if (lm) pdfSources.push({ name: lm[1], link: lm[2], pages: '', sourceType: 'other' });
//     }

//     // Extract from tables where cells[1] is entirely a markdown link (e.g. Video Resources table)
//     for (const line of workingText.split('\n')) {
//         if (!line.startsWith('|')) continue;
//         const cells = line.split('|').filter(c => c.trim() !== '');
//         if (cells.length < 2) continue;
//         const lm = cells[1].trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
//         if (!lm) continue;
//         const url = lm[2];
//         if (pdfSources.some(s => s.link === url) || agriSpecialists.some(s => s.sourceLink === url)) continue;
//         pdfSources.push({
//             name: cells[0].trim(),
//             link: url,
//             pages: cells.length > 2 ? cells[2].trim() : '',
//             sourceType: 'other',
//         });
//     }

//     return { answerBody, agriSpecialists, pdfSources };
// }

const parseChatbotText = (text: string): ParsedChatbotText => {
    let workingText = text;
    workingText = workingText.replace(
        /\n*\s*⚠️?\s*\*?\s*Important\s+Notice\s*\(Testing\)\s*\*?\s*⚠️?[\s\S]*$/i,
        ''
    ).trim();

    return {
        answerBody: workingText,
        agriSpecialists: [],
        pdfSources: [],
    };
};;

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
    const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: "pass" | "accept" | "save" | "cancel" | "push-to-gdb"; remark?: string }>({ open: false, type: "pass" });
    const [passRemarkError, setPassRemarkError] = useState("");
    const [pendingApprovalAction, setPendingApprovalAction] = useState<"accept" | "push-to-gdb" | null>(null);

    const { mutateAsync: updateAnswer, isPending: isUpdating } = useUpdateAnswer();
    const { mutateAsync: updateQuestion, isPending: updatingQuestion } = useUpdateQuestion();

    // Only the moderator the question is assigned to (by the moderator-queue cron) may
    // act on it — Pass / Accept / Push to GDB are hidden from everyone else.
    // The backend resolves this against the requesting user (avoids ObjectId
    // serialization mismatches from comparing ids on the client).
    const isAssignedModerator = question?.isAssignedModerator === true;

    useEffect(() => {
        const p = parseChatbotText(text);
        setEditedAnswerBody(p.answerBody);
        setEditedSpecialists(p.agriSpecialists);
        setEditedPdfSources(p.pdfSources);
        setTranslatedText("");
    }, [text]);

    const handleAccept = () => {
        if (!question?._id) { toast.error("Question data is missing."); return; }
        if (question.source !== "AJRASAKHA" && question.source !== "WHATSAPP") { toast.error("Only AJRASAKHA or WHATSAPP answers can be approved."); return; }
        setPendingApprovalAction("accept");
        setEditModalKey(k => k + 1);
        setIsEditModalOpen(true);
    };

    const handlePushToGDB = () => {
        if (!question?._id) {
            toast.error("Question data is missing."); return;
        }
        if (question.source !== "AJRASAKHA" && question.source !== "WHATSAPP") {
            toast.error("Only AJRASAKHA or WHATSAPP answers can be approved."); return;
        }
        if (question.status !== "duplicate") {
            toast.error("Only duplicate questions can be pushed to GDB."); return;
        }
        setPendingApprovalAction("push-to-gdb");
        setEditModalKey(k => k + 1);
        setIsEditModalOpen(true);
    };

    const doApprove = async (flowType?: "accept" | "push-to-gdb") => {
        try {
            const sources: SourceItem[] = [];
            for (const spec of editedSpecialists) {
                if (spec.sourceLink) sources.push({ sourceType: (spec.sourceType || "other") as any, sourceName: spec.name || "chatbot", source: spec.sourceLink });
            }
            for (const pdf of editedPdfSources) {
                if (pdf.link) {
                    const trimmedPages = pdf.pages ? pdf.pages.trim() : "";
                    sources.push({ sourceType: (pdf.sourceType || "other") as any, sourceName: pdf.name || "chatbot", source: pdf.link, page: trimmedPages || undefined });
                }
            }

            if (sources.length === 0) {
                toast.error("At least one source is required to proceed.");
                return;
            }

            const isAcceptFlow = (flowType ?? confirmDialog.type) === "accept";

            await updateAnswer({
                updatedAnswer: editedAnswerBody.trim(),
                sources,
                answerId: undefined,
                questionId: question._id,
                source: question.source,
                isModeratorApproval: isAcceptFlow,
            }),{
                loading:"approving answer...",
                success:isAcceptFlow
                    ? "LLM answer submitted successfully for author review"
                    : "Answer pushed to GDB successfully",
                // error:"Failed to approve the answer. Please try again."
                    error: (error:any) => error.message ? error.message : "Failed to approve the answer. Please try again."
            };
            setApproved(true);

            toast.success(
                isAcceptFlow
                    ? "LLM answer submitted successfully for author review"
                    : "Answer pushed to GDB successfully"
            );
            navigateToQuestionPage();
        } catch (error) {
            console.error("Failed to approve answer:", error);
            toast.error("Failed to approve the answer. Please try again.");
        }
    };

    const handleCancelEdit = () => {
        const p = parseChatbotText(text);
        setEditedAnswerBody(p.answerBody);
        setEditedSpecialists(p.agriSpecialists);
        setEditedPdfSources(p.pdfSources);
        setIsEditModalOpen(false);
        setPendingApprovalAction(null);
    };
    const handleSaveEdit = () => {
        const hasAnySource =
            editedSpecialists.some(s => s.sourceLink?.trim()) ||
            editedPdfSources.some(s => s.link?.trim());
        if (!hasAnySource) {
            toast.error("At least one source is required to proceed.");
            return;
        }
        const action = pendingApprovalAction;
        setIsEditModalOpen(false);
        setPendingApprovalAction(null);
        if (action === "accept" || action === "push-to-gdb") {
            doApprove(action);
        }
    };
    const handleSkip = () => {
        if (!question?.details?.normalised_crop?.trim()) {
            toast.error("This question does not have a normalised crop. Please add the respective crop from the Agri Tech Management section before approving this answer.");
            return;
        }
        setPassRemarkError("");
        setConfirmDialog({ open: true, type: "pass", remark: "" });
    };

    const doSkip = async (remark?: string) => {
        await updateQuestion({ isHidden: true, status: 'pass', _id: question._id!, ...(remark ? { passingRemark: remark } : {}) } as any);
        toast.success("Question has been hidden");
        navigateToQuestionPage();
    };

    const handleConfirm = () => {
        const type = confirmDialog.type;
        const remark = confirmDialog.remark?.trim() || "";
        if (type === "pass" && !remark) {
            setPassRemarkError("Remark is required to pass this question.");
            return;
        }

        setPassRemarkError("");
        setConfirmDialog({ open: false, type: "pass", remark: "" });
        if (type === "pass") { doSkip(remark); }
        else if (type === "accept" || type === "push-to-gdb") {
            doApprove(); // use another to access the latest edited answer and sources
        }
    };

    const renderAnswerBody = (raw: string) => (
        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            <div className="space-y-2">
                {raw.split("\n").map((line, i) => {
                    if (line.trim() === "") return <br key={i} />;

                    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

                    return (
                        <p key={i} className="leading-relaxed">
                            {parts.map((part, pi) => {
                                if (part.startsWith("**") && part.endsWith("**")) {
                                    return (
                                        <strong
                                            key={pi}
                                            className="font-semibold text-foreground"
                                        >
                                            {part.slice(2, -2)}
                                        </strong>
                                    );
                                }

                                if (
                                    part.startsWith("*") &&
                                    part.endsWith("*") &&
                                    !part.startsWith("**")
                                ) {
                                    return (
                                        <em key={pi} className="italic text-foreground/80">
                                            {part.slice(1, -2 + 1)}
                                        </em>
                                    );
                                }

                                return <span key={pi}>{part}</span>;
                            })}
                        </p>
                    );
                })}
            </div>
        </ScrollArea>
    );

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
                                {editedSpecialists.map((spec, idx) => (<tr key={idx} className="border-b border-border last:border-0"><td className="px-3 py-2 text-muted-foreground">{spec.name}</td><td className="px-3 py-2">{spec.sourceLink ? <a href={spec.sourceLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{spec.sourceLink} <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">No link</span>}</td></tr>))}
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
                {approved === null && question && isAssignedModerator && (question.source == "AJRASAKHA" || question.source == "WHATSAPP") && question.status !== "closed" && !question.aiInitialAnswer && !isQuestionAllocatedToExpert && (
                    <div className="w-full flex flex-col gap-3 px-4 py-3 border-t border-border md:flex-row md:items-center md:justify-between">
                        <p className="text-xs text-muted-foreground leading-relaxed md:max-w-[60%]">Once you click on Accept, the LLM-generated answer will be set as the AI answer for this question and sent for moderation as a reference to create the initial answer for the question.</p>
                        <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
                            {
                                question?.isHidden !== true && <Button type="button" variant="outline" size="sm" disabled={updatingQuestion} onClick={handleSkip} className={`gap-2 rounded-xl px-4 ${updatingQuestion ? "cursor-not-allowed opacity-50" : ""}`}>{updatingQuestion ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}{updatingQuestion ? "Passing..." : "Pass"}</Button>
                            }

                            <Button
                                type="button"
                                onClick={handleAccept}
                                size="sm"
                                disabled={isUpdating || !editedAnswerBody.trim()}
                                className="gap-2 rounded-xl px-4 bg-primary text-primary-foreground hover:opacity-90"
                            >
                                {isUpdating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="h-4 w-4" />
                                )}
                                {isUpdating ? "Submitting AI Answer..." : "Allocate Experts"}
                            </Button>

                            {question.status === "duplicate" && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={handlePushToGDB}
                                    disabled={isUpdating || !editedAnswerBody.trim()}
                                    className="gap-2 rounded-xl px-4"
                                >
                                    {isUpdating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    {isUpdating ? "Pushing to GDB..." : "Push to GDB"}
                                </Button>
                            )}

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
                initialTranslatedText={translatedText}
                editedSpecialists={editedSpecialists}
                onSpecialistsChange={setEditedSpecialists}
                editedPdfSources={editedPdfSources}
                onPdfSourcesChange={setEditedPdfSources}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
                saveLabel={
                    pendingApprovalAction === "push-to-gdb"
                        ? "Push to GDB"
                        : pendingApprovalAction === "accept"
                            ? "Approve"
                            : "Save Changes"
                }
            />

            <AlertDialog open={confirmDialog.open} onOpenChange={(open) => {
                if (!open) setPassRemarkError("");
                setConfirmDialog((prev) => open ? { ...prev, open } : { open: false, type: "pass", remark: "" });
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmDialog.type === "pass" && "Pass this question?"}
                            {confirmDialog.type === "accept" && "Accept this answer?"}
                            {confirmDialog.type === "push-to-gdb" && "Push this question to GDB?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.type === "save" && "Are you sure you want to save these changes to the answer?"}
                            {confirmDialog.type === "cancel" && "Are you sure you want to cancel? Any unsaved changes will be lost."}
                            {confirmDialog.type === "pass" && "Are you sure you want to pass this question? It will be hidden from the Question list."}
                            {confirmDialog.type === "accept" && "Are you sure you want to accept this answer? The question will  allocate to task_force team."}
                            {confirmDialog.type === "push-to-gdb" && "Are you sure you want to push this question to the GDB? The question will be marked as closed and will not allocate to experts."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {confirmDialog.type === "pass" && (
                        <div className="px-6 pb-4">
                            <label htmlFor="pass-remark" className="block text-xs font-semibold text-muted-foreground tracking-wider mb-2">
                                Remark<span className="text-red-500 ml-0 mb-4">*</span>
                            </label>
                            <textarea
                                id="pass-remark"
                                value={confirmDialog.remark ?? ""}
                                onChange={(event) => {
                                    setConfirmDialog((prev) => ({ ...prev, remark: event.target.value }));
                                    if (passRemarkError) setPassRemarkError("");
                                }}
                                className={`w-full min-h-[100px] rounded-xl border ${passRemarkError ? "border-destructive" : "border-border"} bg-background px-3 py-3 text-sm text-foreground outline-none resize-none focus:ring-2 focus:ring-primary/30`}
                                placeholder="Enter remark explaining why this question is being passed..."
                            />
                            {passRemarkError && (
                                <p className="mt-2 text-xs text-destructive">{passRemarkError}</p>
                            )}
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Go back</AlertDialogCancel>
                        {confirmDialog.type === "pass" ? (
                            <Button type="button" size="sm" onClick={handleConfirm} className="gap-2 rounded-xl px-4 bg-primary text-primary-foreground hover:opacity-90">
                                <CheckCircle className="h-4 w-4" /> Yes, pass
                            </Button>
                        ) : (
                            <AlertDialogAction onClick={handleConfirm}>
                                Yes, continue
                            </AlertDialogAction>
                        )}
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
    initialTranslatedText?: string;
    saveLabel?: string;
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
    initialTranslatedText,
    saveLabel = "Save Changes",
}: EditAnswerModalProps) => {
    const [pendingAction, setPendingAction] = useState<'save' | 'cancel' | null>(null);
    const [translatedText, setTranslatedText] = useState<string>(initialTranslatedText ?? "");

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

    const isZohoWorkDriveUrl = (url: string): boolean => {
        try {
            const hostname = new URL(url.trim()).hostname.toLowerCase();
            return hostname.includes("zoho") && hostname.includes("workdrive");
        } catch {
            return false;
        }
    };

    const validateSources = (): boolean => {
        for (const spec of editedSpecialists) {
            if (!spec.name.trim()) { toast.error("Each agri specialist must have a name."); return false; }
            if (!spec.sourceLink.trim()) { toast.error("Each agri specialist must have a source URL."); return false; }
            if (!isZohoWorkDriveUrl(spec.sourceLink)) { toast.error("Only Zoho WorkDrive URLs are allowed for sources."); return false; }
        }
        for (const src of editedPdfSources) {
            if (!src.name.trim()) { toast.error("Each reference source must have a name."); return false; }
            if (!src.sourceType.trim()) { toast.error("Each reference source must have a source type selected."); return false; }
            if (!src.link.trim()) { toast.error("Each reference source must have a source URL."); return false; }
            if (!isZohoWorkDriveUrl(src.link)) { toast.error("Only Zoho WorkDrive URLs are allowed for sources."); return false; }
        }
        return true;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[880px] w-full flex flex-col overflow-hidden p-0 max-h-[90vh]">
                {/* Header */}
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" /> Edit Answer
                    </DialogTitle>
                </DialogHeader>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-5 space-y-5">
                        {/* Answer text */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Answer Text</label>
                                <SarvamTranslateDropdown
                                    query={editedAnswerBody}
                                    onTranslate={(result) => setTranslatedText(result)}
                                />
                            </div>
                            <textarea
                                value={translatedText || editedAnswerBody}
                                onChange={(e) => { setTranslatedText(""); onAnswerBodyChange(e.target.value); }}
                                className="w-full h-[280px] rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none resize-none focus:ring-2 focus:ring-primary/30"
                                placeholder="Edit the answer..."
                            />
                        </div>

                        <div className="border-t border-border" />

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
                                        <Select value={spec.sourceType || 'other'} onValueChange={(val) => updateSpecialist(idx, 'sourceType', val)}>
                                            <SelectTrigger className="w-full h-7 text-xs">
                                                <SelectValue placeholder="Select Source Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SOURCE_TYPE_OPTIONS.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
                                        <Select
                                            value={src.sourceType || undefined}
                                            onValueChange={(val) => updatePdfSource(idx, 'sourceType', val)}
                                        >
                                            <SelectTrigger className="w-full h-7 text-xs">
                                                <SelectValue placeholder="Select Source Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SOURCE_TYPE_OPTIONS.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <input type="text" value={src.link} onChange={(e) => updatePdfSource(idx, 'link', e.target.value)} placeholder="Source URL" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                        <input type="text" value={src.pages} onChange={(e) => updatePdfSource(idx, 'pages', e.target.value)} placeholder="Pages (e.g. 12, 13)" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                                    </div>
                                ))}
                                <button type="button" onClick={addPdfSource} className="flex items-center gap-1 text-xs text-primary hover:underline"><span className="text-base leading-none">+</span> Add Source</button>
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
                            <Button type="button" size="sm" onClick={() => { if (validateSources()) onSave(); }} className="gap-2 rounded-xl" disabled={!editedAnswerBody.trim()}>
                                <CheckCircle className="h-4 w-4" /> {saveLabel}
                            </Button>
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




interface ContentHumanProps {
    text: string;
}

const ContentHuman = ({ text }: ContentHumanProps) => {
    return (
        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/10">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground">Farmer Question</span>
            </div>
            <div className="px-4 py-3 text-sm text-foreground/80 whitespace-pre-wrap">
                {text}
            </div>
        </div>
    );
};

interface ContentTextStepProps {
    text: string;
}

const ContentTextStep = ({ text }: ContentTextStepProps) => {
    const [expanded, setExpanded] = useState(false);
    const preview = text.slice(0, 120) + (text.length > 120 ? "…" : "");

    return (
        <div className="rounded-lg border border-border bg-surface/50 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
            >
                <MessageSquareText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary">AI Update</span>
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
                    <div className="pt-3">{text}</div>
                </div>
            )}
        </div>
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




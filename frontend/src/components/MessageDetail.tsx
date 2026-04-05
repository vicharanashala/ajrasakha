import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, User, Mail, Clock, Hash, Brain, Wrench, CheckCircle2, MessageSquareText, CheckCircle, XCircle, Save, Pencil, X } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { toast } from "sonner";
import { Button } from "./atoms/button";
import type { IQuestionFullData, IUser } from "@/types";
import { useGetQuestionMessageDetailsByQuestionId } from "@/hooks/api/question/useGetQuestionMessageDetailsByQuestionId";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";

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
}

const MessageDetail = ({
    question,
}: MessageDetailCardProps) => {
    const [expanded, setExpanded] = useState(false);
    const selectedQuestionId = question?._id || null;

    const {
        data: messageDetails,
        // refetch: refechMessageDetails,
        isLoading,
    } = useGetQuestionMessageDetailsByQuestionId(selectedQuestionId);

    console.log("Fetched message details:", messageDetails);

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
                <Badge variant="secondary" className="text-[10px]">
                    {isLoading ? "Loading…" : expanded && msg ? `ID: ${msg.messageId}` : "View More"}
                </Badge>
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
                                    if (item.type === "think") {
                                        const idx = thinkIndex++;
                                        return <ContentThinkStep key={i} think={item.think} index={idx} />;
                                    }
                                    if (item.type === "tool_call") {
                                        return <ContentToolCall key={i} toolCall={item.tool_call} />;
                                    }
                                    if (item.type === "text") {
                                        return <ContentAnswer key={i} text={item.text} question={question} />;
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



interface ContentAnswerProps {
    text: string;
    question: IQuestionFullData;
}

const ContentAnswer = ({ text, question }: ContentAnswerProps) => {
    const [approved, setApproved] = useState<boolean | null>(null);
    const [editedText, setEditedText] = useState(text);

    const { mutateAsync: updateAnswer, isPending: isEditing } =
        useUpdateAnswer();

    useEffect(() => {
        setEditedText(text);
    }, [text]);

    const handleApprove = async () => {
        if (isEditing) {
            toast.error("Please save or cancel your edits before approving.");
            return;
        }

        if (!editedText.trim()) {
            toast.error("Answer cannot be empty.");
            return;
        }
        if (!question || question._id) {
            toast.error("Question data is missing. Cannot approve the answer.");
            return;
        }
        if (question.source !== "AJRASAKHA") {
            toast.error("Only answers from AJRASAKHA source can be approved.");
            return;
        }

        try {
            await updateAnswer({
                updatedAnswer: editedText.trim(),
                sources: [
                    {
                        sourceType: "MODERATOR_REVIEW",
                        source: "Answer reviewed and approved by moderator",
                    },
                ],
                answerId: undefined,
                questionId: question._id,
                source: "AJRASAKHA",
            });

            setApproved(true);
            toast.success("Answer approved successfully");
        } catch (error) {
            console.error("Failed to approve answer:", error);
            toast.error("Failed to approve the answer. Please try again.");
        }
    };

    const handleEdit = () => {
        setEditedText(text);
    };

    const handleCancelEdit = () => {
        setEditedText(text);
    };

    const handleSaveEdit = () => {
        toast.success("Answer updated successfully");
    };

    const renderText = (raw: string) => {
        const lines = raw.split("\n");
        const elements: React.ReactNode[] = [];
        let tableRows: string[][] = [];
        let inTable = false;

        const flushTable = () => {
            if (tableRows.length === 0) return;

            elements.push(
                <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
                    <table className="w-full text-sm border border-border rounded">
                        <thead>
                            <tr className="bg-surface">
                                {tableRows[0].map((cell, i) => (
                                    <th
                                        key={i}
                                        className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border"
                                    >
                                        {cell.trim()}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.slice(2).map((row, ri) => (
                                <tr key={ri} className="border-b border-border last:border-0">
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="px-3 py-2 text-muted-foreground">
                                            {cell.trim()}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

            tableRows = [];
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith("|")) {
                inTable = true;
                tableRows.push(line.split("|").filter((c) => c.trim() !== ""));
                continue;
            }

            if (inTable) {
                inTable = false;
                flushTable();
            }

            if (line.trim() === "---") {
                elements.push(<hr key={i} className="my-3 border-border" />);
                continue;
            }

            if (line.trim() === "") {
                elements.push(<br key={i} />);
                continue;
            }

            // Bold **text**
            const parts = line.split(/(\*\*[^*]+\*\*)/g);

            elements.push(
                <p key={i} className="leading-relaxed">
                    {parts.map((part, pi) =>
                        part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={pi} className="font-semibold text-foreground">
                                {part.slice(2, -2)}
                            </strong>
                        ) : (
                            <span key={pi}>{part}</span>
                        )
                    )}
                </p>
            );
        }

        if (inTable) flushTable();

        return elements;
    };

    return (
        <div className="rounded-lg border-2 border-info/30 bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-info/5 border-b border-info/20">
                <MessageSquareText className="h-4 w-4 text-info" />
                <span className="text-sm font-semibold text-foreground">Final Answer</span>

                {approved === true && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-success font-medium">
                        <CheckCircle className="h-3.5 w-3.5" /> Approved
                    </span>
                )}

                {approved === false && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-destructive font-medium">
                        <XCircle className="h-3.5 w-3.5" /> Rejected
                    </span>
                )}
            </div>

            <div className="px-4 py-4 text-sm text-foreground/90">
                {isEditing ? (
                    <div className="space-y-3">
                        <textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={12}
                            className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none resize-y min-h-[220px] focus:ring-2 focus:ring-primary/30"
                            placeholder="Edit the final answer..."
                        />

                        <div className="flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCancelEdit}
                                className="gap-2 rounded-xl"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSaveEdit}
                                className="gap-2 rounded-xl"
                            >
                                <Save className="h-4 w-4" />
                                Save Changes
                            </Button>
                        </div>
                    </div>
                ) : (
                    renderText(editedText)
                )}
            </div>

            {approved === null && question && question.isAutoAllocate === false && question.source == "AJRASAKHA" && (
                <div className="w-full flex items-center justify-between gap-4 px-4 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-[65%]">
                        On approval, this answer will be finalized, the question will be marked as closed, and the result will be pushed to the Golden dataset. Please review carefully before approving.
                    </p>

                    <div className="flex items-center gap-2 shrink-0">
                        {!isEditing && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleEdit}
                                className="gap-2 rounded-xl px-4"
                            >
                                <Pencil className="h-4 w-4" />
                                Edit Answer
                            </Button>
                        )}

                        <div className="rounded-2xl px-3 py-2 shrink-0">
                            <Button
                                onClick={handleApprove}
                                size="sm"
                                className="bg-primary hover:bg-success/90 text-success-foreground gap-2 rounded-xl px-4"
                            >
                                <CheckCircle className="h-4 w-4" />
                                Approve
                            </Button>
                        </div>
                    </div>
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




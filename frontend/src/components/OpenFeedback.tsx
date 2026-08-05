import { useState } from "react";
import { ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, User, Mail, Clock, MessageSquare, Check, X } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { useGetOpenFeedback } from "@/hooks/api/question/useGetOpenFeedback";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface OpenFeedbackProps {
    questionId: string | null;
    feedbackId?: string | null;
}

const OpenFeedback = ({ questionId, feedbackId }: OpenFeedbackProps) => {
    const [expanded, setExpanded] = useState(false);
    
    const {
        data: feedbackResponse,
        isLoading,
        error: isError,
        refetch
    } = useGetOpenFeedback(questionId, feedbackId);

    const feedback = feedbackResponse?.data;

    // Hide component completely if there is no feedback (and we're not loading/errored)
    if (!isLoading && !isError && !feedback) {
        return null;
    }

    const isPositive = feedback?.type === "thumbs_up";
    const FeedbackIcon = isPositive ? ThumbsUp : ThumbsDown;
    const iconColor = isPositive ? "text-green-500" : "text-red-500";
    const bgColor = isPositive ? "bg-green-500/10" : "bg-red-500/10";

    const handleAccept = () => {
        toast.success("Feedback accepted successfully");
        refetch();
    };

    const handleReject = () => {
        toast.success("Feedback rejected");
        refetch();
    };

    return (
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

                <div className={`flex h-7 w-7 items-center justify-center rounded-full ${bgColor} ${iconColor} shadow-sm shrink-0`}>
                    <FeedbackIcon className="h-4 w-4" />
                </div>

                <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">Open Feedback</span>
                    <span className="text-xs text-muted-foreground">
                        {expanded ? "Click to collapse" : "Click to expand & view feedback"}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                        {isLoading ? "Loading…" : "View Feedback"}
                    </Badge>
                </div>
            </button>

            {expanded && (
                <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    {isLoading && (
                        <div className="p-5 space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-8 w-2/3" />
                        </div>
                    )}

                    {isError && (
                        <div className="p-5 text-sm text-destructive">Failed to fetch feedback details.</div>
                    )}

                    {!isLoading && !isError && feedback && (
                        <div className="p-5 flex flex-col gap-4">
                            {/* User details header */}
                            <div className="flex items-start gap-4 pb-4 border-b border-border">
                                <Avatar className="h-10 w-10 border border-border">
                                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                        {feedback.userId?.name ? feedback.userId.name[0].toUpperCase() : 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-muted-foreground" /> {feedback.userId?.name || 'Unknown User'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-muted-foreground">
                                        {feedback.userId?.email && (
                                            <span className="flex items-center gap-1.5">
                                                <Mail className="h-3.5 w-3.5" />
                                                {feedback.userId.email}
                                            </span>
                                        )}
                                        {feedback.createdAt && (
                                            <span className="flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDistanceToNow(new Date(typeof feedback.createdAt === 'string' ? feedback.createdAt : feedback.createdAt.$date), { addSuffix: true })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Feedback type badge */}
                            <div className="flex items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className={`${isPositive ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30'} flex items-center gap-1.5 px-3 py-1`}
                                >
                                    <FeedbackIcon className="h-4 w-4" />
                                    {isPositive ? "Thumbs Up" : "Thumbs Down"}
                                </Badge>
                            </div>

                            {/* Predefined option */}
                            {feedback.predefinedOption && (
                                <div className="text-sm flex flex-col gap-1">
                                    <span className="font-semibold text-foreground/80">Predefined Option:</span>
                                    <span className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-muted/50 border border-border/50 text-muted-foreground text-sm font-medium">
                                        {feedback.predefinedOption}
                                    </span>
                                </div>
                            )}

                            {/* Comment */}
                            {feedback.comment && (
                                <div className="text-sm flex flex-col gap-1">
                                    <span className="font-semibold text-foreground/80">Comment:</span>
                                    <span className="text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">
                                        {feedback.comment}
                                    </span>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-3 pt-4 border-t border-border">
                                <Button
                                    onClick={handleAccept}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                                    size="sm"
                                >
                                    <Check className="h-4 w-4" />
                                    Accept
                                </Button>
                                <Button
                                    onClick={handleReject}
                                    variant="outline"
                                    className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:hover:bg-red-500/10"
                                    size="sm"
                                >
                                    <X className="h-4 w-4" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default OpenFeedback;
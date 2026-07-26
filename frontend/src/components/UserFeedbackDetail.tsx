import { useState } from "react";
import { ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, User, Mail, Clock, MessageSquare } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { useGetQuestionFeedback } from "@/hooks/api/question/useGetQuestionFeedback";
import { formatDistanceToNow } from "date-fns";

interface UserFeedbackDetailProps {
    questionId: string | null;
}

const UserFeedbackDetail = ({ questionId }: UserFeedbackDetailProps) => {
    const [expanded, setExpanded] = useState(false);
    
    const {
        data: feedbackResponse,
        isLoading,
        error: isError
    } = useGetQuestionFeedback(questionId);

    const feedback = feedbackResponse?.data?.feedback;

    // Hide component completely if there is no feedback (and we're not loading/errored)
    if (!isLoading && !isError && !feedback) {
        return null;
    }

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

                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 shadow-sm shrink-0">
                    <MessageSquare className="h-4 w-4" />
                </div>

                <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">User Feedback</span>
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
                        <div className="p-5 flex flex-col gap-4 divide-y divide-border">
                            {/* User details header */}
                            {feedbackResponse?.data?.user && (
                                <div className="flex items-start gap-4 pb-4">
                                    <Avatar className="h-10 w-10 border border-border">
                                        <AvatarImage src={feedbackResponse.data.user.avatar || undefined} alt={feedbackResponse.data.user.username} />
                                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                            {feedbackResponse.data.user.username ? feedbackResponse.data.user.username[0].toUpperCase() : 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5 text-muted-foreground" /> {feedbackResponse.data.user.username}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-muted-foreground">
                                            {feedbackResponse.data.user.email && (
                                                <span className="flex items-center gap-1.5">
                                                    <Mail className="h-3.5 w-3.5" />
                                                    {feedbackResponse.data.user.email}
                                                </span>
                                            )}
                                            {feedbackResponse.data.createdAt && (
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {formatDistanceToNow(new Date(feedbackResponse.data.createdAt), { addSuffix: true })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-3 pt-4">
                                <div className="flex items-center gap-2">
                                    {feedback.rating === "thumbsUp" ? (
                                        <Badge
                                            variant="outline"
                                            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30 flex items-center gap-1.5 px-3 py-1"
                                        >
                                            <ThumbsUp className="h-4 w-4" />
                                            Thumbs Up
                                        </Badge>
                                    ) : feedback.rating === "thumbsDown" ? (
                                        <Badge
                                            variant="outline"
                                            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30 flex items-center gap-1.5 px-3 py-1"
                                        >
                                            <ThumbsDown className="h-4 w-4" />
                                            Thumbs Down
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="capitalize">{feedback.rating}</Badge>
                                    )}
                                </div>
                                {feedback.tag && (
                                    <div className="text-sm flex flex-col gap-1">
                                        <span className="font-semibold text-foreground/80">Tag:</span>
                                        <span className="text-muted-foreground bg-muted/50 p-2 rounded-md border border-border/50">
                                            {feedback.tag}
                                        </span>
                                    </div>
                                )}
                                {feedback.text && (
                                    <div className="text-sm flex flex-col gap-1">
                                        <span className="font-semibold text-foreground/80">Feedback:</span>
                                        <span className="text-muted-foreground bg-muted/50 p-2 rounded-md border border-border/50 whitespace-pre-wrap">
                                            {feedback.text}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UserFeedbackDetail;

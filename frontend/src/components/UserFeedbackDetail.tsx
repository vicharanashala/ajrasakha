import { useState } from "react";
import { ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, User, Mail, Clock, MessageSquare } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { useGetQuestionFeedback } from "@/hooks/api/question/useGetQuestionFeedback";
import { useFeedbackAction } from "@/hooks/api/question/useFeedbackAction";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./atoms/dialog";
import { Textarea } from "./atoms/textarea";
import { Label } from "./atoms/label";

interface UserFeedbackDetailProps {
    questionId: string | null;
    currentUser: {
        feedbacksAssigned?: string[];
    } | null;
}

const UserFeedbackDetail = ({ questionId, currentUser }: UserFeedbackDetailProps) => {
    const [expanded, setExpanded] = useState(false);
    
    // Check if current user is assigned to review this feedback
    const isAssignedReviewer = !!(
        currentUser?.feedbacksAssigned &&
        questionId &&
        currentUser.feedbacksAssigned.includes(questionId)
    );
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'accept' | 'reject' | null>(null);
    const [reason, setReason] = useState("");
    
    const {
        data: feedbackResponse,
        isLoading,
        error: isError,
        refetch
    } = useGetQuestionFeedback(questionId);
    
    const { mutate: handleFeedbackAction, isPending: isSubmitting } = useFeedbackAction();
    
    const feedback = feedbackResponse?.data?.feedback;
    
    // Open action modal
    const openActionModal = (action: 'accept' | 'reject') => {
        setModalAction(action);
        setReason("");
        setIsModalOpen(true);
    };
    
    // Handle submit action
    const handleSubmit = () => {
        if (!feedback || !questionId || !reason.trim()) return;
        
        handleFeedbackAction({
            questionId,
            feedbackId: feedback._id?.toString() || "",
            action: modalAction!,
            reason: reason.trim(),
            source: 'WEB_APPLICATION', // Always send WEB_APPLICATION for this component
        }, {
            onSuccess: () => {
                toast.success(`Feedback ${modalAction}ed successfully`);
                setIsModalOpen(false);
                setReason("");
                refetch?.();
            },
            onError: () => {
                toast.error(`Failed to ${modalAction} feedback`);
            },
        });
    };

    // Hide component completely if there is no feedback (and we're not loading/errored)
    if (!isLoading && !isError && !feedback) {
        return null;
    }

    return (
        <>
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
                            
                            {/* Accept/Reject buttons - only show for open status and assigned reviewer */}
                            {isAssignedReviewer && (
                                <div className="flex items-center gap-3 pt-4 mt-4 border-t border-border">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openActionModal('accept')}
                                        className="flex-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800 hover:border-green-300 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30 dark:hover:bg-green-500/20"
                                    >
                                        <ThumbsUp className="h-4 w-4 mr-1" />
                                        Accept
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openActionModal('reject')}
                                        className="flex-1 bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800 hover:border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/20"
                                    >
                                        <ThumbsDown className="h-4 w-4 mr-1" />
                                        Reject
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Reason Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {modalAction === 'accept' ? 'Accept' : 'Reject'} Feedback
                    </DialogTitle>
                    <DialogDescription>
                        Please provide a reason for {modalAction === 'accept' ? 'accepting' : 'rejecting'} this feedback.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Textarea
                            id="reason"
                            placeholder={`Enter your reason for ${modalAction === 'accept' ? 'accepting' : 'rejecting'} this feedback...`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            className="resize-none"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setIsModalOpen(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !reason.trim()}
                        className={modalAction === 'accept' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
            </>
        );
};

export default UserFeedbackDetail;

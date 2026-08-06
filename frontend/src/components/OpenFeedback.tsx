import { useState } from "react";
import { ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, User, Mail, Clock, MessageSquare, Check, X, ChevronLeft, ChevronUp } from "lucide-react";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Skeleton } from "./atoms/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { useGetOpenFeedback } from "@/hooks/api/question/useGetOpenFeedback";
import { useFeedbackAction } from "@/hooks/api/question/useFeedbackAction";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { IUser } from "@/types";
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

interface OpenFeedbackProps {
    questionId: string | null;
    currentUser: IUser | null;
}

const OpenFeedback = ({ questionId, currentUser }: OpenFeedbackProps) => {
    // Check if user should see this component:
    // 1. User is admin (can see all)
    // 2. User has this questionId in their feedbacksAssigned array
    const canViewFeedback = currentUser?.role === "admin" || 
        (currentUser?.feedbacksAssigned && questionId && currentUser.feedbacksAssigned.includes(questionId));
    
    // Don't render if user doesn't have access
    if (!canViewFeedback) {
        return null;
    }

    const [expanded, setExpanded] = useState(false);
    const [page, setPage] = useState(1);
    const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'accept' | 'reject' | null>(null);
    const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    
    const {
        data: feedbackResponse,
        isLoading,
        error: isError,
        refetch
    } = useGetOpenFeedback(questionId, page, 5);

    const { mutate: handleFeedbackAction, isPending: isSubmitting } = useFeedbackAction();

    const feedbacks = feedbackResponse?.data;
    const totalPages = feedbackResponse?.totalPages || 1;
    const totalCount = feedbackResponse?.totalCount || 0;

    // Hide component completely if there is no feedback (and we're not loading/errored)
    if (!isLoading && !isError && (!feedbacks || feedbacks.length === 0)) {
        return null;
    }

    const openActionModal = (feedbackId: string, action: 'accept' | 'reject') => {
        setSelectedFeedbackId(feedbackId);
        setModalAction(action);
        setReason("");
        setIsModalOpen(true);
    };

    const onSubmitSuccess = (action: 'accept' | 'reject') => {
        toast.success(`Feedback ${action}ed successfully`);
        setIsModalOpen(false);
        setReason("");
        setSelectedFeedbackId(null);
        setModalAction(null);
        refetch();
    };

    const onSubmitError = (error: Error) => {
        toast.error(error.message || "Failed to process feedback action");
    };

    const handleSubmit = () => {
        if (!selectedFeedbackId || !modalAction || !reason.trim()) {
            toast.error("Please provide a reason");
            return;
        }

        if (!questionId) {
            toast.error("Question ID is missing");
            return;
        }

        handleFeedbackAction(
            { questionId, feedbackId: selectedFeedbackId, action: modalAction, reason },
            { onSuccess: () => onSubmitSuccess(modalAction), onError: onSubmitError }
        );
    };

    const handleAccept = (feedbackId: string) => {
        openActionModal(feedbackId, 'accept');
    };

    const handleReject = (feedbackId: string) => {
        openActionModal(feedbackId, 'reject');
    };

    const toggleFeedback = (feedbackId: string) => {
        setExpandedFeedbackId(expandedFeedbackId === feedbackId ? null : feedbackId);
    };

    const renderFeedbackItem = (feedback: any, index: number) => {
        const isPositive = feedback.type === "thumbs_up";
        const FeedbackIcon = isPositive ? ThumbsUp : ThumbsDown;
        const iconColor = isPositive ? "text-green-500" : "text-red-500";
        const bgColor = isPositive ? "bg-green-500/10" : "bg-red-500/10";
        const isExpanded = expandedFeedbackId === feedback._id.$oid;

        return (
            <div key={feedback._id.$oid} className="border border-border rounded-lg overflow-hidden">
                {/* Feedback header - clickable to expand */}
                <button
                    onClick={() => toggleFeedback(feedback._id.$oid)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-all duration-200"
                >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${bgColor} ${iconColor} shadow-sm shrink-0`}>
                        <FeedbackIcon className="h-4 w-4" />
                    </div>

                    <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                                Feedback {index + 1}
                            </span>
                            <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0.5 ${isPositive ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400'}`}
                            >
                                {isPositive ? "Thumbs Up" : "Thumbs Down"}
                            </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <User className="h-3 w-3" />
                            {feedback.userId?.name || 'Unknown User'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground hidden sm:block">
                            {formatDistanceToNow(new Date(typeof feedback.createdAt === 'string' ? feedback.createdAt : feedback.createdAt.$date), { addSuffix: true })}
                        </span>
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="px-4 py-4 bg-muted/20 border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* User details */}
                        <div className="flex items-start gap-3 pb-4 border-b border-border mb-4">
                            <Avatar className="h-10 w-10 border border-border">
                                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                    {feedback.userId?.name ? feedback.userId.name[0].toUpperCase() : 'U'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                        <User className="h-3.5 w-3.5 text-muted-foreground" /> {feedback.userId?.name || 'Unknown User'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
                                    {feedback.userId?.email && (
                                        <span className="flex items-center gap-1.5">
                                            <Mail className="h-3.5 w-3.5" />
                                            {feedback.userId.email}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5" />
                                        {formatDistanceToNow(new Date(typeof feedback.createdAt === 'string' ? feedback.createdAt : feedback.createdAt.$date), { addSuffix: true })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        {/* Predefined option */}
                        {feedback.predefinedOption && (
                            <div className="text-sm flex flex-col gap-1 mb-4">
                                <span className="font-semibold text-foreground/80">Predefined Option:</span>
                                <span className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-muted/50 border border-border/50 text-muted-foreground text-sm font-medium">
                                    {feedback.predefinedOption}
                                </span>
                            </div>
                        )}

                        {/* Comment */}
                        {feedback.comment && (
                            <div className="text-sm flex flex-col gap-1 mb-4">
                                <span className="font-semibold text-foreground/80">Comment:</span>
                                <span className="text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">
                                    {feedback.comment}
                                </span>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 pt-2">
                            <Button
                                onClick={() => handleAccept(feedback._id.$oid)}
                                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                                size="sm"
                            >
                                <Check className="h-4 w-4" />
                                Accept
                            </Button>
                            <Button
                                onClick={() => handleReject(feedback._id.$oid)}
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
        );
    };

    return (
        <>
            <div className="relative w-full rounded-xl p-[1px] overflow-hidden">
                {/* Animated border glow */}
                <div className="absolute inset-0 rounded-xl bg-primary animate-pulse opacity-80 h-19" />

                {/* Soft glow layer */}
                <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md h-19" />

                {/* Main expand/collapse button */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="relative z-10 w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-card border border-transparent hover:shadow-md transition-all duration-300 group"
                >
                    {expanded ? (
                        <ChevronDown className="h-5 w-5 text-primary shrink-0 transition-transform" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-primary shrink-0 transition-transform" />
                    )}

                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 shadow-sm shrink-0">
                        <MessageSquare className="h-4 w-4" />
                    </div>

                    <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-foreground">Open Feedbacks</span>
                        <span className="text-xs text-muted-foreground">
                            {expanded ? "Click to collapse" : `${totalCount} feedback${totalCount !== 1 ? 's' : ''} found`}
                        </span>
                    </div>

                    <Badge variant="secondary" className="text-[10px]">
                        {isLoading ? "Loading…" : "View Feedbacks"}
                    </Badge>
                </button>

                {/* Expanded content */}
                {expanded && (
                    <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                        {isLoading && (
                            <div className="p-5 space-y-3">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        )}

                        {isError && (
                            <div className="p-5 text-sm text-destructive">Failed to fetch feedback details.</div>
                        )}

                        {!isLoading && !isError && feedbacks && (
                            <div className="flex flex-col divide-y divide-border">
                                {feedbacks.map((feedback, index) => renderFeedbackItem(feedback, index))}
                            </div>
                        )}

                        {/* Pagination controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                                <div className="text-xs text-muted-foreground">
                                    Page {page} of {totalPages}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setPage(p => Math.max(1, p - 1));
                                            setExpandedFeedbackId(null);
                                        }}
                                        disabled={page === 1 || isLoading}
                                        className="h-8 px-2"
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Prev
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setPage(p => Math.min(totalPages, p + 1));
                                            setExpandedFeedbackId(null);
                                        }}
                                        disabled={page === totalPages || isLoading}
                                        className="h-8 px-2"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
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

export default OpenFeedback;
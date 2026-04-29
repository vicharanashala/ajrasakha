import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { useReplaceQueueExpert } from "@/hooks/api/question/useReplaceQueueExpert";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { Loader2, User, UserPlus, X, AlertTriangle, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/atoms/badge";
import { TimerDisplay } from "@/components/timer-display";

interface ReallocateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string;
  questionTitle: string;
  levelIndex: number;
  levelName: string;
  time: string;
  isAuthor?: boolean;
  onSuccess?: () => void;
}

export function ReallocateModal({
  open,
  onOpenChange,
  questionId,
  questionTitle,
  levelIndex,
  levelName,
  time,
  isAuthor,
  onSuccess,
}: ReallocateModalProps) {
  const [selectedExpert, setSelectedExpert] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [reasonForChange, setReasonForChange] = useState("");
  const [showFullQuestion, setShowFullQuestion] = useState(false);

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { data: questionData, isLoading: isQuestionLoading } = useGetQuestionFullDataById(
    open ? questionId : null
  );
  const { mutateAsync: replaceQueueExpert, isPending: replacingExpert } =
    useReplaceQueueExpert();

  const queue = questionData?.data.submission.queue || [];
  const question = questionData?.data;

  const experts = useMemo(() => {
    if (!usersData?.users) return [];
    const expertsIdsInQueue = new Set(queue.map((expert) => expert._id));
    return usersData.users.filter(
      (user) => user.role === "expert" && !expertsIdsInQueue.has(user._id)
    );
  }, [usersData, queue]);

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectExpert = (expertId: string) => {
    setSelectedExpert((prev) => (prev === expertId ? null : expertId));
  };

  const handleSubmit = async () => {
    try {
      if (!question) {
        toast.error("Question data not available");
        return;
      }
      if (question.status !== "open" && question.status !== "delayed") {
        toast.error(
          "This question is currently being reviewed or has been closed. Please check back later!"
        );
        return;
      }
      if (question.isOnHold) {
        toast.error("This question is on hold. Release Hold to add experts.");
        return;
      }
      if (!selectedExpert) {
        toast.error("Please select an expert to replace with");
        return;
      }
      if (!reasonForChange || reasonForChange.trim() === "") {
        toast.error("Please provide a reason for reallocation");
        return;
      }

      await replaceQueueExpert({
        questionId: questionId,
        levelIndex: levelIndex,
        newExpertId: selectedExpert,
        isAuthor: isAuthor,
        reasonForChange: reasonForChange.trim(),
      });
      setSelectedExpert(null);
      setSearchTerm("");
      setReasonForChange("");
      onOpenChange(false);
      onSuccess?.();
      toast.success("Expert replaced successfully");
    } catch (error: any) {
      console.error("Error allocating experts:", error);
      toast.error(
        error?.message || "Failed to allocate experts. Please try again."
      );
    }
  };

  const handleCancel = () => {
    setSelectedExpert(null);
    setSearchTerm("");
    setReasonForChange("");
    onOpenChange(false);
  };

  const currentExpert = queue[levelIndex];


  // Find the most recently allocated expert based on history
  const mostRecentExpertIndex = useMemo(() => {
    
    if (!question?.submission?.history || question.submission.history.length === 0) {
      return 0; // Author is the first and most recent if no history
    }
    
    // The most recent allocation is the last one in history
    // We need to find which queue position corresponds to the most recent history entry
    const lastHistoryEntry = question.submission.history[question.submission.history.length - 1];
    
    if (lastHistoryEntry?.updatedBy?._id) {
      const recentIndex = queue.findIndex(expert => expert._id === lastHistoryEntry.updatedBy._id);
      return recentIndex >= 0 ? recentIndex : 0;
    }
    
    return 0;
  }, [queue, question?.submission?.history]);

  // Truncate question text for display
  const truncateText = (text: string, maxLength: number = 150) => {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl h-[90vh] p-0 flex flex-col overflow-hidden">
        {/* Header - Fixed */}
        <div className="p-4 border-b flex-shrink-0 space-y-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <span>Reallocate Experts</span>
          </DialogTitle>

          {/* Reason for Reallocation */}
          <div>
            <Label
              htmlFor="reason-for-change"
              className="text-sm font-medium text-foreground"
            >
              Reason for Reallocation <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="reason-for-change"
              placeholder="Enter the reason for reallocating this review (e.g., expert unavailable, exceeded time limit, etc.)"
              value={reasonForChange}
              onChange={(e) => setReasonForChange(e.target.value)}
              className="mt-1 w-full min-h-[100px] px-3 py-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reasonForChange.length}/500 characters
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
            {/* Question Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              {/* Question Title Section */}
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">Question:</span>
                    <div className="text-sm mt-1">
                      {showFullQuestion ? questionTitle : truncateText(questionTitle)}
                      {questionTitle && questionTitle.length > 150 && (
                        <button
                          type="button"
                          onClick={() => setShowFullQuestion(!showFullQuestion)}
                          className="ml-2 text-primary hover:text-primary/80 text-xs font-medium"
                        >
                          {showFullQuestion ? "View Less" : "View More"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status and Current Expert Section */}
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="flex items-center gap-3">
                    Pending :- 
                  <TimerDisplay timer={time} status="open" className="border border-red-300 px-3 rounded-full text-red-500 [&>span]:!text-red-500" source="AJRASAKHA" size="md" showDays={true} />
                </div>
              </div>
            </div>

            {/* Queue Info */}
            <div className="rounded-lg p-4 bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h3 className="text-sm font-semibold text-foreground">Expert Queue</h3>
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                    {queue?.length || 0} Active
                  </span>
                </div>
                {mostRecentExpertIndex >= 0 && queue?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-green-600 font-medium">●</span> Most Recent
                  </div>
                )}
              </div>
              
              <div className="space-y-2 ">
                {queue && queue.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {queue.map((expert, idx) => (
                      <div
                        key={expert._id}
                        className={`relative group transition-all duration-200 ${
                          idx === mostRecentExpertIndex 
                            ? "transform scale-105" 
                            : "hover:transform hover:scale-105"
                        }`}
                      >
                        <Badge
                          variant={idx === mostRecentExpertIndex ? "default" : "secondary"}
                          className={`text-xs px-3 py-1.5 transition-all duration-200 ${
                            idx === mostRecentExpertIndex 
                              ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-600 shadow-lg hover:shadow-xl" 
                              : "backdrop-blur-sm"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{idx + 1}.</span>
                            <span>{expert.name?.slice(0, 15) || expert?.userName?.slice(0, 15)}</span>
                          </div>
                        </Badge>
                        
                        {/* Tooltip for full name */}
                        {expert.name && expert.name.length > 15 && (
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {expert.name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <UserPlus className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium">No experts in queue</p>
                    <p className="text-xs mt-1">Experts will appear here when allocated</p>
                  </div>
                )}
              </div>
              
              {queue && queue.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Queue Position: {mostRecentExpertIndex + 1} of {queue.length}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Active Review
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Input
                type="text"
                placeholder="Search experts by name, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Expert List */}
            <div className="space-y-2">
              {isUsersLoading || isQuestionLoading ? (
                <div className="flex justify-center items-center py-8 text-muted-foreground">
                  <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-sm">Loading...</span>
                  </div>
                </div>
              ) : filteredExperts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                  <p className="text-sm font-medium">No experts available</p>
                  <p className="text-xs text-muted-foreground">
                    All experts are already in the queue.
                  </p>
                </div>
              ) : (
                <RadioGroup
                  value={selectedExpert || ""}
                  onValueChange={(value) => handleSelectExpert(value)}
                  className="gap-2"
                >
                {filteredExperts.map((expert) => (
                  <div
                    key={expert._id}
                    className={`flex items-start space-x-3 p-2.5 rounded-lg border transition-colors ${
                      expert.isBlocked
                        ? "opacity-50 cursor-not-allowed bg-muted"
                        : "hover:bg-muted/50 cursor-pointer"
                    }`}
                    onClick={() =>
                      !expert.isBlocked && handleSelectExpert(expert._id)
                    }
                  >
                    <div className="p-1.5 rounded bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>

                    <RadioGroupItem
                      value={expert._id}
                      id={`expert-${expert._id}`}
                      disabled={expert.isBlocked}
                    className="mt-1"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />

                    <Label
                      htmlFor={`expert-${expert._id}`}
                      className="font-normal cursor-pointer flex-1 w-full"
                    >
                      <div className="flex justify-between items-center w-full">
                        <div className="flex flex-col">
                          <div
                            className="font-medium text-sm truncate"
                            title={expert.userName}
                          >
                            {expert?.userName?.slice(0, 40)}
                            {expert?.userName?.length > 40 ? "..." : ""}
                          </div>
                          <div
                            className="text-xs text-muted-foreground truncate"
                            title={expert.email}
                          >
                            {expert?.email?.slice(0, 40)}
                            {expert?.email?.length > 40 ? "..." : ""}
                          </div>
                          {expert.isBlocked && (
                            <span className="mt-1 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">
                              Blocked
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground flex-shrink-0 ml-2 hidden sm:block">
                          {expert.preference?.domain &&
                          expert.preference.domain !== "all"
                            ? expert.preference.domain
                            : "Agriculture Expert"}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
                </RadioGroup>
              )}
            </div>
          </div>
          </ScrollArea>
        </div>

        {/* Footer - Fixed */}
        <div className="p-4 border-t flex gap-2 justify-end flex-shrink-0 bg-background">
          <Button variant="outline" onClick={handleCancel} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={replacingExpert || !selectedExpert || !reasonForChange.trim()}
            size="sm"
          >
            {replacingExpert && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {replacingExpert ? "Replacing..." : "Replace Expert"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

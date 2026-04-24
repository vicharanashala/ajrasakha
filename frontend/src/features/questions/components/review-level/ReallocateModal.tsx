import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group";
import { useReplaceQueueExpert } from "@/hooks/api/question/useReplaceQueueExpert";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { Loader2, User, UserPlus, X, AlertTriangle, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/atoms/badge";

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

      console.log("from frontend", levelIndex, "isAuthor:", isAuthor);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg md:max-w-xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
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
              className="mt-1 w-full min-h-[60px] px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reasonForChange.length}/500 characters
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Question Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 mb-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground">Question:</span>{" "}
              {questionTitle}
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-red-500" />
                <span className="text-red-600 font-medium">
                  {levelName} delayed: {time}
                </span>
              </span>
              {currentExpert && (
                <span className="text-muted-foreground">
                  Current: {currentExpert.name}
                </span>
              )}
            </div>
          </div>

          {/* Queue Info */}
          {queue.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              <span className="text-xs text-muted-foreground mr-1">
                Current Queue ({queue.length}):
              </span>
              {queue.map((expert, idx) => (
                <Badge
                  key={expert._id}
                  variant={idx === levelIndex ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {idx + 1}. {expert.name?.slice(0, 10)}
                </Badge>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
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

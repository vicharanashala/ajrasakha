import { Button } from "@/components/atoms/button";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Switch } from "@/components/atoms/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { useAllocateExpert } from "@/hooks/api/question/useAllocateExperts";
import { useToggleAutoAllocateQuestion } from "@/hooks/api/question/useToggleAutoAllocateQuestion";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import type { IQuestionFullData, ISubmission, IUser } from "@/types";
import { DialogTitle } from "@radix-ui/react-dialog";
import { Info, Loader2, User, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AllocationQueueHeaderProps {
  question: IQuestionFullData;
  queue?: ISubmission["queue"];
  currentUser: IUser;
}

export const AllocationQueueHeader = ({
  question,
  queue = [],
  currentUser,
}: AllocationQueueHeaderProps) => {
  const [autoAllocate, setAutoAllocate] = useState(question.isAutoAllocate);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { mutateAsync: allocateExpert, isPending: allocatingExperts } =
    useAllocateExpert();
  const { mutateAsync: toggleAutoAllocateStatus, isPending: changingStatus } =
    useToggleAutoAllocateQuestion();

  const expertsIdsInQueue = new Set(queue.map((expert) => expert._id));

  const experts =
    usersData?.users.filter(
      (user) => user.role === "expert" && !expertsIdsInQueue.has(user._id)
    ) || [];

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = async (checked: boolean) => {
    try {
      await toggleAutoAllocateStatus(question._id);
      setAutoAllocate(checked);
    } catch (error) {
      console.error("Error toggling auto-allocate:", error);
      toast.error("Error toggling auto-allocate. Please try again.");
    }
  };

  const handleSelectExpert = (expertId: string) => {
    setSelectedExperts((prev) =>
      prev.includes(expertId)
        ? prev.filter((id) => id !== expertId)
        : [...prev, expertId]
    );
  };

  const handleSubmit = async () => {
    try {
      if (question.status !== "open" && question.status !== "delayed") {
        toast.error(
          "This question is currently being reviewed or has been closed. Please check back later!"
        );
        return;
      }
      await allocateExpert({
        questionId: question._id,
        experts: selectedExperts,
      });
      setSelectedExperts([]);
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("Error allocating experts:", error);
      toast.error(
        error?.message || "Failed to allocate experts. Please try again."
      );
    }
  };

  const handleCancel = () => {
    setSelectedExperts([]);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-6 border-b border-border">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* LEFT SECTION */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              Allocation Queue
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {queue?.length} {queue?.length === 1 ? "expert" : "experts"} in
              queue
            </p>
          </div>
        </div>

        {/* RIGHT SECTION */}
        {currentUser.role !== "expert" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            {/* Auto-Allocate Block */}
            <div className="flex items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm w-full sm:w-auto">
              <Switch
                id="auto-allocate"
                checked={autoAllocate}
                onCheckedChange={handleToggle}
              />
              <Label
                htmlFor="auto-allocate"
                className="cursor-pointer font-medium text-sm flex items-center gap-2"
              >
                {changingStatus && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                Auto-allocate Experts
              </Label>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1.5 text-sm">
                      <p>
                        <strong>ON:</strong> Questions are automatically
                        assigned to available experts…
                      </p>
                      <p>
                        <strong>OFF:</strong> You must manually add experts…
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Select Experts Button */}
            {!autoAllocate && (
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" className="gap-2 w-full sm:w-auto">
                    <UserPlus className="w-4 h-4" />
                    Select Experts
                  </Button>
                </DialogTrigger>

                <DialogContent
                  className="
                          w-[95vw]                 
                          sm:max-w-xl              
                          md:max-w-4xl             
                          lg:max-w-6xl             
                          max-h-[85vh]             
                          min-h-[60vh]             
                          overflow-hidden           
                          p-4                       
                        "
                >
                  <DialogHeader className="space-y-4">
                    <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                      <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                        <UserPlus className="w-5 h-5 text-primary" />
                      </div>
                      Select Experts Manually
                    </DialogTitle>

                    <div className="mt-1 relative">
                      <Input
                        type="text"
                        placeholder="Search experts by name, email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary border"
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
                  </DialogHeader>

                  <ScrollArea
                    className="
                              max-h-[50vh]      
                              md:max-h-[60vh]
                              pr-2
                            "
                  >
                    <div className="space-y-3">
                      {isUsersLoading && (
                        <div className="flex justify-center items-center py-10 text-muted-foreground">
                          <div className="flex flex-col items-center space-y-2">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm">Loading experts...</span>
                          </div>
                        </div>
                      )}

                      {!isUsersLoading && filteredExperts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                          <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                          <p className="text-sm font-medium">
                            No experts available
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Try refreshing or check back later.
                          </p>
                        </div>
                      )}

                      {!isUsersLoading &&
                        filteredExperts.map((expert) => (
                          <div
                            key={expert._id}
                            className={`flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                              expert.isBlocked
                                ? "blur-[0px] cursor-not-allowed"
                                : "hover:bg-muted/50"
                            }
  `}
                          >
                            <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary" />
                            </div>

                            <Checkbox
                              id={`expert-${expert._id}`}
                              checked={selectedExperts.includes(expert._id)}
                              onCheckedChange={() =>
                                handleSelectExpert(expert._id)
                              }
                              disabled={expert.isBlocked}
                              className="mt-1"
                            />
                            {/* {expert.isBlocked ? 'Blocked' : ''} */}

                            <Label
                              htmlFor={`expert-${expert._id}`}
                              className="font-normal cursor-pointer flex-1 w-full"
                            >
                              <div className="flex justify-between items-center w-full">
                                <div className="flex flex-col">
                                  <div
                                    className="font-medium truncate"
                                    title={expert.userName}
                                  >
                                    {expert?.userName?.slice(0, 48)}
                                    {expert?.userName?.length > 48 ? "..." : ""}
                                  </div>
                                  <div
                                    className="text-xs text-muted-foreground truncate"
                                    title={expert.email}
                                  >
                                    {expert?.email?.slice(0, 48)}
                                    {expert?.email?.length > 48 ? "..." : ""}
                                  </div>
                                  {expert.isBlocked && (
                                    <span className="mt-1 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">
                                      Blocked
                                    </span>
                                  )}
                                </div>

                                <div className="text-sm text-muted-foreground flex-shrink-0 ml-2 hidden md:block">
                                  {expert.preference?.domain &&
                                  expert.preference.domain !== "all"
                                    ? expert.preference.domain
                                    : "Agriculture Expert"}
                                </div>
                              </div>
                            </Label>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>

                  <DialogFooter className="flex gap-2 justify-end pt-4">
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      className="hidden md:block"
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={allocatingExperts}>
                      {allocatingExperts && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {allocatingExperts
                        ? "Allocating..."
                        : `Submit (${selectedExperts.length} selected)`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

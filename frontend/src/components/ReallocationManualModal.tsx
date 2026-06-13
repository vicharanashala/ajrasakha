import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./atoms/dialog";
import { Button } from "./atoms/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "./atoms/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./atoms/select";
import { useGetReallocationPreview } from "../hooks/api/question/useGetReallocationPreview";
import { useManualReallocate } from "../hooks/api/question/useManualReallocate";
import { Loader2, AlertCircle, Zap } from "lucide-react";
import { Badge } from "./atoms/badge";
import { toast } from "@/shared/components/toast";

interface ReallocationManualModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "inactive" | "escalation";
}

export const ReallocationManualModal = ({
  open,
  onOpenChange,
  type,
}: ReallocationManualModalProps) => {
  const { data, isLoading, isError, error, refetch } = useGetReallocationPreview(type, open);
  const { mutateAsync: reallocate, isPending: isSubmitting } = useManualReallocate();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedExpertFilter, setSelectedExpertFilter] = useState<string>("all");

  useEffect(() => {
    if (open) {
      setAssignments({});
      setSelectedExpertFilter("all");
    } else {
      // Ensure pointer events are restored after modal closes
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = "auto";
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Extract unique experts for the filter dropdown
  const uniqueExperts = React.useMemo(() => {
    if (!data?.questions) return [];
    const expertsMap = new Map<string, string>();
    data.questions.forEach((q: any) => {
      if (q.currentExpertId && q.currentExpertName) {
        expertsMap.set(q.currentExpertId, q.currentExpertName);
      }
    });
    return Array.from(expertsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data?.questions]);

  // Filter questions based on selection
  const filteredQuestions = React.useMemo(() => {
    if (!data?.questions) return [];
    if (selectedExpertFilter === "all") return data.questions;
    return data.questions.filter((q: any) => q.currentExpertId === selectedExpertFilter);
  }, [data?.questions, selectedExpertFilter]);

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = "auto";
    };
  }, []);

  const handleSelect = (submissionId: string, expertId: string) => {
    const question = data?.questions?.find((q: any) => q.submissionId === submissionId);
    if (question?.queue?.includes(expertId)) {
      toast.error("This expert is already in the queue for this question.");
      return;
    }
    setAssignments((prev) => ({ ...prev, [submissionId]: expertId }));
  };

  const handleAutoFill = () => {
    if (!data?.questions || !data?.activeExperts || data.activeExperts.length === 0) {
      toast.warning("No available experts to suggest.");
      return;
    }

    const newAssignments: Record<string, string> = { ...assignments };
    // 1. Sort experts by reputation score (ascending) to prioritize low scores
    const sortedExperts = [...data.activeExperts].sort((a, b) => 
      (a.reputation_score || 0) - (b.reputation_score || 0)
    );

    const numTasks = data.questions.length;
    const numExperts = sortedExperts.length;
    const isOversaturated = numTasks > numExperts * 5;
    const MAX_TASKS_PER_EXPERT = 5;
    
    // Track how many tasks we've assigned to each expert in this session
    const expertAssignmentCount: Record<string, number> = {};
    
    // Initialize counts with existing assignments
    Object.values(newAssignments).forEach(expertId => {
      expertAssignmentCount[expertId] = (expertAssignmentCount[expertId] || 0) + 1;
    });

    let assignedCount = 0;

    data.questions.forEach((q: any) => {
      // Skip if already assigned manually
      if (newAssignments[q.submissionId]) return;

      // Ensure expert IDs in queue are strings for comparison
      const queueIds = (q.queue || []).map((id: any) => id.toString());

      // Find an expert who:
      // 1. Is NOT in the current queue (prevent duplicates)
      // 2. Either we are oversaturated OR they have not exceeded the 5-task limit
      const bestExpert = sortedExperts.find(e => {
        const isAlreadyInQueue = queueIds.includes(e.id);
        const currentCount = expertAssignmentCount[e.id] || 0;
        
        if (isAlreadyInQueue) return false;
        
        if (isOversaturated) {
          return true; // No limit in oversaturated case, reputation sorting handles priority
        } else {
          return currentCount < MAX_TASKS_PER_EXPERT;
        }
      });

      if (bestExpert) {
        newAssignments[q.submissionId] = bestExpert.id;
        expertAssignmentCount[bestExpert.id] = (expertAssignmentCount[bestExpert.id] || 0) + 1;
        assignedCount++;
      }
    });

    setAssignments(newAssignments);
    if (assignedCount > 0) {
      const modeText = isOversaturated ? " (Over-capacity mode: limit lifted)" : "";
      toast.success(`Automatically suggested ${assignedCount} reallocations${modeText}.`);
    } else {
      toast.info("No further automated suggestions possible with current expert constraints.");
    }
  };

  const handleConfirm = async() => {
    const flatAssignments = Object.entries(assignments).map(
      ([submissionId, expertId]) => ({
        submissionId,
        expertId,
      })
    );

    if (flatAssignments.length === 0) {
      toast.warning("No reallocations selected.");
      return;
    }

    const questionsCount = flatAssignments.length;
    const uniqueExpertsCount = new Set(flatAssignments.map(a => a.expertId)).size;

    await toast.promise(reallocate({ assignments: flatAssignments, inactiveExpertIds: data?.inactiveExpertIds }),{
        loading: 'Reallocating experts...',
        success: () => {
          onOpenChange(false);
          return `Started reallocation of ${questionsCount} tasks to ${uniqueExpertsCount} experts.`;
        },
        error: (error:any) => error?.message || "Failed to reallocate questions"
      }) 
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 border-b shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {type === "inactive"
                ? "Inactive to Active Reallocation"
                : "Escalation Reallocation"}
              {data?.questions?.length > 0 && (
                <Badge variant="outline" className="ml-2">
                  {filteredQuestions.length} Tasks
                </Badge>
              )}
            </DialogTitle>

            {data?.questions && data.questions.length > 0 && (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  className="flex items-center gap-2 text-xs h-9 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                  disabled={isSubmitting}
                >
                  <Zap className="h-3 w-3 fill-current" />
                  Auto-Suggest
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignments({})}
                  className="flex items-center gap-2 text-xs h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  disabled={isSubmitting || Object.keys(assignments).length === 0}
                >
                  Clear All
                </Button>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    Filter by Expert:
                  </span>
                  <Select value={selectedExpertFilter} onValueChange={setSelectedExpertFilter}>
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue placeholder="All Experts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Experts</SelectItem>
                      {uniqueExperts.map((expert) => (
                        <SelectItem key={expert.id} value={expert.id}>
                          {expert.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Informational Banner - Only show if we hit the 50-task limit */}
          {!isLoading && !isError && data?.questions?.length === 50 && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                  Manual Reallocation Limit
                </p>
                <p className="text-xs text-blue-800/70 dark:text-blue-400/70 leading-relaxed">
                  To ensure system stability and fair workload distribution, a maximum of <strong>50 tasks</strong> are fetched per run. 
                  If more tasks require reallocation, they will appear in the next session after you process the current batch.
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground animate-pulse">
                Fetching reallocation preview...
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div>
                <p className="text-lg font-semibold text-destructive">Failed to load preview</p>
                <p className="text-muted-foreground">{(error as any)?.message || "Please try again later"}</p>
              </div>
              <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-2">
                <Loader2 className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : data?.questions?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground opacity-20" />
              <div>
                <p className="text-lg font-semibold">No questions found</p>
                <p className="text-muted-foreground">
                  Everything is currently balanced correctly.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[40%]">Question</TableHead>
                    <TableHead>Current Expert</TableHead>
                    <TableHead>New Expert (Available)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuestions.map((q: any) => (
                    <TableRow key={q.submissionId} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <div className="max-w-md truncate" title={q.questionText}>
                          {q.questionText}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                          ID: {q.questionId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{q.currentExpertName}</span>
                          <div className="flex gap-1 mt-1">
                            {q.currentExpertStatus === "in-active" && (
                              <Badge variant="destructive" className="w-fit text-[10px] px-1 py-0">
                                Inactive
                              </Badge>
                            )}
                            {q.isCurrentExpertBlocked && (
                              <Badge variant="destructive" className="w-fit text-[10px] px-1 py-0">
                                Blocked
                              </Badge>
                            )}
                            {type === "escalation" && !q.currentExpertStatus && (
                               <Badge variant="outline" className="w-fit text-[10px] px-1 py-0">
                                 Escalated
                               </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={assignments[q.submissionId] || ""}
                          onValueChange={(val) => handleSelect(q.submissionId, val)}
                        >
                          <SelectTrigger className="w-full bg-background">
                            <SelectValue placeholder="Choose an expert..." />
                          </SelectTrigger>
                          <SelectContent>
                            {data?.activeExperts?.map((e: any) => (
                              <SelectItem key={e.id} value={e.id}>
                                <div className="flex items-center justify-between w-full gap-4">
                                  <span>{e.name}</span>
                                  <Badge variant="secondary" className="text-[10px]">
                                    Pending Workload: {e.reputation_score}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredQuestions.length === 0 && (
                 <div className="py-10 text-center text-muted-foreground">
                    No questions found for the selected expert.
                 </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-muted/20">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {Object.keys(assignments).length} of {data?.questions?.length || 0} tasks mapped
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSubmitting || Object.keys(assignments).length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Confirm Reallocation"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

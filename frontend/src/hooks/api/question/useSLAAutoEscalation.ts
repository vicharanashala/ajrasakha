import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

const STORAGE_KEY = "sla-auto-escalation-enabled";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getStoredEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export function useSLAAutoEscalation() {
  const queryClient = useQueryClient();
  const [isEnabled, setIsEnabled] = useState<boolean>(getStoredEnabled);
  const [lastEscalationAt, setLastEscalationAt] = useState<string | null>(null);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch escalation preview (delayed questions)
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ["reallocationPreview", "escalation"],
    queryFn: () => questionService.getReallocationPreview("escalation"),
    enabled: isEnabled,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const delayedCount = previewData?.questions?.length ?? 0;
  const activeExperts = previewData?.activeExperts ?? [];

  // Auto-reallocate mutation
  const { mutate: reallocate, isPending: isEscalating } = useMutation({
    mutationFn: async () => {
      return await questionService.reAllocateLessWorkload("escalation");
    },
    onSuccess: (response: any) => {
      const count = response?.reallocatedCount ?? response?.questions?.length ?? 0;
      setEscalatedCount((prev) => prev + count);
      setLastEscalationAt(new Date().toISOString());
      toast.success(`Auto-escalated ${count} delayed question(s) to available experts.`);
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["reallocationPreview"] });
    },
    onError: (error: any) => {
      console.error("Auto-escalation failed:", error);
      toast.error("Auto-escalation failed. " + (error?.message || "Please try again."));
    },
  });

  const triggerEscalation = useCallback(() => {
    if (delayedCount === 0) {
      toast.info("No delayed questions to escalate.");
      return;
    }
    reallocate();
  }, [delayedCount, reallocate]);

  // Toggle auto-escalation
  const toggleEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
    if (!enabled && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isEnabled,
    toggleEnabled,
    delayedCount,
    activeExpertCount: activeExperts.length,
    previewLoading,
    isEscalating,
    lastEscalationAt,
    escalatedCount,
    triggerEscalation,
    refetchPreview,
    previewData,
  };
}

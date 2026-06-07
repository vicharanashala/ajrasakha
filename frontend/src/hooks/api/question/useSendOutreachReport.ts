import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { useToast } from "@/shared/components/toast";

const questionService = new QuestionService();

interface OutreachReportPayload {
  startDate: Date;
  endDate: Date;
  emails: string[]; 
}

export const useSendOutreachReport = () => {
  const { success: toastSuccess, loading:toastLoading, dismiss: toastDismiss, error: toastError} = useToast();
  return useMutation({

    onMutate: () => {
      const toastId = toastLoading("Sending report...", {
        desc: "Please wait while we send the outreach report.",
      });
      // Return the toastId so it becomes available in the "context" variable below
      return { toastId };
    },
    mutationFn: async (payload: OutreachReportPayload) => {
      const result = await questionService.sendOutreachReport(
        payload.startDate,
        payload.endDate,
        payload.emails
      );
      
      if (!result?.success) {
        throw new Error(result?.message || "Failed to send report");
      }
      
      return result;
    },
    onSuccess: (data,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastSuccess(data?.message || `Report sent successfully`);
    },
    onError: (error: any,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastError(error?.message || "Failed to send outreach report");
    },
  });
};
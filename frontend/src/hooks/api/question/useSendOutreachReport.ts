import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

interface OutreachReportPayload {
  startDate: Date;
  endDate: Date;
  emails: string[]; 
}

export const useSendOutreachReport = () => {
  return useMutation({
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
    onSuccess: (data) => {
      toast.success(data?.message || `Report sent successfully`);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to send outreach report");
    },
  });
};
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ContextService } from "../services/contextService";

const contextService = new ContextService();

export const useSubmitTranscript = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transcript: string) => {
      try {
        return await contextService.submitTranscript(transcript);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit transcript! Try again.");
      console.error("Failed to submit transcript:", error.message);
    },
  });
};

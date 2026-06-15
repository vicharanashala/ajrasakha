import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ContextService } from "../../services/contextService";
import type { SupportedLanguage } from "@/types";
import { toast } from "@/shared/components/toast";

const contextService = new ContextService();

export const useSendAudioChunk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      lang,
    }: {
      file: File | Blob;
      lang: SupportedLanguage
    }) => {
      try {
        return await contextService.useSendAudioChunk(file, lang);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: (data) => {
      console.log("Chunk transcript received:", data?.transcript || "");
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit audio chunk!"
      );
      console.error("Failed to submit audio chunk:", error);
    },
  });
};

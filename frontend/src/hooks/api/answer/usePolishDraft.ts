import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  WritingAssistantService,
  type PolishDraftPayload,
  type PolishDraftResponse,
} from "@/hooks/services/writingAssistantService";

const writingAssistantService = new WritingAssistantService();

export interface UsePolishDraftReturn {
  polishDraft: (payload: PolishDraftPayload) => void;
  isPolishing: boolean;
  result: PolishDraftResponse | null;
  error: Error | null;
  reset: () => void;
}

export const usePolishDraft = (): UsePolishDraftReturn => {
  const mutation = useMutation<PolishDraftResponse, Error, PolishDraftPayload>({
    mutationKey: ["polishDraft"],
    mutationFn: async (payload: PolishDraftPayload) => {
      return await writingAssistantService.polishDraft(payload);
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to complete draft analysis");
    },
  });

  const polishDraft = useCallback(
    (payload: PolishDraftPayload) => {
      const trimmedQuestion = payload.question?.trim() || "";
      const trimmedDraft = payload.draft?.trim() || "";

      if (!trimmedQuestion && !trimmedDraft) {
        toast.info("Please provide a question and a draft answer before polishing.");
        return;
      }

      if (!trimmedQuestion) {
        toast.info("Question text is missing. Please select a question before polishing.");
        return;
      }

      if (!trimmedDraft) {
        toast.info("Please write or paste a draft answer before polishing.");
        return;
      }

      mutation.mutate({
        question: trimmedQuestion,
        draft: trimmedDraft,
      });
    },
    [mutation]
  );

  return {
    polishDraft,
    isPolishing: mutation.isPending,
    result: mutation.data ?? null,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
};


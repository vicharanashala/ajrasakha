import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  NewSourceService,
  type RecordMissingPopDocumentPayload,
} from "../../services/newSourceService";

const newSourceService = new NewSourceService();

// Logs an incomplete pop document against the reviewer's current stint on this answer.
export const useRecordMissingPopDocument = () => {
  return useMutation({
    mutationFn: ({
      answerId,
      ...payload
    }: RecordMissingPopDocumentPayload & { answerId: string }) =>
      newSourceService.recordMissingPopDocument(answerId, payload),
    onError: (error: Error) =>
      toast.error(
        error.message || "Couldn't record the incomplete document against your review.",
      ),
  });
};

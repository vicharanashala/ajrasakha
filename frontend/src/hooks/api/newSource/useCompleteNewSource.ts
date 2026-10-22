import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";
import type { CompleteNewSourcePayload } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useCompleteNewSource = () => {
  return useMutation({
    mutationFn: ({ id, ...payload }: CompleteNewSourcePayload & { id: string }) =>
      newSourceService.complete(id, payload),
  });
};

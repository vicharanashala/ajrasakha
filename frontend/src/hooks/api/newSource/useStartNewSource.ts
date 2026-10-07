import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";
import type { StartNewSourcePayload } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useStartNewSource = () => {
  return useMutation({
    mutationFn: (payload: StartNewSourcePayload) => newSourceService.start(payload),
  });
};

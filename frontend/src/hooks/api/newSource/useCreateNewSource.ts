import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";
import type { CreateNewSourcePayload } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useCreateNewSource = () => {
  return useMutation({
    mutationFn: (payload: CreateNewSourcePayload) =>
      newSourceService.create(payload),
  });
};

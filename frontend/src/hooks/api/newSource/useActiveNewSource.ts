import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useActiveNewSource = () => {
  return useMutation({
    mutationFn: (excludeAnswerId: string) =>
      newSourceService.findActiveInProgress(excludeAnswerId),
  });
};

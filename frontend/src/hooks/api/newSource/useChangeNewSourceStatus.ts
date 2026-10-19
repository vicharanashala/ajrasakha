import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useChangeNewSourceStatus = () => {
  return useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "pending" | "merged" | "flagged" | "review-completed";
      reason: string;
    }) => newSourceService.changeStatus(id, { status, reason }),
  });
};

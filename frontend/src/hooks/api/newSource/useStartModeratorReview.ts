import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";
import type { StartNewSourcePayload } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

/** Takes an answer into moderator review when a moderator/admin opens it. */
export const useStartModeratorReview = () => {
  return useMutation({
    mutationFn: (payload: StartNewSourcePayload) =>
      newSourceService.startModeratorReview(payload),
  });
};

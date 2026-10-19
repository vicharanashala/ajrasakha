import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

/** Sends a held answer back to review-completed for other moderators to pick up. */
export const useReleaseModeratorReview = () => {
  return useMutation({
    mutationFn: (id: string) => newSourceService.releaseModeratorReview(id),
  });
};

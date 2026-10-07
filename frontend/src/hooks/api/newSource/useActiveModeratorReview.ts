import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

/** Checks whether this moderator is still holding a different answer, before they take
 *  another one - a mutation because it runs on demand, not on render. */
export const useActiveModeratorReview = () => {
  return useMutation({
    mutationFn: (excludeAnswerId: string) =>
      newSourceService.findActiveModeratorReview(excludeAnswerId),
  });
};

import { useQuery } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

/** Read-only lookup of an answer's updated_sources record, for the moderator
 *  before/after comparison view. Pass enabled: false until that view is shown. */
export const useGetNewSourceByAnswerId = (
  answerId: string,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["new-source-by-answer", answerId],
    queryFn: () => newSourceService.getByAnswerId(answerId),
    enabled: options?.enabled,
  });
};

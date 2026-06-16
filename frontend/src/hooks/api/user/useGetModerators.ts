import { useQuery } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

/** Fetches all moderators ({_id, name, email}) for filter dropdowns. */
export const useGetModerators = (enabled = true) => {
  return useQuery({
    queryKey: ["moderators"],
    queryFn: async () => {
      return await userService.getModerators();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

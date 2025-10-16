import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { IUser } from "@/types";

const userService = new UserService();

export const useGetCurrentUser = () => {
  const { data, isLoading, error } = useQuery<IUser | null, Error>({
    queryKey: ["user"],
    queryFn: async () => {
      return await userService.getCurrentUser();
    },
  });

  return { data, isLoading, error };
};

import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { IPreference } from "@/types";

const userService = new UserService();

export interface IUsers {
  _id: string;
  userName: string;
}
export interface IUsersNameResponse {
  myPreference: IPreference;
  users: IUsers[];
}

export const useGetAllUserNames = () => {
  const { data, isLoading, error } = useQuery<IUsersNameResponse | null, Error>({
    queryKey: ["users_name"],
    queryFn: async () => {
      return await userService.getAllUserNames();
    },
  });

  return { data, isLoading, error };
};

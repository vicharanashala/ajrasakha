import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { IMyPreference, IUser } from "@/types";

const userService = new UserService();

interface BasicUser {
  _id: string;
  userName: string;
  email: string;
  role: IUser["role"];
  preference: IMyPreference;
  isBlocked:boolean
}
export interface IUsersNameResponse {
  myPreference: IMyPreference;
  users: BasicUser[];
  totalUsers: number;
  totalPages: number;
}


export const useGetAllUsers = (
  options: { enabled?: boolean } = {}
) => {
  const { data, isLoading, error } = useQuery<IUsersNameResponse| null>({
    queryKey: ["users"],
    queryFn:()=> userService.useGetAllUsers(),
    enabled: options.enabled,
  });

  return { data, isLoading, error };
};



export const useGetAllExperts = (
  page: number,
  limit: number,
  search: string,
  sort: string,
  filter: string,
  options:{enabled?:boolean}={}
) => {
  const { data, isLoading, error } = useQuery<{
    experts: IUser[];
    totalExperts: number;
    totalPages: number;
  } | null>({
    queryKey: ["experts", page, limit, search, sort, filter],
    queryFn: async () => {
      return await userService.useGetAllExperts(
        page,
        limit,
        search,
        sort,
        filter
      );
    },
    enabled: options?.enabled ?? true,
  });

  return { data, isLoading, error };
};

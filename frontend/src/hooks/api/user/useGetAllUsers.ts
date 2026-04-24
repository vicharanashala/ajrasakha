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
  isBlocked:boolean,
  special_task_force?:boolean
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
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return { data, isLoading, error };
};

export const useExpertAutocomplete = (
  search: string,
  options: { enabled?: boolean } = {}
) => {
  const { data, isLoading, isFetching, error } = useQuery<{_id: string; userName: string}[] | null>({
    queryKey: ["expertAutocomplete", search],
    queryFn: async () => {
      return await userService.getExpertAutoCompleteOptions(search);
    },
    enabled: options?.enabled !== false && search.length > 0,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return { data, isLoading, isFetching, error };
};

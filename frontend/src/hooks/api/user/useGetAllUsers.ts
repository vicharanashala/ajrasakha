import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { AssignedQuestion } from "../../services/userService";
import type { IMyPreference, IUser } from "@/types";

const userService = new UserService();

interface BasicUser {
  _id: string;
  userName: string;
  email: string;
  role: IUser["role"];
  preference: IMyPreference;
  isBlocked:boolean,
  status?: 'active' | 'in-active';
  special_task_force?:boolean
  state?:string | null;
  domain?:string | null;
  mobile?: string;
  university?: string;
  /** Questions this user currently holds — used to show availability in select modals. */
  assignedQuestionIds?: AssignedQuestion[] | null;
  /** Indicates if this user is a training model user */
  isTrainingUser?: boolean;
}
export interface IUsersNameResponse {
  myPreference: IMyPreference;
  users: BasicUser[];
  totalUsers: number;
  totalPages: number;
}


export const useGetAllUsers = (
  options: { enabled?: boolean; includeSelf?: boolean } = {}
) => {
  const includeSelf = options.includeSelf ?? false;
  const { data, isLoading, error } = useQuery<IUsersNameResponse| null>({
    // includeSelf is part of the key so the two variants don't share a cache entry.
    queryKey: ["users", includeSelf],
    queryFn:()=> userService.useGetAllUsers(includeSelf),
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

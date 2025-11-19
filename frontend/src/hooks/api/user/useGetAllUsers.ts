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
}
export interface IUsersNameResponse {
  myPreference: IMyPreference;
  users: BasicUser[];
}

export const useGetAllUsers = () => {
  const { data, isLoading, error } = useQuery<IUsersNameResponse | null, Error>(
    {
      queryKey: ["users_name"],
      queryFn: async () => {
        return await userService.useGetAllUsers();
      },
    }
  );

  return { data, isLoading, error };
};

export const useGetAllExperts = (page:number,limit:number,search:string,sort:string) => {
  const { data, isLoading, error } = useQuery<{experts:IUser[]; totalExperts:number; totalPages:number} |null>(
    {
      queryKey: ["users",page,limit,search,sort],
      queryFn: async () => {
        return await userService.useGetAllExperts(page,limit,search,sort);
      },
    }
  );

  return { data, isLoading, error };
};

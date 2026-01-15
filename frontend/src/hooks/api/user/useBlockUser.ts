import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import {toast} from "sonner";

const userService = new UserService();

export const useBlockUser = () => {
  const queryClient =useQueryClient();
  return useMutation({
    mutationKey:['block_user'],
    mutationFn: async ({userId,action}: {userId:string,action:string}) => {
     return await userService.isBlockUser(userId,action)
    },
    onSuccess: () => {
      //  Refresh admin users list
      queryClient.invalidateQueries({
        queryKey: ["users"],
        exact: false,
      });

      //  Refresh moderator experts list
      queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });
      toast.success("User Updated succesfully")
    },
    onError:() => {
      toast.error(`Failed to Block or unBlock Expert`)
    }
  })
}
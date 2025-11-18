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
      queryClient.invalidateQueries({queryKey:['users']})
      toast.success("User Updated succesfully")
    },
    onError:() => {
      toast.error(`Failed to Block or unBlock Expert`)
    }
  })
}
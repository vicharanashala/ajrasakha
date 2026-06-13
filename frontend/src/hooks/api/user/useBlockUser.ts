import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

interface UseBlockUserProps {
  isAdmin?: boolean;
}

export const useBlockUser = ({ isAdmin }: UseBlockUserProps = {}) => {
  const queryClient =useQueryClient();
  return useMutation({
    mutationKey:['block_user'],
    mutationFn: async ({userId,action}: {userId:string,action:string}) => {
     return await userService.isBlockUser(userId,action)
    },
    onSuccess: () => {
      //  Refresh admin users list
      if (isAdmin) {
        queryClient.invalidateQueries({
          queryKey: ["admin"],
          exact: false,
        });
      }

      //  Refresh moderator experts list
      queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });
      // toast.success("User Updated succesfully")
    },
    // onError:(error) => {
    //   console.error("Error blocking/unblocking user:", error);
    //   // toast.error(error?.message || `Failed to Block or unBlock Expert`)
    // }
  })
}
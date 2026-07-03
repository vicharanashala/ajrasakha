import { useQuery } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

export const useGetStfModerators = (enabled: boolean = true) => {
    return useQuery({
        queryKey: ["stf_moderators"],
        queryFn: () => userService.getStfModerators(),
        enabled,
    });
};

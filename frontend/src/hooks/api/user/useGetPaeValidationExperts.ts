import { useQuery } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

export const useGetPaeValidationExperts = (enabled: boolean = true) => {
    return useQuery({
        queryKey: ["pae_validation_experts"],
        queryFn: () => userService.getPaeValidationExperts(),
        enabled,
    });
};

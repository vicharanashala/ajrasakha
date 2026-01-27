import { useMutation, useQueryClient     } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";

const performaceService = new PerformaneService();

export const useCheckIn = () => {
    const queryClient = useQueryClient();
    const { mutateAsync, isPending, error, data } = useMutation({
        mutationFn: async () => {
            return await performaceService.checkIn();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["experts"] });
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    },
    });

    return { checkIn: mutateAsync, isPending, error, data };
};

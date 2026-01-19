import { useMutation } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";

const performaceService = new PerformaneService();

export const useCheckIn = () => {
    const { mutateAsync, isPending, error, data } = useMutation({
        mutationFn: async () => {
            return await performaceService.checkIn();
        },
    });

    return { checkIn: mutateAsync, isPending, error, data };
};

import { useMutation } from "@tanstack/react-query";
import { NewSourceService } from "../../services/newSourceService";

const newSourceService = new NewSourceService();

export const useCloseNewSource = () => {
  return useMutation({
    mutationFn: (id: string) => newSourceService.close(id),
  });
};

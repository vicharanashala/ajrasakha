import { useMutation } from "@tanstack/react-query";
import { PopService } from "../../services/popService";

const popService = new PopService();

export const useLookupPopSource = () => {
  return useMutation({
    mutationFn: (source: string) => popService.lookup(source),
  });
};

import { useMutation } from "@tanstack/react-query";
import { PopService, type PopRequiredField } from "../../services/popService";

const popService = new PopService();

export const useUpdatePopMissingFields = () => {
  return useMutation({
    mutationFn: ({
      id,
      fields,
    }: {
      id: string;
      fields: Partial<Record<PopRequiredField, string | number>>;
    }) => popService.updateMissingFields(id, fields),
  });
};

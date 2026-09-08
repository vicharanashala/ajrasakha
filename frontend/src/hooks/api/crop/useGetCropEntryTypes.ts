import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";

const cropService = new CropService();

/** The extensible crop-side categories (weed/pest/disease/…) served by the backend.
 *  Used to build the "Other" tab filter and the add-form category dropdown, so adding
 *  a new category is a one-line backend change with no frontend edits. */
export const useGetCropEntryTypes = () => {
  return useQuery({
    queryKey: ["crop-entry-types"],
    queryFn: async () => (await cropService.getEntryTypes())?.types ?? [],
    staleTime: 5 * 60 * 1000,
  });
};

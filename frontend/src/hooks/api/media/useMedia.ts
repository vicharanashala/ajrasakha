import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MediaService,
  type MediaKind,
} from "@/hooks/services/mediaService";

const service = new MediaService();

/** Public read of media for a given kind (or all when omitted). */
export const useGetMedia = (kind?: MediaKind) =>
  useQuery({
    queryKey: ["media", kind ?? "all"],
    queryFn: () => service.list(kind),
  });

/**
 * Uploads straight to the bucket via a signed URL (no API size limit) and reports
 * progress, so large outreach videos show a real percentage.
 */
export const useUploadMedia = () => {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationKey: ["upload-media"],
    mutationFn: (params: {
      kind: MediaKind;
      file: File;
      title?: string;
      caption?: string;
    }) => service.upload(params, setProgress),
    onMutate: () => setProgress(0),
    onSettled: () => setProgress(0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Uploaded");
    },
    onError: (e: any) => toast.error(e?.message || "Upload failed"),
  });

  return { ...mutation, progress };
};

export const useDeleteMedia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["delete-media"],
    mutationFn: (id: string) => service.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });
};

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

/** Register a YouTube video as an outreach item (URL only). */
export const useAddYoutube = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["add-youtube"],
    mutationFn: (params: { url: string; title?: string; caption?: string }) =>
      service.addYoutube(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("YouTube video added");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add YouTube video"),
  });
};

/** Add an external image by URL (carousel / outreach image). */
export const useAddImageLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["add-image-link"],
    mutationFn: (params: {
      kind: MediaKind;
      url: string;
      title?: string;
      caption?: string;
    }) => service.addImageLink(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Image link added");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add image link"),
  });
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

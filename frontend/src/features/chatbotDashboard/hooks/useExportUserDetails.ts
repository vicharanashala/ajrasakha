import { useMutation } from "@tanstack/react-query";
import { getIdToken } from "firebase/auth";
import { getCurrentUser } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { toast } from "sonner";
import type { UserDetailsFilters } from "../components/UserDetailsPreferenceFilter";

interface ExportUserDetailsParams {
  filters: UserDetailsFilters;
  source: "vicharanashala" | "annam" | "whatsapp";
  userType: "all" | "external" | "internal";
  sortBy: "totalQuestions" | "name" | "farmerName" | "email";
  sortOrder: "asc" | "desc";
}

function buildExportSearchParams({
  filters,
  source,
  userType,
  sortBy,
  sortOrder,
}: ExportUserDetailsParams): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startTime) params.set("startDate", filters.startTime.toISOString());
  if (filters.endTime) {
    // Same end-of-day extension as useUserDetails, so the export matches what's on screen.
    params.set(
      "endDate",
      new Date(filters.endTime.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
    );
  }
  if (filters.search.trim()) params.set("search", filters.search.trim());
  params.set("source", source);
  if (filters.crop.trim()) params.set("crop", filters.crop.trim());
  if (filters.primaryCrops.length) params.set("primaryCrops", filters.primaryCrops.join(","));
  if (filters.secondaryCrops.length) params.set("secondaryCrops", filters.secondaryCrops.join(","));
  if (filters.village.trim()) params.set("village", filters.village.trim());
  if (filters.state.trim()) params.set("state", filters.state.trim());
  if (filters.district.trim()) params.set("district", filters.district.trim());
  if (filters.block.trim()) params.set("block", filters.block.trim());
  if (filters.profileCompleted !== "all") params.set("profileCompleted", filters.profileCompleted);
  if (filters.inactiveOnly) params.set("inactiveOnly", "true");
  if (filters.lowFeedbackOnly) params.set("lowFeedbackOnly", "true");
  if (userType !== "all") params.set("userType", userType);
  if (filters.roles.length) params.set("roles", filters.roles.join(","));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (filters.verificationStatus !== "all") {
    params.set("isVerified", String(filters.verificationStatus === "verified"));
  }
  if (filters.loginStatus !== "all") params.set("loginStatus", filters.loginStatus);
  return params;
}

function extractFileName(res: Response): string {
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  if (match?.[1]) return match[1];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `farmers-${timestamp}.csv`;
}

export function useExportUserDetails() {
  return useMutation({
    mutationFn: async (params: ExportUserDetailsParams) => {
      const searchParams = buildExportSearchParams(params);
      const firebaseUser = await getCurrentUser();
      const token = firebaseUser ? await getIdToken(firebaseUser) : null;

      const res = await fetch(
        `${env.apiBaseUrl()}/analytics/user-details/export?${searchParams.toString()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = `Download failed with status ${res.status}`;
        try {
          const data = text ? JSON.parse(text) : null;
          if (data?.message) message = data.message;
        } catch {
          if (text && text.length < 200) message = text;
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const fileName = extractFileName(res);

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);

      return fileName;
    },

    onSuccess: (fileName) => {
      toast.success(`Downloaded ${fileName}`);
    },

    onError: (error: any) => {
      toast.error(error?.message || "Failed to download farmers list");
    },
  });
}

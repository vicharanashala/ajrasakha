import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

interface SendResponseAdherenceReportEmailParams {
  emails: string[];
  reportContent: string;
  reportHtml?: string;
  fileName?: string;
  source?: string;
  userType?: string;
  startDate?: string;
  endDate?: string;
  timeWindow?: string;
}

export function useSendResponseAdherenceReportEmail() {
  return useMutation({
    mutationFn: async (params: SendResponseAdherenceReportEmailParams) => {
      const result = await apiFetch<{ success: boolean; message: string }>(
        `${env.apiBaseUrl()}/analytics/response-adherence-table/email`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      );

      return result;
    },

    onSuccess: (data) => {
      toast.success(data?.message || 'Response adherence report sent via email');
    },

    onError: (error: any) => {
      toast.error(error?.message || 'Failed to send response adherence report email');
    },
  });
}

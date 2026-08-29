import { useQuery } from "@tanstack/react-query";
import { zohoTicketStatusService } from "@/hooks/services/zohoTicketStatusService";

export function useZohoTicketStatuses() {
    return useQuery({
        queryKey: ["zoho-ticket-statuses"],
        queryFn: () => zohoTicketStatusService.getStatuses(),
        refetchInterval: 30 * 60 * 1000,
    });
}
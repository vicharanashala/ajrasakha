import { useQuery } from "@tanstack/react-query";
// import { AuditTrailsService } from "../../services/auditTrailsService";

import { AuditTrailService } from "@/hooks/services/auditTrailService";
import type { IAuditTrailResponse } from "@/types";

// export type AuditFilters = {
//   page?: number;
//   limit?: number;
//   startDateTime?: string;
//   endDateTime?: string;
//   action?: string;
//   category?: string;
//   status?: string;
//   sortOrder?: "asc" | "desc";
// };

const auditTrailsService = new AuditTrailService();

export const useGetAuditTrails = (page: number, limit: number, startDate?: string, endDate?: string, category?: string | null, action?: string | null, order?: "asc" | "desc", outComeStatus?: string) => {
    console.log('Using useGetAuditTrails with parameters:', outComeStatus);
    const { data, isLoading, error ,refetch } = useQuery<IAuditTrailResponse | null, Error>(
        {
            queryKey: ["audit-trails", page, limit, startDate, endDate, category, action, order, outComeStatus],
            queryFn: async () => {
                return auditTrailsService.getAllAuditTrails(page, limit, startDate, endDate, category, action, order, outComeStatus);
            }
        }
    );
    return { data, isLoading, error, refetch };
};
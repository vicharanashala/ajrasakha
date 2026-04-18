import { useQuery } from "@tanstack/react-query";
// import { AuditTrailsService } from "../../services/auditTrailsService";

import { AuditTrailService } from "@/hooks/services/auditTrailService";
import type { IAuditTrailResponse } from "@/types";


const auditTrailsService = new AuditTrailService();

export const useGetAuditTrails = (page: number, limit: number, startDate?: string, endDate?: string) => {
    const { data, isLoading, error ,refetch } = useQuery<IAuditTrailResponse | null, Error>(
        {
            queryKey: ["audit-trails", page, limit, startDate, endDate],
            queryFn: async () => {
                return auditTrailsService.getAllAuditTrails(page, limit, startDate, endDate);
            }
        }
    );
    return { data, isLoading, error, refetch };
};
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type {
    ICreateTesterLogEntryResponse,
    IPaginatedTesterLogEntries,
    ITesterLogEntry,
    ITesterLogSummaryResponse,
} from "../types";

const API_BASE_URL = env.apiBaseUrl();

export class TesterLogService {
    private readonly baseUrl = `${API_BASE_URL}/tester-log`;

    async submitEntry(
        body: Omit<ITesterLogEntry, "_id" | "submittedByUserId" | "submittedByEmail" | "testerName" | "createdAt" | "updatedAt">,
    ): Promise<ICreateTesterLogEntryResponse> {
        const response = await apiFetch<ICreateTesterLogEntryResponse>(this.baseUrl, {
            method: "POST",
            body: JSON.stringify(body),
        });
        if (!response) throw new Error("Failed to submit test case entry");
        return response;
    }

    async getMyHistory(
        page = 1,
        limit = 20,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<IPaginatedTesterLogEntries> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (dateField) params.set("dateField", dateField);
        const url = `${this.baseUrl}/my?${params.toString()}`;
        const response = await apiFetch<IPaginatedTesterLogEntries>(url);
        if (!response) throw new Error("Failed to fetch test case history");
        return response;
    }

    async getMySummary(
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<ITesterLogSummaryResponse> {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (dateField) params.set("dateField", dateField);
        const queryStr = params.toString();
        const url = `${this.baseUrl}/my-summary${queryStr ? `?${queryStr}` : ""}`;
        const response = await apiFetch<ITesterLogSummaryResponse>(url);
        if (!response) throw new Error("Failed to fetch test case summary");
        return response;
    }

    async getAllEntries(
        page = 1,
        limit = 20,
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<IPaginatedTesterLogEntries> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (testerId) params.set("testerId", testerId);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (dateField) params.set("dateField", dateField);
        const url = `${this.baseUrl}/all?${params.toString()}`;
        const response = await apiFetch<IPaginatedTesterLogEntries>(url);
        if (!response) throw new Error("Failed to fetch all test case entries");
        return response;
    }
}

export const testerLogService = new TesterLogService();


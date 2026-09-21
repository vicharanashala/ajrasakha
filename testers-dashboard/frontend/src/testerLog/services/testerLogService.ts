import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";
import type {
    ICreateTesterLogEntryResponse,
    IPaginatedTesterLogEntries,
    ITesterLogEntry,
    ITesterOption,
    ITesterLogSummary,
    ITesterLogAdminFilters,
} from "../types";

const API_BASE_URL = env.apiBaseUrl();

function buildAdminFilterParams(filters: ITesterLogAdminFilters): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.testerId) params.set("testerId", filters.testerId);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.dateField) params.set("dateField", filters.dateField);
    if (filters.typeOfQuestion) params.set("typeOfQuestion", filters.typeOfQuestion);
    if (filters.channelTested) params.set("channelTested", filters.channelTested);
    if (filters.overallTestStatus) params.set("overallTestStatus", filters.overallTestStatus);
    if (filters.defectSeverity) params.set("defectSeverity", filters.defectSeverity);
    return params;
}

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

    async getAllEntries(
        page = 1,
        limit = 20,
        filters: ITesterLogAdminFilters = {},
    ): Promise<IPaginatedTesterLogEntries> {
        const params = buildAdminFilterParams(filters);
        params.set("page", String(page));
        params.set("limit", String(limit));
        const url = `${this.baseUrl}/all?${params.toString()}`;
        const response = await apiFetch<IPaginatedTesterLogEntries>(url);
        if (!response) throw new Error("Failed to fetch all test case entries");
        return response;
    }

    async getTesterOptions(): Promise<ITesterOption[]> {
        const response = await apiFetch<ITesterOption[]>(`${this.baseUrl}/testers`);
        if (!response) throw new Error("Failed to fetch tester list");
        return response;
    }

    async getSummary(filters: ITesterLogAdminFilters = {}): Promise<ITesterLogSummary> {
        const params = buildAdminFilterParams(filters);
        const url = `${this.baseUrl}/summary?${params.toString()}`;
        const response = await apiFetch<ITesterLogSummary>(url);
        if (!response) throw new Error("Failed to fetch tester summary");
        return response;
    }

    // Raw fetch (not apiFetch) since the response is a file body, not JSON -
    // same Bearer-token pattern questionService.downloadOverallReport uses.
    // Excel is the only export format - no `format` param to select, since
    // there's nothing else to choose between. Deliberately takes no filters -
    // this always downloads every row in the collection, regardless of
    // whatever the admin currently has the review table filtered to.
    async downloadEntries(): Promise<Blob> {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) throw new Error("User not authenticated");
        const token = await getIdToken(firebaseUser);

        const response = await fetch(`${this.baseUrl}/export`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Failed to download tester entries");
        return response.blob();
    }
}

export const testerLogService = new TesterLogService();


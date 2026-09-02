import { apiFetch, getCurrentUser } from "../../api/api-fetch";
import { getIdToken } from "firebase/auth";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface QAMetadata {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain: string;
  extracted_season: string;
}

export interface QAItem {
  question: string;
  answer: string;
  agri_specialist: string;
  referenceSource: string;
  id: string;
  weather?: any;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
}

export interface QAPairs {
  metadata: QAMetadata;
  QnA: QAItem[];
}

export interface CallQuery {
  _id?: string;
  callUuid: string;
  metadata: {
    extracted_query?: string;
    extracted_crop?: string;
    extracted_state?: string;
    extracted_district?: string;
    extracted_domain?: string | string[];
    extracted_season?: string;
    standardized_domains?: string[];
  };
  question: string;
  answer: string;
  agri_specialist?: string;
  referenceSource?: string;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
  weather?: any;
  createdAt?: string;
}

export interface CallRecordingItem {
  recordingId: string;
  storagePath?: string;
  storageBucket?: string;
  duration: number;
  durationMs?: number;
  format?: 'mp3' | 'wav';
  status: 'recording' | 'processing' | 'completed' | 'failed';
  sizeBytes?: number;
  createdAt?: string;
}

export interface CallHistoryItem {
  uuid: string;
  from: string;
  to: string;
  duration: number;
  status: string;
  startTime: string;
  direction: string;
  agentUserId?: string;
  agentUsername?: string;
  agentEmail?: string;
  farmerProfile?: FarmerProfile;
  callDetails?: {
    caller?: { transcript: string; translation: string; detectedLanguage: string };
    agent?: { transcript: string; translation: string; detectedLanguage: string; userid?: string; username?: string; email?: string };
    recording?: CallRecordingItem;
    recordings?: CallRecordingItem[];
    queries?: CallQuery[];
    QA_pairs?: QAPairs;
  };
}


export interface CallHistoryResponse {
  calls: CallHistoryItem[];
  total: number;
}


export interface MakeCallRequest {
  to: string;
}

export interface MakeCallResponse {
  message: string;
  callUuid: string;
}

export interface FarmerProfile {
  farmerName?: string;
  age?: number;
  gender?: string;
  villageName?: string;
  blockName?: string;
  district?: string;
  state?: string;
  phoneNo?: string;
  languagePreference?: string;
  yearsOfExperience?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  highestEducatedPerson?: string;
  numberOfSmartphones?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface CallFarmer {
  _id?: string;
  phoneNo: string;
  profile: FarmerProfile;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  averageDuration: number;
  domains: { domain: string; count: number }[];
  callsByStatus: { status: string; count: number }[];
  dailyCallTrend: { date: string; count: number }[];
}

export interface ACCAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  domains: { domain: string; count: number; today: number; thisWeek: number; thisMonth: number }[];
  monthlyTrend: { month: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}

export interface PlivoAgentCredential {
  _id?: string;
  agentNumber: string;
  username: string;
  sipUri?: string;
  password: string;
  createdAt?: string;
  updatedAt?: string;
}

export const mergeAndCleanCallHistory = (rawCalls: CallHistoryItem[]): CallHistoryItem[] => {
  if (!Array.isArray(rawCalls)) return [];

  const isSipBridgeLeg = (call: CallHistoryItem) => {
    const to = String(call.to || '').toLowerCase();
    const direction = String(call.direction || '').toLowerCase();
    return (
      direction === 'outbound' &&
      (to.startsWith('sip:') || to.includes('phone.plivo.com') || to.includes('endpoint'))
    );
  };

  const mainCalls: CallHistoryItem[] = [];
  const sipLegs: CallHistoryItem[] = [];

  for (const call of rawCalls) {
    if (isSipBridgeLeg(call)) {
      sipLegs.push(call);
    } else {
      mainCalls.push({
        ...call,
        callDetails: call.callDetails ? { ...call.callDetails } : undefined,
      });
    }
  }

  // Correlate each SIP leg with its parent inbound call based on initiation timestamp
  for (const sipCall of sipLegs) {
    const sipTime = sipCall.startTime ? new Date(sipCall.startTime).getTime() : 0;
    let bestMatch: CallHistoryItem | null = null;
    let minDiff = Infinity;

    for (const mainCall of mainCalls) {
      if (mainCall.direction === 'inbound') {
        const mainTime = mainCall.startTime ? new Date(mainCall.startTime).getTime() : 0;
        const diff = Math.abs(mainTime - sipTime);
        // Match calls within 180 seconds of each other
        if (diff <= 180000 && diff < minDiff) {
          minDiff = diff;
          bestMatch = mainCall;
        }
      }
    }

    if (bestMatch) {
      const sipDetails = sipCall.callDetails;
      if (sipDetails) {
        if (!bestMatch.callDetails) {
          bestMatch.callDetails = { ...sipDetails };
        } else {
          // Merge QA_pairs
          if (!bestMatch.callDetails.QA_pairs && sipDetails.QA_pairs) {
            bestMatch.callDetails.QA_pairs = sipDetails.QA_pairs;
          } else if (bestMatch.callDetails.QA_pairs && sipDetails.QA_pairs) {
            if (
              (!bestMatch.callDetails.QA_pairs.QnA || bestMatch.callDetails.QA_pairs.QnA.length === 0) &&
              sipDetails.QA_pairs.QnA?.length > 0
            ) {
              bestMatch.callDetails.QA_pairs.QnA = sipDetails.QA_pairs.QnA;
            }
            if (sipDetails.QA_pairs.metadata) {
              bestMatch.callDetails.QA_pairs.metadata = {
                ...(bestMatch.callDetails.QA_pairs.metadata || {}),
                ...sipDetails.QA_pairs.metadata,
              };
            }
          }

          // Merge queries
          if (
            (!bestMatch.callDetails.queries || bestMatch.callDetails.queries.length === 0) &&
            sipDetails.queries &&
            sipDetails.queries.length > 0
          ) {
            bestMatch.callDetails.queries = sipDetails.queries;
          }

          // Merge transcripts
          if (!bestMatch.callDetails.caller?.transcript && sipDetails.caller?.transcript) {
            bestMatch.callDetails.caller = sipDetails.caller;
          }
          if (!bestMatch.callDetails.agent?.transcript && sipDetails.agent?.transcript) {
            bestMatch.callDetails.agent = sipDetails.agent;
          }

          // Merge recordings
          if (!bestMatch.callDetails.recording && sipDetails.recording) {
            bestMatch.callDetails.recording = sipDetails.recording;
          }
          if (sipDetails.recordings && Array.isArray(sipDetails.recordings)) {
            bestMatch.callDetails.recordings = [
              ...(bestMatch.callDetails.recordings || []),
              ...sipDetails.recordings,
            ];
          }

          // Merge farmerProfile
          if (!bestMatch.farmerProfile && sipCall.farmerProfile) {
            bestMatch.farmerProfile = sipCall.farmerProfile;
          }
        }
      }

      // Merge agent details
      if (!bestMatch.agentUsername && sipCall.agentUsername) {
        bestMatch.agentUsername = sipCall.agentUsername;
      }
      if (!bestMatch.agentUserId && sipCall.agentUserId) {
        bestMatch.agentUserId = sipCall.agentUserId;
      }
      if (!bestMatch.agentEmail && sipCall.agentEmail) {
        bestMatch.agentEmail = sipCall.agentEmail;
      }
    }
  }

  return mainCalls;
};

export class PlivoService {
  private _baseUrl = `${API_BASE_URL}/plivo`;
  private _farmerBaseUrl = `${API_BASE_URL}/farmer`;

  async getCallHistory(params: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    direction?: string;
    agentId?: string;
  }): Promise<CallHistoryItem[]> {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.status) queryParams.append('status', params.status);
    if (params.agentId) queryParams.append('agentId', params.agentId);

    const url = `${this._baseUrl}/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiFetch<CallHistoryItem[]>(url);

    if (!response) {
      throw new Error('Failed to fetch call history: No response received');
    }

    return Array.isArray(response) ? response : [];
  }

  async getFarmerByPhoneNo(phoneNo: string): Promise<CallFarmer | null> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<CallFarmer>(url);
      return response;
    } catch (error) {
      console.warn(`[FARMER_FLOW] PlivoService.getFarmerByPhoneNo: Note for phoneNo ${phoneNo}:`, error);
      return null;
    }
  }

  async createFarmer(phoneNo: string, profile: FarmerProfile): Promise<string> {
    const url = `${this._farmerBaseUrl}`;
    try {
      const response = await apiFetch<{ id: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNo, profile }),
      });
      return response?.id || '';
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.createFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async updateFarmer(phoneNo: string, profile: FarmerProfile): Promise<boolean> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<{ success: boolean }>(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile }),
      });
      return response?.success || false;
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.updateFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async deleteFarmer(phoneNo: string): Promise<boolean> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<{ success: boolean }>(url, {
        method: 'DELETE',
      });
      return response?.success || false;
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.deleteFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async getAllFarmers(): Promise<CallFarmer[]> {
    const url = `${this._farmerBaseUrl}`;
    try {
      const response = await apiFetch<CallFarmer[]>(url);
      return response || [];
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.getAllFarmers: Error:`, error);
      throw error;
    }
  }

  async sendMessage(destination: string, text: string): Promise<{ success: boolean; messageUuid?: string }> {
    const url = `${this._baseUrl}/send-message`;
    try {
      const response = await apiFetch<{ success: boolean; messageUuid?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destination, text }),
      });
      return response || { success: false };
    } catch (error) {
      console.error(`PlivoService.sendMessage: Error sending message to ${destination}:`, error);
      throw error;
    }
  }

  async getCallRecordingUrl(callUuid: string): Promise<{
    callUuid: string;
    hasRecording: boolean;
    url?: string;
    recordingId?: string;
    duration?: number;
    format?: string;
    status?: string;
    message?: string;
    recording?: CallRecordingItem;
  }> {

    const url = `${this._baseUrl}/recordings/${encodeURIComponent(callUuid)}/url`;
    try {
      const response = await apiFetch<any>(url);
      return response || { callUuid, hasRecording: false };
    } catch (error) {
      console.error(`PlivoService.getCallRecordingUrl: Error fetching recording URL for ${callUuid}:`, error);
      throw error;
    }
  }


  async getAgentAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<AgentAnalytics> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `${this._baseUrl}/analytics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    try {
      const response = await apiFetch<AgentAnalytics>(url);

      if (!response) {
        throw new Error('Failed to fetch agent analytics: No response received');
      }

      return response;
    } catch (error) {
      console.error(`PlivoService.getAgentAnalytics: Error fetching analytics:`, error);
      throw error;
    }
  }

  async getACCAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ACCAnalytics> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const rawUrl = `${this._baseUrl}/acc-analytics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const url = rawUrl.includes('localhost:4000') ? rawUrl.replace('localhost:4000', 'localhost:4001') : rawUrl;
    try {
      const response = await apiFetch<ACCAnalytics>(url);

      if (!response) {
        throw new Error('Failed to fetch ACC analytics: No response received');
      }

      return response;
    } catch (error) {
      console.error(`PlivoService.getACCAnalytics: Error fetching analytics:`, error);
      throw error;
    }
  }

  async getQueries(params?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    domain?: string;
    state?: string;
    district?: string;
    block?: string;
    crop?: string;
    season?: string;
    limit?: number;
    page?: number;
  }): Promise<{ queries: any[]; total: number }> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.domain) queryParams.append('domain', params.domain);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.district) queryParams.append('district', params.district);
    if (params?.block) queryParams.append('block', params.block);
    if (params?.crop) queryParams.append('crop', params.crop);
    if (params?.season) queryParams.append('season', params.season);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.page) queryParams.append('page', params.page.toString());

    const rawUrl = `${this._baseUrl}/acc-queries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const url = rawUrl.includes('localhost:4000') ? rawUrl.replace('localhost:4000', 'localhost:4001') : rawUrl;
    try {
      const response = await apiFetch<{ queries: any[]; total: number }>(url);
      return response || { queries: [], total: 0 };
    } catch (error) {
      console.error(`PlivoService.getQueries: Error fetching queries:`, error);
      throw error;
    }
  }

  async downloadQueries(params?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    domain?: string;
    state?: string;
    district?: string;
    block?: string;
    crop?: string;
    season?: string;
  }): Promise<void> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.domain) queryParams.append('domain', params.domain);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.district) queryParams.append('district', params.district);
    if (params?.block) queryParams.append('block', params.block);
    if (params?.crop) queryParams.append('crop', params.crop);
    if (params?.season) queryParams.append('season', params.season);

    const rawUrl = `${this._baseUrl}/download-acc-queries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const url = rawUrl.includes('localhost:4000') ? rawUrl.replace('localhost:4000', 'localhost:4001') : rawUrl;

    const firebaseUser = await getCurrentUser();
    let token: string | null = null;
    if (firebaseUser) {
      try {
        token = await getIdToken(firebaseUser);
      } catch (err) {
        console.error("Failed to get Firebase token for CSV download:", err);
      }
    }

    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download queries CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `acc_queries_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  }

  async getAllCredentials(): Promise<PlivoAgentCredential[]> {
    const url = `${this._baseUrl}/credentials/all`;
    const response = await apiFetch<PlivoAgentCredential[]>(url);
    return response || [];
  }

  async getNextAgentNumber(): Promise<string> {
    const url = `${this._baseUrl}/credentials/next-agent-number`;
    const response = await apiFetch<{ nextAgentNumber: string }>(url);
    return response?.nextAgentNumber || 'agent_1';
  }

  async upsertCredential(agentNumber: string | undefined, username: string, password: string): Promise<PlivoAgentCredential> {
    const url = `${this._baseUrl}/credentials`;
    const response = await apiFetch<{ success: boolean; credential: PlivoAgentCredential }>(url, {
      method: 'POST',
      body: JSON.stringify({ agentNumber, username, password }),
    });
    if (!response?.credential) {
      throw new Error('Failed to upsert credential: No response received');
    }
    return response.credential;
  }

  async updateCredential(agentNumber: string, username: string, password: string): Promise<PlivoAgentCredential> {
    const url = `${this._baseUrl}/credentials/${encodeURIComponent(agentNumber)}`;
    const response = await apiFetch<{ success: boolean; credential: PlivoAgentCredential }>(url, {
      method: 'PUT',
      body: JSON.stringify({ username, password }),
    });
    if (!response?.credential) {
      throw new Error('Failed to update credential: No response received');
    }
    return response.credential;
  }

  async deleteCredential(agentNumber: string): Promise<boolean> {
    const url = `${this._baseUrl}/credentials/${encodeURIComponent(agentNumber)}`;
    const response = await apiFetch<{ success: boolean }>(url, {
      method: 'DELETE',
    });
    return response?.success || false;
  }

  async getAgentCredentials(): Promise<{ username: string; password: string; streamUrl: string } | null> {
    return apiFetch<{ username: string; password: string; streamUrl: string }>(`${this._baseUrl}/agent-credentials`);
  }
}

export const plivoService = new PlivoService();
export const plivoApi = plivoService;

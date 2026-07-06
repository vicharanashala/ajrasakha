import type { IUser } from "@/types";
import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class UserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async getCurrentUser(): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/me`);
  }

  async getCallAgents(): Promise<IUser[] | null> {
    return apiFetch<IUser[]>(`${this._baseUrl}/call-agents`);
  }

  async setCallAgentStatus(userId: string, isCallAgent: boolean, isCallAgentActive: boolean): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/set-call-agents`, {
      method: "POST",
      body: JSON.stringify({ userId, isCallAgent, isCallAgentActive }),
    });
  }

  async toggleCallAgentActive(userId: string): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/call-agents/${userId}/toggle-active`, {
      method: "PATCH",
    });
  }

  async toggleAgentStatus(online: boolean): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/call-agents/toggle-status`, {
      method: "POST",
      body: JSON.stringify({ online }),
    });
  }

  async markAgentAsAvailable(): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/call-agents/available`, {
      method: "POST",
    });
  }
}

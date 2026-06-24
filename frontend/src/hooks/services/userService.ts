import type { IUser, IUnverifiedUser, ReviewLevelCount } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { IUsersNameResponse } from "../api/user/useGetAllUsers";
import { formatDateLocal } from "@/utils/formatDate";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class UserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async getCurrentUser(): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/me`);
  }

  async useGetAllUsers(): Promise<IUsersNameResponse | null> {
    return apiFetch<IUsersNameResponse>(`${this._baseUrl}/all`);
  }


  async edit(user: Partial<IUser>): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/`, {
      method: "PUT",
      body: JSON.stringify({ ...user }),
    });
  }

  async notificationDeletePreference(preference: string): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/`, {
      body: JSON.stringify({ preference }),
      method: "PATCH"
    })
  }

  async useGetAllExperts(page: number, limit: number, search: string, sort: string, filter: string): Promise<{ experts: IUser[]; totalExperts: number; totalPages: number } | null> {
    return apiFetch<{ experts: IUser[]; totalExperts: number; totalPages: number }>(`${this._baseUrl}/list?page=${page}&limit=${limit}&search=${search}&sort=${sort}&filter=${filter}`);
  }

  async isBlockUser(userId: string, action: string): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/expert`, {
      body: JSON.stringify({ userId, action }),
      method: "PATCH"
    })
  }

  async toggleSTF(userId: string, action: string): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/stf`, {
      body: JSON.stringify({ userId, action }),
      method: "PATCH",
    });
  }

  async updateUserStatus(userId: string, status: string) {
    return apiFetch<{ message: string }>(`${this._baseUrl}/status`, {
      method: "PATCH",
      body: JSON.stringify({ userId, status }),
    });
  }

  async updateUserActivity(userId: string, isActive: boolean): Promise<{ message: string } | null> {
    return apiFetch<{ message: string }>(`${this._baseUrl}/activity`, {
      method: "PATCH",
      body: JSON.stringify({ userId, isActive }),
    });
  }

  async toggleUserRole(userId: string, currentRole: string, selectedRole?: string): Promise<IUser | null> {
    if (currentRole === "admin") {
      throw new Error("Admin role cannot be changed");
    }

    const newRole = selectedRole;
    return apiFetch<IUser>(`${this._baseUrl}/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
  }

  async Getuser(email: string): Promise<IUser | null> {
    return apiFetch<IUser | null>(
      `${this._baseUrl}/details/${encodeURIComponent(email)}`
    );
  }
  async getUserReviewLevel(userId?: string | undefined, startTime?: Date | undefined, endTime?: Date | undefined, role?: string, state?: string, crop?: string, domain?: string, status?: string, normalised_crop?: string): Promise<ReviewLevelCount[] | null> {
    const params = new URLSearchParams();

    if (startTime) {
      params.append("startTime", formatDateLocal(startTime));
    }

    if (endTime) {
      params.append("endTime", formatDateLocal(endTime));
    }
    if (userId) {
      params.append("userId", userId)
    }

    if (role) {
      params.append("role", role)
    }
    if (state) {
      params.append("state", state)
    }
    if (crop) {
      params.append("crop", crop)
    }
    if (domain) {
      params.append("domain", domain)
    }
    if (status) {
      params.append("status", status)
    }
    if (normalised_crop) {
      params.append("normalised_crop", normalised_crop)
    }
    return apiFetch<ReviewLevelCount[]>(`${this._baseUrl}/review-level?${params.toString()}`);
  }

  async verifyUser(userId: string, isVerified: boolean): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/${userId}/verify`, {
      method: "PATCH",
      body: JSON.stringify({ isVerified }),
    });
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

  /**
   * Get unverified users with search capability
   * @param page - Page number (default: 1)
   * @param limit - Results per page (default: 10)
   * @param search - Search query to filter users by name/email
   * @returns Paginated list of unverified users
   */
  async getUnverifiedUsers(
    page: number = 1,
    limit: number = 10,
    search: string = ""
  ): Promise<{
    users: IUnverifiedUser[];
    totalUsers: number;
    totalPages: number;
  } | null> {
    const analyticsBaseUrl = `${API_BASE_URL}/analytics`;
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);

    return apiFetch<{
      users: IUnverifiedUser[];
      totalUsers: number;
      totalPages: number;
    }>(
      `${analyticsBaseUrl}/unverified-users?${params.toString()}`
    );
  }

  /**
   * Verify a user (set isVerified to true)
   * @param userId - The ID of the user to verify
   * @returns Updated user object
   */
  async verifyUserInAnalytics(
    userId: string,
    source: string = "vicharanashala",
    isVerified: boolean = true,
  ): Promise<{ success: boolean; message: string; user: IUser } | null> {
    const analyticsBaseUrl = `${API_BASE_URL}/analytics`;
    const params = new URLSearchParams();
    params.append("source", source);

    return apiFetch<{ success: boolean; message: string; user: IUser }>(
      `${analyticsBaseUrl}/verify-user/${userId}?${params.toString()}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isVerified }),
      }
    );
  }
}

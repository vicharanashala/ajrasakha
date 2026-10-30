
import { apiFetch } from "../api/api-fetch";
import type { INotification } from "../../types";
import { env } from "@/config/env";
const API_BASE_URL = env.apiBaseUrl();

export class NotificationService {
  private _baseUrl = `${API_BASE_URL}/notifications`;


  async getUserNotifications(page:number,limit:number){
    const response = apiFetch<{notifications:INotification[];page:number;totalCount:number;totalPages:number}>(`${this._baseUrl}?page=${page}&limit=${limit}`)
    return response
  }

  async markNotificationAsRead(
      notificationId: string,
    ): Promise<INotification | null> {
      return apiFetch<INotification>(`${this._baseUrl}/${notificationId}`, {
        method: "PATCH",
      });
    }

    async markAllNotificationAsRead(
    ): Promise<INotification | null> {
      return apiFetch<INotification>(`${this._baseUrl}`, {
        method: "PATCH",
      });
    }

  async deleteNotification(notificationId: string): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/${notificationId}`, {
      method: "DELETE",
    });
  }

  // Fire-and-forget: tells this backend about a PoP upload-queue transition that just succeeded
  // against the external PoP microservice, so it can notify the relevant uploader/approvers/admins.
  async notifyPopEvent(body: {
    type: "upload_created" | "approved" | "admin_rejected" | "approver_rejected" | "admin_added";
    itemName: string;
    approverIds?: string[];
    uploaderId?: string;
    approverId?: string;
  }): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/pop-events`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

}

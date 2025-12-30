
import { apiFetch } from "../api/api-fetch";
import type { INotification } from "../../types";
import { env } from "@/config/env";
const API_BASE_URL = env.apiBaseUrl();

export class NotificationService {
  private _baseUrl = `${API_BASE_URL}/notifications`;


  async getUserNotifications(page:number,limit:number){
    const response = apiFetch<{notifications:INotification[];page:number;totalCount:number;totalPages:number}>(`${this._baseUrl}?page=${page}&limit=${limit}`)
    console.log("fromn respose ",response)
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

}

import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface ICropActivity {
  month: string;
  activity: string;
  description: string;
  type: string;
}

export interface ICropSeason {
  name: string;
  months: string[];
  activities: ICropActivity[];
}

export interface ICropCalendar {
  crop: string;
  seasons: ICropSeason[];
}

export interface IReminder {
  id: string;
  cropName: string;
  activity: string;
  remindBeforeDays: number;
  createdAt: string;
}

export class CropCalendarService {
  private _baseUrl = `${API_BASE_URL}/crop-calendar`;

  async getCrops(): Promise<string[]> {
    return apiFetch<string[]>(`${this._baseUrl}/crops`);
  }

  async getCalendar(cropName: string): Promise<ICropCalendar> {
    return apiFetch<ICropCalendar>(`${this._baseUrl}/${encodeURIComponent(cropName)}`);
  }

  async getUpcoming(cropName: string): Promise<ICropActivity[]> {
    return apiFetch<ICropActivity[]>(`${this._baseUrl}/${encodeURIComponent(cropName)}/upcoming`);
  }

  async createReminder(data: {
    cropName: string;
    activity: string;
    remindBeforeDays: number;
  }): Promise<IReminder> {
    return apiFetch<IReminder>(`${this._baseUrl}/reminders`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getReminders(): Promise<IReminder[]> {
    return apiFetch<IReminder[]>(`${this._baseUrl}/reminders`);
  }

  async deleteReminder(id: string): Promise<void> {
    await apiFetch<{ success: boolean; message: string }>(
      `${this._baseUrl}/reminders/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  }
}

export const cropCalendarService = new CropCalendarService();

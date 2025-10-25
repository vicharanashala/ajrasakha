import type {
  IQuestion,
} from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { INotification } from "../../types";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class NotificationService {
  private _baseUrl = `${API_BASE_URL}/notifications`;


  async getUserNotifications(page:number,limit:number){
    const response = apiFetch<INotification[] | null>(`${this._baseUrl}?page=${page}&limit=${limit}`)
    console.log("fromn respose ",response)
    return response
  }

  // async updateQuestion(
  //   questionId: string,
  //   updatedData: Partial<IDetailedQuestion>
  // ): Promise<IDetailedQuestion | null> {
  //   return apiFetch<IDetailedQuestion>(`${this._baseUrl}/${questionId}`, {
  //     method: "PUT",
  //     body: JSON.stringify(updatedData),
  //   });
  // }

  // async deleteQuestion(questionId: string): Promise<void | null> {
  //   return apiFetch<void>(`${this._baseUrl}/${questionId}`, {
  //     method: "DELETE",
  //   });
  // }
}

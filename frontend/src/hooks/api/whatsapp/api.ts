import { apiFetch } from "../../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface SendMessageRequest {
  phoneNumber: string;
  messageText: string;
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
}

export class WhatsAppService {
  private _baseUrl = `${API_BASE_URL}/whatsapp`;

  async sendMessage(phoneNumber: string, messageText: string): Promise<SendMessageResponse> {
    const url = `${this._baseUrl}/send-message`;
    try {
      const response = await apiFetch<SendMessageResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber, messageText }),
      });
      return response || { success: false, message: 'Failed to send message' };
    } catch (error) {
      console.error(`WhatsAppService.sendMessage: Error sending message to ${phoneNumber}:`, error);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();

// Export backward-compatible alias
export const whatsappApi = whatsappService;

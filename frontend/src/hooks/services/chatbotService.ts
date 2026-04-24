import { env } from '@/config/env';
import { auth } from '@/config/firebase';
import { getIdToken } from 'firebase/auth';

const API_BASE_URL = env.apiBaseUrl();

export class ChatbotService {
  private _baseUrl = `${API_BASE_URL}/analytics`;

  async downloadChatbotReport(
    startDate: string,
    endDate: string,
    source = 'vicharanashala',
  ): Promise<Blob> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await getIdToken(user);
    const params = new URLSearchParams({ startDate, endDate, source });
    const response = await fetch(
      `${this._baseUrl}/download-chatbot-report?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any)?.message ?? 'Download failed');
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      throw new Error(json?.message ?? 'No data found for the selected date range');
    }
    return response.blob();
  }
}

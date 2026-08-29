import { type Page } from '@playwright/test';

/**
 * API Helper — Direct API calls for test setup, teardown, and assertions.
 *
 * Uses the page's request context to make authenticated API calls,
 * leveraging the Firebase token already stored in the browser session.
 */
export class ApiHelper {
  private readonly page: Page;
  private readonly baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = process.env.STAGING_BASE_URL || 'https://desk.vicharanashala.ai';
  }

  /**
   * Make an authenticated GET request via the browser context.
   * This automatically sends cookies and localStorage-based auth.
   */
  async get<T = unknown>(endpoint: string): Promise<T> {
    const response = await this.page.evaluate(async (url: string) => {
      const token = localStorage.getItem('firebase-auth-token') || '';
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      return res.json();
    }, `${this.baseUrl}${endpoint}`);
    return response as T;
  }

  /**
   * Make an authenticated POST request via the browser context.
   */
  async post<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    const response = await this.page.evaluate(
      async ({ url, data }: { url: string; data?: Record<string, unknown> }) => {
        const token = localStorage.getItem('firebase-auth-token') || '';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: data ? JSON.stringify(data) : undefined,
        });
        return res.json();
      },
      { url: `${this.baseUrl}${endpoint}`, data: body },
    );
    return response as T;
  }

  // ── Convenience methods for common API calls ────────────────

  /** GET /api/questions/queue-details */
  async getQueueDetails() {
    return this.get<{
      stuck: number;
      unallocated: number;
      needsReviewer: number;
      [key: string]: number;
    }>('/api/questions/queue-details');
  }

  /** GET /api/notifications */
  async getNotifications() {
    return this.get<{
      data: Array<{
        _id: string;
        title: string;
        message: string;
        is_read: boolean;
        createdAt: string;
      }>;
    }>('/api/notifications');
  }

  /** GET /api/performance/golden-dataset */
  async getGoldenDatasetAnalytics() {
    return this.get<{
      totalQuestions: number;
      totalAnswers: number;
      [key: string]: unknown;
    }>('/api/performance/golden-dataset');
  }

  /** POST /api/questions/allocated — get questions assigned to current expert */
  async getAllocatedQuestions() {
    return this.post<{
      questions: Array<{
        _id: string;
        question: string;
        status: string;
        [key: string]: unknown;
      }>;
    }>('/api/questions/allocated');
  }
}

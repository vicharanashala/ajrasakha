import { injectable } from 'inversify';
import axios from 'axios';
import { appConfig } from '#root/config/app.js';
import type { IBsnlTokenStatusResponse } from '../types.js';

@injectable()
export class BrpsTokenService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Return a valid BRPS JWT token, refreshing if expired or missing.
   */
  async getValidToken(): Promise<string> {
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }
    await this.refreshToken();
    if (!this.token) {
      throw new Error('Failed to obtain a valid BSNL BRPS token');
    }
    return this.token;
  }

  /**
   * Create or refresh the BRPS JWT token.
   * Tokens are valid for 1 year from BSNL; we refresh proactively 2 days early.
   */
  async refreshToken(): Promise<void> {
    const { baseUrl, serviceId, username, password, tokenId, ipWhitelist } = appConfig.bsnl;

    if (!serviceId || !username || !password) {
      throw new Error(
        'BSNL credentials incomplete. Please configure BSNL_SERVICE_ID, BSNL_USERNAME, and BSNL_PASSWORD in your environment.'
      );
    }

    const body: Record<string, unknown> = {
      Service_Id: serviceId,
      Username: username,
      Password: password,
      Token_Id: tokenId || '1',
      IP_Addresses: ipWhitelist ? ipWhitelist.split(',').map((ip: string) => ip.trim()).filter(Boolean) : null,
    };

    try {
      // console.log(`[BRPS-TOKEN] Requesting BSNL API token (Token_Id: ${body.Token_Id})`);

      const response = await axios.post(`${baseUrl}/api/Create_New_API_Token`, body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        timeout: 15000,
      });

      const rawData = response.data;
      let tokenStr = '';

      if (typeof rawData === 'string') {
        // Strip any wrapping quotes if returned as a JSON-encoded string literal
        tokenStr = rawData.replace(/^"+|"+$/g, '').trim();
      } else if (rawData && typeof rawData === 'object') {
        tokenStr = rawData.token || rawData.Token || JSON.stringify(rawData);
      }

      if (!tokenStr) {
        throw new Error('Received empty token from BSNL BRPS server');
      }

      this.token = tokenStr;
      // Proactively refresh 2 days before the 1-year (365-day) expiry
      this.tokenExpiry = new Date(Date.now() + 363 * 24 * 60 * 60 * 1000);

      // console.log(`[BRPS-TOKEN] Token acquired successfully. Valid until: ${this.tokenExpiry.toISOString()}`);
    } catch (err: any) {
      const errorData = err.response?.data;
      const errorMsg = errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData)) : err.message;
      console.error(`[BRPS-TOKEN] Token refresh failed: ${errorMsg}`);
      throw new Error(`BSNL BRPS token refresh failed: ${errorMsg}`);
    }
  }

  /**
   * Check the current token's validity via the Get_Token_Status API.
   */
  async isTokenValid(): Promise<boolean> {
    if (!this.token) return false;

    const { baseUrl, tokenId } = appConfig.bsnl;

    try {
      const response = await axios.post<IBsnlTokenStatusResponse>(
        `${baseUrl}/api/Get_Token_Status`,
        { Token_Id: tokenId || '1' },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          timeout: 10000,
        }
      );

      const data = response.data;
      return !data.Error;
    } catch (err: any) {
      console.warn(`[BRPS-TOKEN] Token status check failed:`, err.response?.data || err.message);
      return false;
    }
  }
}

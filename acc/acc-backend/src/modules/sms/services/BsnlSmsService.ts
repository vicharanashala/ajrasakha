import { inject, injectable } from 'inversify';
import axios from 'axios';
import { appConfig } from '#root/config/app.js';
import { SMS_TYPES } from '../types.js';
import { BrpsTokenService } from './BrpsTokenService.js';
import type {
  IBsnlConfig,
  IBsnlSendSmsPayload,
  IBsnlSendSmsResponse,
  ISendSmsResult,
} from '../types.js';

const DLT_ERROR_DESCRIPTIONS: Record<string, string> = {
  '600': 'ENTITY_NOT_FOUND (No record found with EID as primary key)',
  '601': 'ENTITY_NOT_REGISTERED (No entry of entity on the platform)',
  '602': 'ENTITY_INACTIVE (Entity is Inactive on the platform)',
  '603': 'ENTITY_BLACKLISTED (Entity is blacklisted on all platforms)',
  '604': 'INVALID_ENTITY_ID (Received wrong entity id format or no entity id tag)',
  '620': 'HEADER_NOT_FOUND (No record found with header as primary key)',
  '621': 'HEADER_INACTIVE (Header is inactive on the platform)',
  '622': 'HEADER_BLACKLISTED (Header is blacklisted on all platforms)',
  '623': 'PEID_NOT_MATCHED_WITH_HEADER (Principal Entity Id not matched with Header Id)',
  '630': 'TEMPLATE_NOT_FOUND (No record found with Template Id as primary key)',
  '631': 'TEMPLATE_INACTIVE (Template is inactive on the platform)',
  '632': 'TEMPLATE_BLACKLISTED (Template is blacklisted on all platforms)',
  '633': 'TEMPLATE_NOT_MATCHED (Template not matched for the given Template Id)',
  '634': 'HEADER_NOT_REGISTERED_FOR_TEMPLATE (Header is not registered for the template)',
  '635': 'TEMPLATE_VARIABLE_EXCEEDED_MAX_LENGTH (Variable length exceeded the max configured length)',
  '636': 'ERROR_IDENTIFYING_TEMPLATE (Error in identifying the Template)',
  '637': 'INVALID_TEMPLATE_ID (Received wrong Template id format)',
  '670': 'SCRUBBING_FAILED (General error code in case of any exceptions)',
};

@injectable()
export class BsnlSmsService {
  constructor(
    @inject(SMS_TYPES.BrpsTokenService) private tokenService: BrpsTokenService
  ) { }

  /**
   * Send an advisory SMS via BSNL BRPS using the DLT-registered Send_SMS API.
   *
   * @param destination 10-digit Indian phone number (with or without +91 / 0)
   * @param text Message body to be populated into the registered template variable (e.g. "advisory")
   */
  async sendSms(destination: string, text: string): Promise<ISendSmsResult> {
    if (!destination || !text) {
      throw new Error('Destination phone number and text are required');
    }

    // Sanitize destination number (take last 10 digits)
    const cleanNumber = destination.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanNumber)) {
      throw new Error(`Invalid 10-digit Indian mobile number: ${destination}`);
    }

    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error('Message text cannot be empty');
    }

    const bsnlConfig = appConfig.bsnl as IBsnlConfig;
    const {
      baseUrl,
      header,
      entityId,
      templateId,
      messageType,
      variableKey,
      isUnicode: configuredUnicode,
    } = bsnlConfig;

    if (!entityId || !templateId) {
      throw new Error(
        'BSNL BRPS configuration incomplete. Please configure BSNL_ENTITY_ID and BSNL_TEMPLATE_ID in environment variables.'
      );
    }

    // Template is registered as Unicode ("1") in BSNL DLT
    const isUnicode: '0' | '1' =
      configuredUnicode === '0'
        ? '0'
        : '1';

    // Retrieve valid JWT token (cached or refreshed)
    let token = await this.tokenService.getValidToken();

    const payload: IBsnlSendSmsPayload = {
      Header: header || 'ANNAMR',
      Target: cleanNumber,
      Is_Unicode: isUnicode,
      Is_Flash: '0',
      Message_Type: messageType || 'SI',
      Entity_Id: entityId,
      Content_Template_Id: templateId,
      Consent_Template_Id: '',
      Template_Keys_and_Values: [
        {
          Key: variableKey || 'advisory',
          Value: cleanText,
        },
      ],
    };

    const doSend = async (authToken: string) => {
      return axios.post<IBsnlSendSmsResponse>(
        `${baseUrl}/api/Send_SMS`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          timeout: 20000,
        }
      );
    };

    try {
      let response;
      try {
        response = await doSend(token);
      } catch (firstErr: any) {
        if (firstErr.response?.status === 401) {
          console.warn(`[BSNL-SMS] Received 401 Unauthorized from BSNL. Refreshing token and retrying SMS to ${cleanNumber}...`);
          this.tokenService.clearToken();
          token = await this.tokenService.getValidToken();
          response = await doSend(token);
        } else {
          throw firstErr;
        }
      }

      const data = response.data;

      if (data?.Error) {
        const errorDesc = DLT_ERROR_DESCRIPTIONS[data.Error] || data.Error;
        console.error(`[BSNL-SMS] API error for ${cleanNumber}: ${errorDesc}`);
        throw new Error(`BSNL BRPS API error: ${errorDesc}`);
      }

      // console.log(`[BSNL-SMS] SMS sent successfully to ${cleanNumber} (Message_Id: ${data?.Message_Id ?? 'unknown'})`);

      return {
        success: true,
        messageId: data?.Message_Id,
        data,
      };
    } catch (err: any) {
      const errorData = err.response?.data;
      const rawError = errorData?.Error || errorData?.message || (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData) || err.message;
      const errorDesc = DLT_ERROR_DESCRIPTIONS[rawError] || rawError;

      console.error(`[BSNL-SMS] Failed to send SMS to ${cleanNumber}:`, errorDesc);
      throw new Error(`BSNL BRPS sending failed: ${errorDesc}`);
    }
  }
}

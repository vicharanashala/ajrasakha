export const SMS_TYPES = {
  BrpsTokenService: Symbol.for('BrpsTokenService'),
  BsnlSmsService: Symbol.for('BsnlSmsService'),
  ISmsService: Symbol.for('ISmsService'),
};

export interface IBsnlConfig {
  baseUrl: string;
  serviceId: string;
  username: string;
  password: string;
  tokenId: string;
  ipWhitelist: string;
  header: string;
  entityId: string;
  templateId: string;
  messageType: string;
  variableKey: string;
  isUnicode?: string;
}

export interface ISendSmsOptions {
  destination: string;
  text: string;
}

export interface ISendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: any;
}

export interface IBsnlSendSmsPayload {
  Header: string;
  Target: string;
  Is_Unicode: '0' | '1';
  Is_Flash: '0' | '1';
  Message_Type: string;
  Entity_Id: string;
  Content_Template_Id: string;
  Consent_Template_Id: string;
  Template_Keys_and_Values: Array<{
    Key: string;
    Value: string;
  }>;
}

export interface IBsnlSendSmsResponse {
  Error: string | null;
  Message_Id?: string;
}

export interface IBsnlTokenStatusResponse {
  Error: string | null;
  Token_Id?: string;
  Validity_Left_In_Days?: string;
  Expiry_Time?: string;
  status?: boolean;
}

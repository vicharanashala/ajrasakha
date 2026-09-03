import { env } from '#root/utils/env.js';

export const appConfig = {
  isProduction: env('NODE_ENV') === 'production',
  isStaging: env('NODE_ENV') === 'staging',
  isDevelopment: env('NODE_ENV') === 'development',
  port: Number(env('PORT')) || Number(env('APP_PORT')) || 4001,
  url: env('APP_URL'),
  origins: env('APP_ORIGINS')?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:8080', 'http://localhost:8081'],
  module: env('APP_MODULE') || 'all',
  routePrefix: env('APP_ROUTE_PREFIX') || '/api',
  frontendUrl: env('FRONTEND_URL') || 'http://localhost:5173',
  sarvamAPI: env('SARVAM_API_KEY'),
  firebase: {
    clientEmail: env('FIREBASE_CLIENT_EMAIL') || undefined,
    privateKey: env('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n') || undefined,
    projectId: env('FIREBASE_PROJECT_ID') || undefined,
    apiKey: env('FIREBASE_API_KEY') || undefined,
    storageBucket: env('FIREBASE_STORAGE_BUCKET') || 'vibe-aiserver-data',
  },
  sentry: {
    dsn: env('SENTRY_DSN') || undefined,
    environment: env('NODE_ENV') || 'development',
    sendDefaultPii: true,
  },
  GOOGLE_APPLICATION_CREDENTIALS: env('GOOGLE_APPLICATION_CREDENTIALS') || null,
  plivo: {
    streamUrl: env('PLIVO_STREAM_URL') || 'wss://dummy-stream-url.example.com',
    authId: env('PLIVO_AUTH_ID') || 'dummy-plivo-auth-id',
    authToken: env('PLIVO_AUTH_TOKEN') || 'dummy-plivo-auth-token',
    plivo_number: env('PLIVO_NUMBER') || env('PLIVO_CALLER_ID') || env('PLIVO_PHONE_NUMBER') || '+918031150392',
    recordCallbackUrl: env('PLIVO_RECORD_CALLBACK_URL') || `${env('APP_URL') || 'http://localhost:4001'}/api/plivo/webhook/record`,
  },
  storage: {
    recordingsPathPrefix: env('GCP_RECORDINGS_PATH_PREFIX') || 'call-recordings',
  },
  fast2sms: {
    apiKey: env('FAST2SMS_API_KEY'),
  },
  bsnl: {
    baseUrl: env('BSNL_BASE_URL') || 'https://bulksms.bsnl.in:5010',
    serviceId: env('BSNL_SERVICE_ID') || '',
    username: env('BSNL_USERNAME') || '',
    password: env('BSNL_PASSWORD') || '',
    tokenId: env('BSNL_TOKEN_ID') || '1',
    ipWhitelist: env('BSNL_IP_WHITELIST') || '',
    header: env('BSNL_HEADER') || 'ANNAMR',
    entityId: env('BSNL_ENTITY_ID') || '',
    templateId: env('BSNL_TEMPLATE_ID') || '',
    messageType: env('BSNL_MESSAGE_TYPE') || 'SI',
    variableKey: env('BSNL_VARIABLE_KEY') || 'advisory',
    isUnicode: env('BSNL_IS_UNICODE') || '1',
  },
};


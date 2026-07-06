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
    plivo_number: env('PLIVO_NUMBER') || '+15551234567',
    getAgentCredentials: (agentNumber: string) => {
      const username = env(`PLIVO_ENDPOINT_USERNAME_${agentNumber.toUpperCase()}`);
      return { username };
    },
  },
  fast2sms: {
    apiKey: env('FAST2SMS_API_KEY'),
  },
};

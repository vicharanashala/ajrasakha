import { env } from '#root/utils/env.js';

export const aiConfig = {
  serverIP: env('AI_SERVER_IP') || 'localhost',
  serverPort: Number(env('AI_SERVER_PORT')?.trim()) || 9017,
  // ACC Agent (Human-in-the-Loop) Configuration
  accAgentBaseUrl: env('ACC_AGENT_BASE_URL'),
  accAgentAssistantId: env('ACC_AGENT_ASSISTANT_ID'),
  accAgentTimeout: Number(env('ACC_AGENT_TIMEOUT')?.trim()) || 10000,
};

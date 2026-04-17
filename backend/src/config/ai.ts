import { env } from '#root/utils/env.js';

export const aiConfig = {
    serverIP: env('AI_SERVER_IP') || 'localhost',
    serverPort: Number(env('AI_SERVER_PORT')?.trim()) || 9017,
    proxyAddress: env('AI_PROXY_ADDRESS') || 'socks5h://localhost:1055',
    agentServerIP: env('AGENT_SERVER_IP'),
    agerntServerPort: Number(env('AGENT_SERVER_PORT')?.trim()) || 9017,
    openAIServerIP: env('OPENAI_SERVER_IP'),
    openAIServerPort: Number(env('OPENAI_SERVER_PORT')?.trim()) || 8080,
    gemma_api: env('GEMMA_API'),
    gemma_api_key: env('GEMMA_API_KEY') || 'test-key',
};

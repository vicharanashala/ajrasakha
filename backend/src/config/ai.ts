import { env } from '#root/utils/env.js';

export const aiConfig = {
  serverIP: env('AI_SERVER_IP') || 'localhost',
  serverPort: Number(env('AI_SERVER_PORT')?.trim()) || 9017,
  // Tailscale's userspace proxy (see scripts/start.sh). SOCKS5 for node http agents
  // (axios), HTTP CONNECT for undici (fetch) — tailscaled serves both on the same port.
  proxyAddress: env('AI_PROXY_ADDRESS') || 'socks5h://localhost:1055',
  httpProxyAddress: env('AI_HTTP_PROXY_ADDRESS') || 'http://localhost:1055',
  /**
   * Force the tailnet proxy on/off. Leave UNSET (the normal case) and the app probes for a
   * proxy at boot: present on Cloud Run (userspace networking, no route to 100.x without
   * it), absent on the VM (real TUN interface, direct route already works).
   */
  tailnetProxyMode: env('USE_TAILNET_PROXY')?.trim(),
  agentServerIP: env('AGENT_SERVER_IP'),
  agerntServerPort: Number(env('AGENT_SERVER_PORT')?.trim()) || 9017,
  openAIServerIP: env('OPENAI_SERVER_IP'),
  openAIServerPort: Number(env('OPENAI_SERVER_PORT')?.trim()) || 8080,
  whatsAppServerPort: Number(env('WHATSAPP_SERVER_PORT')?.trim()) || 2026,
  aiInitialAnswerGenerateUrl: env('AI_INITIAL_ANSWER_GENERATE_URL'),
  gemma_api: env('GEMMA_API'),
  gemma_api_key: env('GEMMA_API_KEY') || 'test-key',
  minimax_api: env('MINIMAX_API'),
  minimax_api_key: env('MINIMAX_API_KEY') || 'test-key',
  WHATSAPP_SERVER_URL: env('WHATSAPP_SERVER_URL'),
  vicharanashala_api_token: env('VICHARANASHALA_API_TOKEN'),
  gdbServerIP: env('GDB_SERVER_IP') || 'localhost',
  gdbServerPort: Number(env('GDB_SERVER_PORT')?.trim()) || 8110,
  // ACC Agent (Human-in-the-Loop) Configuration
  accAgentBaseUrl: env('ACC_AGENT_BASE_URL'),
  accAgentAssistantId: env('ACC_AGENT_ASSISTANT_ID'),
  accAgentTimeout: Number(env('ACC_AGENT_TIMEOUT')?.trim()) || 10000,
};

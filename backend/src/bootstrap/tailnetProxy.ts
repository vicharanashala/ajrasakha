import axios from 'axios';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { aiConfig } from '#root/config/ai.js';

/**
 * Routes tailnet-bound HTTP traffic through the local Tailscale proxy.
 *
 * `tailscaled` runs with `--tun=userspace-networking`, which creates NO network
 * interface — so nothing in the container can dial a 100.x CGNAT address directly. The
 * ONLY way onto the tailnet is the proxy tailscaled exposes on localhost:1055 (SOCKS5 for
 * node's http/https agents, HTTP CONNECT for undici).
 *
 * The AI, agent, GDB and WhatsApp servers all live on the tailnet (AI_SERVER_IP =
 * 100.100.108.44), and the app reaches them two different ways — axios (chatbot,
 * WhatsApp) and global fetch (AiService). Both are patched here.
 *
 * Only tailnet hosts are diverted. Everything else (Firebase, LGD, Plivo, Mongo Atlas)
 * keeps its direct route, so a Tailscale problem can't take down unrelated traffic.
 */

/** Tailscale's CGNAT range is 100.64.0.0/10 → the second octet runs 64–127. */
const isTailnetHost = (hostname: string): boolean => {
  if (hostname.endsWith('.ts.net')) return true;

  const m = /^100\.(\d+)\./.exec(hostname);
  if (!m) return false;

  const second = Number(m[1]);
  return second >= 64 && second <= 127;
};

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export function installTailnetProxy(): void {
  // socks5h:// — resolve DNS at the proxy, so MagicDNS names work too.
  const socksProxy = aiConfig.proxyAddress; // socks5h://localhost:1055
  const httpProxy = aiConfig.httpProxyAddress; // http://localhost:1055

  // ── axios (ChatbotService, WhatsAppService) ────────────────────────────────
  // An interceptor rather than a global default: attaching the agent per-request keeps
  // every non-tailnet call on its normal path.
  const socksAgent = new SocksProxyAgent(socksProxy);

  axios.interceptors.request.use(config => {
    const url = config.baseURL
      ? new URL(config.url ?? '', config.baseURL).toString()
      : (config.url ?? '');

    if (isTailnetHost(hostnameOf(url))) {
      config.httpAgent = socksAgent;
      config.httpsAgent = socksAgent;
      config.proxy = false; // don't let axios also apply HTTP_PROXY on top
    }
    return config;
  });

  // ── global fetch (AiService) ───────────────────────────────────────────────
  // Node's built-in fetch takes no agent, and undici's `setGlobalDispatcher` does not
  // affect it (the runtime bundles its own private undici). So global fetch is replaced
  // with undici's, which does accept a per-request dispatcher.
  const proxyAgent = new ProxyAgent(httpProxy);
  const nativeFetch = globalThis.fetch;

  globalThis.fetch = ((input: any, init?: any) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input?.url ?? '');

    if (!isTailnetHost(hostnameOf(url))) return nativeFetch(input, init);

    return undiciFetch(url, { ...init, dispatcher: proxyAgent });
  }) as typeof globalThis.fetch;

  console.log(`🔌 Tailnet proxy installed (socks: ${socksProxy}, http: ${httpProxy})`);
}

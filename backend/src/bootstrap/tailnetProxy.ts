import net from 'net';
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
export const isTailnetHost = (hostname: string): boolean => {
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

/**
 * Is a Tailscale proxy actually listening?
 *
 * This is what separates the two deployments:
 *
 *   • VM         — tailscaled has a real TUN interface (tailscale0), so 100.x is directly
 *                  routable. NOTHING listens on 1055, and forcing traffic through a proxy
 *                  there would break calls that work today.
 *   • Cloud Run  — /dev/net/tun is forbidden, so tailscaled runs with
 *                  --tun=userspace-networking. There is no interface; the proxy on
 *                  localhost:1055 is the only way onto the tailnet.
 *
 * Probing the port tells the two apart with no configuration, so the same image runs
 * correctly in both. `USE_TAILNET_PROXY=true|false` overrides the probe either way.
 */
function proxyIsListening(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/** Set once at boot by installTailnetProxy(); gates the agent handed to the FAQ/POP proxies. */
let proxyActive = false;

/**
 * A SOCKS agent for `targetUrl` when it lives on the tailnet AND we're proxying, else
 * undefined (on the VM, undefined is correct — the direct route works).
 *
 * For clients that use node's raw http module and therefore can't be patched globally —
 * notably http-proxy-middleware, which fronts the FAQ/POP servers (both 100.x).
 */
export function tailnetAgentFor(targetUrl: string): SocksProxyAgent | undefined {
  if (!proxyActive) return undefined;
  if (!isTailnetHost(hostnameOf(targetUrl))) return undefined;
  return new SocksProxyAgent(aiConfig.proxyAddress);
}

export async function installTailnetProxy(): Promise<void> {
  // socks5h:// — resolve DNS at the proxy, so MagicDNS names work too.
  const socksProxy = aiConfig.proxyAddress; // socks5h://localhost:1055
  const httpProxy = aiConfig.httpProxyAddress; // http://localhost:1055

  const { hostname, port } = new URL(httpProxy);
  const probePort = Number(port) || 1055;

  // Explicit setting wins; otherwise decide by whether a proxy is actually there.
  const forced = aiConfig.tailnetProxyMode; // 'true' | 'false' | undefined
  const available =
    forced === 'true'
      ? true
      : forced === 'false'
        ? false
        : await proxyIsListening(hostname, probePort);

  if (!available) {
    // The VM path: tailscaled has a real interface, so 100.x is directly routable and no
    // patching is needed (or wanted — routing through a dead proxy would break it).
    console.log(
      `🔌 No Tailscale proxy on ${hostname}:${probePort} — using the direct route to the tailnet.`,
    );
    return;
  }

  proxyActive = true;

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

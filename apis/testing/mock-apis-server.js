import http from 'http';
import url from 'url';

function generateSwaggerHtml(title) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Swagger UI</title>
      </head>
      <body>
        <div id="swagger-ui" class="swagger-ui">
          <div class="topbar"><div class="wrapper"><span class="title">${title}</span></div></div>
          <div class="wrapper">
            <section class="block">
              <h2>Operations</h2>
              <div class="opblock opblock-post"><span class="opblock-summary-method">POST</span></div>
              <div class="opblock opblock-get"><span class="opblock-summary-method">GET</span></div>
            </section>
          </div>
        </div>
      </body>
    </html>
  `;
}

const OPENAPI_SPEC = {
  openapi: '3.0.2',
  info: { title: 'Ajrasakha Microservices API', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health Check', responses: { '200': { description: 'Successful Response' } } } },
    '/classify-question': { post: { summary: 'Classify Question', responses: { '200': { description: 'Successful Response' }, '400': { description: 'Bad Request' }, '422': { description: 'Validation Error' } } } },
    '/detect-chemicals': { post: { summary: 'Detect Chemicals', responses: { '200': { description: 'Successful Response' }, '400': { description: 'Bad Request' } } } },
  },
};

// 1. Agriculture Classifier on 8005
export function startClassifierMock(port = 8005) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Agriculture Question Classifier'));
    }

    if (parsed.pathname === '/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(OPENAPI_SPEC));
    }

    res.setHeader('Content-Type', 'application/json');

    if (parsed.pathname === '/health') {
      if (req.method !== 'GET') {
        res.writeHead(405);
        return res.end(JSON.stringify({ detail: 'Method Not Allowed' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (parsed.pathname === '/classify-question') {
      if (req.method !== 'POST') {
        res.writeHead(405);
        return res.end(JSON.stringify({ detail: 'Method Not Allowed' }));
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');

          // Schema type validation: question must be string
          if (data.question !== undefined && typeof data.question !== 'string') {
            res.writeHead(422);
            return res.end(JSON.stringify({
              detail: [{ loc: ['body', 'question'], msg: 'str type expected', type: 'type_error.str' }]
            }));
          }

          // Empty / whitespace validation
          if (!data.question || !data.question.trim()) {
            res.writeHead(400);
            return res.end(JSON.stringify({ detail: "Field 'question' must not be empty." }));
          }

          // Buffer overflow / extreme length protection test
          if (data.question.length > 20000) {
            res.writeHead(413);
            return res.end(JSON.stringify({ detail: 'Payload exceeds maximum allowable query size.' }));
          }

          const q = data.question.toLowerCase();
          const isAgri = /crop|wheat|paddy|fertilizer|pest|soil|borer|sugarcane|urea|irrigation|fungicide|rust|rot|khet|fasal|dhan|gehu|keeda|sarson|chaff|straw|cattle|weather|rain|forecast|mausam|rice|mandi|subsidy|scheme/i.test(q);
          const isFinancialOrMalicious = /stock|shares|crypto|bomb|explosive/i.test(q);

          if (isFinancialOrMalicious || !isAgri) {
            res.writeHead(200);
            return res.end(JSON.stringify({
              is_agriculture: false,
              disclaimer: 'This question is not related to agriculture. Please submit an agricultural query.'
            }));
          }

          res.writeHead(200);
          return res.end(JSON.stringify({
            is_agriculture: true,
            disclaimer: 'NA'
          }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Malformed JSON payload.' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });
  return server.listen(port);
}

// 2. Banned Chemical Detector on 8002
export function startChemicalDetectorMock(port = 8002) {
  const BANNED_CHEMICALS = [
    'aldrin', 'endosulfan', 'ddt', 'chlordane', 'dieldrin', 'heptachlor',
    'hexachlorobenzene', 'mirex', 'toxaphene', 'parathion', 'monocrotophos'
  ];

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Banned Chemical Detector'));
    }

    res.setHeader('Content-Type', 'application/json');

    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok', service: 'chemical_detector' }));
    }

    if (parsed.pathname === '/detect-chemicals') {
      if (req.method !== 'POST') {
        res.writeHead(405);
        return res.end(JSON.stringify({ detail: 'Method Not Allowed' }));
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.text === undefined) {
            res.writeHead(400);
            return res.end(JSON.stringify({ detail: "Field 'text' is required." }));
          }

          let normalized = data.text.toLowerCase();
          normalized = normalized.replace(/0/g, 'o').replace(/1/g, 'i').replace(/4/g, 'a').replace(/3/g, 'e').replace(/5/g, 's');

          const detected = BANNED_CHEMICALS.filter(chem => normalized.includes(chem));

          res.writeHead(200);
          return res.end(JSON.stringify({
            detected,
            count: detected.length,
            is_safe: detected.length === 0
          }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Malformed JSON payload.' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });
  return server.listen(port);
}

// 3. Writing Assistant on 8004
export function startWritingAssistantMock(port = 8004) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Writing Assistant API'));
    }
    res.setHeader('Content-Type', 'application/json');
    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ready' }));
  });
  return server.listen(port);
}

// 4. Weather API on 8000
export function startWeatherMock(port = 8000) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Ajrasakha Live Weather API'));
    }
    res.setHeader('Content-Type', 'application/json');
    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok', station_cache: 'ready' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify({ live: { temp: 28, humidity: 65, rain_forecast: 'light rain expected' } }));
  });
  return server.listen(port);
}

// 5. AI API Agent on 2026
export function startAiApiMock(port = 2026) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');

    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok', database: 'connected' }));
    }
    if (parsed.pathname === '/ready') {
      res.writeHead(200);
      return res.end(JSON.stringify({ ready: true }));
    }
    if (parsed.pathname === '/info') {
      res.writeHead(200);
      return res.end(JSON.stringify({ version: '1.0.0', service: 'ai_api' }));
    }
    if (parsed.pathname === '/assistants') {
      res.writeHead(200);
      return res.end(JSON.stringify([{ id: 'ajrasakha_agent', name: 'Ajrasakha Agent' }]));
    }
    if (parsed.pathname === '/runs/stream') {
      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write('event: values\ndata: {"messages":[{"content":"Hello! How can I assist you with farming today?"}]}\n\n');
        return res.end();
      }
    }
    res.writeHead(404);
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });
  return server.listen(port);
}

// 6. Backend Desk API on 3000
export function startBackendApiMock(port = 3000) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');

    const authHeader = req.headers['authorization'];
    const isAuthed = authHeader && authHeader.startsWith('Bearer ');

    // Auth endpoints
    if (parsed.pathname === '/auth/login') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const parsedBody = JSON.parse(body || '{}');
          if (!parsedBody.username && !parsedBody.email) {
            res.writeHead(400);
            return res.end(JSON.stringify({ detail: 'Empty login body rejected.' }));
          }
          res.writeHead(200);
          res.end(JSON.stringify({ token: 'mock-jwt-token' }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Invalid JSON' }));
        }
      });
      return;
    }

    if (parsed.pathname === '/auth/sync') {
      if (!isAuthed) {
        res.writeHead(401);
        return res.end(JSON.stringify({ detail: 'Unauthorized' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ synced: true }));
    }

    // Questions, Answers, Analytics require authentication
    if (parsed.pathname.startsWith('/questions/') || parsed.pathname.startsWith('/answers/') || parsed.pathname.startsWith('/analytics')) {
      if (!isAuthed) {
        res.writeHead(401);
        return res.end(JSON.stringify({ detail: 'Unauthorized: Authentication credentials required.' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok', data: [] }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });
  return server.listen(port);
}

// 7. WhatsApp API on 4000
export function startWhatsappApiMock(port = 4000) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');

    const authHeader = req.headers['authorization'];
    const isAuthed = authHeader && authHeader.startsWith('Bearer ');

    if (!isAuthed) {
      res.writeHead(401);
      return res.end(JSON.stringify({ detail: 'Unauthorized: WhatsApp token required' }));
    }

    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', users: [], threads: [] }));
  });
  return server.listen(port);
}

// 8. MCP Services Mock Harness (Ports: 9005, 9008, 9002, 9006, 9007, 9000, 9009, 9101, 9017)
export function startMcpMockServer(port, name) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', service: name, port }));
    }

    if (parsed.pathname === '/mcp') {
      // MCP protocol verification: returns 406 Not Acceptable when accessed via HTTP GET without SSE header,
      // but includes text/event-stream in response as validated by QA Layer 2!
      res.writeHead(406, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-MCP-Service': name,
      });
      return res.end('event: error\ndata: {"detail": "Client must accept text/event-stream for MCP SSE transport"}\n\n');
    }

    res.writeHead(404);
    res.end('Not Found');
  });
  return server.listen(port);
}

export function startAllMcpMocks() {
  const mcpConfigs = [
    { port: 9005, name: 'gdb_mcp' },
    { port: 9008, name: 'soil_mcp' },
    { port: 9002, name: 'enam_mcp' },
    { port: 9006, name: 'agmarknet_mcp' },
    { port: 9007, name: 'reviewer_mcp' },
    { port: 9000, name: 'location_mcp' },
    { port: 9009, name: 'schemes_mcp' },
    { port: 9101, name: 'chemical_checker_mcp' },
    { port: 9017, name: 'weather_mcp' },
  ];

  const servers = [];
  for (const c of mcpConfigs) {
    servers.push(startMcpMockServer(c.port, c.name));
  }
  return servers;
}

if (process.argv[1]?.endsWith('mock-apis-server.js')) {
  startClassifierMock(8005);
  startChemicalDetectorMock(8002);
  startWritingAssistantMock(8004);
  startWeatherMock(8000);
  startAiApiMock(2026);
  startBackendApiMock(3000);
  startWhatsappApiMock(4000);
  startAllMcpMocks();
  console.log('All apis/ & MCP mock microservices running!');
}

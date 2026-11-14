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
          // Keyword classification including multilingual/Hinglish agricultural terms
          const isAgri = /crop|wheat|paddy|fertilizer|pest|soil|borer|sugarcane|urea|irrigation|fungicide|rust|rot|khet|fasal|dhan|gehu|keeda|sarson|chaff|straw|cattle/i.test(q);
          const isFinancialOrMalicious = /stock|shares|crypto|bomb|explosive/i.test(q);

          const finalIsAgri = isAgri && !isFinancialOrMalicious;

          res.writeHead(200);
          res.end(JSON.stringify({
            is_agriculture: finalIsAgri,
            disclaimer: finalIsAgri ? 'NA' : 'This question is not related to agriculture. Please submit an agricultural query.'
          }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Invalid JSON payload received.' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });
  return server.listen(port);
}

// 2. Chemical Detector on 8002
export function startChemicalDetectorMock(port = 8002) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Banned Chemical Detector'));
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

          if (data.text !== undefined && typeof data.text !== 'string') {
            res.writeHead(422);
            return res.end(JSON.stringify({ detail: 'Field text must be a valid string' }));
          }

          const rawText = (data.text || '').toLowerCase();
          const bannedList = ['aldrin', 'endosulfan', 'ddt', 'chlordane', 'dieldrin', 'heptachlor'];
          // Check banned chemicals, handling leetspeak or spacing (0 -> o, 1 -> i, 4 -> a)
          const normalized = rawText.replace(/0/g, 'o').replace(/1/g, 'i').replace(/4/g, 'a');
          const detected = bannedList.filter(b => normalized.includes(b));

          res.writeHead(200);
          res.end(JSON.stringify({ detected, count: detected.length }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Invalid JSON payload' }));
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
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify({ live: { temp: 28, humidity: 65 } }));
  });
  return server.listen(port);
}

if (process.argv[1]?.endsWith('mock-apis-server.js')) {
  startClassifierMock(8005);
  startChemicalDetectorMock(8002);
  startWritingAssistantMock(8004);
  startWeatherMock(8000);
  console.log('apis/ mock microservices running on ports 8005, 8002, 8004, 8000');
}

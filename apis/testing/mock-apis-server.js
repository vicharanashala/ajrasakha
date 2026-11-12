import http from 'http';
import url from 'url';

function generateSwaggerHtml(title) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
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

// 1. Agriculture Classifier on 8005
export function startClassifierMock(port = 8005) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(generateSwaggerHtml('Agriculture Question Classifier'));
    }

    res.setHeader('Content-Type', 'application/json');

    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (parsed.pathname === '/classify-question' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.question || !data.question.trim()) {
            res.writeHead(400);
            return res.end(JSON.stringify({ detail: "Field 'question' must not be empty." }));
          }
          const isAgri = /crop|wheat|paddy|fertilizer|pest|soil|borer/i.test(data.question);
          res.writeHead(200);
          res.end(JSON.stringify({
            is_agriculture: isAgri,
            disclaimer: isAgri ? 'NA' : 'This question is not related to agriculture.'
          }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ detail: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
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

    res.setHeader('Content-Type', 'application/json');

    if (parsed.pathname === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (parsed.pathname === '/detect-chemicals' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const banned = ['aldrin', 'endosulfan', 'ddt'];
        const matches = banned.filter(b => body.toLowerCase().includes(b));
        res.writeHead(200);
        res.end(JSON.stringify({ detected: matches, count: matches.length }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
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

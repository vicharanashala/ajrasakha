import 'reflect-metadata';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Loading Sentry for ${NODE_ENV} environment`);
await import('./instrument.js');

import * as Sentry from '@sentry/node';
import express from 'express';
import { useExpressServer, RoutingControllersOptions } from 'routing-controllers';
import { appConfig } from './config/app.js';
import { loggingHandler } from './shared/middleware/loggingHandler.js';
import { HttpErrorHandler } from './shared/index.js';
import { loadAppModules } from './bootstrap/loadModules.js';
import { printStartupSummary } from './utils/logDetails.js';
import type { CorsOptions } from 'cors';
import { authorizationChecker } from './shared/functions/authorizationChecker.js';
import { currentUserChecker } from './shared/functions/currentUserChecker.js';
import { InternalApiAuth } from './shared/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { initJobs } from './bootstrap/jobs/index.js';
import { apiReference } from '@scalar/express-api-reference';
import { generateOpenAPISpec } from './shared/functions/generateOpenApiSpec.js';
import http from 'http';
import { initWebSocket } from './bootstrap/websocket.js';
import { initRealtimeWebSocket } from './bootstrap/realtimeWebSocket.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { faqPopConfig } from './config/faqPop.js';



const app = express();


app.get(`${appConfig.routePrefix}/health`, (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

app.use(loggingHandler);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || appConfig.origins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', (origin as string) || '*');
  }

  res.header(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  );

  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );

  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});


const { controllers, validators } = await loadAppModules(
  appConfig.module.toLowerCase(),
);

const corsOptions: CorsOptions = {
  origin: appConfig.origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-internal-api-key'],
  credentials: true,
  optionsSuccessStatus: 204,
};

const moduleOptions: RoutingControllersOptions = {
  controllers: controllers,
  middlewares: [HttpErrorHandler],
  routePrefix: appConfig.routePrefix,
  authorizationChecker: authorizationChecker,
  currentUserChecker,
  defaultErrorHandler: true,
  development: appConfig.isDevelopment,
  validation: true,
  cors: corsOptions,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/reference')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    next();
  }
});

if (NODE_ENV === 'production' || NODE_ENV === 'staging') {
  console.log(
    'Setting up Sentry error handling - test for production and staging environment',
  );
  Sentry.setupExpressErrorHandler(app);
}

const proxyOnError = (label: string) => (err: Error, _req: any, res: any) => {
  console.error(`[proxy:${label}] ${err.message}`);
  if (!res.headersSent) res.status(502).json({ error: `${label} service unavailable`, detail: err.message });
};

if (faqPopConfig.faqApiUrl) {
  app.use('/api/faq', createProxyMiddleware({
    target: faqPopConfig.faqApiUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/faq': '' },
    on: { error: proxyOnError('faq') },
  }));
}
if (faqPopConfig.popApiUrl) {
  app.use('/api/pop', createProxyMiddleware({
    target: faqPopConfig.popApiUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/pop': '' },
    on: { error: proxyOnError('pop') },
  }));
}

// Start server
useExpressServer(app, moduleOptions);

// Setup Scalar API Documentation
const openApiSpec = generateOpenAPISpec(moduleOptions, validators);
app.use(
  `${appConfig.routePrefix}/reference`,
  apiReference({
    content: openApiSpec,
    theme: 'elysiajs',
  }),
);

const server = http.createServer(app);

initWebSocket(server);
initRealtimeWebSocket(server);

server.listen(appConfig.port, () => {
  initJobs();
  printStartupSummary();
});


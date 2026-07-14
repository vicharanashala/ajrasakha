import 'reflect-metadata';
import express from 'express';
import { useExpressServer, RoutingControllersOptions } from 'routing-controllers';
import { appConfig } from './config/app.js';
import { loggingHandler } from './shared/middleware/loggingHandler.js';
import { HttpErrorHandler } from './shared/index.js';
import { loadAppModules } from './bootstrap/loadModules.js';
import { authorizationChecker } from './shared/functions/authorizationChecker.js';
import { currentUserChecker } from './shared/functions/currentUserChecker.js';
import http from 'http';
import { initWebSocket } from './bootstrap/websocket.js';
import type { CorsOptions } from 'cors';
import { apiReference } from '@scalar/express-api-reference';
import { generateOpenAPISpec } from './shared/functions/index.js';
import './bootstrap/jobs/agentStatusCleanupJob.js';


const NODE_ENV = process.env.NODE_ENV || 'development';
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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

server.listen(appConfig.port, () => {
  console.log(`🚀 ACC Backend microservice is running on port ${appConfig.port}`);
});

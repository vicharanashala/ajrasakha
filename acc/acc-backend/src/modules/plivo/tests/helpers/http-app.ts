import 'reflect-metadata';
import express, { type Express } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { CorsOptions } from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// helpers -> tests -> plivo -> modules -> src -> acc-backend
const BACKEND_ROOT = path.resolve(__dirname, '../../../../../');

export interface HttpTestApp {
  app: Express;
  stop: () => Promise<void>;
}

// Builds the real Express + routing-controllers app the same way index.ts
// does (real middleware chain, real controllers, real DI container, real
// Scalar/OpenAPI mounting) but without calling listen()/initWebSocket(), so
// it can be driven in-process with supertest. DB_URL/DB_NAME are pointed at
// a fresh mongodb-memory-server instance before any app module is imported,
// since config/db.ts reads them once at first import.
export async function buildHttpTestApp(
  dbName = `acc_http_integration_${Date.now()}`,
): Promise<HttpTestApp> {
  const mongoServer = await MongoMemoryServer.create();
  process.env.DB_URL = mongoServer.getUri();
  process.env.DB_NAME = dbName;
  process.env.APP_MODULE = process.env.APP_MODULE || 'all';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  const { loadAppModules, getContainer } = await import('#root/bootstrap/loadModules.js');
  const { appConfig } = await import('#root/config/app.js');
  const { loggingHandler } = await import('#shared/middleware/loggingHandler.js');
  const { HttpErrorHandler } = await import('#shared/index.js');
  const { authorizationChecker } = await import('#root/shared/functions/authorizationChecker.js');
  const { currentUserChecker } = await import('#root/shared/functions/currentUserChecker.js');
  const { generateOpenAPISpec } = await import('#shared/functions/index.js');
  const { useExpressServer } = await import('routing-controllers');
  const { apiReference } = await import('@scalar/express-api-reference');
  const { GLOBAL_TYPES } = await import('#root/types.js');

  // loadAppModules() enumerates ./src/modules relative to process.cwd().
  const originalCwd = process.cwd();
  let controllers: Function[];
  let validators: Function[];
  try {
    process.chdir(BACKEND_ROOT);
    ({ controllers, validators } = await loadAppModules(appConfig.module.toLowerCase()));
  } finally {
    process.chdir(originalCwd);
  }

  const app = express();

  app.get(`${appConfig.routePrefix}/health`, (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  app.use(loggingHandler);

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (!origin || appConfig.origins.includes(origin as string)) {
      res.header('Access-Control-Allow-Origin', (origin as string) || '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  const corsOptions: CorsOptions = {
    origin: appConfig.origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 204,
  };

  const moduleOptions = {
    controllers,
    middlewares: [HttpErrorHandler],
    routePrefix: appConfig.routePrefix,
    authorizationChecker,
    currentUserChecker,
    defaultErrorHandler: true,
    development: appConfig.isDevelopment,
    validation: true,
    cors: corsOptions,
  };

  useExpressServer(app, moduleOptions);

  const openApiSpec = generateOpenAPISpec(moduleOptions as any, validators);
  app.use(
    `${appConfig.routePrefix}/reference`,
    apiReference({
      content: openApiSpec,
      theme: 'elysiajs',
    }),
  );

  return {
    app,
    stop: async () => {
      const database = getContainer().get(GLOBAL_TYPES.Database) as { disconnect: () => Promise<void> };
      await database.disconnect();
      await mongoServer.stop();
    },
  };
}

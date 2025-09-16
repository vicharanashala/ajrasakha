import 'reflect-metadata';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Loading Sentry for ${NODE_ENV} environment`);
await import('./instrument.js');

import * as Sentry from '@sentry/node';
import express from 'express';
import {useExpressServer, RoutingControllersOptions} from 'routing-controllers';
import {appConfig} from './config/app.js';
import {loggingHandler} from './shared/middleware/loggingHandler.js';
import {HttpErrorHandler} from './shared/index.js';
import {loadAppModules} from './bootstrap/loadModules.js';
import {printStartupSummary} from './utils/logDetails.js';
import type {CorsOptions} from 'cors';
import {authorizationChecker} from './shared/functions/authorizationChecker.js';
import {currentUserChecker} from './shared/functions/currentUserChecker.js';
import path from 'path';
import {fileURLToPath} from 'url';

const app = express();

app.use(loggingHandler);

const {controllers, validators} = await loadAppModules(
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.get('/', (_, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

if (NODE_ENV === 'production' || NODE_ENV === 'staging') {
  console.log(
    'Setting up Sentry error handling - test for production and staging environment',
  );
  Sentry.setupExpressErrorHandler(app);
}

// Start server
useExpressServer(app, moduleOptions);

app.listen(appConfig.port, () => {
  printStartupSummary();
});

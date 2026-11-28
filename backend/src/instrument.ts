import * as Sentry from "@sentry/node";
//import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { appConfig } from "./config/app.js";
import { scrubSensitiveEventData } from "./utils/sentryScrubbing.js";


const environment = appConfig.sentry.environment;
const dsn = appConfig.sentry.dsn;
const NODE_ENV = process.env.NODE_ENV || 'development';

if ((NODE_ENV === 'production' || NODE_ENV === 'staging' || NODE_ENV === 'development') && dsn) {
  console.log(`Initializing Sentry in ${environment} environment with DSN: ${dsn}`);

  Sentry.init({
    dsn: dsn,
    environment: environment,
    integrations: [
   //   nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    sendDefaultPii: true,
    // Passwords (login/signup bodies) and bearer tokens (headers) must not be sent to Sentry.
    beforeSend: scrubSensitiveEventData,
    beforeSendTransaction: scrubSensitiveEventData,
  });
} else {
  console.log(`Sentry initialization skipped. Environment: ${environment}, DSN available: ${Boolean(dsn)}`);
}

export { Sentry };

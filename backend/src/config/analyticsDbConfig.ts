import {env} from '#root/utils/env.js';

export const analyticsDbConfig = {
  url: env('DB_URL_ANALYTICS'),
  dbName: env('DB_NAME_ANALYTICS') || 'test',
};
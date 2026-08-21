import {env} from '#root/utils/env.js';

export const analyticsDbConfig = {
  url: env('DB_URL_ANALYTICS') || env('DB_URL'),
  dbName: env('DB_NAME_ANALYTICS') || 'agriai_analytics',
  annamUrl: env('ANNAM_URL_ANALYTICS') || env('DB_URL'),
  annamDbName: env('ANNAM_DB_ANALYTICS') || 'annam',
};
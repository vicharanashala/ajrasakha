import {env} from '#root/utils/env.js';

const defaultDbUrl = env('DB_URL', 'mongodb://localhost:27017/ajrasakha');
const defaultDbName = env('DB_NAME', 'ajrasakha');

export const analyticsDbConfig = {
  url: env('DB_URL_ANALYTICS', defaultDbUrl),
  dbName: env('DB_NAME_ANALYTICS', defaultDbName),
  annamUrl: env('ANNAM_URL_ANALYTICS', defaultDbUrl),
  annamDbName: env('ANNAM_DB_ANALYTICS', defaultDbName)
};
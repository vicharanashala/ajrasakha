import {env} from '#root/utils/env.js';

export const popDbConfig = {
  url: env('POP_DB_URL'),
  dbName: env('POP_DB_NAME') || 'test',
};

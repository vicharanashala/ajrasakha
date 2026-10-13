import {env} from '#root/utils/env.js';
import {dbConfig} from './db.js';

// The GDB Cleaning page can read its own database. When GDB_CLEANING_DB_URL is not set,
// it uses the app's main database, so the gdb_cleaning collection just has to be there.
const ownUrl = env('GDB_CLEANING_DB_URL');

export const gdbCleaningDbConfig = {
  url: ownUrl || dbConfig.url,
  dbName: env('GDB_CLEANING_DB_NAME') || (ownUrl ? 'agriai' : dbConfig.dbName),
};

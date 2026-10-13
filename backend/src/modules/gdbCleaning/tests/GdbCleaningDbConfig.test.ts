import 'reflect-metadata';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';

const KEYS = ['DB_URL', 'DB_NAME', 'GDB_CLEANING_DB_URL', 'GDB_CLEANING_DB_NAME'];
const saved: Record<string, string | undefined> = {};

const load = async () => {
  vi.resetModules();
  return (await import('#root/config/gdbCleaningDbConfig.js')).gdbCleaningDbConfig;
};

describe('which database the GDB Cleaning page uses', () => {
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.DB_URL = 'mongodb://main-host/main';
    process.env.DB_NAME = 'main_db';
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('uses the main database when nothing of its own is set', async () => {
    expect(await load()).toEqual({url: 'mongodb://main-host/main', dbName: 'main_db'});
  });

  it('uses its own url and name when both are set', async () => {
    process.env.GDB_CLEANING_DB_URL = 'mongodb://gdb-host/gdb';
    process.env.GDB_CLEANING_DB_NAME = 'gdb_db';
    expect(await load()).toEqual({url: 'mongodb://gdb-host/gdb', dbName: 'gdb_db'});
  });

  it('falls back to the agriai database when only its own url is set', async () => {
    process.env.GDB_CLEANING_DB_URL = 'mongodb://gdb-host/gdb';
    expect(await load()).toEqual({url: 'mongodb://gdb-host/gdb', dbName: 'agriai'});
  });

  it('uses the main server with its own database name when only the name is set', async () => {
    process.env.GDB_CLEANING_DB_NAME = 'gdb_db';
    expect(await load()).toEqual({url: 'mongodb://main-host/main', dbName: 'gdb_db'});
  });
});

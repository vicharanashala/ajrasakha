import {injectable, inject} from 'inversify';
import {MongoDatabase} from './MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class GdbCleaningDatabase extends MongoDatabase {
  constructor(
    @inject(GLOBAL_TYPES.gdbCleaningDbUri) uri: string,
    @inject(GLOBAL_TYPES.gdbCleaningDbName) dbName: string,
  ) {
    super(uri, dbName, 'gdb-cleaning');
  }
}

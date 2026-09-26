import {injectable, inject} from 'inversify';
import {MongoDatabase} from './MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class PopDatabase extends MongoDatabase {
  constructor(
    @inject(GLOBAL_TYPES.popDbUri) uri: string,
    @inject(GLOBAL_TYPES.popDbName) dbName: string,
  ) {
    super(uri, dbName, 'pop');
  }
}

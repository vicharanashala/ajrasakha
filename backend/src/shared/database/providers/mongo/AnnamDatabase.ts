import {injectable, inject} from 'inversify';
import {MongoDatabase} from './MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class AnnamDatabase extends MongoDatabase {
  constructor(
    @inject(GLOBAL_TYPES.annamanalyticsUri) uri: string,
    @inject(GLOBAL_TYPES.annamanalyticsDbName) dbName: string,
  ) {
    super(uri, dbName);
  }
}
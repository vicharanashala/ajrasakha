import {injectable, inject} from 'inversify';
import {MongoDatabase} from './MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class AnalyticsMongoDatabase extends MongoDatabase {
  constructor(
    @inject(GLOBAL_TYPES.analyticsUri) uri: string,
    @inject(GLOBAL_TYPES.analyticsDbName) dbName: string,
  ) {
    super(uri, dbName);
  }
}
import {IOrganizationRepository} from '#root/shared/database/interfaces/IOrganizationRepository.js';
import {IOrganization} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {Collection} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';

@injectable()
export class OrganizationRepository implements IOrganizationRepository {
  private OrganizationCollection: Collection<IOrganization>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.OrganizationCollection =
      await this.db.getCollection<IOrganization>('organizations');
  }

  async search(search?: string, limit = 20): Promise<IOrganization[]> {
    await this.init();

    const filter = search
      ? {org_name: {$regex: search, $options: 'i'}}
      : {};

    return this.OrganizationCollection.find(filter)
      .sort({org_name: 1})
      .limit(limit)
      .toArray();
  }
}

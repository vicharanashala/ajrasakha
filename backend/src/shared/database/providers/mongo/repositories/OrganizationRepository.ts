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

  async search(
    search?: string,
    page = 1,
    limit = 20,
    type?: IOrganization['type'],
  ): Promise<{organizations: IOrganization[], totalPages: number}> {
    await this.init();

    const filter: Record<string, unknown> = {};
    if (search) filter.org_name = {$regex: search, $options: 'i'};
    if (type) filter.type = type;

    const skip = (page - 1) * limit;

    const [organizationsRaw, totalItems] = await Promise.all([
      this.OrganizationCollection.find(filter)
        .sort({org_name: 1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.OrganizationCollection.countDocuments(filter),
    ]);

    const organizations = organizationsRaw.map(org => ({
      ...org,
      _id: org._id ? org._id.toString() : org._id
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {organizations, totalPages};
  }

  async findById(id: string): Promise<IOrganization | null> {
    await this.init();
    const {ObjectId} = await import('mongodb');
    const org = await this.OrganizationCollection.findOne({
      _id: new ObjectId(id) as any,
    });
    return org ? {...org, _id: org._id?.toString()} : null;
  }

  async create(data: Omit<IOrganization, '_id'>): Promise<IOrganization> {
    await this.init();
    const now = new Date();
    const doc = { ...data, createdAt: now, updatedAt: now };
    const result = await this.OrganizationCollection.insertOne(doc as IOrganization);
    return { ...doc, _id: result.insertedId.toString() };
  }

  // Case-insensitive lookup of existing names within a type, so a bulk import can
  // resolve duplicates in one query instead of one per row.
  async findByNames(
    type: IOrganization['type'],
    names: string[],
  ): Promise<IOrganization[]> {
    await this.init();
    if (!names.length) return [];
    return this.OrganizationCollection.find(
      {type, org_name: {$in: names}},
      {
        collation: {locale: 'en', strength: 2},
        projection: {org_name: 1, type: 1, state: 1},
      },
    ).toArray();
  }

  async insertMany(data: Omit<IOrganization, '_id'>[]): Promise<number> {
    await this.init();
    if (!data.length) return 0;
    const now = new Date();
    const docs = data.map(d => ({...d, createdAt: now, updatedAt: now}));
    const result = await this.OrganizationCollection.insertMany(
      docs as IOrganization[],
    );
    return result.insertedCount;
  }

  async update(id: string, data: Partial<IOrganization>): Promise<boolean> {
    await this.init();
    const { ObjectId } = await import('mongodb');
    const updateDoc = { ...data, updatedAt: new Date() };
    const result = await this.OrganizationCollection.updateOne(
      { _id: new ObjectId(id) as any },
      { $set: updateDoc }
    );
    return result.matchedCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    const { ObjectId } = await import('mongodb');
    const result = await this.OrganizationCollection.deleteOne({ _id: new ObjectId(id) as any });
    return result.deletedCount > 0;
  }
}

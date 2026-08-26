import {randomUUID} from 'node:crypto';
import {Collection} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {IQuestion, IUser} from '#root/shared/interfaces/models.js';
import {dbConfig} from '#root/config/db.js';
import {
  IPublicDashboardRepository,
  PublicDashboardItem,
  PublicUserItem,
  SaturatedCropStateItem,
} from '../interfaces/IPublicDashboardRepository.js';

/** Stable identifier for the single config document in the `public_dashboard` collection. */
const CONFIG_KEY = 'config';

/** Legacy well-known name for outreach video items (pre-unified-`items` schema). */
const OUTREACH_VIDEO_NAME = 'outreach video';

/** Stored shape of the config document (adds the internal key + updatedAt). Legacy
 *  fields (`values`, `outreachVideos`) may still exist on older docs and are migrated
 *  into `items` on read — see getItems. */
interface StoredConfig {
  key: string;
  items?: PublicDashboardItem[];
  values?: {name: string; value: unknown}[];
  outreachVideos?: {id?: string; url: string; createdAt?: Date}[];
  updatedAt?: Date;
}

/**
 * Self-contained data-access layer for the public (no-auth) dashboard.
 *
 * It owns its own MongoDatabase connection (built from dbConfig) and reads the required
 * collections directly — every operation (including the saturated-crops aggregation)
 * lives here, so no existing repository/service is touched and no Inversify bindings
 * are required for the data layer.
 */
export class PublicDashboardRepository implements IPublicDashboardRepository {
  private readonly db: MongoDatabase;
  private initialized = false;

  // ── Required collections ──
  private QuestionCollection!: Collection<IQuestion>;
  private UsersCollection!: Collection<IUser>;
  private ConfigCollection!: Collection<StoredConfig>;
  // Add more as the public dashboard grows, e.g.:
  // private CropCollection!: Collection<ICrop>;

  constructor() {
    this.db = new MongoDatabase(dbConfig.url, dbConfig.dbName);
  }

  /** Lazily resolve the collections this repository needs (connects on first use). */
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.QuestionCollection = await this.db.getCollection<IQuestion>('questions');
    this.UsersCollection = await this.db.getCollection<IUser>('users');
    this.ConfigCollection =
      await this.db.getCollection<StoredConfig>('public_dashboard');
    // this.CropCollection = await this.db.getCollection<ICrop>('crops');
    this.initialized = true;
  }

  /**
   * Crops grouped by state whose question document count is strictly greater than
   * `saturatedCropLimit`. Runs the aggregation directly against the questions collection.
   */
  async getSaturatedCropsByState(
    saturatedCropLimit: number,
  ): Promise<SaturatedCropStateItem[]> {
    try {
      await this.init();

      const results = (await this.QuestionCollection.aggregate([
        // Only consider documents that carry a usable state and are in a countable
        // status (open / closed / delayed).
        {
          $match: {
            'details.state': {$nin: [null, '']},
            status: {$in: ['open', 'closed', 'delayed']},
          },
        },
        // Count questions per (state, crop), splitting the total into closed vs
        // in-progress (open + delayed). Prefer the normalised crop name, then the raw
        // crop, so variant spellings collapse into one bucket.
        {
          $group: {
            _id: {
              state: '$details.state',
              crop: {
                $ifNull: [
                  '$details.normalised_crop',
                  {$ifNull: ['$details.crop', 'Not Normalized']},
                ],
              },
            },
            count: {$sum: 1},
            closed: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
            inProgress: {
              $sum: {$cond: [{$in: ['$status', ['open', 'delayed']]}, 1, 0]},
            },
          },
        },
        // A crop is "saturated" when its document count exceeds the limit.
        {$match: {count: {$gt: saturatedCropLimit}}},
        // Collapse the saturated crops under their state.
        {
          $group: {
            _id: '$_id.state',
            total: {$sum: '$count'},
            closed: {$sum: '$closed'},
            inProgress: {$sum: '$inProgress'},
            crops: {
              $push: {
                crop: '$_id.crop',
                count: '$count',
                closed: '$closed',
                inProgress: '$inProgress',
              },
            },
          },
        },
        {$project: {_id: 0, state: '$_id', total: 1, closed: 1, inProgress: 1, crops: 1}},
        {$sort: {total: -1}},
      ]).toArray()) as SaturatedCropStateItem[];

      return results;
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching saturated crops by state: More info: ${error}`,
      );
    }
  }

  /**
   * All active users, projected to the public-facing fields only
   * (firstName, lastName, preference, avatar, role, university, createdAt).
   */
  async getActiveUsers(): Promise<PublicUserItem[]> {
    try {
      await this.init();

      const users = (await this.UsersCollection.find(
        {status: 'active'},
        {
          projection: {
            _id: 0,
            firstName: 1,
            lastName: 1,
            preference: 1,
            avatar: 1,
            role: 1,
            university: 1,
            kvkCovered: 1,
            createdAt: 1,
          },
        },
      ).toArray()) as PublicUserItem[];

      return users;
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching active users: More info: ${error}`,
      );
    }
  }

  /** All stored public-dashboard items (empty array if none). */
  async getItems(): Promise<PublicDashboardItem[]> {
    try {
      await this.init();
      const doc = await this.ConfigCollection.findOne({key: CONFIG_KEY});
      if (!doc) return [];

      // New schema: the `items` array is present (even if empty) — use it as-is.
      if (Array.isArray(doc.items)) return doc.items;

      // Legacy doc (no `items`): map the old `values` + `outreachVideos` fields into the
      // unified item shape, then persist the migration once so ids stay stable for
      // edit/delete and subsequent reads hit the fast path above.
      const migrated: PublicDashboardItem[] = [];

      if (Array.isArray(doc.values)) {
        for (const v of doc.values) {
          if (v && typeof v.name === 'string') {
            migrated.push({id: randomUUID(), name: v.name, value: v.value});
          }
        }
      }

      if (Array.isArray(doc.outreachVideos)) {
        for (const vid of doc.outreachVideos) {
          if (vid && vid.url) {
            migrated.push({
              id: vid.id ?? randomUUID(),
              name: OUTREACH_VIDEO_NAME,
              value: vid.url,
              createdAt: vid.createdAt,
            });
          }
        }
      }

      await this.ConfigCollection.updateOne(
        {key: CONFIG_KEY},
        {
          $set: {items: migrated, updatedAt: new Date()},
          $unset: {values: '', outreachVideos: ''},
        },
      );

      return migrated;
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching public dashboard items: More info: ${error}`,
      );
    }
  }

  /** Replace the stored items array with the given one; returns the new list. */
  async saveItems(
    items: PublicDashboardItem[],
  ): Promise<PublicDashboardItem[]> {
    try {
      await this.init();
      await this.ConfigCollection.updateOne(
        {key: CONFIG_KEY},
        {
          $set: {
            items,
            key: CONFIG_KEY,
            updatedAt: new Date(),
          } as Partial<StoredConfig>,
        },
        {upsert: true},
      );
      return this.getItems();
    } catch (error) {
      throw new InternalServerError(
        `Error while updating public dashboard items: More info: ${error}`,
      );
    }
  }
}

import {Collection} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {dbConfig} from '#root/config/db.js';
import {
  IPublicDashboardRepository,
  SaturatedCropStateItem,
} from '../interfaces/IPublicDashboardRepository.js';

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
  // Add more as the public dashboard grows, e.g.:
  // private UsersCollection!: Collection<IUser>;
  // private CropCollection!: Collection<ICrop>;

  constructor() {
    this.db = new MongoDatabase(dbConfig.url, dbConfig.dbName);
  }

  /** Lazily resolve the collections this repository needs (connects on first use). */
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.QuestionCollection = await this.db.getCollection<IQuestion>('questions');
    // this.UsersCollection = await this.db.getCollection<IUser>('users');
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
        // Count questions per (state, crop). Prefer the normalised crop name, then
        // the raw crop, so variant spellings collapse into one bucket.
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
          },
        },
        // A crop is "saturated" when its document count exceeds the limit.
        {$match: {count: {$gt: saturatedCropLimit}}},
        // Collapse the saturated crops under their state.
        {
          $group: {
            _id: '$_id.state',
            total: {$sum: '$count'},
            crops: {$push: {crop: '$_id.crop', count: '$count'}},
          },
        },
        {$project: {_id: 0, state: '$_id', total: 1, crops: 1}},
        {$sort: {total: -1}},
      ]).toArray()) as SaturatedCropStateItem[];

      return results;
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching saturated crops by state: More info: ${error}`,
      );
    }
  }
}

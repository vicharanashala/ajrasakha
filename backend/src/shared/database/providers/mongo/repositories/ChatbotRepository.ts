import { inject, injectable } from 'inversify';
import { Collection, ClientSession } from 'mongodb';
import { AnalyticsMongoDatabase } from '../AnalyticsMongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  IChatbotRepository,
  KpiSummary,
  DailyActiveUsersEntry,
  ChannelSplitEntry,
  VoiceAccuracyEntry,
  GeoStateEntry,
  QueryCategoryEntry,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import type { IChatbotSession } from '#root/shared/interfaces/models.js';

@injectable()
export class ChatbotRepository implements IChatbotRepository {
  private collection!: Collection<IChatbotSession>;

  constructor(
    @inject(GLOBAL_TYPES.analyticsDatabase)
    private analyticsDb: AnalyticsMongoDatabase,
  ) {}

  private async init() {
    this.collection = await this.analyticsDb.getCollection<IChatbotSession>('chatbot_sessions');
  }

  async getKpiSummary(session?: ClientSession): Promise<KpiSummary> {
    await this.init();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dau, dailyQueries, sessionStats, csatStats, repeatCount, voiceCount, total] =
      await Promise.all([
        this.collection
          .distinct('userId', { createdAt: { $gte: today } }, { session })
          .then(r => r.length),
        this.collection.countDocuments({ createdAt: { $gte: today } }, { session }),
        this.collection
          .aggregate([{ $group: { _id: null, avg: { $avg: '$sessionDurationSec' } } }], { session })
          .toArray(),
        this.collection
          .aggregate(
            [
              { $match: { csatScore: { $exists: true } } },
              { $group: { _id: null, avg: { $avg: '$csatScore' } } },
            ],
            { session },
          )
          .toArray(),
        this.collection.countDocuments({ isRepeatQuery: true }, { session }),
        this.collection.countDocuments({ channel: 'voice' }, { session }),
        this.collection.countDocuments({}, { session }),
      ]);

    const avgSec = sessionStats[0]?.avg ?? 0;

    return {
      dau,
      dailyQueries,
      avgSessionDurationMin: Math.round((avgSec / 60) * 10) / 10,
      csatRating: Math.round((csatStats[0]?.avg ?? 0) * 10) / 10,
      repeatQueryRatePct: total ? Math.round((repeatCount / total) * 100) : 0,
      voiceUsageSharePct: total ? Math.round((voiceCount / total) * 100) : 0,
    };
  }

  async getDailyActiveUsers(days = 30, session?: ClientSession): Promise<DailyActiveUsersEntry[]> {
    await this.init();

    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.collection
      .aggregate(
        [
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              uniqueUsers: { $addToSet: '$userId' },
            },
          },
          { $project: { day: '$_id', count: { $size: '$uniqueUsers' }, _id: 0 } },
          { $sort: { day: 1 } },
        ],
        { session },
      )
      .toArray();

    return result as DailyActiveUsersEntry[];
  }

  async getChannelSplit(session?: ClientSession): Promise<ChannelSplitEntry[]> {
    await this.init();

    const total = await this.collection.countDocuments({}, { session });
    if (total === 0) return [];

    const result = await this.collection
      .aggregate([{ $group: { _id: '$channel', count: { $sum: 1 } } }], { session })
      .toArray();

    return result.map(r => ({
      channel: r._id as string,
      pct: Math.round((r.count / total) * 100),
    }));
  }

  async getVoiceAccuracyByLanguage(session?: ClientSession): Promise<VoiceAccuracyEntry[]> {
    await this.init();

    const result = await this.collection
      .aggregate(
        [
          { $match: { channel: 'voice', voiceAccuracyScore: { $exists: true } } },
          { $group: { _id: '$language', avgAccuracy: { $avg: '$voiceAccuracyScore' } } },
          { $sort: { avgAccuracy: -1 } },
        ],
        { session },
      )
      .toArray();

    return result.map(r => ({
      lang: r._id as string,
      pct: Math.round(r.avgAccuracy),
    }));
  }

  async getGeoDistribution(session?: ClientSession): Promise<GeoStateEntry[]> {
    await this.init();

    const result = await this.collection
      .aggregate(
        [
          { $group: { _id: '$state', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        { session },
      )
      .toArray();

    return result.map(r => ({
      state: r._id as string,
      count: r.count,
    }));
  }

  async getQueryCategories(session?: ClientSession): Promise<QueryCategoryEntry[]> {
    await this.init();

    const total = await this.collection.countDocuments({}, { session });
    if (total === 0) return [];

    const result = await this.collection
      .aggregate(
        [
          { $group: { _id: '$queryCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        { session },
      )
      .toArray();

    return result.map(r => ({
      label: r._id as string,
      pct: Math.round((r.count / total) * 100),
    }));
  }
}

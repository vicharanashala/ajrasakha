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
  WeeklySessionDurationEntry,
  DailyQueryCountEntry,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import type { IChatbotSession } from '#root/shared/interfaces/models.js';

@injectable()
export class ChatbotRepository implements IChatbotRepository {
  private collection!: Collection<IChatbotSession>;
  private messagesCollection!: Collection<any>;

  constructor(
    @inject(GLOBAL_TYPES.analyticsDatabase)
    private analyticsDb: AnalyticsMongoDatabase,
  ) {}

  private async init() {
    this.collection = await this.analyticsDb.getCollection<IChatbotSession>('conversations');
    this.messagesCollection = await this.analyticsDb.getCollection<any>('messages');
  }

  async getKpiSummary(session?: ClientSession): Promise<KpiSummary> {
    await this.init();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dau, dailyQueries, sessionStats, csatStats, repeatCount, voiceCount, total] =
      await Promise.all([
        this.collection
          .distinct('user', { createdAt: { $gte: today } }, { session })
          .then(r => r.length),
        this.collection.countDocuments({ createdAt: { $gte: today } }, { session }),
        this.collection
          .aggregate(
            [
              {
                $addFields: {
                  durationMs: { $max: [0, { $subtract: ['$updatedAt', '$createdAt'] }] },
                },
              },
              { $group: { _id: null, avg: { $avg: '$durationMs' } } },
            ],
            { session },
          )
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

    const avgMs = sessionStats[0]?.avg ?? 0;

    return {
      dau,
      dailyQueries,
      avgSessionDurationMin: Math.round((avgMs / 60000) * 10) / 10,
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
              uniqueUsers: { $addToSet: '$user' },
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

  async getWeeklyAvgSessionDuration(
    weeks = 52,
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]> {
    await this.init();

    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const result = await this.collection
      .aggregate(
        [
          { $match: { createdAt: { $gte: since } } },
          {
            $addFields: {
              durationMs: { $max: [0, { $subtract: ['$updatedAt', '$createdAt'] }] },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } },
              avgDurationMs: { $avg: '$durationMs' },
            },
          },
          {
            $project: {
              week: '$_id',
              avgSessionDurationMin: {
                $round: [{ $divide: ['$avgDurationMs', 60000] }, 1],
              },
              _id: 0,
            },
          },
          { $sort: { week: 1 } },
        ],
        { session },
      )
      .toArray();

    return result as WeeklySessionDurationEntry[];
  }

  async getDailyQueryCounts(
    days = 30,
    session?: ClientSession,
  ): Promise<DailyQueryCountEntry[]> {
    await this.init();

    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.messagesCollection
      .aggregate(
        [
          { $match: { createdAt: { $gte: since }, isCreatedByUser: true } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $project: { day: '$_id', count: 1, _id: 0 } },
          { $sort: { day: 1 } },
        ],
        { session },
      )
      .toArray();

    return result as DailyQueryCountEntry[];
  }

  async getTodayQueryCount(session?: ClientSession): Promise<number> {
    await this.init();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.messagesCollection.countDocuments(
      { createdAt: { $gte: today }, isCreatedByUser: true },
      { session },
    );
  }
}

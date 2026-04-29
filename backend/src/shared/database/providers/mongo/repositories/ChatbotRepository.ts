import {inject, injectable} from 'inversify';
import {Collection, ClientSession, ObjectId} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {AnalyticsMongoDatabase} from '../AnalyticsMongoDatabase.js';
import {AnnamDatabase} from '../AnnamDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
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
  WeeklyQueryCountEntry,
  UserDetailEntry,
  PaginatedUserDetails,
  ChatbotConversationData,
  UserDemographics,
  DemographicEntry,
  KccAndAgriAppStats,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {MongoDatabase} from '../MongoDatabase.js';
import { createDecipheriv } from 'crypto';
import { count } from 'console';

interface IUser {
  _id?: any;
  name?: string;
  username?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
  farmerProfile?: {
    farmerName?: string;
    age?: number;
    gender?: string;
    villageName?: string;
    blockName?: string;
    district?: string;
    state?: string;
    phoneNo?: string;
    languagePreference?: string;
    yearsOfExperience?: number;
    cropsCultivated?: string[];
    primaryCrop?: string;
    secondaryCrop?: string;
    awarenessOfKCC?: boolean;
    usesAgriApps?: boolean;
    highestEducatedPerson?: string;
    numberOfSmartphones?: number;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

interface IConversation {
  _id?: any;
  user: string;
  conversationId: string;
  endpoint: string;
  model?: string;
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class ChatbotRepository implements IChatbotRepository {
  private users!: Collection<IUser>;
  private conversations!: Collection<IConversation>;
  private messagesCollection!: Collection<any>;

  constructor(
    @inject(GLOBAL_TYPES.analyticsDatabase) //vicharansahsa
    private analyticsDb: AnalyticsMongoDatabase,

    @inject(GLOBAL_TYPES.annamanalyticsDatabase) //annamalytics
    private annamDb: AnnamDatabase,

    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  /*constructor(
    @inject(GLOBAL_TYPES.annamanalyticsDatabase)
    private analyticsDb: AnnamDatabase,
  ) {}*/

  private async init(source = 'vicharanashala') {
    const db = source === 'annam' ? this.annamDb : this.analyticsDb;
    this.users = await db.getCollection<IUser>('users');
    this.conversations = await db.getCollection<IConversation>('conversations');
    this.messagesCollection = await db.getCollection<any>('messages');
  }
  private annamMessagesCollection!: Collection<any>;

  private async initSecondDb() {
    this.annamMessagesCollection =
      await this.annamDb.getCollection<any>('messages');
  }
  private QuestionCollection: Collection<IQuestion>;
  private async initReviewSystem() {
    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
  }

  private async getExternalUserIds(): Promise<string[]> {
    const externalUsers = await this.users
      .find({ email: { $regex: '^rup', $options: 'i' } }, { projection: { _id: 1 } })
      .toArray();
    return externalUsers.map(u => String(u._id));
  }

  private async buildUserMessageFilter(userType: string): Promise<Record<string, any>> {
    if (userType === 'all') return {};
    const externalIds = await this.getExternalUserIds();
    return userType === 'external'
      ? { user: { $in: externalIds } }
      : { user: { $nin: externalIds } };
  }

  private buildUserDocFilter(userType: string): Record<string, any> {
    if (userType === 'all') return {};
    return userType === 'external'
      ? { email: { $regex: '^rup', $options: 'i' } }
      : { email: { $not: { $regex: '^rup', $options: 'i' } } };
  }

  async getKpiSummary(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<KpiSummary> {
    try {
      await this.init(source);

      // Use MongoDB $dateToString with IST timezone (+05:30) to correctly bucket months
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      // 3 days ago at midnight for inactive-user calculation
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);

      const userDocFilter = await this.buildUserDocFilter(userType);
      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const [totalUsers, monthlyActivity, sessionStats, todayQueryCount, totalAppInstalls, activeUsersLast3Days] =
        await Promise.all([
          this.users.countDocuments(userDocFilter, {session}),

          // Group users by month in IST timezone using updatedAt
          this.users
            .aggregate(
              [
                { $match: userDocFilter },
                {
                  $group: {
                    _id: {
                      $dateToString: {
                        format: '%Y-%m',
                        date: '$updatedAt',
                        timezone: '+05:30',
                      },
                    },
                    count: {$sum: 1},
                  },
                },
              ],
              {session},
            )
            .toArray(),

          // Avg session duration from conversations (original logic — untouched)
          this.conversations
            .aggregate(
              [
                {
                  $project: {
                    durationMs: {$subtract: ['$updatedAt', '$createdAt']},
                  },
                },
                {$group: {_id: null, avg: {$avg: '$durationMs'}}},
              ],
              {session},
            )
            .toArray(),

          // Today's query count from messages
          this.getTodayQueryCount(source, session, userType),

          this.users.countDocuments(
            {
              ...userDocFilter,
              'farmerProfile.farmerName': { $exists: true, $nin: [null, ''] },
            },
            { session },
          ),

          // Count distinct users who sent messages in the last 3 days
          this.messagesCollection
            .aggregate(
              [
                { $match: { createdAt: { $gte: threeDaysAgo }, isCreatedByUser: true, ...userMsgFilter } },
                { $group: { _id: '$user' } },
                { $count: 'total' },
              ],
              { session },
            )
            .toArray(),
        ]);

      const monthMap = Object.fromEntries(
        (monthlyActivity as any[]).map(m => [m._id, m.count]),
      );
      const thisMonthActive = monthMap[currentYearMonth] ?? 0;
      const lastMonthActive = monthMap[lastYearMonth] ?? 0;

      const dauLastMonthPct =
        lastMonthActive === 0
          ? thisMonthActive > 0
            ? 100
            : 0
          : Math.round(
              ((thisMonthActive - lastMonthActive) / lastMonthActive) * 100,
            );

      const avgMs = sessionStats[0]?.avg ?? 0;
      const activeCount = (activeUsersLast3Days as any[])[0]?.total ?? 0;

      return {
        dau: totalUsers,
        dauLastMonthPct,
        dailyQueries: todayQueryCount,
        avgSessionDurationMin: Math.round((avgMs / 60000) * 10) / 10,
        csatRating: 0,
        repeatQueryRatePct: 0,
        voiceUsageSharePct: 0,
        totalAppInstalls,
        inactiveUsersLast3Days: Math.max(0, totalUsers - activeCount),
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(days = 13, source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      // Count distinct users who sent messages per month (true monthly active users)
      const since = new Date();
      since.setMonth(since.getMonth() - days); // `days` param used as number of months to look back
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            { $match: { createdAt: { $gte: since }, isCreatedByUser: true, ...userMsgFilter } },
            // Deduplicate: one entry per (month, user) pair
            {
              $group: {
                _id: {
                  month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } },
                  user: '$user',
                },
              },
            },
            // Count distinct users per month
            {
              $group: {
                _id: '$_id.month',
                count: { $sum: 1 },
              },
            },
            {$project: {day: '$_id', count: 1, _id: 0}},
            {$sort: {day: 1}},
          ],
          {session},
        )
        .toArray();

      return result as DailyActiveUsersEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get daily active users: ${error}`,
      );
    }
  }

  async getChannelSplit(_source = 'vicharanashala', _session?: ClientSession): Promise<ChannelSplitEntry[]> {
    return [];
  }

  async getVoiceAccuracyByLanguage(_source = 'vicharanashala', _session?: ClientSession): Promise<VoiceAccuracyEntry[]> {
    return [];
  }

  async getGeoDistribution(_source = 'vicharanashala', _session?: ClientSession): Promise<GeoStateEntry[]> {
    return [];
  }

  async getQueryCategories(_source = 'vicharanashala', _session?: ClientSession): Promise<QueryCategoryEntry[]> {
    return [];
  }

  async getTopCrops(session?: ClientSession): Promise<{ totalQuestions: number, topCrops: any[] }> {
    try {
      await this.initReviewSystem();
      
      const matchStage = { source: { $ne: 'AGRI_EXPERT' } };
      
      const cropFieldRaw = { $ifNull: ['$details.normalised_crop', '$details.crop'] };
      const normalizedCropExpr = { $toLower: cropFieldRaw };

      const cropDataRaw = await this.QuestionCollection.aggregate(
        [
          { $match: matchStage },
          { $group: { _id: normalizedCropExpr, count: { $sum: 1 } } },
          { $project: { name: '$_id', count: 1, _id: 0 } },
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [
                { $match: matchStage },
                { $group: { _id: normalizedCropExpr, count: { $sum: 1 } } },
                { $project: { name: '$_id', count: 1, _id: 0 } }
              ]
            }
          },
          { $group: { _id: '$name', count: { $sum: '$count' } } },
          { $match: { _id: { $ne: null } } },
          { $project: { name: '$_id', count: 1, _id: 0 } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
         { session },
      ).toArray();
      const totalCountRaw = await this.QuestionCollection.aggregate(
        [
          { $match: matchStage },
          { $count: 'count' },
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [
                { $match: matchStage },
                { $count: 'count' }
              ]
            }
          },
          { $group: { _id: null, total: { $sum: '$count' } } }
        ],
        { session },
      ).toArray();

      const totalQuestions = totalCountRaw.length > 0 ? totalCountRaw[0].total : 0;

      // Capitalize first letter of each crop for display
      const topCrops = cropDataRaw
        .filter((r: any) => r.name)
        .map((r: any) => ({
           ...r,
           name: String(r.name).charAt(0).toUpperCase() + String(r.name).slice(1)
        }));

      return { totalQuestions, topCrops };
    } catch (error) {
      throw new InternalServerError(`Failed to get top crops: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(weeks = 52, source = 'vicharanashala', session?: ClientSession): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      // Original logic — untouched
      const result = await this.conversations
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}}},
            {
              $addFields: {
                durationMs: {
                  $max: [0, {$subtract: ['$updatedAt', '$createdAt']}],
                },
              },
            },
            {
              $group: {
                _id: {$dateToString: {format: '%G-W%V', date: '$createdAt'}},
                avgDurationMs: {$avg: '$durationMs'},
              },
            },
            {
              $project: {
                week: '$_id',
                avgSessionDurationMin: {
                  $round: [{$divide: ['$avgDurationMs', 60000]}, 1],
                },
                _id: 0,
              },
            },
            {$sort: {week: 1}},
          ],
          {session},
        )
        .toArray();

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly avg session duration: ${error}`,
      );
    }
  }

  async getDailyQueryCounts(days = 30, source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<DailyQueryCountEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}, isCreatedByUser: true, ...userMsgFilter}},
            {
              $group: {
                _id: {$dateToString: {format: '%Y-%m-%d', date: '$createdAt'}},
                count: {$sum: 1},
              },
            },
            {$project: {day: '$_id', count: 1, _id: 0}},
            {$sort: {day: 1}},
          ],
          {session},
        )
        .toArray();

      return result as DailyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get daily query counts: ${error}`,
      );
    }
  }

  async getDailyUserTrend(days = 30, source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            // Filter to last N days, user-sent messages only
            {$match: {createdAt: {$gte: since}, isCreatedByUser: true, ...userMsgFilter}},
            // Deduplicate: one entry per (day, user) pair
            {
              $group: {
                _id: {
                  day: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: '+05:30',
                    },
                  },
                  user: '$user',
                },
              },
            },
            // Count distinct users per day
            {
              $group: {
                _id: '$_id.day',
                count: {$sum: 1},
              },
            },
            {$project: {day: '$_id', count: 1, _id: 0}},
            {$sort: {day: 1}},
          ],
          {session},
        )
        .toArray();

      return result as DailyActiveUsersEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get daily user trend: ${error}`);
    }
  }

  async getWeeklyQueryCounts(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<WeeklyQueryCountEntry[]> {
    try {
      await this.init(source);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isCreatedByUser: true, ...userMsgFilter}},
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%G-W%V',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },
                count: {$sum: 1},
              },
            },
            {$project: {week: '$_id', count: 1, _id: 0}},
            {$sort: {week: 1}},
          ],
          {session},
        )
        .toArray();

      return result as WeeklyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly query counts: ${error}`,
      );
    }
  }

  async getTodayQueryCount(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<number> {
    try {
      await this.init(source);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      return this.messagesCollection.countDocuments(
        {createdAt: {$gte: today}, isCreatedByUser: true, ...userMsgFilter},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to get today query count: ${error}`,
      );
    }
  }

  async findMatchingMessages(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
  }) {
    await this.init();
    await this.initReviewSystem();
    const {question, details, createdAt, questionId} = data;

    const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);

    let result = await this.messagesCollection
      .aggregate([
        {
          $match: {
            createdAt: {
              $gte: start,
              $lte: end,
            },
          },
        },
        {
          $addFields: {
            userObjectId: {
              $cond: [
                {
                  $and: [{$ne: ['$user', null]}, {$ne: ['$user', '']}],
                },
                {$toObjectId: '$user'},
                null,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userObjectId',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();
    const baseTime = new Date('2026-04-10T07:36:36.357Z');
    const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
    let matchedMessageId: string | null = null;
    const result1 = result.filter(doc => {
      try {
        const isNewFlow = new Date(doc.createdAt) > cutoffDate;
        const matchedContent = doc.content?.find(
          (item: any) =>
            item?.type === 'tool_call' &&
            item?.tool_call?.name ===
              'upload_question_to_reviewer_system_mcp_pop' || item?.tool_call?.name === 'upload_question_to_reviewer_system_mcp_reviewer',
        );

        if (!matchedContent) return false;
        if (isNewFlow) {
          if (!matchedContent?.tool_call?.output) return false;
          const outputArr = JSON.parse(matchedContent.tool_call.output);
          const innerText = outputArr?.[0]?.text;
          const parsedOutput = JSON.parse(innerText);
          const questionIdFromOutput = parsedOutput?.question_id;
          const isMatch = questionIdFromOutput == questionId?.toString();
          if (isMatch) {
            matchedMessageId = doc.messageId;
          }
          return isMatch;
        }
        const args = JSON.parse(matchedContent.tool_call.args);

        return (
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() ===
            details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase()
        );
      } catch (e) {
        return false;
      }
    });
    if (matchedMessageId && questionId) {
      await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {messageId: matchedMessageId}},
      );
    }
    return result1;
  }

  async findFromSecondDb(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
  }) {
    await this.initSecondDb();
    await this.initReviewSystem();
    const {question, details, createdAt, questionId} = data;

    const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);
    let result = await this.annamMessagesCollection
      .aggregate([
        {
          $match: {
            createdAt: {
              $gte: start,
              $lte: end,
            },
          },
        },
        {
          $addFields: {
            userObjectId: {
              $cond: [
                {
                  $and: [{$ne: ['$user', null]}, {$ne: ['$user', '']}],
                },
                {$toObjectId: '$user'},
                null,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userObjectId',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();
    const baseTime = new Date('2026-04-10T07:36:36.357Z');
    const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
    let matchedMessageId: string | null = null;
    const result1 = result.filter(doc => {
      try {
        const isNewFlow = new Date(doc.createdAt) > cutoffDate;
        const matchedContent = doc.content?.find(
          (item: any) =>
            item?.type === 'tool_call' &&
            item?.tool_call?.name ===
              'upload_question_to_reviewer_system_mcp_pop' || item?.tool_call?.name === 'upload_question_to_reviewer_system_mcp_reviewer',
        );

        if (!matchedContent) return false;
        if (isNewFlow) {
          if (!matchedContent?.tool_call?.output) return false;
          const outputArr = JSON.parse(matchedContent.tool_call.output);
          const innerText = outputArr?.[0]?.text;
          const parsedOutput = JSON.parse(innerText);
          const questionIdFromOutput = parsedOutput?.question_id;
          const isMatch = questionIdFromOutput == questionId?.toString();
          if (isMatch) {
            matchedMessageId = doc.messageId;
          }
          return isMatch;
        }

        const args = JSON.parse(matchedContent.tool_call.args);

        return (
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() ===
            details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase()
        );
      } catch (e) {
        return false;
      }
    });
    if (matchedMessageId && questionId) {
      await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {messageId: matchedMessageId}},
      );
    }
    return result1;
  }

  async getUserDetails(
    startDate?: Date,
    endDate?: Date,
    page = 1,
    limit = 10,
    search = '',
    source = 'vicharanashala',
    crop = '',
    village = '',
    profileCompleted = 'all',
    inactiveOnly = false,
    session?: ClientSession,
    userType = 'all',
  ): Promise<PaginatedUserDetails> {
    try {
      await this.init(source);

      // Build date match for messages (optional)
      const dateMatch: Record<string, any> = { isCreatedByUser: true };
      if (startDate || endDate) {
        dateMatch.createdAt = {};
        if (startDate) dateMatch.createdAt.$gte = startDate;
        if (endDate) dateMatch.createdAt.$lte = endDate;
      }

      // Get question counts per user from messages
      const messageCounts = await this.messagesCollection
        .aggregate(
          [
            { $match: dateMatch },
            {
              $group: {
                _id: '$user',
                totalQuestions: { $sum: 1 },
              },
            },
          ],
          { session },
        )
        .toArray();

      // Build a map: userId string → count
      const countMap = new Map<string, number>();
      for (const entry of messageCounts) {
        countMap.set(String(entry._id), entry.totalQuestions);
      }

      // Get users — optionally filtered by search, crop, village
      const userFilter: Record<string, any> = { ...this.buildUserDocFilter(userType) };
      if (search && search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        userFilter.$or = [
          { name: regex },
          { username: regex },
          { email: regex },
        ];
      }
      if (crop && crop.trim()) {
        const cropRegex = { $regex: crop.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: [
              { 'farmerProfile.cropsCultivated': cropRegex },
              { 'farmerProfile.primaryCrop': cropRegex },
              { 'farmerProfile.secondaryCrop': cropRegex },
            ],
          },
        ];
      }
      if (village && village.trim()) {
        const villageRegex = { $regex: village.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          { 'farmerProfile.villageName': villageRegex },
        ];
      }
      if (profileCompleted === 'yes') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          { farmerProfile: { $exists: true, $ne: null } },
        ];
      } else if (profileCompleted === 'no') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          { $or: [{ farmerProfile: { $exists: false } }, { farmerProfile: null }] },
        ];
      }

      const allUsers = await this.users.find(userFilter, { session }).toArray();

      // Merge
      const merged: UserDetailEntry[] = allUsers.map((u) => ({
        userId: String(u._id),
        name: u.name || u.username || 'Unknown',
        email: u.email || '',
        totalQuestions: countMap.get(String(u._id)) ?? 0,
        farmerProfile: u.farmerProfile ? {
          farmerName: u.farmerProfile.farmerName,
          age: u.farmerProfile.age,
          gender: u.farmerProfile.gender,
          villageName: u.farmerProfile.villageName,
          blockName: u.farmerProfile.blockName,
          district: u.farmerProfile.district,
          state: u.farmerProfile.state,
          phoneNo: u.farmerProfile.phoneNo,
          languagePreference: u.farmerProfile.languagePreference,
          yearsOfExperience: u.farmerProfile.yearsOfExperience,
          cropsCultivated: u.farmerProfile.cropsCultivated,
          primaryCrop: u.farmerProfile.primaryCrop,
          secondaryCrop: u.farmerProfile.secondaryCrop,
          awarenessOfKCC: u.farmerProfile.awarenessOfKCC,
          usesAgriApps: u.farmerProfile.usesAgriApps,
          highestEducatedPerson: u.farmerProfile.highestEducatedPerson,
          numberOfSmartphones: u.farmerProfile.numberOfSmartphones,
          location: u.farmerProfile.location,
        } : undefined,
      }));

      // Filter to inactive users only if requested
      const finalList = inactiveOnly ? merged.filter((u) => u.totalQuestions === 0) : merged;

      // Sort by totalQuestions desc
      finalList.sort((a, b) => b.totalQuestions - a.totalQuestions);

      // Compute summary stats over the full filtered set
      const totalUsers = finalList.length;
      const activeUsers = finalList.filter((u) => u.totalQuestions > 0).length;
      const inactiveUsers = totalUsers - activeUsers;
      const totalQuestions = finalList.reduce((sum, u) => sum + u.totalQuestions, 0);
      const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

      // Paginate
      const startIdx = (page - 1) * limit;
      const users = finalList.slice(startIdx, startIdx + limit);

      return {
        users,
        totalUsers,
        totalPages,
        activeUsers,
        inactiveUsers,
        totalQuestions,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user details: ${error}`);
    }
  }

  // ── NEW: Inactivity-gap based avg session duration (KPI number) ──────────────
  // Uses the messages collection instead of conversations.
  // For each conversation: sums only the gaps between consecutive messages that
  // are ≤ 30 minutes. Gaps > 30 min are treated as the user being away and are
  // excluded. Single-message conversations are also excluded.
  // Requires MongoDB 5.0+ ($setWindowFields).
  async getAvgSessionDurationV2(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<number> {
    try {
      await this.init(source);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            ...(Object.keys(userMsgFilter).length > 0 ? [{ $match: userMsgFilter }] : []),
            {$sort: {conversationId: 1, createdAt: 1}},
            {
              $setWindowFields: {
                partitionBy: '$conversationId',
                sortBy: {createdAt: 1},
                output: {
                  prevCreatedAt: {$shift: {output: '$createdAt', by: -1}},
                },
              },
            },
            {
              $addFields: {
                gapMs: {
                  $cond: [
                    {$ifNull: ['$prevCreatedAt', false]},
                    {$subtract: ['$createdAt', '$prevCreatedAt']},
                    0,
                  ],
                },
              },
            },
            // Discard gaps > 30 minutes (1,800,000 ms) — user was idle/away
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },
            {
              $group: {
                _id: '$conversationId',
                activeSessionMs: {$sum: '$activeGapMs'},
                msgCount: {$sum: 1},
              },
            },
            // Skip conversations with only 1 message — no gaps, nothing to measure
            {$match: {msgCount: {$gt: 1}}},
            {$group: {_id: null, avg: {$avg: '$activeSessionMs'}}},
          ],
          {session},
        )
        .toArray();

      const avgMs = result[0]?.avg ?? 0;
      return Math.round((avgMs / 60000) * 10) / 10;
    } catch (error) {
      throw new InternalServerError(`Failed to get avg session duration v2: ${error}`);
    }
  }

  // ── NEW: Inactivity-gap based weekly avg session duration (sparkline/delta) ──
  // Same gap-detection logic as getAvgSessionDurationV2, but groups results by
  // ISO week (based on the first message of each conversation) so the frontend
  // can render the sparkline and week-over-week % delta.
  async getWeeklyAvgSessionDurationV2(weeks = 52, source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      const userMsgFilter = await this.buildUserMessageFilter(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}, ...userMsgFilter}},
            {$sort: {conversationId: 1, createdAt: 1}},
            {
              $setWindowFields: {
                partitionBy: '$conversationId',
                sortBy: {createdAt: 1},
                output: {
                  prevCreatedAt: {$shift: {output: '$createdAt', by: -1}},
                  firstMsgInConv: {
                    $first: '$createdAt',
                    window: {documents: ['unbounded', 'current']},
                  },
                },
              },
            },
            {
              $addFields: {
                gapMs: {
                  $cond: [
                    {$ifNull: ['$prevCreatedAt', false]},
                    {$subtract: ['$createdAt', '$prevCreatedAt']},
                    0,
                  ],
                },
              },
            },
            // Discard gaps > 30 minutes (1,800,000 ms) — user was idle/away
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },
            {
              $group: {
                _id: '$conversationId',
                activeSessionMs: {$sum: '$activeGapMs'},
                firstMsg: {$min: '$firstMsgInConv'},
                msgCount: {$sum: 1},
              },
            },
            {$match: {msgCount: {$gt: 1}}},
            {
              $addFields: {
                week: {
                  $dateToString: {
                    format: '%G-W%V',
                    date: '$firstMsg',
                    timezone: '+05:30',
                  },
                },
              },
            },
            {
              $group: {
                _id: '$week',
                avgDurationMs: {$avg: '$activeSessionMs'},
              },
            },
            {
              $project: {
                week: '$_id',
                avgSessionDurationMin: {
                  $round: [{$divide: ['$avgDurationMs', 60000]}, 1],
                },
                _id: 0,
              },
            },
            {$sort: {week: 1}},
          ],
          {session},
        )
        .toArray();

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get weekly avg session duration v2: ${error}`);
    }
  }

  async getUserDemographics(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<UserDemographics> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);

      const [ageRaw, genderRaw, expRaw] = await Promise.all([
        // Age group buckets
        this.users.aggregate<{_id: string | number; count: number}>(
          [
            {$match: {'farmerProfile.age': {$exists: true, $ne: null}, ...userDocFilter}},
            {
              $bucket: {
                groupBy: '$farmerProfile.age',
                boundaries: [18, 26, 36, 46, 56],
                default: '55+',
                output: {count: {$sum: 1}},
              },
            },
          ],
          {session},
        ).toArray(),

        // Gender split
        this.users.aggregate<{_id: string; count: number}>(
          [
            {$match: {'farmerProfile.gender': {$exists: true, $ne: null}, ...userDocFilter}},
            {$group: {_id: '$farmerProfile.gender', count: {$sum: 1}}},
          ],
          {session},
        ).toArray(),

        // Farming experience buckets
        this.users.aggregate<{_id: number | string; count: number}>(
          [
            {$match: {'farmerProfile.yearsOfExperience': {$exists: true, $ne: null}, ...userDocFilter}},
            {
              $bucket: {
                groupBy: '$farmerProfile.yearsOfExperience',
                boundaries: [0, 2, 5, 10, 20],
                default: '20+',
                output: {count: {$sum: 1}},
              },
            },
          ],
          {session},
        ).toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const ageBoundaryLabel: Record<string | number, string> = {
        18: '18-25', 26: '26-35', 36: '36-45', 46: '46-55', '55+': '55+',
      };
      const ageTotal = ageRaw.reduce((s, r) => s + r.count, 0);
      const ageGroups: DemographicEntry[] = ageRaw.map(r => ({
        label: ageBoundaryLabel[r._id] ?? String(r._id),
        count: r.count,
        pct: toPct(r.count, ageTotal),
      }));

      const genderTotal = genderRaw.reduce((s, r) => s + r.count, 0);
      const genderMap: Record<string, string> = {male: 'Male', female: 'Female', other: 'Other'};
      const genderSplit: DemographicEntry[] = genderRaw.map(r => ({
        label: genderMap[(r._id ?? '').toLowerCase()] ?? r._id,
        count: r.count,
        pct: toPct(r.count, genderTotal),
      }));

      const expBoundaryLabel: Record<string | number, string> = {
        0: 'Less than 2 yrs', 2: '2 - 5 yrs', 5: '5 - 10 yrs', 10: '10 - 20 yrs', '20+': '20+ yrs',
      };
      const expTotal = expRaw.reduce((s, r) => s + r.count, 0);
      const farmingExperience: DemographicEntry[] = expRaw.map(r => ({
        label: expBoundaryLabel[r._id] ?? String(r._id),
        count: r.count,
        pct: toPct(r.count, expTotal),
      }));

      return {ageGroups, genderSplit, farmingExperience};
    } catch (error) {
      throw new InternalServerError(`Failed to get user demographics: ${error}`);
    }
  }

  async getKccAndAgriAppStats(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<KccAndAgriAppStats> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);

      const [kccRaw, agriRaw] = await Promise.all([
        // KCC awareness split
        this.users.aggregate<{_id: boolean; count: number}>(
          [
            {$match: {'farmerProfile.awarenessOfKCC': {$exists: true, $ne: null}, ...userDocFilter}},
            {$group: {_id: '$farmerProfile.awarenessOfKCC', count: {$sum: 1}}},
          ],
          {session},
        ).toArray(),

        // Agri apps usage split
        this.users.aggregate<{_id: boolean; count: number}>(
          [
            {$match: {'farmerProfile.usesAgriApps': {$exists: true, $ne: null}, ...userDocFilter}},
            {$group: {_id: '$farmerProfile.usesAgriApps', count: {$sum: 1}}},
          ],
          {session},
        ).toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const kccTotal = kccRaw.reduce((s, r) => s + r.count, 0);
      const kccAwareness: DemographicEntry[] = kccRaw
        .sort((_, b) => (b._id ? 1 : -1))
        .map(r => ({
          label: r._id ? 'Aware' : 'Not Aware',
          count: r.count,
          pct: toPct(r.count, kccTotal),
        }));

      const agriTotal = agriRaw.reduce((s, r) => s + r.count, 0);
      const agriAppUsage: DemographicEntry[] = agriRaw
        .sort((_, b) => (b._id ? 1 : -1))
        .map(r => ({
          label: r._id ? 'Uses Apps' : 'Does Not Use',
          count: r.count,
          pct: toPct(r.count, agriTotal),
        }));

      return {kccAwareness, agriAppUsage};
    } catch (error) {
      throw new InternalServerError(`Failed to get KCC and agri app stats: ${error}`);
    }
  }

  async generateChatbotExcelReport(
    startDate: Date,
    endDate: Date,
    source = 'vicharanashala',
    session?: ClientSession,
  ): Promise<ChatbotConversationData[]> {
    try {
      await this.init(source);
      return this.messagesCollection
        .aggregate<ChatbotConversationData>(
          [
            {
              $match: {
                createdAt: {$gte: startDate, $lte: endDate},
              },
            },
            {
              $group: {
                _id: '$conversationId',
                farmerQuestions: {
                  $push: {
                    $cond: {
                      if: {$eq: ['$isCreatedByUser', true]},
                      then: '$text',
                      else: null,
                    },
                  },
                },
                mcpToolCalls: {
                  $push: {
                    $cond: {
                      if: {$eq: ['$isCreatedByUser', false]},
                      then: '$content',
                      else: null,
                    },
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                conversationId: '$_id',
                farmerQuestions: {
                  $filter: {
                    input: '$farmerQuestions',
                    as: 'q',
                    cond: {
                      $and: [{$ne: ['$$q', null]}, {$ne: ['$$q', '']}],
                    },
                  },
                },
                mcpToolCalls: {
                  $filter: {
                    input: '$mcpToolCalls',
                    as: 'c',
                    cond: {
                      $and: [
                        {$ne: ['$$c', null]},
                        {$gt: [{$size: {$ifNull: ['$$c', []]}}, 0]},
                      ],
                    },
                  },
                },
              },
            },
            {$match: {'farmerQuestions.0': {$exists: true}}},
          ],
          {maxTimeMS: 60000, allowDiskUse: true, session},
        )
        .toArray();
    } catch (error) {
      throw new InternalServerError(`Failed to generate chatbot Excel report: ${error}`);
    }
  }

  async getIdsCreated(startDate:Date,endDate:Date, session?: ClientSession) {
    try {
      await this.init();
      const result = await this.users.aggregate([
        {
          $match: {
            createdAt: {$gte: startDate, $lte: endDate},
          },
        },
        {
          $group: {
            _id:{
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt'}
            },
            count: {$sum: 1}
          }
        },
        {
          $sort: {_id: 1}
        },
      ]).toArray()
      return result
    }catch (error) {
      throw new InternalServerError(`Failed to get IDs created: ${error}`);
    }
  }

  async getInstalls(startDate:Date,endDate:Date, session?: ClientSession) {
    try {
      await this.init();
      const result = await this.users.aggregate([
        {
          $match:{
            farmerProfile: {$exists: true, $ne: null},
            updatedAt:{ $gte: startDate, $lte: endDate}
          },
        },
        {
          $group: {
            _id:{
              $dateToString: { format: '%Y-%m-%d', date: '$updatedAt'}
            },
            count: {$sum: 1}
          },
        },
        {
          $sort: {_id: 1}
        },
      ]).toArray()
      return result
    }catch (error) {
      throw new InternalServerError(`Failed to get installs: ${error}`);  
    }
  }

  async getActiveUsers(startDate:Date,endDate:Date, session?: ClientSession) {
    try {
    await this.init();
    const result = await this.messagesCollection.aggregate([
      {
        $match:{
          createdAt: { $gte: startDate, $lte: endDate},
        },
      },
      {
        $group: {
          _id:{
            date: {$dateToString: { format: '%Y-%m-%d', date: '$createdAt'}},
            user:"$user"
          },
        },
      },
      {
        $group:{
          _id:"$_id.date",
          count: {$sum: 1}
        },
      },
      {
        $sort: {_id: 1}
      },
    ]).toArray()
    return result
    }catch (error) {
      throw new InternalServerError(`Failed to get active users: ${error}`);    
    }
  }
}

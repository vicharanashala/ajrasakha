import { inject, injectable } from 'inversify';
import { Collection, ClientSession } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { AnalyticsMongoDatabase } from '../AnalyticsMongoDatabase.js';
import {AnnamDatabase} from '../AnnamDatabase.js'
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
  WeeklyQueryCountEntry,
  UserDetailEntry,
} from '#root/shared/database/interfaces/IChatbotRepository.js';

interface IUser {
  _id?: any;
  name?: string;
  username?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
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
    @inject(GLOBAL_TYPES.analyticsDatabase)
    private analyticsDb: AnalyticsMongoDatabase,

    @inject(GLOBAL_TYPES.annamanalyticsDatabase)
    private annamDb: AnnamDatabase,
  ) {}

  /*constructor(
    @inject(GLOBAL_TYPES.annamanalyticsDatabase)
    private analyticsDb: AnnamDatabase,
  ) {}*/

  private async init() {
    this.users = await this.analyticsDb.getCollection<IUser>('users');
    this.conversations = await this.analyticsDb.getCollection<IConversation>('conversations');
    this.messagesCollection = await this.analyticsDb.getCollection<any>('messages');
  }
  private annamMessagesCollection!: Collection<any>;

private async initSecondDb() {
  this.annamMessagesCollection = await this.annamDb.getCollection<any>('messages');
}

  async getKpiSummary(session?: ClientSession): Promise<KpiSummary> {
    try {
      await this.init();

      // Use MongoDB $dateToString with IST timezone (+05:30) to correctly bucket months
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      const [totalUsers, monthlyActivity, sessionStats, todayQueryCount] = await Promise.all([
        this.users.countDocuments({}, { session }),

        // Group users by month in IST timezone using updatedAt
        this.users.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$updatedAt', timezone: '+05:30' } },
              count: { $sum: 1 },
            },
          },
        ], { session }).toArray(),

        // Avg session duration from conversations
        this.conversations
          .aggregate([
            { $project: { durationMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
            { $group: { _id: null, avg: { $avg: '$durationMs' } } },
          ], { session })
          .toArray(),

        // Today's query count from messages
        this.getTodayQueryCount(session),
      ]);

      const monthMap = Object.fromEntries((monthlyActivity as any[]).map(m => [m._id, m.count]));
      const thisMonthActive = monthMap[currentYearMonth] ?? 0;
      const lastMonthActive = monthMap[lastYearMonth] ?? 0;

      const dauLastMonthPct = lastMonthActive === 0
        ? (thisMonthActive > 0 ? 100 : 0)
        : Math.round(((thisMonthActive - lastMonthActive) / lastMonthActive) * 100);

      const avgMs = sessionStats[0]?.avg ?? 0;

      return {
        dau: totalUsers,
        dauLastMonthPct,
        dailyQueries: todayQueryCount,
        avgSessionDurationMin: Math.round((avgMs / 60000) * 10) / 10,
        csatRating: 0,
        repeatQueryRatePct: 0,
        voiceUsageSharePct: 0,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(days = 13, session?: ClientSession): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init();

      // Count distinct users who sent messages per month (true monthly active users)
      const since = new Date();
      since.setMonth(since.getMonth() - days); // `days` param used as number of months to look back
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const result = await this.messagesCollection
        .aggregate([
          { $match: { createdAt: { $gte: since }, isCreatedByUser: true } },
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
          { $project: { day: '$_id', count: 1, _id: 0 } },
          { $sort: { day: 1 } },
        ], { session })
        .toArray();

      return result as DailyActiveUsersEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get daily active users: ${error}`);
    }
  }

  async getChannelSplit(_session?: ClientSession): Promise<ChannelSplitEntry[]> {
    return [];
  }

  async getVoiceAccuracyByLanguage(_session?: ClientSession): Promise<VoiceAccuracyEntry[]> {
    return [];
  }

  async getGeoDistribution(_session?: ClientSession): Promise<GeoStateEntry[]> {
    return [];
  }

  async getQueryCategories(_session?: ClientSession): Promise<QueryCategoryEntry[]> {
    return [];
  }

  async getWeeklyAvgSessionDuration(weeks = 52, session?: ClientSession): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init();

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      const result = await this.conversations
        .aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $addFields: { durationMs: { $max: [0, { $subtract: ['$updatedAt', '$createdAt'] }] } } },
          {
            $group: {
              _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } },
              avgDurationMs: { $avg: '$durationMs' },
            },
          },
          {
            $project: {
              week: '$_id',
              avgSessionDurationMin: { $round: [{ $divide: ['$avgDurationMs', 60000] }, 1] },
              _id: 0,
            },
          },
          { $sort: { week: 1 } },
        ], { session })
        .toArray();

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get weekly avg session duration: ${error}`);
    }
  }

  async getDailyQueryCounts(days = 30, session?: ClientSession): Promise<DailyQueryCountEntry[]> {
    try {
      await this.init();

      const since = new Date();
      since.setDate(since.getDate() - days);

      const result = await this.messagesCollection
        .aggregate([
          { $match: { createdAt: { $gte: since }, isCreatedByUser: true } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $project: { day: '$_id', count: 1, _id: 0 } },
          { $sort: { day: 1 } },
        ], { session })
        .toArray();

      return result as DailyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get daily query counts: ${error}`);
    }
  }

  async getDailyUserTrend(days = 30, session?: ClientSession): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init();

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const result = await this.messagesCollection
        .aggregate([
          // Filter to last N days, user-sent messages only
          { $match: { createdAt: { $gte: since }, isCreatedByUser: true } },
          // Deduplicate: one entry per (day, user) pair
          {
            $group: {
              _id: {
                day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } },
                user: '$user',
              },
            },
          },
          // Count distinct users per day
          {
            $group: {
              _id: '$_id.day',
              count: { $sum: 1 },
            },
          },
          { $project: { day: '$_id', count: 1, _id: 0 } },
          { $sort: { day: 1 } },
        ], { session })
        .toArray();

      return result as DailyActiveUsersEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get daily user trend: ${error}`);
    }
  }

  async getWeeklyQueryCounts(session?: ClientSession): Promise<WeeklyQueryCountEntry[]> {
    try {
      await this.init();

      const result = await this.messagesCollection
        .aggregate(
          [
            { $match: { isCreatedByUser: true } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%G-W%V', date: '$createdAt', timezone: '+05:30' },
                },
                count: { $sum: 1 },
              },
            },
            { $project: { week: '$_id', count: 1, _id: 0 } },
            { $sort: { week: 1 } },
          ],
          { session },
        )
        .toArray();

      return result as WeeklyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(`Failed to get weekly query counts: ${error}`);
    }
  }

  async getTodayQueryCount(session?: ClientSession): Promise<number> {
    try {
      await this.init();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return this.messagesCollection.countDocuments(
        { createdAt: { $gte: today }, isCreatedByUser: true },
        { session },
      );
    } catch (error) {
      throw new InternalServerError(`Failed to get today query count: ${error}`);
    }
  }

  async findMatchingMessages(data: {
  question: string;
  details: any;
  createdAt: Date;
}) {
  await this.init();
  

  const { question, details, createdAt } = data;

  const start = new Date(new Date(createdAt).getTime() - 6*60 * 1000);
  const end = new Date(new Date(createdAt).getTime() + 6*60 * 1000);
  

  /*return this.messagesCollection
    .aggregate([
      {
        $match: {
          content: {
            $elemMatch: {
              type: 'tool_call',
              'tool_call.name':
                'upload_question_to_reviewer_system_mcp_pop',
            },
          },
        },
      },

      {
        $addFields: {
          matchedToolCall: {
            $first: {
              $filter: {
                input: '$content',
                as: 'item',
                cond: {
                  $and: [
                    { $eq: ['$$item.type', 'tool_call'] },
                    {
                      $eq: [
                        '$$item.tool_call.name',
                        'upload_question_to_reviewer_system_mcp_pop',
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },

      {
        $addFields: {
          parsedArgs: {
            $function: {
              body: function (args: string) {
                try {
                  return JSON.parse(args);
                } catch (e) {
                  return null;
                }
              },
              args: ['$matchedToolCall.tool_call.args'],
              lang: 'js',
            },
          },
        },
      },

      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$parsedArgs.question', question] },
              { $eq: ['$parsedArgs.details.state', details.state] },
              { $eq: ['$parsedArgs.details.crop', details.crop] },
            ],
          },
        },
      },

      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },

      // 🔥 JOIN USERS COLLECTION
      {
        $lookup: {
          from: 'users',
          localField: 'user',
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
    .toArray();*/
   /* let result = await this.messagesCollection
    .aggregate([
      {
        $match: {
          content: {
            $elemMatch: {
              type: 'tool_call',
              'tool_call.name': 'upload_question_to_reviewer_system_mcp_pop',
            },
          },
        },
      },
      {
        $addFields: {
          matchedToolCall: {
            $first: {
              $filter: {
                input: '$content',
                as: 'item',
                cond: {
                  $and: [
                    { $eq: ['$$item.type', 'tool_call'] },
                    {
                      $eq: [
                        '$$item.tool_call.name',
                        'upload_question_to_reviewer_system_mcp_pop',
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
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
            $toObjectId: '$user',
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
    .toArray();*/
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
              $and: [
                { $ne: ["$user", null] },
                { $ne: ["$user", ""] },
              ],
            },
            { $toObjectId: "$user" },
            null,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userDetails",
      },
    },
    {
      $unwind: {
        path: "$userDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
  ])
  .toArray();
   

  // ✅ filter in JS since $function is not allowed on this Atlas tier
  const result1 = result.filter((doc) => {
    try {
      const matchedContent = doc.content?.find(
        (item: any) =>
          item?.type === 'tool_call' &&
          item?.tool_call?.name === 'upload_question_to_reviewer_system_mcp_pop'
      );
   
      if (!matchedContent?.tool_call?.args) return false;
   
      const args = JSON.parse(matchedContent.tool_call.args);
      

   
      return (
        args?.question?.toLowerCase() === question?.toLowerCase() &&
        args?.details?.state?.toLowerCase() === details?.state?.toLowerCase() &&
        args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase()
      );
    } catch (e) {
      return false;
    }
  });
  
  return result1
}

  // SECOND DB (optional example)
  async findFromSecondDb(data: {
    question: string;
    details: any;
    createdAt: Date;
  }) {
    await this.initSecondDb();
  
    const { question, details, createdAt } = data;
  
    const start = new Date(new Date(createdAt).getTime() - 5*60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 5*60 * 1000);
  
   /* let result = await this.annamMessagesCollection
      .aggregate([
        {
          $match: {
            content: {
              $elemMatch: {
                type: 'tool_call',
                'tool_call.name': 'upload_question_to_reviewer_system_mcp_pop',
              },
            },
          },
        },
        {
          $addFields: {
            matchedToolCall: {
              $first: {
                $filter: {
                  input: '$content',
                  as: 'item',
                  cond: {
                    $and: [
                      { $eq: ['$$item.type', 'tool_call'] },
                      {
                        $eq: [
                          '$$item.tool_call.name',
                          'upload_question_to_reviewer_system_mcp_pop',
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
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
              $toObjectId: '$user',
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
      .toArray();*/
      let result = await this.annamMessagesCollection//vicharanasala
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
              $and: [
                { $ne: ["$user", null] },
                { $ne: ["$user", ""] },
              ],
            },
            { $toObjectId: "$user" },
            null,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userDetails",
      },
    },
    {
      $unwind: {
        path: "$userDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
  ])
  .toArray();
    
  
    // ✅ filter in JS since $function is not allowed on this Atlas tier
    const result1 = result.filter((doc) => {
      try {
        const matchedContent = doc.content?.find(
          (item: any) =>
            item?.type === 'tool_call' &&
            item?.tool_call?.name === 'upload_question_to_reviewer_system_mcp_pop'
        );
     
        if (!matchedContent?.tool_call?.args) return false;
     
        const args = JSON.parse(matchedContent.tool_call.args);
        
     
        return (
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() === details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase()
        );
      } catch (e) {
        return false;
      }
    });
    return result1
  }

  async getUserDetails(
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ): Promise<UserDetailEntry[]> {
    try {
      await this.init();

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

      // Get all users
      const allUsers = await this.users.find({}, { session }).toArray();

      // Merge
      const result: UserDetailEntry[] = allUsers.map((u) => ({
        userId: String(u._id),
        name: u.name || u.username || 'Unknown',
        email: u.email || '',
        totalQuestions: countMap.get(String(u._id)) ?? 0,
      }));

      // Sort by totalQuestions desc
      result.sort((a, b) => b.totalQuestions - a.totalQuestions);

      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get user details: ${error}`);
    }
  }
}

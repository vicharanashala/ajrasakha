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
  PlatformInstallEntry,
  DuplicateQuestionEntry,
  MonthlyQueryCountEntry,
  MonthlySessionDurationEntry,
  DistrictAnalyticsEntry,
  FeedbackData,
  ResponseAdherenceTable,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {MongoDatabase} from '../MongoDatabase.js';
import {DISTRICTS} from '#root/utils/districts.js';

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
    platform?: string;
    platformHistory?: {os: string; timestamp: string}[];
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

  private async getSourceAdherenceStats(
    source: 'WHATSAPP' | 'AJRASAKHA',
    userType = 'all',
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<{
    questionAsked: number;
    closedQuestionsCount: number;
    answeredWithin120Min: number;
    averageResponseMinutes: number;
    inReviewCount: number;
    openCount: number;
    delayedCount: number;
    dynamicWeatherCount: number;
    dynamicMarketCount: number;
    dynamicSchemesCount: number;
    markedDuplicateGdbCount: number;
  }> {
    const matchQuery: any = {source, createdAt: {$exists: true}};
    if (startTime || endTime) {
      matchQuery.createdAt = {};
      if (startTime) matchQuery.createdAt.$gte = new Date(startTime);
      if (endTime) matchQuery.createdAt.$lte = new Date(endTime);
    }

    const userTypeLookupStages = this.buildQuestionUserTypeLookupStages(userType);

    const result = await this.QuestionCollection.aggregate(
      [
        {$match: matchQuery},
        ...userTypeLookupStages,
        {
          $facet: {
            questionAsked: [{$count: 'count'}],
            closedQuestions: [
              {
                $match: {
                  status: 'closed',
                },
              },
              {$count: 'count'},
            ],
            answeredWithin120Min: [
              {
                $match: {
                  status: 'closed',
                  closedAt: {$exists: true},
                  totalAnswersCount: {$gt: 0},
                },
              },
              {
                $match: {
                  $expr: {
                    $and: [
                      {$gte: ['$closedAt', '$createdAt']},
                      {$lte: [{$subtract: ['$closedAt', '$createdAt']}, 120 * 60 * 1000]},
                    ],
                  },
                },
              },
              {$count: 'count'},
            ],
            averageResponse: [
              {
                $match: {
                  status: 'closed',
                  closedAt: {$exists: true},
                  totalAnswersCount: {$gt: 0},
                },
              },
              {$match: {$expr: {$gte: ['$closedAt', '$createdAt']}}},
              {
                $group: {
                  _id: null,
                  avgMinutes: {
                    $avg: {
                      $divide: [{$subtract: ['$closedAt', '$createdAt']}, 60 * 1000],
                    },
                  },
                },
              },
            ],
            inReview: [
              {$match: {status: 'in-review'}},
              {$count: 'count'},
            ],
            open: [
              {$match: {status: 'open'}},
              {$count: 'count'},
            ],
            delayed: [
              {$match: {status: 'delayed'}},
              {$count: 'count'},
            ],
            markedDuplicateGdb: [
              {
                $match: {
                  status: 'duplicate',
                  referenceSource: {$regex: '^golden$', $options: 'i'},
                },
              },
              {$count: 'count'},
            ],
          },
        },
      ],
      {session},
    ).toArray();

    const row = result[0] ?? {};
    return {
      questionAsked: row.questionAsked?.[0]?.count ?? 0,
      closedQuestionsCount: row.closedQuestions?.[0]?.count ?? 0,
      answeredWithin120Min: row.answeredWithin120Min?.[0]?.count ?? 0,
      averageResponseMinutes: row.averageResponse?.[0]?.avgMinutes ?? 0,
      inReviewCount: row.inReview?.[0]?.count ?? 0,
      openCount: row.open?.[0]?.count ?? 0,
      delayedCount: row.delayed?.[0]?.count ?? 0,
      dynamicWeatherCount: 0,
      dynamicMarketCount: 0,
      dynamicSchemesCount: 0,
      markedDuplicateGdbCount: row.markedDuplicateGdb?.[0]?.count ?? 0,
    };
  }

  async getResponseAdherenceTable(
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
    source = 'vicharanashala',
  ): Promise<ResponseAdherenceTable> {
    try {
      await this.init(source);
      await this.initReviewSystem();

      const [whatsapp, ajrasakha] = await Promise.all([
        this.getSourceAdherenceStats('WHATSAPP', userType, startTime, endTime, session),
        this.getSourceAdherenceStats('AJRASAKHA', userType, startTime, endTime, session),
      ]);

      const messageMatch: any = {isDeleted: {$ne: true}};
      if (startTime || endTime) {
        messageMatch.createdAt = {};
        if (startTime) messageMatch.createdAt.$gte = new Date(startTime);
        if (endTime) messageMatch.createdAt.$lte = new Date(endTime);
      }
      const adherenceMessageStats = await this.messagesCollection
        .aggregate(
          [
            {$match: messageMatch},
            ...this.buildUserTypeLookupStages(userType),
            {
              $addFields: {
                _sourceHint: {
                  $toUpper: {
                    $concat: [
                      {$ifNull: ['$source', '']},
                      ' ',
                      {$ifNull: ['$endpoint', '']},
                    ],
                  },
                },
                _sourceBucket: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $regexMatch: {
                            input: '$_sourceHint',
                            regex: 'WHATSAPP',
                          },
                        },
                        then: 'WHATSAPP',
                      },
                      {
                        case: {
                          $regexMatch: {
                            input: '$_sourceHint',
                            regex: 'WA\\b',
                          },
                        },
                        then: 'WHATSAPP',
                      },
                    ],
                    default: 'AJRASAKHA',
                  },
                },
              },
            },
            {
              $facet: {
                queryCounts: [
                  {
                    $match: {
                      sender: 'User',
                    },
                  },
                  {
                    $count: 'count',
                  },
                ],
                dynamicWeather: [
                  {
                    $match: {
                      'content.tool_call.name': {$regex: 'weather', $options: 'i'},
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
                dynamicMarket: [
                  {
                    $match: {
                      'content.tool_call.name': {$regex: 'market', $options: 'i'},
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
                dynamicSchemes: [
                  {
                    $match: {
                      'content.tool_call.name': {
                        $regex: '(scheme|schemes)',
                        $options: 'i',
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
              },
            },
          ],
          {session},
        )
        .toArray();
      const messageStats = adherenceMessageStats[0] ?? {};
      const queryCounts = messageStats.queryCounts ?? [];
      const dynamicWeatherCounts = messageStats.dynamicWeather ?? [];
      const dynamicMarketCounts = messageStats.dynamicMarket ?? [];
      const dynamicSchemesCounts = messageStats.dynamicSchemes ?? [];

      const whatsappDynamicWeather =
        dynamicWeatherCounts.find(q => q._id === 'WHATSAPP')?.count ?? 0;
      const ajrasakhaDynamicWeather =
        dynamicWeatherCounts.find(q => q._id === 'AJRASAKHA')?.count ?? 0;
      const whatsappDynamicMarket =
        dynamicMarketCounts.find(q => q._id === 'WHATSAPP')?.count ?? 0;
      const ajrasakhaDynamicMarket =
        dynamicMarketCounts.find(q => q._id === 'AJRASAKHA')?.count ?? 0;
      const whatsappDynamicSchemes =
        dynamicSchemesCounts.find(q => q._id === 'WHATSAPP')?.count ?? 0;
      const ajrasakhaDynamicSchemes =
        dynamicSchemesCounts.find(q => q._id === 'AJRASAKHA')?.count ?? 0;

      const totalUserMessages = queryCounts[0]?.count ?? 0;
      const whatsappQueriesAsked = 0;
      const ajrasakhaQueriesAsked = totalUserMessages;

      const whatsappAdherencePct =
        whatsapp.questionAsked > 0
          ? Math.round((whatsapp.answeredWithin120Min / whatsapp.questionAsked) * 100 * 100) / 100
          : 0;
      const ajrasakhaAdherencePct =
        ajrasakha.questionAsked > 0
          ? Math.round((ajrasakha.answeredWithin120Min / ajrasakha.questionAsked) * 100 * 100) / 100
          : 0;

      const startReference = startTime ? new Date(startTime) : new Date();
      const endReference = endTime ? new Date(endTime) : new Date();
      const startIst = new Date(
        startReference.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
      );
      const endIst = new Date(
        endReference.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
      );
      const hh = String(endIst.getHours()).padStart(2, '0');
      const mm = String(endIst.getMinutes()).padStart(2, '0');
      const date = startIst.toLocaleDateString('en-GB').split('/').join('-');
      const whatsappNonGdbWithin120 = whatsapp.closedQuestionsCount;
      const ajrasakhaNonGdbWithin120 = ajrasakha.closedQuestionsCount;

      return {
        date,
        time: `${hh}:${mm}`,
        timeWindow: `[00:00-${hh}:${mm}]`,
        whatsappQueriesAsked,
        ajrasakhaQueriesAsked,
        whatsappPushedToReviewer: whatsapp.questionAsked,
        ajrasakhaPushedToReviewer: ajrasakha.questionAsked,
        whatsappAnsweredWithin120Min: whatsapp.answeredWithin120Min,
        ajrasakhaAnsweredWithin120Min: ajrasakha.answeredWithin120Min,
        whatsappMarkedDuplicate: whatsapp.markedDuplicateGdbCount,
        ajrasakhaMarkedDuplicate: ajrasakha.markedDuplicateGdbCount,
        whatsappDynamicWeather,
        ajrasakhaDynamicWeather,
        whatsappDynamicMarket,
        ajrasakhaDynamicMarket,
        whatsappDynamicSchemes,
        ajrasakhaDynamicSchemes,
        whatsappNonGdbWithin120,
        ajrasakhaNonGdbWithin120,
        whatsappInReview: whatsapp.inReviewCount,
        ajrasakhaInReview: ajrasakha.inReviewCount,
        whatsappOpen: whatsapp.openCount,
        ajrasakhaOpen: ajrasakha.openCount,
        whatsappDelayed: whatsapp.delayedCount,
        ajrasakhaDelayed: ajrasakha.delayedCount,
        whatsappAverageResponseMinutes:
          Math.round(whatsapp.averageResponseMinutes * 100) / 100,
        ajrasakhaAverageResponseMinutes:
          Math.round(ajrasakha.averageResponseMinutes * 100) / 100,
        whatsappAdherencePct,
        ajrasakhaAdherencePct,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get response adherence table: ${error}`,
      );
    }
  }

  /**
   * Returns aggregation pipeline stages that join messages → users via $lookup
   * and filter by user type (external/internal). When userType is 'all', returns
   * an empty array (zero overhead). This replaces the old two-step pattern of
   * getExternalUserIds() + buildUserMessageFilter() which caused a separate DB
   * query for every method call.
   */
  private buildUserTypeLookupStages(userType: string): any[] {
    if (userType === 'all') return [];

    const stages: any[] = [
      {
        $addFields: {
          _userOid: {
            $cond: [
              {$and: [{$ne: ['$user', null]}, {$ne: ['$user', '']}]},
              {$toObjectId: '$user'},
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_userOid',
          foreignField: '_id',
          as: '_userDoc',
        },
      },
    ];

    if (userType === 'external') {
      // $unwind without preserveNull drops messages with no matching user (correct)
      stages.push(
        {$unwind: '$_userDoc'},
        {$match: {'_userDoc.email': {$regex: '^rup', $options: 'i'}}},
      );
    } else {
      // internal: preserve messages from unknown users, exclude 'rup' emails
      stages.push(
        {$unwind: {path: '$_userDoc', preserveNullAndEmptyArrays: true}},
        {$match: {'_userDoc.email': {$not: {$regex: '^rup', $options: 'i'}}}},
      );
    }

    stages.push({$unset: ['_userOid', '_userDoc']});
    return stages;
  }

  private buildUserDocFilter(userType: string): Record<string, any> {
    if (userType === 'all') return {};
    return userType === 'external'
      ? {email: {$regex: '^rup', $options: 'i'}}
      : {email: {$not: {$regex: '^rup', $options: 'i'}}};
  }

  private buildQuestionUserTypeLookupStages(userType: string): any[] {
    if (userType === 'all') return [];

    const stages: any[] = [
      {
        $addFields: {
          _userOid: {
            $cond: [
              {$and: [{$ne: ['$userId', null]}, {$ne: ['$userId', '']}]},
              {$toObjectId: '$userId'},
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_userOid',
          foreignField: '_id',
          as: '_userDoc',
        },
      },
    ];

    const userDocFilter = this.buildUserDocFilter(userType);
    const transformedFilter: Record<string, any> = {};
    for (const key of Object.keys(userDocFilter)) {
      transformedFilter[`_userDoc.${key}`] = userDocFilter[key];
    }

    if (userType === 'external') {
      stages.push({$unwind: '$_userDoc'}, {$match: transformedFilter});
    } else {
      stages.push(
        {$unwind: {path: '$_userDoc', preserveNullAndEmptyArrays: true}},
        {$match: transformedFilter},
      );
    }

    stages.push({$unset: ['_userOid', '_userDoc']});
    return stages;
  }

  async getKpiSummary(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<KpiSummary> {
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

      const userDocFilter = this.buildUserDocFilter(userType);
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const [
        totalUsers,
        monthlyActivity,
        sessionStats,
        todayQueryCount,
        totalAppInstalls,
        activeUsersLast3Days,
        usersWithFeedback,
      ] = await Promise.all([
        this.users.countDocuments(userDocFilter, {session}),

        // Group users by month in IST timezone using updatedAt
        this.users
          .aggregate(
            [
              {$match: userDocFilter},
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

        // this.users.countDocuments(
        //   {
        //     ...userDocFilter,
        //     'farmerProfile.farmerName': {$exists: true, $nin: [null, '']},
        //   },
        //   {session},
        // ),

        this.users.countDocuments(
          {
            ...userDocFilter,
            farmerProfile: {$exists: true, $ne: null},
          },
          {session},
        ),

        // Count distinct users who sent messages in the last 3 days
        this.messagesCollection
          .aggregate(
            [
              {
                $match: {
                  createdAt: {$gte: threeDaysAgo},
                  isCreatedByUser: true,
                  isDeleted: {$ne: true},
                },
              },
              ...userTypeLookupStages,
              {$group: {_id: '$user'}},
              {$count: 'total'},
            ],
            {session},
          )
          .toArray(),

        // Count distinct users who have given at least one feedback (feedback object exists in any message)
        this.messagesCollection
          .aggregate(
            [
              {
                $match: {
                  feedback: {$exists: true},
                  isCreatedByUser: false,
                  isDeleted: {$ne: true},
                },
              },
              {$group: {_id: '$user'}},
              {$count: 'total'},
            ],
            {session},
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
      const feedbackCount = (usersWithFeedback as any[])[0]?.total ?? 0;

      await this.initReviewSystem();
      // Count only duplicates that have a matching message in the selected source DB —
      // this matches exactly what getDuplicateQuestions returns in the modal.
      const dupeWithMsgId = await this.QuestionCollection.find({
        similarityScore: {$exists: true},
        messageId: {$exists: true, $ne: null},
      })
        .project<{messageId: string}>({messageId: 1})
        .toArray();

      const dupeMsgIds = dupeWithMsgId
        .map(q => q.messageId)
        .filter(Boolean) as string[];
      let duplicateQuestionsCount = 0;
      if (dupeMsgIds.length > 0) {
        const existingMessages = await this.messagesCollection
          .find({messageId: {$in: dupeMsgIds}, isDeleted: {$ne: true}})
          .project<{messageId: string}>({messageId: 1})
          .toArray();
        const existingMsgIdSet = new Set(
          existingMessages.map(m => m.messageId),
        );
        duplicateQuestionsCount = dupeWithMsgId.filter(q =>
          existingMsgIdSet.has(q.messageId),
        ).length;
      }

      // Construct matches based on startTime and endTime if provided
      const queryMatch: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
        text: {$exists: true, $ne: null, $nin: ['', ' ']},
      };
      if (startTime || endTime) {
        queryMatch.createdAt = {};
        if (startTime) {
          queryMatch.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          queryMatch.createdAt.$lte = new Date(endTime);
        }
      }

      // Calculate repeatQueryCount from messages (trim, lowercase, aggregate repeat counts)
      const repeatQueryRaw = await this.messagesCollection
        .aggregate(
          [
            {$match: queryMatch},
            ...userTypeLookupStages,
            {
              $group: {
                _id: {$toLower: {$trim: {input: '$text'}}},
                count: {$sum: 1},
              },
            },
            {
              $match: {count: {$gt: 1}},
            },
            {
              $group: {
                _id: null,
                totalRepeats: {$sum: {$subtract: ['$count', 1]}},
              },
            },
          ],
          {session},
        )
        .toArray();
      const repeatQueryCount = repeatQueryRaw[0]?.totalRepeats ?? 0;

      // Count total queries to get percentage
      const totalQueriesRaw = await this.messagesCollection
        .aggregate(
          [{$match: queryMatch}, ...userTypeLookupStages, {$count: 'count'}],
          {session},
        )
        .toArray();
      const totalQueries = totalQueriesRaw[0]?.count ?? 0;
      const repeatQueryRatePct =
        totalQueries > 0
          ? Math.round((repeatQueryCount / totalQueries) * 100 * 10) / 10
          : 0;

      // Avg questions per user per day over the filtered range (or default to last 30 days)
      const avgQuestionsMatch: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
        text: {$exists: true, $ne: null, $nin: ['', ' ']},
      };
      if (startTime || endTime) {
        avgQuestionsMatch.createdAt = {};
        if (startTime) {
          avgQuestionsMatch.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          avgQuestionsMatch.createdAt.$lte = new Date(endTime);
        }
      }

      const avgQuestionsRaw = await this.messagesCollection
        .aggregate(
          [
            {$match: avgQuestionsMatch},
            ...userTypeLookupStages,
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
                userDailyCount: {$sum: 1},
              },
            },
            {
              $group: {
                _id: '$_id.day',
                dayTotalQuestions: {$sum: '$userDailyCount'},
                dayUniqueUsers: {$sum: 1},
              },
            },
            {
              $group: {
                _id: null,
                avgQuestionsPerUserDay: {
                  $avg: {$divide: ['$dayTotalQuestions', '$dayUniqueUsers']},
                },
              },
            },
          ],
          {session},
        )
        .toArray();
      const avgQuestionsPerUserDay =
        avgQuestionsRaw[0]?.avgQuestionsPerUserDay ?? 0;

      return {
        dau: totalUsers,
        dauLastMonthPct,
        dailyQueries: todayQueryCount,
        avgSessionDurationMin: Math.round((avgMs / 60000) * 10) / 10,
        csatRating: 0,
        repeatQueryRatePct,
        voiceUsageSharePct: 0,
        totalAppInstalls,
        inactiveUsersLast3Days: Math.max(0, totalUsers - activeCount),
        duplicateQuestionsCount,
        lowFeedbackUsersCount: Math.max(0, totalUsers - feedbackCount),
        avgQuestionsPerUserDay: Math.round(avgQuestionsPerUserDay * 100) / 100,
        repeatQueryCount,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(
    days = 13,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      // Count distinct users who sent messages per month (true monthly active users)
      const since = new Date();
      since.setMonth(since.getMonth() - days); // `days` param used as number of months to look back
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
            // Deduplicate: one entry per (month, user) pair
            {
              $group: {
                _id: {
                  month: {
                    $dateToString: {
                      format: '%Y-%m',
                      date: '$createdAt',
                      timezone: '+05:30',
                    },
                  },
                  user: '$user',
                },
              },
            },
            // Count distinct users per month
            {
              $group: {
                _id: '$_id.month',
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
      throw new InternalServerError(
        `Failed to get daily active users: ${error}`,
      );
    }
  }

  async getChannelSplit(
    _source = 'vicharanashala',
    _session?: ClientSession,
  ): Promise<ChannelSplitEntry[]> {
    return [];
  }

  async getVoiceAccuracyByLanguage(
    _source = 'vicharanashala',
    _session?: ClientSession,
  ): Promise<VoiceAccuracyEntry[]> {
    return [];
  }

  async getGeoDistribution(
    _source = 'vicharanashala',
    _session?: ClientSession,
  ): Promise<GeoStateEntry[]> {
    return [];
  }

  async getQueryCategories(
    _source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<QueryCategoryEntry[]> {
    try {
      await this.initReviewSystem();

      const lookupStages = this.buildQuestionUserTypeLookupStages(userType);

      const pipeline = [
        {
          $match: {
            source: 'AJRASAKHA',
            'details.domain': {$exists: true, $nin: [null, '']},
          },
        },
        ...lookupStages,
        {
          $project: {
            domain: '$details.domain',
            isDuplicate: {
              $cond: [{$eq: ['$status', 'duplicate']}, 1, 0],
            },
          },
        },
        {
          $group: {
            _id: '$domain',
            totalCount: {$sum: 1},
            duplicateCount: {$sum: '$isDuplicate'},
            uniqueCount: {
              $sum: {
                $cond: [{$eq: ['$isDuplicate', 0]}, 1, 0],
              },
            },
          },
        },
        {
          $sort: {totalCount: -1},
        },
        {
          $limit: 15,
        },
      ];

      const raw = await this.QuestionCollection.aggregate(pipeline, {
        session,
      }).toArray();

      return raw.map(item => ({
        label: item._id,
        questionCount: item.uniqueCount,
        duplicateQuestionCount: item.duplicateCount,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch query categories: ${error}`);
    }
  }

  async getDistrictAnalyticsByState(
    _source = 'vicharanashala',
    state: string,
    session?: ClientSession,
    userType = 'all',
  ): Promise<DistrictAnalyticsEntry[]> {
    try {
      await this.initReviewSystem();

      const districts = DISTRICTS[state];

      if (!districts || districts.length === 0) {
        return [];
      }

      // Normalize district names
      const normalizedDistricts = districts.map(d => d.toLowerCase().trim());

      const lookupStages = this.buildQuestionUserTypeLookupStages(userType);

      const pipeline = [
        {
          $match: {
            source: 'AJRASAKHA',

            'details.district': {
              $exists: true,
              $ne: null,
            },
          },
        },

        ...lookupStages,

        // Normalize district from DB
        {
          $addFields: {
            normalizedDistrict: {
              $toLower: '$details.district',
            },
          },
        },

        // Keep only districts belonging to selected state
        {
          $match: {
            normalizedDistrict: {
              $in: normalizedDistricts,
            },
          },
        },

        {
          $project: {
            district: '$details.district',

            isDuplicate: {
              $cond: [
                {
                  $eq: ['$status', 'duplicate'],
                },
                1,
                0,
              ],
            },
          },
        },

        {
          $group: {
            _id: '$district',

            totalQuestions: {
              $sum: 1,
            },

            duplicateQuestions: {
              $sum: '$isDuplicate',
            },

            uniqueQuestions: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$isDuplicate', 0],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        {
          $sort: {
            totalQuestions: -1,
          },
        },
      ];

      const raw = await this.QuestionCollection.aggregate(pipeline, {
        session,
      }).toArray();

      const districtMap = new Map(
        raw.map(item => [
          item._id.toLowerCase().trim(),
          {
            district: item._id,
            totalQuestions: item.totalQuestions,
            uniqueQuestions: item.uniqueQuestions,
            duplicateQuestions: item.duplicateQuestions,
          },
        ]),
      );

      const normalizedResult: DistrictAnalyticsEntry[] = districts.map(
        district => {
          const normalizedDistrict = district.toLowerCase().trim();

          const existing = districtMap.get(normalizedDistrict);

          return (
            existing || {
              district,

              totalQuestions: 0,

              uniqueQuestions: 0,

              duplicateQuestions: 0,
            }
          );
        },
      );

      return normalizedResult.sort(
        (a, b) => b.totalQuestions - a.totalQuestions,
      );
    } catch (error) {
      throw new Error(`Failed to fetch district analytics: ${error}`);
    }
  }

  async getTopCrops(
    session?: ClientSession,
  ): Promise<{totalQuestions: number; topCrops: any[]}> {
    try {
      await this.initReviewSystem();

      const matchStage = {source: {$ne: 'AGRI_EXPERT'}};

      const cropFieldRaw = {
        $ifNull: ['$details.normalised_crop', '$details.crop'],
      };
      const normalizedCropExpr = {$toLower: cropFieldRaw};

      const cropDataRaw = await this.QuestionCollection.aggregate(
        [
          {$match: matchStage},
          {$group: {_id: normalizedCropExpr, count: {$sum: 1}}},
          {$project: {name: '$_id', count: 1, _id: 0}},
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [
                {$match: matchStage},
                {$group: {_id: normalizedCropExpr, count: {$sum: 1}}},
                {$project: {name: '$_id', count: 1, _id: 0}},
              ],
            },
          },
          {$group: {_id: '$name', count: {$sum: '$count'}}},
          {$match: {_id: {$ne: null}}},
          {$project: {name: '$_id', count: 1, _id: 0}},
          {$sort: {count: -1}},
          {$limit: 10},
        ],
        {session},
      ).toArray();
      const totalCountRaw = await this.QuestionCollection.aggregate(
        [
          {$match: matchStage},
          {$count: 'count'},
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [{$match: matchStage}, {$count: 'count'}],
            },
          },
          {$group: {_id: null, total: {$sum: '$count'}}},
        ],
        {session},
      ).toArray();

      const totalQuestions =
        totalCountRaw.length > 0 ? totalCountRaw[0].total : 0;

      // Capitalize first letter of each crop for display
      const topCrops = cropDataRaw
        .filter((r: any) => r.name)
        .map((r: any) => ({
          ...r,
          name:
            String(r.name).charAt(0).toUpperCase() + String(r.name).slice(1),
        }));

      return {totalQuestions, topCrops};
    } catch (error) {
      throw new InternalServerError(`Failed to get top crops: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(
    weeks = 52,
    source = 'vicharanashala',
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]> {
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

  async getDailyQueryCounts(
    days = 30,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyQueryCountEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
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

  async getDailyUserTrend(
    days = 30,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            // Filter to last N days, user-sent messages only
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
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

  async getWeeklyQueryCounts(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<WeeklyQueryCountEntry[]> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isCreatedByUser: true, isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
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

  async getMonthlyQueryCounts(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<MonthlyQueryCountEntry[]> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                isCreatedByUser: true,
              },
            },

            ...userTypeLookupStages,

            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },

                count: {
                  $sum: 1,
                },
              },
            },

            {
              $project: {
                month: '$_id',
                count: 1,
                _id: 0,
              },
            },

            {
              $sort: {
                month: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      return result as MonthlyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly query counts: ${error}`,
      );
    }
  }

async getQuerySummaryByPeriod(
  period: 'daily' | 'weekly' | 'monthly',
  source = 'vicharanashala',
  session?: ClientSession,
  userType = 'all',
) {
  try {
    await this.init(source);

    const userTypeLookupStages =
      this.buildUserTypeLookupStages(userType);

    const now = new Date();

    let startDate = new Date();
    let label = '';

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        label = 'Today Queries';
        break;

      case 'weekly':
        startDate.setDate(now.getDate() - 7);
        label = 'Last 7 Days Queries';
        break;

      case 'monthly':
        startDate.setDate(now.getDate() - 30);
        label = 'Last 30 Days Queries';
        break;
    }

    const result = await this.messagesCollection
      .aggregate(
        [
          {
            $match: {
              createdAt: {
                $gte: startDate,
              },

              isCreatedByUser: true,

              isDeleted: {
                $ne: true,
              },
            },
          },

          ...userTypeLookupStages,

          {
            $count: 'total',
          },
        ],
        { session },
      )
      .toArray();

    return {
      label,
      totalQueries: result[0]?.total || 0,
    };
  } catch (error) {
    throw new InternalServerError(
      `Failed to get query summary: ${error}`,
    );
  }
}

  // ============================================
// HELPER
// ============================================

private getMonthDateRange(month: string) {
  // month => "2026-05"

  const start = new Date(`${month}-01T00:00:00.000Z`);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end };
}


// ============================================
// DAILY ANALYTICS
// ============================================

async getDailyAnalytics(
  month?: string,
  source = 'vicharanashala',
  session?: ClientSession,
  userType = 'all',
) {
  try {
    await this.init(source);
    await this.initReviewSystem();

    const monthRange = month ? this.getMonthDateRange(month) : null;
    const monthDateMatch = monthRange
      ? {createdAt: {$gte: monthRange.start, $lt: monthRange.end}}
      : {};

    const userTypeLookupStages =
      this.buildUserTypeLookupStages(userType);

    // ============================================
    // MESSAGE COLLECTION DATA
    // ============================================

    const messageData = await this.messagesCollection
      .aggregate(
        [
          {
            $match: {
              ...monthDateMatch,

              isCreatedByUser: true,

              isDeleted: {
                $ne: true,
              },
            },
          },

          ...userTypeLookupStages,

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              queryCount: {
                $sum: 1,
              },
            },
          },

          {
            $project: {
              _id: 0,
              period: '$_id',
              queryCount: 1,
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // QUESTIONS COLLECTION DATA
    // ============================================

    const questionData = await this.QuestionCollection
      .aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',

              ...monthDateMatch,
            },
          },

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: [
                            '$closedAt',
                            '$createdAt',
                          ],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,

              period: '$_id',

              totalQuestions: 1,

              closedQuestions: 1,

              averageCloseTimeMinutes: {
                $round: [
                  '$averageCloseTimeMinutes',
                  2,
                ],
              },
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // MERGE DATA
    // ============================================

    const mergedMap = new Map();

    for (const item of messageData) {
      mergedMap.set(item.period, {
        period: item.period,
        queryCount: item.queryCount,
        totalQuestions: 0,
        closedQuestions: 0,
        averageCloseTimeMinutes: 0,
      });
    }

    for (const item of questionData) {
      const existing = mergedMap.get(item.period);

      if (existing) {
        existing.totalQuestions = item.totalQuestions;
        existing.closedQuestions = item.closedQuestions;
        existing.averageCloseTimeMinutes =
          item.averageCloseTimeMinutes || 0;
      } else {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: 0,
          totalQuestions: item.totalQuestions,
          closedQuestions: item.closedQuestions,
          averageCloseTimeMinutes:
            item.averageCloseTimeMinutes || 0,
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  } catch (error) {
    throw new InternalServerError(
      `Failed to get daily analytics: ${error}`,
    );
  }
}



// ============================================
// WEEKLY ANALYTICS
// ============================================

async getWeeklyAnalytics(
  month?: string,
  source = 'vicharanashala',
  session?: ClientSession,
  userType = 'all',
) {
  try {
    await this.init(source);
    await this.initReviewSystem();

    const monthRange = month ? this.getMonthDateRange(month) : null;
    const monthDateMatch = monthRange
      ? {createdAt: {$gte: monthRange.start, $lt: monthRange.end}}
      : {};

    const userTypeLookupStages =
      this.buildUserTypeLookupStages(userType);

    // ============================================
    // MESSAGE DATA
    // ============================================

    const messageData = await this.messagesCollection
      .aggregate(
        [
          {
            $match: {
              ...monthDateMatch,

              isCreatedByUser: true,

              isDeleted: {
                $ne: true,
              },
            },
          },

          ...userTypeLookupStages,

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%G-W%V',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              queryCount: {
                $sum: 1,
              },
            },
          },

          {
            $project: {
              _id: 0,
              period: '$_id',
              queryCount: 1,
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // QUESTION DATA
    // ============================================

    const questionData = await this.QuestionCollection
      .aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',

              ...monthDateMatch,
            },
          },

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%G-W%V',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: [
                            '$closedAt',
                            '$createdAt',
                          ],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,

              period: '$_id',

              totalQuestions: 1,

              closedQuestions: 1,

              averageCloseTimeMinutes: {
                $round: [
                  '$averageCloseTimeMinutes',
                  2,
                ],
              },
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // MERGE
    // ============================================

    const mergedMap = new Map();

    for (const item of messageData) {
      mergedMap.set(item.period, {
        period: item.period,
        queryCount: item.queryCount,
        totalQuestions: 0,
        closedQuestions: 0,
        averageCloseTimeMinutes: 0,
      });
    }

    for (const item of questionData) {
      const existing = mergedMap.get(item.period);

      if (existing) {
        existing.totalQuestions = item.totalQuestions;
        existing.closedQuestions = item.closedQuestions;
        existing.averageCloseTimeMinutes =
          item.averageCloseTimeMinutes || 0;
      } else {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: 0,
          totalQuestions: item.totalQuestions,
          closedQuestions: item.closedQuestions,
          averageCloseTimeMinutes:
            item.averageCloseTimeMinutes || 0,
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  } catch (error) {
    throw new InternalServerError(
      `Failed to get weekly analytics: ${error}`,
    );
  }
}



// ============================================
// MONTHLY ANALYTICS
// ============================================

async getMonthlyAnalytics(
  source = 'vicharanashala',
  session?: ClientSession,
  userType = 'all',
  year?: number,
) {
  try {
    await this.init(source);
    await this.initReviewSystem();

    const yearDateMatch = year
      ? {
          createdAt: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
          },
        }
      : {};

    const userTypeLookupStages =
      this.buildUserTypeLookupStages(userType);

    // ============================================
    // MESSAGE DATA
    // ============================================

    const messageData = await this.messagesCollection
      .aggregate(
        [
          {
            $match: {
              ...yearDateMatch,

              isCreatedByUser: true,

              isDeleted: {
                $ne: true,
              },
            },
          },

          ...userTypeLookupStages,

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              queryCount: {
                $sum: 1,
              },
            },
          },

          {
            $project: {
              _id: 0,
              period: '$_id',
              queryCount: 1,
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // QUESTION DATA
    // ============================================

    const questionData = await this.QuestionCollection
      .aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',
              ...yearDateMatch,
            },
          },

          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: [
                            '$closedAt',
                            '$createdAt',
                          ],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,

              period: '$_id',

              totalQuestions: 1,

              closedQuestions: 1,

              averageCloseTimeMinutes: {
                $round: [
                  '$averageCloseTimeMinutes',
                  2,
                ],
              },
            },
          },
        ],
        { session },
      )
      .toArray();

    // ============================================
    // MERGE
    // ============================================

    const mergedMap = new Map();

    for (const item of messageData) {
      mergedMap.set(item.period, {
        period: item.period,
        queryCount: item.queryCount,
        totalQuestions: 0,
        closedQuestions: 0,
        averageCloseTimeMinutes: 0,
      });
    }

    for (const item of questionData) {
      const existing = mergedMap.get(item.period);

      if (existing) {
        existing.totalQuestions = item.totalQuestions;
        existing.closedQuestions = item.closedQuestions;
        existing.averageCloseTimeMinutes =
          item.averageCloseTimeMinutes || 0;
      } else {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: 0,
          totalQuestions: item.totalQuestions,
          closedQuestions: item.closedQuestions,
          averageCloseTimeMinutes:
            item.averageCloseTimeMinutes || 0,
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  } catch (error) {
    throw new InternalServerError(
      `Failed to get monthly analytics: ${error}`,
    );
  }
}

  async getFeedbackData(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<FeedbackData> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                feedback: {$exists: true},
                isCreatedByUser: false,
                isDeleted: {$ne: true},
              },
            },

            ...userTypeLookupStages,

            {
              $addFields: {
                numericRating: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $eq: ['$feedback.rating', 'thumbsUp'],
                        },
                        then: 1,
                      },
                      {
                        case: {
                          $eq: ['$feedback.rating', 'thumbsDown'],
                        },
                        then: 0,
                      },
                    ],
                    default: null,
                  },
                },
              },
            },

            {
              $facet: {
                positiveFeedbacks: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsUp',
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      rating: '$feedback.rating',
                      tag: '$feedback.tag',
                    },
                  },
                ],

                negativeFeedbacks: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsDown',
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      rating: '$feedback.rating',
                      tag: '$feedback.tag',
                    },
                  },
                ],

                stats: [
                  {
                    $group: {
                      _id: null,

                      positiveCount: {
                        $sum: {
                          $cond: [
                            {
                              $eq: ['$feedback.rating', 'thumbsUp'],
                            },
                            1,
                            0,
                          ],
                        },
                      },

                      negativeCount: {
                        $sum: {
                          $cond: [
                            {
                              $eq: ['$feedback.rating', 'thumbsDown'],
                            },
                            1,
                            0,
                          ],
                        },
                      },

                      averageRating: {
                        $avg: '$numericRating',
                      },

                      totalFeedbacks: {
                        $sum: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
          {session},
        )
        .toArray();

      const data = result[0];

      return {
        positiveFeedbacks: data.positiveFeedbacks,
        negativeFeedbacks: data.negativeFeedbacks,
        stats: data.stats[0],
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get feedback data: ${error}`);
    }
  }

  async getTodayQueryCount(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<number> {
    try {
      await this.init(source);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: today},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
            {$count: 'total'},
          ],
          {session},
        )
        .toArray();

      return (result as any[])[0]?.total ?? 0;
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
    messageId: string | undefined;
  }) {
    await this.init();
    await this.initReviewSystem();
    const {question, details, createdAt, questionId, messageId} = data;

    const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);

    let pipeline = [];

    if (messageId) {
      pipeline.push({
        $match: {
          messageId,
        },
      });
    } else {
      pipeline.push({
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      });
    }
    pipeline.push(
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
    );
    let result = await this.messagesCollection.aggregate(pipeline).toArray();
    if (messageId) return result;
    const baseTime = new Date('2026-04-10T07:36:36.357Z');
    const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
    let matchedMessageId: string | null = null;
    let matchedUserId: ObjectId | null = null;
    const result1 = result.filter(doc => {
      try {
        const isNewFlow = new Date(doc.createdAt) > cutoffDate;
        const matchedContent = doc.content?.find((item: any) => {
          const isRightTool =
            item?.type === 'tool_call' &&
            (item?.tool_call?.name ===
              'upload_question_to_reviewer_system_mcp_pop' ||
              item?.tool_call?.name ===
                'upload_question_to_reviewer_system_mcp_reviewer');

          if (!isRightTool || !item?.tool_call?.output) {
            return false;
          }
          try {
            const outputArr = JSON.parse(item.tool_call.output);
            const innerText = outputArr?.[0]?.text;

            if (!innerText) return false;

            const parsedOutput = JSON.parse(innerText);

            const isNotFailed = parsedOutput?.status.toLowerCase() !== 'failed';

            return isNotFailed;
          } catch (error) {
            console.error('Failed to parse tool call output in filter:', error);
            return false;
          }
        });
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
            matchedUserId = doc.userObjectId ?? null;
          }
          return isMatch;
        }
        const args = JSON.parse(matchedContent.tool_call.args);

        const isMatch =
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() ===
            details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase();

        if (isMatch) {
          matchedMessageId = doc.messageId;
          matchedUserId = doc.userObjectId ?? null;
        }

        return isMatch;
      } catch (e) {
        return false;
      }
    });
    if (matchedMessageId && questionId) {
      const updateFields: Record<string, any> = {messageId: matchedMessageId};
      if (matchedUserId) {
        updateFields.userId = matchedUserId;
      }
      const question = await this.QuestionCollection.findOne({
        _id: new ObjectId(questionId),
      });
      if (!question.messageId)
        await this.QuestionCollection.updateOne(
          {_id: new ObjectId(questionId)},
          {$set: updateFields},
        );
    }

    return result1;
  }

  async findFromSecondDb(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
    messageId: string | undefined;
  }) {
    await this.initSecondDb();
    await this.initReviewSystem();
    const {question, details, createdAt, questionId, messageId} = data;

    const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);

    let pipeline = [];

    if (messageId) {
      pipeline.push({
        $match: {
          messageId,
        },
      });
    } else {
      pipeline.push({
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      });
    }

    pipeline.push(
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
    );
    let result = await this.annamMessagesCollection
      .aggregate(pipeline)
      .toArray();
    if (messageId) return result;
    const baseTime = new Date('2026-04-10T07:36:36.357Z');
    const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
    let matchedMessageId: string | null = null;
    let matchedUserId: ObjectId | null = null;
    const result1 = result.filter(doc => {
      try {
        const isNewFlow = new Date(doc.createdAt) > cutoffDate;
        const matchedContent = doc.content?.find((item: any) => {
          const isRightTool =
            item?.type === 'tool_call' &&
            (item?.tool_call?.name ===
              'upload_question_to_reviewer_system_mcp_pop' ||
              item?.tool_call?.name ===
                'upload_question_to_reviewer_system_mcp_reviewer');

          if (!isRightTool || !item?.tool_call?.output) {
            return false;
          }
          try {
            const outputArr = JSON.parse(item.tool_call.output);
            const innerText = outputArr?.[0]?.text;

            if (!innerText) return false;

            const parsedOutput = JSON.parse(innerText);

            const isNotFailed =
              parsedOutput?.status?.toLowerCase() !== 'failed';

            return isNotFailed;
          } catch (error) {
            console.error('Failed to parse tool call output in filter:', error);
            return false;
          }
        });

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
            matchedUserId = doc.userObjectId ?? null;
          }
          return isMatch;
        }

        const args = JSON.parse(matchedContent.tool_call.args);

        const isMatch =
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() ===
            details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase();

        if (isMatch) {
          matchedMessageId = doc.messageId;
          matchedUserId = doc.userObjectId ?? null;
        }

        return isMatch;
      } catch (e) {
        return false;
      }
    });
    if (matchedMessageId && questionId) {
      const updateFields: Record<string, any> = {messageId: matchedMessageId};
      if (matchedUserId) {
        updateFields.userId = matchedUserId;
      }
      const question = await this.QuestionCollection.findOne({
        _id: new ObjectId(questionId),
      });
      if (!question.messageId)
        await this.QuestionCollection.updateOne(
          {_id: new ObjectId(questionId)},
          {$set: updateFields},
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
    sortBy = 'name',
    sortOrder = 'asc',
    lowFeedbackOnly = false,
  ): Promise<PaginatedUserDetails> {
    try {
      await this.init(source);

      // Build date match for messages (optional)
      const dateMatch: Record<string, any> = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
      };
      if (startDate || endDate) {
        dateMatch.createdAt = {};
        if (startDate) dateMatch.createdAt.$gte = startDate;
        if (endDate) dateMatch.createdAt.$lte = endDate;
      }

      // Get question counts per user from messages
      const messageCounts = await this.messagesCollection
        .aggregate(
          [
            {$match: dateMatch},
            {
              $group: {
                _id: '$user',
                totalQuestions: {$sum: 1},
              },
            },
          ],
          {session},
        )
        .toArray();

      // Build a map: userId string → count
      const countMap = new Map<string, number>();
      for (const entry of messageCounts) {
        countMap.set(String(entry._id), entry.totalQuestions);
      }

      // Get users — optionally filtered by search, crop, village
      const userFilter: Record<string, any> = {
        ...this.buildUserDocFilter(userType),
      };
      if (search && search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = {$regex: escaped, $options: 'i'};
        userFilter.$or = [{name: regex}, {username: regex}, {email: regex}];
      }
      if (crop && crop.trim()) {
        const cropRegex = {
          $regex: crop.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: [
              {'farmerProfile.cropsCultivated': cropRegex},
              {'farmerProfile.primaryCrop': cropRegex},
              {'farmerProfile.secondaryCrop': cropRegex},
            ],
          },
        ];
      }
      if (village && village.trim()) {
        const villageRegex = {
          $regex: village.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {'farmerProfile.villageName': villageRegex},
        ];
      }
      if (profileCompleted === 'yes') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {farmerProfile: {$exists: true, $ne: null}},
        ];
      } else if (profileCompleted === 'no') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {$or: [{farmerProfile: {$exists: false}}, {farmerProfile: null}]},
        ];
      }

      const allUsers = await this.users.find(userFilter, {session}).toArray();

      // Merge
      const merged: UserDetailEntry[] = allUsers.map(u => ({
        userId: String(u._id),
        name: u.name || u.username || 'Unknown',
        email: u.email || '',
        totalQuestions: countMap.get(String(u._id)) ?? 0,
        farmerProfile: u.farmerProfile
          ? {
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
              platform: u.farmerProfile.platform,
              platformHistory: u.farmerProfile.platformHistory,
              location: u.farmerProfile.location,
            }
          : undefined,
      }));

      // Filter to inactive users only if requested
      const afterInactive = inactiveOnly
        ? merged.filter(u => u.totalQuestions === 0)
        : merged;

      // Filter to low-feedback users only if requested (all-time, no date range on feedback)
      let finalList = afterInactive;
      if (lowFeedbackOnly) {
        const feedbackDocs = await this.messagesCollection
          .aggregate([
            {
              $match: {
                feedback: {$exists: true},
                isCreatedByUser: false,
                isDeleted: {$ne: true},
              },
            },
            {$group: {_id: '$user'}},
          ])
          .toArray();
        const usersWithFeedback = new Set(
          feedbackDocs.map((d: any) => String(d._id)),
        );
        finalList = afterInactive.filter(u => !usersWithFeedback.has(u.userId));
      }

      // Sort based on sortBy and sortOrder parameters
      if (sortBy === 'name') {
        if (sortOrder === 'asc') {
          finalList.sort((a, b) => a.name.localeCompare(b.name));
        } else {
          finalList.sort((a, b) => b.name.localeCompare(a.name));
        }
      } else {
        // Default: totalQuestions
        if (sortOrder === 'asc') {
          finalList.sort((a, b) => a.totalQuestions - b.totalQuestions);
        } else {
          finalList.sort((a, b) => b.totalQuestions - a.totalQuestions);
        }
      }

      // Compute summary stats over the full filtered set
      const totalUsers = finalList.length;
      const activeUsers = finalList.filter(u => u.totalQuestions > 0).length;
      const inactiveUsers = totalUsers - activeUsers;
      const totalQuestions = finalList.reduce(
        (sum, u) => sum + u.totalQuestions,
        0,
      );
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

  async getUserQuestionsData(
    messageIds: string[],
    source: string,
    userType = 'all',
    page = 1,
    limit = 10,
  ) {
    try {
      await this.initReviewSystem();

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const skip = (page - 1) * limit;

      const pipeline = [
        {
          $match: {
            messageId: {
              $in: messageIds,
            },

            source: 'AJRASAKHA',
          },
        },

        ...userTypeLookupStages,

        // Newest first
        {
          $sort: {
            createdAt: -1,
          },
        },

        // Group duplicate questions
        {
          $group: {
            _id: {
              $toLower: '$question',
            },

            totalRepeated: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$status', 'duplicate'],
                  },
                  1,
                  0,
                ],
              },
            },

            latestQuestion: {
              $first: '$question',
            },

            latestStatus: {
              $first: '$status',
            },

            latestCreatedAt: {
              $first: '$createdAt',
            },

            latestUpdatedAt: {
              $first: '$updatedAt',
            },

            latestMessageId: {
              $first: '$messageId',
            },
          },
        },

        {
          $project: {
            _id: 0,

            messageId: '$latestMessageId',

            question: '$latestQuestion',

            status: '$latestStatus',

            createdAt: '$latestCreatedAt',

            updatedAt: '$latestUpdatedAt',

            repeatedCount: {
              $cond: [
                {
                  $gt: ['$totalRepeated', 0],
                },

                {
                  $add: ['$totalRepeated', 1],
                },

                1,
              ],
            },

            isDuplicate: {
              $gt: ['$totalRepeated', 0],
            },
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        // Better optimization
        {
          $facet: {
            metadata: [
              {
                $count: 'total',
              },
            ],

            data: [
              {
                $skip: skip,
              },

              {
                $limit: limit,
              },
            ],
          },
        },
      ];

      const result =
        await this.QuestionCollection.aggregate(pipeline).toArray();

      const totalQuestions = result[0]?.metadata?.[0]?.total || 0;

      const questions = result[0]?.data || [];

      const totalPages = Math.ceil(totalQuestions / limit);

      return {
        total: totalQuestions,

        totalPages,

        currentPage: page,

        limit,

        items: questions,
      };
    } catch (err) {
      throw new InternalServerError(`Failed to get question data: ${err}`);
    }
  }

  async getUsersMessages(
    email: string,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
    page = 1,
    limit = 10,
  ) {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const user = await this.users.findOne({email: email}, {session});

      if (!user) {
        throw new Error('User not found');
      }

      const skip = (page - 1) * limit;

      const pipeline = [
        {
          $match: {
            user: String(user._id),
            sender: 'User',
            isCreatedByUser: true,
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        // Group repeated messages
        {
          $group: {
            _id: {
              $trim: {
                input: {
                  $toLower: '$text',
                },
              },
            },

            repeatedCount: {
              $sum: 1,
            },

            latestMessage: {
              $first: '$text',
            },

            latestCreatedAt: {
              $first: '$createdAt',
            },

            latestUpdatedAt: {
              $first: '$updatedAt',
            },

            latestMessageId: {
              $first: '$messageId',
            },
          },
        },

        {
          $project: {
            _id: 0,

            message: '$latestMessage',

            createdAt: '$latestCreatedAt',

            updatedAt: '$latestUpdatedAt',

            messageId: '$latestMessageId',

            repeatedCount: 1,

            isDuplicate: {
              $gt: ['$repeatedCount', 1],
            },
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },
      ];

      // Total count

      const totalResult = await this.messagesCollection
        .aggregate([
          ...pipeline,
          {
            $count: 'total',
          },
        ])
        .toArray();

      const totalMessages = totalResult[0]?.total || 0;

      const totalPages = Math.ceil(totalMessages / limit);

      // Paginated messages

      const messages = await this.messagesCollection
        .aggregate([
          ...pipeline,

          {
            $skip: skip,
          },

          {
            $limit: limit,
          },
        ])
        .toArray();

      return {
        totalMessages,

        totalPages,

        currentPage: page,

        limit,

        messages,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get users messages: ${error}`);
    }
  }

  async getUserData(
    userEmail: string,
    source: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(source);
      const user = await this.users.findOne({email: userEmail}, {session});
      if (!user) {
        throw new Error('User not found');
      }
      return {
        userId: String(user._id),
        name: user.name || user.username || 'Unknown',
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user data: ${error}`);
    }
  }
  // ── NEW: Inactivity-gap based avg session duration (KPI number) ──────────────
  // Uses the messages collection instead of conversations.
  // For each conversation: sums only the gaps between consecutive messages that
  // are ≤ 30 minutes. Gaps > 30 min are treated as the user being away and are
  // excluded. Single-message conversations are also excluded.
  // Requires MongoDB 5.0+ ($setWindowFields).
  async getAvgSessionDurationV2(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<number> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
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
      throw new InternalServerError(
        `Failed to get avg session duration v2: ${error}`,
      );
    }
  }

  // ── NEW: Inactivity-gap based weekly avg session duration (sparkline/delta) ──
  // Same gap-detection logic as getAvgSessionDurationV2, but groups results by
  // ISO week (based on the first message of each conversation) so the frontend
  // can render the sparkline and week-over-week % delta.
  async getWeeklyAvgSessionDurationV2(
    weeks = 52,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}, isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
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
      throw new InternalServerError(
        `Failed to get weekly avg session duration v2: ${error}`,
      );
    }
  }

  async getMonthlyAvgSessionDuration(
    months = 12,
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<MonthlySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setMonth(since.getMonth() - months);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isDeleted: {$ne: true},
              },
            },

            ...userTypeLookupStages,

            {
              $sort: {
                conversationId: 1,
                createdAt: 1,
              },
            },

            {
              $setWindowFields: {
                partitionBy: '$conversationId',

                sortBy: {
                  createdAt: 1,
                },

                output: {
                  prevCreatedAt: {
                    $shift: {
                      output: '$createdAt',
                      by: -1,
                    },
                  },

                  firstMsgInConv: {
                    $first: '$createdAt',

                    window: {
                      documents: ['unbounded', 'current'],
                    },
                  },
                },
              },
            },

            {
              $addFields: {
                gapMs: {
                  $cond: [
                    {$ifNull: ['$prevCreatedAt', false]},

                    {
                      $subtract: ['$createdAt', '$prevCreatedAt'],
                    },

                    0,
                  ],
                },
              },
            },

            // Ignore inactive gaps > 30 mins
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

                activeSessionMs: {
                  $sum: '$activeGapMs',
                },

                firstMsg: {
                  $min: '$firstMsgInConv',
                },

                msgCount: {
                  $sum: 1,
                },
              },
            },

            // Ignore single-message conversations
            {
              $match: {
                msgCount: {$gt: 1},
              },
            },

            // MONTH GROUPING
            {
              $addFields: {
                month: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$firstMsg',
                    timezone: '+05:30',
                  },
                },
              },
            },

            {
              $group: {
                _id: '$month',

                avgDurationMs: {
                  $avg: '$activeSessionMs',
                },
              },
            },

            {
              $project: {
                month: '$_id',

                avgSessionDurationMin: {
                  $round: [
                    {
                      $divide: ['$avgDurationMs', 60000],
                    },
                    1,
                  ],
                },

                _id: 0,
              },
            },

            {
              $sort: {
                month: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      return result as MonthlySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly avg session duration: ${error}`,
      );
    }
  }

  async getUserDemographics(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<UserDemographics> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);

      const [ageRaw, genderRaw, expRaw] = await Promise.all([
        // Age group buckets
        this.users
          .aggregate<{_id: string | number; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.age': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $bucket: {
                  groupBy: '$farmerProfile.age',
                  boundaries: [18, 30, 45, 60],
                  default: '60+',
                  output: {count: {$sum: 1}},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Gender split
        this.users
          .aggregate<{_id: string; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.gender': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $addFields: {
                  normalizedGender: {
                    $toLower: {
                      $trim: {
                        input: '$farmerProfile.gender',
                      },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: '$normalizedGender',
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Farming experience buckets
        this.users
          .aggregate<{_id: number | string; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.yearsOfExperience': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
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
          )
          .toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const ageBoundaryLabel: Record<string | number, string> = {
        18: '18-30',
        30: '30-45',
        45: '45-60',
        '60+': '60+',
      };
      const ageTotal = ageRaw.reduce((s, r) => s + r.count, 0);
      const ageGroupsMap = new Map(ageRaw.map(r => [r._id, r.count]));

      const ageGroups: DemographicEntry[] = [18, 30, 45, '60+'].map(key => {
        const count = ageGroupsMap.get(key) || 0;
        return {
          label: ageBoundaryLabel[key],
          count,
          pct: toPct(count, ageTotal),
        };
      });

      let maleCount = 0;
      let femaleCount = 0;
      let othersCount = 0;

      genderRaw.forEach(r => {
        const genderStr = (r._id ?? '').toLowerCase();
        if (genderStr === 'male') {
          maleCount += r.count;
        } else if (genderStr === 'female') {
          femaleCount += r.count;
        } else {
          othersCount += r.count;
        }
      });

      const genderTotal = maleCount + femaleCount + othersCount;
      const genderSplit: DemographicEntry[] = [
        {label: 'Male', count: maleCount, pct: toPct(maleCount, genderTotal)},
        {
          label: 'Female',
          count: femaleCount,
          pct: toPct(femaleCount, genderTotal),
        },
        {
          label: 'Others',
          count: othersCount,
          pct: toPct(othersCount, genderTotal),
        },
      ].filter(g => g.count > 0);

      const expBoundaryLabel: Record<string | number, string> = {
        0: 'Less than 2 yrs',
        2: '2 - 5 yrs',
        5: '5 - 10 yrs',
        10: '10 - 20 yrs',
        '20+': '20+ yrs',
      };
      const expTotal = expRaw.reduce((s, r) => s + r.count, 0);
      const farmingExperience: DemographicEntry[] = expRaw.map(r => ({
        label: expBoundaryLabel[r._id] ?? String(r._id),
        count: r.count,
        pct: toPct(r.count, expTotal),
      }));

      return {ageGroups, genderSplit, farmingExperience};
    } catch (error) {
      throw new InternalServerError(
        `Failed to get user demographics: ${error}`,
      );
    }
  }

  // async getKccAndAgriAppStats(source = 'vicharanashala', session?: ClientSession, userType = 'all'): Promise<KccAndAgriAppStats> {
  //   try {
  //     await this.init(source);
  //     const userDocFilter = this.buildUserDocFilter(userType);

  //     const [kccRaw, agriRaw] = await Promise.all([
  //       // KCC awareness split
  //     this.users.aggregate<{ _id: boolean; count: number }>(
  //         [
  //           { $match: { 'farmerProfile.awarenessOfKCC': { $exists: true, $ne: null }, ...userDocFilter } },
  //           { $group: { _id: '$farmerProfile.awarenessOfKCC', count: { $sum: 1 } } },
  //         ],
  //         { session },
  //       ).toArray(),

  //       // Agri apps usage split
  //       this.users.aggregate<{ _id: boolean; count: number }>(
  //         [
  //           { $match: { 'farmerProfile.usesAgriApps': { $exists: true, $ne: null }, ...userDocFilter } },
  //           { $group: { _id: '$farmerProfile.usesAgriApps', count: { $sum: 1 } } },
  //         ],
  //         { session },
  //       ).toArray(),
  //     ]);
  //     console.log('Raw KCC awareness data:', kccRaw);
  //     console.log('Raw agri app usage data:', agriRaw);

  //     const toPct = (count: number, total: number) =>
  //       total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

  //     const kccTotal = kccRaw.reduce((s, r) => s + r.count, 0);
  //     const kccAwareness: DemographicEntry[] = kccRaw
  //       .sort((_, b) => (b._id ? 1 : -1))
  //       .map(r => ({
  //         label: r._id ? 'Aware' : 'Not Aware',
  //         count: r.count,
  //         pct: toPct(r.count, kccTotal),
  //       }));

  //     const agriTotal = agriRaw.reduce((s, r) => s + r.count, 0);
  //     const agriAppUsage: DemographicEntry[] = agriRaw
  //       .sort((_, b) => (b._id ? 1 : -1))
  //       .map(r => ({
  //         label: r._id ? 'Uses Apps' : 'Does Not Use',
  //         count: r.count,
  //         pct: toPct(r.count, agriTotal),
  //       }));

  //     return { kccAwareness, agriAppUsage };
  //   } catch (error) {
  //     throw new InternalServerError(`Failed to get KCC and agri app stats: ${error}`);
  //   }
  // }

  async getKccAndAgriAppStats(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
  ): Promise<KccAndAgriAppStats> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);

      const [kccRaw, agriRaw] = await Promise.all([
        // KCC awareness split
        this.users
          .aggregate<{_id: boolean; count: number}>(
            [
              {
                $match: {
                  farmerProfile: {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [
                      {$eq: ['$farmerProfile.awarenessOfKCC', true]},
                      true,
                      false,
                    ],
                  },
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Agri apps usage split
        this.users
          .aggregate<{_id: boolean; count: number}>(
            [
              {
                $match: {
                  farmerProfile: {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [
                      {$eq: ['$farmerProfile.usesAgriApps', true]},
                      true,
                      false,
                    ],
                  },
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const kccTotal = kccRaw.reduce((s, r) => s + r.count, 0);

      const kccAwareness: DemographicEntry[] = kccRaw
        .sort((a, b) => Number(b._id) - Number(a._id))
        .map(r => ({
          label: r._id ? 'Aware' : 'Not Aware',
          count: r.count,
          pct: toPct(r.count, kccTotal),
        }));

      const agriTotal = agriRaw.reduce((s, r) => s + r.count, 0);

      const agriAppUsage: DemographicEntry[] = agriRaw
        .sort((a, b) => Number(b._id) - Number(a._id))
        .map(r => ({
          label: r._id ? 'Uses Apps' : 'Does Not Use',
          count: r.count,
          pct: toPct(r.count, agriTotal),
        }));

      return {kccAwareness, agriAppUsage};
    } catch (error) {
      throw new InternalServerError(
        `Failed to get KCC and agri app stats: ${error}`,
      );
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
                isDeleted: {$ne: true},
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
      throw new InternalServerError(
        `Failed to generate chatbot Excel report: ${error}`,
      );
    }
  }

  async getIdsCreated(startDate: Date, endDate: Date, session?: ClientSession) {
    try {
      await this.init();
      const result = await this.users
        .aggregate([
          {
            $match: {
              createdAt: {$gte: startDate, $lte: endDate},
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {format: '%Y-%m-%d', date: '$createdAt'},
              },
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get IDs created: ${error}`);
    }
  }

  async getInstalls(startDate: Date, endDate: Date, session?: ClientSession) {
    try {
      await this.init();
      const result = await this.users
        .aggregate([
          {
            $match: {
              farmerProfile: {$exists: true, $ne: null},
              updatedAt: {$gte: startDate, $lte: endDate},
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {format: '%Y-%m-%d', date: '$updatedAt'},
              },
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get installs: ${error}`);
    }
  }

  async getActiveUsers(
    startDate: Date,
    endDate: Date,
    session?: ClientSession,
  ) {
    try {
      await this.init();
      const result = await this.messagesCollection
        .aggregate([
          {
            $match: {
              createdAt: {$gte: startDate, $lte: endDate},
              isDeleted: {$ne: true},
            },
          },
          {
            $group: {
              _id: {
                date: {$dateToString: {format: '%Y-%m-%d', date: '$createdAt'}},
                user: '$user',
              },
            },
          },
          {
            $group: {
              _id: '$_id.date',
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get active users: ${error}`);
    }
  }

  //get platform installs
  async getPlatformInstalls(
    source: 'vicharanashala',
    session?: ClientSession,
  ): Promise<PlatformInstallEntry[]> {
    try {
      await this.init(source);
      const result = await this.users
        .aggregate<PlatformInstallEntry>([
          {
            $match: {
              'farmerProfile.platform': {$exists: true, $ne: null},
            },
          },
          {
            $group: {
              _id: '$farmerProfile.platform',
              count: {$sum: 1},
            },
          },
          {
            $project: {
              _id: 0,
              platform: '$_id',
              count: 1,
            },
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get platform installs: ${error}`,
      );
    }
  }

  async getDuplicateQuestions(
    source = 'annam',
    session?: ClientSession,
  ): Promise<DuplicateQuestionEntry[]> {
    try {
      // init(source) sets this.messagesCollection and this.users to the selected DB
      await this.initReviewSystem();
      await this.init(source);

      // 1. Fetch duplicate questions from the main review DB
      const dupeQuestions = await this.QuestionCollection.find(
        {similarityScore: {$exists: true}},
        {session},
      )
        .project<{
          _id: any;
          question: string;
          referenceQuestion?: string;
          originalQuestion?: string;
          similarityScore: number;
          messageId?: string;
          createdAt: Date;
        }>({
          question: 1,
          referenceQuestion: 1,
          originalQuestion: 1,
          similarityScore: 1,
          messageId: 1,
          createdAt: 1,
        })
        .sort({createdAt: -1})
        .toArray();

      if (dupeQuestions.length === 0) return [];

      // 2. Only process questions that have messageId stored
      const messageIds = dupeQuestions
        .map(q => q.messageId)
        .filter(Boolean) as string[];
      if (messageIds.length === 0) return [];

      // 3. Look up messages in annam analytics DB.
      // Questions whose messageId has no matching document are excluded entirely.
      const messages = await this.messagesCollection
        .find({messageId: {$in: messageIds}, isDeleted: {$ne: true}})
        .project<{messageId: string; user: string}>({messageId: 1, user: 1})
        .toArray();

      const messageToUser = new Map<string, string>(
        messages
          .filter(m => m.messageId && m.user)
          .map(m => [m.messageId, m.user]),
      );

      // 4. Look up users from annam analytics DB
      const userIds = [...new Set(messages.map(m => m.user).filter(Boolean))];
      const users =
        userIds.length > 0
          ? await this.users
              .find({
                _id: {
                  $in: userIds
                    .map(id => {
                      try {
                        return new ObjectId(id);
                      } catch {
                        return null;
                      }
                    })
                    .filter(Boolean),
                },
              })
              .project<{
                _id: any;
                name?: string;
                email?: string;
                farmerProfile?: {
                  farmerName?: string;
                  villageName?: string;
                  blockName?: string;
                  district?: string;
                  state?: string;
                };
              }>({
                name: 1,
                email: 1,
                'farmerProfile.farmerName': 1,
                'farmerProfile.villageName': 1,
                'farmerProfile.blockName': 1,
                'farmerProfile.district': 1,
                'farmerProfile.state': 1,
              })
              .toArray()
          : [];

      const userMap = new Map(users.map(u => [u._id.toString(), u]));

      // 5. Build results — skip any question whose messageId has no matching message
      const results: DuplicateQuestionEntry[] = [];
      for (const q of dupeQuestions) {
        if (!q.messageId) continue;
        const userId = messageToUser.get(q.messageId);
        if (!userId) continue;
        const user = userMap.get(userId);
        results.push({
          questionId: q._id.toString(),
          question: q.question,
          referenceQuestion: q.referenceQuestion || q.originalQuestion || '',
          similarityScore: Number(q.similarityScore) || 0,
          createdAt: q.createdAt,
          farmerName: user?.farmerProfile?.farmerName || user?.name || '—',
          email: user?.email || '—',
          village: user?.farmerProfile?.villageName || '—',
          block: user?.farmerProfile?.blockName || '—',
          district: user?.farmerProfile?.district || '—',
          state: user?.farmerProfile?.state || '—',
        });
      }
      return results;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get duplicate questions: ${error}`,
      );
    }
  }

  async getDomainSpikes(days = 60, session?: ClientSession) {
    try {
      await this.initReviewSystem();

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const domainMatch = {
        createdAt: {$gte: since},
        'details.domain': {$exists: true, $nin: [null, '']},
      };

      const locationPush = {
        $push: {
          $cond: [
            {
              $and: [
                {$ne: ['$details.district', null]},
                {$ne: ['$details.state', null]},
                {$ne: ['$details.district', '']},
                {$ne: ['$details.state', '']},
              ],
            },
            {$concat: ['$details.district', ', ', '$details.state']},
            '$$REMOVE',
          ],
        },
      };

      const groupStage = {
        $group: {
          _id: {
            domain: '$details.domain',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: '+05:30',
              },
            },
          },
          count: {$sum: 1},
          locations: locationPush,
        },
      };

      const pipeline: any[] = [
        {$match: domainMatch},
        groupStage,
        {
          $unionWith: {
            coll: 'duplicate_questions',
            pipeline: [{$match: domainMatch}, groupStage],
          },
        },
        {
          $group: {
            _id: '$_id',
            count: {$sum: '$count'},
            locations: {$push: '$locations'},
          },
        },
        {$sort: {'_id.domain': 1, '_id.date': 1}},
      ];

      const raw = await this.QuestionCollection.aggregate(pipeline, {
        session,
        allowDiskUse: true,
      }).toArray();

      // Group by domain, compute average baseline, detect spikes
      const byDomain = new Map<
        string,
        Array<{date: string; count: number; locations: string[][]}>
      >();
      for (const row of raw) {
        const domain = row._id.domain as string;
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain)!.push({
          date: row._id.date,
          count: row.count,
          locations: row.locations,
        });
      }

      const SPIKE_THRESHOLD = 1.5; // 50% above average = spike
      const MIN_BASELINE = 3;
      const spikes: any[] = [];

      for (const [domain, entries] of byDomain) {
        if (entries.length < 3) continue;

        const totalCount = entries.reduce((s, e) => s + e.count, 0);
        const avgBaseline = totalCount / entries.length;
        if (avgBaseline < MIN_BASELINE) continue;

        for (const entry of entries) {
          if (entry.count >= avgBaseline * SPIKE_THRESHOLD) {
            const allLocs = entry.locations.flat();
            const locFreq = new Map<string, number>();
            for (const loc of allLocs) {
              if (loc) locFreq.set(loc, (locFreq.get(loc) ?? 0) + 1);
            }
            const topLoc = [...locFreq.entries()].sort(
              (a, b) => b[1] - a[1],
            )[0]?.[0];

            spikes.push({
              domain,
              date: entry.date,
              count: entry.count,
              baseline: Math.round(avgBaseline),
              spikePct: Math.round(
                ((entry.count - avgBaseline) / avgBaseline) * 100,
              ),
              location: topLoc ?? undefined,
            });
          }
        }
      }

      spikes.sort((a, b) => b.spikePct - a.spikePct);
      return spikes.slice(0, 50);
    } catch (error) {
      throw new InternalServerError(`Failed to get domain spikes: ${error}`);
    }
  }

  async getDailyQuestionTrends(
    days = 30,
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<
    Array<{day: string; uniqueCount: number; duplicateCount: number}>
  > {
    try {
      await this.initReviewSystem();

      const matchQuery: any = {
        source: 'AJRASAKHA',
      };

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      const userTypeLookupStages =
        this.buildQuestionUserTypeLookupStages(userType);

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },
          ...userTypeLookupStages,
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
                isDuplicate: {
                  $cond: [
                    {$eq: ['$status', 'duplicate']},
                    'duplicate',
                    'unique',
                  ],
                },
              },
              count: {$sum: 1},
            },
          },
          {
            $group: {
              _id: '$_id.day',
              uniqueCount: {
                $sum: {
                  $cond: [{$eq: ['$_id.isDuplicate', 'unique']}, '$count', 0],
                },
              },
              duplicateCount: {
                $sum: {
                  $cond: [
                    {$eq: ['$_id.isDuplicate', 'duplicate']},
                    '$count',
                    0,
                  ],
                },
              },
            },
          },
          {$sort: {_id: 1}},
        ],
        {session},
      ).toArray();

      return result.map(r => ({
        day: r._id,
        uniqueCount: r.uniqueCount,
        duplicateCount: r.duplicateCount,
      }));
    } catch (error) {
      throw new InternalServerError(
        `Failed to get daily question trends: ${error}`,
      );
    }
  }

  async getTopFaqs(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{question: string; count: number}>> {
    try {
      await this.init(source);
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const queryMatch: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
        text: {$exists: true, $ne: null, $nin: ['', ' ']},
      };

      if (startTime || endTime) {
        queryMatch.createdAt = {};
        if (startTime) {
          queryMatch.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          queryMatch.createdAt.$lte = new Date(endTime);
        }
      }

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: queryMatch,
            },
            ...userTypeLookupStages,
            {
              $group: {
                _id: {$trim: {input: '$text'}},
                count: {$sum: 1},
              },
            },
            {$sort: {count: -1}},
            {$limit: 10},
          ],
          {session},
        )
        .toArray();

      return result.map(r => ({
        question: r._id,
        count: r.count,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to get top FAQs: ${error}`);
    }
  }

  async getTopQuestionsFromCollection(
    source = 'vicharanashala',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{question: string; count: number}>> {
    try {
      await this.initReviewSystem();

      const matchQuery: any = {
        source: 'AJRASAKHA',
      };

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      const userTypeLookupStages =
        this.buildQuestionUserTypeLookupStages(userType);

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },
          ...userTypeLookupStages,
          {
            $project: {
              resolvedId: {$ifNull: ['$referenceQuestionId', '$_id']},
              question: 1,
            },
          },
          {
            $group: {
              _id: '$resolvedId',
              count: {$sum: 1},
              firstQuestion: {$first: '$question'},
            },
          },
          {
            $lookup: {
              from: 'questions',
              localField: '_id',
              foreignField: '_id',
              as: 'originalDoc',
            },
          },
          {
            $project: {
              question: {
                $ifNull: [
                  {$arrayElemAt: ['$originalDoc.question', 0]},
                  '$firstQuestion',
                ],
              },
              count: 1,
            },
          },
          {
            $match: {
              question: {$exists: true, $ne: null, $nin: ['', ' ']},
            },
          },
          {$sort: {count: -1}},
          {$limit: 10},
        ],
        {session},
      ).toArray();

      return result.map(r => ({
        question: r.question,
        count: r.count,
      }));
    } catch (error) {
      throw new InternalServerError(
        `Failed to get top questions from collection: ${error}`,
      );
    }
  }

  async deleteUser(userId: string, source: string): Promise<boolean> {
    try {
      await this.init(source);
      await this.messagesCollection.updateMany(
        {user: userId},
        {$set: {isDeleted: true}},
      );
      const result = await this.users.deleteOne({_id: new ObjectId(userId)});
      return result.deletedCount === 1;
    } catch (error) {
      throw new InternalServerError(`Failed to delete user: ${error}`);
    }
  }

  async updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
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
        platform?: string;
      };
    },
  ): Promise<boolean> {
    try {
      await this.init(source);

      const setPayload: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (typeof data?.name === 'string') {
        const trimmedName = data.name.trim();
        if (trimmedName) {
          setPayload.name = trimmedName;
        }
      }

      const profile = data?.farmerProfile;
      if (profile && typeof profile === 'object') {
        const editableFarmerFields = [
          'farmerName',
          'age',
          'gender',
          'villageName',
          'blockName',
          'district',
          'state',
          'phoneNo',
          'languagePreference',
          'yearsOfExperience',
          'cropsCultivated',
          'primaryCrop',
          'secondaryCrop',
          'awarenessOfKCC',
          'usesAgriApps',
          'highestEducatedPerson',
          'numberOfSmartphones',
          'platform',
        ] as const;

        for (const field of editableFarmerFields) {
          if (Object.prototype.hasOwnProperty.call(profile, field)) {
            const value = (profile as any)[field];
            if (value !== undefined) {
              setPayload[`farmerProfile.${field}`] = value;
            }
          }
        }
      }

      const result = await this.users.updateOne(
        {_id: new ObjectId(userId)},
        {$set: setPayload},
      );

      return result.matchedCount > 0;
    } catch (error) {
      throw new InternalServerError(`Failed to update user: ${error}`);
    }
  }

  async getDailyActiveUsersTrend(
    startDate: Date,
    endDate: Date,
    source: string,
    userType: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(userType);

      /**
       * Last 365 days
       */
      // const endDate = new Date();
      // const startDate = new Date();
      // startDate.setDate(startDate.getDate() - 365);

      const matchStage: any = {
        lastActiveAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      /**
       * External Users
       */
      if (source === 'external') {
        matchStage.email = {
          $regex: '^rup',
          $options: 'i',
        };
      }

      /**
       * Internal Users
       */
      if (source === 'internal') {
        matchStage.email = {
          $not: {
            $regex: '^rup',
            $options: 'i',
          },
        };
      }

      /**
       * DAU Trend
       */
      const result = await this.users
        .aggregate(
          [
            {
              $match: matchStage,
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$lastActiveAt',
                  },
                },
                dau: {
                  $sum: 1,
                },
              },
            },
            {
              $sort: {
                _id: 1,
              },
            },
          ],
          {
            session,
          },
        )
        .toArray();

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get daily active users trend: ${error}`,
      );
    }
  }

  async getWeeklyActiveUsersTrend(
    startDate: Date,
    endDate: Date,
    source: string,
    userType: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(userType);

      /**
       * Last 12 weeks
       */
      // const endDate = new Date();
      // const startDate = new Date();

      // const DAYS_IN_WEEK = 7;
      // const TOTAL_WEEKS = 52;

      // startDate.setDate(
      //   startDate.getDate() - (DAYS_IN_WEEK * TOTAL_WEEKS),
      // );

      const matchStage: any = {
        lastActiveAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      /**
       * External Users
       */
      if (source === 'external') {
        matchStage.email = {
          $regex: '^rup',
          $options: 'i',
        };
      }

      /**
       * Internal Users
       */
      if (source === 'internal') {
        matchStage.email = {
          $not: {
            $regex: '^rup',
            $options: 'i',
          },
        };
      }

      /**
       * WAU Trend
       */
      const result = await this.users
        .aggregate(
          [
            {
              $match: matchStage,
            },
            {
              $group: {
                _id: {
                  year: {
                    $isoWeekYear: '$lastActiveAt',
                  },

                  week: {
                    $isoWeek: '$lastActiveAt',
                  },
                },

                wau: {
                  $sum: 1,
                },
              },
            },
            {
              $sort: {
                '_id.year': 1,
                '_id.week': 1,
              },
            },
            {
              $project: {
                _id: {
                  $concat: [
                    {
                      $toString: '$_id.year',
                    },
                    '-W',
                    {
                      $cond: [
                        {
                          $lt: ['$_id.week', 10],
                        },
                        {
                          $concat: [
                            '0',
                            {
                              $toString: '$_id.week',
                            },
                          ],
                        },
                        {
                          $toString: '$_id.week',
                        },
                      ],
                    },
                  ],
                },

                wau: 1,
              },
            },
          ],
          {
            session,
          },
        )
        .toArray();

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly active users trend: ${error}`,
      );
    }
  }

  async getMonthlyActiveUsersTrend(
    startDate: Date,
    endDate: Date,
    source: string,
    userType: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(userType);

      /**
       * Last 12 months
       */
      // const endDate = new Date();
      // const startDate = new Date();
      // startDate.setMonth(startDate.getMonth() - 12);

      const matchStage: any = {
        lastActiveAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      /**
       * External Users
       */
      if (source === 'external') {
        matchStage.email = {
          $regex: '^rup',
          $options: 'i',
        };
      }

      /**
       * Internal Users
       */
      if (source === 'internal') {
        matchStage.email = {
          $not: {
            $regex: '^rup',
            $options: 'i',
          },
        };
      }
      /**
       * MAU Trend
       */
      const result = await this.users
        .aggregate(
          [
            {
              $match: matchStage,
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$lastActiveAt',
                  },
                },
                mau: {
                  $sum: 1,
                },
              },
            },
            {
              $sort: {
                _id: 1,
              },
            },
          ],
          {
            session,
          },
        )
        .toArray();

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly active users trend: ${error}`,
      );
    }
  }

  async getRetentionMetrics(session?: ClientSession) {
    try {
      await this.init();

      /**
       * Last 3 months cohorts
       */
      const endDate = new Date();
      const startDate = new Date();

      startDate.setMonth(startDate.getMonth() - 3);

      const result = await this.users
        .aggregate(
          [
            /**
             * Users created in last 1 year
             */
            {
              $match: {
                createdAt: {
                  $gte: startDate,
                  $lte: endDate,
                },
              },
            },

            /**
             * Cohort projection
             */
            {
              $project: {
                userId: '$_id',
                signupDate: '$createdAt',
                cohortDate: {
                  $dateToString: {
                    // format: "%Y-%m-%d",
                    format: '%Y-W%V',
                    date: '$createdAt',
                  },
                },
              },
            },

            /**
             * Lookup user activities/messages
             */
            {
              $lookup: {
                from: 'messages',
                let: {
                  userId: '$userId',
                  signupDate: '$signupDate',
                },
                pipeline: [
                  /**
                   * Match user messages
                   */
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          '$user',
                          {
                            $toString: '$$userId',
                          },
                        ],
                      },
                    },
                  },

                  /**
                   * Calculate days after signup
                   */
                  {
                    $project: {
                      createdAt: 1,

                      daysAfterSignup: {
                        $dateDiff: {
                          startDate: {
                            $dateTrunc: {
                              date: '$$signupDate',
                              unit: 'day',
                            },
                          },

                          endDate: {
                            $dateTrunc: {
                              date: '$createdAt',
                              unit: 'day',
                            },
                          },

                          unit: 'day',
                        },
                      },
                    },
                  },

                  /**
                   * Ignore signup-day activity
                   */
                  {
                    $match: {
                      daysAfterSignup: {
                        $gt: 0,
                      },
                    },
                  },
                ],

                as: 'activities',
              },
            },

            /**
             * Retention flags
             */
            {
              $project: {
                cohortDate: 1,

                retainedD1: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',

                          as: 'activity',

                          cond: {
                            $eq: ['$$activity.daysAfterSignup', 1],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },

                retainedD7: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',

                          as: 'activity',

                          cond: {
                            $eq: ['$$activity.daysAfterSignup', 7],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },

                retainedD30: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',

                          as: 'activity',

                          cond: {
                            $eq: ['$$activity.daysAfterSignup', 30],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
              },
            },

            /**
             * Group by cohort date
             */
            {
              $group: {
                _id: '$cohortDate',

                totalUsers: {
                  $sum: 1,
                },

                d1Users: {
                  $sum: {
                    $cond: ['$retainedD1', 1, 0],
                  },
                },

                d7Users: {
                  $sum: {
                    $cond: ['$retainedD7', 1, 0],
                  },
                },

                d30Users: {
                  $sum: {
                    $cond: ['$retainedD30', 1, 0],
                  },
                },
              },
            },

            /**
             * Retention percentages
             */
            {
              $project: {
                _id: 0,

                cohortDate: '$_id',

                totalUsers: 1,

                d1Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d1Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },

                d7Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d7Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },

                d30Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d30Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },
              },
            },

            /**
             * Sort chronologically
             */
            {
              $sort: {
                cohortDate: 1,
              },
            },
          ],
          {
            session,
          },
        )
        .toArray();

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get retention metrics: ${error}`,
      );
    }
  }
}

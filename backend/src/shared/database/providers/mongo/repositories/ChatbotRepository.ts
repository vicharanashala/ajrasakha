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
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {MongoDatabase} from '../MongoDatabase.js';

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

  async getKpiSummary(source = 'vicharanashala', session?: ClientSession): Promise<KpiSummary> {
    try {
      await this.init(source);

      // Use MongoDB $dateToString with IST timezone (+05:30) to correctly bucket months
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      const [totalUsers, monthlyActivity, sessionStats, todayQueryCount] =
        await Promise.all([
          this.users.countDocuments({}, {session}),

          // Group users by month in IST timezone using updatedAt
          this.users
            .aggregate(
              [
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

          // ── CHANGED: Avg session duration (v2 — inactivity-gap approach) ────────
          // ORIGINAL LOGIC (v0 — unreliable, conversations.updatedAt is a metadata
          // timestamp touched by system events, not real user activity):
          //
          //   this.conversations.aggregate([
          //     { $project: { durationMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
          //     { $group: { _id: null, avg: { $avg: '$durationMs' } } },
          //   ], { session }).toArray()
          //
          // INTERMEDIATE ATTEMPT (v1 — also wrong: max - min of messages still
          // counts idle time, e.g. user asks at 9 AM, comes back 5 hrs later in
          // the same conversation → reported as a 5-hour session):
          //
          //   this.messagesCollection.aggregate([
          //     { $group: { _id: '$conversationId', firstMsg: { $min: '$createdAt' },
          //                 lastMsg: { $max: '$createdAt' }, msgCount: { $sum: 1 } } },
          //     { $match: { msgCount: { $gt: 1 } } },
          //     { $addFields: { durationMs: { $max: [0, { $subtract: ['$lastMsg', '$firstMsg'] }] } } },
          //     { $group: { _id: null, avg: { $avg: '$durationMs' } } },
          //   ], { session }).toArray()
          //
          // CURRENT LOGIC (v2 — inactivity-gap detection, requires MongoDB 5.0+):
          // Sort messages per conversation by time, compute the gap between each
          // consecutive pair. If gap > 30 min (INACTIVITY_THRESHOLD_MS) the user
          // was away — skip that gap. Sum only the "active" gaps per conversation,
          // then average across all conversations. This gives true engagement time.
          this.messagesCollection
            .aggregate(
              [
                // Step 1: sort messages within each conversation by time
                // ($setWindowFields requires a sort; we also need $sort before it
                //  so that $shift looks at the chronologically previous message)
                {$sort: {conversationId: 1, createdAt: 1}},
                // Step 2: for each message, pull in the previous message's createdAt
                // within the same conversation (lag by 1 position)
                {
                  $setWindowFields: {
                    partitionBy: '$conversationId',
                    sortBy: {createdAt: 1},
                    output: {
                      prevCreatedAt: {
                        $shift: {output: '$createdAt', by: -1},
                      },
                    },
                  },
                },
                // Step 3: compute the gap from the previous message.
                // First message in each conversation has no prev → gap = 0.
                // INACTIVITY_THRESHOLD_MS = 30 minutes = 1,800,000 ms
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
                // Step 4: only keep gaps within the inactivity threshold.
                // Gaps > 30 min mean the user walked away — don't count them.
                {
                  $addFields: {
                    activeGapMs: {
                      $cond: [
                        {$lte: ['$gapMs', 1800000]},
                        '$gapMs',
                        0,
                      ],
                    },
                  },
                },
                // Step 5: sum active gaps per conversation + count messages
                {
                  $group: {
                    _id: '$conversationId',
                    activeSessionMs: {$sum: '$activeGapMs'},
                    msgCount: {$sum: 1},
                  },
                },
                // Step 6: skip single-message conversations (no gaps at all)
                {$match: {msgCount: {$gt: 1}}},
                // Step 7: average real session time across all conversations
                {$group: {_id: null, avg: {$avg: '$activeSessionMs'}}},
              ],
              {session},
            )
            .toArray(),
          // ── END CHANGED ───────────────────────────────────────────────────────

          // Today's query count from messages
          this.getTodayQueryCount(source, session),
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

  async getDailyActiveUsers(days = 13, source = 'vicharanashala', session?: ClientSession): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      // Count distinct users who sent messages per month (true monthly active users)
      const since = new Date();
      since.setMonth(since.getMonth() - days); // `days` param used as number of months to look back
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const result = await this.messagesCollection
        .aggregate(
          [
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

  async getWeeklyAvgSessionDuration(weeks = 52, source = 'vicharanashala', session?: ClientSession): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      // ── CHANGED: Weekly avg session duration (v2 — inactivity-gap approach) ──
      // ORIGINAL LOGIC (v0 — used conversations.updatedAt - createdAt, skewed
      // by system-level metadata updates):
      //
      //   const result = await this.conversations.aggregate([
      //     { $match: { createdAt: { $gte: since } } },
      //     { $addFields: { durationMs: { $max: [0, { $subtract: ['$updatedAt', '$createdAt'] }] } } },
      //     { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } }, avgDurationMs: { $avg: '$durationMs' } } },
      //     { $project: { week: '$_id', avgSessionDurationMin: { $round: [{ $divide: ['$avgDurationMs', 60000] }, 1] }, _id: 0 } },
      //     { $sort: { week: 1 } },
      //   ], { session }).toArray();
      //
      // INTERMEDIATE ATTEMPT (v1 — max - min of messages per conversation,
      // still wrong because idle time within a conversation inflates duration):
      //
      //   messages → group by conversationId → max(createdAt) - min(createdAt) → avg per week
      //
      // CURRENT LOGIC (v2 — inactivity-gap detection, requires MongoDB 5.0+):
      // Same gap-detection logic as getKpiSummary, but after computing each
      // conversation's real active duration we bucket it into its ISO week
      // (based on the first message of that conversation) and average per week.
      const result = await this.messagesCollection
        .aggregate(
          [
            // Only look at messages within the requested window
            {$match: {createdAt: {$gte: since}}},
            // Step 1: sort messages within each conversation by time
            {$sort: {conversationId: 1, createdAt: 1}},
            // Step 2: pull in the previous message's createdAt (lag) per conversation
            {
              $setWindowFields: {
                partitionBy: '$conversationId',
                sortBy: {createdAt: 1},
                output: {
                  prevCreatedAt: {
                    $shift: {output: '$createdAt', by: -1},
                  },
                  // also carry forward the first message time for week bucketing
                  firstMsgInConv: {
                    $first: '$createdAt',
                    window: {documents: ['unbounded', 'current']},
                  },
                },
              },
            },
            // Step 3: compute gap; cap at 0 for the first message (no prev)
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
            // Step 4: discard gaps > 30 min (user was idle/away)
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },
            // Step 5: sum active gaps per conversation; keep firstMsgInConv for week
            {
              $group: {
                _id: '$conversationId',
                activeSessionMs: {$sum: '$activeGapMs'},
                firstMsg: {$min: '$firstMsgInConv'},
                msgCount: {$sum: 1},
              },
            },
            // Step 6: skip single-message conversations
            {$match: {msgCount: {$gt: 1}}},
            // Step 7: assign each conversation to its ISO week (IST timezone)
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
            // Step 8: average real session time per week
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
      // ── END CHANGED ───────────────────────────────────────────────────────────

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly avg session duration: ${error}`,
      );
    }
  }

  async getDailyQueryCounts(days = 30, source = 'vicharanashala', session?: ClientSession): Promise<DailyQueryCountEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}, isCreatedByUser: true}},
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

  async getDailyUserTrend(days = 30, source = 'vicharanashala', session?: ClientSession): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const result = await this.messagesCollection
        .aggregate(
          [
            // Filter to last N days, user-sent messages only
            {$match: {createdAt: {$gte: since}, isCreatedByUser: true}},
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

  async getWeeklyQueryCounts(source = 'vicharanashala', session?: ClientSession): Promise<WeeklyQueryCountEntry[]> {
    try {
      await this.init(source);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isCreatedByUser: true}},
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

  async getTodayQueryCount(source = 'vicharanashala', session?: ClientSession): Promise<number> {
    try {
      await this.init(source);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return this.messagesCollection.countDocuments(
        {createdAt: {$gte: today}, isCreatedByUser: true},
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
              'upload_question_to_reviewer_system_mcp_pop',
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
              'upload_question_to_reviewer_system_mcp_pop',
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
    session?: ClientSession,
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

      // Get users — optionally filtered by search
      const userFilter: Record<string, any> = {};
      if (search && search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        userFilter.$or = [
          { name: regex },
          { username: regex },
          { email: regex },
        ];
      }

      const allUsers = await this.users.find(userFilter, { session }).toArray();

      // Merge
      const merged: UserDetailEntry[] = allUsers.map((u) => ({
        userId: String(u._id),
        name: u.name || u.username || 'Unknown',
        email: u.email || '',
        totalQuestions: countMap.get(String(u._id)) ?? 0,
      }));

      // Sort by totalQuestions desc
      merged.sort((a, b) => b.totalQuestions - a.totalQuestions);

      // Compute summary stats over the full filtered set
      const totalUsers = merged.length;
      const activeUsers = merged.filter((u) => u.totalQuestions > 0).length;
      const totalQuestions = merged.reduce((sum, u) => sum + u.totalQuestions, 0);
      const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

      // Paginate
      const startIdx = (page - 1) * limit;
      const users = merged.slice(startIdx, startIdx + limit);

      return {
        users,
        totalUsers,
        totalPages,
        activeUsers,
        totalQuestions,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user details: ${error}`);
    }
  }
}

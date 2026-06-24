import { inject, injectable } from 'inversify';
import { Collection, ClientSession, ObjectId } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  ICallDetailsRepository,
  CallDetails,
  QAPairs,
  AgentAnalytics,
} from '#root/shared/database/interfaces/ICallDetailsRepository.js';

@injectable()
export class CallDetailsRepository implements ICallDetailsRepository {
  private callDetailsCollection!: Collection<CallDetails>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.callDetailsCollection = await this.db.getCollection<CallDetails>(
      'call_details',
    );
  }

  async create(
    details: CallDetails,
    session?: ClientSession,
  ): Promise<string> {
    try {
      await this.init();
      const now = new Date();
      const doc = {
        ...details,
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.callDetailsCollection.insertOne(doc, { session });
      return result.insertedId.toString();
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.create: Error creating call details record:`, error.stack || error);
      throw new InternalServerError(`Failed to create call details: ${error}`);
    }
  }

  async getByCallUuid(
    callUuid: string,
    session?: ClientSession,
  ): Promise<CallDetails | null> {
    try {
      await this.init();
      const result = await this.callDetailsCollection.findOne(
        { callUuid },
        { session },
      );
      return result;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getByCallUuid: Error querying callUuid ${callUuid}:`, error.stack || error);
      throw new InternalServerError(
        `Failed to find call details by UUID: ${error}`,
      );
    }
  }

  async getAll(session?: ClientSession): Promise<CallDetails[]> {
    try {
      await this.init();
      const result = await this.callDetailsCollection
        .find({}, { session })
        .sort({ createdAt: -1 })
        .toArray();
      return result;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getAll: Error retrieving all records:`, error.stack || error);
      throw new InternalServerError(`Failed to get all call details: ${error}`);
    }
  }

  async updateQA_Pairs(callUuid: string, qaPairs: QAPairs, session?: ClientSession): Promise<void> {
    try {
      await this.init();
      // console.log(`[CallDetailsRepository] updateQA_Pairs - Updating document for callUuid: ${callUuid}`);
      // console.log(`[CallDetailsRepository] updateQA_Pairs - Data to store:`, JSON.stringify(qaPairs, null, 2));

      const result = await this.callDetailsCollection.updateOne(
        { callUuid },
        {
          $set: {
            QA_pairs: qaPairs,
            updatedAt: new Date()
          }
        },
        { session }
      );

      // console.log(`[CallDetailsRepository] updateQA_Pairs - Update result:`, {
      //   matchedCount: result.matchedCount,
      //   modifiedCount: result.modifiedCount,
      //   acknowledged: result.acknowledged
      // });

      if (result.matchedCount === 0) {
        console.warn(`[CallDetailsRepository] updateQA_Pairs - No document found with callUuid: ${callUuid}`);
      }
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.updateQA_Pairs: Error updating Q/A pairs for callUuid ${callUuid}:`, error.stack || error);
      throw new InternalServerError(`Failed to update Q/A pairs: ${error}`);
    }
  }

  async getAgentAnalytics(
    agentUserId: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession
  ): Promise<AgentAnalytics> {
    try {
      await this.init();
      
      const agentObjectId = new ObjectId(agentUserId);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      // Build date filter
      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = startDate;
        if (endDate) dateFilter.createdAt.$lte = endDate;
      }

      // Base match filter
      const baseMatch = {
        'agent.userid': agentObjectId,
        ...dateFilter
      };

      // Get total calls and average duration
      const totalCallsResult = await this.callDetailsCollection.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalDuration: { $sum: { $ifNull: ['$duration', 0] } }
          }
        }
      ], { session }).toArray();

      const totalCalls = totalCallsResult[0]?.totalCalls || 0;
      const totalDuration = totalCallsResult[0]?.totalDuration || 0;
      const averageDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

      // Get calls today
      const todayMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: today }
      };
      const callsToday = await this.callDetailsCollection.countDocuments(todayMatch, { session });

      // Get calls this week
      const weekMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: weekAgo }
      };
      const callsThisWeek = await this.callDetailsCollection.countDocuments(weekMatch, { session });

      // Get calls this month
      const monthMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: monthAgo }
      };
      const callsThisMonth = await this.callDetailsCollection.countDocuments(monthMatch, { session });

      // Get domains breakdown
      const domainsResult = await this.callDetailsCollection.aggregate([
        { $match: baseMatch },
        { $unwind: '$QA_pairs' },
        {
          $group: {
            _id: '$QA_pairs.metadata.extracted_domain',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ], { session }).toArray();

      const domains = domainsResult
        .filter(d => d._id && d._id !== '')
        .map(d => ({ domain: d._id, count: d.count }));

      // Get calls by status
      const statusResult = await this.callDetailsCollection.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ], { session }).toArray();

      const callsByStatus = statusResult
        .filter(s => s._id)
        .map(s => ({ status: s._id, count: s.count }));

      // Get daily call trend (last 30 days)
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTrendResult = await this.callDetailsCollection.aggregate([
        {
          $match: {
            'agent.userid': agentObjectId,
            createdAt: { $gte: thirtyDaysAgo, ...dateFilter.createdAt }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ], { session }).toArray();

      const dailyCallTrend = dailyTrendResult.map(d => ({
        date: d._id,
        count: d.count
      }));

      return {
        totalCalls,
        callsToday,
        callsThisWeek,
        callsThisMonth,
        averageDuration,
        domains,
        callsByStatus,
        dailyCallTrend
      };
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getAgentAnalytics: Error getting analytics for agent ${agentUserId}:`, error.stack || error);
      throw new InternalServerError(`Failed to get agent analytics: ${error}`);
    }
  }
}

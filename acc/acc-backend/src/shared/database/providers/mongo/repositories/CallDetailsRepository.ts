import { inject, injectable } from 'inversify';
import { Collection, ClientSession, ObjectId } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  ICallDetailsRepository,
  CallDetails,
  CallQuery,
  AgentAnalytics,
  ACCAnalytics,
} from '#shared/database/interfaces/ICallDetailsRepository.js';

@injectable()
export class CallDetailsRepository implements ICallDetailsRepository {
  private callDetailsCollection!: Collection<CallDetails>;
  private callQueriesCollection!: Collection<CallQuery>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.callDetailsCollection = await this.db.getCollection<CallDetails>(
      'call_details',
    );
    this.callQueriesCollection = await this.db.getCollection<CallQuery>(
      'call_queries',
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
      const result = await this.callDetailsCollection.updateOne(
        { callUuid: details.callUuid },
        { $setOnInsert: doc },
        { upsert: true, session }
      );
      return result.upsertedId ? result.upsertedId.toString() : details.callUuid;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.create: Error creating call details record:`, error.stack || error);
      throw new InternalServerError(`Failed to create call details: ${error}`);
    }
  }

  async getQueriesByCallUuid(callUuid: string, session?: ClientSession): Promise<CallQuery[]> {
    try {
      await this.init();
      return await this.callQueriesCollection
        .find({ callUuid }, { session })
        .sort({ createdAt: 1 })
        .toArray();
    } catch (error: any) {
      console.error(`[CallDetailsRepository] getQueriesByCallUuid error for ${callUuid}:`, error.stack || error);
      return [];
    }
  }

  async getQueriesByIds(
    queryIds?: (string | ObjectId)[],
    fallbackCallUuid?: string,
    session?: ClientSession,
  ): Promise<CallQuery[]> {
    try {
      await this.init();
      const objectIds: ObjectId[] = [];
      const stringIds: string[] = [];

      if (queryIds && Array.isArray(queryIds) && queryIds.length > 0) {
        for (const id of queryIds) {
          if (!id) continue;
          const idStr = typeof id === 'object' && (id as any).toString ? (id as any).toString() : String(id);
          stringIds.push(idStr);
          if (ObjectId.isValid(idStr)) {
            try {
              objectIds.push(new ObjectId(idStr));
            } catch (e) {
              // Ignore parse error
            }
          }
        }
      }

      const matchConditions: any[] = [];
      if (objectIds.length > 0) {
        matchConditions.push({ _id: { $in: objectIds } });
      }
      if (stringIds.length > 0) {
        matchConditions.push({ _id: { $in: stringIds } });
      }
      if (fallbackCallUuid) {
        matchConditions.push({ callUuid: fallbackCallUuid });
      }

      if (matchConditions.length === 0) {
        return [];
      }

      const queries = await this.callQueriesCollection
        .find({ $or: matchConditions }, { session })
        .sort({ createdAt: 1 })
        .toArray();

      // Deduplicate by string ID
      const seen = new Set<string>();
      const uniqueQueries: CallQuery[] = [];
      for (const q of queries) {
        const qId = q._id ? q._id.toString() : `${q.callUuid}-${q.question}`;
        if (!seen.has(qId)) {
          seen.add(qId);
          uniqueQueries.push(q);
        }
      }

      return uniqueQueries;
    } catch (error: any) {
      console.error(
        `[CallDetailsRepository] getQueriesByIds error for fallbackCallUuid ${fallbackCallUuid}:`,
        error.stack || error,
      );
      return [];
    }
  }

  async addQueryToCall(callUuid: string, queryData: Partial<CallQuery>, session?: ClientSession): Promise<string> {
    try {
      await this.init();
      const now = new Date();
      const queryDoc: CallQuery = {
        callUuid,
        metadata: queryData.metadata || {
          extracted_query: '',
          extracted_crop: '',
          extracted_state: '',
          extracted_district: '',
          extracted_block: '',
          extracted_village: '',
          extracted_domain: '',
          extracted_season: '',
        },
        question: queryData.question || '',
        answer: queryData.answer || '',
        agri_specialist: queryData.agri_specialist || 'ACC_AGENT',
        referenceSource: queryData.referenceSource || 'acc_agent_hitl',
        authorName: queryData.authorName || '',
        sourceName: queryData.sourceName || '',
        sourceLink: queryData.sourceLink || '',
        weather: queryData.weather || null,
        createdAt: queryData.createdAt || now,
        updatedAt: now,
      };

      const result = await this.callQueriesCollection.insertOne(queryDoc, { session });
      const queryId = result.insertedId;

      await this.callDetailsCollection.updateOne(
        { callUuid },
        {
          $addToSet: { queryIds: queryId as any },
          $set: { updatedAt: now }
        },
        { session }
      );

      return queryId.toString();
    } catch (error: any) {
      console.error(`[CallDetailsRepository] addQueryToCall error for ${callUuid}:`, error.stack || error);
      throw new InternalServerError(`Failed to add query to call: ${error}`);
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
      if (result) {
        const queries = await this.getQueriesByIds(result.queryIds, callUuid, session);
        result.queries = queries;
      }
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

      const phoneNumbers = [...new Set(result.map(c => c.from).filter(Boolean))];
      const farmersMap = new Map<string, any>();

      if (phoneNumbers.length > 0) {
        try {
          const farmersColl = await this.db.getCollection('Farmers_info');
          const farmerDocs = await farmersColl.find(
            { phoneNo: { $in: phoneNumbers } },
            { session }
          ).toArray();

          for (const doc of farmerDocs) {
            if (doc.phoneNo) farmersMap.set(doc.phoneNo, doc.profile || doc);
          }

          // Fallback to farmer_details collection for missing phones
          const missingPhones = phoneNumbers.filter(p => !farmersMap.has(p));
          if (missingPhones.length > 0) {
            const fallbackColl = await this.db.getCollection('farmer_details');
            const fallbackDocs = await fallbackColl.find(
              { phoneNo: { $in: missingPhones } },
              { session }
            ).toArray();
            for (const doc of fallbackDocs) {
              if (doc.phoneNo && !farmersMap.has(doc.phoneNo)) {
                farmersMap.set(doc.phoneNo, doc.profile || doc);
              }
            }
          }
        } catch (e) {
          console.warn('[CallDetailsRepository] Error populating farmer profiles in call history:', e);
        }
      }

      for (const call of result) {
        call.queries = await this.getQueriesByIds(call.queryIds, call.callUuid, session);
        if (call.from && farmersMap.has(call.from)) {
          (call as any).farmerProfile = farmersMap.get(call.from);
        }
      }
      return result;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getAll: Error retrieving all records:`, error.stack || error);
      throw new InternalServerError(`Failed to get all call details: ${error}`);
    }
  }

  async updateCallDetails(callUuid: string, details: Partial<CallDetails>, session?: ClientSession): Promise<void> {
    try {
      await this.init();
      const updateDoc: any = {
        updatedAt: new Date(),
      };
      if (details.from !== undefined) updateDoc.from = details.from;
      if (details.to !== undefined) updateDoc.to = details.to;
      if (details.duration !== undefined) updateDoc.duration = details.duration;
      if (details.status !== undefined) updateDoc.status = details.status;
      if (details.direction !== undefined) updateDoc.direction = details.direction;
      if (details.caller !== undefined) updateDoc.caller = details.caller;
      if (details.agent !== undefined) {
        if (!details.agent.userid) {
          const existing = await this.callDetailsCollection.findOne(
            { callUuid },
            { projection: { 'agent.userid': 1 }, session }
          );
          if (existing?.agent?.userid) {
            details.agent.userid = existing.agent.userid;
          }
        }
        updateDoc.agent = details.agent;
      }

      if (details.recording !== undefined) updateDoc.recording = details.recording;

      await this.callDetailsCollection.updateOne(
        { callUuid },
        { $set: updateDoc },
        { session }
      );
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.updateCallDetails: Error updating call details record for callUuid ${callUuid}:`, error.stack || error);
      throw new InternalServerError(`Failed to update call details: ${error}`);
    }
  }

  async addRecordingToCall(
    callUuid: string,
    recording: import('#shared/database/interfaces/ICallDetailsRepository.js').CallRecording,
    session?: ClientSession
  ): Promise<void> {
    try {
      await this.init();
      const now = new Date();

      await this.callDetailsCollection.updateOne(
        { callUuid },
        {
          $set: {
            recording: recording,
            updatedAt: now,
          },
          $setOnInsert: {
            callUuid,
            createdAt: now,
            status: 'completed',
            caller: { transcript: '', translation: '', detectedLanguage: 'unknown' },
            agent: { transcript: '', translation: '', detectedLanguage: 'unknown' },
          }
        },
        { upsert: true, session }
      );
    } catch (error: any) {
      console.error(`[CallDetailsRepository] addRecordingToCall error for ${callUuid}:`, error.stack || error);
      throw new InternalServerError(`Failed to add recording to call: ${error}`);
    }
  }

  async findRecordingsForPlivoCleanup(
    olderThanDate: Date,
    session?: ClientSession
  ): Promise<{ callUuid: string; recordingId: string }[]> {
    try {
      await this.init();
      const docs = await this.callDetailsCollection.find(
        {
          'recording.plivoDeleted': false,
          'recording.createdAt': { $lte: olderThanDate }
        },
        { projection: { callUuid: 1, recording: 1 }, session }
      ).toArray();

      const results: { callUuid: string; recordingId: string }[] = [];
      for (const doc of docs) {
        if (doc.recording?.recordingId && !doc.recording.plivoDeleted) {
          results.push({ callUuid: doc.callUuid, recordingId: doc.recording.recordingId });
        }
      }
      return results;
    } catch (error: any) {
      console.error(`[CallDetailsRepository] findRecordingsForPlivoCleanup error:`, error.stack || error);
      return [];
    }
  }

  async markPlivoRecordingDeleted(
    callUuid: string,
    recordingId: string,
    session?: ClientSession
  ): Promise<void> {
    try {
      await this.init();
      await this.callDetailsCollection.updateOne(
        { callUuid },
        {
          $set: {
            'recording.plivoDeleted': true,
            'recording.plivoDeletedAt': new Date(),
            updatedAt: new Date()
          }
        },
        { session }
      );
    } catch (error: any) {
      console.error(`[CallDetailsRepository] markPlivoRecordingDeleted error for ${callUuid} (${recordingId}):`, error.stack || error);
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

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = startDate;
        if (endDate) dateFilter.createdAt.$lte = endDate;
      }

      const baseMatch = {
        'agent.userid': agentObjectId,
        ...dateFilter
      };

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

      const todayMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: today }
      };
      const callsToday = await this.callDetailsCollection.countDocuments(todayMatch, { session });

      const weekMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: weekAgo }
      };
      const callsThisWeek = await this.callDetailsCollection.countDocuments(weekMatch, { session });

      const monthMatch = {
        'agent.userid': agentObjectId,
        createdAt: { $gte: monthAgo }
      };
      const callsThisMonth = await this.callDetailsCollection.countDocuments(monthMatch, { session });

      const agentCallDocs = await this.callDetailsCollection
        .find(baseMatch, { projection: { callUuid: 1 }, session })
        .toArray();
      const agentCallUuids = agentCallDocs.map(c => c.callUuid).filter(Boolean);

      const domainsResult = await this.callQueriesCollection.aggregate([
        { $match: { callUuid: { $in: agentCallUuids }, ...dateFilter } },
        {
          $group: {
            _id: '$metadata.extracted_domain',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ], { session }).toArray();

      const domains = domainsResult
        .filter(d => d._id && d._id !== '')
        .map(d => ({ domain: d._id, count: d.count }));

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

  async getACCAnalytics(
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession
  ): Promise<ACCAnalytics> {
    try {
      await this.init();

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = startDate;
        if (endDate) dateFilter.createdAt.$lte = endDate;
      }

      const baseMatch = dateFilter;

      const totalCalls = await this.callDetailsCollection.countDocuments(baseMatch, { session });

      const todayMatch = { createdAt: { $gte: today }, ...dateFilter.createdAt };
      const callsToday = await this.callDetailsCollection.countDocuments(todayMatch, { session });

      const weekMatch = { createdAt: { $gte: weekAgo }, ...dateFilter.createdAt };
      const callsThisWeek = await this.callDetailsCollection.countDocuments(weekMatch, { session });

      const monthMatch = { createdAt: { $gte: monthAgo }, ...dateFilter.createdAt };
      const callsThisMonth = await this.callDetailsCollection.countDocuments(monthMatch, { session });

      const domainsResult = await this.callQueriesCollection.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$metadata.extracted_domain',
            count: { $sum: 1 },
            today: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', today] },
                  1,
                  0
                ]
              }
            },
            thisWeek: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', weekAgo] },
                  1,
                  0
                ]
              }
            },
            thisMonth: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', monthAgo] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ], { session }).toArray();

      const domains = domainsResult
        .filter(d => d._id && d._id !== '')
        .map(d => ({
          domain: Array.isArray(d._id) ? d._id.join('; ') : d._id,
          count: d.count,
          today: d.today,
          thisWeek: d.thisWeek,
          thisMonth: d.thisMonth
        }));

      const twelveMonthsAgo = new Date(today);
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const monthlyTrendResult = await this.callDetailsCollection.aggregate([
        {
          $match: {
            createdAt: { $gte: twelveMonthsAgo, ...dateFilter.createdAt }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: '$createdAt'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ], { session }).toArray();

      const monthlyTrend = monthlyTrendResult.map(d => ({
        month: d._id,
        count: d.count
      }));

      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTrendResult = await this.callDetailsCollection.aggregate([
        {
          $match: {
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

      const dailyTrend = dailyTrendResult.map(d => ({
        date: d._id,
        count: d.count
      }));

      return {
        totalCalls,
        callsToday,
        callsThisWeek,
        callsThisMonth,
        domains,
        monthlyTrend,
        dailyTrend
      };
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getACCAnalytics: Error getting ACC analytics:`, error.stack || error);
      throw new InternalServerError(`Failed to get ACC analytics: ${error}`);
    }
  }

  async getQueriesByPeriod(
    params: {
      startDate?: Date;
      endDate?: Date;
      search?: string;
      domain?: string;
      state?: string;
      district?: string;
      block?: string;
      crop?: string;
      season?: string;
      limit?: number;
      offset?: number;
    },
    session?: ClientSession
  ): Promise<{ queries: any[]; total: number }> {
    try {
      await this.init();
      const { startDate, endDate, search, domain, state, district, block, crop, season, limit, offset } = params;

      const matchCriteria: any = {};
      if (startDate || endDate) {
        matchCriteria.createdAt = {};
        if (startDate) matchCriteria.createdAt.$gte = startDate;
        if (endDate) matchCriteria.createdAt.$lte = endDate;
      }

      if (domain && domain.trim() && domain !== 'All') {
        matchCriteria.$and = matchCriteria.$and || [];
        matchCriteria.$and.push({
          $or: [
            { 'metadata.extracted_domain': domain },
            { 'metadata.standardized_domains': domain }
          ]
        });
      }

      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      if (state && state.trim() && state !== 'All') {
        matchCriteria['metadata.extracted_state'] = new RegExp(escapeRegExp(state.trim()), 'i');
      }

      if (district && district.trim() && district !== 'All') {
        matchCriteria['metadata.extracted_district'] = new RegExp(escapeRegExp(district.trim()), 'i');
      }

      if (block && block.trim() && block !== 'All') {
        const blockRegex = new RegExp(escapeRegExp(block.trim()), 'i');
        let matchingCallUuids: string[] = [];
        try {
          const farmersColl = await this.db.getCollection('Farmers_info');
          let matchingFarmers = await farmersColl.find(
            { $or: [{ 'profile.blockName': blockRegex }, { blockName: blockRegex }] },
            { projection: { phoneNo: 1 } }
          ).toArray();

          if (matchingFarmers.length === 0) {
            const fallbackColl = await this.db.getCollection('farmer_details');
            matchingFarmers = await fallbackColl.find(
              { $or: [{ 'profile.blockName': blockRegex }, { blockName: blockRegex }] },
              { projection: { phoneNo: 1 } }
            ).toArray();
          }
          const matchingFarmerPhones = matchingFarmers.map(f => f.phoneNo).filter(Boolean);

          if (matchingFarmerPhones.length > 0) {
            const matchingCalls = await this.callDetailsCollection.find(
              { from: { $in: matchingFarmerPhones } },
              { projection: { callUuid: 1 } }
            ).toArray();
            matchingCallUuids = matchingCalls.map(c => c.callUuid).filter(Boolean);
          }
        } catch (e) {
          console.warn('[CallDetailsRepository] Error looking up farmers by block:', e);
        }

        matchCriteria.$and = matchCriteria.$and || [];
        if (matchingCallUuids.length > 0) {
          matchCriteria.$and.push({
            $or: [
              { 'metadata.extracted_block': blockRegex },
              { callUuid: { $in: matchingCallUuids } }
            ]
          });
        } else {
          matchCriteria.$and.push({
            'metadata.extracted_block': blockRegex
          });
        }
      }

      if (crop && crop.trim() && crop !== 'All') {
        matchCriteria['metadata.extracted_crop'] = new RegExp(escapeRegExp(crop.trim()), 'i');
      }

      if (season && season.trim() && season !== 'All') {
        matchCriteria['metadata.extracted_season'] = new RegExp(escapeRegExp(season.trim()), 'i');
      }

      if (search && search.trim()) {
        const escapedSearch = escapeRegExp(search.trim());
        const searchRegex = new RegExp(escapedSearch, 'i');

        const orConditions: any[] = [
          { callUuid: searchRegex },
          { question: searchRegex },
          { answer: searchRegex },
          { 'metadata.extracted_crop': searchRegex },
          { 'metadata.extracted_domain': searchRegex },
          { 'metadata.extracted_state': searchRegex },
          { 'metadata.extracted_district': searchRegex },
          { 'metadata.extracted_block': searchRegex }
        ];

        if (matchCriteria.$and) {
          matchCriteria.$and.push({ $or: orConditions });
        } else {
          matchCriteria.$or = orConditions;
        }
      }

      const total = await this.callQueriesCollection.countDocuments(matchCriteria, { session });

      let cursor = this.callQueriesCollection.find(matchCriteria, { session }).sort({ createdAt: -1 });

      if (offset !== undefined) cursor = cursor.skip(offset);
      if (limit !== undefined) cursor = cursor.limit(limit);

      const queryDocs = await cursor.toArray();

      const callUuidSet = [...new Set(queryDocs.map(q => q.callUuid).filter(Boolean))];
      const callDocs = await this.callDetailsCollection.find(
        { callUuid: { $in: callUuidSet } },
        { projection: { callUuid: 1, from: 1, createdAt: 1 }, session }
      ).toArray();

      const callMap = new Map<string, any>();
      for (const call of callDocs) {
        callMap.set(call.callUuid, call);
      }

      const enrichedQueries = queryDocs.map(qDoc => {
        const parentCall = callMap.get(qDoc.callUuid);
        return {
          ...qDoc,
          from: parentCall?.from || '',
          createdAt: qDoc.createdAt || parentCall?.createdAt
        };
      });

      return { queries: enrichedQueries, total };
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getQueriesByPeriod: Error retrieving queries:`, error.stack || error);
      throw new InternalServerError(`Failed to get queries by period: ${error}`);
    }
  }
}

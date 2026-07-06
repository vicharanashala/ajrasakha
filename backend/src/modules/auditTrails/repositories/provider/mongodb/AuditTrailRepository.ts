import {
  AuditFilters,
  ModeratorAuditTrail,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IAuditTrailsRepository} from '#root/modules/auditTrails/interfaces/IAuditTrailsRepository.js';
import {MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import { getShiftFilter } from '#root/utils/date.utils.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {query} from 'winston';

export class AuditTrailsRepository implements IAuditTrailsRepository {
  private auditTrailsCollection: Collection<ModeratorAuditTrail>;
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}
  private async init() {
    this.auditTrailsCollection =
      await this.db.getCollection<ModeratorAuditTrail>('auditTrails');
  }

  async createAuditTrail(
    data: ModeratorAuditTrail,
    session?: ClientSession,
  ): Promise<string> {
    await this.init();
    const result = await this.auditTrailsCollection.insertOne(data, {session});
    return result.insertedId.toString();
  }

  // async getAuditTrails(page: number, limit: number, startDate?: string, endDate?: string, session?: ClientSession): Promise<{data:ModeratorAuditTrail[], totalDocuments: number}> {
  //   await this.init();
  //   const skip = (page - 1) * limit;
  //   const query: any = {};

  //   if (startDate || endDate) {
  //     query.createdAt = {};
  //     if (startDate) {
  //       query.createdAt.$gte = new Date(startDate);
  //     }
  //     if (endDate) {
  //       query.createdAt.$lte = new Date(endDate);
  //     }
  //   }

  //   return {
  //     data: await this.auditTrailsCollection.find(query, { session }).skip(skip).limit(limit).toArray(),
  //     totalDocuments: await this.auditTrailsCollection.countDocuments(query, { session }),
  //   };
  // }

  //   async getAuditTrails(
  //   page: number,
  //   limit: number,
  //   startDate?: string,
  //   endDate?: string,
  //   session?: ClientSession
  // ): Promise<{ data: ModeratorAuditTrail[]; totalDocuments: number }> {
  //   await this.init();
  //   const skip = (page - 1) * limit;
  //   const query: any = {};

  //   if (startDate || endDate) {
  //     query.createdAt = {};
  //     if (startDate) {
  //       const start = new Date(startDate);
  //       start.setUTCHours(0, 0, 0, 0);          // start of day
  //       query.createdAt.$gte = start;
  //     }
  //     if (endDate) {
  //       const end = new Date(endDate);
  //       end.setUTCHours(23, 59, 59, 999);        // end of day ← this is the fix
  //       query.createdAt.$lte = end;
  //     }
  //   }

  //   return {
  //     data: await this.auditTrailsCollection
  //       .find(query, { session })
  //       .sort({ createdAt: -1 })
  //       .skip(skip)
  //       .limit(limit)
  //       .toArray(),
  //     totalDocuments: await this.auditTrailsCollection.countDocuments(query, { session }),
  //   };
  // }

  async getAuditTrails(
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
    session?: ClientSession,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}> {
    await this.init();

    const skip = (page - 1) * limit;
    const query: any = {};

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (category) {
      query.category = category;
    }

    if (action) {
      query.action = action;
    }

    if (outComeStatus) {
      query['outcome.status'] = outComeStatus;
    }

    return {
      data: await this.auditTrailsCollection
        .find(query, {session})
        .sort({createdAt: order === "asc" ? 1 : -1})
        .skip(skip)
        .limit(limit)
        .toArray(),

      totalDocuments: await this.auditTrailsCollection.countDocuments(query, {
        session,
      }),
    };
  }

  async getAuditTrailById(
    id: string,
    session?: ClientSession,
  ): Promise<ModeratorAuditTrail | null> {
    await this.init();
    return this.auditTrailsCollection.findOne(
      {_id: new ObjectId(id)},
      {session},
    );
  }

  async getAuditTrailsByModeratorId(
    moderatorId: string,
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
    session?: ClientSession,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}> {
    await this.init();
    const skip = (page - 1) * limit;
    const query: any = {
      'actor.id': new ObjectId(moderatorId),
    };

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    if (category) {
      query.category = category;
    }

    if (action) {
      query.action = action;
    }

    if (outComeStatus) {
      query['outcome.status'] = outComeStatus;
    }

    return {
      data: await this.auditTrailsCollection
        .find(query, {session})
        .sort({createdAt: order === "asc" ? 1 : -1})
        .skip(skip)
        .limit(limit)
        .toArray(),

      totalDocuments: await this.auditTrailsCollection.countDocuments(query, {
        session,
      }),
    };
  }

  async getShiftBasedAuditActionCounts(
    startDate: string,
    // endDate: string,
    shift: "morning" | "evening" | "all",
    from: string,
    to: string,
    session?: ClientSession
  ): Promise<
    {
      category: string;
      action: string;
      count: number;
    }[]
  > {

    await this.init();

    const start = new Date(
      `${startDate}T00:00:00+05:30`
    );

    const end = new Date(
      `${startDate}T23:59:59.999+05:30`
    );

    const result =
      await this.auditTrailsCollection.aggregate<{
        category: string;
        action: string;
        count: number;
      }>(
        [

          /**
           * Filter date range
           */
          {
            $match: {
              createdAt: {
                $gte: start,
                $lte: end,
              },
              ...getShiftFilter(
                "createdAt",
                shift,
                from,
                to
              ),
            },
          },

          /**
           * Group by action
           */
          {
            $group: {
              _id: {
                category: "$category",
                action: "$action",
              },
              count: {
                $sum: 1,
              },
            },
          },

          /**
           * Sort highest first
           */
          {
            $sort: {
              count: -1,
            },
          },

          /**
           * Projection
           */
          {
            $project: {
              _id: 0,
              category: "$category",
              action: "$_id",
              count: 1,
            },
          },
        ],
        { session }
      ).toArray();

      // console.log("Shift-based audit action counts:", result);
    return result;
  }

  async getAuditTrailsByQuestionId(
    questionId: string,
    page: number = 1,
    limit: number = 10,
    action?: string | null,
    order: "asc" | "desc" = "desc",
    session?: ClientSession,
  ): Promise<{ data: ModeratorAuditTrail[]; totalDocuments: number }> {
    await this.init();
    
    // Build query - match documents where questionId is in the context
    const query: any = {
      $or: [
        { 'context.questionId': questionId },
        { 'context.questionId': new ObjectId(questionId) },
        { 'context.questionIds': questionId },
        { 'context.questionIds': new ObjectId(questionId) },
      ],
    };

    // Add action filter if provided
    if (action && action.trim() !== '') {
      query.action = action;
    }

    const skip = (page - 1) * limit;

    return {
      data: await this.auditTrailsCollection
        .find(query, { session })
        .sort({ createdAt: order === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      totalDocuments: await this.auditTrailsCollection.countDocuments(query, { session }),
    };
  }
}

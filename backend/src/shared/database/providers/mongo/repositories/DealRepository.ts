import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {InternalServerError, NotFoundError, ForbiddenError, BadRequestError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {IDeal, DealStatus} from '#root/shared/interfaces/models.js';
import {IDealRepository} from '#root/shared/database/interfaces/IDealRepository.js';

@injectable()
export class DealRepository implements IDealRepository {
  private DealCollection: Collection<IDeal>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.DealCollection = await this.db.getCollection<IDeal>('marketplace_deals');
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.DealCollection.createIndex({listingId: 1});
      await this.DealCollection.createIndex({farmerId: 1});
      await this.DealCollection.createIndex({buyerId: 1});
    } catch (error) {
      console.error('Failed to create deal indexes:', error);
    }
  }

  private static sanitize(deal: any): IDeal {
    return {
      ...deal,
      _id: deal._id?.toString(),
      listingId: deal.listingId?.toString(),
      farmerId: deal.farmerId?.toString(),
      buyerId: deal.buyerId?.toString(),
    } as IDeal;
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async createDeal(
    buyerId: string,
    data: {listingId: string; farmerId: string; offeredPrice: number; quantity: number},
  ): Promise<IDeal> {
    try {
      if (!this.DealCollection) await this.init();

      if (data.farmerId === buyerId) {
        throw new BadRequestError('You cannot make an offer on your own listing');
      }

      const now = new Date();
      const payload: IDeal = {
        listingId: new ObjectId(data.listingId),
        farmerId: new ObjectId(data.farmerId),
        buyerId: new ObjectId(buyerId),
        offeredPrice: data.offeredPrice,
        quantity: data.quantity,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.DealCollection.insertOne(payload as any);

      return DealRepository.sanitize({...payload, _id: insertedId});
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to create deal: ${error.message}`);
    }
  }

  // ─── READ (BY ID) ──────────────────────────────────────────────────────────

  async getDealById(id: string): Promise<IDeal | null> {
    try {
      if (!this.DealCollection) await this.init();

      const deal = await this.DealCollection.findOne({_id: new ObjectId(id)});
      if (!deal) return null;

      return DealRepository.sanitize(deal);
    } catch (error: any) {
      throw new InternalServerError(`Failed to get deal: ${error.message}`);
    }
  }

  // ─── READ (FOR USER — as either farmer or buyer) ────────────────────────────

  async getDealsForUser(userId: string): Promise<IDeal[]> {
  try {
    if (!this.DealCollection) await this.init();

    const oid = new ObjectId(userId);
    const deals = await this.DealCollection.aggregate([
      {$match: {$or: [{farmerId: oid}, {buyerId: oid}]}},
      {$sort: {createdAt: -1}},
      {
        $lookup: {
          from: 'marketplace_listings',
          localField: 'listingId',
          foreignField: '_id',
          as: 'listing',
        },
      },
      {$unwind: {path: '$listing', preserveNullAndEmptyArrays: true}},
    ]).toArray();

    return deals.map((deal: any) => ({
      ...DealRepository.sanitize(deal),
      crop: deal.listing?.crop ?? null,
    }));
  } catch (error: any) {
    throw new InternalServerError(`Failed to fetch deals: ${error.message}`);
  }
}

  // ─── UPDATE STATUS ───────────────────────────────────────────────────────────
  // Only the farmer (deal owner) can accept/reject; either party can cancel.

  async updateDealStatus(
    id: string,
    userId: string,
    status: DealStatus,
  ): Promise<IDeal | null> {
    try {
      if (!this.DealCollection) await this.init();

      const existing = await this.DealCollection.findOne({_id: new ObjectId(id)});
      if (!existing) throw new NotFoundError('Deal not found');

      const isFarmer = existing.farmerId.toString() === userId;
      const isBuyer = existing.buyerId.toString() === userId;

      if (!isFarmer && !isBuyer) {
        throw new ForbiddenError('You are not part of this deal');
      }

      if ((status === 'accepted' || status === 'rejected') && !isFarmer) {
        throw new ForbiddenError('Only the farmer can accept or reject an offer');
      }

      const result = await this.DealCollection.findOneAndUpdate(
        {_id: new ObjectId(id)},
        {$set: {status, updatedAt: new Date()}},
        {returnDocument: 'after'},
      );

      if (!result) return null;
      return DealRepository.sanitize(result);
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) throw error;
      throw new InternalServerError(`Failed to update deal: ${error.message}`);
    }
  }
}

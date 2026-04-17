import {inject, injectable} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {InternalServerError} from 'routing-controllers';
import {
 
  ISimilarQuestion
} from '#root/shared/interfaces/models.js';
import {IDuplicateQuestionRepository} from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';




@injectable()
export class DuplicateQuestionRepository  implements IDuplicateQuestionRepository{
  private DuplicateQuestionCollection: Collection<ISimilarQuestion>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.DuplicateQuestionCollection =
      await this.db.getCollection<ISimilarQuestion>('duplicate_questions');
  }

  async addDuplicate(
    duplicateData: ISimilarQuestion,
    session?: ClientSession,
  ): Promise<{insertedId: string}> {
    try {
      await this.init();

      const result = await this.DuplicateQuestionCollection.insertOne(
        duplicateData,
        {session},
      );

      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding duplicate question: ${error}`,
      );
    }
  }

  async findDuplicatesByMatchedId(
    matchedQuestionId: string,
    session?: ClientSession,
  ): Promise<ISimilarQuestion[]> {
    try {
      await this.init();

      const duplicates = await this.DuplicateQuestionCollection.find(
        {matched_question_id: new ObjectId(matchedQuestionId)},
        {session},
      ).toArray();

      return duplicates.map(d => ({
        ...d,
        _id: d._id?.toString(),
      })) as ISimilarQuestion[];
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching duplicates: ${error}`,
      );
    }
  }
  async findDuplicatesByDateRange(
    startDate: Date,
    endDate: Date,
    sources: 'AJRASAKHA',  
    session?: ClientSession,
  ): Promise<ISimilarQuestion[]> {
    try {
      await this.init();

      // Ensure endDate includes the full day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      const duplicates = await this.DuplicateQuestionCollection.find(
        {
          source: sources,
          createdAt: {
            $gte: startDate,
            $lte: endOfDay
          },
        },
        { session },
      ).toArray();

      return duplicates.map(d => ({
        ...d,
        _id: d._id?.toString(),
      })) as ISimilarQuestion[];
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching similar questions by date range: ${error}`,
      );
    }
  }

  async deleteByReferenceQuestionId(
referenceQuestionId: string,
session?: ClientSession,
): Promise<{deletedCount: number}> {
try {
await this.init();
const result = await this.DuplicateQuestionCollection.deleteMany(
{referenceQuestionId: new ObjectId(referenceQuestionId)},
{session},
);
return {deletedCount: result.deletedCount};
} catch (error) {
throw new InternalServerError(
"Error while deleting duplicate questions by reference: ${error}",
);
}
}

}
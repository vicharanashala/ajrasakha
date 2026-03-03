import {inject, injectable} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {InternalServerError} from 'routing-controllers';

export interface IDuplicateQuestion {
  _id?: string | ObjectId;
  question: string;
  matched_question_id: ObjectId | string;
  matched_question_text: string;
  similarity_score: number;
  embedding: number[];
  userId?: ObjectId | string;
  contextId?: ObjectId | string | null;
  status: string;
  totalAnswersCount: number;
  priority: string;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  isAutoAllocate: boolean;
  source: 'AJRASAKHA' | 'AGRI_EXPERT';
  text?: string;
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class DuplicateQuestionRepository {
  private DuplicateQuestionCollection: Collection<IDuplicateQuestion>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.DuplicateQuestionCollection =
      await this.db.getCollection<IDuplicateQuestion>('duplicate_questions');
  }

  async addDuplicate(
    duplicateData: IDuplicateQuestion,
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
  ): Promise<IDuplicateQuestion[]> {
    try {
      await this.init();

      const duplicates = await this.DuplicateQuestionCollection.find(
        {matched_question_id: new ObjectId(matchedQuestionId)},
        {session},
      ).toArray();

      return duplicates.map(d => ({
        ...d,
        _id: d._id?.toString(),
      })) as IDuplicateQuestion[];
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching duplicates: ${error}`,
      );
    }
  }
}

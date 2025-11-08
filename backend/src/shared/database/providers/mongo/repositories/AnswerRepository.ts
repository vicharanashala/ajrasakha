import {IAnswer, IQuestion, IUser, SourceItem,IQuestionSubmission} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {SubmissionResponse} from '#root/modules/core/classes/validators/AnswerValidators.js';

export class AnswerRepository implements IAnswerRepository {
  private AnswerCollection: Collection<IAnswer>;
  private QuestionCollection: Collection<IQuestion>;
  private usersCollection!: Collection<IUser>;
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.AnswerCollection = await this.db.getCollection<IAnswer>('answers');
    this.QuestionCollection = await this.db.getCollection<IQuestion>(
      'questions',
    );
    this.usersCollection = await this.db.getCollection<IUser>('users');
    await this.db.getCollection<IQuestionSubmission>('question_submissions');
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    embedding: number[],
    isFinalAnswer: boolean = false,
    answerIteration: number = 1,
    session?: ClientSession,
  ): Promise<{insertedId: string}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!authorId || !isValidObjectId(authorId)) {
        throw new BadRequestError('Invalid or missing authorId');
      }
      if (!answer || typeof answer !== 'string') {
        throw new BadRequestError('Answer must be a non-empty string');
      }

      const doc: IAnswer = {
        questionId: new ObjectId(questionId),
        authorId: new ObjectId(authorId),
        answer,
        isFinalAnswer,
        answerIteration,
        approvalCount: 0,
        embedding,
        sources,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.AnswerCollection.insertOne(doc, {session});

      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding answer, More/ ${error}`,
      );
    }
  }

  async getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<Partial<IAnswer>[]> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const answers = await this.AnswerCollection.find(
        {questionId: new ObjectId(questionId)},
        {session},
      )
        .sort({createdAt: 1})
        .toArray();

      return answers.map(a => ({
        _id: a._id?.toString(),
        answer: a.answer,
        isFinalAnswer: a.isFinalAnswer,
        createdAt: a.createdAt,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }
  async getById(answerId: string, session?: ClientSession): Promise<IAnswer> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const answer = await this.AnswerCollection.findOne(
        {
          _id: new ObjectId(answerId),
        },
        {session},
      );
      return {
        ...answer,
        _id: answer._id?.toString(),
        questionId: answer.questionId?.toString(),
        authorId: answer.authorId?.toString(),
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }

  async getByAuthorId(
    authorId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IAnswer | null> {
    try {
      await this.init();

      return await this.AnswerCollection.findOne(
        {
          authorId: new ObjectId(authorId),
          questionId: new ObjectId(questionId),
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answer, More/ ${error}`);
    }
  }

  async getAllSubmissions(
    userId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<SubmissionResponse[]> {
    try {
      await this.init();
      const skip = (page - 1) * limit;
      const user = await this.usersCollection.findOne({_id: new ObjectId(userId)})
      const role = user.role
      console.log("role ",role,userId)
      if(role ==='moderator'){
        const submissions = await this.AnswerCollection.aggregate([
          {$match:{approvedBy:new ObjectId(userId)}},
          {
            $lookup:{
              from:'questions',
              localField:'questionId',
              foreignField:'_id',
              as:'question'
            }
          },
          
          {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},
          {
          $group: {
              _id: '$question._id',
              text: {$first: '$question.question'},
              createdAt: {$first: '$question.createdAt'},
              updatedAt: {$first: '$question.updatedAt'},
              totalAnswersCount: {$sum: 1},
              responses: {
                $push: {
                  answer: '$answer',
                  id: {$toString: '$_id'},
                  isFinalAnswer: '$isFinalAnswer',
                  createdAt: '$createdAt',
                },
              },
            },
          },
          { $match: { _id: { $ne: null } } },
          {$sort: {createdAt: -1}},
          {$skip: skip},
          {$limit: limit},
        ]).toArray()
        return submissions.map(sub => ({
          id: sub._id.toString(),
          text: sub.text,
          createdAt: sub.createdAt.toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          totalAnwersCount: sub.totalAnswersCount,
          reponse: sub.responses[0] || [],
        }));
      }else{
        const submissions = await this.AnswerCollection.aggregate([
          {$match: {authorId: new ObjectId(userId)}},
          {
            $lookup: {
              from: 'questions',
              localField: 'questionId',
              foreignField: '_id',
              as: 'question',
            },
          },
          {$unwind: '$question'},
          {
            $group: {
              _id: '$question._id',
              text: {$first: '$question.question'},
              createdAt: {$first: '$question.createdAt'},
              updatedAt: {$first: '$question.updatedAt'},
              totalAnswersCount: {$sum: 1},
              responses: {
                $push: {
                  answer: '$answer',
                  id: {$toString: '$_id'},
                  isFinalAnswer: '$isFinalAnswer',
                  createdAt: '$createdAt',
                },
              },
            },
          },
          {$sort: {createdAt: -1}},
          {$skip: skip},
          {$limit: limit},
        ]).toArray();
        return submissions.map(sub => ({
          id: sub._id.toString(),
          text: sub.text,
          createdAt: sub.createdAt.toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          totalAnwersCount: sub.totalAnswersCount,
          reponse: sub.responses[0],
        }));
      }

    } catch (error) {
      console.error(error)
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }
  async getAllFinalizedAnswers(
    userId: string,
    currentUserId: string,
    date: string,
    status:string,
    session?: ClientSession,
  ): Promise<{
    finalizedSubmissions: any[];
    
  }> {
    try {
      await this.init();

      let userObjectId = null;

      if (userId && userId !== 'all') {
        // Check if it's an email
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId);

        if (isEmail) {
          const user = await this.usersCollection.findOne({email: userId});
          if (user) userObjectId = user._id;
        } else {
          // Treat it as an ObjectId
          userObjectId = new ObjectId(userId);
        }
      }
      let dateMatch: any = {};
    

if (date && date !== "all") {
  if (date.includes(":")) {
    const [start, end] = date.split(":");
    dateMatch.createdAt = {
      $gte: new Date(start),
      $lte: new Date(end + "T23:59:59.999Z"),
    };
  }
}
//console.log("the date match===",dateMatch)
    

      // Build status filter dynamically
let statusFilter: any = {};
if (status !== "all") {
  statusFilter["question.status"] = status;
}

const submissions = await this.AnswerCollection.aggregate([
  // Join question details
  {
    $lookup: {
      from: "questions",
      localField: "questionId",
      foreignField: "_id",
      as: "question",
    },
  },
  { $unwind: "$question" },

  // ✅ Date filter (works for both cases)
  ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),

  // ✅ If user selected a specific user → restrict questions to that user
  ...(userId !== "all"
    ? [
        {
          $match: {
            "approvedBy": userObjectId,
            ...statusFilter, // applies status only if status != "all"
          },
        },

        // Sort latest answers first so we can pick the final/latest one
        { $sort: { createdAt: -1 } },

        // ✅ Group → get only the latest answer for each question
        {
          $group: {
            _id: "$questionId",
            latestAnswer: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$latestAnswer" } }, // flatten result
      ]
    : status !== "all"
    ? [
        // ✅ If status chosen while user = all → just filter status
        {
          $match: {
            ...statusFilter,
          },
        },
      ]
    : []),

  // ✅ Sort final results newest first (applies to both cases)
  { $sort: { createdAt: -1 } },
]).toArray()
const finalizedSubmissions = submissions.map(sub => ({
        id: sub._id.toString(),

        // Answer fields
        answer: sub.answer,
        isFinalAnswer: sub.isFinalAnswer,
        approvalCount: sub.approvalCount,
        authorId: sub.authorId?.toString() || null,
        questionId: sub.questionId?.toString() || null,
        sources: sub.sources || [],

        createdAt: sub.createdAt?.toISOString(),
        updatedAt: sub.updatedAt?.toISOString(),
        details: sub.question?.details,
        status: sub.isFinalAnswer==true?"Finalized Answers":"Reject Or Pending",
        // Question fields (nested)
        question: {
          id: sub.question?._id?.toString(),
          text: sub.question?.question,
          status: sub.question?.status,
          details: sub.question?.details,
          priority: sub.question?.priority,
          source: sub.question?.source,
          totalAnswersCount: sub.question?.totalAnswersCount || 0,
          createdAt: sub.question?.createdAt?.toISOString(),
          updatedAt: sub.question?.updatedAt?.toISOString(),
        },
      }));
return {
        finalizedSubmissions,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }
  async getCurrentUserWorkLoad(
   currentUserId: string,
    session?: ClientSession,
  ): Promise<{
    
    currentUserAnswers: any[];
    totalQuestionsCount: number;
    totalInreviewQuestionsCount:number
  }> {
    try {
      await this.init();
      
   const currentUserAnswers = await this.AnswerCollection.aggregate([
        {
          $match: {
            isFinalAnswer: true,
            approvedBy:new ObjectId(currentUserId)

          },
        },
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: '$question'},

        
        {
          $group: {
            _id: {$toString: '$question._id'}, 
            text: {$first: '$question.question'},
            createdAt: {$first: '$question.createdAt'},
            updatedAt: {$first: '$question.updatedAt'},
            totalAnswersCount: {$sum: 1},
            details: {$first: '$question.details'},
            status: {$first: '$question.status'},
            responses: {
              $push: {
                answer: '$answer',
                id: {$toString: '$_id'},
                isFinalAnswer: '$isFinalAnswer',
                createdAt: '$createdAt',
              },
            },
          },
        },

        {$sort: {createdAt: -1}},
      ]).toArray();
      const totalInreviewQuestionsCount = await this.QuestionCollection.countDocuments({
       
        status: { $in: ["in-review"] }
      });
      const totalQuestionsCount = await this.QuestionCollection.countDocuments({});
      //console.log("the total questions====",totalQuestionsCount)
      return {
       
        currentUserAnswers,
        totalQuestionsCount,
        totalInreviewQuestionsCount
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }

  async updateAnswer(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const result = await this.AnswerCollection.updateOne(
        {_id: new ObjectId(answerId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating answer, More/ ${error}`,
      );
    }
  }

  async deleteAnswer(
    answerId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const result = await this.AnswerCollection.deleteOne(
        {_id: new ObjectId(answerId)},
        {session},
      );

      return {deletedCount: result.deletedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number> {
    try {
      await this.init();

      const result = await this.AnswerCollection.findOneAndUpdate(
        {_id: new ObjectId(answerId)},
        {$inc: {approvalCount: 1}},
        {
          session,
          returnDocument: 'after',
        },
      );

      if (!result) {
        throw new InternalServerError(`Answer not found with ID ${answerId}`);
      }

      return result.approvalCount ?? 0;
    } catch (error) {
      throw new InternalServerError(
        `Error while incrementing approval count of answer ${answerId}. More: ${error}`,
      );
    }
  }

  async deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.AnswerCollection.deleteMany(
        {questionId: new ObjectId(questionId)},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async getGoldenFaqs(
    userId: string,
    page: number,
    limit: number,
    search?: string,
    session?: ClientSession,
  ): Promise<{faqs: any[]; totalFaqs: number}> {
    try {
      await this.init();
      const skip = (page - 1) * limit;
      const filter: any = {isFinalAnswer: true};
      if (userId) {
        filter.approvedBy = new ObjectId(userId);
      }

      // if (search) {
      //   filter.answer = {$regex: search, $options: 'i'};
      // }

      const pipeline: any[] = [
        {$match: filter},

        // Lookup Question
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},

        // Lookup User (author)
        {
          $lookup: {
            from: 'users',
            localField: 'approvedBy',
            foreignField: '_id',
            as: 'moderator',
          },
        },
        {$unwind: {path: '$moderator', preserveNullAndEmptyArrays: true}},
        {$skip: skip},
        {$limit: limit},
      ];

      // const pipeline: any[] = [
      //   {$match: filter}]
      const faqs = await this.AnswerCollection.aggregate(pipeline, {
        session,
      }).toArray();

      // Count total (with same filters)
      const totalFaqs = await this.AnswerCollection.countDocuments(filter, {
        session,
      });

      // Convert ObjectIds to strings
      const formattedFaqs = faqs.map(faq => ({
        ...faq,
        _id: faq._id?.toString(),
        questionId: faq.questionId?.toString(),
        authorId: faq.authorId?.toString(),
        approvedBy: faq.approvedBy?.toString(),
        question: faq.question
          ? {
              ...faq.question,
              _id: faq.question._id?.toString(),
              userId: faq.question.userId?.toString(),
              contextId: faq.question.contextId?.toString() ?? null,
            }
          : null,
        moderator: faq.moderator
          ? {
              ...faq.moderator,
              _id: faq.moderator._id?.toString(),
            }
          : null,
      }));
      return { faqs: formattedFaqs, totalFaqs };
      // if(userId){
      //   const faqs = await this.AnswerCollection.find({isFinalAnswer:true,approvedBy:new ObjectId(userId)}).skip(skip).limit(limit).toArray()
      //   const totalFaqs = await this.AnswerCollection.countDocuments({isFinalAnswer:true,approvedBy:new ObjectId(userId)})
      //   return {faqs,totalFaqs}
      // }else{
      //   const faqs = await this.AnswerCollection.find({isFinalAnswer:true}).skip(skip).limit(limit).toArray()
      //   const totalFaqs = await this.AnswerCollection.countDocuments({isFinalAnswer:true})
      //   return {faqs,totalFaqs}
      // }
    } catch (error) {
      console.error(error)
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }
}

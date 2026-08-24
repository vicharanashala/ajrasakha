import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import * as analytics from './QuestionAnalyticsMethods.js';
import * as reads from './QuestionReadMethods.js';
import * as queue from './QuestionQueueMethods.js';
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  QuestionSource,
  IReroute,
  ISimilarQuestion,
  ICheckStatusResponse,
} from '#root/shared/interfaces/models.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject } from 'inversify';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { isValidObjectId } from '#root/utils/isValidObjectId.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import {
  detailsArray,
  dummyEmbeddings,
  priorities,
  questionStatus,
  sources,
} from '#root/modules/question/utils/questionGen.js';
import {
  Analytics,
  AnalyticsItem,
  AnalyticsTableRow,
  DashboardResponse,
  GoldenDatasetEntry,
  GoldenDataViewType,
  ModeratorApprovalRate,
  QuestionStateBreakdownBySource,
  QuestionStatusOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import { getReviewerQueuePosition } from '#root/utils/getReviewerQueuePosition.js';
import {
  QuestionLevelResponse,
  ReviewLevelTimeValue,
} from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { buildQuestionFilter } from '#root/utils/buildQuestionFilter.js';
import {
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/question/classes/validators/QuestionVaidators.js';
import { buildReviewTimeline } from '#root/utils/buildReviewTat.js';
import { getShiftFilter } from '#root/utils/date.utils.js';
import {
  QueueQuestionData,
  RawQueueQuestionRow,
} from '#root/modules/question/interfaces/IQuestionService.js';

const VECTOR_INDEX_NAME = 'questions_vector_index';
const EMBEDDING_FIELD = 'embedding';
const VECTOR_NUM_CANDIDATES = 200;
const VECTOR_COUNT_LIMIT = 20000;

export class QuestionRepository implements IQuestionRepository {
  // These collections and `init()` are public because the extracted method
  // implementations in ./QuestionAnalyticsMethods.ts and ./QuestionReadMethods.ts run
  // with `this` bound to this repository (assigned as instance fields) and access them
  // directly.
  QuestionCollection: Collection<IQuestion>;
  DuplicateQuestionCollection: Collection<ISimilarQuestion>;
  QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  AnswersCollection: Collection<IAnswer>;
  UsersCollection!: Collection<IUser>;
  ContextCollection: Collection<IContext>;
  ReviewCollection: Collection<IReview>;
  ReRouteCollection: Collection<IReroute>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  async init() {
    this.ContextCollection = await this.db.getCollection<IContext>('contexts');

    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
    this.DuplicateQuestionCollection =
      await this.db.getCollection<ISimilarQuestion>('duplicate_questions');
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.UsersCollection = await this.db.getCollection<IUser>('users');
    this.AnswersCollection = await this.db.getCollection<IAnswer>('answers');
    this.ReviewCollection = await this.db.getCollection<IReview>('reviews');
    this.ReRouteCollection = await this.db.getCollection<IReroute>('reroutes');
  }

  private async ensureIndexes() {
    try {
      await this.QuestionCollection.createIndex({ status: 1, createdAt: 1 });
    } catch (error) {
      console.error('Failed to create index:', error);
    }
  }

  private async getEmbeddingForText(text: string): Promise<number[]> {
    throw new Error(
      'getEmbeddingForText not implemented. Replace with your embedding call.',
    );
  }

  async addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ): Promise<{ insertedCount: number }> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new BadRequestError('Questions must be a non-empty array');
      }

      const uploadData: IQuestion[] = questions.map((question: string) => {
        const randomDetails =
          detailsArray[Math.floor(Math.random() * detailsArray.length)];
        const randomSource =
          sources[Math.floor(Math.random() * sources.length)];
        const randomPrioriy =
          priorities[Math.floor(Math.random() * priorities.length)];

        return {
          question,
          userId: new ObjectId(userId),
          context: new ObjectId(contextId),
          status: 'open',
          details: randomDetails,
          source: randomSource,
          embedding: dummyEmbeddings,
          metrics: null,
          text: `Question: ${question}`,
          totalAnswersCount: 0,
          isAutoAllocate: true,
          priority: randomPrioriy,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const result = await this.QuestionCollection.insertMany(uploadData, {
        session,
      });

      return { insertedCount: result.insertedCount };
    } catch (error) {
      throw new InternalServerError(
        `Error while adding questions, More/ ${error}`,
      );
    }
  }
  async addDummyQuestion(
    userId: string,
    contextId: string,
    question: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!question || typeof question !== 'string') {
        throw new BadRequestError('Question must be a non-empty string');
      }

      const randomDetails =
        detailsArray[Math.floor(Math.random() * detailsArray.length)];
      const randomSource = sources[Math.floor(Math.random() * sources.length)];
      const randomPrioriy =
        priorities[Math.floor(Math.random() * priorities.length)];
      const randomStatus =
        questionStatus[Math.floor(Math.random() * questionStatus.length)];

      const newQuestion: IQuestion = {
        question,
        userId: new ObjectId(userId),
        contextId: new ObjectId(contextId),
        status: randomStatus,
        details: randomDetails,
        source: randomSource,
        embedding: dummyEmbeddings,
        metrics: null,
        text: `Question: ${question}`,
        totalAnswersCount: 0,
        isAutoAllocate: true,
        priority: randomPrioriy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.QuestionCollection.insertOne(newQuestion, {
        session,
      });

      return { ...newQuestion, _id: result.insertedId };
    } catch (error) {
      throw new InternalServerError(`Error while adding question: ${error}`);
    }
  }

  async addQuestion(
    question: IQuestion,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      if (!question._id) question._id = new ObjectId();
      // New questions are eligible for moderator auto-allocation by default.
      if (question.autoAllocateModerator === undefined) {
        question.autoAllocateModerator = true;
      }

      await this.QuestionCollection.insertOne(question, { session });

      return { ...question, _id: question._id.toString() };
    } catch (error) {
      throw new InternalServerError(`Failed to add question ${error}`);
    }
  }

  async getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    try {
      await this.init();

      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }

      const questions = await this.QuestionCollection.find(
        {
          context: new ObjectId(contextId),
        },
        { session },
      ).toArray();

      const formattedQuestions: IQuestion[] = questions.map(q => ({
        ...q,
        _id: q._id?.toString(),
        userId: q.userId?.toString(),
        contextId: q.contextId?.toString(),
      }));
      return formattedQuestions;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  /** Data fix: standardise a state name. Sets details.state = standardizedTo for every
   *  question whose details.state currently matches one of currentValues (exact match). */
  async normalizeQuestionState(
    currentValues: string[],
    standardizedTo: string,
    session?: ClientSession,
  ): Promise<{ matched: number; modified: number }> {
    try {
      await this.init();
      const result = await this.QuestionCollection.updateMany(
        { 'details.state': { $in: currentValues } },
        { $set: { 'details.state': standardizedTo, updatedAt: new Date() } },
        { session },
      );
      return { matched: result.matchedCount, modified: result.modifiedCount };
    } catch (error) {
      throw new InternalServerError(
        `Failed to normalize question state: ${error}`,
      );
    }
  }

  /** Data fix: standardise question district names, validated against the `districts`
   *  collection. For each { existingName, standardiseTo }: only when `standardiseTo` exists
   *  as a districtNameEnglish do we set details.district = standardiseTo for questions whose
   *  details.district === existingName. Names whose `standardiseTo` isn't a known district
   *  are returned in `notMatching` and left untouched. */
  async normalizeQuestionDistricts(
    mappings: { existingName: string; standardiseTo: string }[],
  ): Promise<{
    results: {
      existingName: string;
      standardiseTo: string;
      matchedInDistricts: boolean;
      matched: number;
      modified: number;
    }[];
    notMatching: { existingName: string; standardiseTo: string }[];
  }> {
    try {
      await this.init();
      const districtsCollection =
        await this.db.getCollection<{ districtNameEnglish?: string }>('districts');

      // Which of the target names actually exist in the districts collection?
      const targets = Array.from(new Set(mappings.map(m => m.standardiseTo)));
      const existingDocs = await districtsCollection
        .find(
          { districtNameEnglish: { $in: targets } },
          { projection: { districtNameEnglish: 1, _id: 0 } },
        )
        .toArray();
      const validSet = new Set(
        existingDocs.map(d => d.districtNameEnglish).filter(Boolean),
      );

      const results: {
        existingName: string;
        standardiseTo: string;
        matchedInDistricts: boolean;
        matched: number;
        modified: number;
      }[] = [];
      const notMatching: { existingName: string; standardiseTo: string }[] = [];

      for (const m of mappings) {
        if (!validSet.has(m.standardiseTo)) {
          notMatching.push({
            existingName: m.existingName,
            standardiseTo: m.standardiseTo,
          });
          results.push({ ...m, matchedInDistricts: false, matched: 0, modified: 0 });
          continue;
        }
        const res = await this.QuestionCollection.updateMany(
          { 'details.district': m.existingName },
          { $set: { 'details.district': m.standardiseTo, updatedAt: new Date() } },
        );
        results.push({
          existingName: m.existingName,
          standardiseTo: m.standardiseTo,
          matchedInDistricts: true,
          matched: res.matchedCount,
          modified: res.modifiedCount,
        });
      }

      return { results, notMatching };
    } catch (error) {
      throw new InternalServerError(
        `Failed to normalize question districts: ${error}`,
      );
    }
  }

  /** Audit: scan every question's details.state / details.district and return the distinct
   *  values that don't exist in the `states` (stateNameEnglish) / `districts`
   *  (districtNameEnglish) collections. Each unknown district is additionally looked up in the
   *  `blocks` (blockNameEnglish) and `villages` (villageNameEnglish) collections — if it turns
   *  out to be a block/village name, its districtCode + stateCode are attached so it can be
   *  mapped back. Empty/null values are ignored. */
  async findUnknownQuestionGeo(): Promise<{
    unknownStates: string[];
    /** Unknown districts that WERE resolvable via a block/village → their real district. */
    matchedDistricts: {
      name: string;
      foundIn: 'block' | 'village';
      districtCode: number | null;
      stateCode: number | null;
      districtNameEnglish: string | null;
    }[];
    /** Unknown districts not found in districts, blocks or villages. */
    notMatchingDistricts: string[];
  }> {
    try {
      await this.init();
      const statesCollection =
        await this.db.getCollection<{ stateNameEnglish?: string }>('states');
      const districtsCollection =
        await this.db.getCollection<{
          districtNameEnglish?: string;
          districtCode?: number;
        }>('districts');
      const blocksCollection = await this.db.getCollection<{
        blockNameEnglish?: string;
        districtCode?: number;
        stateCode?: number;
      }>('blocks');
      const villagesCollection = await this.db.getCollection<{
        villageNameEnglish?: string;
        districtCode?: number;
        stateCode?: number;
      }>('villages');

      const [qStates, qDistricts, stateNames, districtNames] = await Promise.all([
        this.QuestionCollection.distinct('details.state'),
        this.QuestionCollection.distinct('details.district'),
        statesCollection.distinct('stateNameEnglish'),
        districtsCollection.distinct('districtNameEnglish'),
      ]);

      const stateSet = new Set(
        (stateNames as unknown[]).filter(
          (s): s is string => typeof s === 'string' && s.length > 0,
        ),
      );
      const districtSet = new Set(
        (districtNames as unknown[]).filter(
          (d): d is string => typeof d === 'string' && d.length > 0,
        ),
      );

      const unknownStates = (qStates as unknown[]).filter(
        (s): s is string =>
          typeof s === 'string' && s.trim().length > 0 && !stateSet.has(s),
      );
      const unknownDistrictNames = (qDistricts as unknown[]).filter(
        (d): d is string =>
          typeof d === 'string' && d.trim().length > 0 && !districtSet.has(d),
      );

      // Resolve each unknown district against blocks/villages to recover its codes, matching
      // by case-insensitive regex (so "chittoor" matches "Chittoor" etc.).
      const escapeRegex = (s: string) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegexes = unknownDistrictNames.map(
        n => new RegExp(`^${escapeRegex(n.trim())}$`, 'i'),
      );
      const [blockMatches, villageMatches] =
        nameRegexes.length === 0
          ? [[], []]
          : await Promise.all([
            blocksCollection
              .find(
                { blockNameEnglish: { $in: nameRegexes } },
                { projection: { blockNameEnglish: 1, districtCode: 1, stateCode: 1, _id: 0 } },
              )
              .toArray(),
            villagesCollection
              .find(
                { villageNameEnglish: { $in: nameRegexes } },
                { projection: { villageNameEnglish: 1, districtCode: 1, stateCode: 1, _id: 0 } },
              )
              .toArray(),
          ]);
      // Key maps by lowercased name so the case-insensitive match lines back up.
      const blockMap = new Map(
        blockMatches.map(b => [(b.blockNameEnglish ?? '').toLowerCase(), b]),
      );
      const villageMap = new Map(
        villageMatches.map(v => [(v.villageNameEnglish ?? '').toLowerCase(), v]),
      );

      // First pass: figure out where (if anywhere) each unknown district resolves.
      const resolved = unknownDistrictNames.sort().map(name => {
        const key = name.trim().toLowerCase();
        const b = blockMap.get(key);
        if (b) {
          return {
            name,
            foundIn: 'block' as const,
            districtCode: b.districtCode ?? null,
            stateCode: b.stateCode ?? null,
          };
        }
        const v = villageMap.get(key);
        if (v) {
          return {
            name,
            foundIn: 'village' as const,
            districtCode: v.districtCode ?? null,
            stateCode: v.stateCode ?? null,
          };
        }
        return { name, foundIn: null as null, districtCode: null, stateCode: null };
      });

      // Resolve the real districtNameEnglish for the district codes we recovered.
      const codes = Array.from(
        new Set(
          resolved
            .map(r => r.districtCode)
            .filter((c): c is number => typeof c === 'number'),
        ),
      );
      const districtDocs = codes.length
        ? await districtsCollection
          .find(
            { districtCode: { $in: codes } },
            { projection: { districtCode: 1, districtNameEnglish: 1, _id: 0 } },
          )
          .toArray()
        : [];
      const codeToName = new Map(
        districtDocs.map(d => [d.districtCode, d.districtNameEnglish ?? null]),
      );

      const matchedDistricts: {
        name: string;
        foundIn: 'block' | 'village';
        districtCode: number | null;
        stateCode: number | null;
        districtNameEnglish: string | null;
      }[] = [];
      const notMatchingDistricts: string[] = [];

      for (const r of resolved) {
        if (r.foundIn) {
          matchedDistricts.push({
            name: r.name,
            foundIn: r.foundIn,
            districtCode: r.districtCode,
            stateCode: r.stateCode,
            districtNameEnglish:
              r.districtCode != null ? codeToName.get(r.districtCode) ?? null : null,
          });
        } else {
          notMatchingDistricts.push(r.name);
        }
      }

      return {
        unknownStates: unknownStates.sort(),
        matchedDistricts,
        notMatchingDistricts,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to audit question geo values: ${error}`,
      );
    }
  }

  async getById(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const question = await this.QuestionCollection.findOne(
        {
          _id: new ObjectId(questionId),
        },
        { session },
      );

      if (!question)
        throw new NotFoundError(`Failed to find question ${questionId}`);

      const formattedQuestion: IQuestion = {
        ...question,
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        contextId: question.contextId?.toString(),
      };

      return formattedQuestion;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async findByIds(ids: ObjectId[]): Promise<IQuestion[]> {
    try {
      await this.init();

      if (!ids || ids.length === 0) {
        return [];
      }

      const questions = await this.QuestionCollection.find({
        _id: { $in: ids },
      }).toArray();

      return questions.map(q => ({
        ...q,
        _id: q._id?.toString(),
        userId: q.userId?.toString(),
        contextId: q.contextId?.toString(),
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to find questions by IDs: ${error}`);
    }
  }

  /** Find questions that reference the given question (referenceQuestionId), optionally
   *  filtered by status. Used to propagate a close to queue-duplicate children. */
  async findByReferenceQuestionId(
    referenceQuestionId: string,
    status?: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    if (!isValidObjectId(referenceQuestionId)) return [];
    const filter: Record<string, unknown> = {
      referenceQuestionId: new ObjectId(referenceQuestionId),
    };
    if (status) filter.status = status;
    return this.QuestionCollection.find(filter, { session }).toArray();
  }

  findDetailedQuestions = reads.findDetailedQuestions;

  getAllocatedQuestions = reads.getAllocatedQuestions;

  getQuestionWithFullData = reads.getQuestionWithFullData;

  async updateExpiredAfterFourHours(): Promise<void> {
    try {
      await this.init();
      await this.ensureIndexes();

      const now = new Date();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const oneAndHalfHoursMs = 1.5 * 60 * 60 * 1000;

      // const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

      const result = await this.QuestionCollection.updateMany(
        {
          status: { $in: ['open'] },
          isOnHold: { $ne: true },
          pae_review: { $ne: true },
        },
        [
          {
            $set: {
              priority: {
                $cond: [
                  {
                    $and: [
                      {
                        $lte: [
                          {
                            $add: [
                              '$createdAt',
                              oneAndHalfHoursMs,
                              { $ifNull: ['$accumulatedHoldMs', 0] },
                            ],
                          },
                          now,
                        ],
                      },
                      {
                        $ne: ['$priority', 'critical'],
                      },
                    ],
                  },
                  'critical',
                  '$priority',
                ],
              },

              status: {
                $cond: [
                  {
                    $lte: [
                      {
                        $add: [
                          '$createdAt',
                          twoHoursMs,
                          { $ifNull: ['$accumulatedHoldMs', 0] },
                        ],
                      },
                      now,
                    ],
                  },
                  'delayed',
                  '$status',
                ],
              },

              isDelayed: {
                $cond: [
                  {
                    $lte: [
                      {
                        $add: [
                          '$createdAt',
                          twoHoursMs,
                          { $ifNull: ['$accumulatedHoldMs', 0] },
                        ],
                      },
                      now,
                    ],
                  },
                  true,
                  { $ifNull: ['$isDelayed', false] },
                ],
              },
            },
          },
        ],
      );

      console.log(
        ` Updated ${result.modifiedCount} questions to "delayed" status/ 'critical' priority.`,
      );
    } catch (error) {
      console.error('Error updating expired questions', error);
    }
  }

  async updateAutoAllocate(
    questionId: string,
    isAutoAllocate: boolean,
    session?: ClientSession,
  ): Promise<IQuestion | null> {
    try {
      await this.init();
      const autoAllocateValue =
        typeof isAutoAllocate === 'boolean' ? !isAutoAllocate : false;

      return await this.QuestionCollection.findOneAndUpdate(
        { _id: new ObjectId(questionId) },
        { $set: { isAutoAllocate: autoAllocateValue } },
        { session, returnDocument: 'after' },
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while updating auto allocate field: ${error}`,
      );
    }
  }

  async getQuestionByQuestionText(
    text: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      return this.QuestionCollection.findOne({ question: text }, { session });
    } catch (error) {
      throw new InternalServerError(
        `Failed to find question by text /More: ${error}`,
      );
    }
  }

  /** Bulk-replace `details.domain` on questions from a { questionId, normalizedDomain }
   *  list (one DB round trip) — the existing domain values are removed and replaced
   *  with the single standardized domain. Reports how many questions were modified and
   *  how many ids didn't match any document (or were invalid). */
  async bulkSetNormalizedDomain(
    pairs: { questionId: string; normalizedDomain: string }[],
  ): Promise<{
    total: number;
    matched: number;
    modified: number;
    notMatched: number;
    invalid: number;
  }> {
    await this.init();
    const total = pairs.length;
    const valid = pairs.filter(
      p => p.questionId && isValidObjectId(p.questionId),
    );
    const invalid = total - valid.length;
    if (!valid.length) {
      return { total, matched: 0, modified: 0, notMatched: invalid, invalid };
    }
    const ops = valid.map(p => ({
      updateOne: {
        filter: { _id: new ObjectId(p.questionId) },
        update: {
          $set: {
            // Remove existing domain values and replace with the standardized one.
            'details.domain': [p.normalizedDomain ?? ''],
            updatedAt: new Date(),
          },
        },
      },
    }));
    const res = await this.QuestionCollection.bulkWrite(ops as any);
    const matched = res.matchedCount ?? 0;
    const modified = res.modifiedCount ?? 0;
    // notMatched = valid ids that hit no document + the invalid ones.
    const notMatched = valid.length - matched + invalid;
    return { total, matched, modified, notMatched, invalid };
  }

  /** Closed questions that have no moderator recorded (moderatorId is null or missing).
   *  Used by the backfill that restores moderatorId from the final answer's approver —
   *  moderatorId is cleared when a question closes. Returns up to `limit` question ids. */
  async findClosedQuestionsWithoutModerator(limit: number): Promise<string[]> {
    await this.init();
    const safeLimit = Math.max(1, Math.min(limit || 500, 2000));
    const docs = await this.QuestionCollection.find(
      {
        $and: [
          { $or: [{ moderatorId: { $exists: false } }, { moderatorId: null }] },
          { status: 'closed' },
        ],
      },
      { projection: { _id: 1 }, limit: safeLimit },
    ).toArray();
    return docs.map(d => d._id!.toString());
  }

  /** Bulk-set moderatorId on several questions in one round trip. Invalid ids are
   *  skipped. Returns the number of questions actually modified. */
  async bulkSetModeratorId(
    pairs: { questionId: string; moderatorId: string }[],
  ): Promise<number> {
    await this.init();
    const ops = pairs
      .filter(
        p => isValidObjectId(p.questionId) && isValidObjectId(p.moderatorId),
      )
      .map(p => ({
        updateOne: {
          filter: { _id: new ObjectId(p.questionId) },
          update: {
            $set: {
              moderatorId: new ObjectId(p.moderatorId),
              updatedAt: new Date(),
            },
          },
        },
      }));
    if (!ops.length) return 0;
    const res = await this.QuestionCollection.bulkWrite(ops as any);
    return res.modifiedCount ?? 0;
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
    addText?: boolean,
  ): Promise<{ modifiedCount: number }> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const forbiddenFields = [
        '_id',
        'id',
        'createdAt',
        'updatedAt',
        'review_level_number',
        'submission',
        'statusOrder',
      ];

      if (!addText) {
        forbiddenFields.push('text');
      }

      for (const field of forbiddenFields) {
        delete (updates as any)[field];
      }

      if (updates.closedAt) {
        updates.closedAt = new Date(updates.closedAt);
      }

      const nextStatus = String((updates as any).status ?? '').toLowerCase();
      const isPassStatus = nextStatus === 'pass';
      if (isPassStatus) {
        const existingQuestion = await this.QuestionCollection.findOne(
          { _id: new ObjectId(questionId) },
          { projection: { passedAt: 1 }, session },
        );
        updates.isClosed = true;
        if (!existingQuestion?.passedAt) {
          updates.passedAt = new Date();
        } else {
          delete (updates as any).passedAt;
        }
      }

      if (updates.referenceQuestionId) {
        const rid = updates.referenceQuestionId as any;
        if (rid instanceof ObjectId) {
          // already correct
        } else if (rid?.buffer?.data) {
          updates.referenceQuestionId = new ObjectId(
            Buffer.from(rid.buffer.data),
          );
        } else {
          updates.referenceQuestionId = new ObjectId(String(rid));
        }
      }

      // Same normalisation for moderatorId — callers (e.g. the edit-question flow)
      // can send it back JSON-serialized as a { buffer: { data: [...] } } object;
      // coerce it to a real ObjectId so it isn't persisted as a Buffer.
      if ((updates as any).moderatorId) {
        const mid = (updates as any).moderatorId;
        if (mid instanceof ObjectId) {
          // already correct
        } else if (mid?.buffer?.data) {
          (updates as any).moderatorId = new ObjectId(Buffer.from(mid.buffer.data));
        } else {
          (updates as any).moderatorId = new ObjectId(String(mid));
        }
      }

      const contextValue = (updates as any).context;
      if (contextValue) {
        delete (updates as any).context;
      }

      // Test-question toggle: `isTesting: false` means "remove from testing" — drop
      // the flag entirely rather than persisting a `false`. `isTesting: true` is a
      // normal $set below (and the caller also sends isAutoAllocate: false alongside).
      const removeTestingFlag = (updates as any).isTesting === false;
      if (removeTestingFlag) {
        delete (updates as any).isTesting;
      }

      const updateOperation: any = { $set: { ...updates, updatedAt: new Date() } };

      if (removeTestingFlag) {
        updateOperation.$unset = { ...(updateOperation.$unset || {}), isTesting: '' };
      }

      if (contextValue) {
        const q = await this.QuestionCollection.findOne(
          { _id: new ObjectId(questionId) },
          { session },
        );
        if (q && q.contextId) {
          await this.ContextCollection.updateOne(
            { _id: q.contextId },
            { $set: { text: contextValue } },
            { session },
          );
        }
        // Unset the context field from the question document to ensure it uses the one from context collection
        (updateOperation as any).$unset = {
          ...((updateOperation as any).$unset || {}),
          context: 1,
        };
      }

      const result = await this.QuestionCollection.updateOne(
        { _id: new ObjectId(questionId) },
        updateOperation,
        { session },
      );

      // Keep the denormalised status on any moderator holding this question in sync.
      if (updates.status) {
        await this.syncModeratorAssignedStatus(questionId, updates.status, session);
      }

      if (updates.status === 'in-review') {
        const submission = await this.QuestionSubmissionCollection.findOne(
          { questionId: new ObjectId(questionId) },
          { session },
        );

        if (submission) {
          const history = submission.history || [];
          const queue = submission.queue || [];

          const lastHistory = history.at(-1);
          const lastUpdatedById = lastHistory?.updatedBy?.toString();

          if (lastUpdatedById && queue.length > 0) {
            const currentIndex = queue.findIndex(
              (id: any) => id?.toString() === lastUpdatedById,
            );

            //  If found, remove all users that come after this index
            if (currentIndex !== -1 && currentIndex < queue?.length - 1) {
              const remainingQueue = queue?.slice(0, currentIndex + 1);

              await this.QuestionSubmissionCollection.updateOne(
                { questionId: new ObjectId(questionId) },
                { $set: { queue: remainingQueue } },
                { session },
              );
            }
          }
        }
      }

      return { modifiedCount: result.modifiedCount };
    } catch (error) {
      throw new InternalServerError(
        `Error while updating Question: More info: ${error}`,
      );
    }
  }

  async updateThreadId(
    questionId: string,
    threadId: string,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    try {
      await this.init();
      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!threadId) {
        throw new BadRequestError('Invalid or missing threadId');
      }
      return await this.QuestionCollection.updateOne(
        { _id: new ObjectId(questionId) },
        { $set: { threadId: threadId, updatedAt: new Date() } },
        { session },
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while updating thread ID: More info: ${error}`,
      );
    }
  }

  async deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{ deletedCount: number }> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const result = await this.QuestionCollection.deleteOne(
        { _id: new ObjectId(questionId) },
        { session },
      );
      const result1 = await this.ReRouteCollection.deleteOne(
        { questionId: new ObjectId(questionId) },
        { session },
      );

      return { deletedCount: result.deletedCount };
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Question::, More/ ${error}`,
      );
    }
  }

  getAllocatedQuestionPage = reads.getAllocatedQuestionPage;

  async insertMany(questions: IQuestion[]): Promise<string[]> {
    await this.init();
    if (!Array.isArray(questions) || questions.length === 0) return [];
    try {
      const result = await this.QuestionCollection.insertMany(questions);
      if (!result.acknowledged) {
        throw new InternalServerError('Failed to insert questions');
      }
      const ids = Object.values(result.insertedIds).map((id: any) =>
        id.toString(),
      );
      return ids;
    } catch (error: any) {
      throw new InternalServerError(
        error?.message || 'Failed to insertMany questions',
      );
    }
  }

  async updateQuestionStatus(
    id: string,
    status: string,
    errorMessage?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const update: any = { status, updatedAt: new Date() };
    const nextStatus = String(status).toLowerCase();
    if (nextStatus === 'pass') {
      update.isClosed = true;
      const existingQuestion = await this.QuestionCollection.findOne(
        { _id: new ObjectId(id) },
        { projection: { passedAt: 1 }, session },
      );
      if (!existingQuestion?.passedAt) {
        update.passedAt = update.updatedAt;
      }
    }
    if (errorMessage) update.errorMessage = errorMessage;
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update },
      { session },
    );

    // Keep the denormalised status on any moderator holding this question in sync.
    await this.syncModeratorAssignedStatus(id, status as QuestionStatus, session);
  }

  /** Updates the denormalised status on whichever moderator currently holds this
   *  question in their assignedQuestionIds array (a question is held by at most one).
   *  No-op when no moderator holds it. Called from every question status-write path so
   *  the cron's free/busy decision stays accurate (e.g. in-review → re-routed frees the
   *  moderator; re-routed → in-review makes them busy again). */
  private async syncModeratorAssignedStatus(
    questionId: string,
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<void> {
    // Best-effort: this is a denormalised cache for free/busy. A failure here must not
    // break the primary question-status update; it self-heals on the next transition.
    try {
      await this.init();
      const qid = new ObjectId(questionId);
      await this.UsersCollection.updateOne(
        { 'assignedQuestionIds.questionId': qid } as any,
        {
          $set: {
            'assignedQuestionIds.$[entry].status': status,
            updatedAt: new Date(),
          },
        } as any,
        { arrayFilters: [{ 'entry.questionId': qid }], session },
      );
    } catch (err: any) {
      console.error(
        `[assignedQuestionIds] Failed to sync status for question ${questionId}:`,
        err?.message,
      );
    }
  }

  async getQuestionsByStatus(
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({ status }, { session }).toArray();
  }

  async getClosedQuestionsCount(isTrainingUser?: boolean, isAdmin?: boolean, session?: ClientSession): Promise<number> {
    await this.init();
    return await this.QuestionCollection.countDocuments(
      {
        status: 'closed',
        ...(!isAdmin && {
          ...(isTrainingUser
            ? { isTrainingQuestion: true }
            : {
              $or: [
                { isTrainingQuestion: false },
                { isTrainingQuestion: { $exists: false } },
              ],
            }),
        }),
      },
      { session },
    );
  }

  getYearAnalytics = analytics.getYearAnalytics;

  /**
   * get yearly analytics.
   * @param session -MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getTodayApproved = analytics.getTodayApproved;

  /** Diagnostic: closed questions in a window vs their answers. Surfaces the
   *  "count mismatch" — closed questions that DON'T have a final answer with a valid
   *  ObjectId `approvedBy` (the ones dropped from the moderator breakdown), with the
   *  reason (no answers / no final answer / final answer missing approver / approvedBy
   *  stored as a non-ObjectId). */
  getClosedAnswerMismatch = analytics.getClosedAnswerMismatch;

  getQuestionSourceBreakdown = analytics.getQuestionSourceBreakdown;

  getQuestionsAnsweredWithin120Minutes = analytics.getQuestionsAnsweredWithin120Minutes;

  //get questions answered after 120 minutes
  getQuestionsAnsweredAfter120Minutes = analytics.getQuestionsAnsweredAfter120Minutes;

  //get questions state breakedown
  getQuestionStateBreakdown = analytics.getQuestionStateBreakdown;

  getAverageResponseTime = analytics.getAverageResponseTime;

  getMonthAnalytics = analytics.getMonthAnalytics;

  getWeekAnalytics = analytics.getWeekAnalytics;

  getDailyAnalytics = analytics.getDailyAnalytics;

  getCustomRangeAnalytics = analytics.getCustomRangeAnalytics;

  getCountBySource = analytics.getCountBySource;

  getQuestionOverviewByStatus = analytics.getQuestionOverviewByStatus;

  getQuestionAnalytics = analytics.getQuestionAnalytics;

  getModeratorApprovalRate = analytics.getModeratorApprovalRate;
  async getAll(session?: ClientSession): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({}, { session })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getByStatus(
    status: IQuestion['status'],
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({ status }, { session })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async bulkDeleteByIds(
    questionIds: string[],
    session?: ClientSession,
  ): Promise<{ deletedCount: number }> {
    await this.init();

    const objectIds = questionIds.map(id => new ObjectId(id));
    const result = await this.QuestionCollection.deleteMany(
      { _id: { $in: objectIds } },
      { session },
    );

    return {
      deletedCount: result.deletedCount ?? 0,
    };
  }

  getQuestionsAndReviewLevel = reads.getQuestionsAndReviewLevel;

  async findByDateRangeAndSource(
    startDate: Date,
    endDate: Date,
    sources: 'AJRASAKHA',
  ): Promise<IQuestion[]> {
    await this.init();
    const questions = await this.QuestionCollection.find(
      {
        source: sources,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
      {
        projection: {
          userId: 0,
          contextId: 0,
        },
      },
    )
      .sort({ createdAt: -1 })
      .toArray();
    return questions.map(q => ({
      ...q,
      _id: q._id?.toString(),
    }));
  }
  getMonthlyQuestionStats = analytics.getMonthlyQuestionStats;

  async getQuestionsByFilters(
    filters: any,
    session?: ClientSession,
    useDuplicateCollection = false,
    limit?: number,
  ): Promise<IQuestion[]> {
    await this.init();

    // for duplicate question
    //  useDuplicateCollection
    //   ? this.DuplicateQuestionCollection
    //   :
    const collection = this.QuestionCollection;

    let query = collection.find(filters, { session }).sort({ createdAt: -1 });

    if (limit) {
      query = query.limit(limit);
    }

    return await query.toArray();
  }
  async getAllQuestionEmbeddings(
    session?: ClientSession,
  ): Promise<{ _id: ObjectId; embedding: number[] }[]> {
    const results = await this.QuestionCollection.find(
      { embedding: { $exists: true, $ne: [] } },
      { projection: { _id: 1, embedding: 1 }, session },
    ).toArray();

    return results.map(doc => ({
      _id: typeof doc._id === 'string' ? new ObjectId(doc._id) : doc._id,
      embedding: doc.embedding || [],
    }));
  }
  async findTopSimilarQuestions(
    embedding: number[],
    k = 5,
    filter?: {
      state?: string;
      district?: string;
      crop?: string;
      domain?: string;
      season?: string;
    },
    session?: ClientSession,
  ): Promise<(ISimilarQuestion & { _vectorSearchScore: number })[]> {
    await this.init();

    const vectorSearchFilter: Record<string, string> = {};
    if (filter?.state) {
      vectorSearchFilter['details.state'] = filter.state;
    }
    if (filter?.district) {
      vectorSearchFilter['details.district'] = filter.district;
    }
    if (filter?.crop) {
      vectorSearchFilter['details.crop'] = filter.crop;
    }
    if (filter?.domain) {
      vectorSearchFilter['details.domain'] = filter.domain;
    }
    if (filter?.season) {
      vectorSearchFilter['details.season'] = filter.season;
    }

    const vectorSearchStage: any = {
      index: 'review_questions_vector_index', // your Atlas Vector Search index name
      path: 'embedding', // field storing the embeddings
      queryVector: embedding,
      numCandidates: k * 10, // recommended: 10x of k for better recall
      limit: k,
    };

    if (Object.keys(vectorSearchFilter).length > 0) {
      vectorSearchStage.filter = vectorSearchFilter;
    }

    const topSimilar = await this.QuestionCollection.aggregate(
      [
        {
          $vectorSearch: vectorSearchStage,
        },
        {
          $project: {
            _id: 1,
            question: 1,
            embedding: 1,
            details: 1,
            status: 1,
            // add other fields you need
            _vectorSearchScore: { $meta: 'vectorSearchScore' },
          },
        },
      ],
      { session },
    ).toArray();

    return topSimilar as any;
  }

  // Backfill normalised_crop (OPTIMIZED)
  async backfillNormalisedCrop(
    name: string,
    aliases: string[],
  ): Promise<number> {
    await this.init();

    const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const allValues = [name, ...(aliases || [])].map(v =>
      v.toLowerCase().trim(),
    );

    const conditions = allValues.map(val => ({
      'details.crop': { $regex: `^\\s*${escapeRegex(val)}\\s*$`, $options: 'i' },
    }));

    const result = await this.QuestionCollection.updateMany(
      {
        $and: [
          { $or: conditions },
          {
            $or: [
              { 'details.normalised_crop': { $exists: false } },
              { 'details.normalised_crop': null },
            ],
          },
        ],
      },
      {
        $set: {
          'details.normalised_crop': name.trim().toLowerCase(),
        },
      },
    );

    return result.modifiedCount;
  }

  getQuestionsWithAnswerDetails = reads.getQuestionsWithAnswerDetails;

  getQuestionStatusSummary = analytics.getQuestionStatusSummary;

  getPAEMetrics = analytics.getPAEMetrics;

  async count(filter = {}) {
    await this.init();
    return await this.QuestionCollection.countDocuments(filter);
  }

  async getQuestionsWithEmptyEmbeddings(
    limit = 50,
  ): Promise<{ _id: ObjectId; question: string; text?: string }[]> {
    await this.init();

    return this.QuestionCollection.find(
      {
        $or: [
          { embedding: { $exists: false } },
          { embedding: null },
          { embedding: { $size: 0 } },
        ],
      },
      { projection: { _id: 1, question: 1, text: 1 }, limit },
    ).toArray() as Promise<{ _id: ObjectId; question: string; text?: string }[]>;
  }

  async updateQuestionEmbedding(
    questionId: string,
    embedding: number[],
  ): Promise<void> {
    await this.init();
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      { $set: { embedding, updatedAt: new Date() } },
    );
  }

  getShiftBasedMetrics = analytics.getShiftBasedMetrics;

  getShiftBasedTrends = analytics.getShiftBasedTrends;

  getQuestionStatusDistribution = analytics.getQuestionStatusDistribution;

  getQuestionLevelDistribution = analytics.getQuestionLevelDistribution;

  getShiftBasedTopExperts = analytics.getShiftBasedTopExperts;

  getShiftBasedTopApprovingExperts = analytics.getShiftBasedTopApprovingExperts;

  /** Returns in-review questions with no moderator assigned yet, ordered oldest first. */
  findUnassignedInReviewQuestions = queue.findUnassignedInReviewQuestions;

  /** Questions currently assigned to a moderator (moderatorId set). Includes
   *  in-review, re-routed, duplicate and pae_submitted statuses — mirrors the
   *  moderator-assigned tab filter, so re-routed questions (which always carry a
   *  moderatorId) show up here too. Oldest first. */
  findModeratorAssignedQuestions = queue.findModeratorAssignedQuestions;

  /** Mark ONE feedback source's entry (DATASET / WEB_APPLICATION / PAE_Validation) as
   *  closed on the question, then report whether EVERY feedback entry is now closed.
   *  Used so a reviewer's feedbacksAssigned id is removed and the review round is
   *  finished only once ALL feedback statuses are closed — not just the one acted on. */
  closeFeedbackSourceAndCheckAll = queue.closeFeedbackSourceAndCheckAll;

  findQuestionsWithOpenFeedbacks = queue.findQuestionsWithOpenFeedbacks;

  /** Sets or clears moderatorId on a question document. Also stamps moderatorAssignedAt when assigning. */
  updateModeratorId = queue.updateModeratorId;

  /** Unassigned questions in the given statuses eligible for role auto-allocation
   *  (gate keeper / auditor). Returns oldest-first questions whose assignee field is
   *  null/missing and whose autoAllocate flag is not explicitly false. */
  findUnassignedQuestionsForRole = queue.findUnassignedQuestionsForRole;

  /** Questions created in a window, for the TAT (turnaround-time) lifecycle report.
   *  Mirrors scripts/timebound-question-cycle-report.js: default scope is time-bound
   *  (AJRASAKHA/WHATSAPP + isAutoAllocate), test questions excluded. `allSources` drops
   *  the time-bound filter; `closedOnly` restricts to closed statuses. Oldest-first. */
  findQuestionsForTatReport = queue.findQuestionsForTatReport;

  /** Questions currently assigned to a given role assignee (gateKeeperId / auditorId),
   *  restricted to the statuses that role handles. Used to compute per-user busy state. */
  findQuestionsAssignedToRole = queue.findQuestionsAssignedToRole;

  /** "Leaked" role assignments: a question still points to a gate keeper / auditor
   *  (assigneeField set) and hasn't been marked finished (finishedAtField null/missing),
   *  yet its status has moved OUT of that role's handling scope (e.g. pushed to auditor).
   *  Used by the queue cron to free assignees whose post-commit release was missed. */
  findLeakedRoleAssignments = queue.findLeakedRoleAssignments;

  /** Dashboard data for a gate keeper / auditor: the total questions ever assigned to
   *  them (assigneeField == userId), how many they've submitted (finishedAt set), and a
   *  paginated list of those questions (newest assignment first, optional text search).
   *  Supports optional date range filtering by assigned date, completed date, or both. */
  getRoleAssigneeDashboard = queue.getRoleAssigneeDashboard;

  /** Sets or clears a role assignee (gateKeeperId / auditorId) and its assignedAt
   *  timestamp on a question. Resets the matching finishedAt (a new/removed assignment
   *  starts a fresh turn). */
  setRoleAssignee = queue.setRoleAssignee;

  /** Stamps the finished-at time for a role assignee (gate keeper / auditor) when they
   *  act on the question. The assignee id is intentionally kept for history. */
  markRoleFinished = queue.markRoleFinished;
  /** One page (skip/limit) + exact total for a Queue-Details question section.
   *  kind: 'received' | 'allocated' | 'autoOff'. Status scope: open/delayed/duplicate.
   *  Optional createdAt range (startTime/endTime) scopes every kind by date. */
  getQueueQuestionSection = queue.getQueueQuestionSection;

  /** Per-status counts for the "Questions Received" section.
   *  Uses the same receivedMatch as getQueueQuestionSection so the totals are
   *  always in sync. Returns an array sorted by count descending. */
  getReceivedStatusCounts = queue.getReceivedStatusCounts;

  getCountByStatus = queue.getCountByStatus;

  //add or update feedback status of the question
  addOrUpdateFeedbackStatus = queue.addOrUpdateFeedbackStatus;

  // ─────────────────────────────────────────────────────────────────────────────
  // PAE Validation Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /** Find all questions with paeValidation status of 'pending' that are ready for
   *  PAE expert validation. Questions are sorted by createdAt in ascending order
   *  (oldest first).
   */
  findQuestionsPendingPaeValidation = queue.findQuestionsPendingPaeValidation;

  /** Update the paeValidation status on a question. */
  updatePaeValidationStatus = queue.updatePaeValidationStatus;

  /** Update the paeValidation array in the question's submission document.
   *  Pushes a new PAE validation entry to the paeValidation array.
   */
  addPaeValidationEntry = queue.addPaeValidationEntry;

  /**
   * Adds a feedback entry to the question's feedbacks array.
   * Updates recentFeedback timestamp only if:
   * - There is no existing open feedback, OR
   * - All existing feedbacks are closed (meaning this is the first/recent open feedback)
   */
  addFeedback = queue.addFeedback;

  /** Find questions by their IDs with pagination, joining final answers in a single aggregation pipeline.
   *  Uses $lookup to join with answers collection and get the final answer with sources.
   */
  findByIdsWithAnswers = queue.findByIdsWithAnswers;

  findQuestionsWithOpenPaeValidation = queue.findQuestionsWithOpenPaeValidation;
}

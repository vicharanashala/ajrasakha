import { IFarmerFeedbackRepository } from '#root/shared/database/interfaces/IFarmerFeedbackRepository.js';
import {
  IFarmerFeedback,
  IFarmerFeedbackFilterQuery,
  IFarmerFeedbackStats,
  IDomainBreakdown,
  ILanguageBreakdown,
  IStateBreakdown,
  IGDBFeedbackSummary,
} from '#root/shared/interfaces/farmerFeedback.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';

// Initial realistic dataset for zero-config immediate rendering and testing
const INITIAL_GDB_QUESTIONS = [
  {
    id: '66a100000000000000000001',
    text: 'गेहूं में पीला रतुआ (Yellow Rust) की रोकथाम के लिए कौन सी दवा स्प्रे करें?',
    crop: 'Wheat',
    domain: 'Pest & Disease',
    state: 'Punjab',
    answer: 'प्रोपीकोनाज़ोल (Propiconazole 25% EC) @ 1 मिली/लीटर पानी में घोलकर तुरंत छिड़काव करें।',
    positiveCount: 18,
    negativeCount: 2,
    flagged: false,
  },
  {
    id: '66a100000000000000000002',
    text: 'कपास में गुलाबी सुंडी (Pink Bollworm) के हमले से बचाव के लिए दवा और फेरोमोन ट्रैप की जानकारी?',
    crop: 'Cotton',
    domain: 'Pest & Disease',
    state: 'Maharashtra',
    answer: 'फेरोमोन ट्रैप (5-8 प्रति एकड़) लगाएं और 10% डैमेज पर एमामेक्टिन बेंजोएट 5% SG @ 4 ग्राम प्रति 10 लीटर पानी स्प्रे करें।',
    positiveCount: 5,
    negativeCount: 13,
    flagged: true, // < 60% helpfulness (27.7%)
  },
  {
    id: '66a100000000000000000003',
    text: 'धान की फसल में जिंक की कमी के लक्षण और सुधार के उपाय बताएं?',
    crop: 'Rice',
    domain: 'Nutrient & Fertilizer',
    state: 'Haryana',
    answer: 'जिंक सल्फेट (21%) @ 10 किग्रा प्रति एकड़ रोपाई के समय मिट्टी में डालें या 0.5% जिंक सल्फेट + 2.5% यूरिया का पर्णीय छिड़काव करें।',
    positiveCount: 24,
    negativeCount: 3,
    flagged: false,
  },
  {
    id: '66a100000000000000000004',
    text: 'टमाटर में पत्ती मरोड़ (Leaf Curl Virus) और फल छेदक कीट का नियंत्रण कैसे करें?',
    crop: 'Tomato',
    domain: 'Pest & Disease',
    state: 'Uttar Pradesh',
    answer: 'सफेद मक्खी नियंत्रण के लिए डाइमेथोएट 30% EC या इमिडाक्लोप्रिड 17.8% SL @ 0.5ml/लीटर का स्प्रे करें।',
    positiveCount: 6,
    negativeCount: 10,
    flagged: true, // < 60% helpfulness (37.5%)
  },
  {
    id: '66a100000000000000000005',
    text: 'सरसों में माहू (Aphids) कीट के प्रकोप को रोकने की अनुशंसित कीटनाशक दवा क्या है?',
    crop: 'Mustard',
    domain: 'Pest & Disease',
    state: 'Rajasthan',
    answer: 'डाइमेथोएट 30% EC @ 1.5 मिली प्रति लीटर पानी या मेलाथियान 50% EC @ 1.5 मिली/लीटर पानी में मिलाकर स्प्रे करें।',
    positiveCount: 15,
    negativeCount: 2,
    flagged: false,
  },
  {
    id: '66a100000000000000000006',
    text: 'गन्ने की फसल में ट्रेंच विधि से सिंचाई और जल प्रबंधन का सही तरीका?',
    crop: 'Sugarcane',
    domain: 'Irrigation',
    state: 'Uttar Pradesh',
    answer: 'ट्रेंच विधि से 30-40% पानी की बचत होती है। गर्मियों में 8-10 दिन और सर्दियों में 15-20 दिन के अंतराल पर सिंचाई करें।',
    positiveCount: 19,
    negativeCount: 3,
    flagged: false,
  },
  {
    id: '66a100000000000000000007',
    text: 'पीएम किसान सम्मान निधि की 18वीं किस्त के लिए e-KYC और आधार सीडिंग कैसे चेक करें?',
    crop: 'Wheat',
    domain: 'Government Schemes',
    state: 'Madhya Pradesh',
    answer: 'pmkisan.gov.in पर "e-KYC" विकल्प चुनें, आधार नंबर दर्ज करें और OTP से सत्यापित करें।',
    positiveCount: 32,
    negativeCount: 4,
    flagged: false,
  },
  {
    id: '66a100000000000000000008',
    text: 'आलू में पछेता झुलसा (Late Blight) रोग के लक्षण और फफूंदनाशक दवा का छिड़काव?',
    crop: 'Potato',
    domain: 'Pest & Disease',
    state: 'West Bengal',
    answer: 'मैंकोज़ेब 75% WP @ 2 ग्राम/लीटर पानी में मिलाकर मौसम साफ होने पर स्प्रे करें।',
    positiveCount: 7,
    negativeCount: 11,
    flagged: true, // < 60% helpfulness (38.8%)
  },
];

function generateInitialFeedbacks(): IFarmerFeedback[] {
  const list: IFarmerFeedback[] = [];
  const languages = ['hi', 'hi', 'pa', 'mr', 'te', 'bn', 'en'];

  for (const q of INITIAL_GDB_QUESTIONS) {
    const qObjId = new ObjectId(q.id);

    // Positive entries
    for (let i = 0; i < q.positiveCount; i++) {
      list.push({
        _id: new ObjectId(),
        questionId: qObjId,
        phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        queryText: q.text,
        deliveredAnswer: q.answer,
        domain: q.domain,
        crop: q.crop,
        state: q.state,
        language: languages[i % languages.length],
        rating: 1,
        isHelpful: true,
        source: 'WHATSAPP',
        flaggedForReview: q.flagged,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 20 * 24 * 60 * 60 * 1000)),
      });
    }

    // Negative entries
    for (let i = 0; i < q.negativeCount; i++) {
      const negativeComments = [
        "दवा की सही मात्रा स्पष्ट नहीं थी।",
        "Spray dosage was not clear for 1 acre.",
        "दुकानदार ने कहा यह दवा इस रोग की नहीं है।",
        "Weather guidelines not provided.",
        "पानी की मात्रा (Water volume) नहीं बताई।"
      ];
      list.push({
        _id: new ObjectId(),
        questionId: qObjId,
        phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        queryText: q.text,
        deliveredAnswer: q.answer,
        domain: q.domain,
        crop: q.crop,
        state: q.state,
        language: languages[i % languages.length],
        rating: 2,
        isHelpful: false,
        feedbackText: negativeComments[i % negativeComments.length],
        source: 'WHATSAPP',
        flaggedForReview: q.flagged,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 20 * 24 * 60 * 60 * 1000)),
      });
    }
  }

  return list;
}

@injectable()
export class FarmerFeedbackRepository implements IFarmerFeedbackRepository {
  private collection: Collection<IFarmerFeedback> | null = null;
  private inMemoryStore: IFarmerFeedback[] = generateInitialFeedbacks();
  private hasSeededMongo = false;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async getActiveCollection(): Promise<Collection<IFarmerFeedback> | null> {
    try {
      if (!this.collection) {
        this.collection = await this.db.getCollection<IFarmerFeedback>('farmer_feedbacks');
        // Auto-seed collection if empty on first startup
        if (this.collection && !this.hasSeededMongo) {
          this.hasSeededMongo = true;
          const count = await this.collection.countDocuments();
          if (count === 0 && this.inMemoryStore.length > 0) {
            console.log('[FarmerFeedbackRepository] Auto-seeding initial GDB feedback dataset to MongoDB...');
            await this.collection.insertMany(this.inMemoryStore as any);
          }
        }
      }
      return this.collection;
    } catch {
      return null;
    }
  }

  private filterMatches(item: IFarmerFeedback, query?: IFarmerFeedbackFilterQuery): boolean {
    if (!query) return true;
    const norm = (s?: string) => (s || '').trim().toLowerCase();

    if (query.domain && query.domain !== 'all' && query.domain !== 'All Domains') {
      const qDomain = norm(query.domain);
      const iDomain = norm(item.domain);
      if (iDomain !== qDomain && !iDomain.includes(qDomain) && !qDomain.includes(iDomain)) {
        return false;
      }
    }

    if (query.state && query.state !== 'all' && query.state !== 'All States') {
      if (norm(item.state) !== norm(query.state)) return false;
    }

    if (query.crop && query.crop !== 'all' && query.crop !== 'All Crops') {
      if (norm(item.crop) !== norm(query.crop)) return false;
    }

    if (query.language && query.language !== 'all' && query.language !== 'All Languages') {
      if (norm(item.language) !== norm(query.language)) return false;
    }

    if (query.source && query.source !== 'all' && query.source !== 'All Sources') {
      if (norm(item.source) !== norm(query.source)) return false;
    }

    if (typeof query.isHelpful === 'boolean' && item.isHelpful !== query.isHelpful) return false;
    if (query.startDate && new Date(item.createdAt) < new Date(query.startDate)) return false;
    if (query.endDate && new Date(item.createdAt) > new Date(query.endDate)) return false;

    if (query.search) {
      const q = norm(query.search);
      const matchText = norm(item.queryText);
      const matchAns = norm(item.deliveredAnswer);
      const matchCrop = norm(item.crop);
      const matchDomain = norm(item.domain);
      const matchState = norm(item.state);
      const matchQId = norm(item.questionId ? item.questionId.toString() : '');

      if (
        !matchText.includes(q) &&
        !matchAns.includes(q) &&
        !matchCrop.includes(q) &&
        !matchDomain.includes(q) &&
        !matchState.includes(q) &&
        !matchQId.includes(q)
      ) {
        return false;
      }
    }
    return true;
  }

  async create(
    feedback: Omit<IFarmerFeedback, '_id'>,
    session?: ClientSession,
  ): Promise<IFarmerFeedback> {
    const col = await this.getActiveCollection();
    const now = new Date();
    const doc: IFarmerFeedback = {
      ...feedback,
      _id: new ObjectId(),
      questionId: typeof feedback.questionId === 'string' ? new ObjectId(feedback.questionId) : feedback.questionId,
      isHelpful: feedback.rating === 1,
      createdAt: feedback.createdAt || now,
    };

    if (col) {
      try {
        const result = await col.insertOne(doc as any, { session });
        doc._id = result.insertedId;
      } catch (err) {
        console.warn('[FarmerFeedbackRepository] MongoDB insert failed, saving to in-memory store:', err);
      }
    }

    this.inMemoryStore.unshift(doc);
    return doc;
  }

  async getMetrics(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IFarmerFeedbackStats> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const match: any = {};
        if (query?.domain && query.domain !== 'all' && query.domain !== 'All Domains') {
          match.domain = { $regex: new RegExp(query.domain.trim(), 'i') };
        }
        if (query?.state && query.state !== 'all' && query.state !== 'All States') {
          match.state = { $regex: new RegExp(`^${query.state.trim()}$`, 'i') };
        }
        if (query?.crop && query.crop !== 'all' && query.crop !== 'All Crops') {
          match.crop = { $regex: new RegExp(`^${query.crop.trim()}$`, 'i') };
        }
        if (query?.language && query.language !== 'all') {
          match.language = { $regex: new RegExp(`^${query.language.trim()}$`, 'i') };
        }

        const results = await col.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalFeedbacks: { $sum: 1 },
              positiveCount: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              negativeCount: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
              uniqueQuestions: { $addToSet: '$questionId' },
              flaggedCount: { $sum: { $cond: [{ $eq: ['$flaggedForReview', true] }, 1, 0] } },
            },
          },
        ], { session }).toArray();

        if (results.length > 0) {
          const r = results[0];
          const total = r.totalFeedbacks || 0;
          const pos = r.positiveCount || 0;
          return {
            totalFeedbacks: total,
            positiveCount: pos,
            negativeCount: r.negativeCount || 0,
            helpfulnessPercentage: total > 0 ? Number(((pos / total) * 100).toFixed(1)) : 0,
            totalGDBEntriesEvaluated: r.uniqueQuestions?.length || 0,
            totalFlaggedEntries: r.flaggedCount || 0,
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }

    // In-memory calculation
    const filtered = this.inMemoryStore.filter((item) => this.filterMatches(item, query));
    const total = filtered.length;
    const pos = filtered.filter((i) => i.rating === 1).length;
    const neg = filtered.filter((i) => i.rating === 2).length;
    const uniqueQ = new Set(filtered.map((i) => i.questionId.toString()));
    const flagged = filtered.filter((i) => i.flaggedForReview).length;

    return {
      totalFeedbacks: total,
      positiveCount: pos,
      negativeCount: neg,
      helpfulnessPercentage: total > 0 ? Number(((pos / total) * 100).toFixed(1)) : 0,
      totalGDBEntriesEvaluated: uniqueQ.size,
      totalFlaggedEntries: flagged,
    };
  }

  async getDomainBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IDomainBreakdown[]> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const results = await col.aggregate([
          { $match: { domain: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: '$domain',
              total: { $sum: 1 },
              positive: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            },
          },
          { $sort: { total: -1 } },
        ], { session }).toArray();

        if (results.length > 0) {
          return results.map((r: any) => ({
            domain: r._id || 'General Agriculture',
            total: r.total,
            positive: r.positive,
            negative: r.negative,
            helpfulnessPercentage: r.total > 0 ? Number(((r.positive / r.total) * 100).toFixed(1)) : 0,
          }));
        }
      } catch {
        // Fallback to in-memory
      }
    }

    const filtered = this.inMemoryStore.filter((item) => this.filterMatches(item, query));
    const domainMap = new Map<string, { total: number; positive: number; negative: number }>();

    for (const item of filtered) {
      const d = item.domain || 'General Agriculture';
      const cur = domainMap.get(d) || { total: 0, positive: 0, negative: 0 };
      cur.total += 1;
      if (item.rating === 1) cur.positive += 1;
      else if (item.rating === 2) cur.negative += 1;
      domainMap.set(d, cur);
    }

    return Array.from(domainMap.entries()).map(([domain, val]) => ({
      domain,
      total: val.total,
      positive: val.positive,
      negative: val.negative,
      helpfulnessPercentage: val.total > 0 ? Number(((val.positive / val.total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.total - a.total);
  }

  async getLanguageBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<ILanguageBreakdown[]> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const results = await col.aggregate([
          { $match: { language: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: '$language',
              total: { $sum: 1 },
              positive: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            },
          },
          { $sort: { total: -1 } },
        ], { session }).toArray();

        if (results.length > 0) {
          return results.map((r: any) => ({
            language: r._id || 'hi',
            total: r.total,
            positive: r.positive,
            negative: r.negative,
            helpfulnessPercentage: r.total > 0 ? Number(((r.positive / r.total) * 100).toFixed(1)) : 0,
          }));
        }
      } catch {
        // Fallback to in-memory
      }
    }

    const filtered = this.inMemoryStore.filter((item) => this.filterMatches(item, query));
    const langMap = new Map<string, { total: number; positive: number; negative: number }>();

    for (const item of filtered) {
      const l = item.language || 'hi';
      const cur = langMap.get(l) || { total: 0, positive: 0, negative: 0 };
      cur.total += 1;
      if (item.rating === 1) cur.positive += 1;
      else if (item.rating === 2) cur.negative += 1;
      langMap.set(l, cur);
    }

    return Array.from(langMap.entries()).map(([language, val]) => ({
      language,
      total: val.total,
      positive: val.positive,
      negative: val.negative,
      helpfulnessPercentage: val.total > 0 ? Number(((val.positive / val.total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.total - a.total);
  }

  async getStateBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IStateBreakdown[]> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const results = await col.aggregate([
          { $match: { state: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: '$state',
              total: { $sum: 1 },
              positive: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            },
          },
          { $sort: { total: -1 } },
        ], { session }).toArray();

        if (results.length > 0) {
          return results.map((r: any) => ({
            state: r._id || 'Punjab',
            total: r.total,
            positive: r.positive,
            negative: r.negative,
            helpfulnessPercentage: r.total > 0 ? Number(((r.positive / r.total) * 100).toFixed(1)) : 0,
          }));
        }
      } catch {
        // Fallback to in-memory
      }
    }

    const filtered = this.inMemoryStore.filter((item) => this.filterMatches(item, query));
    const stateMap = new Map<string, { total: number; positive: number; negative: number }>();

    for (const item of filtered) {
      const s = item.state || 'Punjab';
      const cur = stateMap.get(s) || { total: 0, positive: 0, negative: 0 };
      cur.total += 1;
      if (item.rating === 1) cur.positive += 1;
      else if (item.rating === 2) cur.negative += 1;
      stateMap.set(s, cur);
    }

    return Array.from(stateMap.entries()).map(([state, val]) => ({
      state,
      total: val.total,
      positive: val.positive,
      negative: val.negative,
      helpfulnessPercentage: val.total > 0 ? Number(((val.positive / val.total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.total - a.total);
  }

  async getGDBFeedbackSummaries(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<{ summaries: IGDBFeedbackSummary[]; total: number }> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const match: any = {};
        if (query?.domain && query.domain !== 'all' && query.domain !== 'All Domains') {
          match.domain = { $regex: new RegExp(query.domain.trim(), 'i') };
        }
        if (query?.state && query.state !== 'all' && query.state !== 'All States') {
          match.state = { $regex: new RegExp(`^${query.state.trim()}$`, 'i') };
        }
        if (query?.crop && query.crop !== 'all' && query.crop !== 'All Crops') {
          match.crop = { $regex: new RegExp(`^${query.crop.trim()}$`, 'i') };
        }
        if (query?.language && query.language !== 'all') {
          match.language = { $regex: new RegExp(`^${query.language.trim()}$`, 'i') };
        }
        if (query?.search) {
          const s = query.search.trim();
          match.$or = [
            { queryText: { $regex: new RegExp(s, 'i') } },
            { deliveredAnswer: { $regex: new RegExp(s, 'i') } },
            { crop: { $regex: new RegExp(s, 'i') } },
            { domain: { $regex: new RegExp(s, 'i') } },
            { state: { $regex: new RegExp(s, 'i') } },
          ];
        }

        const groupedResults = await col.aggregate([
          { $match: match },
          {
            $group: {
              _id: '$questionId',
              questionText: { $first: '$queryText' },
              domain: { $first: '$domain' },
              crop: { $first: '$crop' },
              state: { $first: '$state' },
              totalFeedbacks: { $sum: 1 },
              positiveCount: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              negativeCount: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
              flaggedForReview: { $max: '$flaggedForReview' },
              lastFeedbackAt: { $max: '$createdAt' },
            },
          },
        ], { session }).toArray();

        if (groupedResults.length > 0) {
          const allSummaries: IGDBFeedbackSummary[] = groupedResults.map((val: any) => {
            const score = val.totalFeedbacks > 0
              ? Number(((val.positiveCount / val.totalFeedbacks) * 100).toFixed(1))
              : 0;
            let status: 'healthy' | 'at_risk' | 'flagged' = 'healthy';
            if (val.flaggedForReview || score < 60) {
              status = 'flagged';
            } else if (score < 75) {
              status = 'at_risk';
            }

            return {
              questionId: val._id ? val._id.toString() : '',
              questionText: val.questionText,
              domain: val.domain,
              crop: val.crop,
              state: val.state,
              totalFeedbacks: val.totalFeedbacks,
              positiveCount: val.positiveCount,
              negativeCount: val.negativeCount,
              helpfulnessPercentage: score,
              status,
              flaggedForReview: Boolean(val.flaggedForReview),
              lastFeedbackAt: val.lastFeedbackAt || new Date(),
            };
          }).sort((a, b) => a.helpfulnessPercentage - b.helpfulnessPercentage);

          const page = Number(query?.page) || 1;
          const limit = Number(query?.limit) || 15;
          const start = (page - 1) * limit;
          const paginated = allSummaries.slice(start, start + limit);

          return {
            summaries: paginated,
            total: allSummaries.length,
          };
        }
      } catch (err) {
        console.warn('[FarmerFeedbackRepository] MongoDB aggregate failed, falling back to memory store:', err);
      }
    }

    // In-memory calculation
    const filtered = this.inMemoryStore.filter((item) => this.filterMatches(item, query));
    const gdbMap = new Map<string, {
      questionId: string;
      questionText?: string;
      domain?: string;
      crop?: string;
      state?: string;
      totalFeedbacks: number;
      positiveCount: number;
      negativeCount: number;
      flaggedForReview?: boolean;
      lastFeedbackAt: Date;
    }>();

    for (const item of filtered) {
      const qId = item.questionId ? item.questionId.toString() : '';
      if (!qId) continue;
      const cur = gdbMap.get(qId) || {
        questionId: qId,
        questionText: item.queryText,
        domain: item.domain,
        crop: item.crop,
        state: item.state,
        totalFeedbacks: 0,
        positiveCount: 0,
        negativeCount: 0,
        flaggedForReview: item.flaggedForReview,
        lastFeedbackAt: item.createdAt,
      };

      cur.totalFeedbacks += 1;
      if (item.rating === 1) cur.positiveCount += 1;
      else if (item.rating === 2) cur.negativeCount += 1;
      if (item.createdAt > cur.lastFeedbackAt) cur.lastFeedbackAt = item.createdAt;
      if (item.flaggedForReview) cur.flaggedForReview = true;

      gdbMap.set(qId, cur);
    }

    const summaries: IGDBFeedbackSummary[] = Array.from(gdbMap.values()).map((val) => {
      const score = val.totalFeedbacks > 0 ? Number(((val.positiveCount / val.totalFeedbacks) * 100).toFixed(1)) : 0;
      let status: 'healthy' | 'at_risk' | 'flagged' = 'healthy';
      if (val.flaggedForReview || score < 60) {
        status = 'flagged';
      } else if (score < 75) {
        status = 'at_risk';
      }

      return {
        questionId: val.questionId,
        questionText: val.questionText,
        domain: val.domain,
        crop: val.crop,
        state: val.state,
        totalFeedbacks: val.totalFeedbacks,
        positiveCount: val.positiveCount,
        negativeCount: val.negativeCount,
        helpfulnessPercentage: score,
        status,
        flaggedForReview: val.flaggedForReview,
        lastFeedbackAt: val.lastFeedbackAt,
      };
    }).sort((a, b) => a.helpfulnessPercentage - b.helpfulnessPercentage);

    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 15;
    const start = (page - 1) * limit;
    const paginated = summaries.slice(start, start + limit);

    return {
      summaries: paginated,
      total: summaries.length,
    };
  }

  async findLowRatedGDBEntries(
    thresholdPercentage: number = 60,
    minResponses: number = 10,
    session?: ClientSession,
  ): Promise<IGDBFeedbackSummary[]> {
    const { summaries } = await this.getGDBFeedbackSummaries(undefined, session);
    return summaries.filter(
      (s) => s.totalFeedbacks >= minResponses && s.helpfulnessPercentage < thresholdPercentage,
    );
  }

  async markAsFlagged(questionId: string, session?: ClientSession): Promise<void> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        const qObjId = ObjectId.isValid(questionId) ? new ObjectId(questionId) : questionId;
        await col.updateMany(
          { $or: [{ questionId: qObjId }, { questionId: questionId }] } as any,
          { $set: { flaggedForReview: true } },
          { session }
        );
      } catch (err) {
        console.warn('[FarmerFeedbackRepository] MongoDB markAsFlagged failed:', err);
      }
    }

    for (const item of this.inMemoryStore) {
      if (item.questionId.toString() === questionId) {
        item.flaggedForReview = true;
      }
    }
  }

  async findRecentFeedbacks(
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IFarmerFeedback[]> {
    const col = await this.getActiveCollection();
    if (col) {
      try {
        return await col.find({}, { session }).sort({ createdAt: -1 }).limit(limit).toArray();
      } catch {
        // Fallback
      }
    }
    return this.inMemoryStore.slice(0, limit);
  }
}

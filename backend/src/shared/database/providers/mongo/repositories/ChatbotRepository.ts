import {inject, injectable} from 'inversify';
import {Collection, ClientSession, ObjectId, MongoClient} from 'mongodb';
import {
  InternalServerError,
  BadRequestError,
  NotFoundError,
} from 'routing-controllers';
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
  PaginatedQueryCategoryQuestions,
  QueryCategoryQuestionType,
  WeeklySessionDurationEntry,
  DailyQueryCountEntry,
  WeeklyQueryCountEntry,
  UserDetailEntry,
  PaginatedUserDetails,
  ChatbotConversationData,
  UserDemographics,
  DemographicEntry,
  KccAndAgriAppStats,
  PlatformInstallEntry,
  DuplicateQuestionEntry,
  MonthlyQueryCountEntry,
  MonthlySessionDurationEntry,
  DistrictAnalyticsEntry,
  FeedbackData,
  ResponseAdherenceTable,
  UnverifiedUserEntry,
  WeatherConcernAnalyticsFilters,
  WeatherConcernAnalyticsResponse,
  FarmerHeatMapFilters,
  FarmerHeatMapLocationHierarchy,
  FarmerHeatMapResponse,
  FarmerHeatMapBucket,
  FarmerHeatMapRow,
  FarmerHeatMapMetricTotals,
  FarmerHeatMapQuestionDetail,
  CoordinatorDuplicateQuestionHeatMapResponse,
  CoordinatorDuplicateQuestionDetail,
  CoordinatorDuplicateQuestionLocationHierarchy,
  PaginatedFeedbackMessages,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {
  IQuestion,
  IQuestionSubmission,
  QuestionSource,
} from '#root/shared/interfaces/models.js';
import {MongoDatabase} from '../MongoDatabase.js';
import {getFirebaseAuth} from '#root/config/firebaseAdmin.js';

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {COORDINATOR_ROLES} from '#root/shared/constants/roles.js';
import {BLOCKS, VILLAGES} from '#root/metaData.js';
import {
  ILocationDistrict,
  ILocationState,
} from '#root/modules/lgd/interfaces/ILocationService.js';
// import { BLOCKS, VILLAGES } from '#root/metaData.js';
import {buildBaseQuestionMatch} from '#root/utils/dashboard-filters.js';
import {buildReviewTimeline} from '#root/utils/buildReviewTat.js';

const EXTERNAL_USER_ROLES = ['FARMER', ...COORDINATOR_ROLES] as const;

// const buildExternalUserMatch = () => ({
//   $or: [
//     {userRole: {$in: EXTERNAL_USER_ROLES}},
//     {role: {$in: COORDINATOR_ROLES}},
//   ],
// });

const buildExternalUserMatch = () => ({
  $or: [
    {userRole: {$in: EXTERNAL_USER_ROLES}},
    {userRole: {$in: COORDINATOR_ROLES}},
  ],
});

// const buildExternalJoinedUserMatch = (prefix: string) => ({
//   $or: [
//     {[`${prefix}.userRole`]: {$in: EXTERNAL_USER_ROLES}},
//     {[`${prefix}.role`]: {$in: COORDINATOR_ROLES}},
//   ],
// });

const buildExternalJoinedUserMatch = (prefix: string) => ({
  $or: [
    {[`${prefix}.userRole`]: {$in: EXTERNAL_USER_ROLES}},
    {[`${prefix}.userRole`]: {$in: COORDINATOR_ROLES}},
  ],
});

const isExternalUserRole = (userRole?: string, role?: string) =>
  EXTERNAL_USER_ROLES.includes(
    userRole as (typeof EXTERNAL_USER_ROLES)[number],
  ) || COORDINATOR_ROLES.includes(role as (typeof COORDINATOR_ROLES)[number]);

interface IUser {
  _id?: any;
  name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  firebaseUID?: string;
  password?: string;
  passwordChangedAt?: Date;
  refreshToken?: any[];
  role?: string;
  userRole?: string;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
  farmerProfile?: {
    farmerName?: string;
    age?: number;
    gender?: string;
    villageName?: string;
    blockName?: string;
    district?: string;
    state?: string;
    phoneNo?: string;
    languagePreference?: string;
    yearsOfExperience?: number;
    cropsCultivated?: string[];
    primaryCrop?: string;
    secondaryCrop?: string;
    awarenessOfKCC?: boolean;
    usesAgriApps?: boolean;
    highestEducatedPerson?: string;
    numberOfSmartphones?: number;
    platform?: string;
    platformHistory?: {os: string; timestamp: string}[];
    location?: {
      latitude: number;
      longitude: number;
    };
  };
  assignedTo?: ObjectId;
  assignedCoordinators?: ObjectId[];
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

export interface IActiveUser {
  _id: string;
  activeUsers: number;
}
[];

const WEATHER_CONCERNS = {
  rain: [
    'rain',
    'raining',
    'rainfall',
    'drizzle',
    'downpour',
    'shower',
    'showers',
    'light rain',
    'moderate rain',
    'rain water',
    'wet weather',
    'rain storm',
    'rain clouds',
    'rainy',
    'continuous rain',
    'scattered showers',
    'rain prediction',
    'rain alert',
    'rain warning',
    'unexpected rain',
  ],

  heavyRain: [
    'heavy rain',
    'very heavy rain',
    'extreme rain',
    'cloudburst',
    'intense rainfall',
    'torrential rain',
    'pouring rain',
    'heavy shower',
    'extreme rainfall',
    'excess rainfall',
    'rain havoc',
    'heavy downpour',
    'violent rain',
    'red alert rain',
    'orange alert rain',
    'severe rainfall',
  ],

  flood: [
    'flood',
    'flooding',
    'overflow',
    'inundation',
    'flash flood',
    'river overflow',
    'dam overflow',
    'water overflow',
    'submerged',
    'overflowing river',
    'flood water',
    'flood alert',
    'flood warning',
    'flooded area',
    'flood situation',
    'river flooding',
    'urban flooding',
    'water rising',
  ],

  waterlogging: [
    'waterlogging',
    'water logged',
    'stagnant water',
    'logged water',
    'water accumulation',
    'standing water',
    'drain blockage',
    'poor drainage',
    'water stagnation',
    'water filled roads',
    'road flooding',
    'drain overflow',
    'sewage overflow',
    'water on roads',
  ],

  heat: [
    'heat',
    'heatwave',
    'hot climate',
    'high heat',
    'extreme heat',
    'severe heat',
    'hot condition',
    'burning heat',
    'sun heat',
    'heat stress',
    'heat stroke',
    'high temperature',
    'summer heat',
    'scorching heat',
    'dry heat',
    'intense heat',
    'temperature rise',
  ],

  temperature: [
    'temperature',
    'degree',
    'degrees',
    'celsius',
    'fahrenheit',
    'temperature level',
    'temperature rise',
    'temperature drop',
    'high temperature',
    'low temperature',
    'normal temperature',
    'weather temperature',
    'temp',
    'heat level',
    'cold level',
  ],

  cold: [
    'cold',
    'cold weather',
    'low temperature',
    'chilly',
    'freezing',
    'winter cold',
    'cool climate',
    'cold wave',
    'severe cold',
    'extreme cold',
    'cold condition',
    'cold breeze',
    'low climate',
    'winter season',
    'cold air',
    'shivering cold',
    'cool weather',
  ],

  humidity: [
    'humidity',
    'humid',
    'moisture',
    'sticky weather',
    'air moisture',
    'high humidity',
    'low humidity',
    'humid climate',
    'humid weather',
    'sticky climate',
    'sweaty weather',
    'damp weather',
    'air dampness',
    'muggy weather',
  ],

  wind: [
    'wind',
    'windy',
    'gust',
    'air speed',
    'strong wind',
    'high wind',
    'wind speed',
    'wind pressure',
    'gusty wind',
    'air flow',
    'breeze',
    'strong breeze',
    'wind current',
    'wind alert',
    'storm wind',
  ],

  storm: [
    'storm',
    'thunderstorm',
    'lightning',
    'thunder',
    'electrical storm',
    'severe storm',
    'storm warning',
    'storm alert',
    'lightning strike',
    'thunder rain',
    'stormy weather',
    'hailstorm',
    'dust storm',
    'wind storm',
    'violent storm',
    'weather storm',
  ],

  cyclone: [
    'cyclone',
    'hurricane',
    'typhoon',
    'cyclonic storm',
    'cyclone alert',
    'cyclone warning',
    'severe cyclone',
    'storm surge',
    'coastal storm',
    'tropical storm',
    'depression',
    'deep depression',
    'cyclonic circulation',
    'whirlwind',
  ],

  monsoon: [
    'monsoon',
    'rainy season',
    'southwest monsoon',
    'northeast monsoon',
    'monsoon rain',
    'monsoon season',
    'monsoon arrival',
    'monsoon update',
    'seasonal rain',
    'heavy monsoon',
    'monsoon forecast',
    'monsoon clouds',
  ],

  frost: [
    'frost',
    'ice formation',
    'frostbite',
    'frozen weather',
    'ice layer',
    'icy condition',
    'ice crystals',
    'snow frost',
    'morning frost',
    'frost warning',
    'ground frost',
    'frost damage',
  ],

  hotWeather: [
    'hot weather',
    'very hot',
    'extremely hot',
    'boiling weather',
    'warm climate',
    'summer weather',
    'sunny weather',
    'harsh sunlight',
    'hot sun',
    'dry weather',
    'heat condition',
    'heat climate',
    'high atmospheric heat',
  ],

  moisture: [
    'moisture',
    'soil moisture',
    'water content',
    'soil wetness',
    'ground moisture',
    'moist soil',
    'dry soil',
    'soil dryness',
    'crop moisture',
    'air moisture',
    'water retention',
    'field moisture',
    'land moisture',
  ],
} as const;

const WEATHER_CONCERN_LABELS: Record<keyof typeof WEATHER_CONCERNS, string> = {
  rain: 'Rain',
  heavyRain: 'Heavy Rain',
  flood: 'Flood',
  waterlogging: 'Waterlogging',
  monsoon: 'Monsoon',
  heat: 'Heat',
  temperature: 'Temperature',
  cold: 'Cold',
  frost: 'Frost',
  hotWeather: 'Hot Weather',
  humidity: 'Humidity',
  moisture: 'Moisture',
  wind: 'Wind',
  storm: 'Storm',
  cyclone: 'Cyclone',
};

@injectable()
export class ChatbotRepository implements IChatbotRepository {
  private users!: Collection<IUser>;
  private conversations!: Collection<IConversation>;
  private messagesCollection!: Collection<any>;
  private sessionCollection!: Collection<any>;

  constructor(
    // @inject(GLOBAL_TYPES.analyticsDatabase) //vicharansahsa
    // private analyticsDb: AnalyticsMongoDatabase,

    @inject(GLOBAL_TYPES.annamanalyticsDatabase) //annamalytics
    private annamDb: AnnamDatabase,

    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  /*constructor(
    @inject(GLOBAL_TYPES.annamanalyticsDatabase)
    private analyticsDb: AnnamDatabase,
  ) {}*/

  private async init(source = 'annam') {
    const db =
      source === 'whatsapp'
        ? this.db
        : // : source === 'vicharanashala'
          // : this.analyticsDb
          this.annamDb;
    // const db = source === 'whatsapp' ? this.db: source === 'annam' ? this.annamDb : this.analyticsDb;
    this.users = await db.getCollection<IUser>('users');
    this.conversations = await db.getCollection<IConversation>('conversations');
    this.messagesCollection = await db.getCollection<any>('messages');
    this.sessionCollection = await db.getCollection<any>('sessions');
  }
  private annamMessagesCollection!: Collection<any>;

  private async initSecondDb() {
    this.annamMessagesCollection =
      await this.annamDb.getCollection<any>('messages');
  }
  private QuestionCollection: Collection<IQuestion>;
  private duplicateQuestionCollection: Collection<any>;
  private QuestionSubmissionsCollection: Collection<IQuestionSubmission>;
  private Reroutes: Collection<any>;
  private ReviewUsers: Collection<any>;
  private async initReviewSystem() {
    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
    this.duplicateQuestionCollection = await this.db.getCollection<any>(
      'duplicate_questions',
    );
    this.QuestionSubmissionsCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.Reroutes = await this.db.getCollection<any>('reroutes');
    this.ReviewUsers = await this.db.getCollection<any>('users');
  }

  private buildActiveSessionFilter(userIds: ObjectId[], now = new Date()) {
    return {
      user: {$in: userIds},
      revoked: {$ne: true},
      isRevoked: {$ne: true},
      status: {$nin: ['expired', 'invalid', 'revoked', 'inactive']},
      $and: [
        {
          $or: [{invalidatedAt: {$exists: false}}, {invalidatedAt: null}],
        },
        {
          $or: [
            {expiresAt: {$exists: false}},
            {expiresAt: null},
            {expiresAt: {$gt: now}},
          ],
        },
        {
          $or: [
            {expires: {$exists: false}},
            {expires: null},
            {expires: {$gt: now}},
          ],
        },
      ],
    };
  }

  private async attachActiveSessionCounts(
    users: UserDetailEntry[],
    session?: ClientSession,
  ): Promise<UserDetailEntry[]> {
    const userIds = users
      .map(user => user.userId)
      .filter(ObjectId.isValid)
      .map(userId => new ObjectId(userId));

    if (userIds.length === 0) {
      return users.map(user => ({...user, activeSessionCount: 0}));
    }

    const sessionCounts = await this.sessionCollection
      .aggregate(
        [
          {$match: this.buildActiveSessionFilter(userIds)},
          {$group: {_id: '$user', count: {$sum: 1}}},
        ],
        {session},
      )
      .toArray();
    const sessionCountMap = new Map(
      sessionCounts.map(entry => [String(entry._id), Number(entry.count)]),
    );

    return users.map(user => ({
      ...user,
      activeSessionCount: sessionCountMap.get(user.userId) ?? 0,
    }));
  }

  private DISTRICT_ALIASES: Record<string, string> = {
    // Jammu & Kashmir
    baramula: 'baramulla',
    'ladakh (leh)': 'leh',

    // Uttarakhand
    'naini tal': 'nainital',
    'dehra dun': 'dehradun',

    // Karnataka
    belgaum: 'belagavi',
    mysore: 'mysuru',
    tumkur: 'tumakuru',
    bagalkot: 'bagalkote',
    chikmagalur: 'chikkamagaluru',
    chamrajnagar: 'chamarajanagara',
    chamarajanagar: 'chamarajanagara',
    chamarajanagara: 'chamarajanagara',

    // Andhra Pradesh
    vishakhapatnam: 'visakhapatnam',
    anantapur: 'ananthapuramu',

    // Tealangana
    'komaram bheem asifabad': 'kumuram bheem asifabad',

    // Tamil Nadu
    tiruchchirappalli: 'tiruchirappalli',
    villupuram: 'viluppuram',

    // Maharashtra
    aurangabad: 'chhatrapati sambhajinagar',
    gondiya: 'gondia',

    // Odisha
    keonjhar: 'kendujhar',

    // Rajasthan
    chittaurgarh: 'chittorgarh',

    // Uttar Pradesh
    kanpur: 'kanpur nagar',

    // Punjab
    'sahibzada ajit singh nagar': 's.a.s nagar',
    'sahibzada ajit singh nagar (mohali)': 's.a.s nagar',

    mohali: 's.a.s nagar',

    's.a.s nagar': 's.a.s nagar',
    'sas nagar': 's.a.s nagar',
    's a s nagar': 's.a.s nagar',
  };

  private normalizeDistrictName(district?: string): string {
    if (!district) return '';

    let normalized = district
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\bdistrict\b/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    normalized = this.DISTRICT_ALIASES[normalized]?.toLowerCase() ?? normalized;

    return normalized;
  }

  private getDistrictVariants(district: string): string[] {
    const normalized = this.normalizeDistrictName(district);

    return Object.entries(this.DISTRICT_ALIASES)
      .filter(
        ([oldName, canonical]) =>
          this.normalizeDistrictName(oldName) === normalized ||
          this.normalizeDistrictName(canonical) === normalized,
      )
      .flatMap(([oldName, canonical]) => [oldName, canonical])
      .concat(district)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }

  private getEquivalentLocationNames(value: string): string[] {
    const normalized = this.normalizeDistrictName(value);
    const equivalents: Record<string, string[]> = {
      ananthapuramu: ['Ananthapuramu', 'Anantapur'],
      chamarajanagar: ['Chamarajanagar', 'Chamarajanagara'],
      baramulla: ['Baramulla', 'Baramula'],
    };

    return [...new Set([value, ...(equivalents[normalized] || [])])];
  }

  private matchesEquivalentLocation(
    actual: string | undefined,
    expectedValues: string[],
  ) {
    const normalizedActual = this.normalizeDistrictName(String(actual || ''));

    return expectedValues.some(
      expected =>
        normalizedActual === this.normalizeDistrictName(String(expected || '')),
    );
  }

  private isInvalidHeatMapLocation(value?: string | null) {
    const normalized = this.normalizeDistrictName(String(value || ''));
    const invalidValues = new Set([
      '',
      '-',
      'na',
      'n/a',
      'nil',
      'null',
      'test',
      'testing',
      'undefined',
      'unknown',
      'not specified',
    ]);

    return invalidValues.has(normalized);
  }
  private readonly coordinatorsRoles = COORDINATOR_ROLES;

  private async getSourceAdherenceStats(
    source: 'WHATSAPP' | 'AJRASAKHA',
    userType = 'all',
    startTime?: string,
    endTime?: string,
    dbSource?: string,
    session?: ClientSession,
  ): Promise<{
    questionAsked: number;
    closedQuestionsCount: number;
    passedQuestionsCount: number;
    answeredWithin120Min: number;
    averageResponseMinutes: number;
    inReviewCount: number;
    openCount: number;
    delayedCount: number;
    dynamicWeatherCount: number;
    dynamicMarketCount: number;
    dynamicSchemesCount: number;
    markedDuplicateGdbCount: number;
  }> {
    const matchQuery = buildBaseQuestionMatch(source);
    if (startTime || endTime) {
      matchQuery.createdAt = {};
      if (startTime) matchQuery.createdAt.$gte = new Date(startTime);
      if (endTime) matchQuery.createdAt.$lte = new Date(endTime);
    }

    const query = await this.buildQuestionUserTypeMatchQuery(
      dbSource,
      userType,
    );

    if (query && Object.keys(query).length > 0) {
      matchQuery.$and.push(query);
    }

    const result = await this.QuestionCollection.aggregate(
      [
        {$match: matchQuery},
        {
          $addFields: {
            _statusLower: {$toLower: {$ifNull: ['$status', '']}},
            _isGdbDuplicate: {
              $and: [
                {$eq: [{$toLower: {$ifNull: ['$status', '']}}, 'duplicate']},
                {
                  $regexMatch: {
                    input: {$ifNull: ['$referenceSource', '']},
                    regex: '^golden$',
                    options: 'i',
                  },
                },
              ],
            },
            _isDynamicCategory: {
              $regexMatch: {
                input: {
                  $concat: [
                    {
                      $cond: {
                        if: {$isArray: '$details.domain'},
                        then: {
                          $reduce: {
                            input: '$details.domain',
                            initialValue: '',
                            in: {$concat: ['$$value', ' ', '$$this']},
                          },
                        },
                        else: {$ifNull: ['$details.domain', '']},
                      },
                    },
                    ' ',
                    {$ifNull: ['$details.category', '']},
                    ' ',
                    {$ifNull: ['$question', '']},
                  ],
                },
                regex: '(weather|market|scheme|schemes)',
                options: 'i',
              },
            },
          },
        },
        {
          $addFields: {
            _isPassed: {$eq: ['$_statusLower', 'pass']},
            _operationalCompletionAt: {
              $switch: {
                branches: [
                  {
                    case: {$eq: ['$_statusLower', 'pass']},
                    then: '$passedAt',
                  },
                  {
                    case: '$_isGdbDuplicate',
                    then: '$passedAt',
                  },
                  {
                    case: {
                      $and: [
                        '$_isDynamicCategory',
                        {$ne: [{$ifNull: ['$passedAt', null]}, null]},
                      ],
                    },
                    then: '$passedAt',
                  },
                  {
                    case: {$eq: ['$_statusLower', 'closed']},
                    then: '$closedAt',
                  },
                ],
                default: null,
              },
            },
          },
        },
        // ...userTypeLookupStages,
        // ...userTypeLookupStages,
        {
          $facet: {
            questionAsked: [{$count: 'count'}],
            closedQuestions: [
              {
                $match: {
                  $or: [{_statusLower: 'closed'}, {_isPassed: true}],
                },
              },
              {$count: 'count'},
            ],
            passedQuestions: [
              {
                $match: {
                  _isPassed: true,
                },
              },
              {$count: 'count'},
            ],
            answeredWithin120Min: [
              {
                $match: {
                  _operationalCompletionAt: {$ne: null},
                },
              },
              {
                $match: {
                  $expr: {
                    $and: [
                      {$gte: ['$_operationalCompletionAt', '$createdAt']},
                      {
                        $lte: [
                          {
                            $subtract: [
                              '$_operationalCompletionAt',
                              '$createdAt',
                            ],
                          },
                          120 * 60 * 1000,
                        ],
                      },
                    ],
                  },
                },
              },
              {$count: 'count'},
            ],
            averageResponse: [
              {
                $match: {
                  _operationalCompletionAt: {$ne: null},
                },
              },
              {
                $match: {
                  $expr: {$gte: ['$_operationalCompletionAt', '$createdAt']},
                },
              },
              {
                $group: {
                  _id: null,
                  avgMinutes: {
                    $avg: {
                      $divide: [
                        {
                          $subtract: [
                            '$_operationalCompletionAt',
                            '$createdAt',
                          ],
                        },
                        60 * 1000,
                      ],
                    },
                  },
                },
              },
            ],
            inReview: [{$match: {status: 'in-review'}}, {$count: 'count'}],
            open: [{$match: {status: 'open'}}, {$count: 'count'}],
            delayed: [{$match: {status: 'delayed'}}, {$count: 'count'}],
            markedDuplicateGdb: [
              {
                $match: {
                  _isGdbDuplicate: true,
                },
              },
              {$count: 'count'},
            ],
            dynamicWeather: [
              {
                $match: {
                  status: 'dynamic',
                  $or: [
                    {'details.domain': /weather/i},
                    {'details.category': /weather/i},
                  ],
                },
              },
              {$count: 'count'},
            ],
            dynamicMarket: [
              {
                $match: {
                  status: 'dynamic',
                  $or: [
                    {'details.domain': /market/i},
                    {'details.category': /market/i},
                  ],
                },
              },
              {$count: 'count'},
            ],
            dynamicSchemes: [
              {
                $match: {
                  status: 'dynamic',
                  $or: [
                    {'details.domain': /scheme/i},
                    {'details.category': /scheme/i},
                  ],
                },
              },
              {$count: 'count'},
            ],
          },
        },
      ],
      {session},
    ).toArray();

    const row = result[0] ?? {};
    return {
      questionAsked: row.questionAsked?.[0]?.count ?? 0,
      closedQuestionsCount: row.closedQuestions?.[0]?.count ?? 0,
      passedQuestionsCount: row.passedQuestions?.[0]?.count ?? 0,
      answeredWithin120Min: row.answeredWithin120Min?.[0]?.count ?? 0,
      averageResponseMinutes: row.averageResponse?.[0]?.avgMinutes ?? 0,
      inReviewCount: row.inReview?.[0]?.count ?? 0,
      openCount: row.open?.[0]?.count ?? 0,
      delayedCount: row.delayed?.[0]?.count ?? 0,
      dynamicWeatherCount: row.dynamicWeather?.[0]?.count ?? 0,
      dynamicMarketCount: row.dynamicMarket?.[0]?.count ?? 0,
      dynamicSchemesCount: row.dynamicSchemes?.[0]?.count ?? 0,
      markedDuplicateGdbCount: row.markedDuplicateGdb?.[0]?.count ?? 0,
    };
  }

  async getResponseAdherenceTable(
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
    source = 'annam',
  ): Promise<ResponseAdherenceTable> {
    try {
      await this.init(source);
      await this.initReviewSystem();

      const [whatsapp, ajrasakha] = await Promise.all([
        this.getSourceAdherenceStats(
          'WHATSAPP',
          userType,
          startTime,
          endTime,
          source,
          session,
        ),
        this.getSourceAdherenceStats(
          'AJRASAKHA',
          userType,
          startTime,
          endTime,
          source,
          session,
        ),
      ]);
      const messageMatch: any = {isDeleted: {$ne: true}};
      if (startTime || endTime) {
        messageMatch.createdAt = {};
        if (startTime) messageMatch.createdAt.$gte = new Date(startTime);
        if (endTime) messageMatch.createdAt.$lte = new Date(endTime);
      }
      const adherenceMessageStats = await this.messagesCollection
        .aggregate(
          [
            {$match: messageMatch},
            ...this.buildUserTypeLookupStages(userType),
            {
              $addFields: {
                _sourceHint: {
                  $toUpper: {
                    $concat: [
                      {$ifNull: ['$source', '']},
                      ' ',
                      {$ifNull: ['$endpoint', '']},
                    ],
                  },
                },
                _sourceBucket: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $regexMatch: {
                            input: '$_sourceHint',
                            regex: 'WHATSAPP',
                          },
                        },
                        then: 'WHATSAPP',
                      },
                      {
                        case: {
                          $regexMatch: {
                            input: '$_sourceHint',
                            regex: 'WA\\b',
                          },
                        },
                        then: 'WHATSAPP',
                      },
                    ],
                    default: 'AJRASAKHA',
                  },
                },
              },
            },
            {
              $facet: {
                queryCounts: [
                  {
                    $match: {
                      sender: 'User',
                    },
                  },
                  {
                    $count: 'count',
                  },
                ],
                dynamicWeather: [
                  {
                    $match: {
                      'content.tool_call.name': {
                        $regex: 'weather',
                        $options: 'i',
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
                dynamicMarket: [
                  {
                    $match: {
                      'content.tool_call.name': {
                        $regex: 'market',
                        $options: 'i',
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
                dynamicSchemes: [
                  {
                    $match: {
                      'content.tool_call.name': {
                        $regex: '(scheme|schemes)',
                        $options: 'i',
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$_sourceBucket',
                      count: {$sum: 1},
                    },
                  },
                ],
              },
            },
          ],
          {session},
        )
        .toArray();
      const messageStats = adherenceMessageStats[0] ?? {};
      const queryCounts = messageStats.queryCounts ?? [];

      const whatsappDynamicWeather = whatsapp.dynamicWeatherCount;
      const ajrasakhaDynamicWeather = ajrasakha.dynamicWeatherCount;

      const whatsappDynamicMarket = whatsapp.dynamicMarketCount;
      const ajrasakhaDynamicMarket = ajrasakha.dynamicMarketCount;

      const whatsappDynamicSchemes = whatsapp.dynamicSchemesCount;
      const ajrasakhaDynamicSchemes = ajrasakha.dynamicSchemesCount;

      const totalUserMessages = queryCounts[0]?.count ?? 0;
      const whatsappQueriesAsked = 0;
      const ajrasakhaQueriesAsked = totalUserMessages;

      const whatsappAdherencePct =
        whatsapp.questionAsked > 0
          ? Math.round(
              (whatsapp.answeredWithin120Min / whatsapp.questionAsked) *
                100 *
                100,
            ) / 100
          : 0;
      const ajrasakhaAdherencePct =
        ajrasakha.questionAsked > 0
          ? Math.round(
              (ajrasakha.answeredWithin120Min / ajrasakha.questionAsked) *
                100 *
                100,
            ) / 100
          : 0;

      const startReference = startTime ? new Date(startTime) : new Date();
      const endReference = endTime ? new Date(endTime) : new Date();
      const startIst = new Date(
        startReference.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
      );
      const endIst = new Date(
        endReference.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
      );
      const hh = String(endIst.getHours()).padStart(2, '0');
      const mm = String(endIst.getMinutes()).padStart(2, '0');
      const date = startIst.toLocaleDateString('en-GB').split('/').join('-');
      const whatsappNonGdbWithin120 = whatsapp.closedQuestionsCount;
      const ajrasakhaNonGdbWithin120 = ajrasakha.closedQuestionsCount;

      return {
        date,
        time: `${hh}:${mm}`,
        timeWindow: `[00:00-${hh}:${mm}]`,
        whatsappQueriesAsked,
        ajrasakhaQueriesAsked,
        whatsappPushedToReviewer: whatsapp.questionAsked,
        ajrasakhaPushedToReviewer: ajrasakha.questionAsked,
        whatsappAnsweredWithin120Min: whatsapp.answeredWithin120Min,
        ajrasakhaAnsweredWithin120Min: ajrasakha.answeredWithin120Min,
        whatsappPassedQuestions: whatsapp.passedQuestionsCount,
        ajrasakhaPassedQuestions: ajrasakha.passedQuestionsCount,
        whatsappMarkedDuplicate: whatsapp.markedDuplicateGdbCount,
        ajrasakhaMarkedDuplicate: ajrasakha.markedDuplicateGdbCount,
        whatsappDynamicWeather,
        ajrasakhaDynamicWeather,
        whatsappDynamicMarket,
        ajrasakhaDynamicMarket,
        whatsappDynamicSchemes,
        ajrasakhaDynamicSchemes,
        whatsappNonGdbWithin120,
        ajrasakhaNonGdbWithin120,
        whatsappInReview: whatsapp.inReviewCount,
        ajrasakhaInReview: ajrasakha.inReviewCount,
        whatsappOpen: whatsapp.openCount,
        ajrasakhaOpen: ajrasakha.openCount,
        whatsappDelayed: whatsapp.delayedCount,
        ajrasakhaDelayed: ajrasakha.delayedCount,
        whatsappAverageResponseMinutes:
          Math.round(whatsapp.averageResponseMinutes * 100) / 100,
        ajrasakhaAverageResponseMinutes:
          Math.round(ajrasakha.averageResponseMinutes * 100) / 100,
        whatsappAdherencePct,
        ajrasakhaAdherencePct,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get response adherence table: ${error}`,
      );
    }
  }

  /**
   * Returns aggregation pipeline stages that join messages → users via $lookup
   * and filter by user type (external/internal). When userType is 'all', returns
   * an empty array (zero overhead). This replaces the old two-step pattern of
   * getExternalUserIds() + buildUserMessageFilter() which caused a separate DB
   * query for every method call.
   */
  // private buildUserTypeLookupStages(userType: string): any[] {
  //   if (userType === 'all') return [];

  //   const stages: any[] = [
  //     {
  //       $addFields: {
  //         _userOid: {
  //           $cond: [
  //             {$and: [{$ne: ['$user', null]}, {$ne: ['$user', '']}]},
  //             {$toObjectId: '$user'},
  //             null,
  //           ],
  //         },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: 'users',
  //         localField: '_userOid',
  //         foreignField: '_id',
  //         as: '_userDoc',
  //       },
  //     },
  //   ];

  //   if (userType === 'external') {
  //     // $unwind without preserveNull drops messages with no matching user (correct)
  //     stages.push(
  //       {$unwind: '$_userDoc'},
  //       {$match: {'_userDoc.email': {$regex: '^rup', $options: 'i'}}},
  //     );
  //   } else {
  //     // internal: preserve messages from unknown users, exclude 'rup' emails
  //     stages.push(
  //       {$unwind: {path: '$_userDoc', preserveNullAndEmptyArrays: true}},
  //       {$match: {'_userDoc.email': {$not: {$regex: '^rup', $options: 'i'}}}},
  //     );
  //   }

  //   stages.push({$unset: ['_userOid', '_userDoc']});
  //   return stages;
  // }

  // private buildUserDocFilter(userType: string): Record<string, any> {
  //   if (userType === 'all') return {};
  //   return userType === 'external'
  //     ? {email: {$regex: '^rup', $options: 'i'}}
  //     : {email: {$not: {$regex: '^rup', $options: 'i'}}};
  // }

  //without unwind
  private buildUserTypeLookupStages(userType: string, keepUserDoc: boolean = false): any[] {
    if (userType === 'all') return [];

    const userRoleMatch =
      userType === 'external'
        ? buildExternalJoinedUserMatch('_userDoc')
        : {
            '_userDoc.userRole': 'INTERNAL',
          };

    return [
      {
        $addFields: {
          _userOid: {
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
          localField: '_userOid',
          foreignField: '_id',
          as: '_userDoc',
        },
      },
      {
        $match: userRoleMatch,
      },
      {
        $unset: keepUserDoc ? ['_userOid'] : ['_userOid', '_userDoc'],
      },
    ];
  }

  private buildUserDocFilter(userType: string): Record<string, any> {
    if (userType === 'all') return {};
    if (userType === 'external') {
      return buildExternalUserMatch();
    }
    return {
      userRole: 'INTERNAL',
    };
  }

  /**
   * Transforms a user doc filter (potentially containing $or expressions)
   * to be applied on a joined document by prefixing field paths with the given prefix.
   * Handles special operators like $or by recursively transforming their conditions.
   */
  private buildJoinedUserDocFilter(
    userDocFilter: Record<string, any>,
    prefix: string,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(userDocFilter)) {
      if (key === '$or') {
        // Transform $or conditions by prefixing field paths
        const transformedOr = (value as any[]).map(condition => {
          const transformedCondition: Record<string, any> = {};
          for (const [field, fieldValue] of Object.entries(
            condition as Record<string, any>,
          )) {
            transformedCondition[`${prefix}.${field}`] = fieldValue;
          }
          return transformedCondition;
        });
        result['$or'] = transformedOr;
      } else {
        result[`${prefix}.${key}`] = value;
      }
    }

    return result;
  }

  // private buildQuestionUserTypeLookupStages(userType: string): any[] {
  //   if (userType === 'all') return [];

  //   const stages: any[] = [
  //     {
  //       $addFields: {
  //         _userOid: {
  //           $cond: [
  //             {$and: [{$ne: ['$userId', null]}, {$ne: ['$userId', '']}]},
  //             {$toObjectId: '$userId'},
  //             null,
  //           ],
  //         },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: 'users',
  //         localField: '_userOid',
  //         foreignField: '_id',
  //         as: '_userDoc',
  //       },
  //     },
  //   ];

  //   const userDocFilter = this.buildUserDocFilter(userType);
  //   const transformedFilter: Record<string, any> = {};
  //   for (const key of Object.keys(userDocFilter)) {
  //     transformedFilter[`_userDoc.${key}`] = userDocFilter[key];
  //   }

  //   if (userType === 'external') {
  //     stages.push({$unwind: '$_userDoc'}, {$match: transformedFilter});
  //   } else {
  //     stages.push(
  //       {$unwind: {path: '$_userDoc', preserveNullAndEmptyArrays: true}},
  //       {$match: transformedFilter},
  //     );
  //   }

  //   stages.push({$unset: ['_userOid', '_userDoc']});
  //   return stages;
  // }

  //without unwind
  // We were able to remove $unwind because _userDoc always contains at most one user
  // document (since we are joining on the unique _id field), and Mongo can directly
  //  match on array fields using _userDoc.userRole without first flattening the array.
  // private buildQuestionUserTypeLookupStages(userType: string): any[] {
  //   if (userType === 'all') return [];

  //   const userRoleMatch =
  //     userType === 'external'
  //       ? {
  //           '_userDoc.userRole': {
  //             $in: EXTERNAL_USER_ROLES,
  //           },
  //         }
  //       : {
  //           '_userDoc.userRole': 'INTERNAL',
  //         };

  //   return [
  //     {
  //       $addFields: {
  //         _userOid: {
  //           $cond: [
  //             {
  //               $and: [{$ne: ['$userId', null]}, {$ne: ['$userId', '']}],
  //             },
  //             {$toObjectId: '$userId'},
  //             null,
  //           ],
  //         },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: 'users',
  //         localField: '_userOid',
  //         foreignField: '_id',
  //         as: '_userDoc',
  //       },
  //     },
  //     {
  //       $match: userRoleMatch,
  //     },
  //     {
  //       $unset: ['_userOid', '_userDoc'],
  //     },
  //   ];
  // }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildExactTextRegex(
    value?: string,
  ): Record<string, string> | undefined {
    if (!value || value.trim().toLowerCase() === 'all') return undefined;
    return {
      $regex: `^${this.escapeRegex(value.trim())}$`,
      $options: 'i',
    };
  }

  private buildContainsTextRegex(
    value?: string,
  ): Record<string, string> | undefined {
    if (!value || value.trim().toLowerCase() === 'all') return undefined;
    return {
      $regex: this.escapeRegex(value.trim()),
      $options: 'i',
    };
  }

  private formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;

    return new Intl.DateTimeFormat('en', {month: 'long'}).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
  }

  async getKpiSummary(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<KpiSummary> {
    try {
      await this.init(source);

      // Use MongoDB $dateToString with IST timezone (+05:30) to correctly bucket months
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      // 3 days ago at midnight for inactive-user calculation
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);

      const userDocFilter = this.buildUserDocFilter(userType);
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const [
        totalUsers,
        monthlyActivity,
        sessionStats,
        todayQueryCount,
        totalAppInstalls,
        activeUsersLast3Days,
        usersWithFeedback,
      ] = await Promise.all([
        this.users.countDocuments(userDocFilter, {session}),

        // Group users by month in IST timezone using updatedAt
        this.users
          .aggregate(
            [
              {$match: userDocFilter},
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

        // Avg session duration from conversations (original logic — untouched)
        this.conversations
          .aggregate(
            [
              {
                $project: {
                  durationMs: {$subtract: ['$updatedAt', '$createdAt']},
                },
              },
              {$group: {_id: null, avg: {$avg: '$durationMs'}}},
            ],
            {session},
          )
          .toArray(),

        // Today's query count from messages
        this.getTodayQueryCount(source, session, userType),

        // this.users.countDocuments(
        //   {
        //     ...userDocFilter,
        //     'farmerProfile.farmerName': {$exists: true, $nin: [null, '']},
        //   },
        //   {session},
        // ),

        this.users.countDocuments(
          {
            ...userDocFilter,
            farmerProfile: {$exists: true, $ne: null},
            isVerified: true,
          },
          {session},
        ),

        // Count distinct users who sent messages in the last 3 days
        this.messagesCollection
          .aggregate(
            [
              {
                $match: {
                  createdAt: {$gte: threeDaysAgo},
                  isCreatedByUser: true,
                  isDeleted: {$ne: true},
                },
              },
              ...userTypeLookupStages,
              {$group: {_id: '$user'}},
              {$count: 'total'},
            ],
            {session},
          )
          .toArray(),

        // Count distinct users who have given at least one feedback (feedback object exists in any message)
        this.messagesCollection
          .aggregate(
            [
              {
                $match: {
                  feedback: {$exists: true},
                  isCreatedByUser: false,
                  isDeleted: {$ne: true},
                },
              },
              ...userTypeLookupStages,
              {$group: {_id: '$user'}},
              {$count: 'total'},
            ],
            {session},
          )
          .toArray(),
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
      const activeCount = (activeUsersLast3Days as any[])[0]?.total ?? 0;
      const feedbackCount = (usersWithFeedback as any[])[0]?.total ?? 0;

      await this.initReviewSystem();
      const matchQuery = buildBaseQuestionMatch(source);
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );
      // Count only duplicates that have a matching message in the selected source DB —
      // this matches exactly what getDuplicateQuestions returns in the modal.
      const dupeWithMsgId = await this.QuestionCollection.find({
        similarityScore: {$exists: true},
        messageId: {$exists: true, $ne: null},
        ...matchQuery,
        ...query,
      })
        .project<{messageId: string}>({messageId: 1})
        .toArray();

      const dupeMsgIds = dupeWithMsgId
        .map(q => q.messageId)
        .filter(Boolean) as string[];
      let duplicateQuestionsCount = 0;
      if (source === 'whatsapp') {
        duplicateQuestionsCount =
          await this.getWhatsAppDuplicateQuestionsCount();
      } else if (dupeMsgIds.length > 0) {
        const existingMessages = await this.messagesCollection
          .find({messageId: {$in: dupeMsgIds}, isDeleted: {$ne: true}})
          .project<{messageId: string}>({messageId: 1})
          .toArray();
        const existingMsgIdSet = new Set(
          existingMessages.map(m => m.messageId),
        );
        duplicateQuestionsCount = dupeWithMsgId.filter(q =>
          existingMsgIdSet.has(q.messageId),
        ).length;
      }

      // Construct matches based on startTime and endTime if provided
      // const queryMatch: any = {
      //   isCreatedByUser: true,
      //   isDeleted: {$ne: true},
      //   text: {$exists: true, $ne: null, $nin: ['', ' ']},
      // };
      // if (startTime || endTime) {
      //   queryMatch.createdAt = {};
      //   if (startTime) {
      //     queryMatch.createdAt.$gte = new Date(startTime);
      //   }
      //   if (endTime) {
      //     queryMatch.createdAt.$lte = new Date(endTime);
      //   }
      // }

      // // Calculate repeatQueryCount from messages (trim, lowercase, aggregate repeat counts)
      // let repeatQueryRaw;
      // if (source === 'whatsapp') {
      //   repeatQueryRaw = await this.QuestionCollection.aggregate(
      //     [
      //       {
      //         $match: {
      //           source: 'WHATSAPP',

      //           ...(queryMatch.createdAt && {
      //             createdAt: queryMatch.createdAt,
      //           }),
      //         },
      //       },
      //       {
      //         $group: {
      //           _id: {
      //             $ifNull: ['$referenceQuestionId', '$_id'],
      //           },
      //           count: {
      //             $sum: 1,
      //           },
      //         },
      //       },
      //       {
      //         $match: {
      //           count: {
      //             $gt: 1,
      //           },
      //         },
      //       },
      //       {
      //         $group: {
      //           _id: null,
      //           totalRepeats: {
      //             $sum: {
      //               $subtract: ['$count', 1],
      //             },
      //           },
      //         },
      //       },
      //     ],
      //     {session},
      //   ).toArray();
      // } else {
      //   repeatQueryRaw = await this.messagesCollection
      //     .aggregate(
      //       [
      //         {$match: queryMatch},
      //         ...userTypeLookupStages,
      //         {
      //           $group: {
      //             _id: {$toLower: {$trim: {input: '$text'}}},
      //             count: {$sum: 1},
      //           },
      //         },
      //         {
      //           $match: {count: {$gt: 1}},
      //         },
      //         {
      //           $group: {
      //             _id: null,
      //             totalRepeats: {$sum: {$subtract: ['$count', 1]}},
      //           },
      //         },
      //       ],
      //       {session},
      //     )
      //     .toArray();
      // }
      // const repeatQueryCount = repeatQueryRaw[0]?.totalRepeats ?? 0;

      // // Count total queries to get percentage
      // let totalQueriesRaw;
      // if (source === 'whatsapp') {
      //   totalQueriesRaw = await this.QuestionCollection.aggregate(
      //     [
      //       {
      //         $match: {
      //           source: 'WHATSAPP',
      //           ...(queryMatch.createdAt && {
      //             createdAt: queryMatch.createdAt,
      //           }),
      //         },
      //       },
      //       {
      //         $count: 'count',
      //       },
      //     ],
      //     {session},
      //   ).toArray();
      // } else {
      //   totalQueriesRaw = await this.messagesCollection
      //     .aggregate(
      //       [{$match: queryMatch}, ...userTypeLookupStages, {$count: 'count'}],
      //       {session},
      //     )
      //     .toArray();
      // }

      // const totalQueries = totalQueriesRaw[0]?.count ?? 0;
      // const repeatQueryRatePct =
      //   totalQueries > 0
      //     ? Math.round((repeatQueryCount / totalQueries) * 100 * 10) / 10
      //     : 0;
      // // Avg questions per user per day over the filtered range (or default to last 30 days)
      // const avgQuestionsMatch: any = {
      //   isCreatedByUser: true,
      //   isDeleted: {$ne: true},
      //   text: {$exists: true, $ne: null, $nin: ['', ' ']},
      // };
      // if (startTime || endTime) {
      //   avgQuestionsMatch.createdAt = {};
      //   if (startTime) {
      //     avgQuestionsMatch.createdAt.$gte = new Date(startTime);
      //   }
      //   if (endTime) {
      //     avgQuestionsMatch.createdAt.$lte = new Date(endTime);
      //   }
      // }

      // let avgQuestionsRaw;
      // if (source === 'whatsapp') {
      //   avgQuestionsRaw = await this.QuestionCollection.aggregate(
      //     [
      //       {
      //         $match: {
      //           source: 'WHATSAPP',
      //           ...(avgQuestionsMatch.createdAt && {
      //             createdAt: avgQuestionsMatch.createdAt,
      //           }),
      //         },
      //       },

      //       {
      //         $group: {
      //           _id: {
      //             day: {
      //               $dateToString: {
      //                 format: '%Y-%m-%d',
      //                 date: '$createdAt',
      //                 timezone: '+05:30',
      //               },
      //             },
      //             user: {
      //               $ifNull: ['$userId', '$threadId'],
      //             },
      //           },
      //           userDailyCount: {
      //             $sum: 1,
      //           },
      //         },
      //       },

      //       {
      //         $group: {
      //           _id: '$_id.day',
      //           dayTotalQuestions: {
      //             $sum: '$userDailyCount',
      //           },
      //           dayUniqueUsers: {
      //             $sum: 1,
      //           },
      //         },
      //       },

      //       {
      //         $group: {
      //           _id: null,
      //           avgQuestionsPerUserDay: {
      //             $avg: {
      //               $divide: ['$dayTotalQuestions', '$dayUniqueUsers'],
      //             },
      //           },
      //         },
      //       },
      //     ],
      //     {session},
      //   ).toArray();
      // } else {
      //   avgQuestionsRaw = await this.messagesCollection
      //     .aggregate(
      //       [
      //         {$match: avgQuestionsMatch},
      //         ...userTypeLookupStages,
      //         {
      //           $group: {
      //             _id: {
      //               day: {
      //                 $dateToString: {
      //                   format: '%Y-%m-%d',
      //                   date: '$createdAt',
      //                   timezone: '+05:30',
      //                 },
      //               },
      //               user: '$user',
      //             },
      //             userDailyCount: {$sum: 1},
      //           },
      //         },
      //         {
      //           $group: {
      //             _id: '$_id.day',
      //             dayTotalQuestions: {$sum: '$userDailyCount'},
      //             dayUniqueUsers: {$sum: 1},
      //           },
      //         },
      //         {
      //           $group: {
      //             _id: null,
      //             avgQuestionsPerUserDay: {
      //               $avg: {$divide: ['$dayTotalQuestions', '$dayUniqueUsers']},
      //             },
      //           },
      //         },
      //       ],
      //       {session},
      //     )
      //     .toArray();
      // }
      // const avgQuestionsPerUserDay =
      //   avgQuestionsRaw[0]?.avgQuestionsPerUserDay ?? 0;
      return {
        dau: totalUsers,
        dauLastMonthPct,
        dailyQueries: todayQueryCount,
        avgSessionDurationMin: Math.round((avgMs / 60000) * 10) / 10,
        csatRating: 0,
        // repeatQueryRatePct,
        voiceUsageSharePct: 0,
        totalAppInstalls,
        inactiveUsersLast3Days: Math.max(0, totalUsers - activeCount),
        duplicateQuestionsCount,
        lowFeedbackUsersCount: Math.max(0, totalUsers - feedbackCount),
        // avgQuestionsPerUserDay: Math.round(avgQuestionsPerUserDay * 100) / 100,
        // repeatQueryCount,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(
    days = 13,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      // Count distinct users who sent messages per month (true monthly active users)
      const since = new Date();
      since.setMonth(since.getMonth() - days); // `days` param used as number of months to look back
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
            // Deduplicate: one entry per (month, user) pair
            {
              $group: {
                _id: {
                  month: {
                    $dateToString: {
                      format: '%Y-%m',
                      date: '$createdAt',
                      timezone: '+05:30',
                    },
                  },
                  user: '$user',
                },
              },
            },
            // Count distinct users per month
            {
              $group: {
                _id: '$_id.month',
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
      throw new InternalServerError(
        `Failed to get daily active users: ${error}`,
      );
    }
  }

  async getChannelSplit(
    _source = 'annam',
    _session?: ClientSession,
  ): Promise<ChannelSplitEntry[]> {
    return [];
  }

  async getVoiceAccuracyByLanguage(
    _source = 'annam',
    _session?: ClientSession,
  ): Promise<VoiceAccuracyEntry[]> {
    return [];
  }

  async getGeoDistribution(
    _source = 'annam',
    _session?: ClientSession,
  ): Promise<GeoStateEntry[]> {
    return [];
  }

  async getQueryCategories(
    _source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<QueryCategoryEntry[]> {
    try {
      await this.initReviewSystem();

      // const lookupStages = this.buildQuestionUserTypeLookupStages(userType);
      const source = _source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';
      const matchQuery = buildBaseQuestionMatch(source);

      matchQuery['details.domain'] = {
        $exists: true,
        $nin: [null, ''],
      };

      const query = await this.buildQuestionUserTypeMatchQuery(
        _source,
        userType,
      );

      if (query && Object.keys(query).length) {
        matchQuery.$and.push(query);
      }
      const pipeline = [
        {
          $match: matchQuery,
        },
        {
          $unwind: '$details.domain',
        },
        // ...lookupStages,

        {
          $project: {
            domain: '$details.domain',

            isDuplicate: {
              $cond: [{$eq: ['$status', 'duplicate']}, 1, 0],
            },
          },
        },

        {
          $group: {
            _id: '$domain',

            totalCount: {
              $sum: 1,
            },

            duplicateCount: {
              $sum: '$isDuplicate',
            },

            uniqueCount: {
              $sum: {
                $cond: [{$eq: ['$isDuplicate', 0]}, 1, 0],
              },
            },
          },
        },

        {
          $sort: {
            totalCount: -1,
          },
        },
      ];

      const raw = await this.QuestionCollection.aggregate(pipeline, {
        session,
      }).toArray();

      // Top 15 domains
      const top15 = raw.slice(0, 15);

      // Remaining domains
      const remainingDomains = raw.slice(15);

      // Response for top 15
      const result: QueryCategoryEntry[] = top15.map(item => ({
        label: item._id,
        questionCount: item.uniqueCount,
        duplicateQuestionCount: item.duplicateCount,
      }));

      // Aggregate remaining domains
      if (remainingDomains.length > 0) {
        const remainingAggregation = remainingDomains.reduce(
          (acc, item) => ({
            totalQuestions: acc.totalQuestions + item.uniqueCount,

            totalDuplicates: acc.totalDuplicates + item.duplicateCount,
          }),

          {
            totalQuestions: 0,
            totalDuplicates: 0,
          },
        );

        result.push({
          label: 'Remaining Categories',

          questionCount: remainingAggregation.totalQuestions,

          duplicateQuestionCount: remainingAggregation.totalDuplicates,
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to fetch query categories: ${error}`);
    }
  }

  async getQueryCategoryQuestions(
    category: string,
    questionType: QueryCategoryQuestionType = 'all',
    page = 1,
    limit = 10,
    _source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
  ): Promise<PaginatedQueryCategoryQuestions> {
    try {
      await this.initReviewSystem();
      await this.init(_source);

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const baseMatch = buildBaseQuestionMatch(_source);

      baseMatch['details.domain'] = {
        $exists: true,
        $nin: [null, ''],
      };

      const query = await this.buildQuestionUserTypeMatchQuery(
        _source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        baseMatch.$and.push(query);
      }
      const categoryLabel = category?.trim();
      if (!categoryLabel) {
        throw new BadRequestError('category is required');
      }

      let domainMatch: Record<string, any>;
      if (categoryLabel.toLowerCase() === 'remaining categories') {
        const topDomains = await this.QuestionCollection.aggregate(
          [
            {$match: baseMatch},
            // ...lookupStages,
            // ...lookupStages,
            {$group: {_id: '$details.domain', totalCount: {$sum: 1}}},
            {$sort: {totalCount: -1}},
            {$limit: 15},
            {$project: {_id: 1}},
          ],
          {session},
        ).toArray();

        domainMatch = {
          'details.domain': {
            $nin: topDomains.map(item => item._id).filter(Boolean),
          },
        };
      } else {
        domainMatch = {'details.domain': categoryLabel};
      }

      const typeMatch =
        questionType === 'duplicate'
          ? {status: 'duplicate'}
          : questionType === 'unique'
            ? {status: {$ne: 'duplicate'}}
            : {};

      let searchMatch = {};

      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                firstName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(user => user._id.toString());

        searchMatch = {
          userId: {
            $in: userIds,
          },
        };
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              ...baseMatch,
              ...domainMatch,
              ...typeMatch,
              ...searchMatch,
            },
          },
          // ...lookupStages,
          // {
          //   $addFields: {
          //     _categoryUserOid: {
          //       $cond: [
          //         {$and: [{$ne: ['$userId', null]}, {$ne: ['$userId', '']}]},
          //         {$toObjectId: '$userId'},
          //         null,
          //       ],
          //     },
          //   },
          // },
          // {
          //   $lookup: {
          //     from: 'users',
          //     localField: '_categoryUserOid',
          //     foreignField: '_id',
          //     as: '_categoryUserDoc',
          //   },
          // },
          // {
          //   $unwind: {
          //     path: '$_categoryUserDoc',
          //     preserveNullAndEmptyArrays: true,
          //   },
          // },
          {$sort: {createdAt: -1}},
          {
            $facet: {
              data: [
                {$skip: skip},
                {$limit: safeLimit},
                {
                  $project: {
                    _id: 0,
                    questionId: {$toString: '$_id'},
                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,
                    questionType: {
                      $cond: [
                        {$eq: ['$status', 'duplicate']},
                        'duplicate',
                        'unique',
                      ],
                    },
                    category: '$details.domain',
                    createdAt: 1,
                    district: '$details.district',
                    crop: '$details.crop',
                    village: '$details.village',
                    block: '$details.block',
                  },
                },
              ],
              metadata: [{$count: 'total'}],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;
      const questions = result[0]?.data ?? [];

      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,
          userId:
            resolvedUserId ??
            (question.userId?.toString
              ? question.userId.toString()
              : question.userId),

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new Error(`Failed to fetch query category questions: ${error}`);
    }
  }

  // async getDistrictAnalyticsByState(
  //   _source = 'annam',
  //   state: string,
  //   session?: ClientSession,
  //   userType = 'all',
  // ): Promise<DistrictAnalyticsEntry[]> {
  //   try {
  //     console.log('State is', state);
  //     await this.initReviewSystem();
  //     if (_source === 'whatsapp') {
  //       _source = 'WHATSAPP';
  //     } else {
  //       _source = 'AJRASAKHA';
  //     }
  //     const districts = DISTRICTS[state];

  //     if (!districts || districts.length === 0) {
  //       return [];
  //     }

  //     // Normalize district names
  //     const normalizedDistricts = districts.map(d => d.toLowerCase().trim());

  //     const lookupStages = this.buildQuestionUserTypeLookupStages(userType);

  //     const pipeline = [
  //       {
  //         $match: {
  //           source: _source,

  //           'details.district': {
  //             $exists: true,
  //             $ne: null,
  //           },
  //         },
  //       },

  //       ...lookupStages,

  //       // Normalize district from DB
  //       {
  //         $addFields: {
  //           normalizedDistrict: {
  //             $toLower: '$details.district',
  //           },
  //         },
  //       },

  //       // Keep only districts belonging to selected state
  //       {
  //         $match: {
  //           normalizedDistrict: {
  //             $in: normalizedDistricts,
  //           },
  //         },
  //       },

  //       {
  //         $project: {
  //           district: '$details.district',

  //           isDuplicate: {
  //             $cond: [
  //               {
  //                 $eq: ['$status', 'duplicate'],
  //               },
  //               1,
  //               0,
  //             ],
  //           },
  //         },
  //       },

  //       {
  //         $group: {
  //           _id: '$district',

  //           totalQuestions: {
  //             $sum: 1,
  //           },

  //           duplicateQuestions: {
  //             $sum: '$isDuplicate',
  //           },

  //           uniqueQuestions: {
  //             $sum: {
  //               $cond: [
  //                 {
  //                   $eq: ['$isDuplicate', 0],
  //                 },
  //                 1,
  //                 0,
  //               ],
  //             },
  //           },
  //         },
  //       },

  //       {
  //         $sort: {
  //           totalQuestions: -1,
  //         },
  //       },
  //     ];

  //     const raw = await this.QuestionCollection.aggregate(pipeline, {
  //       session,
  //     }).toArray();

  //     const districtMap = new Map(
  //       raw.map(item => [
  //         item._id.toLowerCase().trim(),
  //         {
  //           district: item._id,
  //           totalQuestions: item.totalQuestions,
  //           uniqueQuestions: item.uniqueQuestions,
  //           duplicateQuestions: item.duplicateQuestions,
  //         },
  //       ]),
  //     );

  //     const normalizedResult: DistrictAnalyticsEntry[] = districts.map(
  //       district => {
  //         const normalizedDistrict = district.toLowerCase().trim();

  //         const existing = districtMap.get(normalizedDistrict);

  //         return (
  //           existing || {
  //             district,

  //             totalQuestions: 0,

  //             uniqueQuestions: 0,

  //             duplicateQuestions: 0,
  //           }
  //         );
  //       },
  //     );

  //     return normalizedResult.sort(
  //       (a, b) => b.totalQuestions - a.totalQuestions,
  //     );
  //   } catch (error) {
  //     throw new Error(`Failed to fetch district analytics: ${error}`);
  //   }
  // }

  //   async getDistrictAnalyticsByState(
  //     _source = 'annam',
  //     state: string,
  //     session?: ClientSession,
  //     userType = 'all',
  //   ): Promise<DistrictAnalyticsEntry[]> {
  //     try {
  //       await this.initReviewSystem();

  //       const source = _source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

  //       const districts = ['All', ...(DISTRICTS[state] || [])];

  //       if (!districts || districts.length === 0) {
  //         return [];
  //       }

  //       const normalizedDistricts = districts.map(d =>
  //         this.normalizeDistrictName(d),
  //       );

  //       const matchQuery: any = {
  //         source,
  //         'details.state': state,
  //         'details.district': {
  //           $exists: true,
  //           $ne: null,
  //         },
  //         $and: [
  //           {
  //             $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
  //           },
  //         ],
  //         status: {$ne: 'non_agri'},
  //       };

  //       const query = await this.buildQuestionUserTypeMatchQuery(
  //         _source,
  //         userType,
  //       );

  //       if (query && Object.keys(query).length > 0) {
  //         matchQuery.$and.push(query);
  //       }

  //       // const lookupStages = this.buildQuestionUserTypeLookupStages(userType);

  //       const pipeline = [
  //         {
  //           $match: matchQuery,
  //         },

  //         // ...lookupStages,
  //         // ...lookupStages,

  //         {
  //           $project: {
  //             district: '$details.district',

  //             isDuplicate: {
  //               $cond: [
  //                 {
  //                   $eq: ['$status', 'duplicate'],
  //                 },
  //                 1,
  //                 0,
  //               ],
  //             },
  //             isClosed: {
  //               $cond: [
  //                 {
  //                   $eq: ['$status', 'closed'],
  //                 },
  //                 1,
  //                 0,
  //               ],
  //             },
  //           },
  //         },

  //         {
  //           $group: {
  //             _id: '$district',

  //             totalQuestions: {
  //               $sum: 1,
  //             },

  //             closedQuestions: {
  //               $sum: '$isClosed',
  //             },

  //             duplicateQuestions: {
  //               $sum: '$isDuplicate',
  //             },

  //             uniqueQuestions: {
  //               $sum: {
  //                 $cond: [
  //                   {
  //                     $eq: ['$isDuplicate', 0],
  //                   },
  //                   1,
  //                   0,
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //       ];

  //       const raw = await this.QuestionCollection.aggregate(pipeline, {
  //         session,
  //       }).toArray();

  //       const rawDistrictTotal = raw.reduce(
  //   (sum, d) => sum + d.totalQuestions,
  //   0,
  // );

  // console.log(
  //   'Raw district total:',
  //   rawDistrictTotal,
  // );

  //       const missingDistrictCount =
  //   await this.QuestionCollection.countDocuments({
  //     source,
  //     'details.state': state,
  //     $or: [
  //       { 'details.district': { $exists: false } },
  //       { 'details.district': null },
  //       { 'details.district': '' },
  //     ],
  //     status: { $ne: 'non_agri' },
  //   });

  // console.log(
  //   'Questions without district:',
  //   missingDistrictCount,
  // );

  //       await this.init(_source);

  //       const todayStart = new Date();
  //       todayStart.setHours(0, 0, 0, 0);

  //       const todayEnd = new Date();
  //       todayEnd.setHours(23, 59, 59, 999);

  //       const districtUsers = await this.users
  //         .aggregate([
  //           {
  //             $match: {
  //               isVerified: true,
  //               'farmerProfile.state': {
  //                 $regex: `^${state}$`,
  //                 $options: 'i',
  //               },
  //               'farmerProfile.district': {
  //                 $exists: true,
  //                 $ne: null,
  //               },
  //             },
  //           },
  //           {
  //             $group: {
  //               _id: '$farmerProfile.district',

  //               totalUsers: {
  //                 $sum: 1,
  //               },

  //               activeUsers: {
  //                 $sum: {
  //                   $cond: [
  //                     {
  //                       $and: [
  //                         {$gte: ['$lastActiveAt', todayStart]},
  //                         {$lte: ['$lastActiveAt', todayEnd]},
  //                       ],
  //                     },
  //                     1,
  //                     0,
  //                   ],
  //                 },
  //               },

  //               coordinators: {
  //   $sum: {
  //     $cond: [
  //       {
  //         $in: [
  //           '$userRole',
  //           this.coordinatorsRoles,
  //         ],
  //       },
  //       1,
  //       0,
  //     ],
  //   },
  // }
  //             },
  //           },
  //         ])
  //         .toArray();

  //       const userMap = new Map();

  //       for (const item of districtUsers) {
  //         userMap.set(this.normalizeDistrictName(item._id), item);
  //       }

  //       const districtMap = new Map<
  //   string,
  //   {
  //     district: string;
  //     totalQuestions: number;
  //     closedQuestions: number;
  //     uniqueQuestions: number;
  //     duplicateQuestions: number;
  //   }
  // >();

  // const skippedDistricts: Array<{
  //   district: string;
  //   totalQuestions: number;
  //   closedQuestions: number;
  //   uniqueQuestions: number;
  //   duplicateQuestions: number;
  // }> = [];

  // for (const item of raw) {
  //   const normalizedDistrict = this.normalizeDistrictName(
  //     item._id,
  //   );

  //   if (
  //     !normalizedDistricts.includes(
  //       normalizedDistrict,
  //     )
  //   ) {
  //     skippedDistricts.push({
  //       district: item._id,
  //       totalQuestions: item.totalQuestions,
  //       closedQuestions: item.closedQuestions,
  //       uniqueQuestions: item.uniqueQuestions,
  //       duplicateQuestions: item.duplicateQuestions,
  //     });

  //     continue;
  //   }

  //   districtMap.set(normalizedDistrict, {
  //     district: item._id,
  //     totalQuestions: item.totalQuestions,
  //     closedQuestions: item.closedQuestions,
  //     uniqueQuestions: item.uniqueQuestions,
  //     duplicateQuestions: item.duplicateQuestions,
  //   });
  // }

  //     const others = skippedDistricts.reduce(
  //   (acc, item) => ({
  //     totalQuestions:
  //       acc.totalQuestions + item.totalQuestions,

  //     closedQuestions:
  //       acc.closedQuestions + item.closedQuestions,

  //     uniqueQuestions:
  //       acc.uniqueQuestions + item.uniqueQuestions,

  //     duplicateQuestions:
  //       acc.duplicateQuestions +
  //       item.duplicateQuestions,
  //   }),
  //   {
  //     totalQuestions: 0,
  //     closedQuestions: 0,
  //     uniqueQuestions: 0,
  //     duplicateQuestions: 0,
  //   },
  // );

  // const result: DistrictAnalyticsEntry[] =
  //   districts.map(district => {
  //     const normalizedDistrict =
  //       this.normalizeDistrictName(district);

  //     const existing =
  //       districtMap.get(normalizedDistrict);

  //     const userData =
  //       userMap.get(normalizedDistrict);

  //     return {
  //       district,

  //       totalQuestions:
  //         existing?.totalQuestions ?? 0,

  //       closedQuestions:
  //         existing?.closedQuestions ?? 0,

  //       uniqueQuestions:
  //         existing?.uniqueQuestions ?? 0,

  //       duplicateQuestions:
  //         existing?.duplicateQuestions ?? 0,

  //       totalUsers:
  //         userData?.totalUsers ?? 0,

  //       activeUsers:
  //         userData?.activeUsers ?? 0,

  //       coordinators:
  //         userData?.coordinators ?? 0,
  //     };
  //   });
  // if (others.totalQuestions > 0) {
  //   result.push({
  //     district: 'Others',

  //     totalQuestions:
  //       others.totalQuestions,

  //     closedQuestions:
  //       others.closedQuestions,

  //     uniqueQuestions:
  //       others.uniqueQuestions,

  //     duplicateQuestions:
  //       others.duplicateQuestions,

  //     totalUsers: 0,
  //     activeUsers: 0,
  //     coordinators: 0,
  //   });
  // }

  //       const data = result.sort((a, b) => {
  //         if (a.district.toLowerCase() === 'all') return 1;
  //         if (b.district.toLowerCase() === 'all') return -1;

  //         return b.totalQuestions - a.totalQuestions;
  //       });
  //       return data;
  //     } catch (error) {
  //       throw new Error('Failed to fetch district analytics: ${error}');
  //     }
  //   }

  async getDistrictAnalyticsByState(
    state: string,
    district?: ILocationDistrict[],
    _source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DistrictAnalyticsEntry[]> {
    try {
      await this.initReviewSystem();

      const source = _source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      console.log("District data", district)

      const districts = district.map(d => {
        if (d.districtNameEnglish === 'S.A.S Nagar') {
          return 'Sahibzada Ajit Singh Nagar';
        }
        if (d.districtNameEnglish === 'Shahid Bhagat Singh Nagar') {
          return 'Nawanshahr';
        }
        return d.districtNameEnglish;
      });

      if (!districts.length) {
        return [];
      }

      const districtCodeMap = new Map(
        district.map(d => [
          this.normalizeDistrictName(d.districtNameEnglish),
          d,
        ]),
      );

      const matchQuery: any = {
        source,
        'details.state': state,
        'details.district': {
          $exists: true,
          $ne: null,
        },
        $and: [
          {
            $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
          },
        ],
        status: {$ne: 'non_agri'},
      };

      const query = await this.buildQuestionUserTypeMatchQuery(
        _source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      const raw = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },
          {
            $project: {
              district: '$details.district',

              isDuplicate: {
                $cond: [{$eq: ['$status', 'duplicate']}, 1, 0],
              },

              // isClosed: {
              //   $cond: [{$eq: ['$status', 'closed']}, 1, 0],
              // },

              // closeTimeMs: {
              //   $cond: [
              //     {
              //       $and: [
              //         {$eq: ['$status', 'closed']},
              //         {$ne: ['$closedAt', null]},
              //       ],
              //     },
              //     {
              //       $subtract: ['$closedAt', '$createdAt'],
              //     },
              //     0,
              //   ],
              // },
            },
          },
          {
            $group: {
              _id: '$district',

              totalQuestions: {
                $sum: 1,
              },

              // closedQuestions: {
              //   $sum: '$isClosed',
              // },

              // duplicateQuestions: {
              //   $sum: '$isDuplicate',
              // },

              uniqueQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$isDuplicate', 0],
                    },
                    1,
                    0,
                  ],
                },
              },
              // totalCloseTimeMs: {
              //   $sum: '$closeTimeMs',
              // },
            },
          },
        ],
        {session},
      ).toArray();

      await this.init(_source);
      const userDocFilter = this.buildUserDocFilter(userType);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const feedbackRaw = await this.messagesCollection
        .aggregate([
          {
            $match: {
              feedback: {$ne: null},
              'feedback.rating': {$exists: true},
              isCreatedByUser: false,
              isDeleted: {$ne: true},
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
              as: 'userDoc',
            },
          },
          {
            $unwind: '$userDoc',
          },
          {
            $match: {
              'userDoc.farmerProfile.state': {
                $regex: `^${state}$`,
                $options: 'i',
              },
              ...userDocFilter,
            },
          },
          {
            $group: {
              _id: '$userDoc.farmerProfile.district',

              totalFeedbacks: {
                $sum: 1,
              },

              positiveFeedbacks: {
                $sum: {
                  $cond: [{$eq: ['$feedback.rating', 'thumbsUp']}, 1, 0],
                },
              },

              negativeFeedbacks: {
                $sum: {
                  $cond: [{$eq: ['$feedback.rating', 'thumbsDown']}, 1, 0],
                },
              },
            },
          },
        ])
        .toArray();

  

      const districtUsers = await this.users
        .aggregate([
          {
            $match: {
              'farmerProfile.state': {
                $regex: `^${state}$`,
                $options: 'i',
              },

              'farmerProfile.district': {
                $exists: true,
                $ne: null,
              },
              ...userDocFilter,
            },
          },

          {
            $group: {
              _id: '$farmerProfile.district',

              totalUsers: {
                $sum: 1,
              },

              activeUsers: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $gte: ['$lastActiveAt', todayStart],
                        },
                        {
                          $lte: ['$lastActiveAt', todayEnd],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              coordinators: {
                $sum: {
                  $cond: [
                    {
                      $in: ['$userRole', this.coordinatorsRoles],
                    },
                    1,
                    0,
                  ],
                },
              },

              villageVolunteer: {
                $sum: {
                  $cond: [{$eq: ['$userRole', 'village_volunteer']}, 1, 0],
                },
              },

              districtCoordinator: {
                $sum: {
                  $cond: [{$eq: ['$userRole', 'district_coordinator']}, 1, 0],
                },
              },

              blockCoordinator: {
                $sum: {
                  $cond: [{$eq: ['$userRole', 'block_coordinator']}, 1, 0],
                },
              },
            },
          },
        ])
        .toArray();

        const debugUsers = await this.users.find({
  "farmerProfile.state": {
    $regex: `^${state}$`,
    $options: "i",
  },
}).toArray();


      const feedbackMap = new Map();

      for (const item of feedbackRaw) {
        const key = this.normalizeDistrictName(item._id);

        const existing = feedbackMap.get(key);

        if (existing) {
          existing.totalFeedbacks += item.totalFeedbacks;
          existing.positiveFeedbacks += item.positiveFeedbacks;
          existing.negativeFeedbacks += item.negativeFeedbacks;
        } else {
          feedbackMap.set(key, {...item});
        }
      }

      const userMap = new Map();

      for (const item of districtUsers) {
        const key = this.normalizeDistrictName(item._id);

        const existing = userMap.get(key);

        if (existing) {
          existing.totalUsers += item.totalUsers;
          existing.activeUsers += item.activeUsers;
          existing.coordinators += item.coordinators;
          existing.villageVolunteer += item.villageVolunteer;
          existing.districtCoordinator += item.districtCoordinator;
          existing.blockCoordinator += item.blockCoordinator;
        } else {
          userMap.set(key, {...item});
        }
      }

      const districtMap = new Map<
        string,
        {
          district: string;
          totalQuestions: number;
          // closedQuestions: number;

          uniqueQuestions: number;
          duplicateQuestions: number;
          // avgCloseTimeHours: number;
        }
      >();

      const skippedDistricts: Array<{
        district: string;
        totalQuestions: number;
        // closedQuestions: number;
        uniqueQuestions: number;
        duplicateQuestions: number;
      }> = [];

      const duplicateKeys = new Map<string, string[]>();

      for (const item of raw) {
        const normalizedDistrict = this.normalizeDistrictName(item._id);

        // Track duplicate normalized keys
        if (duplicateKeys.has(normalizedDistrict)) {
          duplicateKeys.get(normalizedDistrict)!.push(item._id);
        } else {
          duplicateKeys.set(normalizedDistrict, [item._id]);
        }

        // District not present in master list
        if (!districtCodeMap.has(normalizedDistrict)) {
          skippedDistricts.push({
            district: item._id,
            totalQuestions: item.totalQuestions,
            // closedQuestions: item.closedQuestions,
            uniqueQuestions: item.uniqueQuestions,
            duplicateQuestions: item.duplicateQuestions,
          });

          continue;
        }

        // IMPORTANT:
        // Merge duplicates instead of overwriting
        const existing = districtMap.get(normalizedDistrict);

        if (existing) {
          existing.totalQuestions += item.totalQuestions;

          // existing.closedQuestions += item.closedQuestions;

          existing.uniqueQuestions += item.uniqueQuestions;

          existing.duplicateQuestions += item.duplicateQuestions;

          // existing.avgCloseTimeHours += item.totalCloseTimeMs;
        } else {
          districtMap.set(normalizedDistrict, {
            district: item._id,
            totalQuestions: item.totalQuestions,
            // closedQuestions: item.closedQuestions,
            uniqueQuestions: item.uniqueQuestions,
            duplicateQuestions: item.duplicateQuestions,
            // avgCloseTimeHours:
            //   item.closedQuestions > 0
            //     ? item.totalCloseTimeMs / item.closedQuestions / 1000 / 60 / 60
            //     : 0,
          });
        }
      }

      const others = skippedDistricts.reduce(
        (acc, item) => ({
          totalQuestions: acc.totalQuestions + item.totalQuestions,

          // closedQuestions: acc.closedQuestions + item.closedQuestions,

          uniqueQuestions: acc.uniqueQuestions + item.uniqueQuestions,

          duplicateQuestions: acc.duplicateQuestions + item.duplicateQuestions,
        }),
        {
          totalQuestions: 0,
          // closedQuestions: 0,
          uniqueQuestions: 0,
          duplicateQuestions: 0,
        },
      );

      const result: DistrictAnalyticsEntry[] = districts.map(district => {
        const normalizedDistrict = this.normalizeDistrictName(district);

        const existing = districtMap.get(normalizedDistrict);

        const userData = userMap.get(normalizedDistrict);

        const districtMeta = districtCodeMap.get(normalizedDistrict);

        const feedbackData = feedbackMap.get(normalizedDistrict);


        return {
          district,

          districtCode: districtMeta?.districtCode,

          totalQuestions: existing?.totalQuestions ?? 0,

          // closedQuestions: existing?.closedQuestions ?? 0,

          uniqueQuestions: existing?.uniqueQuestions ?? 0,

          duplicateQuestions: existing?.duplicateQuestions ?? 0,

          totalUsers: userData?.totalUsers ?? 0,

          activeUsers: userData?.activeUsers ?? 0,

          coordinators: userData?.coordinators ?? 0,
          // avgClosingMsTime: existing?.avgCloseTimeHours ?? 0,

          villageVolunteer: userData?.villageVolunteer ?? 0,

          districtCoordinator: userData?.districtCoordinator ?? 0,

          blockCoordinator: userData?.blockCoordinator ?? 0,

          totalFeedbacks: feedbackData?.totalFeedbacks ?? 0,

          positiveFeedbacks: feedbackData?.positiveFeedbacks ?? 0,

          negativeFeedbacks: feedbackData?.negativeFeedbacks ?? 0,
        };
      });

      if (others.totalQuestions > 0) {
        result.push({
          district: 'Others',

          totalQuestions: others.totalQuestions,

          // closedQuestions: others.closedQuestions,

          uniqueQuestions: others.uniqueQuestions,

          duplicateQuestions: others.duplicateQuestions,

          totalUsers: 0,
          activeUsers: 0,
          coordinators: 0,
        });
      }

      return result.sort((a, b) => {
        if (a.district.toLowerCase() === 'all') return 1;

        if (b.district.toLowerCase() === 'all') return -1;

        return b.totalQuestions - a.totalQuestions;
      });
    } catch (error) {
      throw new Error(`Failed to fetch district analytics: ${error}`);
    }
  }

  async getQuestionFromDistrict(
    district: string,
    state: string,
    questionType: QueryCategoryQuestionType = 'all',
    page = 1,
    limit = 10,
    source: string,
    session?: ClientSession,
    userType = 'all',
    search?: string,
    knownDistricts?: string[],
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;
      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';
      const baseMatch = buildBaseQuestionMatch(sourceType);

      baseMatch['details.district'] = {
        $exists: true,
        $nin: [null, ''],
      };
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        baseMatch.$and.push(query);
      }
      const districtLabel = district.trim();
      if (!districtLabel) {
        throw new BadRequestError('district is required');
      }
      const isOthers = districtLabel.toLowerCase() === 'others';

      let districtMatch = {};

      if (!isOthers) {
        const variants = this.getDistrictVariants(districtLabel);

        districtMatch = {
          'details.state': {
            $regex: `^${state}$`,
            $options: 'i',
          },
          $or: variants.map(name => ({
            'details.district': {
              $regex: `^${name}$`,
              $options: 'i',
            },
          })),
        };
      }
      const typeMatch =
        questionType === 'duplicate'
          ? {status: 'duplicate'}
          : questionType === 'unique'
            ? {status: {$ne: 'duplicate'}}
            : {};

      let searchMatch = {};

      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                firstName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(user => user._id.toString());

        searchMatch = {
          userId: {
            $in: userIds,
          },
        };
      }

      let total = 0;
      let questions: any[] = [];

      if (!isOthers) {
        const result = await this.QuestionCollection.aggregate(
          [
            {
              $match: {
                ...baseMatch,
                ...districtMatch,
                ...typeMatch,
                ...searchMatch,
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $facet: {
                data: [
                  {$skip: skip},
                  {$limit: safeLimit},
                  {
                    $project: {
                      _id: 0,
                      questionId: {$toString: '$_id'},
                      userId: 1,
                      threadId: 1,
                      messageId: 1,
                      question: 1,
                      status: 1,
                      questionType: {
                        $cond: [
                          {$eq: ['$status', 'duplicate']},
                          'duplicate',
                          'unique',
                        ],
                      },
                      createdAt: 1,
                      district: '$details.district',
                      crop: '$details.crop',
                      village: '$details.village',
                      block: '$details.block',
                    },
                  },
                ],
                metadata: [
                  {
                    $count: 'total',
                  },
                ],
              },
            },
          ],
          {session},
        ).toArray();

        total = result[0]?.metadata?.[0]?.total ?? 0;
        questions = result[0]?.data ?? [];
      } else {
        const allQuestions = await this.QuestionCollection.aggregate(
          [
            {
              $match: {
                ...baseMatch,
                'details.state': {
                  $regex: `^${state}$`,
                  $options: 'i',
                },
                ...typeMatch,
                ...searchMatch,
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $project: {
                _id: 0,
                questionId: {$toString: '$_id'},
                userId: 1,
                threadId: 1,
                messageId: 1,
                question: 1,
                status: 1,
                questionType: {
                  $cond: [
                    {$eq: ['$status', 'duplicate']},
                    'duplicate',
                    'unique',
                  ],
                },
                createdAt: 1,
                district: '$details.district',
                crop: '$details.crop',
                village: '$details.village',
                block: '$details.block',
              },
            },
          ],
          {session},
        ).toArray();

        const validDistricts = new Set(
          (knownDistricts ?? []).map(d => this.normalizeDistrictName(d)),
        );

        const filteredQuestions = allQuestions.filter(question => {
          const normalized = this.normalizeDistrictName(question.district);

          return !validDistricts.has(normalized);
        });

        total = filteredQuestions.length;

        questions = filteredQuestions.slice(skip, skip + safeLimit);
      }

      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get questions from district ${district}: ${error}`,
      );
    }
  }

  async getFarmerHeatMapAnalytics(
    filters: FarmerHeatMapFilters = {},
    locationHierarchy?: FarmerHeatMapLocationHierarchy,
    session?: ClientSession,
  ): Promise<FarmerHeatMapResponse> {
    try {
      const source = filters.source || 'annam';
      const userType = filters.userType || 'all';
      const selectedState = filters.state || 'all';
      const selectedDistrict = filters.district || 'all';
      const selectedBlock = filters.block || 'all';
      const selectedVillage = filters.village || 'all';
      const granularity = filters.granularity || 'monthly';
      const createEmptyHeatMapTotals = (): FarmerHeatMapMetricTotals => ({
        activeFarmers: 0,
        totalQuestions: 0,
        duplicateQuestions: 0,
        closedQuestions: 0,
        nonGdbQuestions: 0,
        notifiedQuestions: 0,
        averageClosureTimeMinutes: 0,
      });

      await this.init(source);
      await this.initReviewSystem();

      const buildHeatMapTimeRange = () => {
        const now = new Date();
        const startDate = filters.startDate
          ? new Date(filters.startDate)
          : granularity === 'monthly'
            ? new Date(now.getFullYear(), 0, 1)
            : granularity === 'hourly'
              ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
              : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = filters.endDate
          ? new Date(filters.endDate)
          : granularity === 'monthly'
            ? new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
            : granularity === 'hourly'
              ? new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate(),
                  23,
                  59,
                  59,
                  999,
                )
              : new Date(
                  now.getFullYear(),
                  now.getMonth() + 1,
                  0,
                  23,
                  59,
                  59,
                  999,
                );

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const monthLabel = new Intl.DateTimeFormat('en', {month: 'short'});
        const toDateKey = (date: Date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const toHourKey = (date: Date) =>
          `${toDateKey(date)}-${String(date.getHours()).padStart(2, '0')}`;
        const addDays = (date: Date, days: number) => {
          const next = new Date(date);
          next.setDate(next.getDate() + days);
          return next;
        };
        const buckets: FarmerHeatMapBucket[] = [];

        if (granularity === 'monthly') {
          let cursor = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            1,
          );

          while (cursor <= endDate) {
            const bucketStart = new Date(cursor);
            const bucketEnd = new Date(
              cursor.getFullYear(),
              cursor.getMonth() + 1,
              0,
              23,
              59,
              59,
              999,
            );
            const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

            buckets.push({
              key,
              label: monthLabel.format(cursor),
              startDate: bucketStart.toISOString(),
              endDate: bucketEnd.toISOString(),
              totals: createEmptyHeatMapTotals(),
            });

            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
          }
        } else if (granularity === 'weekly') {
          let cursor = new Date(startDate);
          let week = 1;

          while (cursor <= endDate) {
            const bucketStart = new Date(cursor);
            const bucketEnd = addDays(bucketStart, 6);
            bucketEnd.setHours(23, 59, 59, 999);
            if (bucketEnd > endDate) bucketEnd.setTime(endDate.getTime());

            buckets.push({
              key: `week-${week}`,
              label: `Week ${week}`,
              startDate: bucketStart.toISOString(),
              endDate: bucketEnd.toISOString(),
              totals: createEmptyHeatMapTotals(),
            });

            cursor = addDays(bucketEnd, 1);
            cursor.setHours(0, 0, 0, 0);
            week += 1;
          }
        } else if (granularity === 'hourly') {
          let cursor = new Date(startDate);
          cursor.setMinutes(0, 0, 0);

          while (cursor <= endDate) {
            const bucketStart = new Date(cursor);
            const bucketEnd = new Date(cursor);
            bucketEnd.setMinutes(59, 59, 999);
            if (bucketEnd > endDate) bucketEnd.setTime(endDate.getTime());

            buckets.push({
              key: toHourKey(cursor),
              label: `${String(cursor.getHours()).padStart(2, '0')}:00`,
              startDate: bucketStart.toISOString(),
              endDate: bucketEnd.toISOString(),
              totals: createEmptyHeatMapTotals(),
            });

            cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
          }
        } else {
          let cursor = new Date(startDate);
          let day = 1;

          while (cursor <= endDate) {
            const bucketStart = new Date(cursor);
            const bucketEnd = new Date(cursor);
            bucketEnd.setHours(23, 59, 59, 999);

            buckets.push({
              key: toDateKey(cursor),
              label: `Day ${day}`,
              startDate: bucketStart.toISOString(),
              endDate: bucketEnd.toISOString(),
              totals: createEmptyHeatMapTotals(),
            });

            cursor = addDays(cursor, 1);
            cursor.setHours(0, 0, 0, 0);
            day += 1;
          }
        }

        const bucketMap = new Map(
          buckets.map(bucket => [
            bucket.key,
            {
              startDate: new Date(bucket.startDate),
              endDate: new Date(bucket.endDate),
            },
          ]),
        );
        const getBucketKey = (date: Date) => {
          if (granularity === 'monthly') {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          }
          if (granularity === 'daily') {
            return toDateKey(date);
          }
          if (granularity === 'hourly') {
            return toHourKey(date);
          }
          const bucket = buckets.find(item => {
            const range = bucketMap.get(item.key);
            return range && date >= range.startDate && date <= range.endDate;
          });
          return bucket?.key;
        };

        return {startDate, endDate, buckets, getBucketKey};
      };

      const {startDate, endDate, buckets, getBucketKey} =
        buildHeatMapTimeRange();

      const scope = locationHierarchy?.scope || 'state';
      let labels = [...(locationHierarchy?.labels || [])].sort();
      const labelMap = new Map(
        labels.map(label => [this.normalizeDistrictName(label), label]),
      );
      const getLocationLabel = (value?: string | null) => {
        const displayValue = String(value || '').trim();
        if (!displayValue || this.isInvalidHeatMapLocation(displayValue)) {
          return undefined;
        }

        const normalized = this.normalizeDistrictName(displayValue);
        const mappedLabel = labelMap.get(normalized);
        if (mappedLabel) return mappedLabel;

        labelMap.set(normalized, displayValue);
        labels.push(displayValue);
        return displayValue;
      };
      const locationField =
        scope === 'state'
          ? 'state'
          : scope === 'district'
            ? 'district'
            : scope === 'block'
              ? 'blockName'
              : 'villageName';
      const selectedLocationFilters: Record<string, string[]> = {};
      if (
        selectedState &&
        selectedState !== 'all' &&
        !this.isInvalidHeatMapLocation(selectedState)
      ) {
        selectedLocationFilters.state =
          this.getEquivalentLocationNames(selectedState);
      }
      if (
        selectedDistrict &&
        selectedDistrict !== 'all' &&
        !this.isInvalidHeatMapLocation(selectedDistrict)
      ) {
        selectedLocationFilters.district =
          this.getEquivalentLocationNames(selectedDistrict);
      }
      if (
        selectedBlock &&
        selectedBlock !== 'all' &&
        !this.isInvalidHeatMapLocation(selectedBlock)
      ) {
        selectedLocationFilters.blockName =
          this.getEquivalentLocationNames(selectedBlock);
      }
      if (
        selectedVillage &&
        selectedVillage !== 'all' &&
        !this.isInvalidHeatMapLocation(selectedVillage)
      ) {
        selectedLocationFilters.villageName =
          this.getEquivalentLocationNames(selectedVillage);
      }

      const finalSource: QuestionSource =
        source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';
      const activeFarmerRows = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: startDate, $lte: endDate},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            {
              $addFields: {
                _userOid: {
                  $convert: {
                    input: '$user',
                    to: 'objectId',
                    onError: null,
                    onNull: null,
                  },
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: '_userOid',
                foreignField: '_id',
                as: '_userDoc',
              },
            },
            {$unwind: {path: '$_userDoc', preserveNullAndEmptyArrays: false}},
            ...(userType === 'all'
              ? []
              : [
                  {
                    $match:
                      userType === 'external'
                        ? buildExternalJoinedUserMatch('_userDoc')
                        : {'_userDoc.userRole': 'INTERNAL'},
                  },
                ]),
            ...Object.entries(selectedLocationFilters).map(([key, values]) => ({
              $match: {[`_userDoc.farmerProfile.${key}`]: {$in: values}},
            })),
            {
              $project: {
                user: '$user',
                createdAt: 1,
                location: `$_userDoc.farmerProfile.${locationField}`,
              },
            },
            {$match: {location: {$exists: true, $nin: [null, '']}}},
          ],
          {session},
        )
        .toArray();

      const activeFarmerMap = new Map<string, Set<string>>();
      for (const row of activeFarmerRows) {
        const bucket = getBucketKey(new Date(row.createdAt));
        const label = getLocationLabel(String(row.location));
        if (!bucket || !label) continue;
        const key = `${label}__${bucket}`;
        if (!activeFarmerMap.has(key)) activeFarmerMap.set(key, new Set());
        activeFarmerMap.get(key)?.add(String(row.user));
      }

      let questionRows: any[] = [];

      const questionDocs = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              source: finalSource,
              createdAt: {$gte: startDate, $lte: endDate},
              $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
              status: {$ne: 'non_agri'},
            },
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              question: 1,
              details: 1,
              messageId: 1,
              threadId: 1,
              createdAt: 1,
              closedAt: 1,
              status: {$ifNull: ['$status', 'unknown']},
              isCustomerNotified: 1,
              referenceQuestionId: 1,
              referenceQuestion: 1,
            },
          },
        ],
        {session},
      ).toArray();

      const questionMessageIds = [
        ...new Set(
          questionDocs
            .map(row => row.messageId)
            .filter(id => id !== undefined && id !== null && id !== ''),
        ),
      ];
      // const questionThreadIds = [
      //   ...new Set(
      //     questionDocs
      //       .map(row => row.threadId)
      //       .filter(id => id !== undefined && id !== null && id !== ''),
      //   ),
      // ];

      const [
        questionMessages,
        // questionConversations
      ] = await Promise.all([
        questionMessageIds.length
          ? this.messagesCollection
              .find(
                {messageId: {$in: questionMessageIds}},
                {projection: {messageId: 1, user: 1}, session},
              )
              .toArray()
          : Promise.resolve([]),
        // questionThreadIds.length
        //   ? this.conversations
        //       .find(
        //         {conversationId: {$in: questionThreadIds}},
        //         {projection: {conversationId: 1, user: 1}, session},
        //       )
        //       .toArray()
        //   : Promise.resolve([]),
      ]);

      const questionMessageUserMap = new Map(
        questionMessages.map(message => [
          String(message.messageId),
          message.user?.toString(),
        ]),
      );
      // const questionConversationUserMap = new Map(
      //   questionConversations.map(conversation => [
      //     String(conversation.conversationId),
      //     conversation.user?.toString(),
      //   ]),
      // );

      const resolvedUserIdByQuestionId = new Map<string, string>();
      for (const row of questionDocs) {
        const directUserId = row.userId?.toString();
        const messageUserId =
          row.messageId !== undefined && row.messageId !== null
            ? questionMessageUserMap.get(String(row.messageId))
            : undefined;
        // const conversationUserId =
        //   row.threadId !== undefined && row.threadId !== null
        //     ? questionConversationUserMap.get(String(row.threadId))
        //     : undefined;
        const resolvedUserId = directUserId || messageUserId;
        // || conversationUserId;
        if (resolvedUserId) {
          resolvedUserIdByQuestionId.set(row._id.toString(), resolvedUserId);
        }
      }

      const questionUserObjectIds = [
        ...new Set([...resolvedUserIdByQuestionId.values()]),
      ]
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      const questionUsers = questionUserObjectIds.length
        ? await this.users
            .find({_id: {$in: questionUserObjectIds}}, {session})
            .toArray()
        : [];
      const questionUserMap = new Map(
        questionUsers.map(user => [user._id.toString(), user]),
      );

      questionRows = questionDocs.flatMap(row => {
        const userId = resolvedUserIdByQuestionId.get(row._id.toString());
        if (!userId) return [];

        const userDoc = questionUserMap.get(userId);
        if (!userDoc?.farmerProfile) return [];

        if (userType !== 'all') {
          const matchesUserType =
            userType === 'external'
              ? isExternalUserRole(userDoc.userRole, userDoc.role)
              : userDoc.userRole === 'INTERNAL';
          if (!matchesUserType) return [];
        }

        for (const [key, values] of Object.entries(selectedLocationFilters)) {
          if (
            !this.matchesEquivalentLocation(
              userDoc.farmerProfile?.[key],
              values,
            )
          ) {
            return [];
          }
        }

        const location = userDoc.farmerProfile?.[locationField];
        if (!location) return [];

        const name =
          `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim();

        return [
          {
            ...row,
            location,
            userId,
            askedBy: name || userDoc.name || userDoc.email,
            email: userDoc.email,
            state: userDoc.farmerProfile?.state,
            district: userDoc.farmerProfile?.district,
            block: userDoc.farmerProfile?.blockName,
            village: userDoc.farmerProfile?.villageName,
          },
        ];
      });

      const questionMap = new Map<
        string,
        {
          totalQuestions: number;
          duplicateQuestions: number;
          closedQuestions: number;
          nonGdbQuestions: number;
          notifiedQuestions: number;
          closureTotalMinutes: number;
          closureCount: number;
          statusDistribution: Record<string, number>;
          duplicateQuestionKeys: Set<string>;
          questionDetails: FarmerHeatMapQuestionDetail[];
        }
      >();
      const normalizeDuplicateReferenceText = (value?: string | null) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const getDuplicateGroupKey = (question: any) => {
        const referenceQuestionId = question.referenceQuestionId?.toString?.();
        if (referenceQuestionId) {
          return `reference-id:${referenceQuestionId}`;
        }

        const referenceQuestion = normalizeDuplicateReferenceText(
          question.referenceQuestion,
        );
        if (referenceQuestion) {
          return `reference-text:${referenceQuestion}`;
        }

        return `question-id:${question._id?.toString?.() || String(question._id)}`;
      };

      for (const row of questionRows) {
        const bucket = getBucketKey(new Date(row.createdAt));
        const label = getLocationLabel(String(row.location));
        if (!bucket || !label) continue;
        const key = `${label}__${bucket}`;
        const existing = questionMap.get(key) || {
          totalQuestions: 0,
          duplicateQuestions: 0,
          closedQuestions: 0,
          nonGdbQuestions: 0,
          notifiedQuestions: 0,
          closureTotalMinutes: 0,
          closureCount: 0,
          statusDistribution: {},
          duplicateQuestionKeys: new Set<string>(),
          questionDetails: [],
        };
        const status = String(row.status || 'unknown');
        existing.totalQuestions += 1;
        existing.statusDistribution[status] =
          (existing.statusDistribution[status] || 0) + 1;
        existing.questionDetails.push({
          questionId: row._id?.toString?.() || String(row._id),
          question: row.question || '',
          status,
          askedBy: row.askedBy,
          email: row.email,
          userId: row.userId,
          state: row.state,
          district: row.district,
          block: row.block,
          village: row.village,
          crop: Array.isArray(row.details?.crop)
            ? row.details.crop.join(', ')
            : row.details?.crop,
          domain: Array.isArray(row.details?.domain)
            ? row.details.domain.join(', ')
            : row.details?.domain,
          createdAt: row.createdAt,
          isCustomerNotified: row.isCustomerNotified,
          referenceQuestionId: row.referenceQuestionId?.toString?.(),
          referenceQuestion: row.referenceQuestion,
        });
        if (status === 'duplicate') {
          existing.duplicateQuestionKeys.add(getDuplicateGroupKey(row));
          existing.duplicateQuestions = existing.duplicateQuestionKeys.size;
        }

        const statusLower = status.toLowerCase();
        if (statusLower === 'pass' || statusLower === 'dynamic-closed' || statusLower === 'dynamic_closed' || statusLower === 'duplicate_closed' || statusLower === 'duplicate-closed') {
          existing.nonGdbQuestions += 1;
        }

        if (status === 'closed') {
          existing.closedQuestions += 1;
          if (row.isCustomerNotified === true) {
            existing.notifiedQuestions += 1;
          }
          if (
            row.closedAt &&
            new Date(row.closedAt) >= new Date(row.createdAt)
          ) {
            existing.closureTotalMinutes +=
              (new Date(row.closedAt).getTime() -
                new Date(row.createdAt).getTime()) /
              60000;
            existing.closureCount += 1;
          }
        }

        questionMap.set(key, existing);
      }

      labels = [...new Set(labels)].sort((a, b) => a.localeCompare(b));

      const calculateTotals = (
        labelFilter?: string,
        bucketFilter?: string,
      ): FarmerHeatMapMetricTotals => {
        const activeFarmerIds = new Set<string>();
        let totalQuestions = 0;
        let duplicateQuestionsCount = 0;
        let closedQuestions = 0;
        let nonGdbQuestions = 0;
        let notifiedQuestions = 0;
        let closureTotalMinutes = 0;
        const duplicateQuestionKeys = new Set<string>();

        const filteredLabels = labelFilter ? [labelFilter] : labels;
        const filteredBuckets = bucketFilter
          ? buckets.filter(bucket => bucket.key === bucketFilter)
          : buckets;

        for (const label of filteredLabels) {
          for (const bucket of filteredBuckets) {
            const key = `${label}__${bucket.key}`;
            const activeFarmers = activeFarmerMap.get(key);
            if (activeFarmers) {
              for (const farmerId of activeFarmers) {
                activeFarmerIds.add(farmerId);
              }
            }

            const questionMetrics = questionMap.get(key);
            if (!questionMetrics) continue;

            totalQuestions += questionMetrics.totalQuestions;
            for (const duplicateQuestionKey of questionMetrics.duplicateQuestionKeys) {
              duplicateQuestionKeys.add(duplicateQuestionKey);
            }
            closedQuestions += questionMetrics.closedQuestions;
            nonGdbQuestions += questionMetrics.nonGdbQuestions || 0;
            notifiedQuestions += questionMetrics.notifiedQuestions;
            closureTotalMinutes += questionMetrics.closureTotalMinutes;
          }
        }

        return {
          activeFarmers: activeFarmerIds.size,
          totalQuestions,
          duplicateQuestions: duplicateQuestionKeys.size,
          closedQuestions,
          nonGdbQuestions,
          notifiedQuestions,
          averageClosureTimeMinutes:
            totalQuestions > 0
              ? Math.round((closureTotalMinutes / totalQuestions) * 10) / 10
              : 0,
        };
      };

      const rows: FarmerHeatMapRow[] = labels.map(label => {
        const cells = buckets.map(bucket => {
          const key = `${label}__${bucket.key}`;
          const questionMetrics = questionMap.get(key);
          const activeFarmers = activeFarmerMap.get(key)?.size ?? 0;
          const averageClosureTimeMinutes =
            questionMetrics && questionMetrics.totalQuestions > 0
              ? Math.round(
                  (questionMetrics.closureTotalMinutes /
                    questionMetrics.totalQuestions) *
                    10,
                ) / 10
              : 0;

          return {
            bucket: bucket.key,
            label: bucket.label,
            activeFarmers,
            totalQuestions: questionMetrics?.totalQuestions ?? 0,
            duplicateQuestions: questionMetrics?.duplicateQuestions ?? 0,
            closedQuestions: questionMetrics?.closedQuestions ?? 0,
            nonGdbQuestions: questionMetrics?.nonGdbQuestions ?? 0,
            notifiedQuestions: questionMetrics?.notifiedQuestions ?? 0,
            averageClosureTimeMinutes,
            statusDistribution: questionMetrics?.statusDistribution ?? {},
            questionDetails: questionMetrics?.questionDetails ?? [],
          };
        });

        return {
          id: this.normalizeDistrictName(label),
          label,
          scope,
          cells,
          totals: calculateTotals(label),
        };
      });

      const bucketsWithTotals = buckets.map(bucket => ({
        ...bucket,
        totals: calculateTotals(undefined, bucket.key),
      }));

      const totals = calculateTotals();

      const maxValues = rows.reduce(
        (acc, row) => {
          for (const cell of row.cells) {
            acc.activeFarmers = Math.max(acc.activeFarmers, cell.activeFarmers);
            acc.totalQuestions = Math.max(
              acc.totalQuestions,
              cell.totalQuestions,
            );
            acc.duplicateQuestions = Math.max(
              acc.duplicateQuestions,
              cell.duplicateQuestions,
            );
            acc.closedQuestions = Math.max(
              acc.closedQuestions,
              cell.closedQuestions,
            );
            acc.nonGdbQuestions = Math.max(
              acc.nonGdbQuestions,
              cell.nonGdbQuestions ?? 0,
            );
            acc.notifiedQuestions = Math.max(
              acc.notifiedQuestions,
              cell.notifiedQuestions,
            );
            acc.averageClosureTimeMinutes = Math.max(
              acc.averageClosureTimeMinutes,
              cell.averageClosureTimeMinutes,
            );
          }
          return acc;
        },
        {
          activeFarmers: 0,
          totalQuestions: 0,
          duplicateQuestions: 0,
          closedQuestions: 0,
          nonGdbQuestions: 0,
          notifiedQuestions: 0,
          averageClosureTimeMinutes: 0,
        },
      );

      return {
        filters: {
          ...filters,
          source,
          userType,
          state: selectedState,
          district: selectedDistrict,
          block: selectedBlock,
          village: selectedVillage,
          granularity,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        buckets: bucketsWithTotals,
        rows,
        totals,
        maxValues,
      };
    } catch (error) {
      throw new Error(`Failed to fetch farmer heat map analytics: ${error}`);
    }
  }

  async getCoordinatorDuplicateQuestionHeatMap(
    coordinatorId: string,
    locationHierarchy?: CoordinatorDuplicateQuestionLocationHierarchy,
    session?: ClientSession,
  ): Promise<CoordinatorDuplicateQuestionHeatMapResponse> {
    try {
      await this.init('annam');
      await this.initReviewSystem();

      if (!ObjectId.isValid(coordinatorId)) {
        throw new BadRequestError('Invalid coordinator id');
      }

      const coordinator = await this.users.findOne(
        {_id: new ObjectId(coordinatorId)},
        {session},
      );

      if (
        !coordinator ||
        !COORDINATOR_ROLES.includes(coordinator.userRole as any)
      ) {
        throw new BadRequestError('Coordinator not found');
      }

      const role = String(coordinator.userRole || '');
      const state = coordinator.farmerProfile?.state;
      const district = coordinator.farmerProfile?.district;
      const block = coordinator.farmerProfile?.blockName;
      const village = coordinator.farmerProfile?.villageName;
      const farmerFilter: any = {
        $nor: COORDINATOR_ROLES.map(coordinatorRole => ({
          userRole: this.exactRegex(coordinatorRole),
        })),
      };

      if (state) farmerFilter['farmerProfile.state'] = this.exactRegex(state);
      if (district) {
        farmerFilter['farmerProfile.district'] = this.exactRegex(district);
      }
      if (role === 'block_coordinator' || role === 'village_volunteer') {
        if (block)
          farmerFilter['farmerProfile.blockName'] = this.exactRegex(block);
      }
      if (role === 'village_volunteer' && village) {
        farmerFilter['farmerProfile.villageName'] = this.exactRegex(village);
      }

      const scopedUsers = await this.users
        .find(farmerFilter, {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            farmerProfile: 1,
          },
          session,
        })
        .toArray();
      const userMap = new Map(
        scopedUsers.map((user: any) => [user._id.toString(), user]),
      );
      const userIds = [...userMap.keys()];
      const userObjectIds = userIds.map(id => new ObjectId(id));

      if (userIds.length === 0) {
        return {
          coordinatorId,
          coordinatorRole: role,
          scope:
            role === 'district_coordinator'
              ? 'district'
              : role === 'block_coordinator'
                ? 'block'
                : 'village',
          state,
          district,
          block,
          totalDuplicateQuestions: 0,
          blocks: [],
        };
      }

      const userMessages = await this.messagesCollection
        .find(
          {
            user: {$in: userIds},
            isDeleted: {$ne: true},
          },
          {
            projection: {
              user: 1,
              messageId: 1,
              threadId: 1,
              conversationId: 1,
            },
            session,
          },
        )
        .toArray();
      const messageIds = [
        ...new Set(
          userMessages.map((message: any) => message.messageId).filter(Boolean),
        ),
      ];
      // const threadIds = [
      //   ...new Set(
      //     userMessages
      //       .map((message: any) => message.threadId || message.conversationId)
      //       .filter(Boolean),
      //   ),
      // ];
      const messageUserMap = new Map(
        userMessages
          .filter((message: any) => message.messageId)
          .map((message: any) => [
            String(message.messageId),
            String(message.user),
          ]),
      );
      // const threadUserMap = new Map(
      //   userMessages
      //     .filter((message: any) => message.threadId || message.conversationId)
      //     .map((message: any) => [
      //       String(message.threadId || message.conversationId),
      //       String(message.user),
      //     ]),
      // );

      const questionFilter: any = buildBaseQuestionMatch('AJRASAKHA');
      const questionUserMatches: any[] = [
        {userId: {$in: userIds}},
        {userId: {$in: userObjectIds}},
      ];
      if (messageIds.length > 0) {
        questionUserMatches.push({messageId: {$in: messageIds}});
      }
      // if (threadIds.length > 0) {
      //   questionUserMatches.push({threadId: {$in: threadIds}});
      // }
      questionFilter.$and.push({$or: questionUserMatches});

      const questions = await this.QuestionCollection.find(questionFilter, {
        session,
      })
        .project({
          _id: 1,
          question: 1,
          createdAt: 1,
          userId: 1,
          messageId: 1,
          threadId: 1,
        })
        .sort({createdAt: 1})
        .toArray();

      const normalizeQuestionText = (value?: string) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const groups = new Map<
        string,
        {
          userId: string;
          normalizedQuestion: string;
          question: string;
          questions: any[];
        }
      >();

      for (const question of questions) {
        const directUserId =
          question.userId?.toString?.() || String(question.userId || '');
        const resolvedUserId =
          (directUserId && userMap.has(directUserId)
            ? directUserId
            : undefined) ||
          (question.messageId
            ? messageUserMap.get(String(question.messageId))
            : undefined);
        // || (question.threadId ? threadUserMap.get(String(question.threadId)) : undefined);
        const normalizedQuestion = normalizeQuestionText(question.question);

        if (
          !resolvedUserId ||
          !userMap.has(resolvedUserId) ||
          !normalizedQuestion
        ) {
          continue;
        }

        const key = `${resolvedUserId}__${normalizedQuestion}`;
        const existing = groups.get(key) || {
          userId: resolvedUserId,
          normalizedQuestion,
          question: question.question || '',
          questions: [],
        };
        existing.questions.push(question);
        if (!existing.question && question.question) {
          existing.question = question.question;
        }
        groups.set(key, existing);
      }

      const normalizeLocationKey = (value?: string) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const detailsByBlockVillage = new Map<
        string,
        CoordinatorDuplicateQuestionDetail[]
      >();
      for (const group of groups.values()) {
        if (group.questions.length < 2) continue;

        const user = userMap.get(group.userId);
        const blockName = String(user?.farmerProfile?.blockName || '').trim();
        const villageName = String(
          user?.farmerProfile?.villageName || '',
        ).trim();
        if (!blockName || !villageName) continue;

        const key = `${normalizeLocationKey(blockName)}__${normalizeLocationKey(villageName)}`;
        const dates = group.questions
          .map((question: any) =>
            question.createdAt ? new Date(question.createdAt) : null,
          )
          .filter(
            (date: Date | null) => date && !Number.isNaN(date.getTime()),
          ) as Date[];
        const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
        const detail: CoordinatorDuplicateQuestionDetail = {
          question: group.question,
          repeatCount: group.questions.length,
          userId: group.userId,
          userName: user?.name,
          email: user?.email,
          block: blockName,
          village: villageName,
          firstAskedAt: sortedDates[0],
          lastAskedAt: sortedDates[sortedDates.length - 1],
          questionIds: group.questions.map(
            (question: any) =>
              question._id?.toString?.() || String(question._id),
          ),
        };

        detailsByBlockVillage.set(key, [
          ...(detailsByBlockVillage.get(key) || []),
          detail,
        ]);
      }

      const blockMap = new Map<
        string,
        {
          blockName: string;
          villages: Map<
            string,
            {
              villageName: string;
              details: CoordinatorDuplicateQuestionDetail[];
            }
          >;
        }
      >();
      const addBlockVillage = (blockName?: string, villageName?: string) => {
        const displayBlock = String(blockName || '').trim();
        const displayVillage = String(villageName || '').trim();
        const normalizedBlock = normalizeLocationKey(displayBlock);
        const normalizedVillage = normalizeLocationKey(displayVillage);
        if (!normalizedBlock) return;

        if (!blockMap.has(normalizedBlock)) {
          blockMap.set(normalizedBlock, {
            blockName: displayBlock,
            villages: new Map(),
          });
        }
        if (normalizedVillage) {
          const blockEntry = blockMap.get(normalizedBlock)!;
          blockEntry.villages.set(
            normalizedVillage,
            blockEntry.villages.get(normalizedVillage) || {
              villageName: displayVillage,
              details: [],
            },
          );
        }
      };
      locationHierarchy?.blocks.forEach(locationBlock => {
        addBlockVillage(locationBlock.block);
        locationBlock.villages.forEach(locationVillage =>
          addBlockVillage(locationBlock.block, locationVillage),
        );
      });

      for (const user of scopedUsers as any[]) {
        const blockName = String(user.farmerProfile?.blockName || '').trim();
        const villageName = String(
          user.farmerProfile?.villageName || '',
        ).trim();
        if (!blockName || !villageName) continue;

        addBlockVillage(blockName, villageName);
      }
      for (const [blockVillage, details] of detailsByBlockVillage.entries()) {
        const [blockName, villageName] = blockVillage.split('__');
        addBlockVillage(blockName, villageName);
        blockMap.get(blockName)!.villages.get(villageName)!.details = details;
      }

      const blocks = [...blockMap.entries()]
        .sort(([, a], [, b]) => a.blockName.localeCompare(b.blockName))
        .map(([, blockEntry]) => {
          const villageRows = [...blockEntry.villages.entries()]
            .sort(([, a], [, b]) => a.villageName.localeCompare(b.villageName))
            .map(([, villageEntry]) => ({
              village: villageEntry.villageName,
              count: villageEntry.details.length,
              details: villageEntry.details.sort(
                (a, b) => b.repeatCount - a.repeatCount,
              ),
            }));

          return {
            block: blockEntry.blockName,
            count: villageRows.reduce((sum, item) => sum + item.count, 0),
            villages: villageRows,
          };
        });

      return {
        coordinatorId,
        coordinatorRole: role,
        scope:
          role === 'district_coordinator'
            ? 'district'
            : role === 'block_coordinator'
              ? 'block'
              : 'village',
        state,
        district,
        block,
        totalDuplicateQuestions: blocks.reduce(
          (sum, item) => sum + item.count,
          0,
        ),
        blocks,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch coordinator duplicate question heat map: ${error}`,
      );
    }
  }

  async getTopCrops(
    source: string,
    userType?: string,
    session?: ClientSession,
  ): Promise<{totalQuestions: number; topCrops: any[]}> {
    try {
      await this.initReviewSystem();
      let matchStage: any = {
        source: source === 'whatsapp' ? 'WHATSAPP' : {$ne: 'AGRI_EXPERT'},
        $and: [
          {
            $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
          },
        ],
        status: {$ne: 'non_agri'},
      };
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchStage.$and.push(query);
      }
      const cropFieldRaw = {
        $ifNull: ['$details.normalised_crop', '$details.crop'],
      };
      const normalizedCropExpr = {$toLower: cropFieldRaw};

      const cropDataRaw = await this.QuestionCollection.aggregate(
        [
          {$match: matchStage},
          {$group: {_id: normalizedCropExpr, count: {$sum: 1}}},
          {$project: {name: '$_id', count: 1, _id: 0}},
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [
                {$match: matchStage},
                {$group: {_id: normalizedCropExpr, count: {$sum: 1}}},
                {$project: {name: '$_id', count: 1, _id: 0}},
              ],
            },
          },
          {$group: {_id: '$name', count: {$sum: '$count'}}},
          {$match: {_id: {$ne: null}}},
          {$project: {name: '$_id', count: 1, _id: 0}},
          {$sort: {count: -1}},
          {$limit: 10},
        ],
        {session},
      ).toArray();
      const totalCountRaw = await this.QuestionCollection.aggregate(
        [
          {$match: matchStage},
          {$count: 'count'},
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [{$match: matchStage}, {$count: 'count'}],
            },
          },
          {$group: {_id: null, total: {$sum: '$count'}}},
        ],
        {session},
      ).toArray();

      const totalQuestions =
        totalCountRaw.length > 0 ? totalCountRaw[0].total : 0;

      // Capitalize first letter of each crop for display
      const topCrops = cropDataRaw
        .filter((r: any) => r.name)
        .map((r: any) => ({
          ...r,
          name:
            String(r.name).charAt(0).toUpperCase() + String(r.name).slice(1),
        }));

      return {totalQuestions, topCrops};
    } catch (error) {
      throw new InternalServerError(`Failed to get top crops: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(
    weeks = 52,
    source = 'annam',
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      // Original logic — untouched
      const result = await this.conversations
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}}},
            {
              $addFields: {
                durationMs: {
                  $max: [0, {$subtract: ['$updatedAt', '$createdAt']}],
                },
              },
            },
            {
              $group: {
                _id: {$dateToString: {format: '%G-W%V', date: '$createdAt'}},
                avgDurationMs: {$avg: '$durationMs'},
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

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly avg session duration: ${error}`,
      );
    }
  }

  async getDailyQueryCounts(
    days = 30,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyQueryCountEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
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

  async getDailyUserTrend(
    days = 30,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<DailyActiveUsersEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            // Filter to last N days, user-sent messages only
            {
              $match: {
                createdAt: {$gte: since},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
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

  async getWeeklyQueryCounts(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<WeeklyQueryCountEntry[]> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isCreatedByUser: true, isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
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

  async getMonthlyQueryCounts(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<MonthlyQueryCountEntry[]> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                isCreatedByUser: true,
              },
            },

            ...userTypeLookupStages,

            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },

                count: {
                  $sum: 1,
                },
              },
            },

            {
              $project: {
                month: '$_id',
                count: 1,
                _id: 0,
              },
            },

            {
              $sort: {
                month: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      return result as MonthlyQueryCountEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly query counts: ${error}`,
      );
    }
  }

  async getQuerySummaryByPeriod(
    period: 'daily' | 'weekly' | 'monthly',
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ) {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const now = new Date();

      let startDate = new Date();
      let label = '';

      switch (period) {
        case 'daily':
          startDate.setHours(0, 0, 0, 0);
          label = 'Today Queries';
          break;

        case 'weekly':
          startDate.setDate(now.getDate() - 7);
          label = 'Last 7 Days Queries';
          break;

        case 'monthly':
          startDate.setDate(now.getDate() - 30);
          label = 'Last 30 Days Queries';
          break;
      }

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {
                  $gte: startDate,
                },

                isCreatedByUser: true,

                isDeleted: {
                  $ne: true,
                },
              },
            },

            ...userTypeLookupStages,

            {
              $count: 'total',
            },
          ],
          {session},
        )
        .toArray();

      return {
        label,
        totalQueries: result[0]?.total || 0,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get query summary: ${error}`);
    }
  }

  async getWeatherConcernAnalytics(
    filters: WeatherConcernAnalyticsFilters = {},
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<WeatherConcernAnalyticsResponse> {
    try {
      await this.init(source);

      // ============================================
      // LOCATION FILTERS
      // ============================================

      const locationMatch: Record<string, any> = {};

      const stateRegex = this.buildExactTextRegex(filters.state);

      const districtRegex = this.buildExactTextRegex(filters.district);

      const blockRegex = this.buildExactTextRegex(filters.block);

      const villageRegex = this.buildExactTextRegex(filters.village);

      if (stateRegex) {
        locationMatch['userDetails.farmerProfile.state'] = stateRegex;
      }

      if (districtRegex) {
        locationMatch['userDetails.farmerProfile.district'] = districtRegex;
      }

      if (blockRegex) {
        locationMatch['userDetails.farmerProfile.blockName'] = blockRegex;
      }

      if (villageRegex) {
        locationMatch['userDetails.farmerProfile.villageName'] = villageRegex;
      }

      // ============================================
      // USER TYPE FILTER
      // ============================================

      const userDocFilter = this.buildUserDocFilter(userType);

      const userTypeMatch = this.buildJoinedUserDocFilter(
        userDocFilter,
        'userDetails',
      );

      // ============================================
      // MATCH WEATHER AI RESPONSES
      // ============================================

      const messageMatch: Record<string, any> = {
        isDeleted: {$ne: true},

        isCreatedByUser: false,

        'content.tool_call.name': {
          $regex: 'weather',
          $options: 'i',
        },
      };

      // ============================================
      // DATE FILTER
      // ============================================

      if (filters.startDate || filters.endDate) {
        messageMatch.createdAt = {};

        if (filters.startDate) {
          messageMatch.createdAt.$gte = new Date(filters.startDate);
        }

        if (filters.endDate) {
          messageMatch.createdAt.$lte = new Date(filters.endDate);
        }
      }

      // ============================================
      // CONCERN REGEX EXPRESSIONS
      // ============================================

      const concernExpressions = Object.fromEntries(
        Object.entries(WEATHER_CONCERNS).map(([concern, keywords]) => [
          concern,
          {
            $regexMatch: {
              input: '$contentSignal',
              regex: `\\b(?:${keywords
                .map(keyword => this.escapeRegex(keyword))
                .join('|')})\\b`,
              options: 'i',
            },
          },
        ]),
      );

      // ============================================
      // CONCERN SUMS
      // ============================================

      const concernSums = Object.fromEntries(
        Object.keys(WEATHER_CONCERNS).map(concern => [
          concern,
          {
            $sum: {
              $cond: [`$detectedConcerns.${concern}`, 1, 0],
            },
          },
        ]),
      );

      // ============================================
      // PIPELINE
      // ============================================

      const pipeline: any[] = [
        // ============================================
        // STEP 1 -> WEATHER AI RESPONSES
        // ============================================

        {
          $match: messageMatch,
        },

        // ============================================
        // STEP 2 -> FIND ORIGINAL USER MESSAGE
        // ============================================

        {
          $lookup: {
            from: 'messages',

            localField: 'parentMessageId',

            foreignField: 'messageId',

            as: 'userMessage',
          },
        },

        // ============================================
        // STEP 3 -> UNWIND USER MESSAGE
        // ============================================

        {
          $unwind: '$userMessage',
        },

        // ============================================
        // STEP 4 -> ONLY REAL USER QUESTIONS
        // ============================================

        {
          $match: {
            'userMessage.isCreatedByUser': true,
          },
        },

        // ============================================
        // STEP 5 -> GET USER OBJECT ID
        // ============================================

        {
          $addFields: {
            _userRef: {
              $ifNull: ['$userMessage.user', '$userMessage.userId'],
            },
          },
        },

        {
          $addFields: {
            _userOid: {
              $cond: [
                {
                  $eq: [{$type: '$_userRef'}, 'objectId'],
                },

                '$_userRef',

                {
                  $cond: [
                    {
                      $and: [
                        {
                          $ne: ['$_userRef', null],
                        },

                        {
                          $ne: ['$_userRef', ''],
                        },
                      ],
                    },

                    {
                      $toObjectId: '$_userRef',
                    },

                    null,
                  ],
                },
              ],
            },
          },
        },

        // ============================================
        // STEP 6 -> LOOKUP USER DETAILS
        // ============================================

        {
          $lookup: {
            from: 'users',

            localField: '_userOid',

            foreignField: '_id',

            as: 'userDetails',
          },
        },

        {
          $unwind: {
            path: '$userDetails',

            preserveNullAndEmptyArrays: userType !== 'external',
          },
        },
      ];

      // ============================================
      // USER TYPE FILTER
      // ============================================

      if (Object.keys(userTypeMatch).length > 0) {
        pipeline.push({
          $match: userTypeMatch,
        });
      }

      // ============================================
      // LOCATION FILTER
      // ============================================

      if (Object.keys(locationMatch).length > 0) {
        pipeline.push({
          $match: locationMatch,
        });
      }

      // ============================================
      // STEP 7 -> BUILD SIGNAL
      // ============================================

      pipeline.push({
        $addFields: {
          contentSignal: {
            $toLower: {
              $ifNull: ['$userMessage.text', ''],
            },
          },
        },
      });

      // ============================================
      // SEASON FILTER
      // ============================================

      const seasonRegex = this.buildContainsTextRegex(filters.season);

      if (seasonRegex) {
        pipeline.push({
          $match: {
            contentSignal: seasonRegex,
          },
        });
      }

      // ============================================
      // STEP 8 -> DETECT WEATHER CONCERNS
      // ============================================

      pipeline.push(
        {
          $addFields: {
            detectedConcerns: concernExpressions,
          },
        },

        // ============================================
        // STEP 9 -> OTHERS CATEGORY
        // ============================================

        {
          $addFields: {
            hasKnownConcern: {
              $anyElementTrue: [
                Object.keys(WEATHER_CONCERNS).map(
                  concern => `$detectedConcerns.${concern}`,
                ),
              ],
            },
          },
        },

        // ============================================
        // STEP 10 -> SUMMARY + TIMELINE
        // ============================================

        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,

                  totalWeatherQueries: {
                    $sum: 1,
                  },

                  ...concernSums,

                  others: {
                    $sum: {
                      $cond: ['$hasKnownConcern', 0, 1],
                    },
                  },
                },
              },
            ],

            timeline: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m',

                      date: '$createdAt',

                      timezone: '+05:30',
                    },
                  },

                  count: {
                    $sum: 1,
                  },
                },
              },

              {
                $sort: {
                  _id: 1,
                },
              },
            ],
          },
        },
      );

      // ============================================
      // EXECUTE PIPELINE
      // ============================================

      const [result] = await this.messagesCollection
        .aggregate(pipeline, {session})
        .toArray();

      // ============================================
      // SUMMARY
      // ============================================

      const summary = result?.summary?.[0] ?? {};

      const totalWeatherQueries = summary.totalWeatherQueries ?? 0;

      // ============================================
      // CONCERN DISTRIBUTION
      // ============================================

      const concernDistribution = Object.keys(WEATHER_CONCERNS).map(key => {
        const concernKey = key as keyof typeof WEATHER_CONCERNS;

        const count = summary[key] ?? 0;

        return {
          concern: WEATHER_CONCERN_LABELS[concernKey],

          count,

          percentage: totalWeatherQueries
            ? Math.round((count / totalWeatherQueries) * 100)
            : 0,
        };
      });

      // ============================================
      // OTHERS
      // ============================================

      const othersCount = summary.others ?? 0;

      if (othersCount > 0) {
        concernDistribution.push({
          concern: 'Others',

          count: othersCount,

          percentage: totalWeatherQueries
            ? Math.round((othersCount / totalWeatherQueries) * 100)
            : 0,
        });
      }

      // ============================================
      // SORT CONCERNS
      // OTHERS ALWAYS LAST
      // ============================================

      concernDistribution.sort((a, b) => {
        if (a.concern === 'Others') return 1;

        if (b.concern === 'Others') return -1;

        return b.count - a.count;
      });

      // ============================================
      // TOP CONCERN
      // ============================================

      const topConcern = (() => {
        if (totalWeatherQueries === 0) {
          return null;
        }

        const sortedConcerns = [...concernDistribution]
          .filter(item => item.concern !== 'Others' && item.count > 0)
          .sort((a, b) => b.count - a.count);

        return sortedConcerns[0]?.concern ?? null;
      })();

      // ============================================
      // RESPONSE
      // ============================================

      return {
        filters: {
          season: filters.season,

          state: filters.state,

          district: filters.district,

          block: filters.block,

          village: filters.village,

          startDate: filters.startDate,

          endDate: filters.endDate,
        },

        summary: {
          totalWeatherQueries,
          topConcern,
        },

        concernDistribution,

        timeline: (result?.timeline ?? []).map((item: any) => ({
          month: this.formatMonthLabel(item._id),

          count: item.count,
        })),
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weather concern analytics: ${error}`,
      );
    }
  }

  // ============================================
  // HELPER
  // ============================================

  private getMonthDateRange(month: string) {
    // month => "2026-05"

    const start = new Date(`${month}-01T00:00:00.000Z`);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    return {start, end};
  }

  private formatAverageCloseTime(minutes: number): string {
    if (!minutes || minutes <= 0) {
      return '0 minutes';
    }

    const totalMinutes = Math.round(minutes);

    const MINUTES_IN_HOUR = 60;
    const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

    // Approximate month = 30 days
    const MINUTES_IN_MONTH = 30 * MINUTES_IN_DAY;

    const months = Math.floor(totalMinutes / MINUTES_IN_MONTH);

    const remainingAfterMonths = totalMinutes % MINUTES_IN_MONTH;

    const days = Math.floor(remainingAfterMonths / MINUTES_IN_DAY);

    const remainingAfterDays = remainingAfterMonths % MINUTES_IN_DAY;

    const hours = Math.floor(remainingAfterDays / MINUTES_IN_HOUR);

    const mins = remainingAfterDays % MINUTES_IN_HOUR;

    const parts: string[] = [];

    // Months
    if (months > 0) {
      parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
    }

    // Days
    if (days > 0) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }

    // Hours
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }

    // Minutes
    if (mins > 0) {
      parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
    }

    return parts.join(' ');
  }

  // ============================================
  // DAILY ANALYTICS
  // ============================================

  async getDailyAnalytics(
    month?: string,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ) {
    try {
      await this.init(source);
      await this.initReviewSystem();

      let dateMatch: any = {};
      let qStart: Date;
      let qEnd: Date;

      if (startTime && endTime) {
        qStart = new Date(startTime);
        qEnd = new Date(endTime);
      } else if (month) {
        const monthRange = this.getMonthDateRange(month);
        qStart = monthRange.start;
        qEnd = monthRange.end;
      } else {
        const now = new Date();
        const istNow = new Date(
          now.toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
          }),
        );
        qStart = new Date(istNow);
        qStart.setDate(qStart.getDate() - 30);
        qStart.setHours(0, 0, 0, 0);
        qEnd = new Date(istNow);
        qEnd.setHours(23, 59, 59, 999);
      }

      dateMatch = {
        createdAt: {$gte: qStart, $lte: qEnd},
      };

      if (source === 'whatsapp') {
        return await this.getDailyAnalyticsForWhatsApp(qStart, qEnd);
      }
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);
      const questionUserTypeLookupStages =
        await this.buildQuestionUserTypeMatchQuery(source, userType);

      // ============================================
      // MESSAGE COLLECTION DATA
      // ============================================

      const messageData = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                ...dateMatch,
                isCreatedByUser: true,
                isDeleted: {
                  $ne: true,
                },
              },
            },
            ...userTypeLookupStages,
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },
                queryCount: {
                  $sum: 1,
                },
              },
            },
            {
              $project: {
                _id: 0,
                period: '$_id',
                queryCount: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      // ============================================
      // QUESTIONS COLLECTION DATA
      // ============================================
      const baseQuestionQuery = buildBaseQuestionMatch(source);

      const questionData = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',
              $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
              // messageId: { $exists: true, $ne: null },
              // threadId: { $exists: true, $ne: null },
              ...dateMatch,
              ...questionUserTypeLookupStages,
              status: {$ne: 'non_agri'},
              ...baseQuestionQuery,
            },
          },
          // ...userTypeLookupStages,
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: ['$closedAt', '$createdAt'],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
              passedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'pass'],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,
              period: '$_id',
              totalQuestions: 1,
              closedQuestions: 1,
              averageCloseTimeMinutes: {
                $round: ['$averageCloseTimeMinutes', 2],
              },
              passedQuestions: 1,
            },
          },
        ],
        {session},
      ).toArray();

      // ============================================
      // MERGE DATA
      // ============================================

      const mergedMap = new Map();

      for (const item of messageData) {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: item.queryCount,
          totalQuestions: 0,
          closedQuestions: 0,
          averageCloseTimeMinutes: 0,
          passedQuestions: 0,
        });
      }

      for (const item of questionData) {
        const existing = mergedMap.get(item.period);

        if (existing) {
          existing.totalQuestions = item.totalQuestions;
          existing.closedQuestions = item.closedQuestions;
          existing.averageCloseTime = this.formatAverageCloseTime(
            item.averageCloseTimeMinutes || 0,
          );
          existing.passedQuestions = item.passedQuestions;
        } else {
          mergedMap.set(item.period, {
            period: item.period,
            queryCount: 0,
            totalQuestions: item.totalQuestions,
            closedQuestions: item.closedQuestions,
            averageCloseTime: this.formatAverageCloseTime(
              item.averageCloseTimeMinutes || 0,
            ),
            passedQuestions: item.passedQuestions,
          });
        }
      }

      return Array.from(mergedMap.values()).sort((a, b) =>
        b.period.localeCompare(a.period),
      );
    } catch (error) {
      throw new InternalServerError(`Failed to get daily analytics: ${error}`);
    }
  }

  // ============================================
  // WEEKLY ANALYTICS
  // ============================================

  async getWeeklyAnalytics(
    month?: string,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ) {
    try {
      await this.init(source);
      await this.initReviewSystem();

      let dateMatch: any = {};
      let qStart: Date;
      let qEnd: Date;

      if (startTime && endTime) {
        qStart = new Date(startTime);
        qEnd = new Date(endTime);
      } else if (month) {
        const monthRange = this.getMonthDateRange(month);
        qStart = monthRange.start;
        qEnd = monthRange.end;
      } else {
        const now = new Date();
        const istNow = new Date(
          now.toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
          }),
        );
        qStart = new Date(istNow);
        qStart.setDate(qStart.getDate() - 30);
        qStart.setHours(0, 0, 0, 0);
        qEnd = new Date(istNow);
        qEnd.setHours(23, 59, 59, 999);
      }

      dateMatch = {
        createdAt: {$gte: qStart, $lte: qEnd},
      };

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      if (source === 'whatsapp') {
        return await this.getWeeklyAnalyticsForWhatsApp(qStart, qEnd);
      }
      const questionUserTypeLookupStages =
        await this.buildQuestionUserTypeMatchQuery(source, userType);
      // ============================================
      // MESSAGE DATA
      // ============================================

      const messageData = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                ...dateMatch,

                isCreatedByUser: true,

                isDeleted: {
                  $ne: true,
                },
              },
            },

            ...userTypeLookupStages,

            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%G-W%V',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },

                queryCount: {
                  $sum: 1,
                },
              },
            },

            {
              $project: {
                _id: 0,
                period: '$_id',
                queryCount: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      // ============================================
      // QUESTION DATA
      // ============================================

      const questionData = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',
              $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
              // messageId: { $exists: true, $ne: null },
              // threadId: { $exists: true, $ne: null },
              ...dateMatch,
              ...questionUserTypeLookupStages,
              status: {$ne: 'non_agri'},
            },
          },
          // ...userTypeLookupStages,
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%G-W%V',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: ['$closedAt', '$createdAt'],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
              passedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'pass'],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,

              period: '$_id',

              totalQuestions: 1,

              closedQuestions: 1,

              averageCloseTimeMinutes: {
                $round: ['$averageCloseTimeMinutes', 2],
              },
              passedQuestions: 1,
            },
          },
        ],
        {session},
      ).toArray();

      // ============================================
      // MERGE
      // ============================================

      const mergedMap = new Map();

      for (const item of messageData) {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: item.queryCount,
          totalQuestions: 0,
          closedQuestions: 0,
          averageCloseTimeMinutes: 0,
          passedQuestions: 0,
        });
      }

      for (const item of questionData) {
        const existing = mergedMap.get(item.period);

        if (existing) {
          existing.totalQuestions = item.totalQuestions;
          existing.closedQuestions = item.closedQuestions;
          existing.averageCloseTime = this.formatAverageCloseTime(
            item.averageCloseTimeMinutes || 0,
          );
          existing.passedQuestions = item.passedQuestions;
        } else {
          mergedMap.set(item.period, {
            period: item.period,
            queryCount: 0,
            totalQuestions: item.totalQuestions,
            closedQuestions: item.closedQuestions,
            averageCloseTime: this.formatAverageCloseTime(
              item.averageCloseTimeMinutes || 0,
            ),
            passedQuestions: item.passedQuestions,
          });
        }
      }

      return Array.from(mergedMap.values()).sort((a, b) =>
        b.period.localeCompare(a.period),
      );
    } catch (error) {
      throw new InternalServerError(`Failed to get weekly analytics: ${error}`);
    }
  }

  // ============================================
  // MONTHLY ANALYTICS
  // ============================================

  async getMonthlyAnalytics(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    year?: number,
  ) {
    try {
      await this.init(source);
      await this.initReviewSystem();

      const yearDateMatch = year
        ? {
            createdAt: {
              $gte: new Date(`${year}-01-01T00:00:00.000Z`),
              $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
            },
          }
        : {};

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);
      const questionUserTypeLookupStages =
        await this.buildQuestionUserTypeMatchQuery(source, userType);
      // ============================================
      // MESSAGE DATA
      // ============================================

      if (source === 'whatsapp') {
        return await this.getMonthlyAnalyticsForWhatsApp();
      }

      const messageData = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                ...yearDateMatch,

                isCreatedByUser: true,

                isDeleted: {
                  $ne: true,
                },
              },
            },

            ...userTypeLookupStages,

            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },

                queryCount: {
                  $sum: 1,
                },
              },
            },

            {
              $project: {
                _id: 0,
                period: '$_id',
                queryCount: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      // ============================================
      // QUESTION DATA
      // ============================================

      const questionData = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              source: 'AJRASAKHA',
              $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
              // messageId: { $exists: true, $ne: null },
              // threadId: { $exists: true, $ne: null },
              ...yearDateMatch,
              ...questionUserTypeLookupStages,
              status: {$ne: 'non_agri'},
            },
          },
          // ...userTypeLookupStages,
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },

              totalQuestions: {
                $sum: 1,
              },

              closedQuestions: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$status', 'closed'],
                    },
                    1,
                    0,
                  ],
                },
              },

              averageCloseTimeMinutes: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: ['$status', 'closed'],
                        },

                        {
                          $ne: ['$closedAt', null],
                        },
                      ],
                    },

                    {
                      $divide: [
                        {
                          $subtract: ['$closedAt', '$createdAt'],
                        },

                        1000 * 60,
                      ],
                    },

                    null,
                  ],
                },
              },
              passedQuestions: {
                $sum: {
                  $cond: [{$eq: ['$status', 'pass']}, 1, 0],
                },
              },
            },
          },

          {
            $project: {
              _id: 0,

              period: '$_id',

              totalQuestions: 1,

              closedQuestions: 1,

              averageCloseTimeMinutes: {
                $round: ['$averageCloseTimeMinutes', 2],
              },
              passedQuestions: 1,
            },
          },
        ],
        {session},
      ).toArray();

      // ============================================
      // MERGE
      // ============================================

      const mergedMap = new Map();

      for (const item of messageData) {
        mergedMap.set(item.period, {
          period: item.period,
          queryCount: item.queryCount,
          totalQuestions: 0,
          closedQuestions: 0,
          averageCloseTimeMinutes: 0,
          passedQuestions: 0,
        });
      }

      for (const item of questionData) {
        const existing = mergedMap.get(item.period);

        if (existing) {
          existing.totalQuestions = item.totalQuestions;
          existing.closedQuestions = item.closedQuestions;
          existing.averageCloseTime = this.formatAverageCloseTime(
            item.averageCloseTimeMinutes || 0,
          );
          existing.passedQuestions = item.passedQuestions;
        } else {
          mergedMap.set(item.period, {
            period: item.period,
            queryCount: 0,
            totalQuestions: item.totalQuestions,
            closedQuestions: item.closedQuestions,
            averageCloseTime: this.formatAverageCloseTime(
              item.averageCloseTimeMinutes || 0,
            ),
            passedQuestions: item.passedQuestions,
          });
        }
      }

      return Array.from(mergedMap.values()).sort((a, b) =>
        b.period.localeCompare(a.period),
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly analytics: ${error}`,
      );
    }
  }

  // async getFeedbackData(
  //   source = 'annam',
  //   session?: ClientSession,
  //   userType = 'all',
  // ): Promise<FeedbackData> {
  //   try {
  //     await this.init(source);

  //     const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

  //     const result = await this.messagesCollection
  //       .aggregate(
  //         [
  //           {
  //             $match: {
  //               feedback: {$exists: true},
  //               isCreatedByUser: false,
  //               isDeleted: {$ne: true},
  //             },
  //           },

  //           ...userTypeLookupStages,

  //           {
  //             $addFields: {
  //               numericRating: {
  //                 $switch: {
  //                   branches: [
  //                     {
  //                       case: {
  //                         $eq: ['$feedback.rating', 'thumbsUp'],
  //                       },
  //                       then: 1,
  //                     },
  //                     {
  //                       case: {
  //                         $eq: ['$feedback.rating', 'thumbsDown'],
  //                       },
  //                       then: 0,
  //                     },
  //                   ],
  //                   default: null,
  //                 },
  //               },
  //             },
  //           },

  //           {
  //             $facet: {
  //               positiveFeedbacks: [
  //                 {
  //                   $match: {
  //                     'feedback.rating': 'thumbsUp',
  //                   },
  //                 },
  //                 {
  //                   $project: {
  //                     _id: 0,
  //                     rating: '$feedback.rating',
  //                     tag: '$feedback.tag',
  //                   },
  //                 },
  //               ],

  //               negativeFeedbacks: [
  //                 {
  //                   $match: {
  //                     'feedback.rating': 'thumbsDown',
  //                   },
  //                 },
  //                 {
  //                   $project: {
  //                     _id: 0,
  //                     rating: '$feedback.rating',
  //                     tag: '$feedback.tag',
  //                   },
  //                 },
  //               ],

  //               stats: [
  //                 {
  //                   $group: {
  //                     _id: null,

  //                     positiveCount: {
  //                       $sum: {
  //                         $cond: [
  //                           {
  //                             $eq: ['$feedback.rating', 'thumbsUp'],
  //                           },
  //                           1,
  //                           0,
  //                         ],
  //                       },
  //                     },

  //                     negativeCount: {
  //                       $sum: {
  //                         $cond: [
  //                           {
  //                             $eq: ['$feedback.rating', 'thumbsDown'],
  //                           },
  //                           1,
  //                           0,
  //                         ],
  //                       },
  //                     },

  //                     averageRating: {
  //                       $avg: '$numericRating',
  //                     },

  //                     totalFeedbacks: {
  //                       $sum: 1,
  //                     },
  //                   },
  //                 },
  //               ],
  //             },
  //           },
  //         ],
  //         {session},
  //       )
  //       .toArray();

  //     const data = result[0];

  //     return {
  //       positiveFeedbacks: data.positiveFeedbacks,
  //       negativeFeedbacks: data.negativeFeedbacks,
  //       stats: data.stats[0],
  //     };
  //   } catch (error) {
  //     throw new InternalServerError(`Failed to get feedback data: ${error}`);
  //   }
  // }

  async getFeedbackData(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<FeedbackData> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      // ─────────────────────────────────────
      // FEEDBACK TAG CONFIG
      // ─────────────────────────────────────

      const FEEDBACK_TAGS = {
        positive: [
          'accurate_reliable',
          'clear_well_written',
          'attention_to_detail',
          'creative_solution',
        ],

        negative: [
          'inaccurate',
          'not_matched',
          'bad_style',
          'missing_image',
          'unjustified_refusal',
          'not_helpful',
        ],
      };

      // ─────────────────────────────────────
      // AGGREGATION
      // ─────────────────────────────────────

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                feedback: {$exists: true},
                isCreatedByUser: false,
                isDeleted: {$ne: true},
              },
            },

            ...userTypeLookupStages,

            {
              $addFields: {
                numericRating: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $eq: ['$feedback.rating', 'thumbsUp'],
                        },
                        then: 1,
                      },

                      {
                        case: {
                          $eq: ['$feedback.rating', 'thumbsDown'],
                        },
                        then: 0,
                      },
                    ],

                    default: null,
                  },
                },
              },
            },

            {
              $facet: {
                // ───────────────────────────
                // EXISTING RAW DATA
                // ───────────────────────────

                positiveFeedbacks: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsUp',
                    },
                  },

                  {
                    $project: {
                      _id: 0,
                      rating: '$feedback.rating',
                      tag: '$feedback.tag',
                    },
                  },
                ],

                negativeFeedbacks: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsDown',
                    },
                  },

                  {
                    $project: {
                      _id: 0,
                      rating: '$feedback.rating',
                      tag: '$feedback.tag',
                    },
                  },
                ],

                // ───────────────────────────
                // NEW COUNT DATA
                // ───────────────────────────

                positiveFeedbackCounts: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsUp',
                    },
                  },

                  {
                    $group: {
                      _id: '$feedback.tag',

                      count: {
                        $sum: 1,
                      },
                    },
                  },

                  {
                    $project: {
                      _id: 0,
                      tag: '$_id',
                      count: 1,
                    },
                  },
                ],

                negativeFeedbackCounts: [
                  {
                    $match: {
                      'feedback.rating': 'thumbsDown',
                    },
                  },

                  {
                    $group: {
                      _id: '$feedback.tag',

                      count: {
                        $sum: 1,
                      },
                    },
                  },

                  {
                    $project: {
                      _id: 0,
                      tag: '$_id',
                      count: 1,
                    },
                  },
                ],

                // ───────────────────────────
                // STATS
                // ───────────────────────────

                stats: [
                  {
                    $group: {
                      _id: null,

                      positiveCount: {
                        $sum: {
                          $cond: [
                            {
                              $eq: ['$feedback.rating', 'thumbsUp'],
                            },
                            1,
                            0,
                          ],
                        },
                      },

                      negativeCount: {
                        $sum: {
                          $cond: [
                            {
                              $eq: ['$feedback.rating', 'thumbsDown'],
                            },
                            1,
                            0,
                          ],
                        },
                      },

                      averageRating: {
                        $avg: '$numericRating',
                      },

                      totalFeedbacks: {
                        $sum: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
          {session},
        )
        .toArray();

      const data = result[0];

      // ─────────────────────────────────────
      // NORMALIZE MISSING TAGS
      // ─────────────────────────────────────

      const normalizeFeedbackCounts = (
        existing: any[],
        expectedTags: string[],
      ) => {
        return expectedTags.map(tag => {
          const found = existing.find(item => item.tag === tag);

          return {
            tag,
            count: found?.count ?? 0,
          };
        });
      };

      const positiveFeedbackCounts = normalizeFeedbackCounts(
        data.positiveFeedbackCounts || [],
        FEEDBACK_TAGS.positive,
      );

      const negativeFeedbackCounts = normalizeFeedbackCounts(
        data.negativeFeedbackCounts || [],
        FEEDBACK_TAGS.negative,
      );

      // ─────────────────────────────────────
      // RETURN
      // ─────────────────────────────────────

      return {
        // Existing frontend data
        positiveFeedbacks: data.positiveFeedbacks || [],

        negativeFeedbacks: data.negativeFeedbacks || [],

        // New aggregated count data
        positiveFeedbackCounts,

        negativeFeedbackCounts,

        // Stats
        stats: data.stats?.[0] || {
          positiveCount: 0,
          negativeCount: 0,
          averageRating: 0,
          totalFeedbacks: 0,
        },
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get feedback data: ${error}`);
    }
  }

  async getFeedbackUsers(
    source = 'annam',
    page = 1,
    limit = 10,
    search?: string,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userType = 'all',
    rating?: string,
    tag?: string,
    session?: ClientSession,
  ): Promise<PaginatedFeedbackMessages> {
    try {
      await this.init(source);
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType, true);

      const matchStage: any = {
        feedback: {$exists: true, $ne: null},
        isCreatedByUser: false,
        isDeleted: {$ne: true},
      };

      // if (rating === 'thumbsUp' || rating === 'thumbsDown') {
      //   matchStage['feedback.rating'] = rating;
      // }

      if (rating && rating !== 'all') {
        matchStage['feedback.rating'] = rating;
      }

      if (tag) {
        matchStage['feedback.tag'] = tag;
      }

      const pipeline: any[] = [{$match: matchStage}];

      if (userTypeLookupStages.length > 0) {
        pipeline.push(...userTypeLookupStages);
      } else {
        pipeline.push(
          {
            $addFields: {
              _userOid: {
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
              localField: '_userOid',
              foreignField: '_id',
              as: '_userDoc',
            },
          },
        );
      }

      pipeline.push({
        $unwind: {
          path: '$_userDoc',
          preserveNullAndEmptyArrays: true,
        },
      });

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        pipeline.push({
          $match: {
            $or: [
              {question: {$regex: searchRegex}},
              {response: {$regex: searchRegex}},
              {'feedback.tag': {$regex: searchRegex}},
              {'feedback.details': {$regex: searchRegex}},
              {'_userDoc.farmerProfile.farmerName': {$regex: searchRegex}},
            ],
          },
        });
      }

      const sortStage: any = {};
      sortStage[sortBy] = sortOrder === 'asc' ? 1 : -1;
      pipeline.push({$sort: sortStage});

      const skip = (page - 1) * limit;

      const facetStage = {
        $facet: {
          metadata: [{$count: 'total'}],
          data: [
            {$skip: skip},
            {$limit: limit},
            {
              $project: {
                _id: 1,
                conversationId: 1,
                messageId: 1,
                userId: '$_userDoc._id',
                name: '$_userDoc.name',
                username: '$_userDoc.username',
                farmerName: '$_userDoc.farmerProfile.farmerName',
                email: '$_userDoc.email',
                village: '$_userDoc.farmerProfile.villageName',
                block: '$_userDoc.farmerProfile.blockName',
                district: '$_userDoc.farmerProfile.district',
                state: '$_userDoc.farmerProfile.state',
                question: 1,
                response: 1,
                feedback: 1,
                createdAt: 1,
              },
            },
          ],
        },
      };

      pipeline.push(facetStage);

      const result = await this.messagesCollection
        .aggregate(pipeline, {session})
        .toArray();
      const totalFeedbacks = result[0]?.metadata[0]?.total || 0;
      const messages = result[0]?.data || [];

      // Look up questionId from the questions collection (review system db)
      // by matching each message's messageId to the question's messageId field
      if (messages.length > 0) {
        await this.initReviewSystem();
        const messageIds = messages
          .map((m: any) => m.messageId)
          .filter((id: any) => id != null && id !== '');
        if (messageIds.length > 0) {
          const questions = await this.QuestionCollection.find(
            {messageId: {$in: messageIds}},
            {projection: {_id: 1, messageId: 1}},
          ).toArray();
          const messageIdToQuestionId = new Map<string, string>(
            questions.map((q: any) => [String(q.messageId), String(q._id)]),
          );
          for (const msg of messages) {
            msg.questionId = msg.messageId
              ? messageIdToQuestionId.get(String(msg.messageId)) ?? null
              : null;
          }
        }
      }

      return {
        messages,
        totalFeedbacks,
        totalPages: Math.ceil(totalFeedbacks / limit),
        currentPage: page,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get feedback users: ${error}`);
    }
  }

  async getTodayQueryCount(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<number> {
    try {
      await this.init(source);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: today},
                isCreatedByUser: true,
                isDeleted: {$ne: true},
              },
            },
            ...userTypeLookupStages,
            {$count: 'total'},
          ],
          {session},
        )
        .toArray();

      return (result as any[])[0]?.total ?? 0;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get today query count: ${error}`,
      );
    }
  }

  // async findMatchingMessages(data: {
  //   question: string;
  //   details: any;
  //   createdAt: Date;
  //   questionId: string;
  //   messageId: string | undefined;
  // }) {
  //   await this.init("vicharanashala");
  //   await this.initReviewSystem();
  //   const {question, details, createdAt, questionId, messageId} = data;

  //   const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
  //   const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);

  //   let pipeline = [];

  //   if (messageId) {
  //     pipeline.push({
  //       $match: {
  //         messageId,
  //       },
  //     });
  //   } else {
  //     pipeline.push({
  //       $match: {
  //         createdAt: {
  //           $gte: start,
  //           $lte: end,
  //         },
  //       },
  //     });
  //   }
  //   pipeline.push(
  //     {
  //       $addFields: {
  //         userObjectId: {
  //           $cond: [
  //             {
  //               $and: [{$ne: ['$user', null]}, {$ne: ['$user', '']}],
  //             },
  //             {$toObjectId: '$user'},
  //             null,
  //           ],
  //         },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: 'users',
  //         localField: 'userObjectId',
  //         foreignField: '_id',
  //         as: 'userDetails',
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: '$userDetails',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },
  //   );
  //   let result = await this.messagesCollection.aggregate(pipeline).toArray();
  //   if (messageId) return result;
  //   const baseTime = new Date('2026-04-10T07:36:36.357Z');
  //   const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
  //   let matchedMessageId: string | null = null;
  //   let matchedUserId: ObjectId | null = null;
  //   const result1 = result.filter(doc => {
  //     try {
  //       const isNewFlow = new Date(doc.createdAt) > cutoffDate;
  //       const matchedContent = doc.content?.find((item: any) => {
  //         const isRightTool =
  //           item?.type === 'tool_call' &&
  //           (item?.tool_call?.name ===
  //             'upload_question_to_reviewer_system_mcp_pop' ||
  //             item?.tool_call?.name ===
  //               'upload_question_to_reviewer_system_mcp_reviewer');

  //         if (!isRightTool || !item?.tool_call?.output) {
  //           return false;
  //         }
  //         try {
  //           const outputArr = JSON.parse(item.tool_call.output);
  //           const innerText = outputArr?.[0]?.text;

  //           if (!innerText) return false;

  //           const parsedOutput = JSON.parse(innerText);

  //           const isNotFailed = parsedOutput?.status.toLowerCase() !== 'failed';

  //           return isNotFailed;
  //         } catch (error) {
  //           console.error('Failed to parse tool call output in filter:', error);
  //           return false;
  //         }
  //       });
  //       if (!matchedContent) return false;
  //       if (isNewFlow) {
  //         if (!matchedContent?.tool_call?.output) return false;
  //         const outputArr = JSON.parse(matchedContent.tool_call.output);
  //         const innerText = outputArr?.[0]?.text;
  //         const parsedOutput = JSON.parse(innerText);
  //         const questionIdFromOutput = parsedOutput?.question_id;
  //         const isMatch = questionIdFromOutput == questionId?.toString();
  //         if (isMatch) {
  //           matchedMessageId = doc.messageId;
  //           matchedUserId = doc.userObjectId ?? null;
  //         }
  //         return isMatch;
  //       }
  //       const args = JSON.parse(matchedContent.tool_call.args);

  //       const isMatch =
  //         args?.question?.toLowerCase() === question?.toLowerCase() &&
  //         args?.details?.state?.toLowerCase() ===
  //           details?.state?.toLowerCase() &&
  //         args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase();

  //       if (isMatch) {
  //         matchedMessageId = doc.messageId;
  //         matchedUserId = doc.userObjectId ?? null;
  //       }

  //       return isMatch;
  //     } catch (e) {
  //       return false;
  //     }
  //   });
  //   if (matchedMessageId && questionId) {
  //     const updateFields: Record<string, any> = {messageId: matchedMessageId};
  //     if (matchedUserId) {
  //       updateFields.userId = matchedUserId;
  //     }
  //     const question = await this.QuestionCollection.findOne({
  //       _id: new ObjectId(questionId),
  //     });
  //     if (!question.messageId)
  //       await this.QuestionCollection.updateOne(
  //         {_id: new ObjectId(questionId)},
  //         {$set: updateFields},
  //       );
  //   }

  //   return result1;
  // }

  async findFromSecondDb(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
    messageId: string | undefined;
  }) {
    await this.initSecondDb();
    await this.initReviewSystem();
    const {question, details, createdAt, questionId, messageId} = data;

    const start = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
    const end = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);

    let pipeline = [];

    if (messageId) {
      pipeline.push({
        $match: {
          messageId,
        },
      });
    } else {
      pipeline.push({
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      });
    }

    pipeline.push(
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
    );
    let result = await this.annamMessagesCollection
      .aggregate(pipeline)
      .toArray();
    if (messageId) return result;
    const baseTime = new Date('2026-04-10T07:36:36.357Z');
    const cutoffDate = new Date(baseTime.getTime() - 30 * 60 * 1000);
    let matchedMessageId: string | null = null;
    let matchedUserId: ObjectId | null = null;
    const result1 = result.filter(doc => {
      try {
        const isNewFlow = new Date(doc.createdAt) > cutoffDate;
        const matchedContent = doc.content?.find((item: any) => {
          const isRightTool =
            item?.type === 'tool_call' &&
            (item?.tool_call?.name ===
              'upload_question_to_reviewer_system_mcp_pop' ||
              item?.tool_call?.name ===
                'upload_question_to_reviewer_system_mcp_reviewer');

          if (!isRightTool || !item?.tool_call?.output) {
            return false;
          }
          try {
            const outputArr = JSON.parse(item.tool_call.output);
            const innerText = outputArr?.[0]?.text;

            if (!innerText) return false;

            const parsedOutput = JSON.parse(innerText);

            const isNotFailed =
              parsedOutput?.status?.toLowerCase() !== 'failed';

            return isNotFailed;
          } catch (error) {
            console.error('Failed to parse tool call output in filter:', error);
            return false;
          }
        });

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
            matchedUserId = doc.userObjectId ?? null;
          }
          return isMatch;
        }

        const args = JSON.parse(matchedContent.tool_call.args);

        const isMatch =
          args?.question?.toLowerCase() === question?.toLowerCase() &&
          args?.details?.state?.toLowerCase() ===
            details?.state?.toLowerCase() &&
          args?.details?.crop?.toLowerCase() === details?.crop?.toLowerCase();

        if (isMatch) {
          matchedMessageId = doc.messageId;
          matchedUserId = doc.userObjectId ?? null;
        }

        return isMatch;
      } catch (e) {
        return false;
      }
    });
    if (matchedMessageId && questionId) {
      const updateFields: Record<string, any> = {messageId: matchedMessageId};
      if (matchedUserId) {
        updateFields.userId = matchedUserId;
      }
      const question = await this.QuestionCollection.findOne({
        _id: new ObjectId(questionId),
      });
      if (!question.messageId)
        await this.QuestionCollection.updateOne(
          {_id: new ObjectId(questionId)},
          {$set: updateFields},
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
    source = 'annam',
    crop = '',
    primaryCrops = '',
    secondaryCrops = '',
    village = '',
    state = '',
    district = '',
    block = '',
    profileCompleted = 'all',
    inactiveOnly = false,
    session?: ClientSession,
    userType = 'all',
    roles = '',
    sortBy = 'createdAt',
    sortOrder = 'asc',
    lowFeedbackOnly = false,
    activeTodayByProfile = false,
    missingDemographicField = '',
    isVerfied?: boolean,
    loginStatus: 'all' | 'loggedIn' | 'loggedOut' = 'all',
  ): Promise<PaginatedUserDetails> {
    try {
      await this.init(source);

      // Build date match for messages (optional)
      const dateMatch: Record<string, any> = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
      };
      if (startDate || endDate) {
        dateMatch.createdAt = {};
        if (startDate) dateMatch.createdAt.$gte = startDate;
        if (endDate) dateMatch.createdAt.$lte = endDate;
      }

      // Get question counts per user from messages
      const messageCounts = await this.messagesCollection
        .aggregate(
          [
            {$match: dateMatch},
            {
              $group: {
                _id: '$user',
                totalQuestions: {$sum: 1},
              },
            },
          ],
          {session},
        )
        .toArray();

      // Build a map: userId string → count
      const countMap = new Map<string, number>();
      for (const entry of messageCounts) {
        countMap.set(String(entry._id), entry.totalQuestions);
      }

      const userFilter: Record<string, any> = {
        ...this.buildUserDocFilter(userType),
      };
      if (isVerfied !== undefined) {
        userFilter.isVerified = isVerfied;
      }
      const roleValues = roles
        .split(',')
        .map(role => role.trim())
        .filter(Boolean);
      const normalizedUserRoles = roleValues.flatMap(role => [
        role,
        role.toUpperCase(),
        role.toLowerCase(),
      ]);
      const normalizedRoles = roleValues.flatMap(role => [
        role,
        role.toUpperCase(),
        role.toLowerCase(),
      ]);

      if (roleValues.length > 0) {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: [
              {userRole: {$in: normalizedUserRoles}},
              {role: {$in: normalizedRoles}},
            ],
          },
        ];
      }
      if (activeTodayByProfile) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        userFilter.lastActiveAt = {
          $gte: todayStart,
          $lte: todayEnd,
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {farmerProfile: {$exists: true, $ne: null}},
        ];
      }
      if (search && search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = {$regex: escaped, $options: 'i'};
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {$or: [{name: regex}, {username: regex}, {email: regex}]},
        ];
      }
      if (crop && crop.trim()) {
        const cropRegex = {
          $regex: crop.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: [
              {'farmerProfile.cropsCultivated': cropRegex},
              {'farmerProfile.primaryCrop': cropRegex},
              {'farmerProfile.secondaryCrop': cropRegex},
            ],
          },
        ];
      }
      const primaryCropValues = primaryCrops
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      if (primaryCropValues.length > 0) {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: primaryCropValues.map(value => ({
              'farmerProfile.primaryCrop': {
                $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                $options: 'i',
              },
            })),
          },
        ];
      }
      const secondaryCropValues = secondaryCrops
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      if (secondaryCropValues.length > 0) {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: secondaryCropValues.map(value => ({
              'farmerProfile.secondaryCrop': {
                $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                $options: 'i',
              },
            })),
          },
        ];
      }
      if (village && village.trim()) {
        const villageRegex = {
          $regex: village.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {'farmerProfile.villageName': villageRegex},
        ];
      }
      if (state && state.trim()) {
        const stateRegex = {
          $regex: `^${state.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {'farmerProfile.state': stateRegex},
        ];
      }
      // if (district && district.trim()) {
      //   const districtRegex = {
      //     $regex: `^${district.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      //     $options: 'i',
      //   };
      //   userFilter.$and = [
      //     ...(userFilter.$and ?? []),
      //     {'farmerProfile.district': districtRegex},
      //   ];
      // }

      if (district && district.trim()) {
  const escapedDistrict = district
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  userFilter.$and = [
    ...(userFilter.$and ?? []),
    {
      'farmerProfile.district': {
        $regex: `^${escapedDistrict}(\\s*\\(.*\\))?$`,
        $options: 'i',
      },
    },
  ];
}
      if (block && block.trim()) {
        const blockRegex = {
          $regex: `^${block.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i',
        };
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {'farmerProfile.blockName': blockRegex},
        ];
      }
      if (profileCompleted === 'yes') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {farmerProfile: {$exists: true, $ne: null}},
        ];
      } else if (profileCompleted === 'no') {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {$or: [{farmerProfile: {$exists: false}}, {farmerProfile: null}]},
        ];
      }

      if (missingDemographicField) {
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {farmerProfile: {$exists: true, $ne: null}},
          {
            $or: [
              {[`farmerProfile.${missingDemographicField}`]: {$exists: false}},
              {[`farmerProfile.${missingDemographicField}`]: null},
              {[`farmerProfile.${missingDemographicField}`]: ''},
            ],
          },
        ];
      }

      const allUsers = await this.users.find(userFilter, {session}).toArray();

      const coordinatorRoles = [
        'district_coordinator',
        'block_coordinator',
        'village_volunteer',
      ];

      const userRoleCounts = {
        farmer: 0,
        coordinator: 0,
        internal: 0,
        districtCoordinator: 0,
        blockCoordinator: 0,
        villageVolunteer: 0,
      };

      for (const user of allUsers) {
        const role = user.userRole || '';

        if (role === 'FARMER') {
          userRoleCounts.farmer++;
        } else if (coordinatorRoles.includes(role)) {
          userRoleCounts.coordinator++;
          if (role === 'district_coordinator') {
            userRoleCounts.districtCoordinator++;
          } else if (role === 'block_coordinator') {
            userRoleCounts.blockCoordinator++;
          } else {
            userRoleCounts.villageVolunteer++;
          }
        } else if (role === 'INTERNAL') {
          userRoleCounts.internal++;
        }
      }
      // console.log('useres::',allUsers)
      // console.log('type of isverified:', isVerfied);
      // Merge
      const merged: UserDetailEntry[] = allUsers.map(u => ({
        userId: String(u._id),
        name: u.name || u.username || 'Unknown',
        email: u.email || '',
        role: u.role || '',
        userRole: u.userRole || '',
        totalQuestions: countMap.get(String(u._id)) ?? 0,
        createdAt: u.createdAt,
        isVerified: u.isVerified ?? true,
        farmerProfile: u.farmerProfile
          ? // {
            //     farmerName: u.farmerProfile.farmerName,
            //     age: u.farmerProfile.age,
            //     gender: u.farmerProfile.gender,
            //     villageName: u.farmerProfile.villageName,
            //     blockName: u.farmerProfile.blockName,
            //     district: u.farmerProfile.district,
            //     state: u.farmerProfile.state,
            //     phoneNo: u.farmerProfile.phoneNo,
            //     languagePreference: u.farmerProfile.languagePreference,
            //     yearsOfExperience: u.farmerProfile.yearsOfExperience,
            //     cropsCultivated: u.farmerProfile.cropsCultivated,
            //     primaryCrop: u.farmerProfile.primaryCrop,
            //     secondaryCrop: u.farmerProfile.secondaryCrop,
            //     awarenessOfKCC: u.farmerProfile.awarenessOfKCC,
            //     usesAgriApps: u.farmerProfile.usesAgriApps,
            //     highestEducatedPerson: u.farmerProfile.highestEducatedPerson,
            //     numberOfSmartphones: u.farmerProfile.numberOfSmartphones,
            //     platform: u.farmerProfile.platform,
            //     platformHistory: u.farmerProfile.platformHistory,
            //     location: u.farmerProfile.location,
            //   }
            u.farmerProfile
          : undefined,
      }));

      const withSessionCounts =
        loginStatus !== 'all'
          ? await this.attachActiveSessionCounts(merged, session)
          : merged;

      // Filter to inactive users only if requested
      const afterInactive = inactiveOnly
        ? withSessionCounts.filter(u => u.totalQuestions === 0)
        : withSessionCounts;

      // Filter to low-feedback users only if requested (all-time, no date range on feedback)
      let finalList = afterInactive;
      if (lowFeedbackOnly) {
        const feedbackDocs = await this.messagesCollection
          .aggregate([
            {
              $match: {
                feedback: {$exists: true},
                isCreatedByUser: false,
                isDeleted: {$ne: true},
              },
            },
            {$group: {_id: '$user'}},
          ])
          .toArray();
        const usersWithFeedback = new Set(
          feedbackDocs.map((d: any) => String(d._id)),
        );
        finalList = afterInactive.filter(u => !usersWithFeedback.has(u.userId));
      }

      if (loginStatus === 'loggedIn') {
        finalList = finalList.filter(u => (u.activeSessionCount ?? 0) > 0);
      } else if (loginStatus === 'loggedOut') {
        finalList = finalList.filter(u => (u.activeSessionCount ?? 0) === 0);
      }

      // Sort based on sortBy and sortOrder parameters
      if (sortBy === 'name') {
        finalList.sort((a, b) =>
          sortOrder === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name),
        );
      } else if (sortBy === 'farmerName') {
        finalList.sort((a, b) => {
          const valA = a.farmerProfile?.farmerName || '';
          const valB = b.farmerProfile?.farmerName || '';
          return sortOrder === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        });
      } else if (sortBy === 'email') {
        finalList.sort((a, b) => {
          const valA = a.email || '';
          const valB = b.email || '';
          return sortOrder === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        });
      } else if (sortBy === 'createdAt') {
        finalList.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
      } else {
        // Default / totalQuestions
        finalList.sort((a, b) =>
          sortOrder === 'asc'
            ? a.totalQuestions - b.totalQuestions
            : b.totalQuestions - a.totalQuestions,
        );
      }

      // Compute summary stats over the full filtered set
      const totalUsers = finalList.length;
      // const activeUsers = finalList.filter(u => u.totalQuestions > 0).length;
      // const inactiveUsers = totalUsers - activeUsers;
      // const totalQuestions = finalList.reduce(
      //   (sum, u) => sum + u.totalQuestions,
      //   0,
      // );
      const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

      // Paginate
      const startIdx = (page - 1) * limit;
      const users = await this.attachActiveSessionCounts(
        finalList.slice(startIdx, startIdx + limit),
        session,
      );

      return {
        users,
        totalUsers,
        totalPages,
        userRoleCounts,
        // activeUsers,
        // inactiveUsers,
        // totalQuestions,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user details: ${error}`);
    }
  }

  // async getUserQuestionsData(
  //   messageIds: string[],
  //   source: string,
  //   userType = 'all',
  //   page = 1,
  //   limit = 10,
  // ) {
  //   try {
  //     console.log('MessageIds inside repomethods', messageIds);
  //     await this.initReviewSystem();

  //      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

  //     // const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

  //     const matchQuery = {
  //       messageId: {
  //         $exists: true,
  //         $ne: null,
  //         $in: messageIds,
  //       },

  //       source: sourceType,
  //       $and: [
  //         {
  //           $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
  //         },
  //       ],
  //       status: {$ne: 'non_agri'},
  //     };

  //     const query = await this.buildQuestionUserTypeMatchQuery(
  //       source,
  //       userType,
  //     );

  //     if (query && Object.keys(query).length > 0) {
  //       matchQuery.$and.push(query);
  //     }

  //     const skip = (page - 1) * limit;

  //     const pipeline = [
  //       /**
  //        * Match only questions
  //        * linked with user's messages
  //        */

  //       {
  //         $match: matchQuery,
  //       },

  //       // ...userTypeLookupStages,

  //       /**
  //        * Newest first
  //        */

  //       {
  //         $sort: {
  //           createdAt: -1,
  //         },
  //       },

  //       /**
  //        * Group same questions
  //        * asked by SAME user
  //        */

  //       {
  //         $group: {
  //           _id: {
  //             $toLower: {
  //               $trim: {
  //                 input: '$question',
  //               },
  //             },
  //           },

  //           /**
  //            * Count how many times
  //            * same user asked same question
  //            */

  //           repeatedCount: {
  //             $sum: 1,
  //           },

  //           /**
  //            * Latest question data
  //            */

  //           latestQuestion: {
  //             $first: '$question',
  //           },

  //           latestStatus: {
  //             $first: '$status',
  //           },

  //           latestCreatedAt: {
  //             $first: '$createdAt',
  //           },

  //           latestUpdatedAt: {
  //             $first: '$updatedAt',
  //           },

  //           latestMessageId: {
  //             $first: '$messageId',
  //           },

  //           /**
  //            * Store all timestamps
  //            * for timeline modal
  //            */

  //           allCreatedAt: {
  //             $push: '$createdAt',
  //           },
  //         },
  //       },

  //       /**
  //        * Final response shape
  //        */

  //       {
  //         $project: {
  //           _id: 0,

  //           messageId: '$latestMessageId',

  //           /**
  //            * Clean:
  //            * (repeated)
  //            * (duplicate)
  //            * etc.
  //            */

  //           question: {
  //             $trim: {
  //               input: '$latestQuestion',
  //             },
  //           },

  //           status: '$latestStatus',

  //           createdAt: '$latestCreatedAt',

  //           updatedAt: '$latestUpdatedAt',

  //           repeatedCount: '$repeatedCount',

  //           repeatedAt: '$allCreatedAt',

  //           /**
  //            * If asked > 1 time
  //            */

  //           isDuplicate: {
  //             $gt: ['$repeatedCount', 1],
  //           },
  //         },
  //       },

  //       /**
  //        * Sort latest first
  //        */

  //       {
  //         $sort: {
  //           createdAt: -1,
  //         },
  //       },

  //       /**
  //        * Pagination
  //        */

  //       {
  //         $facet: {
  //           metadata: [
  //             {
  //               $count: 'total',
  //             },
  //           ],

  //           data: [
  //             {
  //               $skip: skip,
  //             },

  //             {
  //               $limit: limit,
  //             },
  //           ],
  //         },
  //       },
  //     ];

  //     const result =
  //       await this.QuestionCollection.aggregate(pipeline).toArray();

  //     const totalQuestions = result[0]?.metadata?.[0]?.total || 0;

  //     const questions = result[0]?.data || [];

  //     /**
  //      * Cleanup question prefixes
  //      */

  //     questions.forEach((q: any) => {
  //       q.question = q.question?.replace(/^\s*\([^)]*\)\s*/, '')?.trim();

  //       /**
  //        * Sort timeline newest first
  //        */

  //       q.repeatedAt = (q.repeatedAt || []).sort(
  //         (a: string, b: string) =>
  //           new Date(b).getTime() - new Date(a).getTime(),
  //       );
  //     });

  //     const totalPages = Math.ceil(totalQuestions / limit);

  //     return {
  //       total: totalQuestions,

  //       totalPages,

  //       currentPage: page,

  //       limit,

  //       items: questions,
  //     };
  //   } catch (err) {
  //     throw new InternalServerError(`Failed to get question data: ${err}`);
  //   }
  // }

  async getUserQuestionsData(
    identifiers: {
      threadIds?: string[];
      messageIds?: string[];
      userId?: string;
    },
    source: string,
    userType = 'all',
    page = 1,
    limit = 10,
  ) {
    try {
      await this.initReviewSystem();

      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const orConditions: any[] = [];

      /**
       * ThreadId matches
       */
      if (identifiers.threadIds && identifiers.threadIds.length > 0) {
        orConditions.push({
          threadId: {
            $in: identifiers.threadIds,
          },
        });
      }

      /**
       * MessageId matches
       */
      if (identifiers.messageIds && identifiers.messageIds.length > 0) {
        orConditions.push({
          messageId: {
            $in: identifiers.messageIds,
          },
        });
      }

      /**
       * UserId matches
       */
      if (identifiers.userId) {
        orConditions.push({
          userId: new ObjectId(identifiers.userId),
        });
      }

      /**
       * Nothing to search
       */
      if (!orConditions.length) {
        return {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          items: [],
        };
      }
      const matchQuery: any = buildBaseQuestionMatch(sourceType);

      matchQuery.$or = orConditions;

      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      const skip = (page - 1) * limit;

      const pipeline = [
        {
          $match: matchQuery,
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        {
          $group: {
            _id: {
              $toLower: {
                $trim: {
                  input: '$question',
                },
              },
            },

            repeatedCount: {
              $sum: 1,
            },

            latestQuestion: {
              $first: '$question',
            },

            latestStatus: {
              $first: '$status',
            },

            latestCreatedAt: {
              $first: '$createdAt',
            },

            latestUpdatedAt: {
              $first: '$updatedAt',
            },

            latestMessageId: {
              $first: '$messageId',
            },

            latestThreadId: {
              $first: '$threadId',
            },

            latestUserId: {
              $first: '$userId',
            },

            latestId: {
              $first: '$_id',
            },

            allCreatedAt: {
              $push: '$createdAt',
            },
          },
        },

        {
          $project: {
            _id: '$latestId',

            messageId: '$latestMessageId',

            threadId: '$latestThreadId',

            userId: '$latestUserId',

            question: {
              $trim: {
                input: '$latestQuestion',
              },
            },

            status: '$latestStatus',

            createdAt: '$latestCreatedAt',

            updatedAt: '$latestUpdatedAt',

            repeatedCount: '$repeatedCount',

            repeatedAt: '$allCreatedAt',

            isDuplicate: {
              $gt: ['$repeatedCount', 1],
            },
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        {
          $facet: {
            metadata: [
              {
                $count: 'total',
              },
            ],

            data: [
              {
                $skip: skip,
              },

              {
                $limit: limit,
              },
            ],
          },
        },
      ];

      const result = await this.QuestionCollection.aggregate(pipeline, {
        allowDiskUse: true,
      }).toArray();

      const totalQuestions = result[0]?.metadata?.[0]?.total || 0;

      const questions = result[0]?.data || [];

      questions.forEach((q: any) => {
        q.question = q.question?.replace(/^\s*\([^)]*\)\s*/, '')?.trim();

        q.repeatedAt = (q.repeatedAt || []).sort(
          (a: string, b: string) =>
            new Date(b).getTime() - new Date(a).getTime(),
        );
      });

      const totalPages = Math.ceil(totalQuestions / limit);

      return {
        total: totalQuestions,

        totalPages,

        currentPage: page,

        limit,

        items: questions,
      };
    } catch (err) {
      throw new InternalServerError(`Failed to get question data: ${err}`);
    }
  }

  async getUsersMessages(
    email: string,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    page = 1,
    limit = 10,
  ) {
    try {
      await this.init(source);

      // const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const user = await this.users.findOne({email: email}, {session});

      if (!user) {
        throw new Error('User not found');
      }

      const skip = (page - 1) * limit;

      const pipeline = [
        {
          $match: {
            user: String(user._id),

            // sender: 'User',
            // isCreatedByUser: true,
          },
          // ...userTypeLookupStages
        },

        {
          $sort: {
            createdAt: -1,
          },
        },

        // Group repeated messages

        {
          $group: {
            _id: {
              $trim: {
                input: {
                  $toLower: '$text',
                },
              },
            },

            repeatedCount: {
              $sum: 1,
            },

            latestMessage: {
              $first: '$text',
            },

            latestCreatedAt: {
              $first: '$createdAt',
            },

            latestUpdatedAt: {
              $first: '$updatedAt',
            },

            latestSender: {
              $first: '$sender',
            },

            latestIsCreatedByUser: {
              $first: '$isCreatedByUser',
            },

            allCreatedAt: {
              $push: '$createdAt',
            },

            // Store all messageIds
            // messageIds: {
            //   $push: '$messageId',
            // },
          },
        },

        {
          $project: {
            _id: 0,

            message: '$latestMessage',

            createdAt: '$latestCreatedAt',

            sender: '$latestSender',

            isCreatedByUser: '$latestIsCreatedByUser',

            updatedAt: '$latestUpdatedAt',

            repeatedAt: '$allCreatedAt',

            repeatedCount: 1,

            isDuplicate: {
              $gt: ['$repeatedCount', 1],
            },

            // keep temporarily
          },
        },

        {
          $sort: {
            createdAt: -1,
          },
        },
      ];

      // Total count

      // const totalResult = await this.messagesCollection
      //   .aggregate([
      //     ...pipeline,

      //     {
      //       $count: 'total',
      //     },
      //   ])
      //   .toArray();

      const result = await this.messagesCollection
        .aggregate([
          ...pipeline,

          {
            $facet: {
              metadata: [
                {
                  $count: 'total',
                },
              ],

              data: [
                {
                  $skip: skip,
                },

                {
                  $limit: limit,
                },
              ],
            },
          },
        ])
        .toArray();

      const totalMessages = result[0]?.metadata?.[0]?.total || 0;

      const messages = result[0]?.data || [];

      const totalPages = Math.ceil(totalMessages / limit);

      // Paginated messages

      // const messages = await this.messagesCollection
      //   .aggregate([
      //     ...pipeline,

      //     {
      //       $skip: skip,
      //     },

      //     {
      //       $limit: limit,
      //     },
      //   ])
      //   .toArray();

      // Extract all messageIds separately

      // const allMessageIds = messages.flatMap(
      //   (msg: any) => msg.messageIds || [],
      // );

      // Remove messageIds from frontend data

      messages.forEach((msg: any) => {
        delete msg.messageIds;
      });

      const filteredMessages = messages.filter(
        (msg: any) => msg.sender === 'User' && msg.isCreatedByUser === true,
      );

      filteredMessages.forEach((msg: any) => {
        delete msg.messageIds;
        delete msg.sender;
        delete msg.isCreatedByUser;
      });

      return {
        total: totalMessages,

        totalPages,

        currentPage: page,

        limit,

        items: filteredMessages,

        // separate array
        // allMessageIds,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get users messages: ${error}`);
    }
  }

  async getUserData(
    userEmail: string,
    source: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(source);
      const user = await this.users.findOne({email: userEmail}, {session});
      if (!user) {
        throw new Error('User not found');
      }
      return {
        userId: String(user._id),
        name: user.name || user.username || 'Unknown',
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user data: ${error}`);
    }
  }

  async getAllUserMessageIds(
    email: string,
    source = 'annam',
    session?: ClientSession,
  ) {
    try {
      await this.init(source);

      const user = await this.users.findOne({email}, {session});

      if (!user) {
        return [];
      }

      const messageIds = await this.messagesCollection.distinct('messageId', {
        user: String(user._id),

        messageId: {
          $exists: true,
          $ne: null,
        },
      });

      return messageIds;
    } catch (error) {
      throw new InternalServerError(`Failed to fetch all messageIds: ${error}`);
    }
  }

  // ── NEW: Inactivity-gap based avg session duration (KPI number) ──────────────
  // Uses the messages collection instead of conversations.
  // For each conversation: sums only the gaps between consecutive messages that
  // are ≤ 30 minutes. Gaps > 30 min are treated as the user being away and are
  // excluded. Single-message conversations are also excluded.
  // Requires MongoDB 5.0+ ($setWindowFields).
  async getAvgSessionDurationV2(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<number> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
            {$sort: {conversationId: 1, createdAt: 1}},
            {
              $setWindowFields: {
                partitionBy: '$conversationId',
                sortBy: {createdAt: 1},
                output: {
                  prevCreatedAt: {$shift: {output: '$createdAt', by: -1}},
                },
              },
            },
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
            // Discard gaps > 30 minutes (1,800,000 ms) — user was idle/away
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },
            {
              $group: {
                _id: '$conversationId',
                activeSessionMs: {$sum: '$activeGapMs'},
                msgCount: {$sum: 1},
              },
            },
            // Skip conversations with only 1 message — no gaps, nothing to measure
            {$match: {msgCount: {$gt: 1}}},
            {$group: {_id: null, avg: {$avg: '$activeSessionMs'}}},
          ],
          {session},
        )
        .toArray();

      const avgMs = result[0]?.avg ?? 0;
      return Math.round((avgMs / 60000) * 10) / 10;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get avg session duration v2: ${error}`,
      );
    }
  }

  // ── NEW: Inactivity-gap based weekly avg session duration (sparkline/delta) ──
  // Same gap-detection logic as getAvgSessionDurationV2, but groups results by
  // ISO week (based on the first message of each conversation) so the frontend
  // can render the sparkline and week-over-week % delta.
  async getWeeklyAvgSessionDurationV2(
    weeks = 52,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<WeeklySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {$match: {createdAt: {$gte: since}, isDeleted: {$ne: true}}},
            ...userTypeLookupStages,
            {$sort: {conversationId: 1, createdAt: 1}},
            {
              $setWindowFields: {
                partitionBy: '$conversationId',
                sortBy: {createdAt: 1},
                output: {
                  prevCreatedAt: {$shift: {output: '$createdAt', by: -1}},
                  firstMsgInConv: {
                    $first: '$createdAt',
                    window: {documents: ['unbounded', 'current']},
                  },
                },
              },
            },
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
            // Discard gaps > 30 minutes (1,800,000 ms) — user was idle/away
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },
            {
              $group: {
                _id: '$conversationId',
                activeSessionMs: {$sum: '$activeGapMs'},
                firstMsg: {$min: '$firstMsgInConv'},
                msgCount: {$sum: 1},
              },
            },
            {$match: {msgCount: {$gt: 1}}},
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

      return result as WeeklySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weekly avg session duration v2: ${error}`,
      );
    }
  }

  async getMonthlyAvgSessionDuration(
    months = 12,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<MonthlySessionDurationEntry[]> {
    try {
      await this.init(source);

      const since = new Date();
      since.setMonth(since.getMonth() - months);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: {
                createdAt: {$gte: since},
                isDeleted: {$ne: true},
              },
            },

            ...userTypeLookupStages,

            {
              $sort: {
                conversationId: 1,
                createdAt: 1,
              },
            },

            {
              $setWindowFields: {
                partitionBy: '$conversationId',

                sortBy: {
                  createdAt: 1,
                },

                output: {
                  prevCreatedAt: {
                    $shift: {
                      output: '$createdAt',
                      by: -1,
                    },
                  },

                  firstMsgInConv: {
                    $first: '$createdAt',

                    window: {
                      documents: ['unbounded', 'current'],
                    },
                  },
                },
              },
            },

            {
              $addFields: {
                gapMs: {
                  $cond: [
                    {$ifNull: ['$prevCreatedAt', false]},

                    {
                      $subtract: ['$createdAt', '$prevCreatedAt'],
                    },

                    0,
                  ],
                },
              },
            },

            // Ignore inactive gaps > 30 mins
            {
              $addFields: {
                activeGapMs: {
                  $cond: [{$lte: ['$gapMs', 1800000]}, '$gapMs', 0],
                },
              },
            },

            {
              $group: {
                _id: '$conversationId',

                activeSessionMs: {
                  $sum: '$activeGapMs',
                },

                firstMsg: {
                  $min: '$firstMsgInConv',
                },

                msgCount: {
                  $sum: 1,
                },
              },
            },

            // Ignore single-message conversations
            {
              $match: {
                msgCount: {$gt: 1},
              },
            },

            // MONTH GROUPING
            {
              $addFields: {
                month: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$firstMsg',
                    timezone: '+05:30',
                  },
                },
              },
            },

            {
              $group: {
                _id: '$month',

                avgDurationMs: {
                  $avg: '$activeSessionMs',
                },
              },
            },

            {
              $project: {
                month: '$_id',

                avgSessionDurationMin: {
                  $round: [
                    {
                      $divide: ['$avgDurationMs', 60000],
                    },
                    1,
                  ],
                },

                _id: 0,
              },
            },

            {
              $sort: {
                month: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      return result as MonthlySessionDurationEntry[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get monthly avg session duration: ${error}`,
      );
    }
  }

  async getUserDemographics(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<UserDemographics> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);
      const totalUsers = await this.users.countDocuments(
        {
          ...userDocFilter,
          farmerProfile: {$exists: true, $ne: null},
          isVerified: true,
        },
        {session},
      );

      const [ageRaw, genderRaw, expRaw, landRaw] = await Promise.all([
        // Age group buckets
        this.users
          .aggregate<{_id: string | number; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.age': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $bucket: {
                  groupBy: '$farmerProfile.age',
                  boundaries: [0, 16, 30, 45, 60],
                  default: '60+',
                  output: {count: {$sum: 1}},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Gender split
        this.users
          .aggregate<{_id: string; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.gender': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $addFields: {
                  normalizedGender: {
                    $toLower: {
                      $trim: {
                        input: '$farmerProfile.gender',
                      },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: '$normalizedGender',
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Farming experience buckets
        this.users
          .aggregate<{_id: number | string; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.yearsOfExperience': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $bucket: {
                  groupBy: '$farmerProfile.yearsOfExperience',
                  boundaries: [0, 2, 5, 10, 20],
                  default: '20+',
                  output: {count: {$sum: 1}},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Land holding buckets
        this.users
          .aggregate<{_id: number | string; count: number}>(
            [
              {
                $match: {
                  'farmerProfile.landhold': {$exists: true, $ne: null},
                  ...userDocFilter,
                },
              },
              {
                $bucket: {
                  groupBy: '$farmerProfile.landhold',
                  boundaries: [0, 2, 10],
                  default: 'Large',
                  output: {count: {$sum: 1}},
                },
              },
            ],
            {session},
          )
          .toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const ageBoundaryLabel: Record<string | number, string> = {
        0: 'Less than 16',
        16: '16-30',
        30: '30-45',
        45: '45-60',
        '60+': '60+',
      };
      const ageGroupsMap = new Map(ageRaw.map(r => [r._id, r.count]));

      const ageGroups: DemographicEntry[] = [0, 16, 30, 45, '60+'].map(key => {
        const count = ageGroupsMap.get(key) || 0;
        return {
          label: ageBoundaryLabel[key],
          count,
          pct: toPct(count, totalUsers),
        };
      });
      const providedAgeCount = ageGroups.reduce((s, g) => s + g.count, 0);
      ageGroups.push({
        label: 'Not Provided',
        count: totalUsers - providedAgeCount,
        pct: toPct(totalUsers - providedAgeCount, totalUsers),
      });

      let maleCount = 0;
      let femaleCount = 0;
      let othersCount = 0;

      genderRaw.forEach(r => {
        const genderStr = (r._id ?? '').toLowerCase();
        if (genderStr === 'male') {
          maleCount += r.count;
        } else if (genderStr === 'female') {
          femaleCount += r.count;
        } else {
          othersCount += r.count;
        }
      });

      const providedGenderCount = maleCount + femaleCount + othersCount;
      const genderSplit: DemographicEntry[] = [
        {label: 'Male', count: maleCount, pct: toPct(maleCount, totalUsers)},
        {
          label: 'Female',
          count: femaleCount,
          pct: toPct(femaleCount, totalUsers),
        },
        {
          label: 'Others',
          count: othersCount,
          pct: toPct(othersCount, totalUsers),
        },
        {
          label: 'Not Provided',
          count: totalUsers - providedGenderCount,
          pct: toPct(totalUsers - providedGenderCount, totalUsers),
        },
      ].filter(g => g.count > 0 || g.label === 'Not Provided');

      const expBoundaryLabel: Record<string | number, string> = {
        0: 'Less than 2 yrs',
        2: '2 - 5 yrs',
        5: '5 - 10 yrs',
        10: '10 - 20 yrs',
        '20+': '20+ yrs',
      };
      let providedExpCount = 0;
      const farmingExperience: DemographicEntry[] = expRaw.map(r => {
        providedExpCount += r.count;
        return {
          label: expBoundaryLabel[r._id] ?? String(r._id),
          count: r.count,
          pct: toPct(r.count, totalUsers),
        };
      });
      farmingExperience.push({
        label: 'Not Provided',
        count: totalUsers - providedExpCount,
        pct: toPct(totalUsers - providedExpCount, totalUsers),
      });

      const landBoundaryLabel: Record<string | number, string> = {
        0: 'Small',
        2: 'Medium',
        Large: 'Large',
      };
      let providedLandCount = 0;
      const landHolding: DemographicEntry[] = landRaw.map(r => {
        providedLandCount += r.count;
        return {
          label: landBoundaryLabel[r._id] ?? String(r._id),
          count: r.count,
          pct: toPct(r.count, totalUsers),
        };
      });
      landHolding.push({
        label: 'Not Provided',
        count: totalUsers - providedLandCount,
        pct: toPct(totalUsers - providedLandCount, totalUsers),
      });

      return {ageGroups, genderSplit, farmingExperience, landHolding};
    } catch (error) {
      throw new InternalServerError(
        `Failed to get user demographics: ${error}`,
      );
    }
  }

  private buildDemographicFilter(
    category: string,
    value: string,
  ): Record<string, any> {
    const isNotProvided = value.toLowerCase() === 'not provided';

    const getNotProvidedFilter = (field: string) => ({
      $or: [{[field]: {$exists: false}}, {[field]: null}, {[field]: ''}],
    });

    switch (category) {
      case 'age':
        if (isNotProvided) return getNotProvidedFilter('farmerProfile.age');
        if (value === 'Less than 16')
          return {'farmerProfile.age': {$gte: 0, $lt: 16}};
        if (value === '16-30')
          return {'farmerProfile.age': {$gte: 16, $lt: 30}};
        if (value === '30-45')
          return {'farmerProfile.age': {$gte: 30, $lt: 45}};
        if (value === '45-60')
          return {'farmerProfile.age': {$gte: 45, $lt: 60}};
        if (value === '60+') return {'farmerProfile.age': {$gte: 60}};
        break;

      case 'gender':
        if (isNotProvided) return getNotProvidedFilter('farmerProfile.gender');
        return {
          'farmerProfile.gender': {
            $regex: `^${value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`,
            $options: 'i',
          },
        };

      case 'experience':
        if (isNotProvided)
          return getNotProvidedFilter('farmerProfile.yearsOfExperience');
        if (value === 'Less than 2 yrs')
          return {'farmerProfile.yearsOfExperience': {$gte: 0, $lt: 2}};
        if (value === '2 - 5 yrs')
          return {'farmerProfile.yearsOfExperience': {$gte: 2, $lt: 5}};
        if (value === '5 - 10 yrs')
          return {'farmerProfile.yearsOfExperience': {$gte: 5, $lt: 10}};
        if (value === '10 - 20 yrs')
          return {'farmerProfile.yearsOfExperience': {$gte: 10, $lt: 20}};
        if (value === '20+ yrs')
          return {'farmerProfile.yearsOfExperience': {$gte: 20}};
        break;

      case 'landholding':
        if (isNotProvided)
          return getNotProvidedFilter('farmerProfile.landhold');
        if (value.startsWith('Small'))
          return {'farmerProfile.landhold': {$gte: 0, $lt: 2}};
        if (value.startsWith('Medium'))
          return {'farmerProfile.landhold': {$gte: 2, $lt: 10}};
        if (value.startsWith('Large'))
          return {'farmerProfile.landhold': {$gte: 10}};
        break;

      case 'kccAwareness':
      case 'awarenessOfKCC':
        if (value.toLowerCase() === 'yes') {
          return { 'farmerProfile.awarenessOfKCC': true };
        } else if (value.toLowerCase() === 'no') {
          return { 'farmerProfile.awarenessOfKCC': { $ne: true } };
        }
        break;

      case 'agriAppUsage':
      case 'usesAgriApps':
        if (value.toLowerCase() === 'yes') {
          return { 'farmerProfile.usesAgriApps': true };
        } else if (value.toLowerCase() === 'no') {
          return { 'farmerProfile.usesAgriApps': { $ne: true } };
        }
        break;
    }

    return {};
  }

  async getUsersByDemographic(
    category: string,
    value: string,
    source = 'annam',
    userType = 'all',
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    session?: ClientSession,
  ): Promise<PaginatedUserDetails> {
    try {
      await this.init(source);

      const userFilter: Record<string, any> = {
        ...this.buildUserDocFilter(userType),
        isVerified: true,
        farmerProfile: { $exists: true, $ne: null },
      };

      if (search && search.trim()) {
        const escaped = search
          .trim()
          .replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        const regex = {$regex: escaped, $options: 'i'};
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {$or: [{name: regex}, {username: regex}, {email: regex}]},
        ];
      }

      const demographicFilter = this.buildDemographicFilter(category, value);
      if (Object.keys(demographicFilter).length > 0) {
        userFilter.$and = [...(userFilter.$and ?? []), demographicFilter];
      }

      const sortOptions: Record<string, 1 | -1> = {};
      const sortDirection = sortOrder === 'asc' ? 1 : -1;

      switch (sortBy) {
        case 'name':
          sortOptions.name = sortDirection;
          break;
        case 'farmerName':
          sortOptions['farmerProfile.farmerName'] = sortDirection;
          break;
        case 'email':
          sortOptions.email = sortDirection;
          break;
        case 'createdAt':
        default:
          sortOptions.createdAt = sortDirection;
          break;
      }

      const skip = (page - 1) * limit;

      const [users, totalUsers] = await Promise.all([
        this.users
          .find(userFilter, {session})
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.users.countDocuments(userFilter, {session}),
      ]);

      const formattedUsers: UserDetailEntry[] = users.map(user => ({
        userId: String(user._id),
        name: user.name || user.firstName || '',
        email: user.email || '',
        role: user.role,
        userRole: user.userRole,
        totalQuestions: 0,
        farmerProfile: user.farmerProfile,
        createdAt: user.createdAt,
        isVerified: user.isVerified,
      }));

      return {
        users: formattedUsers,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
        page,
        limit,
        activeUsers: 0,
        inactiveUsers: 0,
        totalQuestions: 0,
      } as unknown as PaginatedUserDetails;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get users by demographic: ${error}`,
      );
    }
  }

  async getUsersByPlatform(
    platform: string,
    source = 'annam',
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userType = 'all',
    session?: ClientSession,
  ): Promise<PaginatedUserDetails> {
    try {
      await this.init(source);

      const userFilter: Record<string, any> = {
        ...this.buildUserDocFilter(userType),
        isVerified: true,
        farmerProfile: { $exists: true, $ne: null },
      };

      const normalizedPlatform = platform?.trim();
      const basePlatformFilter = {
        farmerProfile: {$exists: true, $ne: null},
        isVerified: true,
      };
      const platformFilter =
        normalizedPlatform === 'Unknown'
          ? {
              ...basePlatformFilter,
              $or: [
                {'farmerProfile.platform': {$exists: false}},
                {'farmerProfile.platform': null},
                {'farmerProfile.platform': ''},
                {
                  $expr: {
                    $eq: [
                      {
                        $trim: {
                          input: {$ifNull: ['$farmerProfile.platform', '']},
                        },
                      },
                      '',
                    ],
                  },
                },
              ],
            }
          : {
              ...basePlatformFilter,
              'farmerProfile.platform': normalizedPlatform,
            };

      userFilter.$and = [...(userFilter.$and ?? []), platformFilter];

      if (search && search.trim()) {
        const escaped = search
          .trim()
          .replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        const regex = {$regex: escaped, $options: 'i'};
        userFilter.$and = [
          ...(userFilter.$and ?? []),
          {
            $or: [
              {name: regex},
              {email: regex},
              {'farmerProfile.phoneNo': regex},
            ],
          },
        ];
      }

      const sortOptions: Record<string, 1 | -1> = {};
      const sortDirection = sortOrder === 'asc' ? 1 : -1;

      switch (sortBy) {
        case 'name':
          sortOptions.name = sortDirection;
          break;
        case 'email':
          sortOptions.email = sortDirection;
          break;
        case 'createdAt':
        default:
          sortOptions.createdAt = sortDirection;
          break;
      }

      const skip = (page - 1) * limit;

      const [users, totalUsers] = await Promise.all([
        this.users
          .find(userFilter, {session})
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.users.countDocuments(userFilter, {session}),
      ]);

      const formattedUsers: UserDetailEntry[] = users.map(user => ({
        userId: String(user._id),
        name: user.name || user.firstName || '',
        email: user.email || '',
        role: user.role,
        userRole: user.userRole,
        totalQuestions: 0,
        farmerProfile: user.farmerProfile,
        createdAt: user.createdAt,
        isVerified: user.isVerified,
      }));

      return {
        users: formattedUsers,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
        page,
        limit,
        activeUsers: 0,
        inactiveUsers: 0,
        totalQuestions: 0,
      } as unknown as PaginatedUserDetails;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get users by platform: ${error}`,
      );
    }
  }

  // async getKccAndAgriAppStats(source = 'annam', session?: ClientSession, userType = 'all'): Promise<KccAndAgriAppStats> {
  //   try {
  //     await this.init(source);
  //     const userDocFilter = this.buildUserDocFilter(userType);

  //     const [kccRaw, agriRaw] = await Promise.all([
  //       // KCC awareness split
  //     this.users.aggregate<{ _id: boolean; count: number }>(
  //         [
  //           { $match: { 'farmerProfile.awarenessOfKCC': { $exists: true, $ne: null }, ...userDocFilter } },
  //           { $group: { _id: '$farmerProfile.awarenessOfKCC', count: { $sum: 1 } } },
  //         ],
  //         { session },
  //       ).toArray(),

  //       // Agri apps usage split
  //       this.users.aggregate<{ _id: boolean; count: number }>(
  //         [
  //           { $match: { 'farmerProfile.usesAgriApps': { $exists: true, $ne: null }, ...userDocFilter } },
  //           { $group: { _id: '$farmerProfile.usesAgriApps', count: { $sum: 1 } } },
  //         ],
  //         { session },
  //       ).toArray(),
  //     ]);
  //     console.log('Raw KCC awareness data:', kccRaw);
  //     console.log('Raw agri app usage data:', agriRaw);

  //     const toPct = (count: number, total: number) =>
  //       total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

  //     const kccTotal = kccRaw.reduce((s, r) => s + r.count, 0);
  //     const kccAwareness: DemographicEntry[] = kccRaw
  //       .sort((_, b) => (b._id ? 1 : -1))
  //       .map(r => ({
  //         label: r._id ? 'Aware' : 'Not Aware',
  //         count: r.count,
  //         pct: toPct(r.count, kccTotal),
  //       }));

  //     const agriTotal = agriRaw.reduce((s, r) => s + r.count, 0);
  //     const agriAppUsage: DemographicEntry[] = agriRaw
  //       .sort((_, b) => (b._id ? 1 : -1))
  //       .map(r => ({
  //         label: r._id ? 'Uses Apps' : 'Does Not Use',
  //         count: r.count,
  //         pct: toPct(r.count, agriTotal),
  //       }));

  //     return { kccAwareness, agriAppUsage };
  //   } catch (error) {
  //     throw new InternalServerError(`Failed to get KCC and agri app stats: ${error}`);
  //   }
  // }

  async getKccAndAgriAppStats(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<KccAndAgriAppStats> {
    try {
      await this.init(source);

      const userDocFilter = this.buildUserDocFilter(userType);

      const [kccRaw, agriRaw] = await Promise.all([
        // KCC awareness split
        this.users
          .aggregate<{_id: boolean; count: number}>(
            [
              {
                $match: {
                  farmerProfile: {$exists: true, $ne: null},
                  isVerified: true,
                  ...userDocFilter,
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [
                      {$eq: ['$farmerProfile.awarenessOfKCC', true]},
                      true,
                      false,
                    ],
                  },
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),

        // Agri apps usage split
        this.users
          .aggregate<{_id: boolean; count: number}>(
            [
              {
                $match: {
                  farmerProfile: {$exists: true, $ne: null},
                  isVerified: true,
                  ...userDocFilter,
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [
                      {$eq: ['$farmerProfile.usesAgriApps', true]},
                      true,
                      false,
                    ],
                  },
                  count: {$sum: 1},
                },
              },
            ],
            {session},
          )
          .toArray(),
      ]);

      const toPct = (count: number, total: number) =>
        total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(2));

      const kccTotal = kccRaw.reduce((s, r) => s + r.count, 0);

      const kccAwareness: DemographicEntry[] = kccRaw
        .sort((a, b) => Number(b._id) - Number(a._id))
        .map(r => ({
          label: r._id ? 'Aware' : 'Not Aware',
          count: r.count,
          pct: toPct(r.count, kccTotal),
        }));

      const agriTotal = agriRaw.reduce((s, r) => s + r.count, 0);

      const agriAppUsage: DemographicEntry[] = agriRaw
        .sort((a, b) => Number(b._id) - Number(a._id))
        .map(r => ({
          label: r._id ? 'Uses Apps' : 'Does Not Use',
          count: r.count,
          pct: toPct(r.count, agriTotal),
        }));

      return {kccAwareness, agriAppUsage};
    } catch (error) {
      throw new InternalServerError(
        `Failed to get KCC and agri app stats: ${error}`,
      );
    }
  }

  async generateChatbotExcelReport(
    startDate: Date,
    endDate: Date,
    source = 'annam',
    session?: ClientSession,
  ): Promise<ChatbotConversationData[]> {
    try {
      await this.init(source);
      return this.messagesCollection
        .aggregate<ChatbotConversationData>(
          [
            {
              $match: {
                createdAt: {$gte: startDate, $lte: endDate},
                isDeleted: {$ne: true},
              },
            },
            {
              $group: {
                _id: '$conversationId',
                farmerQuestions: {
                  $push: {
                    $cond: {
                      if: {$eq: ['$isCreatedByUser', true]},
                      then: '$text',
                      else: null,
                    },
                  },
                },
                mcpToolCalls: {
                  $push: {
                    $cond: {
                      if: {$eq: ['$isCreatedByUser', false]},
                      then: '$content',
                      else: null,
                    },
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                conversationId: '$_id',
                farmerQuestions: {
                  $filter: {
                    input: '$farmerQuestions',
                    as: 'q',
                    cond: {
                      $and: [{$ne: ['$$q', null]}, {$ne: ['$$q', '']}],
                    },
                  },
                },
                mcpToolCalls: {
                  $filter: {
                    input: '$mcpToolCalls',
                    as: 'c',
                    cond: {
                      $and: [
                        {$ne: ['$$c', null]},
                        {$gt: [{$size: {$ifNull: ['$$c', []]}}, 0]},
                      ],
                    },
                  },
                },
              },
            },
            {$match: {'farmerQuestions.0': {$exists: true}}},
          ],
          {maxTimeMS: 60000, allowDiskUse: true, session},
        )
        .toArray();
    } catch (error) {
      throw new InternalServerError(
        `Failed to generate chatbot Excel report: ${error}`,
      );
    }
  }

  async generateChatBotData(
    startDate,
    endDate,
    days = 30,
    userType = 'all',
    month?: string,
    district?: ILocationDistrict[],
    state?: string,
    source = 'annam',
    session?: ClientSession,
  ) {
    const currentMonth =
      month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // let districtAnalytics;
    const kpiData = await this.getKpiSummary(
      source,
      session,
      (userType = 'all'),
    );
    const monthlyQueries = await this.getMonthlyAnalytics(
      source,
      session,
      (userType = 'all'),
    );
    const weeklyQueries = await this.getWeeklyAnalytics(
      currentMonth,
      source,
      session,
      userType,
    );
    const dailyQueries = await this.getDailyAnalytics(
      currentMonth,
      source,
      session,
      userType,
    );
    const dauTrends = await this.getDailyUserTrend(
      days,
      source,
      session,
      userType,
    );
    const averageSession = await this.getAvgSessionDurationV2(
      source,
      session,
      userType,
    );
    const demographicData = await this.getUserDemographics(
      source,
      session,
      userType,
    );
    const queryCatagoryData = await this.getQueryCategories(
      source,
      session,
      userType,
    );
    const topCrops = await this.getTopCrops(source, userType, session);
    const topTenFaqs = await this.getTopQuestionsFromCollection(
      source,
      session,
      userType,
    );
    const districtAnalytics = await this.getDistrictAnalyticsByState(
      state,
      district,
      source,
      session,
      userType,
    );
    const feedbackData = await this.getFeedbackData(source, session, userType);
    const dataToShow = {
      totalDownloads: kpiData.totalAppInstalls,
      averageSession: averageSession,
      dau: dauTrends[dauTrends.length - 1].count || 0,
      feedback: feedbackData.stats.totalFeedbacks,
      positiveFeedBackCount: feedbackData.stats.positiveCount,
      negativeFeedBackCount: feedbackData.stats.negativeCount,
      feedbackAccpetancePct: (feedbackData.stats.averageRating * 100).toFixed(
        2,
      ),
      monthlyQueries,
      dailyQueries,
      weeklyQueries,
      genderSplit: demographicData.genderSplit,
      farmingExperience: demographicData.farmingExperience,
      ageGroup: demographicData.ageGroups,
      queryCatagoryData,
      topCrops,
      topTenFaqs,
      districtAnalytics,
      positiveFeedback: feedbackData.positiveFeedbackCounts,
      negativeFeedback: feedbackData.negativeFeedbackCounts,
    };

    return dataToShow;
  }

  async getIdsCreated(
    userType: string,
    startDate: Date,
    endDate: Date,
    session?: ClientSession,
  ) {
    try {
      await this.init('annam');
      const userMatch =
        userType === 'all'
          ? {}
          : userType === 'external'
            ? buildExternalUserMatch()
            : {
                userRole: 'INTERNAL',
              };
      const result = await this.users
        .aggregate([
          {
            $match: {
              createdAt: {$gte: startDate, $lte: endDate},
              ...userMatch,
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {format: '%Y-%m-%d', date: '$createdAt'},
              },
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get IDs created: ${error}`);
    }
  }

  async getInstalls(
    userType: string,
    startDate: Date,
    endDate: Date,
    session?: ClientSession,
  ) {
    try {
      await this.init('annam');
      const userMatch =
        userType === 'all'
          ? {}
          : userType === 'external'
            ? buildExternalUserMatch()
            : {
                userRole: 'INTERNAL',
              };
      const result = await this.users
        .aggregate([
          {
            $match: {
              farmerProfile: {$exists: true, $ne: null},
              updatedAt: {$gte: startDate, $lte: endDate},
              ...userMatch,
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {format: '%Y-%m-%d', date: '$updatedAt'},
              },
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get installs: ${error}`);
    }
  }

  async getActiveUsers(
    userType: string,
    startDate: Date,
    endDate: Date,
    session?: ClientSession,
  ) {
    try {
      await this.init('annam');
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);
      const result = await this.messagesCollection
        .aggregate([
          {
            $match: {
              createdAt: {$gte: startDate, $lte: endDate},
              isDeleted: {$ne: true},
            },
          },
          ...userTypeLookupStages,
          {
            $group: {
              _id: {
                date: {$dateToString: {format: '%Y-%m-%d', date: '$createdAt'}},
                user: '$user',
              },
            },
          },
          {
            $group: {
              _id: '$_id.date',
              count: {$sum: 1},
            },
          },
          {
            $sort: {_id: 1},
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get active users: ${error}`);
    }
  }

  //get platform installs
  async getPlatformInstalls(
    source: 'annam',
    session?: ClientSession,
    userType = 'all',
  ): Promise<PlatformInstallEntry[]> {
    try {
      await this.init(source);
      const userDocFilter = this.buildUserDocFilter(userType);
      const result = await this.users
        .aggregate<PlatformInstallEntry>([
          {
            $match: {
              farmerProfile: {$exists: true, $ne: null},
              isVerified: true,
              ...userDocFilter,
            },
          },
          {
            $project: {
              platform: {
                $let: {
                  vars: {
                    rawPlatform: {
                      $trim: {
                        input: {$ifNull: ['$farmerProfile.platform', '']},
                      },
                    },
                  },
                  in: {
                    $cond: [
                      {$eq: ['$$rawPlatform', '']},
                      'Unknown',
                      '$$rawPlatform',
                    ],
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: '$platform',
              count: {$sum: 1},
            },
          },
          {
            $project: {
              _id: 0,
              platform: '$_id',
              count: 1,
            },
          },
        ])
        .toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get platform installs: ${error}`,
      );
    }
  }

  async getDuplicateQuestions(
    source = 'annam',
    session?: ClientSession,
  ): Promise<DuplicateQuestionEntry[]> {
    try {
      // init(source) sets this.messagesCollection and this.users to the selected DB
      await this.initReviewSystem();
      await this.init(source);

      if (source === 'whatsapp') {
        return await this.getWhatsAppDuplicateQuestions();
      }
      // 1. Fetch duplicate questions from the main review DB
      const dupeQuestions = await this.QuestionCollection.find(
        {
          similarityScore: {$exists: true},
          $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
          status: {$ne: 'non_agri'},
        },
        {session},
      )
        .project<{
          _id: any;
          question: string;
          referenceQuestion?: string;
          originalQuestion?: string;
          similarityScore: number;
          messageId?: string;
          createdAt: Date;
        }>({
          question: 1,
          referenceQuestion: 1,
          originalQuestion: 1,
          similarityScore: 1,
          messageId: 1,
          createdAt: 1,
        })
        .sort({createdAt: -1})
        .toArray();

      if (dupeQuestions.length === 0) return [];

      // 2. Only process questions that have messageId stored
      const messageIds = dupeQuestions
        .map(q => q.messageId)
        .filter(Boolean) as string[];
      if (messageIds.length === 0) return [];

      // 3. Look up messages in annam analytics DB.
      // Questions whose messageId has no matching document are excluded entirely.
      const messages = await this.messagesCollection
        .find({messageId: {$in: messageIds}, isDeleted: {$ne: true}})
        .project<{messageId: string; user: string}>({messageId: 1, user: 1})
        .toArray();

      const messageToUser = new Map<string, string>(
        messages
          .filter(m => m.messageId && m.user)
          .map(m => [m.messageId, m.user]),
      );

      // 4. Look up users from annam analytics DB
      const userIds = [...new Set(messages.map(m => m.user).filter(Boolean))];
      const users =
        userIds.length > 0
          ? await this.users
              .find({
                _id: {
                  $in: userIds
                    .map(id => {
                      try {
                        return new ObjectId(id);
                      } catch {
                        return null;
                      }
                    })
                    .filter(Boolean),
                },
              })
              .project<{
                _id: any;
                name?: string;
                email?: string;
                farmerProfile?: {
                  farmerName?: string;
                  villageName?: string;
                  blockName?: string;
                  district?: string;
                  state?: string;
                };
              }>({
                name: 1,
                email: 1,
                'farmerProfile.farmerName': 1,
                'farmerProfile.villageName': 1,
                'farmerProfile.blockName': 1,
                'farmerProfile.district': 1,
                'farmerProfile.state': 1,
              })
              .toArray()
          : [];

      const userMap = new Map(users.map(u => [u._id.toString(), u]));

      // 5. Build results — skip any question whose messageId has no matching message
      const results: DuplicateQuestionEntry[] = [];
      for (const q of dupeQuestions) {
        if (!q.messageId) continue;
        const userId = messageToUser.get(q.messageId);
        if (!userId) continue;
        const user = userMap.get(userId);
        results.push({
          questionId: q._id.toString(),
          userId,
          question: q.question,
          referenceQuestion: q.referenceQuestion || q.originalQuestion || '',
          similarityScore: Number(q.similarityScore) || 0,
          createdAt: q.createdAt,
          farmerName: user?.farmerProfile?.farmerName || user?.name || '—',
          email: user?.email || '—',
          village: user?.farmerProfile?.villageName || '—',
          block: user?.farmerProfile?.blockName || '—',
          district: user?.farmerProfile?.district || '—',
          state: user?.farmerProfile?.state || '—',
        });
      }
      return results;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get duplicate questions: ${error}`,
      );
    }
  }

  async getDomainSpikes(days = 60, session?: ClientSession) {
    try {
      await this.initReviewSystem();

      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const domainMatch = {
        createdAt: {$gte: since},
        'details.domain': {$exists: true, $nin: [null, '']},
      };

      const locationPush = {
        $push: {
          $cond: [
            {
              $and: [
                {$ne: ['$details.district', null]},
                {$ne: ['$details.state', null]},
                {$ne: ['$details.district', '']},
                {$ne: ['$details.state', '']},
              ],
            },
            {$concat: ['$details.district', ', ', '$details.state']},
            '$$REMOVE',
          ],
        },
      };

      const groupStage = {
        $group: {
          _id: {
            domain: '$details.domain',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: '+05:30',
              },
            },
          },
          count: {$sum: 1},
          locations: locationPush,
        },
      };

      const matchStage = {
        ...domainMatch,
        $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
        status: {$ne: 'non_agri'},
      };

      const pipeline: any[] = [
        {
          $match: matchStage,
        },
        groupStage,
        {
          $unionWith: {
            coll: 'duplicate_questions',
            pipeline: [{$match: matchStage}, groupStage],
          },
        },
        {
          $group: {
            _id: '$_id',
            count: {$sum: '$count'},
            locations: {$push: '$locations'},
          },
        },
        {$sort: {'_id.domain': 1, '_id.date': 1}},
      ];

      const raw = await this.QuestionCollection.aggregate(pipeline, {
        session,
        allowDiskUse: true,
      }).toArray();

      // Group by domain, compute average baseline, detect spikes
      const byDomain = new Map<
        string,
        Array<{date: string; count: number; locations: string[][]}>
      >();
      for (const row of raw) {
        const domain = row._id.domain as string;
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain)!.push({
          date: row._id.date,
          count: row.count,
          locations: row.locations,
        });
      }

      const SPIKE_THRESHOLD = 1.5; // 50% above average = spike
      const MIN_BASELINE = 3;
      const spikes: any[] = [];

      for (const [domain, entries] of byDomain) {
        if (entries.length < 3) continue;

        const totalCount = entries.reduce((s, e) => s + e.count, 0);
        const avgBaseline = totalCount / entries.length;
        if (avgBaseline < MIN_BASELINE) continue;

        for (const entry of entries) {
          if (entry.count >= avgBaseline * SPIKE_THRESHOLD) {
            const allLocs = entry.locations.flat();
            const locFreq = new Map<string, number>();
            for (const loc of allLocs) {
              if (loc) locFreq.set(loc, (locFreq.get(loc) ?? 0) + 1);
            }
            const topLoc = [...locFreq.entries()].sort(
              (a, b) => b[1] - a[1],
            )[0]?.[0];

            spikes.push({
              domain,
              date: entry.date,
              count: entry.count,
              baseline: Math.round(avgBaseline),
              spikePct: Math.round(
                ((entry.count - avgBaseline) / avgBaseline) * 100,
              ),
              location: topLoc ?? undefined,
            });
          }
        }
      }

      spikes.sort((a, b) => b.spikePct - a.spikePct);
      return spikes.slice(0, 50);
    } catch (error) {
      throw new InternalServerError(`Failed to get domain spikes: ${error}`);
    }
  }

  async getDailyQuestionTrends(
    days = 30,
    dbSource?: string,
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<
    Array<{day: string; uniqueCount: number; duplicateCount: number}>
  > {
    try {
      await this.initReviewSystem();

      const matchQuery = buildBaseQuestionMatch(dbSource);

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      const query = await this.buildQuestionUserTypeMatchQuery(
        dbSource,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },
          // ...userTypeLookupStages,
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
                isDuplicate: {
                  $cond: [
                    {$eq: ['$status', 'duplicate']},
                    'duplicate',
                    'unique',
                  ],
                },
              },
              count: {$sum: 1},
            },
          },
          {
            $group: {
              _id: '$_id.day',
              uniqueCount: {
                $sum: {
                  $cond: [{$eq: ['$_id.isDuplicate', 'unique']}, '$count', 0],
                },
              },
              duplicateCount: {
                $sum: {
                  $cond: [
                    {$eq: ['$_id.isDuplicate', 'duplicate']},
                    '$count',
                    0,
                  ],
                },
              },
            },
          },
          {$sort: {_id: 1}},
        ],
        {session},
      ).toArray();

      return result.map(r => ({
        day: r._id,
        uniqueCount: r.uniqueCount,
        duplicateCount: r.duplicateCount,
      }));
    } catch (error) {
      throw new InternalServerError(
        `Failed to get daily question trends: ${error}`,
      );
    }
  }

  async getTopFaqs(
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{question: string; count: number}>> {
    try {
      if (source === 'whatsapp') {
        return await this.getWhatsAppTopFaqs(startTime, endTime);
      }
      await this.init(source);
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const queryMatch: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
        text: {$exists: true, $ne: null, $nin: ['', ' ']},
      };

      if (startTime || endTime) {
        queryMatch.createdAt = {};
        if (startTime) {
          queryMatch.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          queryMatch.createdAt.$lte = new Date(endTime);
        }
      }

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: queryMatch,
            },
            ...userTypeLookupStages,
            {
              $group: {
                _id: {$trim: {input: '$text'}},
                count: {$sum: 1},
              },
            },
            {$sort: {count: -1}},
            {$limit: 10},
          ],
          {session},
        )
        .toArray();

      return result.map(r => ({
        question: r._id,
        count: r.count,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to get top FAQs: ${error}`);
    }
  }

  async getTopQuestionsFromCollection(
    dbSource = 'annam',
    session?: ClientSession,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{questionId: string; question: string; count: number}>> {
    try {
      await this.initReviewSystem();
      const matchQuery = buildBaseQuestionMatch(dbSource);

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      const query = await this.buildQuestionUserTypeMatchQuery(
        dbSource,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      // const userTypeLookupStages =
      //   this.buildQuestionUserTypeLookupStages(userType);

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },
          // ...userTypeLookupStages,
          {
            $project: {
              resolvedId: {$ifNull: ['$referenceQuestionId', '$_id']},
              question: 1,
            },
          },
          {
            $group: {
              _id: '$resolvedId',
              count: {$sum: 1},
              firstQuestion: {$first: '$question'},
            },
          },
          {
            $lookup: {
              from: 'questions',
              localField: '_id',
              foreignField: '_id',
              as: 'originalDoc',
            },
          },
          {
            $project: {
              question: {
                $ifNull: [
                  {$arrayElemAt: ['$originalDoc.question', 0]},
                  '$firstQuestion',
                ],
              },
              count: 1,
            },
          },
          {
            $match: {
              question: {$exists: true, $ne: null, $nin: ['', ' ']},
            },
          },
          {$sort: {count: -1}},
          {$limit: 10},
        ],
        {session},
      ).toArray();

      return result.map(r => ({
        questionId: String(r._id),
        question: r.question,
        count: r.count,
      }));
    } catch (error) {
      throw new InternalServerError(
        `Failed to get top questions from collection: ${error}`,
      );
    }
  }

  async getTopQuestionInstances(
    questionId: string,
    dbSource = 'annam',
    userType = 'all',
    startTime?: string,
    endTime?: string,
    page: number = 1,
    limit: number = 10,
    session?: ClientSession,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      await this.init(dbSource);
      await this.initReviewSystem();
      const matchQuery = buildBaseQuestionMatch(dbSource);

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      const query = await this.buildQuestionUserTypeMatchQuery(
        dbSource,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      let qId;
      try {
        qId = new ObjectId(questionId);
      } catch (e) {
        // Handle case where questionId is not a valid ObjectId
        qId = questionId;
      }

      const skip = (page - 1) * limit;

      const result = await this.QuestionCollection.aggregate(
        [
          {$match: matchQuery},
          {
            $addFields: {
              resolvedId: {$ifNull: ['$referenceQuestionId', '$_id']},
            },
          },
          {
            $match: {
              resolvedId: qId,
            },
          },
          {$sort: {createdAt: -1}},
          {
            $facet: {
              metadata: [{$count: 'total'}],
              data: [
                {$skip: skip},
                {$limit: limit},
                {
                  $project: {
                    _id: 1,
                    threadId: 1,
                    question: 1,
                    createdAt: 1,
                    status: 1,
                    source: 1,
                    userRole: 1,
                    userId: 1,
                    messageId: 1,
                  },
                },
              ],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata[0]?.total || 0;
      const rawData = result[0]?.data || [];
      const totalPages = Math.ceil(total / limit);

      const resolved = await this.resolveQuestionUsers(rawData);
      const userMap = resolved.userMap;
      const questionUserMap = resolved.questionUserMap;

      const enrichedData = rawData.map((question: any) => {
        const questionId = question.questionId ?? question._id?.toString();
        const resolvedUserId = questionUserMap.get(questionId);
        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;
        return {
          ...question,
          email: user?.email || null,
        };
      });

      return {
        data: enrichedData,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get top question instances: ${error}`,
      );
    }
  }

  async getUserById(userId: string, source: string): Promise<any> {
    try {
      await this.init(source);
      return await this.users.findOne({_id: new ObjectId(userId)});
    } catch (error) {
      throw new InternalServerError(`Failed to fetch user by id: ${error}`);
    }
  }

  async deleteUser(userId: string, source: string): Promise<boolean> {
    try {
      await this.init(source);
      const userObjectId = new ObjectId(userId);
      const existingUser = await this.users.findOne({_id: userObjectId});

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      const reviewSystemUser =
        source === 'whatsapp'
          ? null
          : await this.findMatchingReviewSystemUser(existingUser);

      await this.messagesCollection.updateMany(
        {user: userId},
        {$set: {isDeleted: true}},
      );
      const result = await this.users.deleteOne({_id: userObjectId});

      if (result.deletedCount !== 1) {
        return false;
      }

      if (reviewSystemUser?._id) {
        await this.deleteReviewSystemUser(reviewSystemUser);
      }

      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError(`Failed to delete user: ${error}`);
    }
  }

  private async findMatchingReviewSystemUser(
    user: IUser,
  ): Promise<IUser | null> {
    const lookupConditions: any[] = [];

    const email = user.email?.trim();
    if (email) {
      lookupConditions.push({
        email: new RegExp(`^${this.escapeRegex(email)}$`, 'i'),
      });
    }

    if (user.firebaseUID) {
      lookupConditions.push({firebaseUID: user.firebaseUID});
    }

    if (lookupConditions.length === 0) {
      return null;
    }

    const reviewSystemUsers = await this.db.getCollection<IUser>('users');
    return await reviewSystemUsers.findOne({$or: lookupConditions});
  }

  private async deleteReviewSystemUser(user: IUser): Promise<void> {
    if (!user._id) {
      return;
    }

    const reviewUserId = new ObjectId(user._id);
    const reviewSystemUsers = await this.db.getCollection<IUser>('users');
    const reviewSystemSessions = await this.db.getCollection<any>('sessions');
    const reviewSystemNotifications =
      await this.db.getCollection<any>('notifications');
    const reviewSystemSubscriptions =
      await this.db.getCollection<any>('subscriptions');

    await reviewSystemSessions.deleteMany({user: reviewUserId});
    await reviewSystemNotifications.deleteMany({
      $or: [{userId: reviewUserId}, {enitity_id: reviewUserId}],
    });
    await reviewSystemSubscriptions.deleteMany({userId: reviewUserId});
    await reviewSystemUsers.deleteOne({_id: reviewUserId});

    if (user.firebaseUID) {
      const firebaseAuth = getFirebaseAuth();
      await firebaseAuth.deleteUser(user.firebaseUID).catch((error: any) => {
        if (error?.code === 'auth/user-not-found') {
          return;
        }
        throw error;
      });
    }
  }

  async updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
      userRole?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        nearestKVK?: string;
        languagePreference?: string;
        yearsOfExperience?: number;
        cropsCultivated?: string[];
        primaryCrop?: string;
        secondaryCrop?: string;
        awarenessOfKCC?: boolean;
        usesAgriApps?: boolean;
        highestEducatedPerson?: string;
        numberOfSmartphones?: number;
        platform?: string;
        landhold?: number;
      };
    },
  ): Promise<boolean> {
    try {
      await this.init(source);
      const appUsersCollection = await this.db.getCollection<any>('users');

      const unsetPayload: Record<string, ''> = {};

      const setPayload: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (typeof data?.name === 'string') {
        const trimmedName = data.name.trim();
        if (trimmedName) {
          setPayload.name = trimmedName;
        }
      }

      if (typeof data?.userRole === 'string') {
        const trimmedUserRole = data.userRole.trim();
        if (trimmedUserRole) {
          setPayload.userRole = trimmedUserRole;
        }
      }

      const profile = data?.farmerProfile;
      if (profile && typeof profile === 'object') {
        const editableFarmerFields = [
          'farmerName',
          'age',
          'gender',
          'villageName',
          'blockName',
          'district',
          'state',
          'phoneNo',
          'nearestKVK',
          'languagePreference',
          'yearsOfExperience',
          'cropsCultivated',
          'primaryCrop',
          'secondaryCrop',
          'awarenessOfKCC',
          'usesAgriApps',
          'highestEducatedPerson',
          'numberOfSmartphones',
          'platform',
          'landhold',
        ] as const;

        for (const field of editableFarmerFields) {
          if (Object.prototype.hasOwnProperty.call(profile, field)) {
            const value = (profile as any)[field];
            if (value === null) {
              unsetPayload[`farmerProfile.${field}`] = '';
            } else if (value !== undefined) {
              setPayload[`farmerProfile.${field}`] = value;
            }
          }
        }
      }

      const updateQuery: any = {
        $set: setPayload,
      };

      if (Object.keys(unsetPayload).length > 0) {
        updateQuery.$unset = unsetPayload;
      }

      const result = await this.users.updateOne(
        {_id: new ObjectId(userId)},
        updateQuery,
      );

      return result.matchedCount > 0;
    } catch (error) {
      throw new InternalServerError(`Failed to update user: ${error}`);
    }
  }

  async changeUserPassword(
    userId: string,
    source: string,
    newPassword: string,
    keepLoggedIn: boolean,
  ): Promise<boolean> {
    if (source === 'whatsapp') {
      throw new BadRequestError(
        'Change password functionality is not supported for whatsapp source',
      );
    }

    try {
      await this.init(source);
      const userObjectId = new ObjectId(userId);

      const existingUser = await this.users.findOne({
        _id: userObjectId,
      });
      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      const reviewSystemUser =
        await this.findMatchingReviewSystemUser(existingUser);
      const reviewSystemUsers = reviewSystemUser?._id
        ? await this.db.getCollection<IUser>('users')
        : null;
      const reviewSystemUserId = reviewSystemUser?._id
        ? new ObjectId(reviewSystemUser._id)
        : null;

      if (
        this.passwordMatchesHash(newPassword, existingUser.password) ||
        this.passwordMatchesHash(newPassword, reviewSystemUser?.password)
      ) {
        throw new BadRequestError(
          'New password cannot be the same as the existing password',
        );
      }

      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      const passwordUpdatedAt = new Date();
      const passwordUpdate = {
        $set: {
          password: hashedPassword,
          passwordChangedAt: passwordUpdatedAt,
          refreshToken: [],
          updatedAt: passwordUpdatedAt,
        },
      };
      const firebaseUID =
        reviewSystemUser?.firebaseUID || existingUser.firebaseUID;
      let sourcePasswordUpdated = false;
      let reviewPasswordUpdated = false;

      try {
        const result = await this.users.updateOne(
          {_id: userObjectId},
          passwordUpdate,
        );

        if (result.matchedCount === 0) {
          throw new NotFoundError('User not found');
        }

        sourcePasswordUpdated = true;

        if (reviewSystemUsers && reviewSystemUserId) {
          const reviewResult = await reviewSystemUsers.updateOne(
            {_id: reviewSystemUserId},
            passwordUpdate,
          );

          if (reviewResult.matchedCount === 0) {
            throw new NotFoundError('Linked review system user not found');
          }

          reviewPasswordUpdated = true;
        }

        if (firebaseUID) {
          const firebaseAuth = getFirebaseAuth();
          await firebaseAuth.updateUser(firebaseUID, {
            password: newPassword,
          });
          await firebaseAuth.revokeRefreshTokens(firebaseUID);
        }

        if (!keepLoggedIn) {
          await this.sessionCollection.deleteMany({
            user: userObjectId,
          });

          if (reviewSystemUserId) {
            const reviewSystemSessions =
              await this.db.getCollection<any>('sessions');
            await reviewSystemSessions.deleteMany({
              user: reviewSystemUserId,
            });
          }
        }

        return true;
      } catch (error) {
        await this.rollbackPasswordSync({
          sourceUserId: userObjectId,
          sourceUser: existingUser,
          sourcePasswordUpdated,
          reviewSystemUsers,
          reviewSystemUserId,
          reviewSystemUser,
          reviewPasswordUpdated,
        });
        throw error;
      }
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError(`Failed to change user password: ${error}`);
    }
  }

  private passwordMatchesHash(password: string, hash?: string): boolean {
    return Boolean(hash && bcrypt.compareSync(password, hash));
  }

  private buildPasswordRollbackUpdate(user: IUser): any {
    const setPayload: Record<string, any> = {};
    const unsetPayload: Record<string, ''> = {};

    for (const field of [
      'password',
      'passwordChangedAt',
      'refreshToken',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(user, field)) {
        setPayload[field] = user[field];
      } else {
        unsetPayload[field] = '';
      }
    }

    if (user.updatedAt) {
      setPayload.updatedAt = user.updatedAt;
    }

    const update: any = {};
    if (Object.keys(setPayload).length > 0) {
      update.$set = setPayload;
    }
    if (Object.keys(unsetPayload).length > 0) {
      update.$unset = unsetPayload;
    }

    return update;
  }

  private async rollbackPasswordSync({
    sourceUserId,
    sourceUser,
    sourcePasswordUpdated,
    reviewSystemUsers,
    reviewSystemUserId,
    reviewSystemUser,
    reviewPasswordUpdated,
  }: {
    sourceUserId: ObjectId;
    sourceUser: IUser;
    sourcePasswordUpdated: boolean;
    reviewSystemUsers: Collection<IUser> | null;
    reviewSystemUserId: ObjectId | null;
    reviewSystemUser?: IUser | null;
    reviewPasswordUpdated: boolean;
  }): Promise<void> {
    try {
      if (sourcePasswordUpdated) {
        await this.users.updateOne(
          {_id: sourceUserId},
          this.buildPasswordRollbackUpdate(sourceUser),
        );
      }

      if (
        reviewPasswordUpdated &&
        reviewSystemUsers &&
        reviewSystemUserId &&
        reviewSystemUser
      ) {
        await reviewSystemUsers.updateOne(
          {_id: reviewSystemUserId},
          this.buildPasswordRollbackUpdate(reviewSystemUser),
        );
      }
    } catch (rollbackError) {
      console.error(
        'Failed to rollback password synchronization:',
        rollbackError,
      );
    }
  }

  async addUser(
    source: string,
    data: {
      email: string;
      name: string;
      password: string;
      userRole?: string;
      isVerified?: boolean;
    },
  ): Promise<boolean> {
    if (source === 'whatsapp') {
      throw new BadRequestError(
        'Add farmer functionality is not supported for whatsapp source',
      );
    }

    try {
      await this.init(source);

      const existingUser = await this.users.findOne({
        email: data.email.trim().toLowerCase(),
      });
      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      const username = data.email.trim().split('@')[0];

      const createPasswordHash = (password: string) => {
        return bcrypt.hashSync(password, 10);
      };

      const hashedPassword = createPasswordHash(data.password);

      const newUserDoc = {
        name: data.name.trim(),
        username: username,
        email: data.email.trim().toLowerCase(),
        emailVerified: false,
        password: hashedPassword,
        avatar: null,
        provider: 'local',
        role: 'USER',
        userRole: data.userRole || 'FARMER',
        plugins: [],
        twoFactorEnabled: false,
        termsAccepted: false,
        secondTermsAccepted: false,
        personalization: {
          memories: true,
          _id: new ObjectId(),
        },
        farmerProfile: {
          cropsCultivated: [],
          platformHistory: [],
        },
        backupCodes: [],
        refreshToken: [],
        favorites: [],
        pushSubscriptions: [],
        createdFrom: 'REVIEW_SYSTEM',
        createdAt: new Date(),
        updatedAt: new Date(),
        isVerified: data.isVerified ?? true,
        __v: 0,
      };

      const result = await this.users.insertOne(newUserDoc);
      return result.acknowledged;
    } catch (error: any) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError(
        `Failed to add user: ${error.message || error}`,
      );
    }
  }

  async getRetentionMetrics(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ) {
    try {
      await this.init(source);
      let matchStage: any = {};
      let createdAtFilter: any = null;

      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        createdAtFilter = {
          $gte: start,
          $lte: end,
        };
      }
      if (userType === 'external') {
        matchStage.$and = [
          ...(matchStage.$and ?? []),
          buildExternalUserMatch(),
        ];
      }

      if (userType === 'internal') {
        matchStage.userRole = 'INTERNAL';
      }

      let format = '%Y-%m-%d';

      if (requestType === 'monthly') {
        format = '%Y-%m';
      } else if (requestType === 'weekly') {
        format = '%Y-W%V';
      } else {
        format = '%Y-%m-%d';
      }

      const result = await this.users
        .aggregate(
          [
            {
              $match: {
                ...(createdAtFilter && {
                  createdAt: createdAtFilter,
                }),
                ...matchStage,
              },
            },

            /**
             * Cohort projection
             */
            {
              $project: {
                userId: '$_id',
                signupDate: '$createdAt',
                cohortDate: {
                  $dateToString: {
                    format,
                    date: '$createdAt',
                  },
                },
              },
            },

            /**
             * Lookup user activities/messages
             */
            {
              $lookup: {
                from: 'messages',
                let: {
                  userId: '$userId',
                  signupDate: '$signupDate',
                },
                pipeline: [
                  /**
                   * Match user messages
                   */
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          '$user',
                          {
                            $toString: '$$userId',
                          },
                        ],
                      },
                    },
                  },

                  /**
                   * Calculate days after signup
                   */
                  {
                    $project: {
                      createdAt: 1,
                      daysAfterSignup: {
                        $dateDiff: {
                          startDate: {
                            $dateTrunc: {
                              date: '$$signupDate',
                              unit: 'day',
                            },
                          },
                          endDate: {
                            $dateTrunc: {
                              date: '$createdAt',
                              unit: 'day',
                            },
                          },
                          unit: 'day',
                        },
                      },
                    },
                  },

                  /**
                   * Ignore signup-day activity
                   */
                  {
                    $match: {
                      daysAfterSignup: {
                        $gt: 0,
                      },
                    },
                  },
                ],
                as: 'activities',
              },
            },

            /**
             * Retention flags
             */
            {
              $project: {
                cohortDate: 1,
                retainedD1: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',
                          as: 'activity',
                          cond: {
                            $gte: ['$$activity.daysAfterSignup', 1],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },

                retainedD7: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',
                          as: 'activity',
                          cond: {
                            $gte: ['$$activity.daysAfterSignup', 7],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },

                retainedD30: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$activities',
                          as: 'activity',
                          cond: {
                            $gte: ['$$activity.daysAfterSignup', 30],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
              },
            },

            /**
             * Group by cohort date
             */
            {
              $group: {
                _id: '$cohortDate',
                totalUsers: {
                  $sum: 1,
                },
                d1Users: {
                  $sum: {
                    $cond: ['$retainedD1', 1, 0],
                  },
                },
                d7Users: {
                  $sum: {
                    $cond: ['$retainedD7', 1, 0],
                  },
                },
                d30Users: {
                  $sum: {
                    $cond: ['$retainedD30', 1, 0],
                  },
                },
              },
            },

            /**
             * Retention percentages
             */
            {
              $project: {
                _id: 0,
                cohortDate: '$_id',
                totalUsers: 1,
                d1Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d1Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },

                d7Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d7Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },

                d30Retention: {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ['$d30Users', '$totalUsers'],
                        },
                        100,
                      ],
                    },
                    2,
                  ],
                },
              },
            },

            /**
             * Sort chronologically
             */
            {
              $sort: {
                cohortDate: 1,
              },
            },
          ],
          {
            session,
          },
        )
        .toArray();

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get retention metrics: ${error}`,
      );
    }
  }

  async getDailyAnalyticsForWhatsApp(start: Date, end: Date): Promise<any> {
    const carryForwardWindowStart = new Date(end);
    carryForwardWindowStart.setDate(carryForwardWindowStart.getDate() - 1);
    carryForwardWindowStart.setHours(22, 30, 0, 0);

    const carryForwardWindowEnd = new Date(end);
    carryForwardWindowEnd.setHours(0, 0, 0, 0);
    const baseMatch = buildBaseQuestionMatch('whatsapp');
    const [closedInSelectedTime, analytics, carryForward] = await Promise.all([
      // Closed during selected period
      this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
            closedAt: {
              $gte: start,
              $lt: end,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$closedAt',
                timezone: '+05:30',
              },
            },
            closedInPeriod: {$sum: 1},
          },
        },
      ]).toArray(),

      // Daily analytics
      await this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
            createdAt: {
              $gte: start,
              $lt: end,
            },
          },
        },
        // Group by period + status
        {
          $group: {
            _id: {
              period: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },
              status: '$status',
            },
            count: {
              $sum: 1,
            },
            closedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            closedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            passedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            passedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$passedAt', '$createdAt']},
                  0,
                ],
              },
            },
            dynamicClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dynamicClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            duplicateClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            duplicateClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
          },
        },
        // Group by period
        {
          $group: {
            _id: '$_id.period',
            totalQuestions: {
              $sum: '$count',
            },
            statuses: {
              $push: {
                k: '$_id.status',
                v: '$count',
              },
            },
            closedTimedCount: {
              $sum: '$closedTimedCount',
            },
            closedTimeSum: {
              $sum: '$closedTimeSum',
            },
            passedTimedCount: {
              $sum: '$passedTimedCount',
            },
            passedTimeSum: {
              $sum: '$passedTimeSum',
            },
            dynamicClosedTimedCount: {
              $sum: '$dynamicClosedTimedCount',
            },
            dynamicClosedTimeSum: {
              $sum: '$dynamicClosedTimeSum',
            },
            duplicateClosedTimedCount: {
              $sum: '$duplicateClosedTimedCount',
            },
            duplicateClosedTimeSum: {
              $sum: '$duplicateClosedTimeSum',
            },
          },
        },
        {
          $project: {
            _id: 0,
            period: '$_id',
            totalQuestions: 1,
            statuses: {
              $arrayToObject: '$statuses',
            },
            averageCloseTimeMinutes: {
              $cond: [
                {$gt: ['$closedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$closedTimeSum',
                        {$multiply: ['$closedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averagePassTimeMinutes: {
              $cond: [
                {$gt: ['$passedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$passedTimeSum',
                        {$multiply: ['$passedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDynamicCloseTimeMinutes: {
              $cond: [
                {$gt: ['$dynamicClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$dynamicClosedTimeSum',
                        {$multiply: ['$dynamicClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDuplicateCloseTimeMinutes: {
              $cond: [
                {$gt: ['$duplicateClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$duplicateClosedTimeSum',
                        {$multiply: ['$duplicateClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            combinedAverageTimeMinutes: {
              $cond: [
                {
                  $gt: [
                    {
                      $add: [
                        '$closedTimedCount',
                        '$passedTimedCount',
                        '$dynamicClosedTimedCount',
                        '$duplicateClosedTimedCount',
                      ],
                    },
                    0,
                  ],
                },
                {
                  $round: [
                    {
                      $divide: [
                        {
                          $add: [
                            '$closedTimeSum',
                            '$passedTimeSum',
                            '$dynamicClosedTimeSum',
                            '$duplicateClosedTimeSum',
                          ],
                        },
                        {
                          $multiply: [
                            {
                              $add: [
                                '$closedTimedCount',
                                '$passedTimedCount',
                                '$dynamicClosedTimedCount',
                                '$duplicateClosedTimedCount',
                              ],
                            },
                              60000,
                            ],
                          },
                        ],
                      },
                      2,
                    ],
                  },
                  0,
                ],
              },
          },
        },
        {
          $sort: {
            period: 1,
          },
        },
      ]).toArray(),

      await this.QuestionCollection.countDocuments({
        ...baseMatch,
        createdAt: {
          $gte: carryForwardWindowStart,
          $lt: carryForwardWindowEnd,
        },
        status: {
          $nin: ['closed', 'non_agri', 'dynamic'],
        },
      }),
    ]);

    const closedMap = new Map(
      closedInSelectedTime.map(item => [item._id, item.closedInPeriod]),
    );

    const analyticsMap = new Map(
      analytics.map(item => [item.period, item]),
    );

    const dateStrings: string[] = [];
    const tempDate = new Date(start);
    tempDate.setHours(12, 0, 0, 0);
    const tempEnd = new Date(end);
    tempEnd.setHours(12, 0, 0, 0);

    while (tempDate <= tempEnd) {
      const year = tempDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' });
      const month = tempDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', month: '2-digit' });
      const day = tempDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', day: '2-digit' });
      const dateStr = `${year}-${month}-${day}`;
      if (!dateStrings.includes(dateStr)) {
        dateStrings.push(dateStr);
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }

    const result = dateStrings.map(dateStr => {
      const existing = analyticsMap.get(dateStr);
      return {
        period: dateStr,
        totalQuestions: existing?.totalQuestions || 0,
        statuses: existing?.statuses || {},
        averageCloseTimeMinutes: existing?.averageCloseTimeMinutes || 0,
        averagePassTimeMinutes: existing?.averagePassTimeMinutes || 0,
        combinedAverageTimeMinutes: existing?.combinedAverageTimeMinutes || 0,
        closedInPeriod: closedMap.get(dateStr) || 0,
        carryForward: 0,
      };
    });

    if (result.length) {
      result[result.length - 1].carryForward = carryForward;
    }
    return result;
  }

  async getWeeklyAnalyticsForWhatsApp(start: Date, end: Date): Promise<any[]> {
    await this.initReviewSystem();
    const baseMatch = buildBaseQuestionMatch('whatsapp');
    const [closedInSelectedTime, analytics] = await Promise.all([
      // Closed during selected period
      this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
            closedAt: {
              $gte: start,
              $lt: end,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%G-W%V',
                date: '$closedAt',
                timezone: '+05:30',
              },
            },
            closedInPeriod: {
              $sum: 1,
            },
          },
        },
      ]).toArray(),

      // Weekly Analytics
      this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
            createdAt: {
              $gte: start,
              $lt: end,
            },
          },
        },

        // Group by week + status
        {
          $group: {
            _id: {
              period: {
                $dateToString: {
                  format: '%G-W%V',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },
              status: '$status',
            },
            count: {
              $sum: 1,
            },
            closedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            closedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            passedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            passedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$passedAt', '$createdAt']},
                  0,
                ],
              },
            },
            dynamicClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dynamicClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            duplicateClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            duplicateClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
          },
        },
        // Group by week
        {
          $group: {
            _id: '$_id.period',
            totalQuestions: {
              $sum: '$count',
            },
            statuses: {
              $push: {
                k: '$_id.status',
                v: '$count',
              },
            },
            closedTimedCount: {
              $sum: '$closedTimedCount',
            },
            closedTimeSum: {
              $sum: '$closedTimeSum',
            },
            passedTimedCount: {
              $sum: '$passedTimedCount',
            },
            passedTimeSum: {
              $sum: '$passedTimeSum',
            },
            dynamicClosedTimedCount: {
              $sum: '$dynamicClosedTimedCount',
            },
            dynamicClosedTimeSum: {
              $sum: '$dynamicClosedTimeSum',
            },
            duplicateClosedTimedCount: {
              $sum: '$duplicateClosedTimedCount',
            },
            duplicateClosedTimeSum: {
              $sum: '$duplicateClosedTimeSum',
            },
          },
        },
        {
          $project: {
            _id: 0,
            period: '$_id',
            totalQuestions: 1,
            statuses: {
              $arrayToObject: '$statuses',
            },
            averageCloseTimeMinutes: {
              $cond: [
                {$gt: ['$closedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$closedTimeSum',
                        {$multiply: ['$closedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averagePassTimeMinutes: {
              $cond: [
                {$gt: ['$passedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$passedTimeSum',
                        {$multiply: ['$passedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDynamicCloseTimeMinutes: {
              $cond: [
                {$gt: ['$dynamicClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$dynamicClosedTimeSum',
                        {$multiply: ['$dynamicClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDuplicateCloseTimeMinutes: {
              $cond: [
                {$gt: ['$duplicateClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$duplicateClosedTimeSum',
                        {$multiply: ['$duplicateClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            combinedAverageTimeMinutes: {
              $cond: [
                {
                  $gt: [
                    {
                      $add: [
                        '$closedTimedCount',
                        '$passedTimedCount',
                        '$dynamicClosedTimedCount',
                        '$duplicateClosedTimedCount',
                      ],
                    },
                    0,
                  ],
                },
                {
                  $round: [
                    {
                      $divide: [
                        {
                          $add: [
                            '$closedTimeSum',
                            '$passedTimeSum',
                            '$dynamicClosedTimeSum',
                            '$duplicateClosedTimeSum',
                          ],
                        },
                        {
                          $multiply: [
                            {
                              $add: [
                                '$closedTimedCount',
                                '$passedTimedCount',
                                '$dynamicClosedTimedCount',
                                '$duplicateClosedTimedCount',
                              ],
                            },
                            60000,
                          ],
                        },
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
          },
        },

        {
          $sort: {
            period: 1,
          },
        },
      ]).toArray(),
    ]);

    const closedMap = new Map(
      closedInSelectedTime.map(item => [item._id, item.closedInPeriod]),
    );

    return analytics.map(item => ({
      ...item,
      closedInPeriod: closedMap.get(item.period) || 0,
    }));
  }

  async getMonthlyAnalyticsForWhatsApp(): Promise<any[]> {
    const baseMatch = buildBaseQuestionMatch('whatsapp');
    const [closedInSelectedTime, analytics] = await Promise.all([
      // Closed in month
      this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
            closedAt: {
              $ne: null,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: '$closedAt',
                timezone: '+05:30',
              },
            },
            closedInPeriod: {
              $sum: 1,
            },
          },
        },
      ]).toArray(),

      // Monthly Analytics
      this.QuestionCollection.aggregate([
        {
          $match: {
            ...baseMatch,
          },
        },

        // Group by month + status
        {
          $group: {
            _id: {
              period: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$createdAt',
                  timezone: '+05:30',
                },
              },
              status: '$status',
            },
            count: {
              $sum: 1,
            },
            closedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            closedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            passedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            passedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'pass']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$passedAt', null]},
                      {$gte: ['$passedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$passedAt', '$createdAt']},
                  0,
                ],
              },
            },
            dynamicClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dynamicClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'dynamic_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
            duplicateClosedTimedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            duplicateClosedTimeSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$status', 'duplicate_closed']},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$closedAt', null]},
                      {$gte: ['$closedAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$closedAt', '$createdAt']},
                  0,
                ],
              },
            },
          },
        },
        // Group by month
        {
          $group: {
            _id: '$_id.period',
            totalQuestions: {
              $sum: '$count',
            },
            statuses: {
              $push: {
                k: '$_id.status',
                v: '$count',
              },
            },
            closedTimedCount: {
              $sum: '$closedTimedCount',
            },
            closedTimeSum: {
              $sum: '$closedTimeSum',
            },
            passedTimedCount: {
              $sum: '$passedTimedCount',
            },
            passedTimeSum: {
              $sum: '$passedTimeSum',
            },
            dynamicClosedTimedCount: {
              $sum: '$dynamicClosedTimedCount',
            },
            dynamicClosedTimeSum: {
              $sum: '$dynamicClosedTimeSum',
            },
            duplicateClosedTimedCount: {
              $sum: '$duplicateClosedTimedCount',
            },
            duplicateClosedTimeSum: {
              $sum: '$duplicateClosedTimeSum',
            },
          },
        },
        {
          $project: {
            _id: 0,
            period: '$_id',
            totalQuestions: 1,
            statuses: {
              $arrayToObject: '$statuses',
            },
            averageCloseTimeMinutes: {
              $cond: [
                {$gt: ['$closedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$closedTimeSum',
                        {$multiply: ['$closedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averagePassTimeMinutes: {
              $cond: [
                {$gt: ['$passedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$passedTimeSum',
                        {$multiply: ['$passedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDynamicCloseTimeMinutes: {
              $cond: [
                {$gt: ['$dynamicClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$dynamicClosedTimeSum',
                        {$multiply: ['$dynamicClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            averageDuplicateCloseTimeMinutes: {
              $cond: [
                {$gt: ['$duplicateClosedTimedCount', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$duplicateClosedTimeSum',
                        {$multiply: ['$duplicateClosedTimedCount', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
            combinedAverageTimeMinutes: {
              $cond: [
                {
                  $gt: [
                    {
                      $add: [
                        '$closedTimedCount',
                        '$passedTimedCount',
                        '$dynamicClosedTimedCount',
                        '$duplicateClosedTimedCount',
                      ],
                    },
                    0,
                  ],
                },
                {
                  $round: [
                    {
                      $divide: [
                        {
                          $add: [
                            '$closedTimeSum',
                            '$passedTimeSum',
                            '$dynamicClosedTimeSum',
                            '$duplicateClosedTimeSum',
                          ],
                        },
                        {
                          $multiply: [
                            {
                              $add: [
                                '$closedTimedCount',
                                '$passedTimedCount',
                                '$dynamicClosedTimedCount',
                                '$duplicateClosedTimedCount',
                              ],
                            },
                            60000,
                          ],
                        },
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
          },
        },

        {
          $sort: {
            period: 1,
          },
        },
      ]).toArray(),
    ]);

    const closedMap = new Map(
      closedInSelectedTime.map(item => [item._id, item.closedInPeriod]),
    );

    return analytics.map(item => ({
      ...item,
      closedInPeriod: closedMap.get(item.period) || 0,
    }));
  }

  async getWhatsAppDuplicateQuestions(
    session?: ClientSession,
  ): Promise<DuplicateQuestionEntry[]> {
    try {
      await this.initReviewSystem();
      const matchQuery = buildBaseQuestionMatch('whatsapp');

      matchQuery.similarityScore = {
        $exists: true,
      };

      matchQuery.referenceQuestionId = {
        $exists: true,
      };

      const dupeQuestions = await this.QuestionCollection.find(matchQuery, {
        session,
      })
        .project<{
          _id: any;
          question: string;
          referenceQuestion?: string;
          originalQuestion?: string;
          similarityScore: number;
          createdAt: Date;
          threadId?: string;
          details?: {
            state?: string;
            district?: string;
          };
        }>({
          question: 1,
          referenceQuestion: 1,
          originalQuestion: 1,
          similarityScore: 1,
          createdAt: 1,
          threadId: 1,
          details: 1,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

      const result = dupeQuestions.map(q => ({
        questionId: q._id.toString(),
        question: q.question,
        referenceQuestion: q.referenceQuestion || q.originalQuestion || '',
        similarityScore: Number(q.similarityScore) || 0,
        createdAt: q.createdAt,
        farmerName: 'WhatsApp User',
        email: '—',
        village: '—',
        block: '—',
        district: q.details?.district || '—',
        state: q.details?.state || '—',
        threadId: q.threadId || '—',
        mobileNumber: q.threadId ? q.threadId.split('-')[0] : '—',
      }));
      // console.log("--------------dupeQuestions------", result);
      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get WhatsApp duplicate questions: ${error}`,
      );
    }
  }

  async getWhatsAppTopFaqs(
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<any> {
    try {
      await this.initReviewSystem();

      const matchQuery = buildBaseQuestionMatch('whatsapp');

      // ============================================
      // DATE FILTER
      // ============================================

      if (startTime || endTime) {
        matchQuery.createdAt = {};
        if (startTime) {
          matchQuery.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          matchQuery.createdAt.$lte = new Date(endTime);
        }
      }

      // ============================================
      // AGGREGATION
      // ============================================

      const result = await this.QuestionCollection.aggregate([
        {
          $match: matchQuery,
        },
        {
          $group: {
            _id: {
              $ifNull: ['$referenceQuestionId', '$_id'],
            },
            question: {
              $first: {
                $ifNull: ['$referenceQuestion', '$question'],
              },
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
        {
          $limit: 10,
        },
        {
          $project: {
            _id: 0,
            question: 1,
            count: 1,
          },
        },
      ]).toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to get WhatsApp FAQs: ${error}`);
    }
  }

  async getWhatsAppDuplicateQuestionsCount(
    session?: ClientSession,
  ): Promise<number> {
    try {
      await this.initReviewSystem();
      const matchQuery = buildBaseQuestionMatch('whatsapp');

      matchQuery.similarityScore = {
        $exists: true,
      };

      matchQuery.referenceQuestionId = {
        $exists: true,
      };

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },

          {
            $count: 'total',
          },
        ],
        {session},
      ).toArray();

      return result[0]?.total || 0;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get WhatsApp duplicate questions count: ${error}`,
      );
    }
  }

  private async buildUserQuestionScope(userId?: string): Promise<any | null> {
    if (!userId) return null;

    const userMatches: any[] = [{userId}];
    if (ObjectId.isValid(userId)) {
      const objectId = new ObjectId(userId);
      userMatches.push({userId: objectId});

      await this.init('annam');
      const userMessages = await this.messagesCollection
        .find(
          {
            user: objectId.toString(),
            isDeleted: {$ne: true},
          },
          {
            projection: {
              messageId: 1,
              threadId: 1,
              conversationId: 1,
            },
          },
        )
        .toArray();

      const messageIds = [
        ...new Set(
          userMessages.map((message: any) => message.messageId).filter(Boolean),
        ),
      ];
      const threadIds = [
        ...new Set(
          userMessages
            .map((message: any) => message.threadId || message.conversationId)
            .filter(Boolean),
        ),
      ];

      if (messageIds.length > 0) userMatches.push({messageId: {$in: messageIds}});
      if (threadIds.length > 0) userMatches.push({threadId: {$in: threadIds}});
    }

    return {$or: userMatches};
  }

  async getClosedVsTotalQuestions(
    source: string,
    userType?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();

      const matchStage = buildBaseQuestionMatch(source);

      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchStage.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchStage.$and.push(userScope);
      }
      if (source === 'both') {
        matchStage.source = {
          $in: ['WHATSAPP', 'AJRASAKHA'],
        };
      }

      const previousMonthReferenceDate = startDate ?? new Date();
      const previousMonthStart = new Date(
        previousMonthReferenceDate.getFullYear(),
        previousMonthReferenceDate.getMonth() - 1,
        1,
      );
      const previousMonthEnd = new Date(
        previousMonthReferenceDate.getFullYear(),
        previousMonthReferenceDate.getMonth(),
        1,
      );

      const previousMonthMatchStage = {
        ...matchStage,
        createdAt: {
          $gte: previousMonthStart,
          $lt: previousMonthEnd,
        },
      };
      // console.log("getClosedVsTotalQuestions matchQuery,startDate, endDate, source, userType", JSON.stringify(matchStage, null, 2),startDate, endDate, source, userType)

      const avgCloseTimeStages = [
        {
          $addFields: {
            _statusLower: {$toLower: {$ifNull: ['$status', '']}},
            _operationalCompletionAt: {
              $cond: [
                {
                  $in: [{$toLower: {$ifNull: ['$status', '']}}, ['pass']],
                },
                '$passedAt',
                '$closedAt',
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalQuestions: {$sum: 1},
            completedQuestions: {
              $sum: {
                $cond: [{$in: ['$_statusLower', ['closed', 'pass', 'dynamic_closed', 'duplicate_closed']]}, 1, 0],
              },
            },
            timedCompletedQuestions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$in: ['$_statusLower', ['closed', 'pass', 'dynamic_closed', 'duplicate_closed']]},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$_operationalCompletionAt', null]},
                      {$gte: ['$_operationalCompletionAt', '$createdAt']},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            closeTimeSumMs: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$in: ['$_statusLower', ['closed', 'pass', 'dynamic_closed', 'duplicate_closed']]},
                      {$ne: ['$createdAt', null]},
                      {$ne: ['$_operationalCompletionAt', null]},
                      {$gte: ['$_operationalCompletionAt', '$createdAt']},
                    ],
                  },
                  {$subtract: ['$_operationalCompletionAt', '$createdAt']},
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            avgCloseTimeMinutes: {
              $cond: [
                {$gt: ['$timedCompletedQuestions', 0]},
                {
                  $round: [
                    {
                      $divide: [
                        '$closeTimeSumMs',
                        {$multiply: ['$timedCompletedQuestions', 60000]},
                      ],
                    },
                    2,
                  ],
                },
                0,
              ],
            },
          },
        },
      ];

      const [result, previousMonthResult] = await Promise.all([
        await this.QuestionCollection.aggregate([
          {
            $match: matchStage,
          },
          {
            $addFields: {
              _statusLower: {
                $toLower: {
                  $ifNull: ['$status', ''],
                },
              },
            },
          },
          {
            $facet: {
              metrics: [
                {
                  $group: {
                    _id: null,
                    totalQuestions: {
                      $sum: 1,
                    },
                    closedQuestions: {
                      $sum: {
                        $cond: [{$eq: ['$_statusLower', 'closed']}, 1, 0],
                      },
                    },
                    passedQuestions: {
                      $sum: {
                        $cond: [{$eq: ['$_statusLower', 'pass']}, 1, 0],
                      },
                    },
                    dynamicClosedQuestions: {
                      $sum: {
                        $cond: [{$eq: ['$_statusLower', 'dynamic_closed']}, 1, 0],
                      },
                    },
                    duplicateClosedQuestions: {
                      $sum: {
                        $cond: [{$eq: ['$_statusLower', 'duplicate_closed']}, 1, 0],
                      },
                    },
                    // Closed metrics
                    closedTimedQuestions: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    closedTimeSumMs: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          {
                            $subtract: ['$closedAt', '$createdAt'],
                          },
                          0,
                        ],
                      },
                    },
                    // Pass metrics
                    passedTimedQuestions: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'pass']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$passedAt', null]},
                              {$gte: ['$passedAt', '$createdAt']},
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    passedTimeSumMs: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'pass']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$passedAt', null]},
                              {$gte: ['$passedAt', '$createdAt']},
                            ],
                          },
                          {
                            $subtract: ['$passedAt', '$createdAt'],
                          },
                          0,
                        ],
                      },
                    },
                    // Dynamic Closed metrics
                    dynamicClosedTimedQuestions: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'dynamic_closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    dynamicClosedTimeSumMs: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'dynamic_closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          {
                            $subtract: ['$closedAt', '$createdAt'],
                          },
                          0,
                        ],
                      },
                    },
                    // Duplicate Closed metrics
                    duplicateClosedTimedQuestions: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'duplicate_closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    duplicateClosedTimeSumMs: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {$eq: ['$_statusLower', 'duplicate_closed']},
                              {$ne: ['$createdAt', null]},
                              {$ne: ['$closedAt', null]},
                              {$gte: ['$closedAt', '$createdAt']},
                            ],
                          },
                          {
                            $subtract: ['$closedAt', '$createdAt'],
                          },
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              statuses: [
                {
                  $group: {
                    _id: '$_statusLower',
                    count: {
                      $sum: 1,
                    },
                  },
                },
                {
                  $group: {
                    _id: null,
                    statuses: {
                      $push: {
                        k: '$_id',
                        v: '$count',
                      },
                    },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    statuses: {
                      $arrayToObject: '$statuses',
                    },
                  },
                },
              ],
            },
          },
          {
            $project: {
              metrics: {
                $arrayElemAt: ['$metrics', 0],
              },
              statuses: {
                $ifNull: [
                  {
                    $arrayElemAt: ['$statuses.statuses', 0],
                  },
                  {},
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalQuestions: '$metrics.totalQuestions',
              closed: {
                count: '$metrics.closedQuestions',
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: ['$metrics.closedTimedQuestions', 0],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            '$metrics.closedTimeSumMs',
                            {
                              $multiply: [
                                '$metrics.closedTimedQuestions',
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
              pass: {
                count: '$metrics.passedQuestions',
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: ['$metrics.passedTimedQuestions', 0],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            '$metrics.passedTimeSumMs',
                            {
                              $multiply: [
                                '$metrics.passedTimedQuestions',
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
              dynamicClosed: {
                count: '$metrics.dynamicClosedQuestions',
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: ['$metrics.dynamicClosedTimedQuestions', 0],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            '$metrics.dynamicClosedTimeSumMs',
                            {
                              $multiply: [
                                '$metrics.dynamicClosedTimedQuestions',
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
              duplicateClosed: {
                count: '$metrics.duplicateClosedQuestions',
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: ['$metrics.duplicateClosedTimedQuestions', 0],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            '$metrics.duplicateClosedTimeSumMs',
                            {
                              $multiply: [
                                '$metrics.duplicateClosedTimedQuestions',
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
              statuses: 1,
              nonGdb: {
                count: {
                  $add: [
                    '$metrics.passedQuestions',
                    '$metrics.dynamicClosedQuestions',
                    '$metrics.duplicateClosedQuestions',
                  ],
                },
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: [
                        {
                          $add: [
                            '$metrics.passedTimedQuestions',
                            '$metrics.dynamicClosedTimedQuestions',
                            '$metrics.duplicateClosedTimedQuestions',
                          ],
                        },
                        0,
                      ],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            {
                              $add: [
                                '$metrics.passedTimeSumMs',
                                '$metrics.dynamicClosedTimeSumMs',
                                '$metrics.duplicateClosedTimeSumMs',
                              ],
                            },
                            {
                              $multiply: [
                                {
                                  $add: [
                                    '$metrics.passedTimedQuestions',
                                    '$metrics.dynamicClosedTimedQuestions',
                                    '$metrics.duplicateClosedTimedQuestions',
                                  ],
                                },
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
              combined: {
                count: {
                  $add: [
                    '$metrics.closedQuestions',
                    '$metrics.passedQuestions',
                    '$metrics.dynamicClosedQuestions',
                    '$metrics.duplicateClosedQuestions',
                  ],
                },
                avgTimeMinutes: {
                  $cond: [
                    {
                      $gt: [
                        {
                          $add: [
                            '$metrics.closedTimedQuestions',
                            '$metrics.passedTimedQuestions',
                            '$metrics.dynamicClosedTimedQuestions',
                            '$metrics.duplicateClosedTimedQuestions',
                          ],
                        },
                        0,
                      ],
                    },
                    {
                      $round: [
                        {
                          $divide: [
                            {
                              $add: [
                                '$metrics.closedTimeSumMs',
                                '$metrics.passedTimeSumMs',
                                '$metrics.dynamicClosedTimeSumMs',
                                '$metrics.duplicateClosedTimeSumMs',
                              ],
                            },
                            {
                              $multiply: [
                                {
                                  $add: [
                                    '$metrics.closedTimedQuestions',
                                    '$metrics.passedTimedQuestions',
                                    '$metrics.dynamicClosedTimedQuestions',
                                    '$metrics.duplicateClosedTimedQuestions',
                                  ],
                                },
                                60000,
                              ],
                            },
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        ]).toArray(),

        this.QuestionCollection.aggregate([
          {
            $match: previousMonthMatchStage,
          },
          ...avgCloseTimeStages,
        ]).toArray(),
      ]);
      // console.log("result---", result)
      return {
        ...(result[0] || {
          totalQuestions: 0,
          closedQuestions: 0,
          inReviewQuestions: 0,
          avgCloseTimeMinutes: 0,
          combined: 0,
          closed: 0,
          pass: 0,
        }),
        previousMonthAvgCloseTimeMinutes:
          previousMonthResult[0]?.avgCloseTimeMinutes || 0,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get closed vs total questions count: ${error}`,
      );
    }
  }

  async getNotifiedVsClosed(
    source?: string,
    userType?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      const matchStage = buildBaseQuestionMatch(source);
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchStage.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchStage.$and.push(userScope);
      }
      if (source === 'both') {
        matchStage.source = {
          $in: ['WHATSAPP', 'AJRASAKHA'],
        };
      }

      // console.log("getNotifiedVsClosed", source, userType, JSON.stringify(matchStage, null, 2))

      const [result] = await this.QuestionCollection.aggregate([
        {
          $match: matchStage,
        },
        {
          $group: {
            _id: null,
            notNotified: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$in: ['$status', ['closed', 'dynamic_closed', 'duplicate_closed']]},
                      {$eq: ['$isCustomerNotified', false]},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            notified: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$in: ['$status', ['closed', 'dynamic_closed', 'duplicate_closed']]},
                      {$eq: ['$isCustomerNotified', true]},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            notNotified: 1,
            notified: 1,
          },
        },
      ]).toArray();

      const untrackedClosedQuestions =
        await this.QuestionCollection.countDocuments({
          ...matchStage,
          status: {
            $in: ['closed', 'dynamic_closed', 'duplicate_closed'],
          },
          isCustomerNotified: {$exists: false},
        });

      return {
        ...(result || {
          notified: 0,
          notNotified: 0,
        }),
        untrackedClosedQuestions,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get notified vs closed count: ${error}`,
      );
    }
  }

  async getClosedInLastTwoHours(
    source?: string,
    userType?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      const matchStage = buildBaseQuestionMatch(source);

      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchStage.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchStage.$and.push(userScope);
      }
      if (source === 'both') {
        matchStage.source = {
          $in: ['WHATSAPP', 'AJRASAKHA'],
        };
      }
      matchStage.status = {
        $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
      };

      const [totalCountResult, lastTwoHoursResult] = await Promise.all([
        this.QuestionCollection.aggregate([
          {
            $match: matchStage,
          },
          {
            $addFields: {
              _statusLower: {
                $toLower: {
                  $ifNull: ['$status', ''],
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              closedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'closed']}, 1, 0],
                },
              },
              passCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'pass']}, 1, 0],
                },
              },
              dynamicClosedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'dynamic_closed']}, 1, 0],
                },
              },
              duplicateClosedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'duplicate_closed']}, 1, 0],
                },
              },
            },
          },
        ]).toArray(),

        this.QuestionCollection.aggregate([
          {
            $match: matchStage,
          },
          {
            $addFields: {
              _statusLower: {$toLower: {$ifNull: ['$status', '']}},
              _operationalCompletionAt: {
                $cond: [
                  {$eq: [{$toLower: {$ifNull: ['$status', '']}}, 'pass']},
                  '$passedAt',
                  '$closedAt',
                ],
              },
              _effectiveCreatedAt: {
                $let: {
                  vars: {
                    istHour: {
                      $hour: {date: '$createdAt', timezone: 'Asia/Kolkata'},
                    },
                    istDateTrunc: {
                      $dateTrunc: {
                        date: '$createdAt',
                        unit: 'day',
                        timezone: 'Asia/Kolkata',
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: {$gte: ['$$istHour', 22]},
                      then: {
                        $dateAdd: {
                          startDate: '$$istDateTrunc',
                          unit: 'hour',
                          amount: 30,
                        },
                      },
                      else: {
                        $cond: {
                          if: {$lt: ['$$istHour', 6]},
                          then: {
                            $dateAdd: {
                              startDate: '$$istDateTrunc',
                              unit: 'hour',
                              amount: 6,
                            },
                          },
                          else: '$createdAt',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            $match: {
              _statusLower: {$in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed']},
              _operationalCompletionAt: {$ne: null},
              $expr: {
                $and: [
                  {$gte: ['$_operationalCompletionAt', '$createdAt']},
                  {
                    $lte: [
                      {
                        $max: [
                          0,
                          {
                            $subtract: [
                              '$_operationalCompletionAt',
                              '$_effectiveCreatedAt',
                            ],
                          },
                        ],
                      },
                      2 * 60 * 60 * 1000,
                    ],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              closedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'closed']}, 1, 0],
                },
              },
              passCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'pass']}, 1, 0],
                },
              },
              dynamicClosedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'dynamic_closed']}, 1, 0],
                },
              },
              duplicateClosedCount: {
                $sum: {
                  $cond: [{$eq: ['$_statusLower', 'duplicate_closed']}, 1, 0],
                },
              },
            },
          },
        ]).toArray(),
      ]);

      return {
        totalClosedCount: totalCountResult[0]?.closedCount ?? 0,
        totalPassCount: totalCountResult[0]?.passCount ?? 0,
        totalDynamicClosedCount: totalCountResult[0]?.dynamicClosedCount ?? 0,
        totalDuplicateClosedCount: totalCountResult[0]?.duplicateClosedCount ?? 0,
        closedInTwoHoursCount: lastTwoHoursResult[0]?.closedCount ?? 0,
        passInTwoHoursCount: lastTwoHoursResult[0]?.passCount ?? 0,
        dynamicClosedInTwoHoursCount: lastTwoHoursResult[0]?.dynamicClosedCount ?? 0,
        duplicateClosedInTwoHoursCount: lastTwoHoursResult[0]?.duplicateClosedCount ?? 0,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get closed questions in last two hours: ${error}`,
      );
    }
  }

  async getMonthlyChurnRate(source: string, userType: string): Promise<any> {
    await this.init(source);

    let userMatchStage: any = {};
    if (userType === 'external') {
      userMatchStage = buildExternalJoinedUserMatch('userDetails');
    }

    if (userType === 'internal') {
      userMatchStage['userDetails.userRole'] = 'INTERNAL';
    }

    const startDate = new Date('2026-01-01');
    const now = new Date();
    const results = [];
    let currentPeriodStart = new Date(startDate);

    while (currentPeriodStart < now) {
      const currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

      const previousPeriodStart = new Date(currentPeriodStart);
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);

      const previousPeriodEnd = currentPeriodStart;

      const previousActiveUsers = await this.messagesCollection
        .aggregate([
          {
            $match: {
              isCreatedByUser: true,
              createdAt: {
                $gte: previousPeriodStart,
                $lt: previousPeriodEnd,
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              let: {
                userObjectId: {
                  $toObjectId: '$user',
                },
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$_id', '$$userObjectId'],
                    },
                  },
                },
              ],
              as: 'userDetails',
            },
          },
          {
            $unwind: '$userDetails',
          },
          ...(Object.keys(userMatchStage).length
            ? [{$match: userMatchStage}]
            : []),
          {
            $group: {
              _id: '$user',
            },
          },
        ])
        .toArray();

      const currentActiveUsers = await this.messagesCollection
        .aggregate([
          {
            $match: {
              isCreatedByUser: true,
              createdAt: {
                $gte: currentPeriodStart,
                $lt: currentPeriodEnd,
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              let: {
                userObjectId: {
                  $toObjectId: '$user',
                },
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$_id', '$$userObjectId'],
                    },
                  },
                },
              ],
              as: 'userDetails',
            },
          },
          {
            $unwind: '$userDetails',
          },
          ...(Object.keys(userMatchStage).length
            ? [{$match: userMatchStage}]
            : []),
          {
            $group: {
              _id: '$user',
            },
          },
        ])
        .toArray();

      const previousUserIds = previousActiveUsers.map(u => u._id.toString());

      const currentUserIds = currentActiveUsers.map(u => u._id.toString());

      const currentUserSet = new Set(currentUserIds);

      const churnedUsers = previousUserIds.filter(
        userId => !currentUserSet.has(userId),
      );

      const churnRate =
        previousUserIds.length === 0
          ? 0
          : (churnedUsers.length / previousUserIds.length) * 100;

      results.push({
        month: currentPeriodStart.toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        }),
        previousActiveUsers: previousUserIds.length,
        currentActiveUsers: currentUserIds.length,
        churnedUsers: churnedUsers.length,
        churnRate: Number(churnRate.toFixed(2)),
      });
      currentPeriodStart = currentPeriodEnd;
    }

    return results;
  }

  async getCarryForwardQuestions(
    source?: string,
    userType?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      const matchStage = buildBaseQuestionMatch(source);
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchStage.$and.push(query);
      }
      matchStage.source = {
        $in: ['WHATSAPP', 'AJRASAKHA'],
      };
      const carryForwardWindowStart = new Date(
        new Date().toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
        }),
      );
      carryForwardWindowStart.setDate(carryForwardWindowStart.getDate() - 1);
      carryForwardWindowStart.setHours(22, 30, 0, 0);
      const carryForwardWindowEnd = new Date(
        new Date().toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
        }),
      );
      carryForwardWindowEnd.setHours(0, 0, 0, 0);
      matchStage.status = {$ne: 'closed'};
      // console.log("getCarryForwardQuestions matchQuery,carryForwardWindowStart, carryForwardWindowEnd, source, userType", JSON.stringify(matchStage, null, 2),carryForwardWindowStart,carryForwardWindowEnd, source, userType)
      const count = await this.QuestionCollection.countDocuments({
        ...matchStage,
        createdAt: {
          $gte: carryForwardWindowStart,
          $lt: carryForwardWindowEnd,
        },
        // status: {
        //   $ne: 'closed',
        // },
      });
      return count;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get closed questions in last two hours: ${error}`,
      );
    }
  }

  async getActiveUsersTrend(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ): Promise<IActiveUser[]> {
    try {
      await this.init(source);

      const matchStage: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
      };

      if (startDate && endDate) {
        matchStage.createdAt = {
          $gte: startDate,
          $lte: endDate,
        };
      }

      const pipeline: any[] = [
        {
          $match: matchStage,
        },
      ];

      if (userType !== 'all') {
        pipeline.push(...this.buildUserTypeLookupStages(userType));
      }

      let firstGroupStage: any;
      let secondGroupStage: any;
      let sortStage: any;
      let projectStage: any = null;

      switch (requestType) {
        case 'daily':
          firstGroupStage = {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },
                user: '$user',
              },
            },
          };
          secondGroupStage = {
            $group: {
              _id: '$_id.date',
              activeUsers: {$sum: 1},
            },
          };
          sortStage = {_id: 1};
          break;

        case 'weekly':
          firstGroupStage = {
            $group: {
              _id: {
                year: {$isoWeekYear: {date: '$createdAt', timezone: '+05:30'}},
                week: {$isoWeek: {date: '$createdAt', timezone: '+05:30'}},
                user: '$user',
              },
            },
          };
          secondGroupStage = {
            $group: {
              _id: {
                year: '$_id.year',
                week: '$_id.week',
              },
              activeUsers: {$sum: 1},
            },
          };
          projectStage = {
            $project: {
              _id: {
                $concat: [
                  {$toString: '$_id.year'},
                  '-W',
                  {
                    $cond: [
                      {$lt: ['$_id.week', 10]},
                      {$concat: ['0', {$toString: '$_id.week'}]},
                      {$toString: '$_id.week'},
                    ],
                  },
                ],
              },
              activeUsers: 1,
            },
          };
          sortStage = {_id: 1};
          break;

        case 'monthly':
          firstGroupStage = {
            $group: {
              _id: {
                month: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$createdAt',
                    timezone: '+05:30',
                  },
                },
                user: '$user',
              },
            },
          };
          secondGroupStage = {
            $group: {
              _id: '$_id.month',
              activeUsers: {$sum: 1},
            },
          };
          sortStage = {_id: 1};
          break;

        default:
          throw new Error(`Invalid requestType: ${requestType}`);
      }

      pipeline.push(firstGroupStage, secondGroupStage);

      if (projectStage) {
        pipeline.push(projectStage);
      }

      pipeline.push({
        $sort: sortStage,
      });

      const data = await this.messagesCollection
        .aggregate(pipeline, {session})
        .toArray();
      return data as IActiveUser[];
    } catch (error) {
      throw new InternalServerError(
        `Failed to get ${requestType} active users trend: ${error}`,
      );
    }
  }

  async getRepeatQueryCount(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<any> {
    try {
      await this.init(source);
      const totalFarmerProfileUsers = Math.max(
        await this.users.countDocuments(
          {farmerProfile: {$exists: true, $ne: null}},
          {session},
        ),
        1,
      );
      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);
      const queryMatch: any = {
        isCreatedByUser: true,
        isDeleted: {$ne: true},
        text: {$exists: true, $ne: null, $nin: ['', ' ']},
      };
      if (startTime || endTime) {
        queryMatch.createdAt = {};
        if (startTime) {
          queryMatch.createdAt.$gte = new Date(startTime);
        }
        if (endTime) {
          queryMatch.createdAt.$lte = new Date(endTime);
        }
      }

      let repeatQueryCount = 0;
      let totalQueries = 0;
      let avgQuestionsPerUserDay = 0;

      if (source === 'whatsapp') {
        const [facetResult] = await this.QuestionCollection.aggregate(
          [
            {
              $match: {
                source: 'WHATSAPP',
                ...(queryMatch.createdAt && {
                  createdAt: queryMatch.createdAt,
                }),
                $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
                status: {$ne: 'non_agri'},
              },
            },

            {
              $facet: {
                repeatQueries: [
                  {
                    $group: {
                      _id: {
                        $ifNull: ['$referenceQuestionId', '$_id'],
                      },
                      count: {$sum: 1},
                    },
                  },
                  {
                    $match: {
                      count: {$gt: 1},
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalRepeats: {
                        $sum: {
                          $subtract: ['$count', 1],
                        },
                      },
                    },
                  },
                ],

                totalQueries: [
                  {
                    $count: 'count',
                  },
                ],

                avgQuestionsPerUserDay: [
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
                        user: {
                          $ifNull: ['$userId', '$messageId'],
                        },
                      },
                      userDailyCount: {
                        $sum: 1,
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$_id.day',
                      dayTotalQuestions: {
                        $sum: '$userDailyCount',
                      },
                      dayUniqueUsers: {
                        $sum: 1,
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      avgQuestionsPerUserDay: {
                        $avg: {
                          $divide: ['$dayTotalQuestions', totalFarmerProfileUsers],
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
          {session},
        ).toArray();

        repeatQueryCount = facetResult?.repeatQueries?.[0]?.totalRepeats ?? 0;

        totalQueries = facetResult?.totalQueries?.[0]?.count ?? 0;

        avgQuestionsPerUserDay =
          facetResult?.avgQuestionsPerUserDay?.[0]?.avgQuestionsPerUserDay ?? 0;
      } else {
        const [facetResult] = await this.messagesCollection
          .aggregate(
            [
              {$match: queryMatch},
              ...userTypeLookupStages,

              {
                $facet: {
                  repeatQueries: [
                    {
                      $group: {
                        _id: {
                          $toLower: {
                            $trim: {
                              input: '$text',
                            },
                          },
                        },
                        count: {$sum: 1},
                      },
                    },
                    {
                      $match: {
                        count: {$gt: 1},
                      },
                    },
                    {
                      $group: {
                        _id: null,
                        totalRepeats: {
                          $sum: {
                            $subtract: ['$count', 1],
                          },
                        },
                      },
                    },
                  ],

                  totalQueries: [
                    {
                      $count: 'count',
                    },
                  ],

                  avgQuestionsPerUserDay: [
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
                        userDailyCount: {
                          $sum: 1,
                        },
                      },
                    },
                    {
                      $group: {
                        _id: '$_id.day',
                        dayTotalQuestions: {
                          $sum: '$userDailyCount',
                        },
                        dayUniqueUsers: {
                          $sum: 1,
                        },
                      },
                    },
                    {
                      $group: {
                        _id: null,
                        avgQuestionsPerUserDay: {
                          $avg: {
                            $divide: ['$dayTotalQuestions', totalFarmerProfileUsers],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            {session},
          )
          .toArray();

        repeatQueryCount = facetResult?.repeatQueries?.[0]?.totalRepeats ?? 0;

        totalQueries = facetResult?.totalQueries?.[0]?.count ?? 0;

        avgQuestionsPerUserDay =
          facetResult?.avgQuestionsPerUserDay?.[0]?.avgQuestionsPerUserDay ?? 0;
      }

      const repeatQueryRatePct =
        totalQueries > 0
          ? Math.round((repeatQueryCount / totalQueries) * 100 * 10) / 10
          : 0;

      return {
        repeatQueryCount,
        repeatQueryRatePct,
        avgQuestionsPerUserDay: Math.round(avgQuestionsPerUserDay * 100) / 100,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch repeat query count: ${error}`,
      );
    }
  }

  async verifyUser(
    userId: string,
    source = 'vicharanashala',
    isVerified = true,
  ): Promise<any> {
    try {
      await this.init(source);
      const userObjectId = new ObjectId(userId);
      const existingUser = await this.users.findOne({_id: userObjectId});

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      const reviewSystemUser =
        await this.findMatchingReviewSystemUser(existingUser);
      const reviewSystemUsers = reviewSystemUser?._id
        ? await this.db.getCollection<IUser>('users')
        : null;
      const reviewSystemUserId = reviewSystemUser?._id
        ? new ObjectId(reviewSystemUser._id)
        : null;
      const verificationUpdatedAt = new Date();
      const verificationUpdate = {
        $set: {
          isVerified,
          updatedAt: verificationUpdatedAt,
        },
      };

      const result = await this.users.findOneAndUpdate(
        {_id: userObjectId},
        verificationUpdate,
        {returnDocument: 'after'},
      );
      if (!result) {
        throw new NotFoundError('User not found');
      }

      try {
        if (reviewSystemUsers && reviewSystemUserId) {
          const reviewResult = await reviewSystemUsers.updateOne(
            {_id: reviewSystemUserId},
            verificationUpdate,
          );

          if (reviewResult.matchedCount === 0) {
            throw new NotFoundError('Linked review system user not found');
          }
        }
      } catch (error) {
        const rollbackUpdate = Object.prototype.hasOwnProperty.call(
          existingUser,
          'isVerified',
        )
          ? {
              $set: {
                isVerified: existingUser.isVerified,
                updatedAt: existingUser.updatedAt,
              },
            }
          : {
              $set: {
                updatedAt: existingUser.updatedAt,
              },
              $unset: {
                isVerified: '',
              },
            };

        await this.users.updateOne({_id: userObjectId}, rollbackUpdate);
        throw error;
      }

      if (!isVerified) {
        await this.sessionCollection.deleteMany({
          user: userObjectId,
        });

        if (reviewSystemUserId) {
          const reviewSystemSessions =
            await this.db.getCollection<any>('sessions');
          await reviewSystemSessions.deleteMany({
            user: reviewSystemUserId,
          });
        }
      }

      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to verify user: ${error}`);
    }
  }

  async findUnverifiedUsers(
    page: number,
    limit: number,
    search: string,
    source?: string,
    session?: ClientSession,
  ): Promise<{
    users: UnverifiedUserEntry[];
    totalUsers: number;
    totalPages: number;
  }> {
    await this.init((source = 'annam'));

    try {
      const skip = (page - 1) * limit;

      const matchQuery: any = {
        isVerified: false,
      };

      if (search) {
        matchQuery.$or = [
          {name: {$regex: search, $options: 'i'}},
          {username: {$regex: search, $options: 'i'}},
          {email: {$regex: search, $options: 'i'}},
        ];
      }

      const result = await this.users
        .aggregate(
          [
            {$match: matchQuery},
            {
              $facet: {
                users: [
                  {$sort: {createdAt: -1}},
                  {$skip: skip},
                  {$limit: limit},
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      username: 1,
                      email: 1,
                      createdAt: 1,
                      role: 1,
                    },
                  },
                ],
                meta: [{$count: 'totalUsers'}],
              },
            },
          ],
          {session},
        )
        .toArray();

      const users: UnverifiedUserEntry[] = (result[0]?.users || []).map(
        (user: {
          _id: ObjectId | string;
          name?: string;
          username?: string;
          email?: string;
          role?: string;
          createdAt?: Date;
        }) => ({
          _id: user._id.toString(),
          name: user.name ?? '',
          username: user.username ?? '',
          email: user.email ?? '',
          role: user.role ?? '',
          createdAt: user.createdAt,
        }),
      );
      const totalUsers = result[0]?.meta[0]?.totalUsers || 0;

      return {
        users,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      };
    } catch (error) {
      throw new InternalServerError('Failed to fetch unverified users');
    }
  }

  private async getUserIdsByUserType(
    source: string,
    userType: string,
  ): Promise<ObjectId[]> {
    await this.init(source);
    if (userType === 'all') {
      return [];
    }
    const userMatch =
      userType === 'external'
        ? buildExternalUserMatch()
        : {
            userRole: 'INTERNAL',
          };
    const users = await this.users
      .find(userMatch, {
        // aggregation
        projection: {_id: 1},
      })
      .toArray();
    return users.map(user => user._id); // map is not required.
  }

  private async buildQuestionUserTypeMatchQuery(
    source: string,
    userType: string,
  ): Promise<any> {
    if (userType === 'all') {
      return {};
    }

    // External users
    const externalUserIds = await this.getUserIdsByUserType(source, 'external');

    const externalUserStrings = externalUserIds.map(id => id.toString());

    const externalUserSet = new Set(externalUserStrings);

    // Questions with null userId
    const questionsWithNullUsers = await this.QuestionCollection.find(
      {
        ...buildBaseQuestionMatch(source),
        userId: null,
      },
      {
        projection: {
          _id: 1,
          messageId: 1,
        },
      },
    ).toArray();

    const messageIds = questionsWithNullUsers
      .filter(q => q.messageId)
      .map(q => q.messageId);

    // Resolve messageId -> user
    const messages = await this.messagesCollection
      .find(
        {
          messageId: {$in: messageIds},
        },
        {
          projection: {
            messageId: 1,
            user: 1,
          },
        },
      )
      .toArray();

    const messageUserMap = new Map(
      messages.map(m => [m.messageId, m.user?.toString()]),
    );

    // Questions whose null userId resolves to an EXTERNAL user
    const externalResolvedQuestionIds = questionsWithNullUsers
      .filter(q => {
        const resolvedUserId = messageUserMap.get(q.messageId);

        return resolvedUserId && externalUserSet.has(resolvedUserId);
      })
      .map(q => q._id);

    if (userType === 'external') {
      return {
        $or: [
          {
            userId: {
              $in: [...externalUserIds, ...externalUserStrings],
            },
          },
          {
            _id: {
              $in: externalResolvedQuestionIds,
            },
          },
        ],
      };
    }

    // internal = NOT external
    return {
      $and: [
        {
          userId: {
            $nin: [...externalUserIds, ...externalUserStrings],
          },
        },
        {
          _id: {
            $nin: externalResolvedQuestionIds,
          },
        },
      ],
    };
  }

  private async resolveQuestionUsers(questions: any[]): Promise<{
    userMap: Map<string, any>;
    questionUserMap: Map<string, string>;
  }> {
    const directUserIds = new Set<string>();
    const messageIds: string[] = [];
    const threadPhones = new Set<string>();

    for (const question of questions) {
      if (question.userId) {
        directUserIds.add(question.userId.toString());
      }
      if (question.messageId) {
        messageIds.push(question.messageId);
      }
      if (question.threadId) {
        const match = question.threadId.match(/^(\d+)/);
        if (match) {
          const phone = match[1];
          threadPhones.add(phone);
          if (phone.length === 12 && phone.startsWith('91')) {
            threadPhones.add(phone.slice(2));
          } else if (phone.length === 10) {
            threadPhones.add('91' + phone);
          }
        }
      }
    }

    // Resolve messageId -> user
    const messages = messageIds.length
      ? await this.messagesCollection
          .find(
            {
              messageId: {
                $in: messageIds,
              },
            },
            {
              projection: {
                messageId: 1,
                user: 1,
              },
            },
          )
          .toArray()
      : [];

    const messageUserMap = new Map(
      messages.map(message => [message.messageId, message.user?.toString()]),
    );

    // Resolve threadId (phone) -> user
    const phoneUsers = threadPhones.size > 0
      ? await this.users
          .find({
            $or: [
              { phoneNo: { $in: Array.from(threadPhones) } },
              { phone: { $in: Array.from(threadPhones) } },
              { username: { $in: Array.from(threadPhones) } },
              { 'farmerProfile.phoneNo': { $in: Array.from(threadPhones) } },
              { 'farmerProfile.phone': { $in: Array.from(threadPhones) } }
            ]
          })
          .toArray()
      : [];

    const userMapByPhone = new Map<string, any>();
    for (const u of phoneUsers) {
      const uAny = u as any;
      const addPhone = (p: any) => {
        if (!p) return;
        const cleaned = String(p).replace(/\D/g, '');
        if (cleaned) {
          userMapByPhone.set(cleaned, u);
          if (cleaned.length === 12 && cleaned.startsWith('91')) {
            userMapByPhone.set(cleaned.slice(2), u);
          } else if (cleaned.length === 10) {
            userMapByPhone.set('91' + cleaned, u);
          }
        }
      };
      addPhone(uAny.phoneNo);
      addPhone(uAny.phone);
      addPhone(uAny.username);
      addPhone(uAny.farmerProfile?.phoneNo);
      addPhone(uAny.farmerProfile?.phone);
    }

    const resolvedUserIds = new Set<string>(directUserIds);
    const questionUserMap = new Map<string, string>();
    const userMap = new Map<string, any>();

    // Put phoneUsers in userMap directly by ID
    for (const u of phoneUsers) {
      userMap.set(u._id.toString(), u);
    }

    for (const question of questions) {
      const questionId = question.questionId ?? question._id?.toString();
      let resolvedUserId: string | undefined;

      if (question.threadId) {
        const match = question.threadId.match(/^(\d+)/);
        if (match) {
          const phone = match[1];
          const matchedUser = userMapByPhone.get(phone);
          if (matchedUser) {
            resolvedUserId = matchedUser._id.toString();
            userMap.set(resolvedUserId, matchedUser);
          }
        }
      }

      if (!resolvedUserId) {
        if (question.userId) {
          resolvedUserId = question.userId.toString();
        } else if (question.messageId) {
          resolvedUserId = messageUserMap.get(question.messageId);
        }
      }

      if (resolvedUserId) {
        resolvedUserIds.add(resolvedUserId);
        if (questionId) {
          questionUserMap.set(questionId, resolvedUserId);
        }
      }
    }

    const users =
      resolvedUserIds.size > 0
        ? await this.users
            .find({
              _id: {
                $in: [...resolvedUserIds].map(id => new ObjectId(id)),
              },
            })
            .toArray()
        : [];

    for (const user of users) {
      userMap.set(user._id.toString(), user);
    }

    return {
      userMap,
      questionUserMap,
    };
  }

  // async getQuestionsByCrop(
  //   crop: string,
  //   questionType: QueryCategoryQuestionType = 'all',
  //   page = 1,
  //   limit = 10,
  //   source = 'annam',
  //   session?: ClientSession,
  //   userType = 'all',
  // ): Promise<any> {
  //   try {
  //     await this.initReviewSystem();

  //     const safePage = Math.max(Number(page) || 1, 1);
  //     const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  //     const skip = (safePage - 1) * safeLimit;

  //     const cropLabel = crop?.trim();

  //     if (!cropLabel) {
  //       throw new BadRequestError('crop is required');
  //     }

  //     const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

  //     const baseMatch = {
  //       source: sourceType,
  //     };

  //     const userTypeMatch = await this.buildQuestionUserTypeMatchQuery(
  //       source,
  //       userType,
  //     );

  //     const typeMatch =
  //       questionType === 'duplicate'
  //         ? {status: 'duplicate'}
  //         : questionType === 'unique'
  //           ? {status: {$ne: 'duplicate'}}
  //           : {};

  //     const cropMatch = {
  //       $expr: {
  //         $eq: [
  //           {
  //             $toLower: {
  //               $ifNull: ['$details.normalised_crop', '$details.crop'],
  //             },
  //           },
  //           cropLabel.toLowerCase(),
  //         ],
  //       },
  //     };

  //     const result = await this.QuestionCollection.aggregate(
  //       [
  //         {
  //           $match: {
  //             ...baseMatch,
  //             ...typeMatch,
  //             ...userTypeMatch,
  //           },
  //         },

  //         {
  //           $match: cropMatch,
  //         },

  //         {
  //           $sort: {
  //             createdAt: -1,
  //           },
  //         },

  //         {
  //           $facet: {
  //             data: [
  //               {$skip: skip},
  //               {$limit: safeLimit},

  //               {
  //                 $project: {
  //                   _id: 0,

  //                   questionId: {
  //                     $toString: '$_id',
  //                   },

  //                   question: 1,
  //                   status: 1,
  //                   userId: 1,

  //                   questionType: {
  //                     $cond: [
  //                       {
  //                         $eq: ['$status', 'duplicate'],
  //                       },
  //                       'duplicate',
  //                       'unique',
  //                     ],
  //                   },

  //                   crop: {
  //                     $ifNull: ['$details.normalised_crop', '$details.crop'],
  //                   },

  //                   district: '$details.district',

  //                   village: '$details.village',

  //                   block: '$details.block',

  //                   createdAt: 1,
  //                 },
  //               },
  //             ],

  //             metadata: [
  //               {
  //                 $count: 'total',
  //               },
  //             ],
  //           },
  //         },
  //       ],
  //       {session},
  //     ).toArray();

  //     const total = result[0]?.metadata?.[0]?.total ?? 0;

  //     const questions = result[0]?.data ?? [];

  //     return {
  //       questions,
  //       total,
  //       totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  //       page: safePage,
  //       limit: safeLimit,
  //     };
  //   } catch (error) {
  //     throw new InternalServerError(`Failed to fetch crop questions: ${error}`);
  //   }
  // }

  async getQuestionsByCrop(
    crop: string,
    crops?: string[],
    questionType: QueryCategoryQuestionType = 'all',
    page = 1,
    limit = 10,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const cropLabel = crop?.trim();

      if (!cropLabel) {
        throw new BadRequestError('crop is required');
      }

      let matchStage;

      if (source === 'whatsapp') {
        matchStage = {source: 'WHATSAPP'};
      } else {
        matchStage = {source: {$ne: 'AGRI_EXPERT'}};
      }

      // const baseMatch = {
      //   source: sourceType,
      // };
      const typeMatch =
        questionType === 'duplicate'
          ? {status: 'duplicate'}
          : questionType === 'unique'
            ? {status: {$ne: 'duplicate'}}
            : {};

      // Match crop exactly how top crops aggregation calculates it
      let cropMatch;

      // if (cropLabel.toLowerCase() === 'Others') {
      //   cropMatch = {
      //     $expr: {
      //       $in: [
      //         {
      //           $toLower: {
      //             $ifNull: ['$details.normalised_crop', '$details.crop'],
      //           },
      //         },
      //         ['mango', 'maize', 'onion', 'cotton', 'chili'],
      //       ],
      //     },
      //   };
      // } else {
      //   cropMatch = {
      //     $expr: {
      //       $eq: [
      //         {
      //           $toLower: {
      //             $ifNull: ['$details.normalised_crop', '$details.crop'],
      //           },
      //         },
      //         cropLabel.toLowerCase(),
      //       ],
      //     },
      //   };
      // }

      if (crops?.length) {
        cropMatch = {
          $expr: {
            $in: [
              {
                $toLower: {
                  $ifNull: ['$details.normalised_crop', '$details.crop'],
                },
              },
              crops.map(c => c.toLowerCase()),
            ],
          },
        };
      } else {
        cropMatch = {
          $expr: {
            $eq: [
              {
                $toLower: {
                  $ifNull: ['$details.normalised_crop', '$details.crop'],
                },
              },
              crop.toLowerCase(),
            ],
          },
        };
      }

      let searchMatch = {};

      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                firstName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(user => user._id.toString());

        searchMatch = {
          userId: {
            $in: userIds,
          },
        };
      }

      const finalMatch: any = {
        ...matchStage,
        ...cropMatch,
        ...typeMatch,
        ...searchMatch,
        $and: [
          {
            $or: [{isTesting: {$exists: false}}, {isTesting: {$ne: true}}],
          },
        ],
        status: {$ne: 'non_agri'},
      };

      const userTypeMatch = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (Object.keys(userTypeMatch).length) {
        finalMatch.$and.push(userTypeMatch);
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: finalMatch,
          },

          {
            $project: {
              _id: 1,
              userId: 1,
              threadId: 1,
              messageId: 1,
              question: 1,
              status: 1,
              createdAt: 1,
              details: 1,
            },
          },
          {
            $unionWith: {
              coll: 'duplicate_questions',
              pipeline: [
                {
                  $match: finalMatch,
                },
                {
                  $project: {
                    _id: 1,
                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,
                    createdAt: 1,
                    details: 1,
                  },
                },
              ],
            },
          },

          // {
          //   $match: cropMatch,
          // },

          {
            $sort: {
              createdAt: -1,
            },
          },

          {
            $facet: {
              data: [
                {$skip: skip},
                {$limit: safeLimit},

                {
                  $project: {
                    _id: 0,
                    questionId: {
                      $toString: '$_id',
                    },

                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,

                    questionType: {
                      $cond: [
                        {
                          $eq: ['$status', 'duplicate'],
                        },
                        'duplicate',
                        'unique',
                      ],
                    },

                    createdAt: 1,

                    crop: {
                      $ifNull: ['$details.normalised_crop', '$details.crop'],
                    },

                    district: '$details.district',

                    village: '$details.village',

                    block: '$details.block',
                  },
                },
              ],

              metadata: [
                {
                  $count: 'total',
                },
              ],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;

      const questions = result[0]?.data ?? [];

      // Load users from analytics DB
      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });
      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch crop questions: ${error}`);
    }
  }

  async getQuestionsByStatus(
    status = 'all',
    page = 1,
    limit = 10,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const matchQuery = buildBaseQuestionMatch(sourceType);

      // Apply status filter
      if (status !== 'all') {
        matchQuery.status = status;
      }

      if (source === 'both') {
        matchQuery.source = {
          $in: ['AJRASAKHA', 'WHATSAPP'],
        };
      }
      if (status === 'closed') {
        matchQuery.status = {
          $in: ['closed'],
        };
      }
      if (status === 'non_gdb') {
        matchQuery.status = {
          $in: ['pass', 'dynamic_closed', 'duplicate_closed'],
        };
      }
      if (status === 'pending') {
        matchQuery.status = {
          $nin: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
        };
      }

      // Apply date range

      const validStartDate =
        startDate instanceof Date && !isNaN(startDate.getTime());

      const validEndDate = endDate instanceof Date && !isNaN(endDate.getTime());

      if (validStartDate || validEndDate) {
        matchQuery.createdAt = {};

        if (validStartDate) {
          matchQuery.createdAt.$gte = startDate;
        }

        if (validEndDate) {
          // include full day
          const endOfDay = new Date(endDate!);
          endOfDay.setHours(23, 59, 59, 999);

          matchQuery.createdAt.$lte = endOfDay;
        }
      }

      // Apply user type filter
      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchQuery.$and.push(userScope);
      }
      // Search by name/email
      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                firstName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(user => user._id.toString());

        matchQuery.userId = {
          $in: userIds,
        };
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },

          {
            $sort: {
              createdAt: -1,
            },
          },

          {
            $facet: {
              data: [
                {$skip: skip},
                {$limit: safeLimit},

                {
                  $project: {
                    _id: 0,

                    questionId: {
                      $toString: '$_id',
                    },

                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,
                    createdAt: 1,

                    district: '$details.district',

                    crop: {
                      $ifNull: ['$details.normalised_crop', '$details.crop'],
                    },

                    village: '$details.village',

                    block: '$details.block',
                  },
                },
              ],

              metadata: [
                {
                  $count: 'total',
                },
              ],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;

      const questions = result[0]?.data ?? [];

      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch questions by status: ${error}`,
      );
    }
  }

  async getQuestionsClosedWithinTwoHours(
    page = 1,
    limit = 10,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
    startDate?: Date,
    endDate?: Date,
    isPassed?: string,
    tag?: string,
    userId?: string,
  ): Promise<any> {
    await this.initReviewSystem();
    await this.init('annam');

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';
    const matchQuery = buildBaseQuestionMatch(sourceType);
    if (source === 'both') {
      matchQuery.source = {
        $in: ['AJRASAKHA', 'WHATSAPP'],
      };
    }
    if (tag !== 'slabreached') {
      matchQuery.status = {
        $in: ['closed'],
      };
      if (isPassed === 'true') {
        if (tag === 'pass') {
          matchQuery.status = {
            $in: ['pass'],
          };
        } else if (tag === 'dynamic_closed') {
          matchQuery.status = {
            $in: ['dynamic_closed'],
          };
        } else if (tag === 'duplicate_closed') {
          matchQuery.status = {
            $in: ['duplicate_closed'],
          };
        } else {
          matchQuery.status = {
            $in: ['pass', 'dynamic_closed', 'duplicate_closed'],
          };
        }
      }
    }
    const validStartDate =
      startDate instanceof Date && !isNaN(startDate.getTime());

    const validEndDate = endDate instanceof Date && !isNaN(endDate.getTime());

    if (validStartDate || validEndDate) {
      matchQuery.createdAt = {};

      if (validStartDate) {
        matchQuery.createdAt.$gte = startDate;
      }

      if (validEndDate) {
        // include full day
        const endOfDay = new Date(endDate!);
        endOfDay.setHours(23, 59, 59, 999);

        matchQuery.createdAt.$lte = endOfDay;
      }
    }

    const query = await this.buildQuestionUserTypeMatchQuery(source, userType);

    if (query && Object.keys(query).length > 0) {
      matchQuery.$and.push(query);
    }
    const userScope = await this.buildUserQuestionScope(userId);
    if (userScope) {
      matchQuery.$and.push(userScope);
    }

    // search logic same as other methods

    if (search?.trim()) {
      const matchingUsers = await this.users
        .find({
          $or: [
            {
              email: {
                $regex: search,
                $options: 'i',
              },
            },
            {
              firstName: {
                $regex: search,
                $options: 'i',
              },
            },
            {
              lastName: {
                $regex: search,
                $options: 'i',
              },
            },
            {
              'farmerProfile.farmerName': {
                $regex: search,
                $options: 'i',
              },
            },
          ],
        })
        .project({_id: 1})
        .toArray();

      const userIds = matchingUsers.map(user => user._id.toString());

      matchQuery.userId = {
        $in: userIds,
      };
    }

    const slaCondition =
      tag === 'slabreached'
        ? {
            $gt: [
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      '$_operationalCompletionAt',
                      '$_effectiveCreatedAt',
                    ],
                  },
                ],
              },
              2 * 60 * 60 * 1000,
            ],
          }
        : {
            $lte: [
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      '$_operationalCompletionAt',
                      '$_effectiveCreatedAt',
                    ],
                  },
                ],
              },
              2 * 60 * 60 * 1000,
            ],
          };

    const result = await this.QuestionCollection.aggregate([
      {
        $match: matchQuery,
      },
      {
        $addFields: {
          _statusLower: {$toLower: {$ifNull: ['$status', '']}},
          _operationalCompletionAt: {
            $cond: [
              {$eq: [{$toLower: {$ifNull: ['$status', '']}}, 'pass']},
              '$passedAt',
              '$closedAt',
            ],
          },
          _effectiveCreatedAt: {
            $let: {
              vars: {
                istHour: {
                  $hour: {date: '$createdAt', timezone: 'Asia/Kolkata'},
                },
                istDateTrunc: {
                  $dateTrunc: {
                    date: '$createdAt',
                    unit: 'day',
                    timezone: 'Asia/Kolkata',
                  },
                },
              },
              in: {
                $cond: {
                  if: {$gte: ['$$istHour', 22]},
                  then: {
                    $dateAdd: {
                      startDate: '$$istDateTrunc',
                      unit: 'hour',
                      amount: 30,
                    },
                  },
                  else: {
                    $cond: {
                      if: {$lt: ['$$istHour', 6]},
                      then: {
                        $dateAdd: {
                          startDate: '$$istDateTrunc',
                          unit: 'hour',
                          amount: 6,
                        },
                      },
                      else: '$createdAt',
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $match: {
          _statusLower: {$in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed']},
          _operationalCompletionAt: {$ne: null},
          $expr: {
            $and: [
              {$gte: ['$_operationalCompletionAt', '$createdAt']},
              slaCondition,
            ],
          },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          data: [
            {$skip: skip},
            {$limit: safeLimit},

            {
              $project: {
                _id: 0,
                questionId: {
                  $toString: '$_id',
                },
                userId: 1,
                threadId: 1,
                messageId: 1,
                question: 1,
                status: 1,
                createdAt: 1,
                closedAt: 1,
                passedAt: 1,
                district: '$details.district',
                crop: '$details.crop',
                village: '$details.village',
                block: '$details.block',
              },
            },
          ],

          metadata: [
            {
              $count: 'total',
            },
          ],
        },
      },
    ]).toArray();

    // same user enrichment logic

    const total = result[0]?.metadata?.[0]?.total ?? 0;

    const questions = result[0]?.data ?? [];

    const {userMap, questionUserMap} =
      await this.resolveQuestionUsers(questions);

    const enrichedQuestions = questions.map(question => {
      const resolvedUserId = questionUserMap.get(question.questionId);

      const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

      return {
        ...question,

        farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

        name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

        email: user?.email ?? null,

        village: question.village ?? user?.farmerProfile?.villageName,

        block: question.block ?? user?.farmerProfile?.blockName,

        district: question.district ?? user?.farmerProfile?.district,

        state: user?.farmerProfile?.state,
      };
    });
    return {
      questions: enrichedQuestions,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      page: safePage,
      limit: safeLimit,
    };
  }

  async getQuestionsByNotificationStatus(
    notificationType: string,
    page = 1,
    limit = 10,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ): Promise<any> {
    try {
      // console.log("startdate enddate-------", startDate, endDate);
      await this.initReviewSystem();
      await this.init('annam');

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const matchQuery = buildBaseQuestionMatch(sourceType);
      if (source === 'both') {
        matchQuery.source = {
          $in: ['AJRASAKHA', 'WHATSAPP'],
        };
      }
      matchQuery.status = {
        $in: ['closed'],
      };

      // Date range
      const validStartDate =
        startDate instanceof Date && !isNaN(startDate.getTime());

      const validEndDate = endDate instanceof Date && !isNaN(endDate.getTime());

      if (validStartDate || validEndDate) {
        matchQuery.createdAt = {};

        if (validStartDate) {
          matchQuery.createdAt.$gte = startDate;
        }

        if (validEndDate) {
          // include full day
          const endOfDay = new Date(endDate!);
          endOfDay.setHours(23, 59, 59, 999);

          matchQuery.createdAt.$lte = endOfDay;
        }
      }

      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchQuery.$and.push(userScope);
      }
      // console.log("getQuestionsByNotificationStatus", notificationType, JSON.stringify(matchQuery, null, 2))
      // Notification filter
      switch (notificationType) {
        case 'notified':
          matchQuery.isCustomerNotified = true;
          break;

        case 'not-notified':
          matchQuery.isCustomerNotified = false;
          break;

        case 'untracked':
          matchQuery.isCustomerNotified = {
            $exists: false,
          };
          break;
      }

      // Search
      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                name: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(user => user._id.toString());

        matchQuery.userId = {
          $in: userIds,
        };
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: matchQuery,
          },

          {
            $sort: {
              createdAt: -1,
            },
          },

          {
            $facet: {
              data: [
                {
                  $skip: skip,
                },
                {
                  $limit: safeLimit,
                },

                {
                  $project: {
                    _id: 0,

                    questionId: {
                      $toString: '$_id',
                    },

                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,
                    createdAt: 1,
                    isCustomerNotified: 1,

                    district: '$details.district',

                    crop: {
                      $ifNull: ['$details.normalised_crop', '$details.crop'],
                    },

                    village: '$details.village',

                    block: '$details.block',
                  },
                },
              ],

              metadata: [
                {
                  $count: 'total',
                },
              ],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;

      const questions = result[0]?.data ?? [];

      // const userIds = [
      //   ...new Set(questions.map(q => q.userId).filter(Boolean)),
      // ];

      // const users = await this.users
      //   .find({
      //     _id: {
      //       $in: userIds.map(id => new ObjectId(id as string)),
      //     },
      //   })
      //   .toArray();

      // const userMap = new Map(users.map(user => [user._id.toString(), user]));

      // const enrichedQuestions = questions.map(question => {
      //   const user = userMap.get(question.userId);

      //   return {
      //     ...question,

      //     farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

      //     name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

      //     email: user?.email ?? null,

      //     village: question.village ?? user?.farmerProfile?.villageName,

      //     block: question.block ?? user?.farmerProfile?.blockName,

      //     district: question.district ?? user?.farmerProfile?.district,

      //     state: user?.farmerProfile?.state,
      //   };
      // });

      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch notification questions: ${error}`,
      );
    }
  }

  async getQueriesByPeriod(
    period: string,
    page = 1,
    limit = 10,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
  ): Promise<any> {
    try {
      await this.init('annam');

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

      const skip = (safePage - 1) * safeLimit;

      const now = new Date();

      let startDate = new Date();

      switch (period) {
        case 'daily':
          startDate.setHours(0, 0, 0, 0);
          break;

        case 'weekly':
          startDate.setDate(now.getDate() - 7);
          break;

        case 'monthly':
          startDate.setDate(now.getDate() - 30);
          break;
      }

      const matchQuery: any = {
        createdAt: {
          $gte: startDate,
        },

        isCreatedByUser: true,

        isDeleted: {
          $ne: true,
        },
      };

      // Internal / External filter
      const userIds = await this.getUserIdsByUserType(source, userType);

      if (userType !== 'all') {
        matchQuery.user = {
          $in: userIds.map(id => id.toString()),
        };
      }

      // Search by user info
      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                name: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const searchUserIds = matchingUsers.map(user => user._id.toString());

        if (matchQuery.user && matchQuery.user.$in) {
          matchQuery.user.$in = matchQuery.user.$in.filter((id: string) =>
            searchUserIds.includes(id),
          );
        } else {
          matchQuery.user = {
            $in: searchUserIds,
          };
        }
      }

      const result = await this.messagesCollection
        .aggregate(
          [
            {
              $match: matchQuery,
            },

            {
              $sort: {
                createdAt: -1,
              },
            },

            {
              $facet: {
                data: [
                  {
                    $skip: skip,
                  },
                  {
                    $limit: safeLimit,
                  },

                  {
                    $project: {
                      _id: 0,

                      messageId: 1,

                      userId: '$user',

                      question: '$text',

                      createdAt: 1,
                    },
                  },
                ],

                metadata: [
                  {
                    $count: 'total',
                  },
                ],
              },
            },
          ],
          {session},
        )
        .toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;

      const queries = result[0]?.data ?? [];

      const uniqueUserIds = [
        ...new Set(queries.map(q => q.userId?.toString()).filter(Boolean)),
      ];

      const users = await this.users
        .find({
          _id: {
            $in: uniqueUserIds.map(id => new ObjectId(id as string)),
          },
        })
        .toArray();

      const userMap = new Map(users.map(user => [user._id.toString(), user]));

      const enrichedQueries = queries.map(query => {
        const user = userMap.get(query.userId?.toString());

        return {
          ...query,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: user?.farmerProfile?.villageName,

          block: user?.farmerProfile?.blockName,

          district: user?.farmerProfile?.district,

          state: user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQueries,

        total,

        totalPages: Math.max(1, Math.ceil(total / safeLimit)),

        page: safePage,

        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch ${period} queries: ${error}`,
      );
    }
  }

  async getUserConversationIds(userId: string, source = 'annam'): Promise<any> {
    try {
      await this.init(source);

      const conversations = await this.conversations
        .find(
          {
            user: userId,
          },
          {
            projection: {
              conversationId: 1,
            },
          },
        )
        .toArray();

      return conversations.map((c: any) => c.conversationId).filter(Boolean);
    } catch (error) {
      throw new InternalServerError(
        `Failed to get user conversation ids: ${error}`,
      );
    }
  }

  async getUserEmailByConversationId(
    conversationId: string,
    source = 'annam',
  ): Promise<string | null> {
    try {
      await this.init(source);

      const conversation = await this.conversations.findOne(
        {conversationId},
        {projection: {user: 1}},
      );

      if (!conversation?.user) {
        return null;
      }

      const userId = conversation.user.toString();
      const isValidObjectId =
        ObjectId.isValid(userId) && String(new ObjectId(userId)) === userId;

      if (!isValidObjectId) {
        return null;
      }

      const user = await this.users.findOne(
        {_id: new ObjectId(userId)},
        {projection: {email: 1}},
      );

      return user?.email || null;
    } catch (error) {
      console.error(`Failed to get user email by conversationId: ${error}`);
      return null;
    }
  }

  private normalizeState(state: string) {
    const stateAliases: Record<string, string> = {
      'andhra pradesh': 'andra pradesh',
      'jammu and kashmir': 'jammu and kashmir',
      uttaranchal: 'uttarakhand',
      orissa: 'odisha',
    };

    const key = state.trim().toLowerCase();
    return stateAliases[key] || key;
  }

  async getAllStatesQuestionsAndUsersData(
    source: string,
    userType: string,
    allStates: ILocationState[],
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);

      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const userDocFilter = this.buildUserDocFilter(userType);
      const matchQuery = buildBaseQuestionMatch(sourceType);

      matchQuery['details.state'] = {
        $nin: [null, '', 'all', '<unknown>', 'Not Specified', 'All'],
      };

      const query = await this.buildQuestionUserTypeMatchQuery(
        sourceType,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }

      const questionsByState = await this.QuestionCollection.aggregate([
        {
          $match: matchQuery,
        },
        {
          $group: {
            _id: '$details.state',

            totalQuestions: {
              $sum: 1,
            },

            // closedQuestions: {
            //   $sum: {
            //     $cond: [{$eq: ['$status', 'closed']}, 1, 0],
            //   },
            // },

            // totalCloseTimeMs: {
            //   $sum: {
            //     $cond: [
            //       {
            //         $and: [
            //           {$eq: ['$status', 'closed']},
            //           {$ne: ['$closedAt', null]},
            //         ],
            //       },
            //       {
            //         $subtract: ['$closedAt', '$createdAt'],
            //       },
            //       0,
            //     ],
            //   },
            // },
          },
        },
        {
          $project: {
            totalQuestions: 1,
            // closedQuestions: 1,

            // avgCloseTimeHours: {
            //   $cond: [
            //     {$gt: ['$closedQuestions', 0]},
            //     {
            //       $divide: [
            //         {
            //           $divide: ['$totalCloseTimeMs', '$closedQuestions'],
            //         },
            //         1000 * 60 * 60,
            //       ],
            //     },
            //     0,
            //   ],
            // },
          },
        },
      ]).toArray();

      const feedbackByState = await this.messagesCollection
        .aggregate([
          {
            $match: {
              feedback: {$ne: null},
              'feedback.rating': {$exists: true},
              isCreatedByUser: false,
              isDeleted: {$ne: true},
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
              as: 'userDoc',
            },
          },
          {
            $unwind: '$userDoc',
          },
          {
            $match: {
              'userDoc.farmerProfile.state': {
                $nin: [null, '', 'all', 'All', '<unknown>', 'Not Specified'],
              },
              ...userDocFilter,
            },
          },
          {
            $group: {
              _id: '$userDoc.farmerProfile.state',

              totalFeedbacks: {
                $sum: 1,
              },

              positiveFeedbacks: {
                $sum: {
                  $cond: [{$eq: ['$feedback.rating', 'thumbsUp']}, 1, 0],
                },
              },

              negativeFeedbacks: {
                $sum: {
                  $cond: [{$eq: ['$feedback.rating', 'thumbsDown']}, 1, 0],
                },
              },
            },
          },
        ])
        .toArray();


      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const usersByState = await this.users
        .aggregate([
          {
            $match: {
              isVerified: true,
              'farmerProfile.state': {$exists: true},
              ...userDocFilter,
            },
          },
          {
            $group: {
              _id: '$farmerProfile.state',

              totalUsers: {
                $sum: 1,
              },

              activeUsers: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {$gte: ['$lastActiveAt', todayStart]},
                        {$lte: ['$lastActiveAt', todayEnd]},
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              districtCoordinators: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$userRole', 'district_coordinator'],
                    },
                    1,
                    0,
                  ],
                },
              },

              blockCoordinators: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$userRole', 'block_coordinator'],
                    },
                    1,
                    0,
                  ],
                },
              },

              villageVolunteers: {
                $sum: {
                  $cond: [
                    {
                      $eq: ['$userRole', 'village_volunteer'],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      //         console.log(
      //   JSON.stringify(usersByState, null, 2),
      // );

      // const totalActiveFromStates = usersByState.reduce(
      //   (sum, s) => sum + s.activeUsers,
      //   0,
      // );

      const stateMap = new Map();

      const stateCodeMap = new Map(
        allStates.map(state => [
          state.stateNameEnglish.trim().toLowerCase(),
          state.stateCode,
        ]),
      );

      // Add question counts
      for (const q of questionsByState) {
        // const key = this.normalizeState(String(q._id));
        const key = String(q._id).toLowerCase();
        stateMap.set(key, {
          state: q._id,
          stateCode: stateCodeMap.get(key) ?? null,
          totalQuestions: q.totalQuestions,
          // closedQuestions: q.closedQuestions,
          // avgCloseTimeHours: q.avgCloseTimeHours,
          totalUsers: 0,
          activeUsers: 0,

          totalFeedbacks: 0,
          positiveFeedbacks: 0,
          negativeFeedbacks: 0,

          districtCoordinators: 0,
          blockCoordinators: 0,
          villageVolunteers: 0,

          coordinators: 0,
        });
      }

      for (const f of feedbackByState) {
        const key = String(f._id).toLowerCase();

        const existing = stateMap.get(key);

        if (existing) {
          existing.totalFeedbacks += f.totalFeedbacks;
          existing.positiveFeedbacks += f.positiveFeedbacks;
          existing.negativeFeedbacks += f.negativeFeedbacks;
        } else {
          stateMap.set(key, {
            state: f._id,
            stateCode: stateCodeMap.get(key) ?? null,

            totalQuestions: 0,

            totalFeedbacks: f.totalFeedbacks,
            positiveFeedbacks: f.positiveFeedbacks,
            negativeFeedbacks: f.negativeFeedbacks,

            totalUsers: 0,
            activeUsers: 0,

            districtCoordinators: 0,
            blockCoordinators: 0,
            villageVolunteers: 0,

            coordinators: 0,
          });
        }
      }

      // Merge user counts
      for (const u of usersByState) {
        // const key = this.normalizeState(String(u._id));
        const key = String(u._id).toLowerCase();
        if (stateMap.has(key)) {
          const existing = stateMap.get(key);

          existing.totalUsers += u.totalUsers;
          existing.activeUsers += u.activeUsers;

          existing.districtCoordinators += u.districtCoordinators ?? 0;

          existing.blockCoordinators += u.blockCoordinators ?? 0;

          existing.villageVolunteers += u.villageVolunteers ?? 0;

          existing.coordinators =
            existing.districtCoordinators +
            existing.blockCoordinators +
            existing.villageVolunteers;
        } else {
          stateMap.set(key, {
            state: u._id,
            stateCode: stateCodeMap.get(key) ?? null,
            totalQuestions: 0,
            // closedQuestions: 0,
            // avgCloseTimeHours: 0,
            totalUsers: u.totalUsers,
            activeUsers: u.activeUsers,

            totalFeedbacks: 0,
            positiveFeedbacks: 0,
            negativeFeedbacks: 0,

            districtCoordinators: u.districtCoordinators ?? 0,

            blockCoordinators: u.blockCoordinators ?? 0,

            villageVolunteers: u.villageVolunteers ?? 0,

            coordinators:
              (u.districtCoordinators ?? 0) +
              (u.blockCoordinators ?? 0) +
              (u.villageVolunteers ?? 0),
          });
        }
      }
      return Array.from(stateMap.values());
    } catch (error) {
      throw new InternalServerError(`Internal server error ${error}`);
    }
  }

  // async getStateQuestionsAndUsersData(
  //   state: string,
  //   source: string,
  //   userType: string,
  // ): Promise<any> {
  //   try {
  //     await this.initReviewSystem();
  //     await this.init(source);

  //     const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

  //     const totalQuestions = await this.QuestionCollection.countDocuments({
  //       source: sourceType,
  //       'details.state': {
  //         $regex: `^${state}$`,
  //         $options: 'i',
  //       },
  //       status: {$ne: 'non_agri'},
  //     });

  //     const closedQuestions = await this.QuestionCollection.countDocuments({
  //       source: sourceType,
  //       'details.state': {
  //         $regex: `^${state}$`,
  //         $options: 'i',
  //       },
  //       status: 'closed',
  //     });

  //     const totalUsers = await this.users.countDocuments({
  //       isVerified: true,
  //       'farmerProfile.state': {
  //         $regex: `^${state}$`,
  //         $options: 'i',
  //       },
  //     });

  //     const todayStart = new Date();
  //     todayStart.setHours(0, 0, 0, 0);

  //     const todayEnd = new Date();
  //     todayEnd.setHours(23, 59, 59, 999);

  //     const activeUsers = await this.users.countDocuments({
  //       isVerified: true,
  //       'farmerProfile.state': {
  //         $regex: `^${state}$`,
  //         $options: 'i',
  //       },
  //       lastActiveAt: {
  //         $gte: todayStart,
  //         $lte: todayEnd,
  //       },
  //     });

  //     return {
  //       state,
  //       totalQuestions,
  //       closedQuestions,
  //       totalUsers,
  //       activeUsers,
  //     };
  //   } catch (error) {
  //     throw new InternalServerError(`Something went wrong ${error}`);
  //   }
  // }

  async findMatchingMessages(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
    messageId?: string | undefined;
  }) {}

  async getUserMessageMetricDetails(
    userId: string,
    metric: string,
    page = 1,
    limit = 10,
    session?: ClientSession,
  ): Promise<any> {
    try {
      await this.init('annam');
      await this.initReviewSystem();

      const isValidObjectId =
        ObjectId.isValid(userId) && String(new ObjectId(userId)) === userId;
      const users = isValidObjectId
        ? await this.users.find({_id: new ObjectId(userId)}).toArray()
        : await this.users
            .find({$or: [{firebaseUID: userId}, {email: userId}]})
            .toArray();

      if (!users.length) {
        return {total: 0, totalPages: 1, currentPage: page, limit, items: []};
      }

      const userObjectId =
        users[0]._id instanceof ObjectId
          ? users[0]._id
          : new ObjectId(users[0]._id);
      const userIdString = userObjectId.toString();
      const skip = (page - 1) * limit;
      const paginate = (items: any[]) => ({
        total: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / limit)),
        currentPage: page,
        limit,
        items: items.slice(skip, skip + limit),
      });
      const getConversationKey = (record: any) =>
        record.threadId ||
        record.conversationId ||
        record.messageId ||
        record._id?.toString?.() ||
        String(record._id || '');
      const toMessageItem = (message: any) => ({
        _id: message.messageId || message._id?.toString?.() || String(message._id),
        message: message.text || '',
        createdAt: message.createdAt,
      });

      const userMessages = await this.messagesCollection
        .find(
          {
            user: userIdString,
            isDeleted: {$ne: true},
          },
          {session},
        )
        .project({
          _id: 1,
          text: 1,
          messageId: 1,
          threadId: 1,
          conversationId: 1,
          isCreatedByUser: 1,
          createdAt: 1,
        })
        .sort({createdAt: 1})
        .toArray();

      const userOnlyMessages = userMessages
        .filter((message: any) => message.isCreatedByUser === true)
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        );

      if (metric === 'userMessages') {
        return paginate(userOnlyMessages.map(toMessageItem));
      }

      if (metric === 'lastMessageSentAt') {
        return paginate(userOnlyMessages.slice(0, 1).map(toMessageItem));
      }

      const conversationsByKey = new Map<string, any[]>();
      userMessages.forEach((message: any) => {
        const key = getConversationKey(message);
        if (!conversationsByKey.has(key)) conversationsByKey.set(key, []);
        conversationsByKey.get(key)!.push(message);
      });
      const conversations = [...conversationsByKey.entries()]
        .map(([conversationKey, messages]) => {
          const sortedMessages = [...messages].sort(
            (a, b) =>
              new Date(a.createdAt || 0).getTime() -
              new Date(b.createdAt || 0).getTime(),
          );
          const latestMessage = sortedMessages[sortedMessages.length - 1];
          const messageCount = sortedMessages.length;
          const threadId =
            latestMessage?.threadId ||
            latestMessage?.conversationId ||
            conversationKey;
          return {
            _id: conversationKey,
            message: `${messageCount} message${messageCount === 1 ? '' : 's'}\nThread: ${threadId}${
              latestMessage?.text ? `\nLatest: ${latestMessage.text}` : ''
            }`,
            createdAt: latestMessage?.createdAt,
            messageCount,
            messages: sortedMessages,
          };
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        );

      if (
        metric === 'conversations' ||
        metric === 'averageMessagesPerConversation'
      ) {
        return paginate(
          conversations.map(({messages, ...conversation}) => conversation),
        );
      }

      if (metric === 'longestConversation') {
        const longestConversation = [...conversations].sort(
          (a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0),
        )[0];
        return paginate((longestConversation?.messages ?? []).map(toMessageItem));
      }

      if (metric === 'questionsFromMessages') {
        const userMessageIds = [
          ...new Set(
            userMessages.map((message: any) => message.messageId).filter(Boolean),
          ),
        ];
        const userThreadIds = [
          ...new Set(
            userMessages
              .map((message: any) => message.threadId || message.conversationId)
              .filter(Boolean),
          ),
        ];
        const questionUserMatches: any[] = [
          {userId: userIdString},
          {userId: userObjectId},
        ];
        if (userMessageIds.length > 0) {
          questionUserMatches.push({messageId: {$in: userMessageIds}});
        }
        if (userThreadIds.length > 0) {
          questionUserMatches.push({threadId: {$in: userThreadIds}});
        }
        const userQuestionFilter: any = buildBaseQuestionMatch('AJRASAKHA');
        userQuestionFilter.$and.push({$or: questionUserMatches});

        const questions = await this.QuestionCollection.find(
          {
            ...userQuestionFilter,
            $or: [{messageId: {$exists: true, $ne: null}}, {threadId: {$exists: true, $ne: null}}],
          },
          {session},
        )
          .project({
            _id: 1,
            question: 1,
            status: 1,
            createdAt: 1,
            messageId: 1,
            threadId: 1,
          })
          .sort({createdAt: -1})
          .toArray();

        return paginate(
          questions.map((question: any) => ({
            _id: question._id?.toString?.() || String(question._id),
            question: question.question,
            status: question.status,
            createdAt: question.createdAt,
          })),
        );
      }

      return {total: 0, totalPages: 1, currentPage: page, limit, items: []};
    } catch (error) {
      throw new InternalServerError(
        `Failed to get user message metric details: ${error}`,
      );
    }
  }

  async getUserProfile(
    userId: string,
    session?: ClientSession,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    try {
      await this.init('annam');
      await this.initReviewSystem();

      let users = [];
      const isValidObjectId =
        ObjectId.isValid(userId) && String(new ObjectId(userId)) === userId;

      if (isValidObjectId) {
        users = await this.users.find({_id: new ObjectId(userId)}).toArray();
      } else {
        users = await this.users
          .find({$or: [{firebaseUID: userId}, {email: userId}]})
          .toArray();
      }

      if (users.length === 0 && isValidObjectId) {
        const reviewSystemCollection =
          await this.db.getCollection<IUser>('users');
        const centralUser = await reviewSystemCollection.findOne({
          _id: new ObjectId(userId),
        });

        if (centralUser) {
          const orConditions = [];
          if (centralUser.firebaseUID)
            orConditions.push({firebaseUID: centralUser.firebaseUID});
          if (centralUser.email) orConditions.push({email: centralUser.email});

          if (orConditions.length > 0) {
            users = await this.users.find({$or: orConditions}).toArray();
          }
        }
      }

      if (users?.length === 0) {
        throw new InternalServerError(`No user found for Id: ${userId}`);
      }

      const userObjectId =
        users[0]._id instanceof ObjectId
          ? users[0]._id
          : new ObjectId(users[0]._id);
      const userIdString = userObjectId.toString();

      const userMessages = await this.messagesCollection
        .find(
          {
            user: userIdString,
            isDeleted: {$ne: true},
          },
          {session},
        )
        .project({
          _id: 1,
          text: 1,
          messageId: 1,
          threadId: 1,
          conversationId: 1,
          isCreatedByUser: 1,
          createdAt: 1,
        })
        .sort({createdAt: 1})
        .toArray();

      const userMessageIds = [
        ...new Set(
          userMessages.map((message: any) => message.messageId).filter(Boolean),
        ),
      ];
      const userThreadIds = [
        ...new Set(
          userMessages
            .map((message: any) => message.threadId || message.conversationId)
            .filter(Boolean),
        ),
      ];
      const questionUserMatches: any[] = [
        {userId: userIdString},
        {userId: userObjectId},
      ];
      if (userMessageIds.length > 0) {
        questionUserMatches.push({messageId: {$in: userMessageIds}});
      }
      if (userThreadIds.length > 0) {
        questionUserMatches.push({threadId: {$in: userThreadIds}});
      }

      const userQuestionFilter: any = buildBaseQuestionMatch('AJRASAKHA');

      if (questionUserMatches.length > 0) {
        userQuestionFilter.$and.push({
          $or: questionUserMatches,
        });
      }

      const userQuestions = await this.QuestionCollection.find(
        userQuestionFilter,
        {session},
      )
        .project({
          _id: 1,
          question: 1,
          status: 1,
          source: 1,
          details: 1,
          createdAt: 1,
          updatedAt: 1,
          closedAt: 1,
          passedAt: 1,
          messageId: 1,
          threadId: 1,
          similarityScore: 1,
          referenceQuestionId: 1,
          referenceQuestion: 1,
          isExact: 1,
        })
        .sort({createdAt: -1})
        .toArray();

      const normalizeStatus = (status?: string) =>
        String(status || 'unknown')
          .trim()
          .toLowerCase()
          .replace(/_/g, '-');
      const toDate = (value?: Date | string | null) =>
        value ? new Date(value) : null;
      const isValidDate = (value: Date | null) =>
        value instanceof Date && !Number.isNaN(value.getTime());
      const isDuplicateQuestion = (question: any) =>
        normalizeStatus(question.status) === 'duplicate';
      const getOperationalCompletionAt = (question: any) =>
        normalizeStatus(question.status) === 'pass'
          ? toDate(question.passedAt)
          : toDate(question.closedAt);
      const getConversationKey = (record: any) =>
        record.threadId ||
        record.conversationId ||
        record.messageId ||
        record._id?.toString?.() ||
        String(record._id || '');
      const formatBucketDate = (date: Date) => date.toISOString().slice(0, 10);
      const trendStartDate = startDate ? new Date(startDate) : null;
      const trendEndDate = endDate ? new Date(endDate) : null;
      const hasValidTrendStart = isValidDate(trendStartDate);
      const hasValidTrendEnd = isValidDate(trendEndDate);
      const isInsideTrendRange = (record: any) => {
        const createdAt = toDate(record.createdAt);
        if (!isValidDate(createdAt)) return false;
        if (hasValidTrendStart && createdAt! < trendStartDate!) return false;
        if (hasValidTrendEnd && createdAt! > trendEndDate!) return false;
        return true;
      };
      const startOfWeek = (date: Date) => {
        const copy = new Date(date);
        copy.setHours(0, 0, 0, 0);
        const day = copy.getDay();
        copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
        return copy;
      };
      const getTrendKey = (
        date: Date,
        granularity: 'daily' | 'weekly' | 'monthly',
      ) => {
        if (granularity === 'monthly') {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (granularity === 'weekly') {
          return formatBucketDate(startOfWeek(date));
        }
        return formatBucketDate(date);
      };
      const buildTrend = (
        records: any[],
        granularity: 'daily' | 'weekly' | 'monthly',
      ) => {
        const counts = new Map<string, number>();
        records.forEach(record => {
          const createdAt = toDate(record.createdAt);
          if (!isValidDate(createdAt)) return;
          const key = getTrendKey(createdAt!, granularity);
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        return [...counts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({date, count}));
      };

      const closedStatuses = new Set(['closed', 'pass']);
      const inReviewStatuses = new Set(['in-review']);
      const pendingStatuses = new Set(['open', 'pending', 'draft']);
      const carryForwardStatuses = new Set(['delayed', 're-routed', 'hold']);
      const awaitingReviewStatuses = new Set(['pae-submitted']);
      const duplicateQuestions =
        userQuestions.filter(isDuplicateQuestion).length;
      const closedQuestions = userQuestions.filter((question: any) =>
        closedStatuses.has(normalizeStatus(question.status)),
      ).length;
      const questionsClosedWithin2Hours = userQuestions.filter(
        (question: any) => {
          if (!closedStatuses.has(normalizeStatus(question.status)))
            return false;
          const createdAt = toDate(question.createdAt);
          const completedAt = getOperationalCompletionAt(question);
          if (!isValidDate(createdAt) || !isValidDate(completedAt))
            return false;
          const completionMs = completedAt!.getTime() - createdAt!.getTime();
          return completionMs >= 0 && completionMs <= 2 * 60 * 60 * 1000;
        },
      ).length;

      const conversationsByKey = new Map<string, any[]>();
      userMessages.forEach((message: any) => {
        const key = getConversationKey(message);
        if (!conversationsByKey.has(key)) conversationsByKey.set(key, []);
        conversationsByKey.get(key)!.push(message);
      });

      const conversations = [...conversationsByKey.entries()]
        .map(([conversationKey, messages]) => {
          const sortedMessages = [...messages].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          const latestMessage = sortedMessages[sortedMessages.length - 1];
          const relatedQuestion = userQuestions.find(
            (question: any) =>
              (question.threadId && question.threadId === conversationKey) ||
              (question.messageId &&
                sortedMessages.some(
                  (message: any) => message.messageId === question.messageId,
                )),
          );
          return {
            conversationKey,
            threadId:
              latestMessage?.threadId ||
              latestMessage?.conversationId ||
              conversationKey,
            conversationDate: latestMessage?.createdAt,
            messageCount: sortedMessages.length,
            questionGenerated: Boolean(relatedQuestion),
            latestMessage: latestMessage?.text || '',
            messages: sortedMessages.map((message: any) => ({
              id: message._id?.toString?.() || String(message._id),
              text: message.text || '',
              isCreatedByUser: Boolean(message.isCreatedByUser),
              createdAt: message.createdAt,
              messageId: message.messageId,
            })),
          };
        })
        .sort(
          (a, b) =>
            new Date(b.conversationDate || 0).getTime() -
            new Date(a.conversationDate || 0).getTime(),
        );
      const recentConversations = conversations.slice(0, 10);

      const conversationLookup = new Map(
        conversations.map(conversation => [
          conversation.conversationKey,
          conversation,
        ]),
      );
      const mapQuestionForDashboard = (question: any) => {
        const conversationKey = getConversationKey(question);
        const matchedConversation =
          conversationLookup.get(conversationKey) ||
          conversations.find(conversation =>
            conversation.messages.some(
              (message: any) => message.messageId === question.messageId,
            ),
          );
        return {
          id: question._id?.toString?.() || String(question._id),
          question: question.question,
          status: question.status,
          crop:
            question.details?.normalised_crop ||
            question.details?.crop?.name ||
            question.details?.crop ||
            '',
          category:
            question.details?.domain || question.details?.category || '',
          source: question.source,
          createdAt: question.createdAt,
          closedAt: getOperationalCompletionAt(question),
          isDuplicate: isDuplicateQuestion(question),
          conversationKey:
            matchedConversation?.conversationKey || conversationKey,
          messages: matchedConversation?.messages || [],
        };
      };
      const recentQuestions = userQuestions
        .slice(0, 10)
        .map(mapQuestionForDashboard);
      const questionsFromMessages = userQuestions
        .filter((question: any) => question.messageId || question.threadId)
        .map(mapQuestionForDashboard);
      const dashboardUserMessages = userMessages
        .filter((message: any) => message.isCreatedByUser === true)
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        )
        .map((message: any) => ({
          id: message._id?.toString?.() || String(message._id),
          text: message.text || '',
          isCreatedByUser: Boolean(message.isCreatedByUser),
          createdAt: message.createdAt,
          messageId: message.messageId,
        }));
      const trendQuestions = userQuestions.filter(isInsideTrendRange);
      const trendUserMessages = dashboardUserMessages.filter(isInsideTrendRange);
      const totalMessages = userMessages.length;
      const conversationCounts = conversations.map(
        conversation => conversation.messageCount,
      );
      const farmerDashboard = {
        questionMetrics: {
          totalQuestionsAsked: userQuestions.length,
          questionsClosed: closedQuestions,
          questionsInReview: userQuestions.filter((question: any) =>
            inReviewStatuses.has(normalizeStatus(question.status)),
          ).length,
          questionsPending: userQuestions.filter((question: any) =>
            pendingStatuses.has(normalizeStatus(question.status)),
          ).length,
          duplicateQuestions,
          nonDuplicateQuestions: userQuestions.length - duplicateQuestions,
          questionsClosedWithin2Hours,
          carryForwardQuestions: userQuestions.filter((question: any) =>
            carryForwardStatuses.has(normalizeStatus(question.status)),
          ).length,
          questionsAwaitingReview: userQuestions.filter((question: any) =>
            awaitingReviewStatuses.has(normalizeStatus(question.status)),
          ).length,
        },
        messagingMetrics: {
          totalMessagesSent: totalMessages,
          userMessages: userMessages.filter(
            (message: any) => message.isCreatedByUser === true,
          ).length,
          botResponsesReceived: userMessages.filter(
            (message: any) => message.isCreatedByUser === false,
          ).length,
          conversationThreads: conversationsByKey.size,
          averageMessagesPerConversation:
            conversationsByKey.size > 0
              ? Number((totalMessages / conversationsByKey.size).toFixed(2))
              : 0,
          longestConversation:
            conversationCounts.length > 0 ? Math.max(...conversationCounts) : 0,
          latestConversationDate:
            conversations[0]?.conversationDate || null,
          latestUserMessageDate: dashboardUserMessages[0]?.createdAt || null,
          questionsDerivedFromMessages: questionsFromMessages.length,
        },
        engagementTrends: {
          daily: {
            questions: buildTrend(trendQuestions, 'daily'),
            messages: buildTrend(trendUserMessages, 'daily'),
          },
          weekly: {
            questions: buildTrend(trendQuestions, 'weekly'),
            messages: buildTrend(trendUserMessages, 'weekly'),
          },
          monthly: {
            questions: buildTrend(trendQuestions, 'monthly'),
            messages: buildTrend(trendUserMessages, 'monthly'),
          },
        },
        recentQuestions,
        recentConversations,
      };
      let unAssigned = [];
      let assigned = [];
      // The coordinator one level up in the hierarchy. Populated by the coordinator
      // lookup below when applicable; null otherwise.
      let parentCoordinator: any = null;
      if (
        [
          'district_coordinator',
          'block_coordinator',
          'village_volunteer',
        ].includes(users[0]?.userRole)
      ) {
        const district = users[0]?.farmerProfile?.district;
        const block = users[0]?.farmerProfile?.blockName;
        const nextRoleMap: Record<string, string> = {
          district_coordinator: 'block_coordinator',
          block_coordinator: 'village_volunteer',
          village_volunteer: 'farmer',
        };
        const nextRole = nextRoleMap[users[0].userRole];
        const normalizeLocation = (value?: string) =>
          (value || '').trim().toLowerCase();
        const escapeRegex = (value: string) =>
          value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactRegex = (value?: string) =>
          new RegExp(`^${escapeRegex((value || '').trim())}$`, 'i');
        const findMetadataKey = (
          source: Record<string, string[]>,
          value?: string,
        ) => {
          const normalizedValue = normalizeLocation(value);
          return Object.keys(source).find(
            key => normalizeLocation(key) === normalizedValue,
          );
        };
        const districtKey = findMetadataKey(BLOCKS, district);
        const blockKey = findMetadataKey(VILLAGES, block);
        const filter: any = {
          $and: [
            {
              $or: [{assignedTo: null}, {assignedTo: {$exists: false}}],
            },
          ],
        };
        if (users[0].userRole === 'district_coordinator') {
          filter['farmerProfile.district'] = exactRegex(district);
          const districtBlocks = districtKey ? BLOCKS[districtKey] || [] : [];
          filter['farmerProfile.blockName'] = {
            $in: districtBlocks.map(blockName => exactRegex(blockName)),
          };
          filter['userRole'] = exactRegex(nextRole);
        }
        if (users[0].userRole === 'block_coordinator') {
          filter['farmerProfile.district'] = exactRegex(district);
          filter['farmerProfile.blockName'] = exactRegex(block);
          const blockVillages = blockKey ? VILLAGES[blockKey] || [] : [];
          filter['farmerProfile.villageName'] = {
            $in: blockVillages.map(villageName => exactRegex(villageName)),
          };
          filter['userRole'] = exactRegex(nextRole);
        }
        if (users[0].userRole === 'village_volunteer') {
          filter['farmerProfile.district'] = exactRegex(district);
          const districtBlocks = districtKey ? BLOCKS[districtKey] || [] : [];
          const districtVillages = districtBlocks.flatMap(blockName => {
            const villageBlockKey = findMetadataKey(VILLAGES, blockName);
            return villageBlockKey ? VILLAGES[villageBlockKey] || [] : [];
          });
          filter['farmerProfile.villageName'] = {
            $in: districtVillages.map(villageName => exactRegex(villageName)),
          };
          filter['userRole'] = {
            $nin: [
              exactRegex('district_coordinator'),
              exactRegex('block_coordinator'),
              exactRegex('village_volunteer'),
            ],
          };
        }

        unAssigned = await this.users
          .find(filter, {
            projection: {
              _id: 1,
              name: 1,
              email: 1,
              firebaseUID: 1,
              userRole: 1,
            },
          })
          .toArray();

        if (users[0]?.assignedCoordinators?.length > 0) {
          assigned = await this.users
            .find(
              {
                _id: {
                  $in: users[0].assignedCoordinators,
                },
              },
              {
                projection: {
                  _id: 1,
                  name: 1,
                  email: 1,
                  firebaseUID: 1,
                  userRole: 1,
                },
              },
            )
            .toArray();
        }
      }

      const usersWithSessions = await this.attachActiveSessionCounts(
        [
          {
            userId: userIdString,
            ...users[0],
          } as any,
        ],
        session,
      );
      const activeSessionCount = usersWithSessions[0]?.activeSessionCount ?? 0;

      return {
        userId: users[0]._id,
        name: users[0].name,
        username: users[0].username,
        email: users[0].email,
        role: users[0].role,
        farmerProfile: users[0].farmerProfile,
        createdAt: users[0].createdAt,
        isVerified: users[0].isVerified,
        userRole: users[0].userRole,
        activeSessionCount,
        totalQuestions: farmerDashboard.questionMetrics.totalQuestionsAsked,
        farmerDashboard,
        unAssigned: unAssigned ?? [],
        assigned: assigned ?? [],
        parentCoordinator,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to get user profile: ${error}`);
    }
  }

  private normalizeLocation(value?: string) {
    return (value || '').trim().toLowerCase();
  }

  private exactRegex(value?: string) {
    return new RegExp(`^${this.escapeRegex((value || '').trim())}$`, 'i');
  }

  private findMetadataKey(source: Record<string, string[]>, value?: string) {
    const normalizedValue = this.normalizeLocation(value);
    return Object.keys(source).find(
      key => this.normalizeLocation(key) === normalizedValue,
    );
  }

  private buildHierarchyTargetFilter(
    coordinator: any,
    requireUnassigned = false,
  ) {
    const district = coordinator?.farmerProfile?.district;
    const block = coordinator?.farmerProfile?.blockName;
    const role = coordinator?.userRole;
    const nextRoleMap: Record<string, string> = {
      district_coordinator: 'block_coordinator',
      block_coordinator: 'village_volunteer',
      village_volunteer: 'farmer',
    };
    const nextRole = nextRoleMap[role];

    if (!nextRole) {
      throw new BadRequestError('This user role cannot manage assignments');
    }

    const filter: any = {
      userRole: this.exactRegex(nextRole),
    };

    if (requireUnassigned) {
      filter.$and = [
        {
          $or: [{assignedTo: null}, {assignedTo: {$exists: false}}],
        },
      ];
    }

    if (role === 'district_coordinator') {
      const districtKey = this.findMetadataKey(BLOCKS, district);
      const districtBlocks = districtKey ? BLOCKS[districtKey] || [] : [];

      filter['farmerProfile.district'] = this.exactRegex(district);
      filter['farmerProfile.blockName'] = {
        $in: districtBlocks.map(blockName => this.exactRegex(blockName)),
      };
    }

    if (role === 'block_coordinator') {
      filter['farmerProfile.district'] = this.exactRegex(district);
      filter['farmerProfile.blockName'] = this.exactRegex(block);
    }

    if (role === 'village_volunteer') {
      const village = coordinator?.farmerProfile?.villageName;
      filter['farmerProfile.district'] = this.exactRegex(district);
      filter['farmerProfile.blockName'] = this.exactRegex(block);
      filter['farmerProfile.villageName'] = this.exactRegex(village);
    }

    return filter;
  }

  async assignUsers(coordinatorId: string, targetIds: string[]): Promise<any> {
    try {
      await this.init('annam');

      const targetObjectIds = targetIds.map(id => new ObjectId(id));
      const coordinator = await this.users.findOne({
        _id: new ObjectId(coordinatorId),
      });

      if (!coordinator) {
        throw new BadRequestError('Coordinator not found');
      }

      const allowedFilter = this.buildHierarchyTargetFilter(coordinator, true);
      const validTargetsCount = await this.users.countDocuments({
        ...allowedFilter,
        _id: {$in: targetObjectIds},
      });

      if (validTargetsCount !== targetObjectIds.length) {
        throw new BadRequestError(
          'One or more selected users are outside this coordinator hierarchy',
        );
      }

      await this.users.updateMany(
        {
          _id: {
            $in: targetObjectIds,
          },
        },
        {
          $set: {
            assignedTo: new ObjectId(coordinatorId),
          },
        },
      );

      const result = await this.users.updateOne(
        {
          _id: new ObjectId(coordinatorId),
        },
        {
          $addToSet: {
            assignedCoordinators: {
              $each: targetObjectIds,
            },
          },
        },
      );

      return result;
    } catch (error) {
      throw new InternalServerError(error);
    }
  }

  async unAssignUsers(
    coordinatorId: string,
    targetIds: string[],
  ): Promise<any> {
    try {
      await this.init('annam');

      const targetObjectIds = targetIds.map(id => new ObjectId(id));
      const validTargetsCount = await this.users.countDocuments({
        _id: {$in: targetObjectIds},
        assignedTo: new ObjectId(coordinatorId),
      });

      if (validTargetsCount !== targetObjectIds.length) {
        throw new BadRequestError(
          'One or more selected users are not assigned to this coordinator',
        );
      }

      // Remove coordinator from users
      await this.users.updateMany(
        {
          _id: {$in: targetObjectIds},
        },
        {
          $set: {assignedTo: null},
        },
      );

      // Remove users from coordinator
      const result = await this.users.updateOne(
        {
          _id: new ObjectId(coordinatorId),
        },
        {
          $pullAll: {
            assignedCoordinators: targetObjectIds,
          },
        },
      );

      return result;
    } catch (error) {
      throw new InternalServerError(error);
    }
  }

  async getVillageUserCounts(
    state: string,
    district: string,
    source: string,
    userType: string,
    session?: ClientSession,
  ) {
    try {
      await this.init(source);
      // console.log("State", state, "district", district);
      const userDocFilter = this.buildUserDocFilter(userType);
      const data = await this.users
        .aggregate([
          {
            $match: {
              isVerified: true,

              'farmerProfile.state': {
                $regex: `^${state}$`,
                $options: 'i',
              },

              'farmerProfile.district': {
                $regex: `^${district}$`,
                $options: 'i',
              },

              'farmerProfile.villageName': {
                $exists: true,
                $ne: null,
              },
              ...userDocFilter,
            },
          },

          {
            $group: {
              _id: '$farmerProfile.villageName',

              totalUsers: {
                $sum: 1,
              },
            },
          },

          {
            $project: {
              _id: 0,
              village: '$_id',
              totalUsers: 1,
            },
          },

          {
            $sort: {
              totalUsers: -1,
            },
          },
        ])
        .toArray();
      // console.log("Data got it", data)
      return data;
    } catch (error) {
      throw new InternalServerError(`Internal Server Error ${error}`);
    }
  }

  async getQuestionLifecycle(questionId: string): Promise<any[]> {
    try {
      await this.initReviewSystem();
      await this.init('annam');

      const question = await this.QuestionCollection.findOne({
        _id: new ObjectId(questionId),
      });

      if (!question) {
        throw new Error('Question not found');
      }

      const conversation = question.messageId
        ? await this.messagesCollection.findOne(
            {
              messageId: question.messageId,
            },
            {
              projection: {
                createdAt: 1,
                title: 1,
                user: 1,
              },
            },
          )
        : null;
      let questionAskedBy;
      if (conversation) {
        questionAskedBy = await this.users.findOne(
          {
            _id: new ObjectId(conversation.user),
          },
          {
            projection: {
              email: 1,
            },
          },
        );
      }

      const submission = await this.QuestionSubmissionsCollection.findOne({
        questionId: question._id,
      });

      const rerouteDoc = await this.Reroutes.findOne({
        questionId: question._id,
      });

      const reviewTimeline = buildReviewTimeline(
        submission?.history || [],
        submission?.queue || [],
        question.createdAt,
        question.status,
        question.firstAllocationAt,
      );

      // ---------------------------------------------------
      // Build User Map
      // ---------------------------------------------------

      const userIds = new Set<string>();

      reviewTimeline.forEach((r: any) => {
        if (r.reviewerId) {
          userIds.add(r.reviewerId);
        }
      });

      submission?.history?.forEach((h: any) => {
        if (h.updatedBy) {
          userIds.add(h.updatedBy.toString());
        }
      });

      rerouteDoc?.reroutes?.forEach((r: any) => {
        if (r.reroutedBy) {
          userIds.add(r.reroutedBy.toString());
        }

        if (r.reroutedTo) {
          userIds.add(r.reroutedTo.toString());
        }
      });

      if (question.moderatorAssignedAt && question.moderatorId) {
        userIds.add(question.moderatorId.toString());
      }

      let questionPassedBy;
      if (question.passedAt && question.passedBy) {
        questionPassedBy = await this.ReviewUsers.findOne(
          {
            _id: new ObjectId(question.passedBy.toString()),
          },
          {
            projection: {
              email: 1,
            },
          },
        );
      }

      const users = await this.ReviewUsers.find(
        {
          _id: {
            $in: [...userIds].map(id => new ObjectId(id)),
          },
        },
        {
          projection: {
            firstName: 1,
            lastName: 1,
          },
        },
      ).toArray();

      const userMap = new Map<string, string>();

      users.forEach((u: any) => {
        userMap.set(
          u._id.toString(),
          `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        );
      });

      // ---------------------------------------------------
      // Timeline
      // ---------------------------------------------------

      const timeline: any[] = [];
      // ---------------------------------------------------
      // Reroutes
      // ---------------------------------------------------

      rerouteDoc?.reroutes?.forEach((r: any) => {
        const isPending = r.status === 'pending';

        let action = 'Approval Review';

        if (r.status === 'approved') {
          action = 'Approval Review';
        } else if (r.status === 'modified') {
          action = 'Modified';
        } else if (r.status === 'rejected') {
          action = 'Rejected';
        } else if (r.status === 'pending') {
          action = 'Approval Review';
        }

        timeline.push({
          timestamp: r.reroutedAt,
          user: userMap.get(r.reroutedTo?.toString()) || 'Unknown User',
          action,
          duration: isPending
            ? Date.now() - new Date(r.reroutedAt).getTime()
            : r.updatedAt.getTime() - r.reroutedAt.getTime(),
          remarks: r.comment || '',
          endTime: isPending ? new Date() : r.updatedAt,
          eventType: 'reroute',
        });
      });

      const isDuplicate =
        question.status === 'duplicate' || !!question.referenceQuestionId;

      // if (question.status === 'duplicate') {
      //   return [
      //     {
      //       timestamp: question.createdAt,
      //       user: '-',
      //       action: 'Duplicate Question',
      //       duration: null,
      //       remarks: 'Original question lifecycle is not available.',
      //       endTime: null,
      //       eventType: 'duplicate',
      //     },
      //     {
      //       timestamp: question.closedAt || question.updatedAt,
      //       user: 'Buffer Time',
      //       action: 'Question Marked As Duplicate',
      //       duration:
      //         question.updatedAt.getTime() - question.createdAt.getTime(),
      //       remarks: 'Closed as duplicate',
      //       endTime: question.closedAt || question.updatedAt,
      //       eventType: 'closure',
      //     },
      //   ];
      // }

      const questionAskedAt =
        conversation?.createdAt && conversation.createdAt < question.createdAt
          ? conversation.createdAt
          : new Date(question.createdAt.getTime() - 5000);

      if (isDuplicate) {
        timeline.push({
          timestamp: question.createdAt,
          user: questionAskedBy?.email
            ? questionAskedBy?.email
            : 'User details not available',
          action: 'Question Asked',
          duration: null,
          remarks: 'Original question lifecycle is not available.',
          endTime: null,
          eventType: 'inception',
        });
      } else if (conversation?.createdAt) {
        timeline.push({
          timestamp: questionAskedAt,
          user: questionAskedBy?.email,
          action: 'Question Asked On Web Application',
          duration: null,
          remarks: '',
          endTime: questionAskedAt,
          eventType: 'inception',
        });

        timeline.push({
          timestamp: questionAskedAt,
          user: 'Buffer Time',
          action: 'Pushed To Review System',
          duration:
            question.createdAt.getTime() - conversation.createdAt.getTime(),
          remarks: '',
          endTime: question.createdAt,
          eventType: 'system_wait',
        });
      } else if (question.source === 'AGRI_EXPERT') {
        timeline.push({
          timestamp: question.createdAt.getTime(),
          user: '-',
          action: 'Question Created Internally',
          duration: null,
          remarks: 'Conversation mapping not found',
          endTime: question.createdAt.getTime(),
          eventType: 'inception',
        });
      } else {
        timeline.push({
          timestamp: null,
          user: 'Buffer Time',
          action: 'Question Inception Time Unavailable',
          duration: null,
          remarks: 'Conversation mapping not found',
          endTime: null,
          eventType: 'inception',
          // questionId: question._id,
        });
      }
      // ---------------------------------------------------
      // Initial Allocation Wait
      // ---------------------------------------------------

      const firstAllocationAt = question.firstAllocationAt
        ? new Date(question.firstAllocationAt)
        : null;

      if (
        firstAllocationAt &&
        firstAllocationAt.getTime() - new Date(question.createdAt).getTime() >
          1000
      ) {
        timeline.push({
          timestamp: question.createdAt,
          user: 'Buffer Time',
          action: 'Initial Allocation Pending',
          duration:
            firstAllocationAt.getTime() -
            new Date(question.createdAt).getTime(),
          remarks: '',
          endTime: firstAllocationAt,
          eventType: 'system_wait',
        });
      }

      // ---------------------------------------------------
      // Review Timeline
      // ---------------------------------------------------

      reviewTimeline.forEach((review: any, index: number) => {
        const historyItem = submission?.history?.[index];

        const reviewerName = userMap.get(review.reviewerId) || 'Unknown User';

        let action = 'Review';

        if (index === 0) {
          action = review.isCompleted ? 'Authored Answer' : 'Authoring Answer';
        } else if (historyItem?.modifiedAnswer) {
          action = 'Modified';
        } else if (historyItem?.status) {
          action =
            historyItem.status.charAt(0).toUpperCase() +
            historyItem.status.slice(1);
        }

        timeline.push({
          timestamp: review.assignedAt,
          user: reviewerName,
          action,
          duration: review.isCompleted
            ? review.timeTakenMs
            : Date.now() - new Date(review.assignedAt).getTime(),
          remarks:
            historyItem?.reasonForRejection ||
            historyItem?.reasonForLastModification ||
            '',
          endTime: review.completedAt || review.assignedAt,
          eventType: index === 0 ? 'author' : 'reviewer',
        });
      });

      const lastReview = reviewTimeline[reviewTimeline.length - 1];
      const finalReviewerCompletedAt =
        lastReview?.completedAt || lastReview?.assignedAt || question.createdAt;

      if (question.moderatorAssignedAt && question.moderatorId) {
        const moderatorName =
          userMap.get(question.moderatorId.toString()) || 'Unknown User';

        const moderatorAssignedAt =
          typeof question.moderatorAssignedAt === 'string'
            ? new Date(question.moderatorAssignedAt)
            : question.moderatorAssignedAt;

        if (
          moderatorAssignedAt &&
          question.moderatorId &&
          moderatorAssignedAt.getTime() >
            new Date(finalReviewerCompletedAt).getTime()
        ) {
          timeline.push({
            timestamp: finalReviewerCompletedAt,
            user: 'Buffer Time',
            action: 'Awaiting Moderator Assignment',
            duration:
              moderatorAssignedAt.getTime() -
              new Date(finalReviewerCompletedAt).getTime(),
            remarks: '',
            endTime: moderatorAssignedAt,
            eventType: 'system_wait',
          });
        }
        const moderatorCompletedAt = question.closedAt || question.passedAt;
        timeline.push({
          timestamp: moderatorAssignedAt,
          user: moderatorName,
          action: 'Approval Review',
          duration: moderatorCompletedAt
            ? moderatorCompletedAt.getTime() - moderatorAssignedAt.getTime()
            : Date.now() - moderatorAssignedAt.getTime(),
          remarks: '',
          endTime: moderatorCompletedAt ?? new Date(),
          eventType: 'moderator',
        });
      }

      // ---------------------------------------------------
      // Sort
      // ---------------------------------------------------

      timeline.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : -1;

        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : -1;

        return aTime - bTime;
      });

      // ---------------------------------------------------
      // Insert Gaps
      // ---------------------------------------------------

      const finalTimeline: any[] = [];

      for (let i = 0; i < timeline.length; i++) {
        finalTimeline.push(timeline[i]);

        const current = timeline[i];
        const next = timeline[i + 1];

        if (!next) {
          continue;
        }

        if (!current.endTime || !next.timestamp) {
          continue;
        }

        const currentEnd = current.endTime;
        const nextStart = next.timestamp;

        const gap =
          new Date(nextStart).getTime() - new Date(currentEnd).getTime();

        const shouldInsertGap =
          gap > 1000 &&
          current.eventType !== 'reroute' &&
          ![
            'Question Asked',
            'Question Inception Time Unavailable',
            'Pushed To Review System',
            'Initial Allocation Pending',
          ].includes(current.action);

        if (shouldInsertGap) {
          const nextEvent = timeline[i + 1];
          const action =
            nextEvent?.eventType === 'reroute'
              ? 'Re-routed For Review'
              : 'Pending Next Assignment';

          finalTimeline.push({
            timestamp: currentEnd,
            user: 'Buffer Time',
            action,
            duration: gap,
            remarks: '',
            endTime: nextStart,
            eventType: 'system_wait',
          });
        }
      }

      // ---------------------------------------------------
      // Open Questions
      // ---------------------------------------------------

      const isClosed = !!question.closedAt || !!question.passedAt;

      const moderatorInProgress =
        !!question.moderatorAssignedAt &&
        !question.closedAt &&
        !question.passedAt;

      const currentAssigneeInProgress =
        reviewTimeline.length > 0 &&
        reviewTimeline[reviewTimeline.length - 1].isCompleted === false;

      const hasActiveWork =
        currentAssigneeInProgress ||
        moderatorInProgress ||
        rerouteDoc?.reroutes?.some((r: any) => r.status === 'pending');

      if (!isClosed && !hasActiveWork) {
        const last = finalTimeline[finalTimeline.length - 1];

        if (last) {
          const lastEnd = new Date(
            last.endTime || last.timestamp || question.createdAt,
          );

          finalTimeline.push({
            timestamp: lastEnd ?? question.createdAt.getTime(),
            user: 'Buffer Time',
            action: question.status === 'hold' ? 'On Hold' : 'Awaiting Action',
            duration: Date.now() - lastEnd.getTime(),
            remarks: '',
            endTime: new Date(),
            eventType: 'system_wait',
          });
        }
      }

      // ---------------------------------------------------
      // Awaiting Closure
      // ---------------------------------------------------

      let completionTime = question.closedAt || question.passedAt;

      if (completionTime) {
        const last = finalTimeline[finalTimeline.length - 1];

        if (last) {
          const lastTimestamp = last.endTime ?? last.timestamp;

          if (lastTimestamp) {
            const lastEnd = new Date(lastTimestamp);

            if (!isNaN(lastEnd.getTime())) {
              if (typeof completionTime === 'string') {
                completionTime = new Date(completionTime);
              }

              const waitForClosure =
                completionTime.getTime() - lastEnd.getTime();

              if (waitForClosure > 1000) {
                finalTimeline.push({
                  timestamp: lastEnd,
                  user: 'Buffer Time',
                  action: 'Awaiting Closure/Pass',
                  duration: waitForClosure,
                  remarks: '',
                  endTime: completionTime,
                  eventType: 'system_wait',
                });
              }
            }
          }
        }
      }

      // ---------------------------------------------------
      // Final Closed / Passed Event
      // ---------------------------------------------------

      if (question.closedAt) {
        finalTimeline.push({
          timestamp: question.closedAt,
          user: '-',
          action: `Question Closed ${
            question.isCustomerNotified
              ? '(Customer Notified)'
              : '(Customer Not Notified)'
          }`,
          duration: null,
          remarks: '',
          endTime: question.closedAt,
          eventType: 'closure',
        });
      } else if (question.passedAt) {
        finalTimeline.push({
          timestamp: question.passedAt,
          user: questionPassedBy?.email || '-',
          action: `Question Passed ${
            question.passingRemark ? ` (Remark: ${question.passingRemark})` : ''
          }`,
          duration: null,
          remarks: '',
          endTime: question.passedAt,
          eventType: 'closure',
        });
      }
      // console.log("finalTimeline--", finalTimeline)
      return finalTimeline;
    } catch (err) {
      // console.log("err----", err);
      throw Error(err);
    }
  }

  async getQuestionFromState(
    state: string,
    questionType: QueryCategoryQuestionType = 'all',
    page = 1,
    limit = 10,
    source: string,
    session?: ClientSession,
    userType = 'all',
    search?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const baseMatch = buildBaseQuestionMatch(sourceType);

      baseMatch['details.state'] = {
        $exists: true,
        $nin: [null, ''],
      };

      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        baseMatch.$and.push(query);
      }

      const stateLabel = state.trim();

      if (!stateLabel) {
        throw new BadRequestError('state is required');
      }

      const stateMatch = {
        'details.state': stateLabel,
      };

      const typeMatch =
        questionType === 'duplicate'
          ? {status: 'duplicate'}
          : questionType === 'unique'
            ? {status: {$ne: 'duplicate'}}
            : {};

      let searchMatch = {};

      if (search?.trim()) {
        const matchingUsers = await this.users
          .find({
            $or: [
              {
                email: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                firstName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                lastName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                'farmerProfile.farmerName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          })
          .project({_id: 1})
          .toArray();

        const userIds = matchingUsers.map(u => u._id.toString());

        searchMatch = {
          userId: {
            $in: userIds,
          },
        };
      }

      const result = await this.QuestionCollection.aggregate(
        [
          {
            $match: {
              ...baseMatch,
              ...stateMatch,
              ...typeMatch,
              ...searchMatch,
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $facet: {
              data: [
                {
                  $skip: skip,
                },
                {
                  $limit: safeLimit,
                },
                {
                  $project: {
                    _id: 0,
                    questionId: {
                      $toString: '$_id',
                    },
                    userId: 1,
                    threadId: 1,
                    messageId: 1,
                    question: 1,
                    status: 1,
                    questionType: {
                      $cond: [
                        {
                          $eq: ['$status', 'duplicate'],
                        },
                        'duplicate',
                        'unique',
                      ],
                    },
                    createdAt: 1,
                    district: '$details.district',
                    block: '$details.block',
                    village: '$details.village',
                    crop: '$details.crop',
                  },
                },
              ],
              metadata: [
                {
                  $count: 'total',
                },
              ],
            },
          },
        ],
        {session},
      ).toArray();

      const total = result[0]?.metadata?.[0]?.total ?? 0;
      const questions = result[0]?.data ?? [];

      const {userMap, questionUserMap} =
        await this.resolveQuestionUsers(questions);

      const enrichedQuestions = questions.map(question => {
        const resolvedUserId = questionUserMap.get(question.questionId);

        const user = resolvedUserId ? userMap.get(resolvedUserId) : undefined;

        return {
          ...question,

          farmerName: user?.farmerProfile?.farmerName ?? user?.name ?? null,

          name: `${user?.name ?? ''} ${user?.lastName ?? ''}`.trim(),

          email: user?.email ?? null,

          village: question.village ?? user?.farmerProfile?.villageName,

          block: question.block ?? user?.farmerProfile?.blockName,

          district: question.district ?? user?.farmerProfile?.district,

          state: question.state ?? user?.farmerProfile?.state,
        };
      });

      return {
        questions: enrichedQuestions,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get questions from state ${state}: ${error}`,
      );
    }
  }

  async getActiveUsersDetails(
    page = 1,
    limit = 10,
    source: string,
    userType = 'all',
    session?: ClientSession,
    state?: string,
    district?: string,
    search?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const userFilter: any = {
        isVerified: true,
        lastActiveAt: {
          $gte: todayStart,
          $lte: todayEnd,
        },
        ...this.buildUserDocFilter(userType),
      };

      if (state?.trim()) {
        userFilter['farmerProfile.state'] = {
          $regex: `^${state.trim()}$`,
          $options: 'i',
        };
      }

      if (district?.trim()) {
        userFilter['farmerProfile.district'] = {
          $regex: `^${district.trim()}$`,
          $options: 'i',
        };
      }

      if (search?.trim()) {
        userFilter.$or = [
          {
            email: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            firstName: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            lastName: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'farmerProfile.farmerName': {
              $regex: search,
              $options: 'i',
            },
          },
        ];
      }

      const total = await this.users.countDocuments(userFilter, {
        session,
      });

      const users = await this.users
        .find(userFilter, {session})
        .sort({
          lastActiveAt: -1,
        })
        .skip(skip)
        .limit(safeLimit)
        .toArray();

      const formattedUsers = users.map(user => ({
        userId: user._id.toString(),

        farmerName: user.farmerProfile?.farmerName ?? user.firstName ?? '',

        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),

        email: user.email,

        phoneNumber: user.farmerProfile?.phoneNo,

        village: user.farmerProfile?.villageName,

        block: user.farmerProfile?.blockName,

        district: user.farmerProfile?.district,

        state: user.farmerProfile?.state,

        role: user.userRole,

        createdAt: user.createdAt,
      }));

      return {
        users: formattedUsers,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch active users: ${error}`);
    }
  }
  async getWeatherConcernQueries(
    filters: WeatherConcernAnalyticsFilters,
    concern: string,
    page: number,
    limit: number,
    source = 'annam',
    session?: ClientSession,
    userType = 'all',
    search?: string,
  ): Promise<PaginatedQueryCategoryQuestions> {
    try {
      await this.init(source);

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      // ============================================
      // LOCATION FILTERS
      // ============================================

      const locationMatch: Record<string, any> = {};

      const stateRegex = this.buildExactTextRegex(filters.state);
      const districtRegex = this.buildExactTextRegex(filters.district);
      const blockRegex = this.buildExactTextRegex(filters.block);
      const villageRegex = this.buildExactTextRegex(filters.village);

      if (stateRegex) {
        locationMatch['userDetails.farmerProfile.state'] = stateRegex;
      }

      if (districtRegex) {
        locationMatch['userDetails.farmerProfile.district'] = districtRegex;
      }

      if (blockRegex) {
        locationMatch['userDetails.farmerProfile.blockName'] = blockRegex;
      }

      if (villageRegex) {
        locationMatch['userDetails.farmerProfile.villageName'] = villageRegex;
      }

      // ============================================
      // USER TYPE FILTER
      // ============================================

      const userDocFilter = this.buildUserDocFilter(userType);

      const userTypeMatch = this.buildJoinedUserDocFilter(
        userDocFilter,
        'userDetails',
      );

      // ============================================
      // MATCH WEATHER AI RESPONSES
      // ============================================

      const messageMatch: Record<string, any> = {
        isDeleted: {$ne: true},
        isCreatedByUser: false,
        'content.tool_call.name': {
          $regex: 'weather',
          $options: 'i',
        },
      };

      // ============================================
      // DATE FILTER
      // ============================================

      if (filters.startDate || filters.endDate) {
        messageMatch.createdAt = {};

        if (filters.startDate) {
          messageMatch.createdAt.$gte = new Date(filters.startDate);
        }

        if (filters.endDate) {
          messageMatch.createdAt.$lte = new Date(filters.endDate);
        }
      }

      // ============================================
      // CONCERN REGEX EXPRESSIONS
      // ============================================

      const concernExpressions = Object.fromEntries(
        Object.entries(WEATHER_CONCERNS).map(([c, keywords]) => [
          c,
          {
            $regexMatch: {
              input: '$contentSignal',
              regex: `\\b(?:${keywords
                .map(keyword => this.escapeRegex(keyword))
                .join('|')})\\b`,
              options: 'i',
            },
          },
        ]),
      );

      // ============================================
      // PIPELINE
      // ============================================

      const pipeline: any[] = [
        {
          $match: messageMatch,
        },
        {
          $lookup: {
            from: 'messages',
            localField: 'parentMessageId',
            foreignField: 'messageId',
            as: 'userMessage',
          },
        },
        {
          $unwind: '$userMessage',
        },
        {
          $match: {
            'userMessage.isCreatedByUser': true,
          },
        },
        {
          $addFields: {
            _userRef: {
              $ifNull: ['$userMessage.user', '$userMessage.userId'],
            },
          },
        },
        {
          $addFields: {
            _userOid: {
              $cond: [
                {
                  $eq: [{$type: '$_userRef'}, 'objectId'],
                },
                '$_userRef',
                {
                  $cond: [
                    {
                      $and: [
                        {$ne: ['$_userRef', null]},
                        {$ne: ['$_userRef', '']},
                      ],
                    },
                    {$toObjectId: '$_userRef'},
                    null,
                  ],
                },
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_userOid',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: userType !== 'external',
          },
        },
      ];

      if (Object.keys(userTypeMatch).length > 0) {
        pipeline.push({$match: userTypeMatch});
      }

      if (Object.keys(locationMatch).length > 0) {
        pipeline.push({$match: locationMatch});
      }

      pipeline.push({
        $addFields: {
          contentSignal: {
            $toLower: {
              $ifNull: ['$userMessage.text', ''],
            },
          },
        },
      });

      const seasonRegex = this.buildContainsTextRegex(filters.season);

      if (seasonRegex) {
        pipeline.push({
          $match: {
            contentSignal: seasonRegex,
          },
        });
      }

      pipeline.push(
        {
          $addFields: {
            detectedConcerns: concernExpressions,
          },
        },
        {
          $addFields: {
            hasKnownConcern: {
              $anyElementTrue: [
                Object.keys(WEATHER_CONCERNS).map(
                  c => `$detectedConcerns.${c}`,
                ),
              ],
            },
          },
        },
      );

      // ============================================
      // MATCH SPECIFIC CONCERN
      // ============================================

      if (concern === 'Others') {
        pipeline.push({
          $match: {hasKnownConcern: false},
        });
      } else {
        const concernEntry = Object.entries(WEATHER_CONCERN_LABELS).find(
          ([_, label]) => label === concern,
        );

        if (!concernEntry) {
          throw new BadRequestError(`Invalid concern label: ${concern}`);
        }

        const concernKey = concernEntry[0];

        pipeline.push({
          $match: {
            [`detectedConcerns.${concernKey}`]: true,
          },
        });
      }

      // ============================================
      // PROJECT AND PAGINATE
      // ============================================

      pipeline.push({
        $project: {
          questionId: '$userMessage.messageId',
          question: '$userMessage.text',
          status: {$ifNull: ['$userMessage.status', 'unique']},
          questionType: {
            $cond: [
              {$eq: ['$userMessage.status', 'duplicate']},
              'duplicate',
              'unique',
            ],
          },
          category: {$literal: concern},
          createdAt: '$userMessage.createdAt',
          farmerName: '$userDetails.farmerProfile.farmerName',
          email: '$userDetails.email',
          village: '$userDetails.farmerProfile.villageName',
          block: '$userDetails.farmerProfile.blockName',
          district: '$userDetails.farmerProfile.district',
          state: '$userDetails.farmerProfile.state',
        },
      });

      // ============================================
      // SEARCH FILTER
      // ============================================

      if (search && search.trim()) {
        const escapedSearch = this.escapeRegex(search.trim());
        const searchRegex = {$regex: escapedSearch, $options: 'i'};

        pipeline.push({
          $match: {
            $or: [
              {farmerName: searchRegex},
              {email: searchRegex},
              {question: searchRegex},
              {questionId: searchRegex},
            ],
          },
        });
      }

      pipeline.push({
        $facet: {
          questions: [
            {$sort: {createdAt: -1}},
            {$skip: skip},
            {$limit: safeLimit},
          ],
          total: [{$count: 'count'}],
        },
      });

      const [result] = await this.messagesCollection
        .aggregate(pipeline, {session})
        .toArray();

      const questions = result?.questions || [];
      const total = result?.total?.[0]?.count || 0;
      const totalPages = Math.ceil(total / safeLimit);

      return {
        questions,
        total,
        totalPages,
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get weather concern queries: ${error}`,
      );
    }
  }

  async getCoordinatorsDetails(
    page = 1,
    limit = 10,
    source: string,
    userType = 'all',
    session?: ClientSession,
    state?: string,
    district?: string,
    search?: string,
  ): Promise<any> {
    try {
      await this.initReviewSystem();
      await this.init(source);

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const userFilter: any = {
        isVerified: true,

        userRole: {
          $in: [
            'district_coordinator',
            'block_coordinator',
            'village_volunteer',
          ],
        },
      };

      // State filter
      if (state?.trim()) {
        userFilter['farmerProfile.state'] = {
          $regex: `^${state.trim()}$`,
          $options: 'i',
        };
      }

      // District filter
      if (district?.trim()) {
        userFilter['farmerProfile.district'] = {
          $regex: `^${district.trim()}$`,
          $options: 'i',
        };
      }

      // Search
      if (search?.trim()) {
        userFilter.$or = [
          {
            email: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            firstName: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            lastName: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'farmerProfile.farmerName': {
              $regex: search,
              $options: 'i',
            },
          },
        ];
      }

      // If external users are selected
      if (userType === 'external') {
        userFilter.userRole = {
          $in: [
            'district_coordinator',
            'block_coordinator',
            'village_volunteer',
          ],
        };
      }

      // If internal users are selected
      if (userType === 'internal') {
        userFilter.userRole = 'INTERNAL';
      }

      const total = await this.users.countDocuments(userFilter, {
        session,
      });

      const users = await this.users
        .find(userFilter, {session})
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(safeLimit)
        .toArray();

      const formattedUsers = users.map(user => ({
        userId: user._id.toString(),

        farmerName: user.farmerProfile?.farmerName ?? user.name ?? '',

        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),

        email: user.email,

        phoneNumber: user.farmerProfile?.phoneNo,

        village: user.farmerProfile?.villageName,

        block: user.farmerProfile?.blockName,

        district: user.farmerProfile?.district,

        state: user.farmerProfile?.state,

        role: user.userRole,

        createdAt: user.createdAt,
      }));

      return {
        users: formattedUsers,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch moderators: ${error}`);
    }
  }

  async getLifeCycleSummary(
    status = 'all',
    source = 'annam',
    userType = 'all',
    startDate?: Date,
    endDate?: Date,
    isPassed?: string,
    tag?: string,
    notificationType?: string,
    userId?: string,
    page = 1,
    limit = 1000,
  ) {
    try {
      await this.initReviewSystem();
      await this.init('annam');
      const sourceType = source === 'whatsapp' ? 'WHATSAPP' : 'AJRASAKHA';

      const matchQuery = buildBaseQuestionMatch(sourceType);

      if (source === 'both') {
        matchQuery.source = {
          $in: ['AJRASAKHA', 'WHATSAPP'],
        };
      }
      if (tag === 'closed') {
        if (status === 'closed') {
          matchQuery.status = {
            $in: ['closed'],
          };
        } else if (status === 'non_gdb') {
          matchQuery.status = {
            $in: ['pass', 'dynamic_closed', 'duplicate_closed'],
          };
        } else if (status === 'pending') {
          matchQuery.status = {
            $nin: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
          };
        } else if (status !== 'all') {
          matchQuery.status = status;
        }
      } else if (tag === 'sla') {
        if (isPassed === 'true') {
          matchQuery.status = {
            $in: ['pass', 'dynamic_closed', 'duplicate_closed'],
          };
        }
        if (isPassed === 'false') {
          matchQuery.status = {
            $in: ['closed'],
          };
        }
      } else if (tag === 'notify') {
        matchQuery.status = {
          $in: ['closed'],
        };
      }

      const query = await this.buildQuestionUserTypeMatchQuery(
        source,
        userType,
      );

      if (query && Object.keys(query).length > 0) {
        matchQuery.$and.push(query);
      }
      const userScope = await this.buildUserQuestionScope(userId);
      if (userScope) {
        matchQuery.$and.push(userScope);
      }

      if (startDate || endDate) {
        matchQuery.createdAt = {};

        if (startDate) {
          matchQuery.createdAt.$gte = startDate;
        }

        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          matchQuery.createdAt.$lte = endOfDay;
        }
      }

      if (tag === 'notify') {
        switch (notificationType) {
          case 'notified':
            matchQuery.isCustomerNotified = true;
            break;
          case 'not-notified':
            matchQuery.isCustomerNotified = false;
            break;
          case 'untracked':
            matchQuery.isCustomerNotified = {
              $exists: false,
            };
            break;
        }
      }

      let questionIds;
      if (tag === 'closed') {
        questionIds = await this.QuestionCollection.find(matchQuery, {
          projection: {
            _id: 1,
          },
        })
          .skip((page - 1) * limit)
          .limit(limit)
          .map(x => x._id.toString())
          .toArray();
      } else if (tag === 'sla') {
        const result = await this.QuestionCollection.aggregate([
          {
            $match: matchQuery,
          },
          {
            $addFields: {
              _statusLower: {
                $toLower: {
                  $ifNull: ['$status', ''],
                },
              },
              _operationalCompletionAt: {
                $cond: [
                  {
                    $eq: [
                      {
                        $toLower: {
                          $ifNull: ['$status', ''],
                        },
                      },
                      'pass',
                    ],
                  },
                  '$passedAt',
                  '$closedAt',
                ],
              },
            },
          },
          {
            $match: {
              _statusLower: {
                $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
              },
              _operationalCompletionAt: {
                $ne: null,
              },
              $expr: {
                $and: [
                  {
                    $gte: ['$_operationalCompletionAt', '$createdAt'],
                  },
                  {
                    $lte: [
                      {
                        $subtract: ['$_operationalCompletionAt', '$createdAt'],
                      },
                      2 * 60 * 60 * 1000,
                    ],
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
          {
            $skip: (page - 1) * limit,
          },
          {
            $limit: limit,
          },
        ]).toArray();

        questionIds = result.map(x => x._id.toString());
      } else if (tag === 'slabreached') {
        matchQuery.status = {
          $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
        };

        const breachedQuestions = await this.QuestionCollection.aggregate([
          {
            $match: matchQuery,
          },
          {
            $addFields: {
              _statusLower: {
                $toLower: {
                  $ifNull: ['$status', ''],
                },
              },
              _operationalCompletionAt: {
                $cond: [
                  {
                    $eq: [
                      {
                        $toLower: {
                          $ifNull: ['$status', ''],
                        },
                      },
                      'pass',
                    ],
                  },
                  '$passedAt',
                  '$closedAt',
                ],
              },
            },
          },
          {
            $match: {
              _statusLower: {
                $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
              },
              _operationalCompletionAt: {
                $ne: null,
              },
              $expr: {
                $and: [
                  {
                    $gte: ['$_operationalCompletionAt', '$createdAt'],
                  },
                  {
                    $gt: [
                      {
                        $subtract: ['$_operationalCompletionAt', '$createdAt'],
                      },
                      2 * 60 * 60 * 1000,
                    ],
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
          {
            $skip: (page - 1) * limit,
          },
          {
            $limit: limit,
          },
        ]).toArray();

        questionIds = breachedQuestions.map(q => q._id.toString());
      } else if (tag === 'notify') {
        questionIds = await this.QuestionCollection.find(matchQuery, {
          projection: {
            _id: 1,
          },
        })
          .skip((page - 1) * limit)
          .limit(limit)
          .map(x => x._id.toString())
          .toArray();
      }
      const lifecycles = await this.getQuestionLifecycleForSummary(questionIds);

      const totalQuestions = questionIds.length;

      let totalLifecycleTime = 0;
      let resolvedQuestions = 0;
      let totalPushToReviewTime = 0;
      let totalInitialAllocationTime = 0;
      let totalPendingAssignmentTime = 0;
      let totalAwaitingModeratorTime = 0;
      let totalAwaitingClosureTime = 0;
      let totalAuthoringTime = 0;
      let authoringCount = 0;
      let totalR1Time = 0;
      let totalR2Time = 0;
      let totalR3Time = 0;
      let r1Count = 0;
      let r2Count = 0;
      let r3Count = 0;
      let totalModeratorTime = 0;
      let moderatorCount = 0;
      let totalReroutes = 0;
      let totalRerouteTime = 0;
      let totalReviewers = 0;
      let questionsWithReviewers = 0;
      let slaBreachedCount = 0;

      // const withinSlaQuestionIds: string[] = [];
      for (const lifecycleObj of lifecycles) {
        const lifecycle = lifecycleObj.timeline;
        const validEvents = lifecycle.filter(
          x => x.timestamp && new Date(x.timestamp).getTime() > 0,
        );
        const first = validEvents[0];
        const last = validEvents.at(-1);

        // =====================
        // Whole Lifecycle
        // =====================

        if (
          first &&
          ['closed', 'pass', 'duplicate'].includes(lifecycleObj.status)
        ) {
          let resolutionTime: Date | null = null;

          if (lifecycleObj.status === 'pass') {
            resolutionTime = lifecycleObj.passedAt;
          } else if (lifecycleObj.status === 'closed') {
            resolutionTime = lifecycleObj.closedAt;
          } else {
            // duplicate
            const duplicateEvent = lifecycleObj.timeline.find(
              (x: any) => x.action === 'Question Marked As Duplicate',
            );

            resolutionTime =
              duplicateEvent?.endTime || duplicateEvent?.timestamp || null;
          }

          if (!resolutionTime) continue;

          const lifecycleTime =
            new Date(resolutionTime).getTime() -
            new Date(first.timestamp).getTime();

          totalLifecycleTime += lifecycleTime;
          resolvedQuestions++;

          if (lifecycleTime > 2 * 60 * 60 * 1000) {
            slaBreachedCount++;
          }
        }

        // =====================
        // Buffer Times
        // =====================

        lifecycle
          .filter(x => x.eventType === 'system_wait')
          .forEach(x => {
            switch (x.action) {
              case 'Pushed To Review System':
                totalPushToReviewTime += x.duration || 0;
                break;
              case 'Initial Allocation Pending':
                totalInitialAllocationTime += x.duration || 0;
                break;
              case 'Pending Next Assignment':
                totalPendingAssignmentTime += x.duration || 0;
                break;

              case 'Awaiting Moderator Assignment':
                totalAwaitingModeratorTime += x.duration || 0;
                break;
              case 'Awaiting Closure/Pass':
                totalAwaitingClosureTime += x.duration || 0;
                break;
            }
          });

        // =====================
        // Authoring (R0)
        // =====================

        const authors = lifecycle.filter(x => x.eventType === 'author');

        if (authors.length) {
          authoringCount++;
          totalAuthoringTime += authors.reduce(
            (sum, x) => sum + (x.duration || 0),
            0,
          );
        }

        // =====================
        // Reviewers (R1/R2/R3)
        // =====================

        const reviewers = lifecycle.filter(x => x.eventType === 'reviewer');

        if (reviewers.length) {
          questionsWithReviewers++;
          totalReviewers += new Set(reviewers.map(x => x.user)).size;
        }
        if (reviewers[0]) {
          totalR1Time += reviewers[0].duration || 0;
          r1Count++;
        }
        if (reviewers[1]) {
          totalR2Time += reviewers[1].duration || 0;
          r2Count++;
        }
        if (reviewers[2]) {
          totalR3Time += reviewers[2].duration || 0;
          r3Count++;
        }

        // =====================
        // Moderator
        // =====================

        const moderators = lifecycle.filter(x => x.eventType === 'moderator');
        if (moderators.length) {
          moderatorCount++;
          totalModeratorTime += moderators.reduce(
            (sum, x) => sum + (x.duration || 0),
            0,
          );
        }

        // =====================
        // Reroutes
        // =====================

        const reroutes = lifecycle.filter(x => x.eventType === 'reroute');
        totalReroutes += reroutes.length;
        totalRerouteTime += reroutes.reduce(
          (sum, x) => sum + (x.duration || 0),
          0,
        );
      }
      // console.log("WITHIN SLA IDS:", withinSlaQuestionIds);

      return {
        totalQuestions,
        avgLifecycleTime: totalLifecycleTime / totalQuestions,
        // resolvedQuestions > 0 ? totalLifecycleTime / resolvedQuestions : 0,
        avgPushToReviewTime: totalPushToReviewTime / totalQuestions,
        avgInitialAllocationTime: totalInitialAllocationTime / totalQuestions,
        avgPendingAssignmentTime: totalPendingAssignmentTime / totalQuestions,
        avgAwaitingModeratorTime: totalAwaitingModeratorTime / totalQuestions,
        avgAwaitingClosureTime: totalAwaitingClosureTime / totalQuestions,
        avgAuthoringTime: totalAuthoringTime / totalQuestions,
        // authoringCount > 0 ? totalAuthoringTime / authoringCount : 0,
        avgR1Time: r1Count > 0 ? totalR1Time / totalQuestions : 0,
        avgR2Time: r2Count > 0 ? totalR2Time / totalQuestions : 0,
        avgR3Time: r3Count > 0 ? totalR3Time / totalQuestions : 0,
        avgModeratorTime: totalModeratorTime / totalQuestions,
        // moderatorCount > 0 ? totalModeratorTime / moderatorCount : 0,
        totalReroutes,
        avgReroutesPerQuestion:
          totalQuestions > 0 ? totalReroutes / totalQuestions : 0,
        avgRerouteTime:
          totalReroutes > 0 ? totalRerouteTime / totalReroutes : 0,
        avgReviewersPerQuestion:
          questionsWithReviewers > 0
            ? totalReviewers / questionsWithReviewers
            : 0,
        slaBreachedCount,
        resolutionRate:
          totalQuestions > 0 ? (resolvedQuestions / totalQuestions) * 100 : 0,
        page,
        limit,
      };
    } catch (err) {
      console.log('error in getlifecyclesummary:', err);
      throw Error(err);
    }
  }

  async getQuestionLifecycleForSummary(questionIds: string[]): Promise<any[]> {
    await this.initReviewSystem();
    await this.init('annam');

    const objectIds = questionIds.map(id => new ObjectId(id));

    // -------------------------
    // Bulk fetch
    // -------------------------

    const [questions, submissions, reroutes] = await Promise.all([
      this.QuestionCollection.find({
        _id: {$in: objectIds},
      }).toArray(),

      this.QuestionSubmissionsCollection.find({
        questionId: {$in: objectIds},
      }).toArray(),

      this.Reroutes.find({
        questionId: {$in: objectIds},
      }).toArray(),
    ]);

    // -------------------------
    // Maps
    // -------------------------

    const submissionMap = new Map(
      submissions.map(s => [s.questionId.toString(), s]),
    );

    const rerouteMap = new Map(reroutes.map(r => [r.questionId.toString(), r]));

    // -------------------------
    // Build lifecycles
    // -------------------------

    return questions.map(question => {
      const submission = submissionMap.get(question._id.toString());

      const rerouteDoc = rerouteMap.get(question._id.toString());

      const reviewTimeline = buildReviewTimeline(
        submission?.history || [],
        submission?.queue || [],
        question.createdAt,
        question.status,
        question.firstAllocationAt,
      );

      const timeline: any[] = [];

      // -------------------------
      // Duplicate questions
      // -------------------------

      if (question.status === 'duplicate') {
        return {
          questionId: question._id,
          createdAt: question.createdAt,
          closedAt: question.closedAt,
          passedAt: question.passedAt,
          status: question.status,
          timeline: [
            {
              timestamp: question.createdAt,
              user: '-',
              action: 'Duplicate Question',
              duration: null,
              remarks: 'Original question lifecycle is not available.',
              endTime: null,
              eventType: 'duplicate',
            },
            {
              timestamp: question.closedAt || question.updatedAt,
              user: 'Buffer Time',
              action: 'Question Marked As Duplicate',
              duration:
                question.updatedAt.getTime() - question.createdAt.getTime(),
              remarks: 'Closed as duplicate',
              endTime: question.closedAt || question.updatedAt,
              eventType: 'closure',
            },
          ],
        };
      }

      // -------------------------
      // Initial event
      // -------------------------

      timeline.push({
        timestamp: question.createdAt,
        user: '-',
        action:
          question.source === 'AGRI_EXPERT'
            ? 'Question Created Internally'
            : 'Question Asked',
        duration: null,
        remarks: '',
        endTime: question.createdAt,
        eventType: 'inception',
      });

      // -------------------------
      // Initial allocation wait
      // -------------------------

      if (
        question.firstAllocationAt &&
        new Date(question.firstAllocationAt).getTime() -
          question.createdAt.getTime() >
          1000
      ) {
        timeline.push({
          timestamp: question.createdAt,
          user: 'Buffer Time',
          action: 'Initial Allocation Pending',
          duration:
            new Date(question.firstAllocationAt).getTime() -
            question.createdAt.getTime(),
          remarks: '',
          endTime: question.firstAllocationAt,
          eventType: 'system_wait',
        });
      }

      // -------------------------
      // Reviews
      // -------------------------

      reviewTimeline.forEach((review, index) => {
        const historyItem = submission?.history?.[index];

        let action = 'Review';

        if (index === 0) {
          action = review.isCompleted ? 'Authored Answer' : 'Authoring Answer';
        } else if (historyItem?.modifiedAnswer) {
          action = 'Modified';
        } else if (historyItem?.status) {
          action =
            historyItem.status.charAt(0).toUpperCase() +
            historyItem.status.slice(1);
        }

        const isResolved = ['closed', 'pass', 'duplicate'].includes(
          question.status,
        );

        const duration = review.isCompleted
          ? review.timeTakenMs
          : isResolved
            ? 0
            : Date.now() - new Date(review.assignedAt).getTime();

        timeline.push({
          timestamp: review.assignedAt,
          user: '-',
          action,
          duration,
          remarks:
            historyItem?.reasonForRejection ||
            historyItem?.reasonForLastModification ||
            '',
          endTime: review.completedAt || review.assignedAt,
          eventType: index === 0 ? 'author' : 'reviewer',
        });
      });

      // -------------------------
      // Moderator
      // -------------------------

      const lastReview = reviewTimeline[reviewTimeline.length - 1];

      const finalReviewerCompletedAt =
        lastReview?.completedAt || lastReview?.assignedAt || question.createdAt;

      if (question.moderatorAssignedAt && question.moderatorId) {
        const moderatorAssignedAt = new Date(question.moderatorAssignedAt);

        if (
          moderatorAssignedAt.getTime() >
          new Date(finalReviewerCompletedAt).getTime()
        ) {
          timeline.push({
            timestamp: finalReviewerCompletedAt,
            user: 'Buffer Time',
            action: 'Awaiting Moderator Assignment',
            duration:
              moderatorAssignedAt.getTime() -
              new Date(finalReviewerCompletedAt).getTime(),
            remarks: '',
            endTime: moderatorAssignedAt,
            eventType: 'system_wait',
          });
        }

        const moderatorCompletedAt = question.closedAt || question.passedAt;

        const moderatorCompleted = moderatorCompletedAt
          ? new Date(moderatorCompletedAt)
          : null;

        timeline.push({
          timestamp: moderatorAssignedAt,
          user: '-',
          action: 'Approval Review',
          duration: moderatorCompleted
            ? moderatorCompleted.getTime() - moderatorAssignedAt.getTime()
            : 0,
          remarks: '',
          endTime: moderatorCompleted,
          eventType: 'moderator',
        });
      }

      // -------------------------
      // Reroutes
      // -------------------------

      rerouteDoc?.reroutes?.forEach((r: any) => {
        const isPending = r.status === 'pending';

        let action = 'Approval Review';

        if (r.status === 'modified') {
          action = 'Modified';
        }

        if (r.status === 'rejected') {
          action = 'Rejected';
        }

        timeline.push({
          timestamp: r.reroutedAt,
          user: '-',
          action,
          duration: isPending
            ? Date.now() - new Date(r.reroutedAt).getTime()
            : r.updatedAt.getTime() - r.reroutedAt.getTime(),
          remarks: r.comment || '',
          endTime: isPending ? new Date() : r.updatedAt,
          eventType: 'reroute',
        });
      });

      // -------------------------
      // Sort
      // -------------------------

      timeline.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // -------------------------
      // Insert gaps
      // -------------------------

      const finalTimeline: any[] = [];

      for (let i = 0; i < timeline.length; i++) {
        finalTimeline.push(timeline[i]);

        const current = timeline[i];

        const next = timeline[i + 1];

        if (!next || !current.endTime) {
          continue;
        }

        const gap =
          new Date(next.timestamp).getTime() -
          new Date(current.endTime).getTime();

        const nextIsExplicitWait =
          next.eventType === 'system_wait' &&
          [
            'Initial Allocation Pending',
            'Awaiting Moderator Assignment',
            'Awaiting Closure/Pass',
          ].includes(next.action);

        if (
          gap > 1000 &&
          current.eventType !== 'reroute' &&
          !nextIsExplicitWait
        ) {
          finalTimeline.push({
            timestamp: current.endTime,
            user: 'Buffer Time',
            action: 'Pending Next Assignment',
            duration: gap,
            remarks: '',
            endTime: next.timestamp,
            eventType: 'system_wait',
          });
        }
      }

      // -------------------------
      // Awaiting closure
      // -------------------------

      let completionTime = question.closedAt || question.passedAt;

      if (completionTime && finalTimeline.length) {
        if (!(completionTime instanceof Date)) {
          completionTime = new Date(completionTime);
        }

        if (!isNaN(completionTime.getTime())) {
          const last = finalTimeline.at(-1);

          const lastEnd = new Date(last.endTime || last.timestamp);

          if (!isNaN(lastEnd.getTime())) {
            const wait = completionTime.getTime() - lastEnd.getTime();

            if (wait > 1000) {
              finalTimeline.push({
                timestamp: lastEnd,
                user: 'Buffer Time',
                action: 'Awaiting Closure/Pass',
                duration: wait,
                remarks: '',
                endTime: completionTime,
                eventType: 'system_wait',
              });
            }
          }
        }
      }

      // -------------------------
      // Closed/Passed
      // -------------------------

      if (question.closedAt) {
        finalTimeline.push({
          timestamp: question.closedAt,
          user: '-',
          action: 'Question Closed',
          duration: null,
          remarks: '',
          endTime: question.closedAt,
          eventType: 'closure',
        });
      } else if (question.passedAt) {
        finalTimeline.push({
          timestamp: question.passedAt,
          user: '-',
          action: 'Question Passed',
          duration: null,
          remarks: '',
          endTime: question.passedAt,
          eventType: 'closure',
        });
      }

      return {
        questionId: question._id,
        createdAt: question.createdAt,
        closedAt: question.closedAt,
        passedAt: question.passedAt,
        status: question.status,
        timeline: finalTimeline,
      };
    });
  }

  async getFeedbackByLocation(
    source = 'annam',
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userType = 'all',
    rating?: string,
    state?: string,
    district?: string,
    search?: string,
    session?: ClientSession,
  ): Promise<PaginatedFeedbackMessages> {
    try {
      await this.init(source);

      const userTypeLookupStages = this.buildUserTypeLookupStages(userType);

      const matchStage: any = {
        feedback: {
          $exists: true,
          $ne: null,
        },
        'feedback.rating': {
          $exists: true,
        },
        isCreatedByUser: false,
        isDeleted: {
          $ne: true,
        },
      };

      if (
        rating &&
        rating !== 'all' &&
        (rating === 'thumbsUp' || rating === 'thumbsDown')
      ) {
        matchStage['feedback.rating'] = rating;
      }

      const pipeline: any[] = [
        {
          $match: matchStage,
        },
      ];
      if (userTypeLookupStages.length > 0) {
        pipeline.push(...userTypeLookupStages);
      } else {
        pipeline.push(
          {
            $addFields: {
              _userOid: {
                $cond: [
                  {
                    $and: [
                      {
                        $ne: ['$user', null],
                      },
                      {
                        $ne: ['$user', ''],
                      },
                    ],
                  },
                  {
                    $toObjectId: '$user',
                  },
                  null,
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: '_userOid',
              foreignField: '_id',
              as: '_userDoc',
            },
          },
        );
      }

      pipeline.push({
        $unwind: {
          path: '$_userDoc',
          preserveNullAndEmptyArrays: true,
        },
      });
      const locationMatch: any = {};

      if (state) {
        locationMatch['_userDoc.farmerProfile.state'] = {
          $regex: `^${state}$`,
          $options: 'i',
        };
      }

      if (district) {
        let normalizedDistrict = this.normalizeDistrictName(district);
        if (normalizedDistrict === 'ananthapuramu') {
          normalizedDistrict = 'anantapur';
        }
        locationMatch['_userDoc.farmerProfile.district'] = {
          $regex: `^${normalizedDistrict}$`,
          $options: 'i',
        };
      }

      if (Object.keys(locationMatch).length) {
        pipeline.push({
          $match: locationMatch,
        });
      }
      if (search) {
        const regex = new RegExp(search, 'i');

        pipeline.push({
          $match: {
            $or: [
              {
                question: {
                  $regex: regex,
                },
              },
              {
                response: {
                  $regex: regex,
                },
              },
              {
                'feedback.tag': {
                  $regex: regex,
                },
              },
              {
                'feedback.details': {
                  $regex: regex,
                },
              },
              {
                '_userDoc.farmerProfile.farmerName': {
                  $regex: regex,
                },
              },
            ],
          },
        });
      }
      const sortStage: any = {};

      sortStage[sortBy] = sortOrder === 'asc' ? 1 : -1;

      pipeline.push({
        $sort: sortStage,
      });

      const skip = (page - 1) * limit;

      pipeline.push({
        $facet: {
          metadata: [
            {
              $count: 'total',
            },
          ],

          data: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
            {
              $project: {
                _id: 1,

                conversationId: 1,

                userId: '$_userDoc._id',

                farmerName: '$_userDoc.farmerProfile.farmerName',

                email: '$_userDoc.email',

                village: '$_userDoc.farmerProfile.villageName',

                block: '$_userDoc.farmerProfile.blockName',

                district: '$_userDoc.farmerProfile.district',

                state: '$_userDoc.farmerProfile.state',

                question: 1,

                response: 1,

                feedback: 1,

                createdAt: 1,
              },
            },
          ],
        },
      });
      const result = await this.messagesCollection
        .aggregate(pipeline, {
          session,
        })
        .toArray();
      const totalFeedbacks = result[0]?.metadata[0]?.total ?? 0;

      const messages = result[0]?.data ?? [];

      return {
        messages,

        totalFeedbacks,

        totalPages: Math.ceil(totalFeedbacks / limit),

        currentPage: page,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get feedback by location: ${error}`,
      );
    }
  }
async getClosedInLastTwoHoursByLocation(
  source?: string,
  userType?: string,
  state?: string,
  district?: string,
): Promise<any> {
  try {
    await this.initReviewSystem();

    const matchStage = buildBaseQuestionMatch(source);

    const query = await this.buildQuestionUserTypeMatchQuery(
      source,
      userType,
    );

    if (query && Object.keys(query).length > 0) {
      matchStage.$and.push(query);
    }

    if (source === 'both') {
      matchStage.source = {
        $in: ['WHATSAPP', 'AJRASAKHA'],
      };
    }

    matchStage.status = {
      $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
    };

    if (state) {
      matchStage['details.state'] = {
        $regex: `^${state}$`,
        $options: 'i',
      };
    }

    if (district) {
      matchStage['details.district'] = {
        $regex: `^${district}$`,
        $options: 'i',
      };
    }

    const [totalCountResult, lastTwoHoursResult] = await Promise.all([
      this.QuestionCollection.aggregate([
        {
          $match: matchStage,
        },
        {
          $addFields: {
            _statusLower: {
              $toLower: {
                $ifNull: ['$status', ''],
              },
            },
          },
        },
        {
          $group: {
            _id: null,

            closedCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$_statusLower', 'closed'],
                  },
                  1,
                  0,
                ],
              },
            },

            passCount: {
              $sum: {
                $cond: [
                  {
                    $in: ['$_statusLower', ['pass', 'dynamic_closed', 'duplicate_closed']],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]).toArray(),

      this.QuestionCollection.aggregate([
        {
          $match: matchStage,
        },
        {
          $addFields: {
            _statusLower: {
              $toLower: {
                $ifNull: ['$status', ''],
              },
            },

            _operationalCompletionAt: {
              $cond: [
                {
                  $eq: [
                    {
                      $toLower: {
                        $ifNull: ['$status', ''],
                      },
                    },
                    'pass',
                  ],
                },
                '$passedAt',
                '$closedAt',
              ],
            },

            _effectiveCreatedAt: {
              $let: {
                vars: {
                  istHour: {
                    $hour: {
                      date: '$createdAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },

                  istDateTrunc: {
                    $dateTrunc: {
                      date: '$createdAt',
                      unit: 'day',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                },

                in: {
                  $cond: {
                    if: {
                      $gte: ['$$istHour', 22],
                    },

                    then: {
                      $dateAdd: {
                        startDate: '$$istDateTrunc',
                        unit: 'hour',
                        amount: 30,
                      },
                    },

                    else: {
                      $cond: {
                        if: {
                          $lt: ['$$istHour', 6],
                        },

                        then: {
                          $dateAdd: {
                            startDate: '$$istDateTrunc',
                            unit: 'hour',
                            amount: 6,
                          },
                        },

                        else: '$createdAt',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        {
          $match: {
            _statusLower: {
              $in: ['closed', 'pass', 'dynamic_closed', 'duplicate_closed'],
            },

            _operationalCompletionAt: {
              $ne: null,
            },

            $expr: {
              $and: [
                {
                  $gte: [
                    '$_operationalCompletionAt',
                    '$createdAt',
                  ],
                },
                {
                  $lte: [
                    {
                      $max: [
                        0,
                        {
                          $subtract: [
                            '$_operationalCompletionAt',
                            '$_effectiveCreatedAt',
                          ],
                        },
                      ],
                    },
                    2 * 60 * 60 * 1000,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,

            closedCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$_statusLower', 'closed'],
                  },
                  1,
                  0,
                ],
              },
            },

            passCount: {
              $sum: {
                $cond: [
                  {
                    $in: ['$_statusLower', ['pass', 'dynamic_closed', 'duplicate_closed']],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]).toArray(),
    ]);

    return {
      totalClosedCount: totalCountResult[0]?.closedCount ?? 0,
      totalPassCount: totalCountResult[0]?.passCount ?? 0,

      closedInTwoHoursCount:
        lastTwoHoursResult[0]?.closedCount ?? 0,

      passInTwoHoursCount:
        lastTwoHoursResult[0]?.passCount ?? 0,
    };
  } catch (error) {
    throw new InternalServerError(
      `Failed to get closed questions by location: ${error}`,
    );
  }
}

}

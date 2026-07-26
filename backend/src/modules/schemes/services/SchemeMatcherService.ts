import { env } from '#root/utils/env.js';
import { MongoClient, ObjectId } from 'mongodb';

const MYSCHEME_SEARCH_URL = 'https://api.myscheme.gov.in/search/v6/schemes';
const MYSCHEME_DETAIL_URL = 'https://api.myscheme.gov.in/schemes/v6/public/schemes';
const MYSCHEME_API_KEY = env('MYSCHEME_API_KEY') || '';
const CATEGORY_FILTER = 'Agriculture,Rural & Environment';

const HEADERS = {
  'x-api-key': MYSCHEME_API_KEY,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Origin': 'https://www.myscheme.gov.in',
  'Referer': 'https://www.myscheme.gov.in/',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

export interface FarmerProfile {
  _id?: string | ObjectId;
  phoneNo?: string;
  farmerName?: string;
  age?: number;
  gender?: string;
  state?: string;
  district?: string;
  blockName?: string;
  villageName?: string;
  highestEducatedPerson?: string;
  cropsCultivated?: string[];
  primaryCrop?: string;
}

export interface SchemeMatch {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  eligibilityMet: string[];
  eligibilityPending: string[];
  confidence: number;
}

export interface FarmerSchemeResult {
  farmerId: string;
  farmerName: string;
  state: string;
  district: string;
  schemes: SchemeMatch[];
  matchedAt: Date;
}

function buildAgeBucket(age: number): { min: number; max: number } {
  const bucketStart = Math.floor((age - 1) / 10) * 10 + 1;
  return { min: bucketStart, max: bucketStart + 9 };
}

function buildSearchFilters(profile: FarmerProfile): any[] {
  const filters: any[] = [
    { identifier: 'schemeCategory', value: CATEGORY_FILTER },
  ];

  if (profile.state) {
    filters.push({ identifier: 'schemeState', value: profile.state });
  }

  if (profile.age) {
    const bucket = buildAgeBucket(profile.age);
    filters.push({ identifier: 'age-general', min: bucket.min, max: bucket.max });
  }

  if (profile.gender) {
    const genderMap: Record<string, string> = {
      'male': 'Male', 'female': 'Female', 'other': 'Other',
      'm': 'Male', 'f': 'Female',
    };
    const mapped = genderMap[profile.gender.toLowerCase()];
    if (mapped) filters.push({ identifier: 'gender', value: mapped });
  }

  return filters;
}

function buildSpecificFilters(profile: FarmerProfile): any[] | null {
  const filters = buildSearchFilters(profile);
  let hasSpecific = false;

  if (profile.gender) {
    const genderMap: Record<string, string> = {
      'male': 'Male', 'female': 'Female', 'other': 'Other',
      'm': 'Male', 'f': 'Female',
    };
    const mapped = genderMap[profile.gender.toLowerCase()];
    if (mapped) {
      filters.push({ identifier: 'gender', value: mapped });
      hasSpecific = true;
    }
  }

  return hasSpecific ? filters : null;
}

async function searchSchemes(filters: any[]): Promise<any[]> {
  if (!MYSCHEME_API_KEY) {
    console.error('[SchemeMatcher] MYSCHEME_API_KEY not configured');
    return [];
  }

  try {
    const params = new URLSearchParams({
      lang: 'en',
      q: JSON.stringify(filters),
      from: '0',
      size: '10',
    });

    const res = await fetch(`${MYSCHEME_SEARCH_URL}?${params}`, {
      headers: HEADERS as Record<string, string>,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.hits || data?.data || [];
  } catch {
    return [];
  }
}

async function getSchemeDetail(slug: string): Promise<any> {
  if (!MYSCHEME_API_KEY) return null;

  try {
    const res = await fetch(
      `${MYSCHEME_DETAIL_URL}?slug=${encodeURIComponent(slug)}&lang=en`,
      {
        headers: HEADERS as Record<string, string>,
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data || null;
  } catch {
    return null;
  }
}

function parseSchemesFromSearch(hits: any[]): SchemeMatch[] {
  return hits.map((hit: any) => {
    const source = hit._source || hit;
    return {
      slug: source.slug || hit.slug || '',
      name: source.schemeName || source.name || 'Unknown Scheme',
      description: source.shortDescription || source.description || '',
      tags: source.tags || [],
      eligibilityMet: [],
      eligibilityPending: [],
      confidence: 0.5,
    };
  });
}

function scoreScheme(scheme: SchemeMatch, profile: FarmerProfile): SchemeMatch {
  let score = 0.5;
  const met: string[] = [];
  const pending: string[] = [];

  if (profile.state) {
    const stateTag = scheme.tags.find((t) =>
      t.toLowerCase().includes(profile.state!.toLowerCase()),
    );
    if (stateTag) {
      score += 0.15;
      met.push(`State: ${profile.state}`);
    } else {
      pending.push(`State: ${profile.state} (may apply nationwide)`);
    }
  }

  if (profile.age) {
    const ageTag = scheme.tags.find((t) => t.toLowerCase().includes('age'));
    if (ageTag) {
      score += 0.1;
      met.push(`Age: ${profile.age}`);
    }
  }

  if (profile.gender) {
    const genderTag = scheme.tags.find((t) =>
      t.toLowerCase().includes(profile.gender!.toLowerCase()),
    );
    if (genderTag) {
      score += 0.1;
      met.push(`Gender: ${profile.gender}`);
    }
  }

  if (profile.cropsCultivated && profile.cropsCultivated.length > 0) {
    const agriTag = scheme.tags.find((t) =>
      t.toLowerCase().includes('farmer') || t.toLowerCase().includes('agriculture'),
    );
    if (agriTag) {
      score += 0.1;
      met.push('Farmer/Agriculture scheme');
    }
  }

  scheme.eligibilityMet = met;
  scheme.eligibilityPending = pending;
  scheme.confidence = Math.min(score, 1.0);
  return scheme;
}

export class SchemeMatcherService {
  private mongoClient: MongoClient | null = null;

  private async getClient(): Promise<MongoClient> {
    if (!this.mongoClient) {
      const uri = env('MONGODB_URI') || env('MONGODB_URL') || '';
      this.mongoClient = new MongoClient(uri);
      await this.mongoClient.connect();
    }
    return this.mongoClient;
  }

  private getAnnamDb(client: MongoClient) {
    const dbName = env('ANNAM_DB_NAME') || env('ANNAM_DATABASE_NAME') || 'annam';
    return client.db(dbName);
  }

  private getMainDb(client: MongoClient) {
    const dbName = env('DB_NAME') || env('MONGODB_DB_NAME') || 'ajrasakha';
    return client.db(dbName);
  }

  async matchFarmer(profile: FarmerProfile): Promise<SchemeMatch[]> {
    const baseFilters = buildSearchFilters(profile);
    const specificFilters = buildSpecificFilters(profile);

    const searchPromises = [searchSchemes(baseFilters)];
    if (specificFilters) {
      searchPromises.push(searchSchemes(specificFilters));
    }

    const results = await Promise.all(searchPromises);
    const allHits = results.flat();

    const seen = new Set<string>();
    const uniqueHits = allHits.filter((hit: any) => {
      const slug = hit._source?.slug || hit.slug || '';
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });

    let schemes = parseSchemesFromSearch(uniqueHits);
    schemes = schemes.map((s) => scoreScheme(s, profile));
    schemes.sort((a, b) => b.confidence - a.confidence);

    return schemes.slice(0, 10);
  }

  async matchAllFarmers(
    batchSize = 50,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<FarmerSchemeResult[]> {
    const client = await this.getClient();
    const annamDb = this.getAnnamDb(client);
    const mainDb = this.getMainDb(client);
    const users = annamDb.collection('users');
    const matchResults = mainDb.collection('scheme_matches');

    const query = {
      'farmerProfile.phoneNo': { $exists: true, $ne: null, $ne: '' },
      'farmerProfile.state': { $exists: true, $ne: null, $ne: '' },
    };

    const totalCount = await users.countDocuments(query);
    console.log(`[SchemeMatcher] Matching ${totalCount} farmers...`);

    const results: FarmerSchemeResult[] = [];
    let processed = 0;

    const cursor = users.find(query).batchSize(batchSize);

    for await (const user of cursor) {
      const profile = user as any;
      const fp = profile.farmerProfile;

      const farmerProfile: FarmerProfile = {
        _id: profile._id?.toString(),
        phoneNo: fp?.phoneNo,
        farmerName: fp?.farmerName,
        age: fp?.age,
        gender: fp?.gender,
        state: fp?.state,
        district: fp?.district,
        blockName: fp?.blockName,
        villageName: fp?.villageName,
        cropsCultivated: fp?.cropsCultivated,
        primaryCrop: fp?.primaryCrop,
      };

      try {
        const schemes = await this.matchFarmer(farmerProfile);

        if (schemes.length > 0) {
          const result: FarmerSchemeResult = {
            farmerId: profile._id?.toString() || '',
            farmerName: fp?.farmerName || 'Unknown',
            state: fp?.state || '',
            district: fp?.district || '',
            schemes,
            matchedAt: new Date(),
          };

          results.push(result);

          await matchResults.updateOne(
            { farmerId: result.farmerId },
            { $set: result },
            { upsert: true },
          );
        }
      } catch (err) {
        console.error(`[SchemeMatcher] Error matching farmer ${profile._id}:`, err);
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`[SchemeMatcher] Processed ${processed}/${totalCount}`);
        onProgress?.(processed, totalCount);
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[SchemeMatcher] Complete. ${results.length} farmers have matching schemes.`);
    return results;
  }

  async getFarmerMatches(farmerId: string): Promise<FarmerSchemeResult | null> {
    const client = await this.getClient();
    const mainDb = this.getMainDb(client);
    const matchResults = mainDb.collection<FarmerSchemeResult>('scheme_matches');
    return matchResults.findOne({ farmerId });
  }

  async getRecentResults(limit = 50): Promise<FarmerSchemeResult[]> {
    const client = await this.getClient();
    const mainDb = this.getMainDb(client);
    const matchResults = mainDb.collection<FarmerSchemeResult>('scheme_matches');
    return matchResults.find({}).sort({ matchedAt: -1 }).limit(limit).toArray();
  }

  async getStats(): Promise<{
    totalFarmersMatched: number;
    totalSchemesFound: number;
    stateDistribution: Record<string, number>;
  }> {
    const client = await this.getClient();
    const mainDb = this.getMainDb(client);
    const matchResults = mainDb.collection<FarmerSchemeResult>('scheme_matches');

    const totalFarmersMatched = await matchResults.countDocuments();

    const pipeline = [
      { $unwind: '$schemes' },
      { $group: { _id: '$state', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    const stateAgg = await matchResults.aggregate(pipeline).toArray();
    const stateDistribution: Record<string, number> = {};
    let totalSchemesFound = 0;

    for (const entry of stateAgg) {
      stateDistribution[entry._id] = entry.count;
      totalSchemesFound += entry.count;
    }

    return { totalFarmersMatched, totalSchemesFound, stateDistribution };
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
  }
}

import axios from 'axios';
import FormData from 'form-data';
import {InternalServerError} from 'routing-controllers';
import {aiConfig} from '#root/config/ai.js';

export interface PlantNetSpeciesResult {
  score: number;
  scientificName: string;
  commonNames: string[];
  genus: string | null;
  family: string | null;
}

export interface PlantNetIdentificationResult {
  identified: boolean;
  bestMatch: PlantNetSpeciesResult | null;
  candidates: PlantNetSpeciesResult[];
  predictedOrgan: string | null;
  remainingRequests: number | null;
}

export interface PlantNetDiseaseResult {
  code: string;
  name: string;
  score: number;
  description: string | null;
}

export interface PlantNetDiseaseIdentificationResult {
  diseases: PlantNetDiseaseResult[];
  remainingRequests: number | null;
  version: string | null;
}

interface PlantNetApiSpecies {
  scientificNameWithoutAuthor?: unknown;
  scientificName?: unknown;
  commonNames?: unknown;
  genus?: {
    scientificNameWithoutAuthor?: unknown;
    scientificName?: unknown;
  };
  family?: {
    scientificNameWithoutAuthor?: unknown;
    scientificName?: unknown;
  };
}

interface PlantNetApiResult {
  score?: unknown;
  species?: PlantNetApiSpecies;
}

interface PlantNetApiResponse {
  bestMatch?: unknown;
  results?: unknown;
  predictedOrgans?: unknown;
  remainingIdentificationRequests?: unknown;
  version?: unknown;
}

interface PlantNetDiseaseApiResult {
  name?: unknown;
  score?: unknown;
  description?: unknown;
}

interface PlantNetDiseaseApiResponse {
  results?: unknown;
  remainingIdentificationRequests?: unknown;
  version?: unknown;
}

type PlantOrgan = 'leaf' | 'flower' | 'fruit' | 'bark';

const VALID_ORGANS = new Set<PlantOrgan>([
  'leaf',
  'flower',
  'fruit',
  'bark',
]);

export class PlantNetService {
  async identify(
    file: Express.Multer.File,
  ): Promise<PlantNetIdentificationResult> {
    this.validateImage(file);

    if (aiConfig.plantNetMock) {
      return {
        identified: true,
        bestMatch: {
          score: 0.96648,
          scientificName: 'Solanum tuberosum L.',
          commonNames: ['Potato', 'Irish potato', 'White Potato'],
          genus: 'Solanum',
          family: 'Solanaceae',
        },
        candidates: [
          {
            score: 0.96648,
            scientificName: 'Solanum tuberosum L.',
            commonNames: ['Potato', 'Irish potato', 'White Potato'],
            genus: 'Solanum',
            family: 'Solanaceae',
          },
          {
            score: 0.00709,
            scientificName: 'Solanum lycopersicum L.',
            commonNames: ['Tomato'],
            genus: 'Solanum',
            family: 'Solanaceae',
          },
        ],
        predictedOrgan: 'leaf',
        remainingRequests: null,
      };
    }

    const relayBaseUrl = this.getRelayBaseUrl();

    const form = new FormData();

    form.append('images', file.buffer, {
      filename: file.originalname || 'plant.jpg',
      contentType: file.mimetype,
    });

    try {
      const response = await axios.post<PlantNetApiResponse>(
        `${relayBaseUrl}/identify`,
        form,
        {
          timeout: 30_000,
          headers: form.getHeaders(),
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        },
      );

      return this.normalizeIdentificationResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new InternalServerError(
          `PlantNet identification request failed${
            error.response?.status
              ? ` with status ${error.response.status}`
              : ''
          }.`,
        );
      }

      throw new InternalServerError(
        'PlantNet identification failed.',
      );
    }
  }

  async identifyDiseases(
    file: Express.Multer.File,
    organ?: string | null,
  ): Promise<PlantNetDiseaseIdentificationResult> {
    this.validateImage(file);

    if (aiConfig.plantNetMock) {
      return {
        diseases: [
          {
            code: 'PHYTIN',
            name: 'Phytophthora infestans',
            score: 0.8124,
            description:
              'Probable late blight associated with Phytophthora infestans.',
          },
          {
            code: 'ALTESO',
            name: 'Alternaria solani',
            score: 0.0941,
            description:
              'Probable early blight associated with Alternaria solani.',
          },
        ],
        remainingRequests: null,
        version: 'mock',
      };
    }

    const relayBaseUrl = this.getRelayBaseUrl();

    const form = new FormData();

    form.append('images', file.buffer, {
      filename: file.originalname || 'plant.jpg',
      contentType: file.mimetype,
    });

    const normalizedOrgan: PlantOrgan | 'auto' =
      this.normalizeOrgan(organ);

    form.append('organ', normalizedOrgan);

    try {
      const response =
        await axios.post<PlantNetDiseaseApiResponse>(
          `${relayBaseUrl}/diseases`,
          form,
          {
            timeout: 30_000,
            headers: form.getHeaders(),
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024,
          },
        );

      return this.normalizeDiseaseResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new InternalServerError(
          `PlantNet disease identification request failed${
            error.response?.status
              ? ` with status ${error.response.status}`
              : ''
          }.`,
        );
      }

      throw new InternalServerError(
        'PlantNet disease identification failed.',
      );
    }
  }

  private getRelayBaseUrl(): string {
    const relayBaseUrl =
      aiConfig.plantNetRelayBaseUrl?.trim().replace(/\/+$/, '');

    if (!relayBaseUrl) {
      throw new InternalServerError(
        'Plant scan is not configured: PLANTNET_RELAY_BASE_URL is missing.',
      );
    }

    return relayBaseUrl;
  }

  private validateImage(file: Express.Multer.File): void {
    if (!file?.buffer) {
      throw new InternalServerError(
        'Plant image is unavailable for PlantNet identification.',
      );
    }

    if (
      file.mimetype !== 'image/jpeg' &&
      file.mimetype !== 'image/png'
    ) {
      throw new InternalServerError(
        'PlantNet requires a JPEG or PNG image.',
      );
    }
  }

  private normalizeIdentificationResponse(
    response: PlantNetApiResponse,
  ): PlantNetIdentificationResult {
    const rawResults = Array.isArray(response.results)
      ? response.results
      : [];

    const candidates: PlantNetSpeciesResult[] = [];

    for (const rawResult of rawResults) {
      if (!rawResult || typeof rawResult !== 'object') {
        continue;
      }

      const result = rawResult as PlantNetApiResult;
      const species = result.species;

      if (!species || typeof species !== 'object') {
        continue;
      }

      const score =
        typeof result.score === 'number' &&
        Number.isFinite(result.score)
          ? result.score
          : null;

      const scientificName =
        typeof species.scientificNameWithoutAuthor === 'string'
          ? species.scientificNameWithoutAuthor
          : typeof species.scientificName === 'string'
            ? species.scientificName
            : null;

      if (score === null || !scientificName) {
        continue;
      }

      const commonNames = Array.isArray(species.commonNames)
        ? species.commonNames.filter(
            (name): name is string => typeof name === 'string',
          )
        : [];

      const genus =
        typeof species.genus?.scientificNameWithoutAuthor ===
        'string'
          ? species.genus.scientificNameWithoutAuthor
          : typeof species.genus?.scientificName === 'string'
            ? species.genus.scientificName
            : null;

      const family =
        typeof species.family?.scientificNameWithoutAuthor ===
        'string'
          ? species.family.scientificNameWithoutAuthor
          : typeof species.family?.scientificName === 'string'
            ? species.family.scientificName
            : null;

      candidates.push({
        score,
        scientificName,
        commonNames,
        genus,
        family,
      });
    }

    const bestMatch =
      candidates.length > 0 ? candidates[0] : null;

    const predictedOrgan =
      this.extractPredictedOrgan(response.predictedOrgans);

    const remainingRequests =
      typeof response.remainingIdentificationRequests ===
        'number' &&
      Number.isFinite(response.remainingIdentificationRequests)
        ? response.remainingIdentificationRequests
        : null;

    return {
      identified: bestMatch !== null,
      bestMatch,
      candidates,
      predictedOrgan,
      remainingRequests,
    };
  }

  private normalizeDiseaseResponse(
    response: PlantNetDiseaseApiResponse,
  ): PlantNetDiseaseIdentificationResult {
    const rawResults = Array.isArray(response.results)
      ? response.results
      : [];

    const diseases: PlantNetDiseaseResult[] = [];

    for (const rawResult of rawResults) {
      if (!rawResult || typeof rawResult !== 'object') {
        continue;
      }

      const result = rawResult as PlantNetDiseaseApiResult;

      const code =
        typeof result.name === 'string'
          ? result.name.trim()
          : '';

      const score =
        typeof result.score === 'number' &&
        Number.isFinite(result.score)
          ? result.score
          : null;

      if (!code || score === null) {
        continue;
      }

      const description =
        typeof result.description === 'string'
          ? result.description.trim() || null
          : null;

      diseases.push({
        code,
        name: description || code,
        score,
        description,
      });
    }

    const remainingRequests =
      typeof response.remainingIdentificationRequests ===
        'number' &&
      Number.isFinite(response.remainingIdentificationRequests)
        ? response.remainingIdentificationRequests
        : null;

    const version =
      typeof response.version === 'string'
        ? response.version
        : null;

    return {
      diseases,
      remainingRequests,
      version,
    };
  }

  private extractPredictedOrgan(
    predictedOrgans: unknown,
  ): string | null {
    if (!Array.isArray(predictedOrgans)) {
      return null;
    }

    const first = predictedOrgans[0];

    if (typeof first === 'string') {
      return first;
    }

    if (
      first &&
      typeof first === 'object' &&
      'organ' in first &&
      typeof first.organ === 'string'
    ) {
      return first.organ;
    }

    return null;
  }

  private normalizeOrgan(
    organ?: string | null,
  ): PlantOrgan | 'auto' {
    if (
      organ &&
      VALID_ORGANS.has(organ as PlantOrgan)
    ) {
      return organ as PlantOrgan;
    }

    return 'auto';
  }
}
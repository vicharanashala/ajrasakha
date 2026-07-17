import 'reflect-metadata';
import axios from 'axios';
import {injectable} from 'inversify';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
} from '../interfaces/ILocationService.js';

@injectable()
export class LocationService implements ILocationService {
  public async getStates(): Promise<ILocationState[]> {
    const records = await this.fetchStates();

    return records.map((record: any) => ({
      stateCode: record.state_code,
      stateNameEnglish: record.state_name_english,
    }));
  }

  public async getDistricts(stateCode: number): Promise<ILocationDistrict[]> {
    if (!stateCode) {
      throw new BadRequestError('stateCode is required');
    }

    const records = await this.fetchDistricts({ state_code: stateCode });

    return records.map((record: any) => ({
      districtCode: record.district_code,
      districtNameEnglish: record.district_name_english,
      stateCode: record.state_code,
    }));
  }

  public async getBlocks(districtCode: number): Promise<ILocationBlock[]> {
    if (!districtCode) {
      throw new BadRequestError('districtCode is required');
    }

    const records = await this.fetchSubDistricts({ district_code: districtCode });

    return records.map((record: any) => ({
      blockCode: record.subdistrict_code,
      blockNameEnglish: record.subdistrict_name_english,
      districtCode: record.district_code,
    }));
  }

  public async getVillages(blockCode: number): Promise<ILocationVillage[]> {
    if (!blockCode) {
      throw new BadRequestError('blockCode is required');
    }

    const records = await this.fetchVillages({ subdistrictCode: blockCode });

    return records.map((record: any) => ({
      villageCode: record.villageCode,
      villageNameEnglish: record.villageNameEnglish,
      blockCode: blockCode,
      pincode: record.pincode,
    }));
  }

  private async fetchStates(): Promise<any[]> {
    const apiUrl = process.env.LGD_STATES_API_URL;
    if (!apiUrl) {
      console.warn('LGD_STATES_API_URL not configured, returning empty states');
      return [];
    }
    return this.makeLGDRequest(apiUrl);
  }

  private async fetchDistricts(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_DISTRICTS_API_URL;
    if (!apiUrl) {
      console.warn('LGD_DISTRICTS_API_URL not configured, returning empty districts');
      return [];
    }
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async fetchSubDistricts(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_SUBDISTRICTS_API_URL;
    if (!apiUrl) {
      console.warn('LGD_SUBDISTRICTS_API_URL not configured, returning empty blocks');
      return [];
    }
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async fetchVillages(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_VILLAGES_API_URL;
    if (!apiUrl) {
      console.warn('LGD_VILLAGES_API_URL not configured, returning empty villages');
      return [];
    }
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async makeLGDRequest(apiUrl: string, filters?: Record<string, string | number>): Promise<any[]> {
    const apiKey = process.env.LGD_API_KEY;

    if (!apiKey) {
      console.warn('LGD_API_KEY not configured, returning empty results');
      return [];
    }

    const params: Record<string, string | number> = {
      'api-key': apiKey,
      format: 'json',
      limit: 10000,
      offset: 0,
    };

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        params[`filters[${key}]`] = value;
      }
    }

    try {
      const response = await axios.get(apiUrl, {
        params,
        timeout: 30000,
      });

      if (!response?.data?.records) {
        throw new InternalServerError('Invalid LGD API response: records missing');
      }

      return response.data.records;
    } catch (error: any) {
      if (error instanceof InternalServerError) {
        throw error;
      }

      const message =
        error?.response?.data?.message || error?.message || 'Failed to fetch LGD locations';

      throw new InternalServerError(`LGD service error: ${message}`);
    }
  }
}

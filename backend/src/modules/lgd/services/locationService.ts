import 'reflect-metadata';
import axios from 'axios';
import {injectable} from 'inversify';
import {BadRequestError, InternalServerError, NotFoundError} from 'routing-controllers';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
  IKvk,
  IKvkSyncResult,
} from '../interfaces/ILocationService.js';
import { appConfig } from '#root/config/app.js';

@injectable()
export class LocationService implements ILocationService {

  public async getCoordinatesByLocationName(locationName: string): Promise<{ lat: number; lon: number; name: string } | null> {
    const apiKey = appConfig.OPENWEATHER_API_KEY;
    if (!apiKey) {
      console.error('OpenWeatherMap API key is not configured. Geocoding will not work.');
      throw new InternalServerError('Geocoding service is not configured.');
    }

    try {
      const response = await axios.get('http://api.openweathermap.org/geo/1.0/direct', {
        params: {
          q: `${locationName},IN`, // Append ,IN to prioritize Indian locations
          limit: 1,
          appid: apiKey,
        },
      });

      if (!response.data || response.data.length === 0) {
        throw new NotFoundError(`Could not find coordinates for location: ${locationName}`);
      }

      const location = response.data[0];
      return {
        lat: location.lat,
        lon: location.lon,
        name: location.name,
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      console.error(`Geocoding error for "${locationName}":`, error);
      throw new InternalServerError('Failed to fetch coordinates from Geocoding service.');
    }
  }

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

  public async getKvks(districtCode: number): Promise<IKvk[]> {
    // Implement this method
    return [];
  }

  public async syncKvks(): Promise<IKvkSyncResult> {
    // Implement this method
    return { success: true, message: 'Sync complete' };
  }

  private async fetchStates(): Promise<any[]> {
    const apiUrl = process.env.LGD_STATES_API_URL;
    if (!apiUrl) throw new InternalServerError('LGD_STATES_API_URL is not configured');
    return this.makeLGDRequest(apiUrl);
  }

  private async fetchDistricts(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_DISTRICTS_API_URL;
    if (!apiUrl) throw new InternalServerError('LGD_DISTRICTS_API_URL is not configured');
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async fetchSubDistricts(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_SUBDISTRICTS_API_URL;
    if (!apiUrl) throw new InternalServerError('LGD_SUBDISTRICTS_API_URL is not configured');
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async fetchVillages(filters?: Record<string, string | number>): Promise<any[]> {
    const apiUrl = process.env.LGD_VILLAGES_API_URL;
    if (!apiUrl) throw new InternalServerError('LGD_VILLAGES_API_URL is not configured');
    return this.makeLGDRequest(apiUrl, filters);
  }

  private async makeLGDRequest(apiUrl: string, filters?: Record<string, string | number>): Promise<any[]> {
    const apiKey = process.env.LGD_API_KEY;

    if (!apiKey) {
      throw new InternalServerError('LGD_API_KEY is not configured');
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

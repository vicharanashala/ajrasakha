import 'reflect-metadata';
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import axios from 'axios';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {LocationService} from '../services/locationService.js';

vi.mock('axios');

describe('LocationService', () => {
  let service: LocationService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new LocationService();

    process.env.LGD_API_KEY = 'test-api-key';
    process.env.LGD_STATES_API_URL = 'https://states.test';
    process.env.LGD_DISTRICTS_API_URL = 'https://districts.test';
    process.env.LGD_SUBDISTRICTS_API_URL = 'https://blocks.test';
    process.env.LGD_VILLAGES_API_URL = 'https://villages.test';
  });

  afterEach(() => {
    delete process.env.LGD_API_KEY;
    delete process.env.LGD_STATES_API_URL;
    delete process.env.LGD_DISTRICTS_API_URL;
    delete process.env.LGD_SUBDISTRICTS_API_URL;
    delete process.env.LGD_VILLAGES_API_URL;
  });

  describe('getStates', () => {
    it('returns mapped states', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          records: [
            {
              state_code: 1,
              state_name_english: 'Punjab',
            },
          ],
        },
      } as any);

      const result = await service.getStates();

      expect(result).toEqual([
        {
          stateCode: 1,
          stateNameEnglish: 'Punjab',
        },
      ]);
    });

    it('throws when states url is missing', async () => {
      delete process.env.LGD_STATES_API_URL;

      await expect(service.getStates()).rejects.toThrow(InternalServerError);
    });
  });

  describe('getDistricts', () => {
    it('returns mapped districts', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          records: [
            {
              district_code: 101,
              district_name_english: 'Ludhiana',
              state_code: 3,
            },
          ],
        },
      } as any);

      const result = await service.getDistricts(3);

      expect(result).toEqual([
        {
          districtCode: 101,
          districtNameEnglish: 'Ludhiana',
          stateCode: 3,
        },
      ]);
    });

    it('passes state filter', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {records: []},
      } as any);

      await service.getDistricts(5);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            'filters[state_code]': 5,
          }),
        }),
      );
    });

    it('throws when stateCode missing', async () => {
      await expect(service.getDistricts(0)).rejects.toThrow(BadRequestError);
    });
  });

  describe('getBlocks', () => {
    it('returns mapped blocks', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          records: [
            {
              subdistrict_code: 201,
              subdistrict_name_english: 'Block A',
              district_code: 12,
            },
          ],
        },
      } as any);

      const result = await service.getBlocks(12);

      expect(result).toEqual([
        {
          blockCode: 201,
          blockNameEnglish: 'Block A',
          districtCode: 12,
        },
      ]);
    });

    it('passes district filter', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {records: []},
      } as any);

      await service.getBlocks(22);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            'filters[district_code]': 22,
          }),
        }),
      );
    });

    it('throws when districtCode missing', async () => {
      await expect(service.getBlocks(0)).rejects.toThrow(BadRequestError);
    });
  });

  describe('getVillages', () => {
    it('returns mapped villages', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          records: [
            {
              villageCode: 301,
              villageNameEnglish: 'Village A',
              pincode: '141001',
            },
          ],
        },
      } as any);

      const result = await service.getVillages(44);

      expect(result).toEqual([
        {
          villageCode: 301,
          villageNameEnglish: 'Village A',
          blockCode: 44,
          pincode: '141001',
        },
      ]);
    });

    it('passes block filter', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {records: []},
      } as any);

      await service.getVillages(99);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            'filters[subdistrictCode]': 99,
          }),
        }),
      );
    });

    it('throws when blockCode missing', async () => {
      await expect(service.getVillages(0)).rejects.toThrow(BadRequestError);
    });
  });

  describe('LGD API', () => {
    it('throws when api key missing', async () => {
      delete process.env.LGD_API_KEY;

      await expect(service.getStates()).rejects.toThrow(InternalServerError);
    });

    it('throws when records are missing', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {},
      } as any);

      await expect(service.getStates()).rejects.toThrow('records missing');
    });

    it('wraps axios errors', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network Error'));

      await expect(service.getStates()).rejects.toThrow(
        'LGD service error: Network Error',
      );
    });

    it('uses api message when available', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Unauthorized',
          },
        },
      });

      await expect(service.getStates()).rejects.toThrow(
        'LGD service error: Unauthorized',
      );
    });

    it('passes common query params', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {records: []},
      } as any);

      await service.getStates();

      expect(axios.get).toHaveBeenCalledWith(
        process.env.LGD_STATES_API_URL,
        expect.objectContaining({
          timeout: 30000,
          params: expect.objectContaining({
            'api-key': 'test-api-key',
            format: 'json',
            limit: 10000,
            offset: 0,
          }),
        }),
      );
    });
  });
});

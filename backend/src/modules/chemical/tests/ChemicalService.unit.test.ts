import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {ChemicalService} from '../services/ChemicalService.js';

describe('ChemicalService', () => {
  let service: ChemicalService;

  const mockChemicalRepository = {
    createChemical: vi.fn(),
    getAllChemicals: vi.fn(),
    getChemicalById: vi.fn(),
    updateChemical: vi.fn(),
    deleteChemical: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ChemicalService(mockChemicalRepository as any);
  });

  describe('createChemical', () => {
    it('creates chemical successfully', async () => {
      const chemical = {
        _id: 'chemical-1',
        name: 'Urea',
        status: 'Restricted',
        createdBy: 'user-1',
      };

      mockChemicalRepository.createChemical.mockResolvedValueOnce(chemical);

      const result = await service.createChemical(
        {
          name: 'Urea',
          status: 'Restricted',
        },
        'user-1',
      );

      expect(result).toEqual(chemical);

      expect(mockChemicalRepository.createChemical).toHaveBeenCalledWith(
        'Urea',
        'Restricted',
        'user-1',
      );
    });
  });

  describe('getAllChemicals', () => {
    it('returns paginated chemicals', async () => {
      const response = {
        chemicals: [
          {
            _id: 'chemical-1',
            name: 'Urea',
            status: 'Restricted',
          },
        ],
        totalCount: 1,
        totalPages: 1,
      };

      const query = {
        search: 'urea',
        sort: 'name_asc' as const,
        page: 1,
        limit: 10,
      };

      mockChemicalRepository.getAllChemicals.mockResolvedValueOnce(response);

      const result = await service.getAllChemicals(query);

      expect(result).toEqual(response);

      expect(mockChemicalRepository.getAllChemicals).toHaveBeenCalledWith(
        query,
      );
    });

    it('returns all chemicals when query is undefined', async () => {
      const response = {
        chemicals: [],
        totalCount: 0,
        totalPages: 0,
      };

      mockChemicalRepository.getAllChemicals.mockResolvedValueOnce(response);

      const result = await service.getAllChemicals();

      expect(result).toEqual(response);

      expect(mockChemicalRepository.getAllChemicals).toHaveBeenCalledWith(
        undefined,
      );
    });
  });

  describe('getChemicalById', () => {
    it('returns chemical by id', async () => {
      const chemical = {
        _id: 'chemical-1',
        name: 'Urea',
        status: 'Restricted',
      };

      mockChemicalRepository.getChemicalById.mockResolvedValueOnce(chemical);

      const result = await service.getChemicalById('chemical-1');

      expect(result).toEqual(chemical);

      expect(mockChemicalRepository.getChemicalById).toHaveBeenCalledWith(
        'chemical-1',
      );
    });

    it('returns null when chemical does not exist', async () => {
      mockChemicalRepository.getChemicalById.mockResolvedValueOnce(null);

      const result = await service.getChemicalById('missing-id');

      expect(result).toBeNull();

      expect(mockChemicalRepository.getChemicalById).toHaveBeenCalledWith(
        'missing-id',
      );
    });
  });

  describe('updateChemical', () => {
    it('updates chemical successfully', async () => {
      const updatedChemical = {
        _id: 'chemical-1',
        name: 'DAP',
        status: 'Banned',
      };

      const updates = {
        name: 'DAP',
        status: 'Banned' as const,
      };

      mockChemicalRepository.updateChemical.mockResolvedValueOnce(
        updatedChemical,
      );

      const result = await service.updateChemical(
        'chemical-1',
        updates,
        'user-1',
      );

      expect(result).toEqual(updatedChemical);

      expect(mockChemicalRepository.updateChemical).toHaveBeenCalledWith(
        'chemical-1',
        updates,
        'user-1',
      );
    });

    it('returns null when chemical is not found', async () => {
      mockChemicalRepository.updateChemical.mockResolvedValueOnce(null);

      const result = await service.updateChemical(
        'missing-id',
        {
          status: 'Restricted',
        },
        'user-1',
      );

      expect(result).toBeNull();

      expect(mockChemicalRepository.updateChemical).toHaveBeenCalledWith(
        'missing-id',
        {
          status: 'Restricted',
        },
        'user-1',
      );
    });
  });

  describe('deleteChemical', () => {
    it('returns true when deletion succeeds', async () => {
      mockChemicalRepository.deleteChemical.mockResolvedValueOnce(true);

      const result = await service.deleteChemical('chemical-1');

      expect(result).toBe(true);

      expect(mockChemicalRepository.deleteChemical).toHaveBeenCalledWith(
        'chemical-1',
      );
    });

    it('returns false when chemical is not found', async () => {
      mockChemicalRepository.deleteChemical.mockResolvedValueOnce(false);

      const result = await service.deleteChemical('missing-id');

      expect(result).toBe(false);

      expect(mockChemicalRepository.deleteChemical).toHaveBeenCalledWith(
        'missing-id',
      );
    });
  });
});

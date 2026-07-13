import 'reflect-metadata';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {FarmerService} from '../services/FarmerService.js';

describe('FarmerService', () => {
  let service: FarmerService;

  const mockCallFarmerRepository = {
    findByPhoneNo: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new FarmerService(mockCallFarmerRepository as any);
  });

  describe('getFarmerByPhoneNo', () => {
    const farmer = {
      phoneNo: '9876543210',
      profile: {
        farmerName: 'John',
        villageName: 'Village A',
      },
    };

    it('returns farmer when found', async () => {
      mockCallFarmerRepository.findByPhoneNo.mockResolvedValue(farmer);

      const result = await service.getFarmerByPhoneNo('9876543210');

      expect(mockCallFarmerRepository.findByPhoneNo).toHaveBeenCalledWith(
        '9876543210',
      );

      expect(result).toEqual(farmer);
    });

    it('returns null when farmer does not exist', async () => {
      mockCallFarmerRepository.findByPhoneNo.mockResolvedValue(null);

      const result = await service.getFarmerByPhoneNo('9876543210');

      expect(result).toBeNull();
    });

    it('throws InternalServerError when repository fails', async () => {
      mockCallFarmerRepository.findByPhoneNo.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getFarmerByPhoneNo('9876543210')).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getFarmerByPhoneNo('9876543210')).rejects.toThrow(
        'Failed to get farmer by phone number: Error: Database error',
      );
    });
  });

  describe('createFarmer', () => {
    const profile = {
      farmerName: 'John',
      villageName: 'Village A',
    };

    it('creates farmer successfully', async () => {
      mockCallFarmerRepository.create.mockResolvedValue('farmer-id');

      const result = await service.createFarmer('9876543210', profile as any);

      expect(mockCallFarmerRepository.create).toHaveBeenCalledWith({
        phoneNo: '9876543210',
        profile,
      });

      expect(result).toBe('farmer-id');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockCallFarmerRepository.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.createFarmer('9876543210', profile as any),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.createFarmer('9876543210', profile as any),
      ).rejects.toThrow('Failed to create farmer: Error: Database error');
    });
  });

  describe('updateFarmer', () => {
    const profile = {
      farmerName: 'Updated Name',
    };

    it('updates farmer successfully', async () => {
      mockCallFarmerRepository.update.mockResolvedValue(true);

      const result = await service.updateFarmer('9876543210', profile as any);

      expect(mockCallFarmerRepository.update).toHaveBeenCalledWith(
        '9876543210',
        profile,
      );

      expect(result).toBe(true);
    });

    it('returns false when repository returns false', async () => {
      mockCallFarmerRepository.update.mockResolvedValue(false);

      const result = await service.updateFarmer('9876543210', profile as any);

      expect(result).toBe(false);
    });

    it('throws InternalServerError when repository fails', async () => {
      mockCallFarmerRepository.update.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.updateFarmer('9876543210', profile as any),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.updateFarmer('9876543210', profile as any),
      ).rejects.toThrow('Failed to update farmer: Error: Database error');
    });
  });

  describe('deleteFarmer', () => {
    it('deletes farmer successfully', async () => {
      mockCallFarmerRepository.delete.mockResolvedValue(true);

      const result = await service.deleteFarmer('9876543210');

      expect(mockCallFarmerRepository.delete).toHaveBeenCalledWith(
        '9876543210',
      );

      expect(result).toBe(true);
    });

    it('returns false when repository returns false', async () => {
      mockCallFarmerRepository.delete.mockResolvedValue(false);

      const result = await service.deleteFarmer('9876543210');

      expect(result).toBe(false);
    });

    it('throws InternalServerError when repository fails', async () => {
      mockCallFarmerRepository.delete.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.deleteFarmer('9876543210')).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.deleteFarmer('9876543210')).rejects.toThrow(
        'Failed to delete farmer: Error: Database error',
      );
    });
  });

  describe('getAllFarmers', () => {
    const farmers = [
      {
        phoneNo: '1111111111',
        profile: {
          farmerName: 'Farmer 1',
        },
      },
      {
        phoneNo: '2222222222',
        profile: {
          farmerName: 'Farmer 2',
        },
      },
    ];

    it('returns all farmers', async () => {
      mockCallFarmerRepository.getAll.mockResolvedValue(farmers);

      const result = await service.getAllFarmers();

      expect(mockCallFarmerRepository.getAll).toHaveBeenCalled();

      expect(result).toEqual(farmers);
    });

    it('returns empty array when no farmers exist', async () => {
      mockCallFarmerRepository.getAll.mockResolvedValue([]);

      const result = await service.getAllFarmers();

      expect(result).toEqual([]);
    });

    it('throws InternalServerError when repository fails', async () => {
      mockCallFarmerRepository.getAll.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getAllFarmers()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getAllFarmers()).rejects.toThrow(
        'Failed to get all farmers: Error: Database error',
      );
    });
  });
});

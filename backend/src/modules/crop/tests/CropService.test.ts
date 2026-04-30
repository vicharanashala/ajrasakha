import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';
import {CropService} from '../services/CropService.js';
import {ICrop} from '#root/shared/interfaces/models.js';

// ── Shared mock data ──────────────────────────────────────────────────────────

const mockCrop: ICrop = {
  _id: '664f1a2b3c4d5e6f7a8b9c0d',
  name: 'Rice',
  aliases: [
    { language: 'hi-IN', region: 'North India', english_representation: 'paddy', native_representation: 'पैडी' },
    { language: 'bn-IN', region: 'West Bengal', english_representation: 'dhan', native_representation: 'ধান' },
  ],
  createdBy: '664f000000000000000000001',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockPaginatedResult = {
  crops: [mockCrop],
  totalCount: 1,
  totalPages: 1,
};

// ── Mock repository ───────────────────────────────────────────────────────────

const mockRepo = {
  getAllCrops: vi.fn(),
  getCropById: vi.fn(),
  createCrop: vi.fn(),
  updateCrop: vi.fn(),
};

const mockQuestionRepo = {
  backfillNormalisedCrop: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CropService', () => {
  let service: CropService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CropService(mockRepo as any, mockQuestionRepo as any, {} as any);
  });

  // ── getAllCrops ─────────────────────────────────────────────────────────────

  describe('getAllCrops', () => {
    it('returns paginated crops from repository', async () => {
      mockRepo.getAllCrops.mockResolvedValue(mockPaginatedResult);

      const result = await service.getAllCrops({page: 1, limit: 10});

      expect(mockRepo.getAllCrops).toHaveBeenCalledWith({page: 1, limit: 10});
      expect(result).toEqual(mockPaginatedResult);
    });

    it('works with no query params', async () => {
      mockRepo.getAllCrops.mockResolvedValue(mockPaginatedResult);

      const result = await service.getAllCrops();

      expect(mockRepo.getAllCrops).toHaveBeenCalledWith(undefined);
      expect(result.crops).toHaveLength(1);
    });
  });

  // ── getCropById ─────────────────────────────────────────────────────────────

  describe('getCropById', () => {
    it('returns a crop when found', async () => {
      mockRepo.getCropById.mockResolvedValue(mockCrop);

      const result = await service.getCropById('664f1a2b3c4d5e6f7a8b9c0d');

      expect(result).toEqual(mockCrop);
    });

    it('returns null when not found', async () => {
      mockRepo.getCropById.mockResolvedValue(null);

      const result = await service.getCropById('000000000000000000000000');

      expect(result).toBeNull();
    });
  });

  // ── createCrop ──────────────────────────────────────────────────────────────

  describe('createCrop', () => {
    const dto = {name: 'Rice', aliases: [{ language: 'hi-IN', region: '', english_representation: 'paddy', native_representation: 'पैडी' }]};
    const userId = '664f000000000000000000001';

    it('creates a crop and returns it', async () => {
      mockRepo.createCrop.mockResolvedValue(mockCrop);

      const result = await service.createCrop(dto, userId);

      expect(mockRepo.createCrop).toHaveBeenCalledWith(
        dto.name,
        userId,
        dto.aliases,
      );
      expect(result).toEqual(mockCrop);
    });

    it('throws BadRequestError (400) on duplicate', async () => {
      mockRepo.createCrop.mockRejectedValue(
        new BadRequestError('Crop with name "Rice" already exists.'),
      );

      await expect(service.createCrop(dto, userId)).rejects.toMatchObject({
        httpCode: 400,
      });
    });

    it('re-throws non-duplicate errors as-is', async () => {
      const dbError = new Error('DB connection lost');
      mockRepo.createCrop.mockRejectedValue(dbError);

      await expect(service.createCrop(dto, userId)).rejects.toThrow('DB connection lost');
    });
  });

  // ── updateCrop ──────────────────────────────────────────────────────────────

  describe('updateCrop', () => {
    const dto = {aliases: [
      { language: 'hi-IN', region: '', english_representation: 'paddy', native_representation: 'पैडी' },
      { language: 'bn-IN', region: '', english_representation: 'dhan', native_representation: 'ধান' },
    ]};
    const userId = '664f000000000000000000001';

    it('updates a crop and returns updated doc', async () => {
      const updated = {...mockCrop, aliases: dto.aliases};
      mockRepo.updateCrop.mockResolvedValue(updated);

      const result = await service.updateCrop('664f1a2b3c4d5e6f7a8b9c0d', dto, userId);

      expect(mockRepo.updateCrop).toHaveBeenCalledWith(
        '664f1a2b3c4d5e6f7a8b9c0d',
        dto,
        userId,
      );
      expect(result?.aliases.some(a => typeof a !== 'string' && a.english_representation === 'dhan')).toBe(true);
    });

    it('returns null when crop not found', async () => {
      mockRepo.updateCrop.mockResolvedValue(null);

      const result = await service.updateCrop('000000000000000000000000', dto, userId);

      expect(result).toBeNull();
    });

    it('throws BadRequestError (400) on duplicate alias', async () => {
      mockRepo.updateCrop.mockRejectedValue(
        new BadRequestError('Cannot add alias "wheat" — it already exists as a crop name.'),
      );

      await expect(
        service.updateCrop('664f1a2b3c4d5e6f7a8b9c0d', {aliases: [{ language: 'en-IN', region: '', english_representation: 'wheat', native_representation: 'wheat' }]}, userId),
      ).rejects.toMatchObject({httpCode: 400});
    });
  });
});


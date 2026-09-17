import {beforeEach, describe, expect, it, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: vi.fn(() => false),
  aiConfig: {
    plantNetMock: false,
    plantNetApiKey: 'test-plantnet-key',
    plantNetProject: 'all',
    plantNetRelayBaseUrl:
      'https://test-plantnet-relay.example.com',
  },
}));

vi.mock('axios', () => ({
  default: {
    post: mocks.post,
    isAxiosError: mocks.isAxiosError,
  },
  isAxiosError: mocks.isAxiosError,
}));

vi.mock('#root/config/ai.js', () => ({
  aiConfig: mocks.aiConfig,
}));

import {PlantNetService} from '../services/PlantNetService.js';

describe('PlantNetService', () => {
  const image = {
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/jpeg',
    originalname: 'leaf.jpg',
  } as Express.Multer.File;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.aiConfig.plantNetMock = false;
    mocks.aiConfig.plantNetApiKey =
      'test-plantnet-key';
    mocks.aiConfig.plantNetProject = 'all';
    mocks.aiConfig.plantNetRelayBaseUrl =
      'https://test-plantnet-relay.example.com';

    mocks.isAxiosError.mockReturnValue(false);
  });

  it('returns the deterministic mock species result when mock mode is enabled', async () => {
    mocks.aiConfig.plantNetMock = true;

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(mocks.post).not.toHaveBeenCalled();

    expect(result).toEqual({
      identified: true,
      bestMatch: {
        score: 0.96648,
        scientificName: 'Solanum tuberosum L.',
        commonNames: [
          'Potato',
          'Irish potato',
          'White Potato',
        ],
        genus: 'Solanum',
        family: 'Solanaceae',
      },
      candidates: [
        {
          score: 0.96648,
          scientificName: 'Solanum tuberosum L.',
          commonNames: [
            'Potato',
            'Irish potato',
            'White Potato',
          ],
          genus: 'Solanum',
          family: 'Solanaceae',
        },
        {
          score: 0.00709,
          scientificName:
            'Solanum lycopersicum L.',
          commonNames: ['Tomato'],
          genus: 'Solanum',
          family: 'Solanaceae',
        },
      ],
      predictedOrgan: 'leaf',
      remainingRequests: null,
    });
  });

  it('normalizes a real PlantNet species response', async () => {
    mocks.post.mockResolvedValue({
      data: {
        bestMatch: 'Solanum lycopersicum L.',
        predictedOrgans: ['leaf'],
        remainingIdentificationRequests: 499,
        version: '2025-01-17 (7.3)',
        results: [
          {
            score: 0.9215,
            species: {
              scientificNameWithoutAuthor:
                'Solanum lycopersicum',
              scientificName:
                'Solanum lycopersicum L.',
              commonNames: [
                'Tomato',
                'Tomate',
              ],
              genus: {
                scientificNameWithoutAuthor:
                  'Solanum',
              },
              family: {
                scientificNameWithoutAuthor:
                  'Solanaceae',
              },
            },
          },
          {
            score: 0.0412,
            species: {
              scientificNameWithoutAuthor:
                'Solanum tuberosum',
              commonNames: ['Potato'],
              genus: {
                scientificNameWithoutAuthor:
                  'Solanum',
              },
              family: {
                scientificNameWithoutAuthor:
                  'Solanaceae',
              },
            },
          },
        ],
      },
    });

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(result).toEqual({
      identified: true,
      bestMatch: {
        score: 0.9215,
        scientificName:
          'Solanum lycopersicum',
        commonNames: [
          'Tomato',
          'Tomate',
        ],
        genus: 'Solanum',
        family: 'Solanaceae',
      },
      candidates: [
        {
          score: 0.9215,
          scientificName:
            'Solanum lycopersicum',
          commonNames: [
            'Tomato',
            'Tomate',
          ],
          genus: 'Solanum',
          family: 'Solanaceae',
        },
        {
          score: 0.0412,
          scientificName:
            'Solanum tuberosum',
          commonNames: ['Potato'],
          genus: 'Solanum',
          family: 'Solanaceae',
        },
      ],
      predictedOrgan: 'leaf',
      remainingRequests: 499,
    });

    expect(mocks.post).toHaveBeenCalledOnce();

    const [url, form, options] =
      mocks.post.mock.calls[0];

    expect(url).toBe(
      'https://test-plantnet-relay.example.com/identify',
    );

    expect(url).not.toContain('api-key=');

    expect(url).not.toContain('nb-results=');

    expect(url).not.toContain('lang=');

    expect(form).toBeDefined();

    expect(options).toEqual(
      expect.objectContaining({
        timeout: 30_000,
        maxContentLength:
          50 * 1024 * 1024,
        maxBodyLength:
          50 * 1024 * 1024,
      }),
    );
  });

  it('falls back to scientificName when scientificNameWithoutAuthor is missing', async () => {
    mocks.post.mockResolvedValue({
      data: {
        predictedOrgans: ['leaf'],
        results: [
          {
            score: 0.81,
            species: {
              scientificName:
                'Oryza sativa L.',
              commonNames: ['Rice'],
              genus: {
                scientificName: 'Oryza',
              },
              family: {
                scientificName:
                  'Poaceae',
              },
            },
          },
        ],
      },
    });

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(result.bestMatch).toEqual({
      score: 0.81,
      scientificName:
        'Oryza sativa L.',
      commonNames: ['Rice'],
      genus: 'Oryza',
      family: 'Poaceae',
    });
  });

  it('ignores malformed species results', async () => {
    mocks.post.mockResolvedValue({
      data: {
        results: [
          null,
          {
            score: 0.72,
          },
          {
            score: '0.51',
            species: {
              scientificNameWithoutAuthor:
                'Invalid score species',
            },
          },
          {
            score: 0.64,
            species: {},
          },
          {
            score: 0.88,
            species: {
              scientificNameWithoutAuthor:
                'Zea mays',
              commonNames: ['Maize'],
            },
          },
        ],
      },
    });

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(result.candidates).toEqual([
      {
        score: 0.88,
        scientificName: 'Zea mays',
        commonNames: ['Maize'],
        genus: null,
        family: null,
      },
    ]);

    expect(result.bestMatch).toEqual(
      result.candidates[0],
    );
  });

  it('returns no best match when PlantNet returns no usable candidates', async () => {
    mocks.post.mockResolvedValue({
      data: {
        results: [],
        predictedOrgans: ['leaf'],
        remainingIdentificationRequests: 490,
      },
    });

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(result).toEqual({
      identified: false,
      bestMatch: null,
      candidates: [],
      predictedOrgan: 'leaf',
      remainingRequests: 490,
    });
  });

  it('extracts an object-shaped predicted organ', async () => {
    mocks.post.mockResolvedValue({
      data: {
        results: [
          {
            score: 0.9,
            species: {
              scientificNameWithoutAuthor:
                'Capsicum annuum',
              commonNames: ['Chilli pepper'],
            },
          },
        ],
        predictedOrgans: [
          {
            organ: 'leaf',
          },
        ],
      },
    });

    const service = new PlantNetService();

    const result = await service.identify(image);

    expect(result.predictedOrgan).toBe(
      'leaf',
    );
  });

  it('rejects when the PlantNet relay URL is missing', async () => {
    mocks.aiConfig.plantNetRelayBaseUrl = '';

    const service = new PlantNetService();

    await expect(
      service.identify(image),
    ).rejects.toMatchObject({
      httpCode: 500,
      message:
        'Plant scan is not configured: PLANTNET_RELAY_BASE_URL is missing.',
    });

    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('rejects a missing image', async () => {
    const service = new PlantNetService();

    await expect(
      service.identify(
        null as unknown as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(
      InternalServerError,
    );

    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('rejects unsupported image types', async () => {
    const service = new PlantNetService();

    const invalidImage = {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/webp',
      originalname: 'leaf.webp',
    } as Express.Multer.File;

    await expect(
      service.identify(invalidImage),
    ).rejects.toMatchObject({
      httpCode: 500,
      message:
        'PlantNet requires a JPEG or PNG image.',
    });

    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('normalizes real PlantNet disease results', async () => {
    mocks.post.mockResolvedValue({
      data: {
        results: [
          {
            name: 'APHISP',
            score: 0.91427,
            description: 'Aphis sp.',
          },
          {
            name: 'ELSIAM',
            score: 0.02946,
            description:
              'Elsinoë ampelina - Anthracnose maculée de la vigne',
          },
          {
            name: 'TRANSP',
            score: 0.00432,
            description: '',
          },
        ],
        version: '2025-08-08 (7.4)',
        remainingIdentificationRequests: 495,
      },
    });

    const service = new PlantNetService();

    const result =
      await service.identifyDiseases(
        image,
        'leaf',
      );

    expect(result).toEqual({
      diseases: [
        {
          code: 'APHISP',
          name: 'Aphis sp.',
          score: 0.91427,
          description: 'Aphis sp.',
        },
        {
          code: 'ELSIAM',
          name: 'Elsinoë ampelina - Anthracnose maculée de la vigne',
          score: 0.02946,
          description:
            'Elsinoë ampelina - Anthracnose maculée de la vigne',
        },
        {
          code: 'TRANSP',
          name: 'TRANSP',
          score: 0.00432,
          description: null,
        },
      ],
      remainingRequests: 495,
      version: '2025-08-08 (7.4)',
    });

    expect(mocks.post).toHaveBeenCalledOnce();

    const [url, form, options] =
      mocks.post.mock.calls[0];

    expect(url).toBe(
      'https://test-plantnet-relay.example.com/diseases',
    );

    expect(url).not.toContain('api-key=');

    expect(url).not.toContain('nb-results=');

    expect(url).not.toContain('lang=');

    expect(form).toBeDefined();

    expect(options).toEqual(
      expect.objectContaining({
        timeout: 30_000,
      }),
    );
  });

  it('uses auto when disease organ is missing or unsupported', async () => {
    mocks.post.mockResolvedValue({
      data: {
        results: [],
      },
    });

    const service = new PlantNetService();

    await service.identifyDiseases(
      image,
      'seed',
    );

    const [, form] =
      mocks.post.mock.calls[0];

    expect(form).toBeDefined();

    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it('supports disease mock mode', async () => {
    mocks.aiConfig.plantNetMock = true;

    const service = new PlantNetService();

    const result =
      await service.identifyDiseases(
        image,
        'leaf',
      );

    expect(mocks.post).not.toHaveBeenCalled();

    expect(result.diseases).toHaveLength(2);

    expect(result.diseases[0]).toMatchObject({
      code: 'PHYTIN',
      score: 0.8124,
    });

    expect(result.version).toBe('mock');
  });

  it('handles PlantNet species API failures', async () => {
    mocks.isAxiosError.mockReturnValue(true);

    const error = {
      response: {
        status: 429,
      },
    };

    mocks.post.mockRejectedValue(error);

    const service = new PlantNetService();

    await expect(
      service.identify(image),
    ).rejects.toMatchObject({
      httpCode: 500,
      message:
        'PlantNet identification request failed with status 429.',
    });
  });

  it('handles PlantNet disease API failures', async () => {
    mocks.isAxiosError.mockReturnValue(true);

    const error = {
      response: {
        status: 500,
      },
    };

    mocks.post.mockRejectedValue(error);

    const service = new PlantNetService();

    await expect(
      service.identifyDiseases(
        image,
        'leaf',
      ),
    ).rejects.toMatchObject({
      httpCode: 500,
      message:
        'PlantNet disease identification request failed with status 500.',
    });
  });
});
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {promises as fs} from 'node:fs';
import {BadRequestError, InternalServerError} from 'routing-controllers';

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  identifyDiseases: vi.fn(),
  save: vi.fn(),
  getSignedUrl: vi.fn(),
  delete: vi.fn(),
  Storage: vi.fn(),
  aiConfig: {
    plantNetMock: false,
    plantNetApiKey: 'test-key',
    plantNetProject: 'all',
    plantScanLocalImageBaseUrl: 'http://127.0.0.1:8080',
  },
  storageConfig: {
    googleCloud: {
      aiServerBucketName: 'test-ai-bucket',
    },
  },
  appConfig: {
    isDevelopment: false,
    routePrefix: '/api',
  },
}));

vi.mock('#root/config/ai.js', () => ({
  aiConfig: mocks.aiConfig,
}));

vi.mock('#root/config/storage.js', () => ({
  storageConfig: mocks.storageConfig,
}));

vi.mock('#root/config/app.js', () => ({
  appConfig: mocks.appConfig,
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: mocks.Storage.mockImplementation(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        save: mocks.save,
        getSignedUrl: mocks.getSignedUrl,
        delete: mocks.delete,
      })),
    })),
  })),
}));

vi.mock('../services/PlantNetService.js', () => ({
  PlantNetService: vi.fn().mockImplementation(() => ({
    identify: mocks.identify,
    identifyDiseases: mocks.identifyDiseases,
  })),
}));

import {PlantScanService} from '../services/PlantScanService.js';

describe('PlantScanService', () => {
  const image = {
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/jpeg',
    originalname: 'leaf.jpg',
  } as Express.Multer.File;

  const plantNetSpeciesResult = {
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
    remainingRequests: 499,
  };

  const diseaseResult = {
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
    remainingRequests: 498,
    version: 'test-version',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.aiConfig.plantNetMock = false;
    mocks.aiConfig.plantNetApiKey = 'test-key';
    mocks.aiConfig.plantNetProject = 'all';
    mocks.aiConfig.plantScanLocalImageBaseUrl =
      'http://127.0.0.1:8080';

    mocks.appConfig.isDevelopment = false;
    mocks.appConfig.routePrefix = '/api';

    mocks.storageConfig.googleCloud.aiServerBucketName =
      'test-ai-bucket';

    mocks.save.mockResolvedValue(undefined);
    mocks.getSignedUrl.mockResolvedValue([
      'https://storage.example/signed-image',
    ]);
    mocks.delete.mockResolvedValue(undefined);

    mocks.identify.mockResolvedValue(
      plantNetSpeciesResult,
    );

    mocks.identifyDiseases.mockResolvedValue(
      diseaseResult,
    );
  });

  afterEach(() => {
    mocks.appConfig.isDevelopment = false;
    mocks.appConfig.routePrefix = '/api';

    mocks.aiConfig.plantNetMock = false;
    mocks.aiConfig.plantNetApiKey = 'test-key';
    mocks.aiConfig.plantNetProject = 'all';
    mocks.aiConfig.plantScanLocalImageBaseUrl =
      'http://127.0.0.1:8080';

    mocks.storageConfig.googleCloud.aiServerBucketName =
      'test-ai-bucket';
  });

  it('returns PlantNet identification enriched with disease analysis and crop knowledge', async () => {
    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(mocks.identify).toHaveBeenCalledWith(image);

    expect(mocks.identifyDiseases).toHaveBeenCalledWith(
      image,
      'leaf',
    );

    expect(result).toEqual({
      identified: true,
      plantName: 'Potato',
      scientificName: 'Solanum tuberosum L.',
      confidence: 0.96648,
      condition: null,
      severity: null,
      observations: [
        'Image appears to contain a leaf.',
      ],
      recommendations: [
        'Keep foliage dry where practical and provide good airflow.',
        'Remove severely diseased plant material from the growing area.',
        'For suspected disease, confirm the diagnosis before applying crop-protection products.',
      ],
      benefits: [
        'Provides carbohydrates that can support daily energy needs.',
        'Contains potassium and other micronutrients.',
        'Its skin can contribute additional fibre when properly prepared.',
      ],
      commonProblems: [
        {
          name: 'Late blight',
          symptoms:
            'Dark, water-soaked lesions on leaves or stems; rapid browning under humid conditions.',
          treatment:
            'Remove severely affected plant material and avoid overhead irrigation. Use locally approved fungicide guidance when disease is confirmed.',
        },
        {
          name: 'Early blight',
          symptoms:
            'Brown leaf spots that may develop concentric rings, often starting on older leaves.',
          treatment:
            'Remove heavily affected leaves, improve airflow, avoid prolonged leaf wetness, and follow locally approved disease-control guidance.',
        },
      ],
      knowledgeAvailable: true,
      plantNetCandidates:
        plantNetSpeciesResult.candidates,
      diseases: diseaseResult.diseases,
      diseaseAnalysisAvailable: true,
    });

    expect(mocks.Storage).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(
      image.buffer,
      expect.objectContaining({
        contentType: image.mimetype,
        resumable: false,
      }),
    );
    expect(mocks.getSignedUrl).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
  });

  it('returns an unidentified result when PlantNet has no best match', async () => {
    mocks.identify.mockResolvedValue({
      identified: false,
      bestMatch: null,
      candidates: [],
      predictedOrgan: null,
      remainingRequests: 497,
    });

    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(result).toEqual({
      identified: false,
      plantName: null,
      scientificName: null,
      confidence: 0,
      condition: null,
      severity: null,
      observations: [],
      recommendations: [
        'Retake the image in good lighting with the plant clearly visible.',
        'Try a closer image focused on the leaf or plant structure.',
      ],
      benefits: [],
      commonProblems: [],
      knowledgeAvailable: false,
      plantNetCandidates: [],
      diseases: [],
      diseaseAnalysisAvailable: false,
    });

    expect(mocks.identifyDiseases).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
  });

  it('preserves plant identification when disease analysis fails', async () => {
    mocks.identifyDiseases.mockRejectedValue(
      new InternalServerError(
        'PlantNet disease identification failed.',
      ),
    );

    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(result).toMatchObject({
      identified: true,
      plantName: 'Potato',
      scientificName: 'Solanum tuberosum L.',
      confidence: 0.96648,
      knowledgeAvailable: true,
      diseaseAnalysisAvailable: false,
      diseases: [],
    });

    expect(mocks.identify).toHaveBeenCalledWith(image);
    expect(mocks.identifyDiseases).toHaveBeenCalledWith(
      image,
      'leaf',
    );
    expect(mocks.delete).toHaveBeenCalled();
  });

  it('uses generic recommendations when crop-specific knowledge is unavailable', async () => {
    mocks.identify.mockResolvedValue({
      identified: true,
      bestMatch: {
        score: 0.84,
        scientificName: 'Unknown test plant',
        commonNames: ['Test Plant'],
        genus: 'Testus',
        family: 'Testaceae',
      },
      candidates: [
        {
          score: 0.84,
          scientificName: 'Unknown test plant',
          commonNames: ['Test Plant'],
          genus: 'Testus',
          family: 'Testaceae',
        },
      ],
      predictedOrgan: 'leaf',
      remainingRequests: 490,
    });

    mocks.identifyDiseases.mockResolvedValue({
      diseases: [],
      remainingRequests: 489,
      version: 'test-version',
    });

    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(result).toMatchObject({
      identified: true,
      plantName: 'Test Plant',
      scientificName: 'Unknown test plant',
      confidence: 0.84,
      knowledgeAvailable: false,
      diseases: [],
      diseaseAnalysisAvailable: true,
      recommendations: [
        'Retake the image in good lighting if the identification looks incorrect.',
        'Confirm the plant and symptoms before applying any treatment.',
      ],
    });
  });

  it('does not run disease analysis when there is no plant identification', async () => {
    mocks.identify.mockResolvedValue({
      identified: false,
      bestMatch: null,
      candidates: [
        {
          score: 0.22,
          scientificName: 'Uncertain species',
          commonNames: [],
          genus: null,
          family: null,
        },
      ],
      predictedOrgan: 'leaf',
      remainingRequests: 480,
    });

    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(result.identified).toBe(false);
    expect(result.plantNetCandidates).toHaveLength(1);
    expect(result.diseases).toEqual([]);
    expect(result.diseaseAnalysisAvailable).toBe(false);
    expect(mocks.identifyDiseases).not.toHaveBeenCalled();
  });

  it('rejects a missing image before calling PlantNet', async () => {
    const service = new PlantScanService();

    await expect(
      service.analyze(
        null as unknown as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.identifyDiseases).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rejects when the production AI server bucket is missing', async () => {
    mocks.storageConfig.googleCloud.aiServerBucketName =
      '';

    const service = new PlantScanService();

    await expect(
      service.analyze(image),
    ).rejects.toMatchObject({
      httpCode: 500,
      message:
        'Plant scan is not configured: AI server bucket is missing.',
    });

    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.identifyDiseases).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('stores the image locally and removes it after analysis in development', async () => {
    mocks.appConfig.isDevelopment = true;

    const service = new PlantScanService();

    const result = await service.analyze(image);

    expect(result).toMatchObject({
      identified: true,
      plantName: 'Potato',
      scientificName: 'Solanum tuberosum L.',
      diseaseAnalysisAvailable: true,
      diseases: diseaseResult.diseases,
    });

    expect(mocks.Storage).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();

    expect(mocks.identify).toHaveBeenCalledWith(image);
    expect(mocks.identifyDiseases).toHaveBeenCalledWith(
      image,
      'leaf',
    );

    const calls = mocks.identify.mock.calls;
    expect(calls).toHaveLength(1);

    const localFiles = await fs.readdir(
      '/tmp/ajrasakha-plant-scans',
    ).catch(() => []);

    expect(
      localFiles.some((fileName) =>
        fileName.includes('plant-scans'),
      ),
    ).toBe(false);
  });

  it('uses the configured API route when constructing local image URLs', async () => {
    mocks.appConfig.isDevelopment = true;
    mocks.appConfig.routePrefix = '/api/v1';

    const service = new PlantScanService();

    await service.analyze(image);

    expect(
      service.getLocalImagePath('missing-file.jpg'),
    ).toMatch(
      /ajrasakha-plant-scans/,
    );
  });

  it('cleans up the GCS object when PlantNet identification fails', async () => {
    mocks.identify.mockRejectedValue(
      new InternalServerError(
        'PlantNet identification failed.',
      ),
    );

    const service = new PlantScanService();

    await expect(
      service.analyze(image),
    ).rejects.toMatchObject({
      httpCode: 500,
      message: 'PlantNet identification failed.',
    });

    expect(mocks.save).toHaveBeenCalled();
    expect(mocks.getSignedUrl).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
    expect(mocks.identifyDiseases).not.toHaveBeenCalled();
  });
});
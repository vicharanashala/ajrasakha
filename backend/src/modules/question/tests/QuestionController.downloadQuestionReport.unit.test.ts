import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.downloadQuestionReport', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;
  let mockResponse: any;

  const mockUser = {
    _id: {
      toString: () => 'user-123',
    },
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'admin',
    avatar: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      generateQuestionReport: vi.fn(),
    };

    mockUserService = {};
    mockContextService = {};

    mockAuditTrailsService = {
      createAuditTrail: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    controller = new QuestionController(
      mockQuestionService,
      mockUserService,
      mockContextService,
      mockAuditTrailsService,
    );
  });

  it('downloads report successfully', async () => {
    const reportData = Buffer.from('excel-content');

    mockQuestionService.generateQuestionReport.mockResolvedValue(reportData);

    const result = await controller.downloadQuestionReport(
      {
        consecutiveApprovals: '5',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      mockUser as any,
      mockResponse,
    );

    expect(mockQuestionService.generateQuestionReport).toHaveBeenCalledWith(
      5,
      new Date('2024-01-01'),
      new Date('2024-12-31'),
    );

    expect(result).toBeInstanceOf(Buffer);
  });

  it('uses undefined filters when query params are absent', async () => {
    mockQuestionService.generateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadQuestionReport({}, mockUser as any, mockResponse);

    expect(mockQuestionService.generateQuestionReport).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
    );
  });

  it('returns no data response when report is empty', async () => {
    mockQuestionService.generateQuestionReport.mockResolvedValue(null);

    await controller.downloadQuestionReport({}, mockUser as any, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: 'No data found for the selected filters',
    });
  });

  it('creates audit trail on successful download', async () => {
    mockQuestionService.generateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadQuestionReport({}, mockUser as any, mockResponse);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.generateQuestionReport.mockRejectedValue(
      new InternalServerError('Report generation failed'),
    );

    await expect(
      controller.downloadQuestionReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(InternalServerError);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.generateQuestionReport.mockRejectedValue(
      new Error('Unexpected failure'),
    );

    await expect(
      controller.downloadQuestionReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.downloadQuestionReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Unexpected failure');
  });

  it('parses consecutiveApprovals correctly', async () => {
    mockQuestionService.generateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadQuestionReport(
      {
        consecutiveApprovals: '10',
      },
      mockUser as any,
      mockResponse,
    );

    expect(mockQuestionService.generateQuestionReport).toHaveBeenCalledWith(
      10,
      undefined,
      undefined,
    );
  });
});

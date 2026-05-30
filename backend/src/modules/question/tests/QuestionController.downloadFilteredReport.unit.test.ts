import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.downloadFilteredReport', () => {
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
      generateStateCropQuestionReport: vi.fn(),
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

  it('downloads filtered report successfully', async () => {
    const reportData = Buffer.from('filtered-report');

    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(
      reportData,
    );

    const filters = {
      state: 'Punjab',
      crop: 'Wheat',
      status: 'open',
    };

    const result = await controller.downloadFilteredReport(
      filters,
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateStateCropQuestionReport,
    ).toHaveBeenCalledWith(filters);

    expect(result).toBeInstanceOf(Buffer);
  });

  it('passes all filters to service', async () => {
    const filters = {
      state: 'Punjab',
      crop: 'Wheat',
      normalised_crop: 'wheat',
      season: 'Rabi',
      domain: 'Pest',
      status: 'open',
      hiddenQuestions: 'false',
      duplicateQuestions: 'false',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadFilteredReport(
      filters,
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateStateCropQuestionReport,
    ).toHaveBeenCalledWith(filters);
  });

  it('returns no data response when report is empty', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(null);

    await controller.downloadFilteredReport({}, mockUser as any, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: 'No questions found for the selected filters',
    });
  });

  it('creates audit trail on successful download', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadFilteredReport(
      {
        state: 'Punjab',
      },
      mockUser as any,
      mockResponse,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockRejectedValue(
      new InternalServerError('Filtered report generation failed'),
    );

    await expect(
      controller.downloadFilteredReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.downloadFilteredReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Filtered report generation failed');

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalled();
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockRejectedValue(
      new Error('Unexpected failure'),
    );

    await expect(
      controller.downloadFilteredReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.downloadFilteredReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Unexpected failure');

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalled();
  });

  it('works with empty filters', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadFilteredReport({}, mockUser as any, mockResponse);

    expect(
      mockQuestionService.generateStateCropQuestionReport,
    ).toHaveBeenCalledWith({
      state: undefined,
      crop: undefined,
      normalised_crop: undefined,
      season: undefined,
      domain: undefined,
      status: undefined,
      hiddenQuestions: undefined,
      duplicateQuestions: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('calls service exactly once', async () => {
    mockQuestionService.generateStateCropQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadFilteredReport(
      {
        state: 'Punjab',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateStateCropQuestionReport,
    ).toHaveBeenCalledTimes(1);
  });
});

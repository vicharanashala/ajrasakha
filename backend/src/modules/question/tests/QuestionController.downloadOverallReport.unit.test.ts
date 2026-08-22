import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.downloadOverallReport', () => {
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
      generateOverallQuestionReport: vi.fn(),
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

  it('downloads overall report successfully', async () => {
    const reportData = Buffer.from('overall-report');

    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(
      reportData,
    );

    const result = await controller.downloadOverallReport(
      {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateOverallQuestionReport,
    ).toHaveBeenCalledWith(new Date('2024-01-01'), new Date('2024-12-31'));

    expect(result).toBeInstanceOf(Buffer);
  });

  it('uses undefined dates when query params are absent', async () => {
    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadOverallReport({}, mockUser as any, mockResponse);

    expect(
      mockQuestionService.generateOverallQuestionReport,
    ).toHaveBeenCalledWith(undefined, undefined);
  });

  it('returns no data response when report is empty', async () => {
    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(null);

    await controller.downloadOverallReport({}, mockUser as any, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: 'No data found for the selected date range',
    });
  });

  it('creates audit trail on successful download', async () => {
    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadOverallReport({}, mockUser as any, mockResponse);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.generateOverallQuestionReport.mockRejectedValue(
      new InternalServerError('Overall report generation failed'),
    );

    await expect(
      controller.downloadOverallReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.downloadOverallReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Overall report generation failed');

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalled();
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.generateOverallQuestionReport.mockRejectedValue(
      new Error('Unexpected failure'),
    );

    await expect(
      controller.downloadOverallReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.downloadOverallReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Unexpected failure');

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalled();
  });

  it('parses only startDate correctly', async () => {
    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadOverallReport(
      {
        startDate: '2024-01-01',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateOverallQuestionReport,
    ).toHaveBeenCalledWith(new Date('2024-01-01'), undefined);
  });

  it('parses only endDate correctly', async () => {
    mockQuestionService.generateOverallQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadOverallReport(
      {
        endDate: '2024-12-31',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateOverallQuestionReport,
    ).toHaveBeenCalledWith(undefined, new Date('2024-12-31'));
  });
});

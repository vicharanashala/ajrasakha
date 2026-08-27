import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.downloadDuplicateReport', () => {
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
      generateDuplicateQuestionReport: vi.fn(),
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

  it('downloads duplicate report successfully', async () => {
    const reportData = Buffer.from('duplicate-report');

    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(
      reportData,
    );

    const result = await controller.downloadDuplicateReport(
      {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateDuplicateQuestionReport,
    ).toHaveBeenCalledWith(new Date('2024-01-01'), new Date('2024-12-31'));

    expect(result).toBeInstanceOf(Buffer);
  });

  it('uses undefined dates when query params are absent', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadDuplicateReport({}, mockUser as any, mockResponse);

    expect(
      mockQuestionService.generateDuplicateQuestionReport,
    ).toHaveBeenCalledWith(undefined, undefined);
  });

  it('returns no data response when report is empty', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(null);

    await controller.downloadDuplicateReport({}, mockUser as any, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: 'No duplicate questions found for the selected date range',
    });
  });

  it('parses only startDate correctly', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadDuplicateReport(
      {
        startDate: '2024-01-01',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateDuplicateQuestionReport,
    ).toHaveBeenCalledWith(new Date('2024-01-01'), undefined);
  });

  it('parses only endDate correctly', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadDuplicateReport(
      {
        endDate: '2024-12-31',
      },
      mockUser as any,
      mockResponse,
    );

    expect(
      mockQuestionService.generateDuplicateQuestionReport,
    ).toHaveBeenCalledWith(undefined, new Date('2024-12-31'));
  });

  it('passes service errors through', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockRejectedValue(
      new Error('Report generation failed'),
    );

    await expect(
      controller.downloadDuplicateReport({}, mockUser as any, mockResponse),
    ).rejects.toThrow('Report generation failed');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.generateDuplicateQuestionReport.mockResolvedValue(
      Buffer.from('report'),
    );

    await controller.downloadDuplicateReport({}, mockUser as any, mockResponse);

    expect(
      mockQuestionService.generateDuplicateQuestionReport,
    ).toHaveBeenCalledTimes(1);
  });
});

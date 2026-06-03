import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

vi.mock('xlsx', () => ({
  default: {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn(),
    },
  },
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

describe('QuestionController.addQuestion - Bulk Upload', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      addQuestion: vi.fn(),
    };

    mockUserService = {};

    mockContextService = {};

    mockAuditTrailsService = {
      createAuditTrail: vi.fn(async () => undefined),
    };

    controller = new QuestionController(
      mockQuestionService,
      mockUserService,
      mockContextService,
      mockAuditTrailsService,
    );
  });

  it('processes json bulk upload successfully', async () => {
    const file = {
      mimetype: 'application/json',
      originalname: 'questions.json',
      buffer: Buffer.from(
        JSON.stringify([
          {
            question: 'What is wheat?',
          },
        ]),
      ),
    };

    const result = await controller.addQuestion(
      file as any,
      {
        isRequiredAiInitialAnswer: 'false',
        isOutreachQuestion: 'false',
      } as any,
      {
        _id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      {
        body: {},
      } as any,
    );

    expect(result).toEqual({
      message:
        'Processing 1 question(s). Non-duplicate entries are being assigned to experts.',
      count: 1,
      isBulkUpload: true,
    });
  });

  it('processes json bulk upload with AI answer flag enabled', async () => {
    const file = {
      mimetype: 'application/json',
      originalname: 'questions.json',
      buffer: Buffer.from(
        JSON.stringify([
          {
            question: 'What is wheat?',
          },
        ]),
      ),
    };

    const result = await controller.addQuestion(
      file as any,
      {
        isRequiredAiInitialAnswer: 'true',
        isOutreachQuestion: 'false',
      } as any,
      {
        _id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      {
        body: {},
      } as any,
    );

    expect(result).toEqual({
      message:
        'Processing 1 question(s). Non-duplicate entries are being assigned to experts with AI-generated initial answers.',
      count: 1,
      isBulkUpload: true,
    });
  });

  it('throws when uploaded json payload is not an array', async () => {
    const file = {
      mimetype: 'application/json',
      originalname: 'questions.json',
      buffer: Buffer.from(
        JSON.stringify({
          question: 'invalid payload',
        }),
      ),
    };

    await expect(
      controller.addQuestion(
        file as any,
        {} as any,
        {
          _id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        {
          body: {},
        } as any,
      ),
    ).rejects.toThrow();
  });

  it('throws for unsupported file type', async () => {
    const file = {
      mimetype: 'text/plain',
      originalname: 'questions.txt',
      buffer: Buffer.from('test'),
    };

    await expect(
      controller.addQuestion(
        file as any,
        {} as any,
        {
          _id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        {
          body: {},
        } as any,
      ),
    ).rejects.toThrow(
      'Unsupported file type. Please upload a JSON or Excel file.',
    );
  });

  it('throws when json parsing fails', async () => {
    const file = {
      mimetype: 'application/json',
      originalname: 'questions.json',
      buffer: Buffer.from('{invalid json'),
    };

    await expect(
      controller.addQuestion(
        file as any,
        {} as any,
        {
          _id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        {
          body: {},
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('creates audit trail when bulk upload fails', async () => {
    const file = {
      mimetype: 'text/plain',
      originalname: 'questions.txt',
      buffer: Buffer.from('invalid'),
    };

    await expect(
      controller.addQuestion(
        file as any,
        {} as any,
        {
          _id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        {
          body: {},
        } as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('reads allocationMode and paeExpertId from req.body', async () => {
    const file = {
      mimetype: 'application/json',
      originalname: 'questions.json',
      buffer: Buffer.from(
        JSON.stringify([
          {
            question: 'What is wheat?',
          },
        ]),
      ),
    };

    const result = await controller.addQuestion(
      file as any,
      {} as any,
      {
        _id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      {
        body: {
          allocationMode: 'manual',
          paeExpertId: 'expert-123',
        },
      } as any,
    );

    expect(result).toHaveProperty('count', 1);
    expect(result).toHaveProperty('isBulkUpload', true);
  });
});

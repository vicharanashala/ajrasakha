import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { UserService } from '../services/UserService.js';
import { QuestionSubmissionRepository } from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';
import { ObjectId } from 'mongodb';

describe('UserService.exportUsersToXlsx — PAE validation & review metrics', () => {
  it('should include PAE validation and review columns ONLY when exporting with role pae_expert', async () => {
    const paeExpert1Id = new ObjectId('664f00000000000000000001');
    const paeExpert2Id = new ObjectId('664f00000000000000000002');

    const mockPaeUsers = [
      {
        _id: paeExpert1Id,
        firstName: 'PAE',
        lastName: 'Expert One',
        email: 'pae1@example.com',
        role: 'pae_expert',
        status: 'active',
        isBlocked: false,
        isVerified: true,
        preference: { state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', domain: ['Agronomy'] },
        paeValidationAssigned: ['qid1', 'qid2'],
      },
      {
        _id: paeExpert2Id,
        firstName: 'PAE',
        lastName: 'Expert Two',
        email: 'pae2@example.com',
        role: 'pae_expert',
        status: 'active',
        isBlocked: false,
        isVerified: true,
        preference: { state: 'Haryana', district: 'Karnal', crop: 'Paddy', domain: ['Pathology'] },
        paeValidationAssigned: [],
      },
    ];

    const mockUserRepo = {
      findAllUsers: vi.fn().mockResolvedValue({
        users: mockPaeUsers,
        totalUsers: 2,
        totalPages: 1,
      }),
    };

    const mockValidationCountsMap = new Map([
      [paeExpert1Id.toString(), { submittedCount: 12, pendingCount: 2 }],
      [paeExpert2Id.toString(), { submittedCount: 5, pendingCount: 0 }],
    ]);

    const mockReviewCountsMap = new Map([
      [
        paeExpert1Id.toString(),
        {
          authorSubmittedCount: 8,
          reviewerSubmittedCount: 4,
          totalReviewCompleted: 12,
          authorPendingCount: 1,
          reviewerPendingCount: 2,
          totalReviewPending: 3,
        },
      ],
      [
        paeExpert2Id.toString(),
        {
          authorSubmittedCount: 3,
          reviewerSubmittedCount: 1,
          totalReviewCompleted: 4,
          authorPendingCount: 0,
          reviewerPendingCount: 1,
          totalReviewPending: 1,
        },
      ],
    ]);

    const mockQuestionSubmissionRepo = {
      getPaeValidationCountsByPaeIds: vi.fn().mockResolvedValue(mockValidationCountsMap),
      getPaeReviewCountsByPaeIds: vi.fn().mockResolvedValue(mockReviewCountsMap),
    };

    const userService = new UserService(
      mockUserRepo as any,
      {} as any, // notificationRepository
      {} as any, // mongoDatabase
      mockQuestionSubmissionRepo as any,
      {} as any, // questionRepo
      {} as any, // notificationService
      {} as any, // roleAssigneeService
      {} as any, // moderatorQueueService
    );

    // 1. Export with role: 'pae_expert' -> PAE columns MUST be present
    const bufferPae = await userService.exportUsersToXlsx({ role: 'pae_expert' });
    expect(bufferPae).toBeDefined();

    expect(mockQuestionSubmissionRepo.getPaeValidationCountsByPaeIds).toHaveBeenCalledWith([
      paeExpert1Id.toString(),
      paeExpert2Id.toString(),
    ]);
    expect(mockQuestionSubmissionRepo.getPaeReviewCountsByPaeIds).toHaveBeenCalledWith([
      paeExpert1Id.toString(),
      paeExpert2Id.toString(),
    ]);

    const workbookPae = new ExcelJS.Workbook();
    await workbookPae.xlsx.load(Buffer.from(bufferPae) as any);
    const sheetPae = workbookPae.getWorksheet('Users');
    expect(sheetPae).toBeDefined();

    const paeHeaders: string[] = [];
    sheetPae!.getRow(1).eachCell(cell => {
      paeHeaders.push(cell.value as string);
    });

    expect(paeHeaders).toContain('Validation Submitted');
    expect(paeHeaders).toContain('Validation Pending');
    expect(paeHeaders).toContain('Review Completed');
    expect(paeHeaders).toContain('Review Pending');

    const valSubIdx = paeHeaders.indexOf('Validation Submitted') + 1;
    const valPendIdx = paeHeaders.indexOf('Validation Pending') + 1;
    const revCompIdx = paeHeaders.indexOf('Review Completed') + 1;
    const revPendIdx = paeHeaders.indexOf('Review Pending') + 1;

    // Row 2: PAE Expert 1
    const row2 = sheetPae!.getRow(2);
    expect(row2.getCell(valSubIdx).value).toBe(12);
    expect(row2.getCell(valPendIdx).value).toBe(2);
    expect(row2.getCell(revCompIdx).value).toBe(12); // author(8) + reviewer(4)
    expect(row2.getCell(revPendIdx).value).toBe(3);  // author(1) + reviewer(2)

    // Row 3: PAE Expert 2
    const row3 = sheetPae!.getRow(3);
    expect(row3.getCell(valSubIdx).value).toBe(5);
    expect(row3.getCell(valPendIdx).value).toBe(0);
    expect(row3.getCell(revCompIdx).value).toBe(4);  // author(3) + reviewer(1)
    expect(row3.getCell(revPendIdx).value).toBe(1);  // author(0) + reviewer(1)
  });

  it('should NOT include PAE validation and review columns when exporting other roles (e.g. role: "ALL" or "expert")', async () => {
    const expertId = new ObjectId('664f00000000000000000003');
    const mockUsers = [
      {
        _id: expertId,
        firstName: 'Standard',
        lastName: 'Expert',
        email: 'expert@example.com',
        role: 'expert',
        status: 'active',
        isBlocked: false,
        isVerified: true,
        preference: { state: 'Punjab', crop: 'Wheat' },
      },
    ];

    const mockUserRepo = {
      findAllUsers: vi.fn().mockResolvedValue({
        users: mockUsers,
        totalUsers: 1,
        totalPages: 1,
      }),
    };

    const mockQuestionSubmissionRepo = {
      getPaeValidationCountsByPaeIds: vi.fn(),
      getPaeReviewCountsByPaeIds: vi.fn(),
    };

    const userService = new UserService(
      mockUserRepo as any,
      {} as any,
      {} as any,
      mockQuestionSubmissionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const bufferNonPae = await userService.exportUsersToXlsx({ role: 'ALL' });
    const workbookNonPae = new ExcelJS.Workbook();
    await workbookNonPae.xlsx.load(Buffer.from(bufferNonPae) as any);
    const sheetNonPae = workbookNonPae.getWorksheet('Users');
    expect(sheetNonPae).toBeDefined();

    const nonPaeHeaders: string[] = [];
    sheetNonPae!.getRow(1).eachCell(cell => {
      nonPaeHeaders.push(cell.value as string);
    });

    // Verify PAE columns are NOT in the export for non-PAE reports
    expect(nonPaeHeaders).not.toContain('Validation Submitted');
    expect(nonPaeHeaders).not.toContain('Validation Pending');
    expect(nonPaeHeaders).not.toContain('Review Completed');
    expect(nonPaeHeaders).not.toContain('Review Pending');

    // Should not call PAE metrics queries for non-PAE exports
    expect(mockQuestionSubmissionRepo.getPaeValidationCountsByPaeIds).not.toHaveBeenCalled();
    expect(mockQuestionSubmissionRepo.getPaeReviewCountsByPaeIds).not.toHaveBeenCalled();
  });

  it('should compute getPaeReviewCountsByPaeIds correctly in QuestionSubmissionRepository', async () => {
    const pae1 = new ObjectId('664f00000000000000000001');
    const pae2 = new ObjectId('664f00000000000000000002');
    const q1 = new ObjectId('664f11111111111111111111');
    const q2 = new ObjectId('664f22222222222222222222');
    const q3 = new ObjectId('664f33333333333333333333');

    const mockPaeQuestions = [
      { _id: q1, pae_review: true },
      { _id: q2, pae_review: true },
      { _id: q3, pae_review: true },
    ];

    const mockSubmissions = [
      // q1: History empty, queue has pae1 at index 0 -> authorPending for pae1
      {
        questionId: q1,
        history: [],
        queue: [pae1],
      },
      // q2: History has author pae1 (answered), plus review by pae2 with reviewId
      {
        questionId: q2,
        history: [
          { updatedBy: pae1, answer: new ObjectId('664faaaaaaaaaaaaaaaaaaaa'), status: 'reviewed' },
          { updatedBy: pae2, reviewId: new ObjectId('664fbbbbbbbbbbbbbbbbbbbb'), status: 'reviewed' },
        ],
        queue: [],
      },
      // q3: History has author pae2 (answered), plus review by pae1 currently in-review
      {
        questionId: q3,
        history: [
          { updatedBy: pae2, answer: new ObjectId('664fcccccccccccccccccccc'), status: 'reviewed' },
          { updatedBy: pae1, status: 'in-review' },
        ],
        queue: [],
      },
    ];

    const mockQuestionCollection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockPaeQuestions),
      }),
    };

    const mockSubmissionCollection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockSubmissions),
      }),
    };

    const mockDb = {
      getCollection: vi.fn().mockImplementation((name: string) => {
        if (name === 'questions') return mockQuestionCollection;
        if (name === 'question_submissions') return mockSubmissionCollection;
        return {};
      }),
    };

    const repo = new QuestionSubmissionRepository(mockDb as any);
    const statsMap = await repo.getPaeReviewCountsByPaeIds([pae1.toString(), pae2.toString()]);

    const pae1Stats = statsMap.get(pae1.toString());
    expect(pae1Stats).toBeDefined();
    expect(pae1Stats?.authorPendingCount).toBe(1);   // q1 (queue[0])
    expect(pae1Stats?.authorSubmittedCount).toBe(1); // q2 (history[0].answer)
    expect(pae1Stats?.reviewerPendingCount).toBe(0); // reviewer level omitted
    expect(pae1Stats?.reviewerSubmittedCount).toBe(0);
    expect(pae1Stats?.totalReviewCompleted).toBe(1); // author submitted only
    expect(pae1Stats?.totalReviewPending).toBe(1);   // author pending only

    const pae2Stats = statsMap.get(pae2.toString());
    expect(pae2Stats).toBeDefined();
    expect(pae2Stats?.authorSubmittedCount).toBe(1); // q3 (history[0].answer)
    expect(pae2Stats?.reviewerSubmittedCount).toBe(0);
    expect(pae2Stats?.totalReviewCompleted).toBe(1); // author submitted only
    expect(pae2Stats?.totalReviewPending).toBe(0);
  });
});

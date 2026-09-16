import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { UserService } from '../services/UserService.js';
import { QuestionSubmissionRepository } from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';
import { ObjectId } from 'mongodb';

describe('UserService.exportUsersToXlsx — PAE validation & review metrics', () => {
  it('should include Validation Submitted, Validation Pending, Review Completed, and Review Pending for pae_expert users', async () => {
    const paeExpert1Id = new ObjectId('664f00000000000000000001');
    const paeExpert2Id = new ObjectId('664f00000000000000000002');
    const expertId = new ObjectId('664f00000000000000000003');

    const mockUsers = [
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
        totalUsers: 3,
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

    const buffer = await userService.exportUsersToXlsx({ role: 'ALL' });
    expect(buffer).toBeDefined();

    expect(mockQuestionSubmissionRepo.getPaeValidationCountsByPaeIds).toHaveBeenCalledWith([
      paeExpert1Id.toString(),
      paeExpert2Id.toString(),
    ]);
    expect(mockQuestionSubmissionRepo.getPaeReviewCountsByPaeIds).toHaveBeenCalledWith([
      paeExpert1Id.toString(),
      paeExpert2Id.toString(),
    ]);

    // Parse generated Excel workbook to verify column headers and row values
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as any);
    const sheet = workbook.getWorksheet('Users');
    expect(sheet).toBeDefined();

    const headers: string[] = [];
    sheet!.getRow(1).eachCell(cell => {
      headers.push(cell.value as string);
    });

    expect(headers).toContain('Validation Submitted');
    expect(headers).toContain('Validation Pending');
    expect(headers).toContain('Review Completed');
    expect(headers).toContain('Review Pending');

    const valSubIdx = headers.indexOf('Validation Submitted') + 1;
    const valPendIdx = headers.indexOf('Validation Pending') + 1;
    const revCompIdx = headers.indexOf('Review Completed') + 1;
    const revPendIdx = headers.indexOf('Review Pending') + 1;

    // Row 2: PAE Expert 1
    const row2 = sheet!.getRow(2);
    expect(row2.getCell(valSubIdx).value).toBe(12);
    expect(row2.getCell(valPendIdx).value).toBe(2);
    expect(row2.getCell(revCompIdx).value).toBe(12); // author(8) + reviewer(4)
    expect(row2.getCell(revPendIdx).value).toBe(3);  // author(1) + reviewer(2)

    // Row 3: PAE Expert 2
    const row3 = sheet!.getRow(3);
    expect(row3.getCell(valSubIdx).value).toBe(5);
    expect(row3.getCell(valPendIdx).value).toBe(0);
    expect(row3.getCell(revCompIdx).value).toBe(4);  // author(3) + reviewer(1)
    expect(row3.getCell(revPendIdx).value).toBe(1);  // author(0) + reviewer(1)

    // Row 4: Standard Expert -> non-PAE rows should have empty string
    const row4 = sheet!.getRow(4);
    expect(row4.getCell(valSubIdx).value).toBe('');
    expect(row4.getCell(valPendIdx).value).toBe('');
    expect(row4.getCell(revCompIdx).value).toBe('');
    expect(row4.getCell(revPendIdx).value).toBe('');
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
    expect(pae1Stats?.authorPendingCount).toBe(1);   // q1
    expect(pae1Stats?.authorSubmittedCount).toBe(1); // q2
    expect(pae1Stats?.reviewerPendingCount).toBe(1); // q3 (in-review)
    expect(pae1Stats?.reviewerSubmittedCount).toBe(0);
    expect(pae1Stats?.totalReviewCompleted).toBe(1); // author(1) + reviewer(0)
    expect(pae1Stats?.totalReviewPending).toBe(2);   // author(1) + reviewer(1)

    const pae2Stats = statsMap.get(pae2.toString());
    expect(pae2Stats).toBeDefined();
    expect(pae2Stats?.authorSubmittedCount).toBe(1); // q3
    expect(pae2Stats?.reviewerSubmittedCount).toBe(1); // q2 (reviewId)
    expect(pae2Stats?.totalReviewCompleted).toBe(2); // author(1) + reviewer(1)
    expect(pae2Stats?.totalReviewPending).toBe(0);
  });
});

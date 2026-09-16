import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { UserService } from '../services/UserService.js';
import { ObjectId } from 'mongodb';

describe('UserService.exportUsersToXlsx — PAE validation metrics', () => {
  it('should include Validation Submitted and Validation Pending metrics for pae_expert users in exported Excel', async () => {
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

    const mockCountsMap = new Map([
      [paeExpert1Id.toString(), { submittedCount: 12, pendingCount: 2 }],
      [paeExpert2Id.toString(), { submittedCount: 5, pendingCount: 0 }],
    ]);

    const mockQuestionSubmissionRepo = {
      getPaeValidationCountsByPaeIds: vi.fn().mockResolvedValue(mockCountsMap),
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

    const subColIdx = headers.indexOf('Validation Submitted') + 1;
    const pendColIdx = headers.indexOf('Validation Pending') + 1;

    // Row 2: PAE Expert 1 -> submitted=12, pending=2
    const row2 = sheet!.getRow(2);
    expect(row2.getCell(subColIdx).value).toBe(12);
    expect(row2.getCell(pendColIdx).value).toBe(2);

    // Row 3: PAE Expert 2 -> submitted=5, pending=0
    const row3 = sheet!.getRow(3);
    expect(row3.getCell(subColIdx).value).toBe(5);
    expect(row3.getCell(pendColIdx).value).toBe(0);

    // Row 4: Standard Expert -> non-PAE rows should have empty string
    const row4 = sheet!.getRow(4);
    expect(row4.getCell(subColIdx).value).toBe('');
    expect(row4.getCell(pendColIdx).value).toBe('');
  });
});

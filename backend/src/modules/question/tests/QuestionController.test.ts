import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  QuestionController,
  QuestionIngestionController,
  QuestionAllocationController,
  QuestionFeedbackController,
  QuestionPaeValidationController,
  QuestionReportController,
  QuestionAiController,
  QuestionMaintenanceController,
} from '../controllers/index.js';
import { coreModuleControllers } from '../../core/index.js';

describe('Question Controllers Modular Refactoring', () => {
  const mockQuestionService = {
    getQuestionStatusSummary: vi.fn(),
    getByContextId: vi.fn(),
    getAllocatedQuestions: vi.fn(),
    getAllocatedQuestionPage: vi.fn(),
    getDetailedQuestions: vi.fn(),
    getQuestionAndReviewLevel: vi.fn(),
    checkStatus: vi.fn(),
    sendOutReachQuestionsMail: vi.fn(),
    bulkDeleteQuestions: vi.fn(),
    checkSubmissionExists: vi.fn(),
    getQuestionById: vi.fn(),
    getQuestionFullData: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
  };

  const mockUserService = {
    getUserById: vi.fn(),
  };

  const mockAuditTrailsService = {
    createAuditTrail: vi.fn(),
  };

  const mockCheckOverlapsService = {
    checkOverlaps: vi.fn(),
    runMigration: vi.fn(),
    migrateFirebaseUsers: vi.fn(),
  };

  it('should instantiate QuestionController and expose core question methods', () => {
    const controller = new QuestionController(
      mockQuestionService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getQuestionStatusSummary).toBe('function');
    expect(typeof controller.getByContextId).toBe('function');
    expect(typeof controller.getAllocatedQuestions).toBe('function');
    expect(typeof controller.getDetailedQuestions).toBe('function');
    expect(typeof controller.getQuestionById).toBe('function');
    expect(typeof controller.getQuestionFull).toBe('function');
    expect(typeof controller.updateQuestion).toBe('function');
    expect(typeof controller.deleteQuestion).toBe('function');
  });

  it('should instantiate QuestionIngestionController and expose ingestion/HITL methods', () => {
    const controller = new QuestionIngestionController(
      mockQuestionService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.addQuestion).toBe('function');
    expect(typeof controller.createAccAgentThread).toBe('function');
    expect(typeof controller.extractAccAgentData).toBe('function');
    expect(typeof controller.updateAccAgentState).toBe('function');
    expect(typeof controller.resumeAccAgentAndGetAnswer).toBe('function');
    expect(typeof controller.getQuestionFromRawContext).toBe('function');
    expect(typeof controller.getQuestionFromCallContext).toBe('function');
    expect(typeof controller.getCallSummary).toBe('function');
  });

  it('should instantiate QuestionAllocationController and expose allocation methods', () => {
    const controller = new QuestionAllocationController(
      mockQuestionService as any,
      mockUserService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getQueueDetails).toBe('function');
    expect(typeof controller.getRoleDashboard).toBe('function');
    expect(typeof controller.toggleAutoAllocate).toBe('function');
    expect(typeof controller.changeModerator).toBe('function');
    expect(typeof controller.removeModerator).toBe('function');
    expect(typeof controller.changeRoleAssignee).toBe('function');
    expect(typeof controller.removeRoleAssignee).toBe('function');
    expect(typeof controller.toggleRoleAllocation).toBe('function');
    expect(typeof controller.bulkAllocatePaeExperts).toBe('function');
    expect(typeof controller.allocateExperts).toBe('function');
    expect(typeof controller.removeAllocation).toBe('function');
    expect(typeof controller.reAllocateLessWorkload).toBe('function');
    expect(typeof controller.reallocateManual).toBe('function');
    expect(typeof controller.replaceQueueExpert).toBe('function');
    expect(typeof controller.reAllocateSelectedQuestions).toBe('function');
    expect(typeof controller.reallocateTimeBound).toBe('function');
    expect(typeof controller.reallocateManualQueue).toBe('function');
  });

  it('should instantiate QuestionFeedbackController and expose feedback methods', () => {
    const controller = new QuestionFeedbackController(
      mockQuestionService as any,
      mockUserService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getFeedbacks).toBe('function');
    expect(typeof controller.getQuestionFeedback).toBe('function');
    expect(typeof controller.getFeedbackQueueDetails).toBe('function');
    expect(typeof controller.getFeedbackTimeline).toBe('function');
    expect(typeof controller.getAssignableFeedbackReviewers).toBe('function');
    expect(typeof controller.assignFeedbackReviewerManually).toBe('function');
    expect(typeof controller.removeFeedbackReviewer).toBe('function');
    expect(typeof controller.handleFeedbackAction).toBe('function');
  });

  it('should instantiate QuestionPaeValidationController and expose validation methods', () => {
    const controller = new QuestionPaeValidationController(
      mockQuestionService as any,
      mockUserService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getPaeValidationAssignedQuestions).toBe('function');
    expect(typeof controller.processPaeValidation).toBe('function');
    expect(typeof controller.getPaeValidationQueueDetails).toBe('function');
    expect(typeof controller.getPaeValidationTimeline).toBe('function');
    expect(typeof controller.assignPaeValidationReviewer).toBe('function');
    expect(typeof controller.removePaeValidationReviewer).toBe('function');
  });

  it('should instantiate QuestionReportController and expose report methods', () => {
    const controller = new QuestionReportController(
      mockQuestionService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.downloadQuestionReport).toBe('function');
    expect(typeof controller.downloadTatReport).toBe('function');
    expect(typeof controller.downloadOverallReport).toBe('function');
    expect(typeof controller.downloadFilteredReport).toBe('function');
    expect(typeof controller.downloadDuplicateReport).toBe('function');
  });

  it('should instantiate QuestionAiController and expose AI methods', () => {
    const controller = new QuestionAiController(
      mockQuestionService as any,
      mockUserService as any,
      mockAuditTrailsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getChatbotDetails).toBe('function');
    expect(typeof controller.manualCheckDuplicate).toBe('function');
    expect(typeof controller.holdQuestion).toBe('function');
    expect(typeof controller.generateAiInitialAnswer).toBe('function');
    expect(typeof controller.approveInitialAnswer).toBe('function');
  });

  it('should instantiate QuestionMaintenanceController and expose maintenance/migration methods', () => {
    const controller = new QuestionMaintenanceController(
      mockQuestionService as any,
      mockCheckOverlapsService as any,
    );
    expect(controller).toBeDefined();
    expect(typeof controller.getAllJobs).toBe('function');
    expect(typeof controller.getJob).toBe('function');
    expect(typeof controller.getClosedAnswerMismatch).toBe('function');
    expect(typeof controller.setNormalizedDomains).toBe('function');
    expect(typeof controller.backfillClosedModeratorIds).toBe('function');
    expect(typeof controller.backgroundProcessAction).toBe('function');
    expect(typeof controller.checkOverlaps).toBe('function');
    expect(typeof controller.runMigration).toBe('function');
    expect(typeof controller.migrateFirebaseUsers).toBe('function');
  });

  it('should have all question controllers registered in coreModuleControllers', () => {
    expect(coreModuleControllers).toContain(QuestionController);
    expect(coreModuleControllers).toContain(QuestionIngestionController);
    expect(coreModuleControllers).toContain(QuestionAllocationController);
    expect(coreModuleControllers).toContain(QuestionFeedbackController);
    expect(coreModuleControllers).toContain(QuestionPaeValidationController);
    expect(coreModuleControllers).toContain(QuestionReportController);
    expect(coreModuleControllers).toContain(QuestionAiController);
    expect(coreModuleControllers).toContain(QuestionMaintenanceController);
  });
});
